import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ratingAverage } from '../../domain/rating.js';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { getDecrypted } from '../../infra/storage/storage.js';
import { round2 } from '../../lib/money.js';
import { withdrawPendingOffers } from '../rides/dispatch.js';
import { publishRide } from '../rides/publish.js';
import { rideInclude, toRideDto } from '../rides/rideDto.js';

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo.').max(400) });
export const noteSchema = z.object({ note: z.string().trim().max(400).optional() });
export const pricingSchema = z.object({
  label: z.string().trim().min(2).max(40),
  baseFare: z.number().min(0).max(1000),
  perKm: z.number().min(0).max(100),
  perMinute: z.number().min(0).max(100),
  minimumFare: z.number().min(0).max(1000),
  platformFeePercent: z.number().min(0).max(60),
  cancellationFee: z.number().min(0).max(200),
  /// Taxa fixa que a plataforma retém no cancelamento tardio (plano §1) — separada de platformFeePercent.
  cancellationPlatformFee: z.number().min(0).max(200),
  /// Debuff monetário ao motorista por cancelamento tardio (plano §1). 0 = desligado.
  driverCancelPenalty: z.number().min(0).max(200),
  active: z.boolean(),
});

async function audit(actorId: string, action: string, entityType: string, entityId: string, payload?: unknown) {
  await prisma.auditLog.create({ data: { actorId, action: `opendriver.${action}`, entityType, entityId, payloadJson: payload ? JSON.stringify(payload) : null } });
}

const page = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({
  items,
  total,
  page: p.page,
  pageSize: p.pageSize,
  totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
});

// ------------------------------------------------------------------ métricas
export async function metrics() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const since7 = new Date(now.getTime() - 7 * 24 * 3600_000);
  const [ridesToday, completed7, cancelled7, noDrivers7, gmv7, online, inReview, vehiclesInReview, failedPayments, openIncidents, pendingPayouts, activeNow] =
    await Promise.all([
      prisma.ride.count({ where: { requestedAt: { gte: dayStart } } }),
      prisma.ride.count({ where: { status: 'Completed', completedAt: { gte: since7 } } }),
      prisma.ride.count({ where: { status: 'Cancelled', cancelledAt: { gte: since7 } } }),
      prisma.ride.count({ where: { status: 'NoDrivers', requestedAt: { gte: since7 } } }),
      prisma.ride.aggregate({ where: { status: 'Completed', completedAt: { gte: since7 } }, _sum: { fare: true, platformFee: true } }),
      prisma.driverProfile.count({ where: { isOnline: true } }),
      prisma.driverProfile.count({ where: { status: 'InReview' } }),
      prisma.vehicle.count({ where: { status: 'InReview', active: true } }),
      prisma.ride.count({ where: { paymentStatus: 'Failed' } }),
      prisma.safetyIncident.count({ where: { status: { not: 'Closed' } } }),
      prisma.payoutRequest.aggregate({ where: { status: 'Pending' }, _sum: { amount: true }, _count: true }),
      prisma.ride.count({ where: { status: { in: ['Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'] } } }),
    ]);
  const requested7 = completed7 + cancelled7 + noDrivers7;
  return {
    ridesToday,
    activeRides: activeNow,
    last7Days: {
      completed: completed7,
      cancelled: cancelled7,
      noDrivers: noDrivers7,
      completionRate: requested7 ? round2((completed7 / requested7) * 100) : 0,
      gmv: round2(gmv7._sum.fare ?? 0),
      platformRevenue: round2(gmv7._sum.platformFee ?? 0),
    },
    driversOnline: online,
    driversInReview: inReview,
    vehiclesInReview,
    failedPayments,
    openIncidents,
    pendingPayouts: { count: pendingPayouts._count, amount: round2(pendingPayouts._sum.amount ?? 0) },
  };
}

