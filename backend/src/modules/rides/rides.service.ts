import { z } from 'zod';
import { config } from '../../config.js';
import { haversineMeters } from '../../domain/geo.js';
import { ACTIVE_STATUSES, canTransition, type RideStatus } from '../../domain/rideState.js';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { randomToken } from '../../infra/crypto.js';
import { round2 } from '../../lib/money.js';
import { withLock } from '../../lib/mutex.js';
import { resolveDefault } from '../payments/paymentMethods.service.js';
import { settleRide, syncRidePayment, latestPendingPix } from '../payments/settlement.service.js';
import { dispatch, withdrawPendingOffers } from './dispatch.js';
import { publishRide } from './publish.js';
import { rideInclude, toRideDto } from './rideDto.js';
import type { QuotePrice } from './quote.service.js';

export const requestSchema = z.object({
  quoteId: z.string().uuid(),
  category: z.enum(['Economy', 'Comfort']).optional(),
  paymentMethodId: z.string().uuid().optional(),
  useCashback: z.boolean().optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(200).optional() });
export const ratingSchema = z.object({
  stars: z.number().int().min(1, 'Escolha de 1 a 5 estrelas.').max(5),
  comment: z.string().trim().max(500).optional(),
});
export const paySchema = z.object({ paymentMethodId: z.string().uuid().optional() });

/** Distância máxima do embarque para marcar "cheguei". */
const ARRIVAL_RADIUS_M = 1000;

async function loadForUser(rideId: string, userId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: rideInclude });
  if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  return ride;
}

export async function getRide(rideId: string, userId: string) {
  return toRideDto(await loadForUser(rideId, userId), userId);
}

/** Corrida em andamento do usuário (passageiro ou motorista) — o app retoma daqui. */
export async function activeRide(userId: string) {
  const ride = await prisma.ride.findFirst({
    where: { OR: [{ passengerId: userId }, { driverId: userId }], status: { in: ACTIVE_STATUSES } },
    include: rideInclude,
    orderBy: { requestedAt: 'desc' },
  });
  if (ride) return toRideDto(ride, userId);
  // Corrida recém-concluída ainda pendente de pagamento/avaliação pelo passageiro.
  const recent = await prisma.ride.findFirst({
    where: {
      passengerId: userId,
      status: 'Completed',
      completedAt: { gte: new Date(Date.now() - 2 * 3600_000) },
      OR: [{ paymentStatus: { in: ['Pending', 'Failed'] } }, { ratings: { none: { raterId: userId } } }],
    },
    include: rideInclude,
    orderBy: { completedAt: 'desc' },
  });
  return recent ? toRideDto(recent, userId) : null;
}

