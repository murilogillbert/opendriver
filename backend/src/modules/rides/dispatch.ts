import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { boundingBox, haversineMeters } from '../../domain/geo.js';
import { AppError } from '../../errors.js';
import { etaMany } from '../../infra/geo/routing.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { realtime } from '../../realtime/bus.js';
import { publishRide } from './publish.js';

/**
 * Matching sequencial (RF04, RF05): oferece a corrida a UM motorista por vez,
 * o mais rápido para chegar ao embarque. Recusa ou timeout → próximo.
 *
 * Integridade: toda escrita acontece numa transação com advisory locks na
 * ordem corrida → motorista (sem deadlock), então nunca há duas ofertas
 * pendentes na mesma corrida, nem um motorista com duas ofertas ao mesmo
 * tempo, nem dois motoristas aceitando a mesma corrida — mesmo com várias
 * instâncias da API.
 */

type Tx = Prisma.TransactionClient;

const lockRide = (tx: Tx, rideId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ride:${rideId}`}))`;
const lockDriver = (tx: Tx, driverId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`driver:${driverId}`}))`;

const timers = new Map<string, NodeJS.Timeout>();
const lastAttempt = new Map<string, number>();
const RETRY_EMPTY_MS = 5000;

function scheduleExpiry(offerId: string, expiresAt: Date) {
  const ms = Math.max(0, expiresAt.getTime() - Date.now()) + 250;
  const t = setTimeout(() => {
    timers.delete(offerId);
    void expireOffer(offerId).catch((err) => console.error('Falha ao expirar oferta', err));
  }, ms);
  t.unref?.();
  timers.set(offerId, t);
}

function clearTimer(offerId: string) {
  const t = timers.get(offerId);
  if (t) clearTimeout(t);
  timers.delete(offerId);
}

interface Candidate {
  driverId: string;
  lat: number;
  lng: number;
}

/** Motoristas elegíveis perto do embarque, ainda não consultados nesta corrida. */
async function candidates(ride: {
  id: string;
  passengerId: string;
  originLat: number;
  originLng: number;
  category: 'Economy' | 'Comfort';
  accessibilityRequired: boolean;
}): Promise<Candidate[]> {
  const origin = { lat: ride.originLat, lng: ride.originLng };
  const box = boundingBox(origin, config.dispatch.searchRadiusKm);
  const fresh = new Date(Date.now() - config.dispatch.locationStaleSeconds * 1000);
  const locations = await prisma.driverLocation.findMany({
    where: {
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
      updatedAt: { gte: fresh },
      driverId: { not: ride.passengerId },
    },
    take: 200,
  });
  if (!locations.length) return [];
  const ids = locations.map((l) => l.driverId);
  // Conforto aceita também chamadas Econômico (mais oferta); Econômico não atende Conforto.
  const categories = ride.category === 'Economy' ? ['Economy', 'Comfort'] : ['Comfort'];
  const [profiles, busy, pendingOffers, alreadyOffered, blocked] = await Promise.all([
    prisma.driverProfile.findMany({ where: { userId: { in: ids }, isOnline: true, status: 'Approved', currentVehicleId: { not: null } } }),
    prisma.ride.findMany({ where: { driverId: { in: ids }, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } }, select: { driverId: true } }),
    prisma.rideOffer.findMany({ where: { driverId: { in: ids }, status: 'Pending', expiresAt: { gt: new Date() } }, select: { driverId: true } }),
    prisma.rideOffer.findMany({ where: { rideId: ride.id }, select: { driverId: true } }),
    // Bloqueio é mútuo (plano §6, complemento): não importa quem bloqueou quem.
    prisma.blockedUser.findMany({
      where: { OR: [{ userId: ride.passengerId, blockedId: { in: ids } }, { blockedId: ride.passengerId, userId: { in: ids } }] },
      select: { userId: true, blockedId: true },
    }),
  ]);
  const vehicles = await prisma.vehicle.findMany({
    where: {
      id: { in: profiles.map((p) => p.currentVehicleId!) },
      active: true,
      status: 'Approved',
      category: { in: categories as ('Economy' | 'Comfort')[] },
      // Modo acessibilidade (plano §11.7): só veículos adaptados quando a corrida exige.
      ...(ride.accessibilityRequired ? { wheelchairAccessible: true } : {}),
    },
    select: { id: true },
  });
  const okVehicle = new Set(vehicles.map((v) => v.id));
  const blockedSet = new Set(blocked.map((b) => (b.userId === ride.passengerId ? b.blockedId : b.userId)));
  const excluded = new Set([
    ...busy.map((b) => b.driverId!),
    ...pendingOffers.map((o) => o.driverId),
    ...alreadyOffered.map((o) => o.driverId),
    ...blockedSet,
  ]);
  const eligible = new Set(profiles.filter((p) => okVehicle.has(p.currentVehicleId!) && !excluded.has(p.userId)).map((p) => p.userId));
  const radiusM = config.dispatch.searchRadiusKm * 1000;
  return locations
    .filter((l) => eligible.has(l.driverId) && haversineMeters(l, origin) <= radiusM)
    .sort((a, b) => haversineMeters(a, origin) - haversineMeters(b, origin))
    .map((l) => ({ driverId: l.driverId, lat: l.lat, lng: l.lng }));
}

async function markNoDrivers(rideId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    await lockRide(tx, rideId);
    const r = await tx.ride.updateMany({ where: { id: rideId, status: 'Searching' }, data: { status: 'NoDrivers', paymentStatus: 'NotRequired' } });
    if (r.count) {
      await tx.rideOffer.updateMany({ where: { rideId, status: 'Pending' }, data: { status: 'Withdrawn' } });
      await tx.rideEvent.create({ data: { rideId, type: 'no_drivers', actor: 'System' } });
    }
    return r.count;
  });
  if (!updated) return;
  lastAttempt.delete(rideId);
  const ride = await publishRide(rideId);
  if (ride) void sendPush(ride.passengerId, { title: 'Nenhum motorista disponível', body: 'Não encontramos motorista agora. Tente de novo em alguns minutos.', data: { rideId } });
}

/** Oferece a corrida ao próximo motorista (se ainda estiver procurando). */
export async function dispatch(rideId: string): Promise<void> {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== 'Searching') return;
  lastAttempt.set(rideId, Date.now());

  // A busca recomeça se o motorista desistiu antes do embarque, ou (corrida agendada) quando o
  // job de promoção (jobs/scheduledRides.ts) acabou de abrir a busca.
  const restart = await prisma.rideEvent.findFirst({ where: { rideId, type: { in: ['driver_cancelled', 'scheduled_promoted'] } }, orderBy: { createdAt: 'desc' } });
  const searchStart = restart?.createdAt ?? ride.requestedAt;

  // Plano §5: agendada p/ favorito tem uma janela exclusiva (só a oferta pra ele) antes da busca
  // geral — o timeout/contagem de ofertas da busca geral só começa a valer depois dela, senão o
  // tempo gasto esperando o favorito já consumiria o orçamento da busca geral.
  const favoriteWindowEnd = ride.scheduledFavoriteDriverId ? searchStart.getTime() + config.scheduled.favoriteWindowMinutes * 60_000 : 0;
  const inFavoriteWindow = favoriteWindowEnd > Date.now();
  const effectiveSearchStart = favoriteWindowEnd ? new Date(Math.max(searchStart.getTime(), favoriteWindowEnd)) : searchStart;

  if (!inFavoriteWindow) {
    const elapsed = (Date.now() - effectiveSearchStart.getTime()) / 1000;
    const offersMade = await prisma.rideOffer.count({ where: { rideId, sentAt: { gte: effectiveSearchStart } } });
    if (elapsed > config.dispatch.searchTimeoutSeconds || offersMade >= config.dispatch.maxOffers) {
      const pending = await prisma.rideOffer.count({ where: { rideId, status: 'Pending' } });
      if (!pending) await markNoDrivers(rideId);
      return;
    }
  }

  const allCandidates = await candidates(ride);
  // Dentro da janela exclusiva, só o favorito escolhido pode receber a oferta — se ele não estiver
  // elegível agora (offline, ocupado, fora do raio), a varredura tenta de novo em alguns segundos,
  // sem cair pra busca geral antes da hora.
  const list = inFavoriteWindow ? allCandidates.filter((c) => c.driverId === ride.scheduledFavoriteDriverId) : allCandidates;
  if (!list.length) return; // a varredura tenta de novo em alguns segundos

  // Ordena os mais próximos pelo tempo real de chegada (OSRM /table), não pela linha reta.
  const top = list.slice(0, 10);
  const etas = await etaMany(top, { lat: ride.originLat, lng: ride.originLng });
  const ranked = top.map((c, i) => ({ ...c, ...etas[i]! })).sort((a, b) => a.durationS - b.durationS);

  // Leve prioridade a favoritos (plano §6): dentro de quem já está elegível e por perto,
  // favoritos vêm primeiro — sem pular a fila de quem está muito mais longe.
  const favorites = await prisma.favoriteDriver.findMany({
    where: { passengerId: ride.passengerId, driverId: { in: ranked.map((c) => c.driverId) } },
    select: { driverId: true },
  });
  const favoriteIds = new Set(favorites.map((f) => f.driverId));
  const prioritized = favoriteIds.size
    ? [...ranked.filter((c) => favoriteIds.has(c.driverId)), ...ranked.filter((c) => !favoriteIds.has(c.driverId))]
    : ranked;

  // Métricas de qualidade (plano §11.6): motorista com histórico de cancelar muito depois de
  // aceitar vai pro fim da fila — nunca excluído, só perde a vez pros demais primeiro.
  const quality = await prisma.driverProfile.findMany({
    where: { userId: { in: prioritized.map((c) => c.driverId) } },
    select: { userId: true, offersAccepted: true, ridesCancelled: true },
  });
  const lowQuality = new Set(
    quality.filter((q) => q.ridesCancelled >= 5 && q.ridesCancelled / Math.max(1, q.offersAccepted) > 0.3).map((q) => q.userId),
  );
  const final = lowQuality.size
    ? [...prioritized.filter((c) => !lowQuality.has(c.driverId)), ...prioritized.filter((c) => lowQuality.has(c.driverId))]
    : prioritized;

  for (const c of final) {
    const offer = await prisma.$transaction(async (tx) => {
      await lockRide(tx, rideId);
      await lockDriver(tx, c.driverId);
      const fresh = await tx.ride.findUnique({ where: { id: rideId } });
      if (!fresh || fresh.status !== 'Searching') return 'stop' as const;
      if (await tx.rideOffer.count({ where: { rideId, status: 'Pending' } })) return 'stop' as const;
      const driverBusy =
        (await tx.rideOffer.count({ where: { driverId: c.driverId, status: 'Pending', expiresAt: { gt: new Date() } } })) +
        (await tx.ride.count({ where: { driverId: c.driverId, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } } }));
      if (driverBusy) return null; // pegou outra oferta nesse meio-tempo: tenta o próximo
      const created = await tx.rideOffer.create({
        data: {
          rideId,
          driverId: c.driverId,
          pickupDistanceM: c.distanceM,
          pickupEtaS: c.durationS,
          expiresAt: new Date(Date.now() + config.dispatch.offerTimeoutSeconds * 1000),
        },
      });
      await tx.ride.update({ where: { id: rideId }, data: { dispatchRound: { increment: 1 } } });
      await tx.driverProfile.update({ where: { userId: c.driverId }, data: { offersSent: { increment: 1 } } });
      await tx.rideEvent.create({ data: { rideId, type: 'offer_sent', actor: 'System', payload: { driverId: c.driverId, etaS: c.durationS } } });
      return created;
    });
    if (offer === 'stop') return;
    if (!offer) continue;
    scheduleExpiry(offer.id, offer.expiresAt);
    const payload = await offerDto(offer.id);
    realtime.toUser(c.driverId, 'ride:offer', payload);
    void sendPush(c.driverId, {
      title: 'Nova corrida',
      body: `${Math.max(1, Math.round(c.durationS / 60))} min até o passageiro · R$ ${payload?.driverEarning.toFixed(2).replace('.', ',')}`,
      data: { offerId: offer.id, type: 'ride_offer' },
      urgent: true,
    });
    return;
  }
}

/** Resumo da oferta para o motorista (UX06: só o necessário para decidir). */
export async function offerDto(offerId: string) {
  const o = await prisma.rideOffer.findUnique({ where: { id: offerId }, include: { ride: true } });
  if (!o) return null;
  return {
    offerId: o.id,
    rideId: o.rideId,
    expiresAt: o.expiresAt,
    pickupDistanceM: o.pickupDistanceM,
    pickupEtaS: o.pickupEtaS,
    origin: { lat: o.ride.originLat, lng: o.ride.originLng, address: o.ride.originAddress },
    destination: { lat: o.ride.destLat, lng: o.ride.destLng, address: o.ride.destAddress },
    distanceM: o.ride.distanceM,
    durationS: o.ride.durationS,
    category: o.ride.category,
    fare: Number(o.ride.fare),
    driverEarning: Number(o.ride.driverEarning),
    paymentMethodType: o.ride.paymentMethodType,
  };
}

export async function currentOffer(driverId: string) {
  const o = await prisma.rideOffer.findFirst({ where: { driverId, status: 'Pending', expiresAt: { gt: new Date() } }, orderBy: { sentAt: 'desc' } });
  return o ? offerDto(o.id) : null;
}

export async function acceptOffer(offerId: string, driverId: string): Promise<string> {
  const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.driverId !== driverId) throw new AppError('Oferta não encontrada.', 404, 'not_found');
  const rideId = offer.rideId;
  await prisma.$transaction(async (tx) => {
    await lockRide(tx, rideId);
    await lockDriver(tx, driverId);
    const o = await tx.rideOffer.findUnique({ where: { id: offerId } });
    if (!o || o.status !== 'Pending' || o.expiresAt.getTime() < Date.now() - 1000)
      throw new AppError('Esta corrida não está mais disponível.', 409, 'offer_unavailable');
    const profile = await tx.driverProfile.findUnique({ where: { userId: driverId } });
    if (!profile?.isOnline || profile.status !== 'Approved' || !profile.currentVehicleId)
      throw new AppError('Fique online para aceitar corridas.', 409, 'offline');
    const active = await tx.ride.count({ where: { driverId, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } } });
    if (active) throw new AppError('Você já está numa corrida.', 409, 'already_in_ride');
    const claimed = await tx.ride.updateMany({
      where: { id: rideId, status: 'Searching' },
      data: { status: 'DriverAssigned', driverId, vehicleId: profile.currentVehicleId, acceptedAt: new Date() },
    });
    if (!claimed.count) {
      await tx.rideOffer.update({ where: { id: offerId }, data: { status: 'Withdrawn', respondedAt: new Date() } });
      throw new AppError('Esta corrida não está mais disponível.', 409, 'offer_unavailable');
    }
    await tx.rideOffer.update({ where: { id: offerId }, data: { status: 'Accepted', respondedAt: new Date() } });
    await tx.rideOffer.updateMany({ where: { rideId, status: 'Pending', NOT: { id: offerId } }, data: { status: 'Withdrawn' } });
    await tx.driverProfile.update({ where: { userId: driverId }, data: { offersAccepted: { increment: 1 } } });
    await tx.rideEvent.create({ data: { rideId, type: 'accepted', actor: 'Driver', actorId: driverId } });
  });
  clearTimer(offerId);
  lastAttempt.delete(rideId);
  const ride = await publishRide(rideId);
  if (ride) void sendPush(ride.passengerId, { title: 'Motorista a caminho', body: 'Seu motorista aceitou a corrida.', data: { rideId } });
  return rideId;
}

export async function declineOffer(offerId: string, driverId: string): Promise<void> {
  const updated = await prisma.rideOffer.updateMany({
    where: { id: offerId, driverId, status: 'Pending' },
    data: { status: 'Declined', respondedAt: new Date() },
  });
  clearTimer(offerId);
  if (!updated.count) return; // já expirou/foi retirada: idempotente
  const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
  if (offer) {
    await prisma.rideEvent.create({ data: { rideId: offer.rideId, type: 'offer_declined', actor: 'Driver', actorId: driverId } });
    await dispatch(offer.rideId);
  }
}

export async function expireOffer(offerId: string): Promise<void> {
  const updated = await prisma.rideOffer.updateMany({
    where: { id: offerId, status: 'Pending', expiresAt: { lte: new Date() } },
    data: { status: 'Expired', respondedAt: new Date() },
  });
  if (!updated.count) return;
  const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
  if (!offer) return;
  realtime.toUser(offer.driverId, 'ride:offer_closed', { offerId, reason: 'expired' });
  await dispatch(offer.rideId);
}

/** Retira a oferta pendente (passageiro cancelou) e avisa o motorista. */
export async function withdrawPendingOffers(rideId: string): Promise<void> {
  const pending = await prisma.rideOffer.findMany({ where: { rideId, status: 'Pending' } });
  if (!pending.length) return;
  await prisma.rideOffer.updateMany({ where: { rideId, status: 'Pending' }, data: { status: 'Withdrawn', respondedAt: new Date() } });
  for (const o of pending) {
    clearTimer(o.id);
    realtime.toUser(o.driverId, 'ride:offer_closed', { offerId: o.id, reason: 'cancelled' });
  }
}

/**
 * Varredura periódica (rede de segurança para timers perdidos em reinício):
 * expira ofertas vencidas e retoma corridas procurando motorista sem oferta.
 */
export async function sweep(): Promise<void> {
  const due = await prisma.rideOffer.findMany({ where: { status: 'Pending', expiresAt: { lte: new Date() } }, select: { id: true }, take: 100 });
  for (const o of due) await expireOffer(o.id);

  const searching = await prisma.ride.findMany({ where: { status: 'Searching' }, select: { id: true }, take: 200 });
  for (const r of searching) {
    const pending = await prisma.rideOffer.count({ where: { rideId: r.id, status: 'Pending' } });
    if (pending) continue;
    if (Date.now() - (lastAttempt.get(r.id) ?? 0) < RETRY_EMPTY_MS) continue;
    await dispatch(r.id);
  }
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startDispatchSweeper(intervalMs = 3000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => void sweep().catch((err) => console.error('Falha na varredura de despacho', err)), intervalMs);
  sweepTimer.unref?.();
}

export function stopDispatchSweeper(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