// ------------------------------------------------------------------ motoristas
export async function listDrivers(q: { status?: string; q?: string } & z.infer<typeof pageSchema>) {
  const where: Prisma.DriverProfileWhereInput = {
    ...(q.status ? { status: q.status as Prisma.EnumDriverStatusFilter['equals'] } : {}),
    ...(q.q ? { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, phone: true, cpf: true, createdAt: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.driverProfile.count({ where }),
  ]);
  return page(
    rows.map((d) => ({
      userId: d.userId,
      name: d.user.name,
      email: d.user.email,
      phone: d.user.phone,
      status: d.status,
      isOnline: d.isOnline,
      rating: ratingAverage(d.ratingSum, d.ratingCount),
      updatedAt: d.updatedAt,
    })),
    total,
    q,
  );
}

export async function driverDetail(userId: string) {
  const d = await prisma.driverProfile.findUnique({ where: { userId }, include: { user: true } });
  if (!d) throw new AppError('Motorista não encontrado.', 404, 'not_found');
  const vehicles = await prisma.vehicle.findMany({ where: { driverId: userId }, orderBy: { createdAt: 'desc' } });
  const [rides, balance] = await Promise.all([
    prisma.ride.count({ where: { driverId: userId, status: 'Completed' } }),
    prisma.driverEarning.aggregate({ where: { driverId: userId }, _sum: { amount: true } }),
  ]);
  return {
    userId,
    name: d.user.name,
    email: d.user.email,
    phone: d.user.phone,
    cpf: d.user.cpf,
    status: d.status,
    rejectionReason: d.rejectionReason,
    cnhNumber: d.cnhNumber,
    cnhCategory: d.cnhCategory,
    cnhExpiresAt: d.cnhExpiresAt,
    birthDate: d.birthDate,
    hasCnhPhoto: !!d.cnhPhotoKey,
    hasSelfie: !!d.selfieKey,
    pixKey: d.pixKey,
    pixKeyType: d.pixKeyType,
    isOnline: d.isOnline,
    completedRides: rides,
    balance: round2(balance._sum.amount ?? 0),
    rating: ratingAverage(d.ratingSum, d.ratingCount),
    vehicles: vehicles.map((v) => ({ id: v.id, plate: v.plate, brand: v.brand, model: v.model, color: v.color, year: v.year, category: v.category, status: v.status, active: v.active, hasCrlv: !!v.crlvKey, rejectionReason: v.rejectionReason })),
  };
}

/** Documento decifrado sob demanda (nunca por URL pública) — acesso auditado. */
export async function driverDocument(adminId: string, userId: string, kind: 'cnh' | 'selfie') {
  const d = await prisma.driverProfile.findUnique({ where: { userId } });
  const key = kind === 'cnh' ? d?.cnhPhotoKey : d?.selfieKey;
  if (!key) throw new AppError('Documento não enviado.', 404, 'not_found');
  await audit(adminId, 'driver.document_viewed', 'User', userId, { kind });
  return getDecrypted(key);
}

export async function vehicleCrlv(adminId: string, vehicleId: string) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v?.crlvKey) throw new AppError('CRLV não enviado.', 404, 'not_found');
  await audit(adminId, 'vehicle.document_viewed', 'Vehicle', vehicleId);
  return getDecrypted(v.crlvKey);
}

