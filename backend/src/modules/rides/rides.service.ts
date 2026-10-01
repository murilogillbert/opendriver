import { z } from 'zod';
import { config } from '../../config.js';
import { DRIVER_CANCEL_REASON_CODES, PASSENGER_CANCEL_REASON_CODES, cancelReasonsFor } from '../../domain/cancelReasons.js';
import { haversineMeters } from '../../domain/geo.js';
import { ACTIVE_STATUSES, NO_SHOW_GRACE_SECONDS, canTransition, type RideStatus } from '../../domain/rideState.js';
import { AppError } from '../../errors.js';
import { route } from '../../infra/geo/routing.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { randomToken } from '../../infra/crypto.js';
import { round2 } from '../../lib/money.js';
import { withLock } from '../../lib/mutex.js';
import { resolveDefault } from '../payments/paymentMethods.service.js';
import { settleRide, syncRidePayment, latestPendingPix } from '../payments/settlement.service.js';
import { dispatch, withdrawPendingOffers } from './dispatch.js';
import { publishRide } from './publish.js';
import { sendRideReceiptEmail } from './receipt.js';
import { rideInclude, toRideDto } from './rideDto.js';
import { assertValidScheduledAt, type QuotePrice } from './quote.service.js';

export const requestSchema = z.object({
  quoteId: z.string().uuid(),
  category: z.enum(['Economy', 'Comfort']).optional(),
  paymentMethodId: z.string().uuid().optional(),
  useCashback: z.boolean().optional(),
  /** Preenchido pelo app quando o embarque escolhido não é a localização atual de quem pediu. */
  guestPassengerName: z.string().trim().min(1).max(100).optional(),
  /** Plano §5: corrida agendada — precisa bater com uma cotação criada com o mesmo `scheduledAt`. */
  scheduledAt: z.coerce.date().optional(),
  /** Motorista favorito escolhido pra oferta exclusiva antes da busca geral (plano §5/§6). */
  favoriteDriverId: z.string().uuid().optional(),
  /** Plano §11.7 — sem informar, usa a preferência salva do passageiro. */
  accessibilityRequired: z.boolean().optional(),
});

const MAX_PENDING_SCHEDULED_RIDES = 3;

export const cancelSchema = z.object({
  // Validado contra a lista certa (passageiro × motorista) dentro do serviço,
  // pois o papel de quem chama só é conhecido depois de carregar a corrida.
  reasonCode: z.string().trim().min(1, 'Escolha um motivo.').max(40),
  reason: z.string().trim().max(200).optional(),
});
/** Meios-passos inteiros na API pública: 0.5, 1, 1.5 ... 5.0 (armazenado como 1..10 — §2). */
export const ratingSchema = z.object({
  stars: z
    .number()
    .min(0.5, 'Escolha de meia a 5 estrelas.')
    .max(5)
    .refine((v) => Number.isInteger(v * 2), 'A nota deve ser em passos de meia estrela.'),
  comment: z.string().trim().max(500).optional(),
});
export const paySchema = z.object({ paymentMethodId: z.string().uuid().optional() });
export const startRideSchema = z.object({ code: z.string().trim().length(4, 'Código de 4 dígitos.') });

function randomPickupCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

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

/** Motivos de cancelamento por papel (plano §1.2/1.5) — o app nunca hard-coda (UX12). */
export function cancelReasons(role: 'passenger' | 'driver') {
  return cancelReasonsFor(role);
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

    // Plano §5: agendar exige uma cotação que já veio com o acréscimo, e vice-versa (preço sempre bate com o que foi mostrado — UX01).
    if (!!input.scheduledAt !== quote.scheduled)
      throw new AppError('A cotação não corresponde ao tipo de corrida (agendada ou imediata). Busque de novo.', 409, 'quote_mismatch');
    if (input.scheduledAt) {
      assertValidScheduledAt(input.scheduledAt);
      const pendingScheduled = await prisma.ride.count({ where: { passengerId, status: 'Scheduled' } });
      if (pendingScheduled >= MAX_PENDING_SCHEDULED_RIDES)
        throw new AppError('Você já tem corridas agendadas demais. Cancele uma para agendar outra.', 409, 'too_many_scheduled');
      if (input.favoriteDriverId) {
        const isFavorite = await prisma.favoriteDriver.findUnique({
          where: { passengerId_driverId: { passengerId, driverId: input.favoriteDriverId } },
        });
        if (!isFavorite) throw new AppError('Este motorista não está nos seus favoritos.', 400, 'not_a_favorite');
      }
    }

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
          pickupCode: randomPickupCode(),
          guestPassengerName: input.guestPassengerName,
          accessibilityRequired: input.accessibilityRequired ?? profile.wheelchairAccessible,
          status: input.scheduledAt ? 'Scheduled' : undefined,
          isScheduled: !!input.scheduledAt,
          scheduledAt: input.scheduledAt,
          scheduledFavoriteDriverId: input.favoriteDriverId,
        },
      });
      await tx.rideEvent.create({ data: { rideId: created.id, type: 'requested', actor: 'Passenger', actorId: passengerId } });
      return created;
    });
    // Agendada: fica em Scheduled até o job de promoção (jobs/scheduledRides.ts) abrir a busca perto do horário.
    if (!input.scheduledAt) await dispatch(ride.id);
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

