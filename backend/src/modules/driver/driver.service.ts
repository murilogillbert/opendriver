import type { DriverProfile, Vehicle } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isValidLatLng } from '../../domain/geo.js';
import { ratingAverage } from '../../domain/rating.js';
import { ageOn, isValidCnh, isValidRenavam, normalizePixKey, normalizePlate, type PixKeyType } from '../../domain/validators.js';
import { AppError } from '../../errors.js';
import { issueTokens } from '../../infra/auth/jwt.js';
import { verifyPassword } from '../../infra/auth/password.js';
import { prisma } from '../../infra/prisma.js';
import { putEncrypted } from '../../infra/storage/storage.js';
import { vehicleValidation } from '../../infra/vehicleValidation/index.js';
import { d, round2 } from '../../lib/money.js';
import { toUserDto } from '../auth/auth.service.js';

const MIN_DRIVER_AGE = 21;
const MIN_VEHICLE_YEAR_OFFSET = 15; // veículo com até 15 anos de fabricação

export const driverDataSchema = z.object({
  cnhNumber: z.string().refine(isValidCnh, 'Número da CNH inválido.'),
  cnhCategory: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => /^(A?B|A?C|A?D|A?E)$/.test(c), 'A CNH precisa ser categoria B ou superior.'),
  cnhExpiresAt: z.coerce.date(),
  birthDate: z.coerce.date(),
});

export const vehicleSchema = z.object({
  plate: z.string().transform((v, ctx) => {
    const p = normalizePlate(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'Placa inválida. Use o formato ABC1D23 ou ABC1234.' });
    return p ?? '';
  }),
  brand: z.string().trim().min(2, 'Informe a marca.').max(60),
  model: z.string().trim().min(1, 'Informe o modelo.').max(60),
  color: z.string().trim().min(3, 'Informe a cor.').max(40),
  year: z.coerce.number().int(),
  category: z.enum(['Economy', 'Comfort']).default('Economy'),
  /// Plano §4 — opcionais: sem eles, o veículo segue no fluxo manual de sempre (upload de CRLV).
  renavam: z.string().refine(isValidRenavam, 'RENAVAM inválido.').optional(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z]{2}$/.test(v), 'UF inválida.')
    .optional(),
  chassi: z.string().trim().min(5).max(30).optional(),
});

export const pixSchema = z.object({
  pixKeyType: z.enum(['CPF', 'CNPJ', 'Email', 'Phone', 'Random']),
  pixKey: z.string().min(1, 'Informe a chave Pix.').max(140),
  /** Obrigatória para TROCAR uma chave já cadastrada (protege os ganhos se a sessão vazar). */
  password: z.string().max(128).optional(),
});

export const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number().min(0).max(360).nullish(),
  speed: z.number().min(0).max(100).nullish(),
  accuracy: z.number().min(0).max(10_000).nullish(),
});

export type DocumentKind = 'cnh' | 'selfie';

function checklist(p: DriverProfile, vehicles: Vehicle[]) {
  const activeVehicles = vehicles.filter((v) => v.active);
  return {
    personalData: !!(p.cnhNumber && p.cnhCategory && p.cnhExpiresAt && p.birthDate),
    cnhPhoto: !!p.cnhPhotoKey,
    selfie: !!p.selfieKey,
    vehicle: activeVehicles.some((v) => !!v.crlvKey),
    pixKey: !!p.pixKey,
  };
}

function toVehicleDto(v: Vehicle) {
  return {
    id: v.id,
    plate: v.plate,
    brand: v.brand,
    model: v.model,
    color: v.color,
    year: v.year,
    category: v.category,
    status: v.status,
    rejectionReason: v.rejectionReason,
    hasCrlv: !!v.crlvKey,
    validationStatus: v.validationStatus,
  };
}

async function loadProfile(userId: string): Promise<DriverProfile> {
  const p = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!p) throw new AppError('Você ainda não tem cadastro de motorista.', 404, 'not_driver');
  return p;
}