export async function reviewDriver(adminId: string, userId: string, decision: 'approve' | 'reject' | 'suspend' | 'reactivate', reason?: string) {
  const d = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!d) throw new AppError('Motorista não encontrado.', 404, 'not_found');
  const allowed: Record<typeof decision, string[]> = {
    approve: ['InReview', 'Rejected'],
    reject: ['InReview', 'PendingDocuments'],
    suspend: ['Approved'],
    reactivate: ['Suspended'],
  };
  const verb: Record<typeof decision, string> = { approve: 'aprovar', reject: 'recusar', suspend: 'suspender', reactivate: 'reativar' };
  const statusPt: Record<string, string> = { PendingDocuments: 'cadastro incompleto', InReview: 'em análise', Approved: 'aprovado', Rejected: 'recusado', Suspended: 'suspenso' };
  if (!allowed[decision].includes(d.status))
    throw new AppError(`Não é possível ${verb[decision]} um motorista com status "${statusPt[d.status] ?? d.status}".`, 409, 'invalid_state');
  if (decision === 'approve' && (!d.cnhNumber || !d.cnhPhotoKey || !d.selfieKey)) throw new AppError('Cadastro incompleto.', 409, 'incomplete');
  const status = decision === 'approve' || decision === 'reactivate' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Suspended';
  if (decision === 'suspend') {
    const active = await prisma.ride.count({ where: { driverId: userId, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } } });
    if (active) throw new AppError('O motorista está numa corrida agora. Aguarde ela terminar.', 409, 'active_ride');
  }
  await prisma.driverProfile.update({
    where: { userId },
    data: {
      status,
      rejectionReason: decision === 'reject' || decision === 'suspend' ? (reason ?? null) : null,
      reviewedAt: new Date(),
      reviewedBy: adminId,
      ...(decision === 'suspend' ? { isOnline: false } : {}),
    },
  });
  await audit(adminId, `driver.${decision}`, 'User', userId, { reason });
  const msg: Record<typeof decision, [string, string]> = {
    approve: ['Cadastro aprovado!', 'Você já pode ficar online e receber corridas.'],
    reject: ['Cadastro precisa de ajustes', reason ?? 'Confira os dados e envie novamente.'],
    suspend: ['Conta de motorista suspensa', reason ?? 'Fale com o suporte.'],
    reactivate: ['Conta reativada', 'Você já pode ficar online novamente.'],
  };
  void sendPush(userId, { title: msg[decision][0], body: msg[decision][1] });
  return driverDetail(userId);
}

export async function reviewVehicle(adminId: string, vehicleId: string, decision: 'approve' | 'reject', reason?: string) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v || !v.active) throw new AppError('Veículo não encontrado.', 404, 'not_found');
  if (decision === 'approve' && !v.crlvKey) throw new AppError('O CRLV não foi enviado.', 409, 'incomplete');
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { status: decision === 'approve' ? 'Approved' : 'Rejected', rejectionReason: decision === 'reject' ? (reason ?? null) : null },
  });
  await audit(adminId, `vehicle.${decision}`, 'Vehicle', vehicleId, { reason });
  return driverDetail(v.driverId);
}

// ------------------------------------------------------------------ corridas
export async function listRides(q: { status?: string; from?: Date; to?: Date } & z.infer<typeof pageSchema>) {
  const where: Prisma.RideWhereInput = {
    ...(q.status ? { status: q.status as Prisma.EnumRideStatusFilter['equals'] } : {}),
    ...(q.from || q.to ? { requestedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ride.findMany({
      where,
      include: { passenger: { select: { name: true } }, driver: { select: { name: true } } },
      orderBy: { requestedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.ride.count({ where }),
  ]);
  return page(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      paymentStatus: r.paymentStatus,
      category: r.category,
      passenger: r.passenger.name,
      driver: r.driver?.name ?? null,
      origin: r.originAddress,
      destination: r.destAddress,
      fare: round2(r.fare),
      requestedAt: r.requestedAt,
      completedAt: r.completedAt,
    })),
    total,
    q,
  );
}

export async function rideDetail(rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: rideInclude });
  if (!ride) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  const [events, offers, payments, incidents, recordings] = await Promise.all([
    prisma.rideEvent.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } }),
    prisma.rideOffer.findMany({ where: { rideId }, orderBy: { sentAt: 'asc' } }),
    prisma.ridePayment.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } }),
    prisma.safetyIncident.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } }),
    prisma.rideRecording.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    ride: { ...toRideDto(ride, ride.passengerId), passengerName: ride.passenger.name, driverName: ride.driver?.name ?? null, platformFee: round2(ride.platformFee), driverEarning: round2(ride.driverEarning) },
    events: events.map((e) => ({ type: e.type, actor: e.actor, actorId: e.actorId, payload: e.payload, at: e.createdAt })),
    offers: offers.map((o) => ({ driverId: o.driverId, status: o.status, etaS: o.pickupEtaS, sentAt: o.sentAt, respondedAt: o.respondedAt })),
    payments: payments.map((p) => ({ id: p.id, provider: p.provider, method: p.method, amount: round2(p.amount), status: p.status, externalId: p.externalId, detail: p.statusDetail, at: p.createdAt })),
    incidents: incidents.map((i) => ({ id: i.id, type: i.type, status: i.status, description: i.description, at: i.createdAt })),
    recordings: recordings.map((r) => ({ id: r.id, sizeBytes: r.sizeBytes, expiresAt: r.expiresAt, deleted: !!r.deletedAt })),
  };
}

