import type { Prisma } from '@prisma/client';
import { ratingAverage } from '../../domain/rating.js';
import { NO_SHOW_GRACE_SECONDS, driverActions, passengerActions, type Role } from '../../domain/rideState.js';
import { round2 } from '../../lib/money.js';

export const rideInclude = {
  passenger: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true, passengerProfile: { select: { ratingSum: true, ratingCount: true } } } },
  driver: { select: { id: true, name: true, avatarUrl: true, phone: true, driverProfile: { select: { ratingSum: true, ratingCount: true } } } },
  scheduledFavoriteDriver: { select: { name: true } },
  // Corrida para terceiros: só o nome e a foto de quem embarca. Nunca o CPF nem o nascimento do
  // dependente — esses dados existem para quem cadastrou, não para o motorista.
  passengerFor: { select: { id: true, name: true, avatarUrl: true, passengerProfile: { select: { ratingSum: true, ratingCount: true } } } },
  vehicle: true,
  paymentMethod: true,
  ratings: { select: { raterId: true } },
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  // Oferta aceita: estimativa de chegada do motorista ao embarque (no aceite).
  offers: { where: { status: 'Accepted' as const }, select: { pickupEtaS: true, respondedAt: true }, orderBy: { respondedAt: 'desc' as const }, take: 1 },
  // Gorjeta já dada nesta corrida (plano §11.5) — no máximo uma (tip.service.ts garante isso).
  earnings: { where: { type: 'Tip' as const }, select: { amount: true }, take: 1 },
} satisfies Prisma.RideInclude;

export type RideRow = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const rating = ratingAverage;
const RATING_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * Visão da corrida para um participante. Dados do outro lado são mínimos
 * (primeiro nome, foto, nota; placa/modelo/cor do carro) e o telefone nunca é
 * exposto — contato é mediado pelo app.
 */