/** Passageiro (ou conta "Client" antiga do hub) passa a ser motorista. Devolve
 * tokens novos porque o papel vai no JWT. */
export async function becomeDriver(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('Conta não encontrada.', 404, 'not_found');
  if (!['Passenger', 'Client', 'Driver'].includes(user.role))
    throw new AppError('Este tipo de conta não pode se cadastrar como motorista.', 409, 'role_not_allowed');
  const updated = await prisma.$transaction(async (tx) => {
    await tx.driverProfile.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.passengerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
    return user.role === 'Driver' ? user : tx.user.update({ where: { id: userId }, data: { role: 'Driver' } });
  });
  const tokens = issueTokens({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, partnerId: updated.partnerId });
  return { ...tokens, user: toUserDto(updated) };
}

export async function getProfile(userId: string) {
  const p = await loadProfile(userId);
  const vehicles = await prisma.vehicle.findMany({ where: { driverId: userId, active: true }, orderBy: { createdAt: 'asc' } });
  return {
    status: p.status,
    rejectionReason: p.rejectionReason,
    cnhNumber: p.cnhNumber,
    cnhCategory: p.cnhCategory,
    cnhExpiresAt: p.cnhExpiresAt,
    birthDate: p.birthDate,
    pixKey: p.pixKey,
    pixKeyType: p.pixKeyType,
    isOnline: p.isOnline,
    currentVehicleId: p.currentVehicleId,
    rating: ratingAverage(p.ratingSum, p.ratingCount),
    checklist: checklist(p, vehicles),
    vehicles: vehicles.map(toVehicleDto),
  };
}

/** Dados pessoais só podem mudar antes da aprovação (depois, via suporte). */
function assertEditable(p: DriverProfile) {
  if (p.status === 'Approved' || p.status === 'Suspended')
    throw new AppError('Seus dados já foram aprovados. Para alterar, fale com o suporte.', 409, 'profile_locked');
}

export async function updateDriverData(userId: string, input: z.infer<typeof driverDataSchema>) {
  const p = await loadProfile(userId);
  assertEditable(p);
  const today = new Date();
  if (input.cnhExpiresAt.getTime() < today.getTime()) throw new AppError('Sua CNH está vencida.', 400, 'cnh_expired');
  if (ageOn(input.birthDate, today) < MIN_DRIVER_AGE)
    throw new AppError(`É preciso ter pelo menos ${MIN_DRIVER_AGE} anos para dirigir.`, 400, 'underage');
  await prisma.driverProfile.update({
    where: { userId },
    data: {
      cnhNumber: input.cnhNumber.replace(/\D/g, ''),
      cnhCategory: input.cnhCategory,
      cnhExpiresAt: input.cnhExpiresAt,
      birthDate: input.birthDate,
      status: p.status === 'Rejected' ? 'PendingDocuments' : p.status,
    },
  });
  return getProfile(userId);
}

export async function uploadDocument(userId: string, kind: DocumentKind, file: { buffer: Buffer; ext: string }) {
  const p = await loadProfile(userId);
  assertEditable(p);
  const key = `drivers/${userId}/${kind}-${randomUUID()}.${file.ext}.enc`;
  await putEncrypted(key, file.buffer);
  await prisma.driverProfile.update({
    where: { userId },
    data: kind === 'cnh' ? { cnhPhotoKey: key } : { selfieKey: key },
  });
  return getProfile(userId);
}