export async function forceCancel(adminId: string, rideId: string, reason: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  const done = await prisma.ride.updateMany({
    where: { id: rideId, status: { in: ['Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'] } },
    data: { status: 'Cancelled', cancelledAt: new Date(), cancelledBy: 'Admin', cancelReason: reason, paymentStatus: 'NotRequired' },
  });
  if (!done.count) throw new AppError('A corrida não está em andamento.', 409, 'invalid_state');
  await withdrawPendingOffers(rideId);
  await prisma.rideEvent.create({ data: { rideId, type: 'admin_cancelled', actor: 'Admin', actorId: adminId, payload: { reason } } });
  await audit(adminId, 'ride.force_cancel', 'Ride', rideId, { reason });
  await publishRide(rideId);
  return rideDetail(rideId);
}

// ------------------------------------------------------------------ saques
export async function listPayouts(status: string | undefined, p: z.infer<typeof pageSchema>) {
  const where: Prisma.PayoutRequestWhereInput = status ? { status: status as Prisma.EnumPayoutStatusFilter['equals'] } : {};
  const [rows, total] = await Promise.all([
    prisma.payoutRequest.findMany({ where, include: { driver: { select: { name: true, email: true } } }, orderBy: { requestedAt: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    prisma.payoutRequest.count({ where }),
  ]);
  return page(
    rows.map((r) => ({ id: r.id, driverId: r.driverId, driverName: r.driver.name, driverEmail: r.driver.email, amount: round2(r.amount), pixKey: r.pixKey, pixKeyType: r.pixKeyType, status: r.status, note: r.note, requestedAt: r.requestedAt, resolvedAt: r.resolvedAt })),
    total,
    p,
  );
}

/** Marca o saque como pago (Pix feito por fora) e debita o livro-caixa — atômico e idempotente. */
export async function resolvePayout(adminId: string, id: string, decision: 'paid' | 'rejected', note?: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.payoutRequest.updateMany({
      where: { id, status: 'Pending' },
      data: { status: decision === 'paid' ? 'Paid' : 'Rejected', resolvedAt: new Date(), resolvedBy: adminId, note: note ?? '' },
    });
    if (!r.count) throw new AppError('Este saque já foi resolvido.', 409, 'already_resolved');
    if (decision === 'paid') {
      const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id } });
      await tx.driverEarning.create({ data: { driverId: p.driverId, payoutId: p.id, type: 'Payout', amount: -Number(p.amount), description: `Saque via Pix (${p.pixKeyType})` } });
    }
  });
  await audit(adminId, `payout.${decision}`, 'PayoutRequest', id, { note });
  const p = await prisma.payoutRequest.findUniqueOrThrow({ where: { id } });
  void sendPush(p.driverId, {
    title: decision === 'paid' ? 'Saque pago' : 'Saque não aprovado',
    body: decision === 'paid' ? `R$ ${Number(p.amount).toFixed(2).replace('.', ',')} enviado para sua chave Pix.` : (note ?? 'Fale com o suporte.'),
  });
  return { id, status: p.status };
}