/**
 * true se cancelar agora gera cobrança/debuff. Corrida normal (plano §1): passou da tolerância
 * de 3 min após o aceite. Corrida agendada (plano §5.3): além da tolerância do aceite, só pena
 * quando também faltar pouco (SCHEDULED_LATE_CANCEL_WINDOW_SECONDS) pro horário marcado — cancelar
 * com antecedência nunca é penalizado, mesmo que o aceite já tenha sido há muito tempo.
 */
function isLateCancel(acceptedAt: Date | null, scheduledAt: Date | null = null): boolean {
  if (!acceptedAt) return false;
  const pastGrace = Date.now() - acceptedAt.getTime() > config.cancel.graceSeconds * 1000;
  if (!scheduledAt) return pastGrace;
  const closeToStart = scheduledAt.getTime() - Date.now() <= config.scheduled.lateCancelWindowSeconds * 1000;
  return pastGrace && closeToStart;
}

export async function cancelRide(rideId: string, userId: string, reasonCode: string, reason?: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await loadForUser(rideId, userId);
    const isDriver = ride.driverId === userId && ride.passengerId !== userId;
    const validCodes = isDriver ? DRIVER_CANCEL_REASON_CODES : PASSENGER_CANCEL_REASON_CODES;
    if (!(validCodes as readonly string[]).includes(reasonCode)) throw new AppError('Motivo de cancelamento inválido.', 400, 'invalid_reason_code');
    const reasonText = reason?.slice(0, 200) ?? null;

    if (isDriver) {
      // Motorista desistiu antes do embarque: a corrida volta a procurar outro (passageiro não perde nada).
      if (!['DriverAssigned', 'DriverArrived'].includes(ride.status))
        throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
      const tardio = ride.status === 'DriverArrived' || isLateCancel(ride.acceptedAt, ride.scheduledAt);
      const ok = await transition(
        rideId,
        ['DriverAssigned', 'DriverArrived'],
        'Searching',
        { driverId: null, vehicleId: null, acceptedAt: null, arrivedAt: null, cancelReasonCode: reasonCode, cancelReason: reasonText },
        { type: 'driver_cancelled', actor: 'Driver', actorId: userId },
      );
      if (!ok) throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
      await prisma.driverProfile.update({ where: { userId }, data: { ridesCancelled: { increment: 1 } } }); // métrica de qualidade (plano §11.6)
      // Debuff é só monetário — nunca mexe em ratingSum/ratingCount de ninguém (plano §1).
      if (tardio) {
        const pricing = await prisma.pricing.findUnique({ where: { category: ride.category } });
        const penalty = round2(pricing?.driverCancelPenalty ?? 0);
        if (penalty > 0) {
          try {
            await prisma.driverEarning.create({
              data: { driverId: userId, rideId, type: 'CancellationPenalty', amount: -penalty, description: 'Desconto por cancelamento tardio' },
            });
            await prisma.rideEvent.create({ data: { rideId, type: 'driver_cancel_penalty', actor: 'Driver', actorId: userId } });
          } catch (err) {
            // Único (rideId, type, driverId): mesmo motorista já penalizado nesta corrida (rematch depois de já ter desistido). Não é erro fatal.
            if ((err as { code?: string }).code !== 'P2002') throw err;
          }
        }
      }
      await publishRide(rideId);
      void sendPush(ride.passengerId, { title: 'Buscando outro motorista', body: 'O motorista não pôde seguir. Já estamos procurando outro.', data: { rideId } });
      await dispatch(rideId);
      return { cancelled: true };
    }

    if (!['Scheduled', 'Searching', 'DriverAssigned', 'DriverArrived'].includes(ride.status))
      throw new AppError('A corrida já começou e não pode ser cancelada. Em caso de problema, use o botão de segurança.', 409, 'invalid_state');

    // Cobrança só se o motorista já estava a caminho há mais que a tolerância, ou já chegou (plano §1.1/§5.3).
    const tardio = ride.status === 'DriverArrived' || isLateCancel(ride.acceptedAt, ride.scheduledAt);
    const hasDriver = tardio && !!ride.driverId;
    const fare = hasDriver ? round2(ride.fare) : 0;
    const ok = await transition(
      rideId,
      ['Scheduled', 'Searching', 'DriverAssigned', 'DriverArrived'],
      'Cancelled',
      {
        cancelledAt: new Date(),
        cancelledBy: 'Passenger',
        cancelReason: reasonText,
        cancelReasonCode: reasonCode,
        cancellationFee: fare,
        paymentStatus: hasDriver ? 'NotDue' : 'NotRequired',
      },
      { type: 'passenger_cancelled', actor: 'Passenger', actorId: userId },
    );
    if (!ok) throw new AppError('Não é possível cancelar a corrida agora.', 409, 'invalid_state');
    await withdrawPendingOffers(rideId);
    if (hasDriver) {
      const pricing = await prisma.pricing.findUnique({ where: { category: ride.category } });
      const platformFee = round2(pricing?.cancellationPlatformFee ?? 2);
      // Repasse ao motorista: valor total menos a taxa fixa da plataforma (nunca negativo).
      const repasse = round2(Math.max(0, fare - platformFee));
      await prisma.driverEarning.create({
        data: { driverId: ride.driverId!, rideId, type: 'CancellationFee', amount: repasse, description: 'Repasse por cancelamento tardio do passageiro' },
      });
      await settleRide(rideId);
    }
    if (ride.driverId) void sendPush(ride.driverId, { title: 'Corrida cancelada', body: 'O passageiro cancelou a corrida.', data: { rideId } });
    await publishRide(rideId);
    return { cancelled: true, cancellationFee: fare };
  });
}