/** Envia para análise (RF12) quando tudo que é obrigatório está preenchido. */
export async function submitForReview(userId: string) {
  const p = await loadProfile(userId);
  if (p.status === 'Approved') return getProfile(userId);
  if (p.status === 'Suspended') throw new AppError('Sua conta de motorista está suspensa. Fale com o suporte.', 409, 'suspended');
  const vehicles = await prisma.vehicle.findMany({ where: { driverId: userId, active: true } });
  const c = checklist(p, vehicles);
  const missing = [
    !c.personalData && 'dados da CNH',
    !c.cnhPhoto && 'foto da CNH',
    !c.selfie && 'selfie',
    !c.vehicle && 'veículo com CRLV',
  ].filter(Boolean);
  if (missing.length) throw new AppError(`Falta enviar: ${missing.join(', ')}.`, 400, 'incomplete');
  await prisma.driverProfile.update({ where: { userId }, data: { status: 'InReview', rejectionReason: null } });
  return getProfile(userId);
}

export async function addVehicle(userId: string, input: z.infer<typeof vehicleSchema>) {
  await loadProfile(userId);
  const year = new Date().getFullYear();
  if (input.year > year + 1 || input.year < year - MIN_VEHICLE_YEAR_OFFSET)
    throw new AppError(`O veículo precisa ser de ${year - MIN_VEHICLE_YEAR_OFFSET} ou mais novo.`, 400, 'vehicle_too_old');
  const taken = await prisma.vehicle.findFirst({ where: { plate: input.plate, active: true, NOT: { driverId: userId } } });
  if (taken) throw new AppError('Esta placa já está cadastrada por outro motorista.', 409, 'plate_taken');
  const mine = await prisma.vehicle.findFirst({ where: { plate: input.plate, active: true, driverId: userId } });
  if (mine) throw new AppError('Você já cadastrou esta placa.', 409, 'plate_duplicate');
  const v = await prisma.vehicle.create({ data: { ...input, driverId: userId } });
  // Primeiro veículo vira o atual automaticamente (opção única — UX09).
  await prisma.driverProfile.updateMany({ where: { userId, currentVehicleId: null }, data: { currentVehicleId: v.id } });
  const validated = input.renavam && input.uf ? await validateVehicle(v) : v;
  return toVehicleDto(validated);
}

/** Consulta o CRLV no provedor configurado (mock/Infosimples, plano §4) e decide
 * aprovação automática × revisão manual. Nunca lança — indisponibilidade cai em
 * revisão manual (RF17), que é o fluxo que já existe hoje. */
async function validateVehicle(v: Vehicle): Promise<Vehicle> {
  if (!v.renavam || !v.uf) return v;
  let outcome: Awaited<ReturnType<typeof vehicleValidation.validate>>;
  try {
    outcome = await vehicleValidation.validate({
      plate: v.plate,
      renavam: v.renavam,
      uf: v.uf,
      chassi: v.chassi ?? undefined,
      registered: { brand: v.brand, model: v.model, year: v.year },
    });
  } catch (err) {
    outcome = { result: 'needs_review', matched: false, detail: { error: err instanceof Error ? err.message : String(err) } };
  }
  const validationStatus = outcome.result === 'approved' ? 'Auto' : outcome.result === 'rejected' ? 'Rejected' : 'Manual';
  const vehicleStatus = outcome.result === 'approved' ? 'Approved' : outcome.result === 'rejected' ? 'Rejected' : v.status;
  const [updated] = await prisma.$transaction([
    prisma.vehicle.update({ where: { id: v.id }, data: { validationStatus, status: vehicleStatus } }),
    prisma.vehicleValidation.create({
      data: { vehicleId: v.id, provider: vehicleValidation.name, result: outcome.result, matched: outcome.matched, detailJson: outcome.detail as never },
    }),
  ]);
  return updated;
}

async function ownVehicle(userId: string, vehicleId: string) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, driverId: userId, active: true } });
  if (!v) throw new AppError('Veículo não encontrado.', 404, 'not_found');
  return v;
}

export async function uploadCrlv(userId: string, vehicleId: string, file: { buffer: Buffer; ext: string }) {
  const v = await ownVehicle(userId, vehicleId);
  const key = `drivers/${userId}/crlv-${v.id}-${randomUUID()}.${file.ext}.enc`;
  await putEncrypted(key, file.buffer);
  // Documento novo = nova análise (inclusive de um veículo já aprovado).
  const updated = await prisma.vehicle.update({ where: { id: v.id }, data: { crlvKey: key, status: 'InReview', rejectionReason: null } });
  return toVehicleDto(updated);
}

