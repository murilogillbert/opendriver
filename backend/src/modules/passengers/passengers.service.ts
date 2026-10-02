import type { GuestPassenger } from '@prisma/client';
import { z } from 'zod';
import { ADULT_AGE, requiresAdultEscort } from '../../domain/ridePassenger.js';
import { ageOn, isValidCpf, onlyDigits } from '../../domain/validators.js';
import { AppError } from '../../errors.js';
import { decryptString, encryptString, fingerprint } from '../../infra/crypto.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { DELETED_EMAIL_SUFFIX } from '../../middleware/auth.js';

/**
 * Corrida para terceiros — quem pode embarcar numa corrida que outra pessoa pede e paga.
 *
 * Dois caminhos, deliberadamente diferentes em rigor:
 *
 *  - Conta da plataforma (`PassengerLink`): exige convite + aceite. Sem o aceite, qualquer um
 *    declararia que outra pessoa viaja com ele e entregaria o nome dela a um motorista. Como a
 *    identidade é da própria conta, o gênero que ela declarou vale na política "apenas mulheres".
 *  - Dependente sem perfil (`GuestPassenger`): nome, CPF e nascimento informados por quem pede,
 *    nada verificado contra fonte oficial. Por isso nunca entra na política "apenas mulheres", e
 *    por isso menor de idade exige confirmação explícita de adulto responsável no embarque.
 */

const MAX_GUEST_PASSENGERS = 10;
const MAX_LINKS = 10;
const MAX_AGE_YEARS = 120;

// ------------------------------------------------------------- dependentes (sem perfil)

const phone = z
  .string()
  .trim()
  .refine((v) => [10, 11].includes(onlyDigits(v).length), 'Telefone inválido. Use DDD + número.');

export const guestPassengerSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo de quem vai embarcar.').max(100),
  cpf: z.string().trim().refine(isValidCpf, 'CPF inválido.'),
  birthDate: z.coerce.date(),
  phone: phone.optional(),
});

/** Atualização: só o que muda. O CPF é a identidade do cadastro e não se corrige aqui — apaga e cria de novo. */
export const guestPassengerUpdateSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo de quem vai embarcar.').max(100).optional(),
  birthDate: z.coerce.date().optional(),
  phone: phone.nullish(),
});

function assertBirthDate(birthDate: Date): void {
  const age = ageOn(birthDate, new Date());
  if (birthDate.getTime() > Date.now()) throw new AppError('A data de nascimento não pode estar no futuro.', 400, 'invalid_birth_date');
  if (age > MAX_AGE_YEARS) throw new AppError('Confira a data de nascimento.', 400, 'invalid_birth_date');
}

