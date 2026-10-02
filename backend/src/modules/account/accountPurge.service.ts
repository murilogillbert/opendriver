import type { Prisma } from '@prisma/client';
import { ACTIVE_STATUSES } from '../../domain/rideState.js';
import { randomToken } from '../../infra/crypto.js';
import { hashPassword } from '../../infra/auth/password.js';
import { prisma } from '../../infra/prisma.js';
import { deleteObject } from '../../infra/storage/storage.js';
import { DELETED_EMAIL_SUFFIX, markUserRevoked } from '../../middleware/auth.js';

/**
 * Exclusão de conta — a parte que pertence ao schema `opendriver`.
 *
 * Separado do `auth.service.ts` porque roda em dois contextos: quando a pessoa pede pelo app de
 * corridas, e quando o hub pede via `/internal/accounts/:id/purge` (pessoa excluiu a conta pelo
 * app do hub). Nos dois casos o efeito tem de ser o mesmo — é isso que evita conta encerrada num
 * app com CNH, selfie e CRLV sobrando no outro.
 */

/** Motivos que impedem a exclusão agora, do lado do OpenDriver. Vazio = pode excluir. */
export async function deletionBlockers(userId: string): Promise<string[]> {
  const blockers: string[] = [];
  const active = await prisma.ride.count({
    where: {
      // `passengerForId`: a pessoa pode estar embarcada numa corrida que outra conta pediu pra ela.
      OR: [{ passengerId: userId }, { driverId: userId }, { passengerForId: userId }],
      status: { in: ACTIVE_STATUSES },
    },
  });
  if (active > 0) blockers.push('Você tem uma corrida em andamento no OpenDriver.');
  return blockers;
}

/**
 * Apaga os dados pessoais do schema `opendriver` e os documentos no storage. **Idempotente**:
 * rodar de novo numa conta já anonimizada não tem efeito colateral, o que permite reexecutar a
 * exclusão quando uma das pontas falha no meio.
 *
 * Corridas, lançamentos de ganho e repasses NÃO são apagados: são registro fiscal do motorista e
 * já não contêm dado pessoal depois da anonimização.
 */
export async function purgeOpendriverAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const anonymized: Prisma.UserUpdateInput = {
    name: 'Conta excluída',
    // Já anonimizada: mantém o e-mail atual para não gerar um endereço novo a cada chamada.
    email: user.email.endsWith(DELETED_EMAIL_SUFFIX) ? user.email : `excluido+${userId}${DELETED_EMAIL_SUFFIX}`,
    passwordHash: await hashPassword(randomToken(32)),
    phone: null,
    cpf: null,
    avatarUrl: null,
    emailVerifiedAt: null,
  };

  // Fotos de documentos (CNH, selfie, CRLV) saem do armazenamento — LGPD.
  const [dp, vehicles] = await Promise.all([
    prisma.driverProfile.findUnique({ where: { userId }, select: { cnhPhotoKey: true, selfieKey: true } }),
    prisma.vehicle.findMany({ where: { driverId: userId, crlvKey: { not: null } }, select: { crlvKey: true } }),
  ]);
  const documentKeys = [dp?.cnhPhotoKey, dp?.selfieKey, ...vehicles.map((v) => v.crlvKey)].filter((k): k is string => !!k);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: anonymized }),
    prisma.vehicle.updateMany({ where: { driverId: userId }, data: { active: false, crlvKey: null } }),
    prisma.driverProfile.updateMany({
      where: { userId },
      // Gênero (plano §7) é dado sensível: sai junto com os documentos, não só o acesso — LGPD.
      data: { status: 'Suspended', isOnline: false, pixKey: null, pixKeyType: null, cnhNumber: null, cnhPhotoKey: null, selfieKey: null, gender: null, womenOnlyPref: false },
    }),
    prisma.passengerProfile.updateMany({ where: { userId }, data: { gender: null, womenOnlyPref: false } }),
    // Corrida para terceiros: o vínculo com outras contas cai, e os dados dos dependentes (CPF e
    // telefone de TERCEIROS) são apagados. A linha fica, anonimizada, porque corridas antigas
    // apontam pra ela — o nome que o motorista viu na época segue em Ride.guestPassengerName.
    prisma.passengerLink.deleteMany({ where: { OR: [{ ownerId: userId }, { linkedUserId: userId }] } }),
    prisma.guestPassenger.updateMany({
      where: { ownerId: userId },
      data: { name: 'Passageiro removido', cpfEnc: null, cpfHash: null, phone: null, deletedAt: new Date() },
    }),
    prisma.paymentMethod.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: new Date(), tokenEnc: null } }),
    prisma.pushToken.deleteMany({ where: { userId } }),
    prisma.trustedContact.deleteMany({ where: { userId } }),
    prisma.savedPlace.deleteMany({ where: { userId } }),
    prisma.driverLocation.deleteMany({ where: { driverId: userId } }),
    prisma.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);

  markUserRevoked(userId);
  await Promise.all(documentKeys.map((k) => deleteObject(k).catch(() => undefined)));
}