/** Motorista marca "passageiro não compareceu" — só após NO_SHOW_GRACE_SECONDS de `arrivedAt` (plano §8.1).
 * Cobra o passageiro com o mesmo cálculo do cancelamento tardio (repasse = fare − taxa da plataforma). */
export async function markNoShow(rideId: string, driverId: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await assertDriverOf(rideId, driverId);
    if (ride.status !== 'DriverArrived') throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    if (!ride.arrivedAt || Date.now() - ride.arrivedAt.getTime() < NO_SHOW_GRACE_SECONDS * 1000)
      throw new AppError('Aguarde 5 minutos após chegar para marcar como não compareceu.', 409, 'too_early');
    const fare = round2(ride.fare);
    const ok = await transition(
      rideId,
      ['DriverArrived'],
      'Cancelled',
      { cancelledAt: new Date(), cancelledBy: 'Driver', cancelReasonCode: 'passenger_no_show', noShowAt: new Date(), cancellationFee: fare, paymentStatus: 'NotDue' },
      { type: 'no_show', actor: 'Driver', actorId: driverId },
    );
    if (!ok) throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    const pricing = await prisma.pricing.findUnique({ where: { category: ride.category } });
    const platformFee = round2(pricing?.cancellationPlatformFee ?? 2);
    const repasse = round2(Math.max(0, fare - platformFee));
    await prisma.driverEarning.create({
      data: { driverId, rideId, type: 'CancellationFee', amount: repasse, description: 'Repasse por não comparecimento do passageiro' },
    });
    await settleRide(rideId);
    await publishRide(rideId);
    return getRide(rideId, driverId);
  });
}

async function assertDriverOf(rideId: string, driverId: string) {
  const ride = await loadForUser(rideId, driverId);
  if (ride.driverId !== driverId) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  return ride;
}

// Cache curto: passageiro e motorista consultam a mesma rota; posição arredondada (~11 m).
const liveRouteCache = new Map<string, { at: number; value: LiveRoute }>();
const LIVE_ROUTE_TTL_MS = 10_000;

export interface LiveRoute {
  /** pickup = motorista → embarque; dropoff = motorista → destino (viagem em andamento). */
  phase: 'pickup' | 'dropoff';
  polyline: string;
  distanceM: number;
  durationS: number;
  routeSource: 'osrm' | 'estimate';
}