export async function requestRide(passengerId: string, input: z.infer<typeof requestSchema>) {
  return withLock(`request:${passengerId}`, async () => {
    const active = await prisma.ride.count({ where: { passengerId, status: { in: ACTIVE_STATUSES } } });
    if (active) throw new AppError('Você já tem uma corrida em andamento.', 409, 'active_ride');
    const driving = await prisma.ride.count({ where: { driverId: passengerId, status: { in: ACTIVE_STATUSES } } });
    if (driving) throw new AppError('Você está dirigindo numa corrida agora.', 409, 'active_ride');

    const quote = await prisma.rideQuote.findUnique({ where: { id: input.quoteId } });
    if (!quote || quote.passengerId !== passengerId) throw new AppError('Cotação não encontrada. Busque o destino de novo.', 404, 'quote_not_found');
    if (quote.usedAt) throw new AppError('Esta cotação já foi usada. Busque o destino de novo.', 409, 'quote_used');
    if (quote.expiresAt.getTime() < Date.now()) throw new AppError('O preço expirou. Toque em buscar para atualizar.', 409, 'quote_expired');

    const prices = quote.prices as unknown as QuotePrice[];
    // Categoria: a pedida; senão a última usada; senão a mais barata (UX09 — valor padrão).
    let category = input.category;
    if (!category) {
      const last = await prisma.ride.findFirst({ where: { passengerId, status: 'Completed' }, orderBy: { completedAt: 'desc' }, select: { category: true } });
      category = last && prices.some((p) => p.category === last.category) ? last.category : prices[0]?.category;
    }
    const price = prices.find((p) => p.category === category);
    if (!price) throw new AppError('Categoria indisponível para esta corrida.', 400, 'category_unavailable');

    let method = input.paymentMethodId
      ? await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId: passengerId, deletedAt: null } })
      : null;
    if (input.paymentMethodId && !method) throw new AppError('Forma de pagamento não encontrada.', 404, 'payment_method_not_found');
    method ??= await resolveDefault(passengerId);
    const profile = await prisma.passengerProfile.upsert({ where: { userId: passengerId }, create: { userId: passengerId }, update: {} });

    const ride = await prisma.$transaction(async (tx) => {
      const claimed = await tx.rideQuote.updateMany({ where: { id: quote.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new AppError('Esta cotação já foi usada. Busque o destino de novo.', 409, 'quote_used');
      const created = await tx.ride.create({
        data: {
          passengerId,
          quoteId: quote.id,
          category: price.category,
          originLat: quote.originLat,
          originLng: quote.originLng,
          originAddress: quote.originAddress,
          destLat: quote.destLat,
          destLng: quote.destLng,
          destAddress: quote.destAddress,
          distanceM: quote.distanceM,
          durationS: quote.durationS,
          polyline: quote.polyline,
          fare: price.fare,
          platformFee: price.platformFee,
          driverEarning: price.driverEarning,
          paymentMethodType: method!.type,
          paymentMethodId: method!.id,
          useCashback: input.useCashback ?? profile.useHubCashback,
        },
      });
      await tx.rideEvent.create({ data: { rideId: created.id, type: 'requested', actor: 'Passenger', actorId: passengerId } });
      return created;
    });
    await dispatch(ride.id);
    return getRide(ride.id, passengerId);
  });
}

async function transition(rideId: string, from: RideStatus[], to: RideStatus, data: Record<string, unknown>, event: { type: string; actor: 'Passenger' | 'Driver' | 'System'; actorId?: string }) {
  for (const f of from) if (!canTransition(f, to)) throw new Error(`transição inválida ${f}→${to}`);
  const updated = await prisma.ride.updateMany({ where: { id: rideId, status: { in: from } }, data: { status: to, ...data } });
  if (!updated.count) return false;
  await prisma.rideEvent.create({ data: { rideId, type: event.type, actor: event.actor, actorId: event.actorId } });
  return true;
}

export async function cancelRide(rideId: string, userId: string, reason?: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await loadForUser(rideId, userId);
    const isDriver = ride.driverId === userId && ride.passengerId !== userId;

    if (isDriver) {
      // Motorista desistiu antes do embarque: a corrida volta a procurar outro (passageiro não perde nada).
      if (!['DriverAssigned', 'DriverArrived'].includes(ride.status))
        throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
      const ok = await transition(
        rideId,
        ['DriverAssigned', 'DriverArrived'],
        'Searching',
        { driverId: null, vehicleId: null, acceptedAt: null, arrivedAt: null },
        { type: 'driver_cancelled', actor: 'Driver', actorId: userId },
      );
      if (!ok) throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
      await publishRide(rideId);
      void sendPush(ride.passengerId, { title: 'Buscando outro motorista', body: 'O motorista não pôde seguir. Já estamos procurando outro.', data: { rideId } });
      await dispatch(rideId);
      return { cancelled: true };
    }

    if (!['Searching', 'DriverAssigned', 'DriverArrived'].includes(ride.status))
      throw new AppError('A corrida já começou e não pode ser cancelada. Em caso de problema, use o botão de segurança.', 409, 'invalid_state');

    // Taxa só se o motorista já estava a caminho há mais que a tolerância, ou já chegou.
    let fee = 0;
    if (ride.status === 'DriverArrived' || (ride.status === 'DriverAssigned' && ride.acceptedAt && Date.now() - ride.acceptedAt.getTime() > config.dispatch.freeCancelSeconds * 1000)) {
      const rule = await prisma.pricing.findUnique({ where: { category: ride.category } });
      fee = round2(rule?.cancellationFee ?? 0);
    }
    const ok = await transition(
      rideId,
      ['Searching', 'DriverAssigned', 'DriverArrived'],
      'Cancelled',
      {
        cancelledAt: new Date(),
        cancelledBy: 'Passenger',
        cancelReason: reason?.slice(0, 200) ?? null,
        cancellationFee: fee,
        paymentStatus: fee > 0 ? 'NotDue' : 'NotRequired',
      },
      { type: 'passenger_cancelled', actor: 'Passenger', actorId: userId },
    );
    if (!ok) throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
    await withdrawPendingOffers(rideId);
    if (fee > 0 && ride.driverId) {
      // Taxa de cancelamento compensa integralmente o deslocamento do motorista.
      await prisma.driverEarning.create({
        data: { driverId: ride.driverId, rideId, type: 'CancellationFee', amount: fee, description: 'Taxa de cancelamento do passageiro' },
      });
      await settleRide(rideId);
    }
    if (ride.driverId) void sendPush(ride.driverId, { title: 'Corrida cancelada', body: 'O passageiro cancelou a corrida.', data: { rideId } });
    await publishRide(rideId);
    return { cancelled: true, cancellationFee: fee };
  });
}