export async function selectVehicle(userId: string, vehicleId: string) {
  const p = await loadProfile(userId);
  if (p.isOnline) throw new AppError('Fique offline para trocar de veículo.', 409, 'online');
  await ownVehicle(userId, vehicleId);
  await prisma.driverProfile.update({ where: { userId }, data: { currentVehicleId: vehicleId } });
  return getProfile(userId);
}

export async function removeVehicle(userId: string, vehicleId: string) {
  const p = await loadProfile(userId);
  await ownVehicle(userId, vehicleId);
  if (p.currentVehicleId === vehicleId && p.isOnline) throw new AppError('Fique offline para remover o veículo em uso.', 409, 'online');
  const inRide = await prisma.ride.count({ where: { vehicleId, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } } });
  if (inRide) throw new AppError('Este veículo está numa corrida em andamento.', 409, 'active_ride');
  await prisma.$transaction([
    prisma.vehicle.update({ where: { id: vehicleId }, data: { active: false } }),
    prisma.driverProfile.updateMany({ where: { userId, currentVehicleId: vehicleId }, data: { currentVehicleId: null } }),
  ]);
}

export async function setPixKey(userId: string, input: z.infer<typeof pixSchema>) {
  const p = await loadProfile(userId);
  const key = normalizePixKey(input.pixKey, input.pixKeyType as PixKeyType);
  if (!key) throw new AppError('Chave Pix inválida para o tipo escolhido.', 400, 'invalid_pix');
  if (p.pixKey && p.pixKey !== key) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!input.password || !user || !(await verifyPassword(input.password, user.passwordHash)))
      throw new AppError('Confirme sua senha para trocar a chave Pix.', 403, 'password_required');
  }
  await prisma.driverProfile.update({ where: { userId }, data: { pixKey: key, pixKeyType: input.pixKeyType } });
  return getProfile(userId);
}

/** Ficar online (UX: 1 toque). Motivo claro quando não puder. */
export async function goOnline(userId: string) {
  const p = await loadProfile(userId);
  if (p.status !== 'Approved') {
    const msg =
      p.status === 'InReview'
        ? 'Seu cadastro está em análise. Avisaremos quando for aprovado.'
        : p.status === 'Suspended'
          ? 'Sua conta de motorista está suspensa. Fale com o suporte.'
          : 'Complete seu cadastro de motorista para ficar online.';
    throw new AppError(msg, 409, 'driver_not_approved');
  }
  if (p.cnhExpiresAt && p.cnhExpiresAt.getTime() < Date.now())
    throw new AppError('Sua CNH venceu. Atualize seus dados com o suporte.', 409, 'cnh_expired');
  const vehicle = p.currentVehicleId ? await prisma.vehicle.findUnique({ where: { id: p.currentVehicleId } }) : null;
  if (!vehicle || !vehicle.active) throw new AppError('Escolha o veículo que você vai usar.', 409, 'no_vehicle');
  if (vehicle.status !== 'Approved') throw new AppError('Seu veículo ainda não foi aprovado.', 409, 'vehicle_not_approved');
  await prisma.driverProfile.update({ where: { userId }, data: { isOnline: true, onlineSince: p.isOnline ? p.onlineSince : new Date() } });
  return { isOnline: true };
}

export async function goOffline(userId: string) {
  await loadProfile(userId);
  await prisma.driverProfile.update({ where: { userId }, data: { isOnline: false, onlineSince: null } });
  return { isOnline: false };
}

export async function updateLocation(userId: string, input: z.infer<typeof locationSchema>) {
  if (!isValidLatLng(input)) throw new AppError('Localização inválida.', 400, 'invalid_location');
  const data = {
    lat: input.lat,
    lng: input.lng,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    accuracy: input.accuracy ?? null,
    updatedAt: new Date(),
  };
  await prisma.driverLocation.upsert({ where: { driverId: userId }, create: { driverId: userId, ...data }, update: data });
}