/** `123.***.***-45` — o suficiente para a pessoa reconhecer o cadastro, sem devolver o CPF. */
function maskCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}`;
}

export function toGuestPassengerDto(g: GuestPassenger) {
  return {
    id: g.id,
    name: g.name,
    /// `null` só em cadastro já anonimizado pela exclusão da conta do dono.
    cpfMasked: g.cpfEnc ? maskCpf(decryptString(g.cpfEnc)) : null,
    birthDate: g.birthDate,
    phone: g.phone,
    /// O app usa isto para exigir a confirmação de adulto responsável antes de pedir a corrida.
    minor: requiresAdultEscort(g.birthDate),
  };
}

export async function listGuestPassengers(ownerId: string) {
  const rows = await prisma.guestPassenger.findMany({ where: { ownerId, deletedAt: null }, orderBy: { name: 'asc' } });
  return rows.map(toGuestPassengerDto);
}

/**
 * Cadastra o dependente. Re-cadastrar um CPF que havia sido removido reativa o registro em vez de
 * criar outro — a chave única é (dono, CPF), e as corridas antigas continuam apontando pra ele.
 */
export async function createGuestPassenger(ownerId: string, input: z.infer<typeof guestPassengerSchema>) {
  assertBirthDate(input.birthDate);
  const cpf = onlyDigits(input.cpf);
  const cpfHash = fingerprint(cpf);
  const existing = await prisma.guestPassenger.findUnique({ where: { ownerId_cpfHash: { ownerId, cpfHash } } });
  if (existing && !existing.deletedAt) throw new AppError('Você já cadastrou esta pessoa.', 409, 'guest_passenger_duplicate');
  if (!existing && (await prisma.guestPassenger.count({ where: { ownerId, deletedAt: null } })) >= MAX_GUEST_PASSENGERS)
    throw new AppError(`Você pode cadastrar até ${MAX_GUEST_PASSENGERS} pessoas.`, 409, 'too_many_guest_passengers');

  const data = { name: input.name, birthDate: input.birthDate, phone: input.phone ? onlyDigits(input.phone) : null };
  const saved = existing
    ? await prisma.guestPassenger.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } })
    : await prisma.guestPassenger.create({ data: { ...data, ownerId, cpfEnc: encryptString(cpf), cpfHash } });
  return toGuestPassengerDto(saved);
}

async function ownGuestPassenger(id: string, ownerId: string): Promise<GuestPassenger> {
  const g = await prisma.guestPassenger.findFirst({ where: { id, ownerId, deletedAt: null } });
  if (!g) throw new AppError('Passageiro não encontrado.', 404, 'not_found');
  return g;
}

export async function updateGuestPassenger(id: string, ownerId: string, input: z.infer<typeof guestPassengerUpdateSchema>) {
  await ownGuestPassenger(id, ownerId);
  if (input.birthDate) assertBirthDate(input.birthDate);
  const updated = await prisma.guestPassenger.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.birthDate ? { birthDate: input.birthDate } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ? onlyDigits(input.phone) : null } : {}),
    },
  });
  return toGuestPassengerDto(updated);
}

/** Remoção lógica: corridas já feitas apontam para esta linha e o histórico tem de continuar íntegro. */
export async function removeGuestPassenger(id: string, ownerId: string): Promise<void> {
  await ownGuestPassenger(id, ownerId);
  const active = await prisma.ride.count({
    where: { guestPassengerId: id, status: { in: ['Scheduled', 'Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'] } },
  });
  if (active) throw new AppError('Esta pessoa está numa corrida em andamento.', 409, 'active_ride');
  await prisma.guestPassenger.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ------------------------------------------------------------- vínculo entre contas

export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido.').max(180) });

const INVITE_ACCEPTED_MESSAGE = 'Se existir uma conta com esse e-mail, o convite foi enviado.';

/**
 * Convida outra conta a virar passageira das corridas que este usuário pede.
 *
 * A resposta é sempre a mesma, exista ou não a conta: responder diferente transformaria a rota num
 * verificador de "esse e-mail tem conta aqui?" (mesma postura do `forgotPassword`). Quem impede o
 * uso dela como varredura é o limite por usuário em `limits.passengerInvite`.
 */
export async function invitePassenger(ownerId: string, email: string): Promise<{ message: string }> {
  const target = await prisma.user.findUnique({ where: { email } });
  if (!target || target.id === ownerId || target.email.endsWith(DELETED_EMAIL_SUFFIX)) return { message: INVITE_ACCEPTED_MESSAGE };

  const existing = await prisma.passengerLink.findUnique({ where: { ownerId_linkedUserId: { ownerId, linkedUserId: target.id } } });
  if (existing?.status === 'Accepted') throw new AppError('Esta pessoa já está vinculada à sua conta.', 409, 'already_linked');
  if (!existing && (await prisma.passengerLink.count({ where: { ownerId, status: { in: ['Pending', 'Accepted'] } } })) >= MAX_LINKS)
    throw new AppError(`Você pode vincular até ${MAX_LINKS} pessoas.`, 409, 'too_many_links');

  // Reconvidar depois de uma recusa é permitido — o limite por usuário é o que evita insistência.
  const link = existing
    ? await prisma.passengerLink.update({ where: { id: existing.id }, data: { status: 'Pending', respondedAt: null } })
    : await prisma.passengerLink.create({ data: { ownerId, linkedUserId: target.id } });

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } });
  void sendPush(target.id, {
    title: 'Convite para viajar',
    body: `${owner?.name ?? 'Alguém'} quer poder pedir corridas para você.`,
    data: { type: 'passenger_link', linkId: link.id },
  });
  return { message: INVITE_ACCEPTED_MESSAGE };
}

/** Os dois lados: quem eu posso levar (`owned`) e quem pode me levar (`received`). */
export async function listLinks(userId: string) {
  const [owned, received] = await Promise.all([
    prisma.passengerLink.findMany({
      where: { ownerId: userId, status: { in: ['Pending', 'Accepted'] } },
      include: { linkedUser: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.passengerLink.findMany({
      where: { linkedUserId: userId, status: { in: ['Pending', 'Accepted'] } },
      include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  // `womenOnlyAllowed` é a única informação ligada a gênero que atravessa o vínculo, e atravessa
  // porque a própria pessoa autorizou no aceite. O gênero em si nunca sai do perfil dela.
  return {
    owned: owned.map((l) => ({ id: l.id, userId: l.linkedUser.id, name: l.linkedUser.name, avatarUrl: l.linkedUser.avatarUrl, status: l.status, womenOnlyAllowed: l.womenOnlyAllowed, createdAt: l.createdAt })),
    received: received.map((l) => ({ id: l.id, userId: l.owner.id, name: l.owner.name, avatarUrl: l.owner.avatarUrl, status: l.status, womenOnlyAllowed: l.womenOnlyAllowed, createdAt: l.createdAt })),
  };
}

export const respondLinkSchema = z.object({
  /**
   * Plano §7: a convidada autoriza que corridas pedidas para ela possam ser restritas a motoristas
   * mulheres. Só ela pode decidir — habilitar isso a partir de quem convida significaria revelar o
   * gênero dela a terceiro, que é exatamente o que a §7 proíbe.
   */
  womenOnlyAllowed: z.boolean().optional(),
});

/** Só o convidado aceita ou recusa — nunca quem convidou. */
export async function respondLink(linkId: string, userId: string, accept: boolean, womenOnlyAllowed = false) {
  const link = await prisma.passengerLink.findFirst({ where: { id: linkId, linkedUserId: userId, status: 'Pending' } });
  if (!link) throw new AppError('Convite não encontrado.', 404, 'not_found');
  if (accept && womenOnlyAllowed) {
    const profile = await prisma.passengerProfile.findUnique({ where: { userId }, select: { gender: true } });
    if (profile?.gender !== 'female')
      throw new AppError('Informe seu gênero na sua conta para autorizar corridas apenas com motoristas mulheres.', 409, 'gender_required');
  }
  await prisma.passengerLink.update({
    where: { id: link.id },
    data: { status: accept ? 'Accepted' : 'Revoked', respondedAt: new Date(), womenOnlyAllowed: accept && womenOnlyAllowed },
  });
  if (accept) {
    const invitee = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    void sendPush(link.ownerId, { title: 'Convite aceito', body: `${invitee?.name ?? 'A pessoa'} aceitou e já pode viajar nas suas corridas.`, data: { type: 'passenger_link' } });
  }
  return listLinks(userId);
}

/** Desfazer vale pros dois lados, a qualquer momento (é um consentimento, não um contrato). */
export async function removeLink(linkId: string, userId: string) {
  const link = await prisma.passengerLink.findFirst({ where: { id: linkId, OR: [{ ownerId: userId }, { linkedUserId: userId }] } });
  if (!link) throw new AppError('Vínculo não encontrado.', 404, 'not_found');
  const active = await prisma.ride.count({
    where: { passengerId: link.ownerId, passengerForId: link.linkedUserId, status: { in: ['Scheduled', 'Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'] } },
  });
  if (active) throw new AppError('Há uma corrida em andamento para esta pessoa.', 409, 'active_ride');
  await prisma.passengerLink.update({ where: { id: link.id }, data: { status: 'Revoked', respondedAt: new Date() } });
  return listLinks(userId);
}

// ------------------------------------------------------------- uso no pedido de corrida

export interface ResolvedRidePassenger {
  /** Conta de quem embarca, quando há uma (`self` ou `linked`). */
  riderUserId: string | null;
  guestPassengerId: string | null;
  /** Nome congelado no pedido (só para terceiros) — ver comentário em `Ride.guestPassengerName`. */
  guestPassengerName: string | null;
  /** Menor de idade: a corrida só segue com confirmação de adulto responsável. */
  requiresEscort: boolean;
  /** A passageira vinculada autorizou restringir a corrida a motoristas mulheres (plano §7). */
  womenOnlyAllowed: boolean;
}

/** Valida o vínculo e devolve o que gravar na corrida. Erro se o aceite não existe (mais). */
export async function resolveLinkedPassenger(ownerId: string, linkedUserId: string): Promise<ResolvedRidePassenger> {
  if (linkedUserId === ownerId) throw new AppError('Para viajar você mesmo, não escolha outro passageiro.', 400, 'invalid_passenger');
  const link = await prisma.passengerLink.findUnique({ where: { ownerId_linkedUserId: { ownerId, linkedUserId } } });
  if (link?.status !== 'Accepted')
    throw new AppError('Esta pessoa ainda não aceitou o convite para viajar nas suas corridas.', 409, 'passenger_not_linked');
  const user = await prisma.user.findUnique({ where: { id: linkedUserId }, select: { name: true } });
  if (!user) throw new AppError('Passageiro não encontrado.', 404, 'not_found');
  return { riderUserId: linkedUserId, guestPassengerId: null, guestPassengerName: user.name, requiresEscort: false, womenOnlyAllowed: link.womenOnlyAllowed };
}

/** Valida o dependente e devolve o que gravar na corrida. */
export async function resolveGuestPassenger(ownerId: string, guestPassengerId: string): Promise<ResolvedRidePassenger> {
  const g = await ownGuestPassenger(guestPassengerId, ownerId);
  return { riderUserId: null, guestPassengerId: g.id, guestPassengerName: g.name, requiresEscort: requiresAdultEscort(g.birthDate), womenOnlyAllowed: false };
}

export const MINOR_ESCORT_ERROR = `Para passageiro com menos de ${ADULT_AGE} anos, confirme que um adulto responsável embarca junto.`;