export function toRideDto(r: RideRow, viewerId: string) {
  const role: Role = r.driverId === viewerId && r.passengerId !== viewerId ? 'driver' : 'passenger';
  const rated = r.ratings.some((x) => x.raterId === viewerId);
  const withinRatingWindow = !!r.completedAt && Date.now() - r.completedAt.getTime() < RATING_WINDOW_MS;
  const arrivalGraceElapsed = !!r.arrivedAt && Date.now() - r.arrivedAt.getTime() > NO_SHOW_GRACE_SECONDS * 1000;
  const ctx = { status: r.status, paymentStatus: r.paymentStatus, rated, withinRatingWindow, arrivalGraceElapsed };
  const lastPayment = r.payments[0];
  const amountDue = r.status === 'Completed' ? round2(r.fare) : round2(r.cancellationFee);
  // Nome de quem embarca em corrida pedida pra outra pessoa: a conta vinculada, ou o instantâneo
  // gravado no pedido (dependente sem perfil e caminho legado de nome digitado).
  const rideForName = r.passengerFor?.name ?? r.guestPassengerName;
  return {
    id: r.id,
    role,
    status: r.status,
    category: r.category,
    origin: { lat: r.originLat, lng: r.originLng, address: r.originAddress },
    destination: { lat: r.destLat, lng: r.destLng, address: r.destAddress },
    distanceM: r.distanceM,
    durationS: r.durationS,
    polyline: r.polyline,
    fare: round2(r.fare),
    /** Motorista vê quanto recebe; passageiro vê quanto paga. */
    driverEarning: role === 'driver' ? round2(r.driverEarning) : undefined,
    platformFee: role === 'driver' ? round2(r.platformFee) : undefined,
    cashbackUsed: round2(r.cashbackUsed),
    cancellationFee: round2(r.cancellationFee),
    cancelReasonCode: r.cancelReasonCode,
    amountDue,
    /// Código de 4 dígitos que o passageiro mostra pro motorista digitar (§8). NUNCA exposto ao motorista.
    pickupCode: role === 'passenger' && ['DriverAssigned', 'DriverArrived'].includes(r.status) ? r.pickupCode : undefined,
    payment: {
      status: r.paymentStatus,
      methodType: r.paymentMethodType,
      label:
        r.paymentMethodType === 'Pix'
          ? 'Pix'
          : r.paymentMethod
            ? `${r.paymentMethod.brand ?? 'Cartão'} •••• ${r.paymentMethod.last4}`
            : 'Cartão',
      pix:
        role === 'passenger' && lastPayment?.method === 'Pix' && lastPayment.status === 'Pending' && lastPayment.pixCopyPaste
          ? { copyPaste: lastPayment.pixCopyPaste, expiresAt: lastPayment.pixExpiresAt }
          : null,
      failureReason: r.paymentStatus === 'Failed' ? (lastPayment?.statusDetail ?? null) : null,
    },
    driver:
      r.driver && role === 'passenger'
        ? {
            /// Plano §6: precisa do id pra favoritar/bloquear o motorista depois da corrida.
            id: r.driver.id,
            name: firstName(r.driver.name),
            avatarUrl: r.driver.avatarUrl,
            rating: rating(r.driver.driverProfile?.ratingSum, r.driver.driverProfile?.ratingCount),
            vehicle: r.vehicle ? { plate: r.vehicle.plate, brand: r.vehicle.brand, model: r.vehicle.model, color: r.vehicle.color } : null,
          }
        : null,
    passenger:
      role === 'driver'
        ? {
            /// Plano §6: precisa do id pra bloquear o passageiro depois da corrida.
            id: r.passenger.id,
            // Corrida pedida pra outra pessoa: o motorista vê o nome de quem vai embarcar, não de
            // quem pagou. `guestPassengerName` guarda esse nome nos dois casos (conta vinculada e
            // dependente sem perfil), congelado no momento do pedido.
            name: firstName(r.guestPassengerName || r.passenger.name),
            avatarUrl: r.passenger.avatarUrl,
            rating: rating(r.passenger.passengerProfile?.ratingSum, r.passenger.passengerProfile?.ratingCount),
          }
        : null,
    guestPassengerName: r.guestPassengerName,
    /**
     * Corrida para terceiros: quem embarca, quando não é quem pediu. `kind` diz de onde vem o dado
     * — `linked` é uma conta da plataforma (vínculo aceito), `guest` é um dependente cadastrado por
     * quem pediu. O motorista vê só o primeiro nome; quem pediu vê o nome como cadastrou. CPF e
     * data de nascimento do dependente nunca saem daqui.
     */
    rideFor: rideForName ? { kind: r.passengerForId ? ('linked' as const) : ('guest' as const), name: role === 'driver' ? firstName(rideForName) : rideForName, avatarUrl: r.passengerFor?.avatarUrl ?? null } : null,
    /// Passageiro menor de idade com adulto responsável confirmado no embarque — o motorista precisa saber.
    minorAccompanied: r.minorAccompanied,
    /// Plano §5 — só preenchido em corridas agendadas.
    scheduledAt: r.scheduledAt,
    scheduledFavoriteDriverName: r.scheduledFavoriteDriver?.name ?? null,
    /// Plano §11.5 — gorjeta opcional, só cobrável no cartão salvo (nunca Pix).
    tipAmount: r.earnings[0] ? round2(r.earnings[0].amount) : null,
    canTip: role === 'passenger' && r.status === 'Completed' && !r.earnings[0] && r.paymentMethodType === 'Card',
    /// Plano §11.7 — travado no pedido; motorista recebeu a oferta porque o veículo é adaptado.
    accessibilityRequired: r.accessibilityRequired,
    /// Plano §7 — travado no pedido. Só diz que a corrida é restrita a motoristas mulheres; o gênero
    /// declarado de cada pessoa nunca sai daqui (nem a passageira vê o do motorista, nem o inverso).
    womenOnly: r.womenOnly,
    /** Previsão de chegada ao embarque (instante estimado), enquanto o motorista está a caminho. */
    pickupEta:
      r.status === 'DriverAssigned' && r.acceptedAt && r.offers[0]
        ? new Date(r.acceptedAt.getTime() + r.offers[0].pickupEtaS * 1000)
        : null,
    actions: role === 'driver' ? driverActions(ctx) : passengerActions(ctx),
    requestedAt: r.requestedAt,
    acceptedAt: r.acceptedAt,
    arrivedAt: r.arrivedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    cancelledBy: r.cancelledBy,
  };
}

export type RideDto = ReturnType<typeof toRideDto>;