// ------------------------------------------------------------------ ganhos

export async function balance(userId: string): Promise<number> {
  const agg = await prisma.driverEarning.aggregate({ where: { driverId: userId }, _sum: { amount: true } });
  return round2(agg._sum.amount ?? 0);
}

export async function earningsSummary(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // segunda-feira
  const sum = async (from: Date) =>
    round2(
      (
        await prisma.driverEarning.aggregate({
          where: { driverId: userId, createdAt: { gte: from }, type: { in: ['RideEarning', 'CancellationFee', 'Adjustment'] } },
          _sum: { amount: true },
        })
      )._sum.amount ?? 0,
    );
  const [today, week, available, ridesToday, pending] = await Promise.all([
    sum(startOfDay),
    sum(startOfWeek),
    balance(userId),
    prisma.ride.count({ where: { driverId: userId, status: 'Completed', completedAt: { gte: startOfDay } } }),
    prisma.payoutRequest.aggregate({ where: { driverId: userId, status: 'Pending' }, _sum: { amount: true } }),
  ]);
  const pendingPayout = round2(pending._sum.amount ?? 0);
  return { today, week, ridesToday, balance: available, pendingPayout, withdrawable: round2(d(available).minus(pendingPayout)) };
}

export async function earningsList(userId: string, cursor?: string) {
  const rows = await prisma.driverEarning.findMany({
    where: { driverId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 31,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, 30);
  return {
    items: page.map((e) => ({ id: e.id, type: e.type, amount: round2(e.amount), description: e.description, rideId: e.rideId, createdAt: e.createdAt })),
    nextCursor: rows.length > 30 ? page[page.length - 1]!.id : null,
  };
}

export const payoutSchema = z.object({ amount: z.number().positive('Informe um valor.') });

const MIN_PAYOUT = 10;

export async function requestPayout(userId: string, amount: number) {
  const value = round2(amount);
  if (value < MIN_PAYOUT) throw new AppError(`O saque mínimo é de R$ ${MIN_PAYOUT},00.`, 400, 'payout_min');
  const [p, user] = await Promise.all([loadProfile(userId), prisma.user.findUnique({ where: { id: userId } })]);
  if (!user?.emailVerifiedAt) throw new AppError('Confirme seu e-mail antes de sacar.', 403, 'email_not_verified');
  if (!p.pixKey || !p.pixKeyType) throw new AppError('Cadastre sua chave Pix antes de sacar.', 400, 'no_pix');
  // Serializa saques do mesmo motorista (evita dois pedidos simultâneos acima do saldo).
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${userId}`}))`;
    const agg = await tx.driverEarning.aggregate({ where: { driverId: userId }, _sum: { amount: true } });
    const pending = await tx.payoutRequest.aggregate({ where: { driverId: userId, status: 'Pending' }, _sum: { amount: true } });
    const withdrawable = d(agg._sum.amount ?? 0).minus(pending._sum.amount ?? 0);
    if (withdrawable.lessThan(value)) throw new AppError('Valor acima do seu saldo disponível.', 400, 'insufficient_balance');
    const r = await tx.payoutRequest.create({ data: { driverId: userId, amount: value, pixKey: p.pixKey!, pixKeyType: p.pixKeyType! } });
    return { id: r.id, amount: round2(r.amount), status: r.status, requestedAt: r.requestedAt };
  });
}

export async function listPayouts(userId: string) {
  const rows = await prisma.payoutRequest.findMany({ where: { driverId: userId }, orderBy: { requestedAt: 'desc' }, take: 50 });
  return rows.map((r) => ({ id: r.id, amount: round2(r.amount), status: r.status, note: r.note, requestedAt: r.requestedAt, resolvedAt: r.resolvedAt }));
}