/**
 * Trajeto restante do carro: da última posição do motorista até o embarque
 * (motorista a caminho) ou até o destino (viagem em andamento). Passageiro e
 * motorista da corrida podem consultar; fora desses estados não há trajeto.
 */
export async function liveRoute(rideId: string, userId: string): Promise<LiveRoute> {
  const ride = await loadForUser(rideId, userId);
  const phase = ride.status === 'InProgress' ? 'dropoff' : ride.status === 'DriverAssigned' || ride.status === 'DriverArrived' ? 'pickup' : null;
  if (!phase || !ride.driverId) throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
  const loc = await prisma.driverLocation.findUnique({ where: { driverId: ride.driverId } });
  if (!loc) throw new AppError('Ainda não recebemos a localização do motorista.', 409, 'location_unavailable');
  const key = `${rideId}:${phase}:${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
  const hit = liveRouteCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_ROUTE_TTL_MS) return hit.value;
  const target = phase === 'pickup' ? { lat: ride.originLat, lng: ride.originLng } : { lat: ride.destLat, lng: ride.destLng };
  const r = await route({ lat: loc.lat, lng: loc.lng }, target);
  const value: LiveRoute = { phase, polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS, routeSource: r.source };
  if (liveRouteCache.size > 200) liveRouteCache.delete(liveRouteCache.keys().next().value!);
  liveRouteCache.set(key, { at: Date.now(), value });
  return value;
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

export async function startRide(rideId: string, driverId: string, code: string) {
  return withLock(`ride:${rideId}`, async () => {
    const ride = await assertDriverOf(rideId, driverId);
    if (ride.status !== 'DriverArrived') throw new AppError('Ação indisponível neste momento da corrida.', 409, 'invalid_state');
    // Confirma que o passageiro certo entrou no carro certo (plano §8). Inserir o código
    // corretamente a qualquer momento — mesmo depois dos 5 min — inicia a corrida normalmente.
    if (code !== ride.pickupCode) throw new AppError('Código incorreto. Confira com o passageiro.', 400, 'invalid_pickup_code');
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
    void sendRideReceiptEmail(ride); // nunca bloqueia a conclusão da corrida (plano §11.8)
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

  // Cartão ainda em processamento: nunca cobra de novo por cima (cobrança dupla).
  const pendingCard = await prisma.ridePayment.findFirst({ where: { rideId, method: 'Card', status: 'Pending' }, orderBy: { createdAt: 'desc' } });
  if (pendingCard) {
    const s = await syncRidePayment(pendingCard.id);
    if (s !== 'failed') await publishRide(rideId);
    if (s === 'paid') return getRide(rideId, passengerId);
    if (s === 'pending') throw new AppError('Seu pagamento com cartão ainda está sendo processado. Aguarde alguns instantes.', 409, 'payment_processing');
  }
  // Pix pendente: confere antes de tudo — se já foi pago, não cobra outro meio.
  // Mesmo meio (sem troca): mantém o QR atual em vez de gerar outro.
  const pendingPix = await latestPendingPix(rideId);
  if (pendingPix) {
    const s = await syncRidePayment(pendingPix.id);
    if (s === 'paid' || (s === 'pending' && !paymentMethodId)) {
      await publishRide(rideId);
      return getRide(rideId, passengerId);
    }
  }
  const method = paymentMethodId
    ? await prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, userId: passengerId, deletedAt: null } })
    : await resolveDefault(passengerId);
  if (!method) throw new AppError('Forma de pagamento não encontrada.', 404, 'payment_method_not_found');
  if (pendingPix && (await prisma.ridePayment.count({ where: { id: pendingPix.id, status: 'Pending' } }))) {
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
  // Armazenado em meios-passos inteiros: 1..10 = 0,5..5,0 (§2). A API recebe 0.5..5.0.
  const starsStored = Math.round(input.stars * 2);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rideRating.create({ data: { rideId, raterId, rateeId, stars: starsStored, comment: input.comment ?? '' } });
      if (raterIsPassenger)
        await tx.driverProfile.update({ where: { userId: rateeId }, data: { ratingSum: { increment: starsStored }, ratingCount: { increment: 1 } } });
      else
        await tx.passengerProfile.upsert({
          where: { userId: rateeId },
          create: { userId: rateeId, ratingSum: starsStored, ratingCount: 1 },
          update: { ratingSum: { increment: starsStored }, ratingCount: { increment: 1 } },
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