async function assertDriverOf(rideId: string, driverId: string) {
  const ride = await loadForUser(rideId, driverId);
  if (ride.driverId !== driverId) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  return ride;
}

export async function markArrived(rideId: string, driverId: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await assertDriverOf(rideId, driverId);
    if (ride.status !== 'DriverAssigned') throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    const loc = await prisma.driverLocation.findUnique({ where: { driverId } });
    if (loc) {
      const dist = haversineMeters(loc, { lat: ride.originLat, lng: ride.originLng });
      if (dist > ARRIVAL_RADIUS_M)
        throw new AppError(`Você ainda está a ${(dist / 1000).toFixed(1).replace('.', ',')} km do embarque.`, 409, 'too_far_from_pickup');
    }
    await transition(rideId, ['DriverAssigned'], 'DriverArrived', { arrivedAt: new Date() }, { type: 'arrived', actor: 'Driver', actorId: driverId });
    const r = await publishRide(rideId);
    if (r) void sendPush(r.passengerId, { title: 'Seu motorista chegou', body: `${r.vehicle?.model ?? 'Carro'} ${r.vehicle?.color ?? ''} · ${r.vehicle?.plate ?? ''}`.trim(), data: { rideId } });
    return getRide(rideId, driverId);
  });
}

export async function startRide(rideId: string, driverId: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await assertDriverOf(rideId, driverId);
    if (ride.status !== 'DriverArrived') throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    await transition(rideId, ['DriverArrived'], 'InProgress', { startedAt: new Date() }, { type: 'started', actor: 'Driver', actorId: driverId });
    await publishRide(rideId);
    return getRide(rideId, driverId);
  });
}

/** Finalizar (1 toque): conclui, credita o motorista e cobra em segundo plano (UX04). */
export async function finishRide(rideId: string, driverId: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await assertDriverOf(rideId, driverId);
    if (ride.status !== 'InProgress') throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    await prisma.$transaction(async (tx) => {
      const done = await tx.ride.updateMany({ where: { id: rideId, status: 'InProgress' }, data: { status: 'Completed', completedAt: new Date() } });
      if (!done.count) throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
      await tx.driverEarning.create({
        data: { driverId, rideId, type: 'RideEarning', amount: ride.driverEarning, description: `Corrida — ${ride.destAddress.slice(0, 150)}` },
      });
      await tx.rideEvent.create({ data: { rideId, type: 'completed', actor: 'Driver', actorId: driverId } });
    });
    await publishRide(rideId);
    void settleRide(rideId)
      .then(() => publishRide(rideId))
      .catch((err) => console.error('Falha na liquidação', rideId, err));
    return getRide(rideId, driverId);
  });
}