// ------------------------------------------------------------------ preços
export async function listPricing() {
  const rows = await prisma.pricing.findMany({ orderBy: { baseFare: 'asc' } });
  return rows.map((r) => ({
    category: r.category,
    label: r.label,
    baseFare: round2(r.baseFare),
    perKm: round2(r.perKm),
    perMinute: round2(r.perMinute),
    minimumFare: round2(r.minimumFare),
    platformFeePercent: round2(r.platformFeePercent),
    cancellationFee: round2(r.cancellationFee),
    cancellationPlatformFee: round2(r.cancellationPlatformFee),
    driverCancelPenalty: round2(r.driverCancelPenalty),
    active: r.active,
    updatedAt: r.updatedAt,
  }));
}

export async function updatePricing(adminId: string, category: 'Economy' | 'Comfort', input: z.infer<typeof pricingSchema>) {
  if (input.minimumFare < input.baseFare) throw new AppError('A tarifa mínima não pode ser menor que a tarifa base.', 400, 'invalid_pricing');
  if (!input.active) {
    const others = await prisma.pricing.count({ where: { active: true, NOT: { category } } });
    if (!others) throw new AppError('Pelo menos uma categoria precisa ficar ativa.', 409, 'last_category');
  }
  await prisma.pricing.update({ where: { category }, data: { ...input, updatedBy: adminId } });
  await audit(adminId, 'pricing.update', 'Pricing', category, input);
  return listPricing();
}

// ------------------------------------------------------------------ ocorrências
export async function listIncidents(status: string | undefined, type: string | undefined, p: z.infer<typeof pageSchema>) {
  const where: Prisma.SafetyIncidentWhereInput = {
    ...(status ? { status: status as Prisma.EnumIncidentStatusFilter['equals'] } : {}),
    ...(type ? { type: type as Prisma.EnumIncidentTypeFilter['equals'] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.safetyIncident.findMany({
      where,
      include: { reporter: { select: { name: true, phone: true } }, attachments: { where: { deletedAt: null }, select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    prisma.safetyIncident.count({ where }),
  ]);
  return page(
    rows.map((i) => ({
      id: i.id,
      rideId: i.rideId,
      type: i.type,
      category: i.category,
      role: i.role,
      status: i.status,
      description: i.description,
      reporter: i.reporter.name,
      reporterPhone: i.reporter.phone,
      lat: i.lat,
      lng: i.lng,
      attachmentIds: i.attachments.map((a) => a.id),
      createdAt: i.createdAt,
    })),
    total,
    p,
  );
}

export async function setIncidentStatus(adminId: string, id: string, status: 'Open' | 'InReview' | 'Closed') {
  const updated = await prisma.safetyIncident.update({ where: { id }, data: { status, ...(status === 'Closed' ? { resolvedAt: new Date(), resolvedBy: adminId } : {}) } });
  await audit(adminId, 'incident.status', 'SafetyIncident', id, { status });
  return { id: updated.id, status: updated.status };
}

// ------------------------------------------------------------------ usuários
export async function listUsers(q: string | undefined, p: z.infer<typeof pageSchema>) {
  const where: Prisma.UserWhereInput = {
    role: { in: ['Passenger', 'Driver', 'Client'] },
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { passengerProfile: true } }),
    prisma.user.count({ where }),
  ]);
  const ids = rows.map((u) => u.id);
  const counts = await prisma.ride.groupBy({ by: ['passengerId'], where: { passengerId: { in: ids }, status: 'Completed' }, _count: true });
  const byUser = new Map(counts.map((c) => [c.passengerId, c._count]));
  return page(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt,
      ridesAsPassenger: byUser.get(u.id) ?? 0,
      rating: ratingAverage(u.passengerProfile?.ratingSum, u.passengerProfile?.ratingCount),
    })),
    total,
    p,
  );
}

export async function auditRecordingAccess(adminId: string, recordingId: string) {
  await audit(adminId, 'recording.accessed', 'RideRecording', recordingId);
}

export async function auditComplaintAttachmentAccess(adminId: string, attachmentId: string) {
  await audit(adminId, 'complaint.attachment_accessed', 'IncidentAttachment', attachmentId);
}