/** Nova tentativa de pagamento (cartão recusado, Pix expirado) ou troca de meio. */
export async function payRide(rideId: string, passengerId: string, paymentMethodId: string | undefined, remoteIp: string) {
  const ride = await loadForUser(rideId, passengerId);
  if (ride.passengerId !== passengerId) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  if (ride.paymentStatus === 'Paid' || ride.paymentStatus === 'NotRequired') return getRide(rideId, passengerId);
  if (!['Completed', 'Cancelled'].includes(ride.status) || !['Failed', 'Pending'].includes(ride.paymentStatus))
    throw new AppError('Não há pagamento pendente nesta corrida.', 409, 'nothing_to_pay');

  // Pix pendente ainda válido e mesmo meio: só confere (evita gerar outro QR).
  const pendingPix = await latestPendingPix(rideId);
  if (pendingPix && !paymentMethodId) {
    const s = await syncRidePayment(pendingPix.id);
    if (s !== 'failed') {
      await publishRide(rideId);
      return getRide(rideId, passengerId);
    }
  }
  const method = paymentMethodId
    ? await prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, userId: passengerId, deletedAt: null } })
    : await resolveDefault(passengerId);
  if (!method) throw new AppError('Forma de pagamento não encontrada.', 404, 'payment_method_not_found');
  if (pendingPix && method.type === 'Card') {
    await prisma.ridePayment.update({ where: { id: pendingPix.id }, data: { status: 'Failed', statusDetail: 'Substituído por outro meio' } });
  }
  await prisma.ride.updateMany({ where: { id: rideId, paymentStatus: 'Pending' }, data: { paymentStatus: 'Failed' } });
  await settleRide(rideId, { method, remoteIp });
  await publishRide(rideId);
  return getRide(rideId, passengerId);
}

export async function rateRide(rideId: string, raterId: string, input: z.infer<typeof ratingSchema>) {
  const ride = await loadForUser(rideId, raterId);
  if (ride.status !== 'Completed' || !ride.driverId) throw new AppError('Só é possível avaliar corridas concluídas.', 409, 'invalid_state');
  if (!ride.completedAt || Date.now() - ride.completedAt.getTime() > 7 * 24 * 3600_000)
    throw new AppError('O prazo para avaliar esta corrida terminou.', 409, 'rating_window_closed');
  const raterIsPassenger = ride.passengerId === raterId;
  const rateeId = raterIsPassenger ? ride.driverId : ride.passengerId;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rideRating.create({ data: { rideId, raterId, rateeId, stars: input.stars, comment: input.comment ?? '' } });
      if (raterIsPassenger)
        await tx.driverProfile.update({ where: { userId: rateeId }, data: { ratingSum: { increment: input.stars }, ratingCount: { increment: 1 } } });
      else
        await tx.passengerProfile.upsert({
          where: { userId: rateeId },
          create: { userId: rateeId, ratingSum: input.stars, ratingCount: 1 },
          update: { ratingSum: { increment: input.stars }, ratingCount: { increment: 1 } },
        });
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new AppError('Você já avaliou esta corrida.', 409, 'already_rated');
    throw err;
  }
  return getRide(rideId, raterId);
}

export async function history(userId: string, role: 'passenger' | 'driver', cursor?: string) {
  const rows = await prisma.ride.findMany({
    where: role === 'driver' ? { driverId: userId } : { passengerId: userId },
    include: rideInclude,
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, 20);
  return { items: page.map((r) => toRideDto(r, userId)), nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null };
}

/** Link público de acompanhamento (RF15) — válido enquanto a corrida estiver ativa. */
export async function shareRide(rideId: string, passengerId: string) {
  const ride = await loadForUser(rideId, passengerId);
  if (ride.passengerId !== passengerId) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  if (!['DriverAssigned', 'DriverArrived', 'InProgress'].includes(ride.status))
    throw new AppError('O compartilhamento fica disponível quando o motorista estiver a caminho.', 409, 'invalid_state');
  const token = ride.shareToken ?? randomToken(24);
  if (!ride.shareToken) await prisma.ride.update({ where: { id: rideId }, data: { shareToken: token } });
  return { url: `${config.publicBaseUrl}/t/${token}`, token };
}
