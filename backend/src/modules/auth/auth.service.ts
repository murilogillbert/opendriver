import type { User } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { hubDeletionBlockers, purgeHubAccount } from '../../infra/accountSync.js';
import { issueTokens, validateRefreshToken } from '../../infra/auth/jwt.js';
import { consumeToken, issueToken } from '../../infra/auth/oneTimeTokens.js';
import { hashPassword, verifyPassword } from '../../infra/auth/password.js';
import { escapeHtml, sendEmail } from '../../infra/email.js';
import { prisma } from '../../infra/prisma.js';
import { DELETED_EMAIL_SUFFIX } from '../../middleware/auth.js';
import type { Gender } from '../../domain/genderPolicy.js';
import { ratingAverage } from '../../domain/rating.js';
import { round2 } from '../../lib/money.js';
import * as accountPurge from '../account/accountPurge.service.js';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const digits = (v: string) => v.replace(/\D/g, '');

function isValidCpf(value: string): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'Senha longa demais.')
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
  .regex(/\d/, 'A senha precisa ter pelo menos um número.');

const phoneSchema = z
  .string()
  .trim()
  .refine((v) => [10, 11].includes(digits(v).length), 'Telefone inválido. Use DDD + número.');

const cpfSchema = z.string().trim().refine(isValidCpf, 'CPF inválido.');

export const registerSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(160),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(180),
  password: passwordSchema,
  phone: phoneSchema,
  cpf: cpfSchema.optional(),
  role: z.enum(['Passenger', 'Driver']),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(160),
  phone: phoneSchema,
  cpf: cpfSchema.optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Confirme com sua senha.') });

/** Formato do hub (toUserDto) — o app e o hub enxergam o mesmo usuário. */
export function toUserDto(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === 'Client' ? 'passenger' : u.role.toLowerCase(),
    phone: u.phone,
    cpf: u.cpf,
    avatarUrl: u.avatarUrl,
    emailVerifiedAt: u.emailVerifiedAt,
    cashbackBalance: round2(u.cashbackBalance),
  };
}

/**
 * Avatar padrão: **nenhuma URL**.
 *
 * Antes isto devolvia `https://api.dicebear.com/9.x/avataaars/svg?seed=<nome>`, de modo que a
 * foto de todo usuário que nunca trocou dependia de um serviço de terceiro estar no ar em tempo
 * de execução — e cada tela que lista usuários fazia uma chamada externa por linha.
 *
 * Vazio significa "sem foto", e cada cliente desenha as iniciais num círculo com cor derivada do
 * nome. A decisão e os porquês (inclusive por que não é um SVG nosso em data URI) estão em
 * `hub/backend/src/domain/avatar.ts`; a conta é a mesma nos três serviços, então o
 * comportamento tem de ser o mesmo.
 */
function avatarPadrao(): string {
  return '';
}

function build(user: User) {
  const tokens = issueTokens({ id: user.id, name: user.name, email: user.email, role: user.role, partnerId: user.partnerId });
  return { ...tokens, user: toUserDto(user) };
}

/** E-mail nunca bloqueia o fluxo que o chamou (igual ao hub). Links apontam
 * para as páginas do hub, que consomem a mesma tabela auth_tokens. */
async function sendVerificationEmail(user: Pick<User, 'id' | 'name' | 'email'>): Promise<void> {
  try {
    const raw = await issueToken(user.id, 'EmailVerification', EMAIL_VERIFICATION_TTL_MS);
    const link = `${config.hubWebUrl}/verificar-email?token=${encodeURIComponent(raw)}`;
    await sendEmail(
      user.email,
      'Confirme seu e-mail — OpenDriver',
      `<p>Olá, ${escapeHtml(user.name)}!</p><p>Confirme seu e-mail para liberar pagamentos e recebimentos:</p><p><a href="${link}">${link}</a></p><p>O link expira em 24 horas.</p>`,
    );
  } catch (err) {
    if (!config.isTest) console.warn('Falha ao enviar e-mail de verificação', err);
  }
}

export async function register(input: z.infer<typeof registerSchema>) {
  if (await prisma.user.findUnique({ where: { email: input.email } }))
    throw new AppError('Este e-mail já tem conta. Entre com sua senha ou recupere o acesso.', 409, 'email_taken');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        phone: digits(input.phone),
        cpf: input.cpf ? digits(input.cpf) : null,
        avatarUrl: avatarPadrao(),
      },
    });
    // Todo usuário pode pedir corrida; motorista ganha também o perfil de motorista.
    await tx.passengerProfile.create({ data: { userId: created.id } });
    if (input.role === 'Driver') await tx.driverProfile.create({ data: { userId: created.id } });
    return created;
  });
  await sendVerificationEmail(user);
  return build(user);
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Mesma mensagem para e-mail inexistente e senha errada (evita enumeração).
  if (!user || !(await verifyPassword(input.password, user.passwordHash)))
    throw new AppError('E-mail ou senha incorretos.', 401, 'invalid_credentials');
  await ensurePassengerProfile(user.id);
  return build(user);
}

export async function refresh(refreshToken: string) {
  const id = validateRefreshToken(refreshToken);
  if (!id) throw new AppError('Sua sessão expirou. Entre novamente.', 401, 'unauthenticated');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.email.endsWith(DELETED_EMAIL_SUFFIX)) throw new AppError('Sua sessão expirou. Entre novamente.', 401, 'unauthenticated');
  return build(user);
}

/** Usuários criados pelo hub não têm perfil de passageiro ainda. */
export async function ensurePassengerProfile(userId: string): Promise<void> {
  await prisma.passengerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function me(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { driverProfile: true, passengerProfile: true },
  });
  if (!user) throw new AppError('Conta não encontrada.', 404, 'not_found');
  const dp = user.driverProfile;
  return {
    ...toUserDto(user),
    passenger: user.passengerProfile
      ? {
          defaultPaymentMethodId: user.passengerProfile.defaultPaymentMethodId,
          useHubCashback: user.passengerProfile.useHubCashback,
          rating: ratingAverage(user.passengerProfile.ratingSum, user.passengerProfile.ratingCount),
          recordingEnabled: user.passengerProfile.recordingEnabled,
          wheelchairAccessible: user.passengerProfile.wheelchairAccessible,
          // Plano §7: o próprio usuário vê o que declarou (pra poder trocar/apagar). Nenhum DTO de
          // corrida expõe gênero — nem o motorista nem o passageiro veem o do outro lado.
          gender: user.passengerProfile.gender as Gender,
          womenOnlyPref: user.passengerProfile.womenOnlyPref,
        }
      : null,
    driver: dp
      ? {
          status: dp.status,
          isOnline: dp.isOnline,
          currentVehicleId: dp.currentVehicleId,
          hasPixKey: !!dp.pixKey,
          rating: ratingAverage(dp.ratingSum, dp.ratingCount),
          rejectionReason: dp.rejectionReason,
          gender: dp.gender as Gender,
          womenOnlyPref: dp.womenOnlyPref,
        }
      : null,
  };
}

export async function updateProfile(id: string, input: z.infer<typeof updateProfileSchema>) {
  const user = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      phone: digits(input.phone),
      ...(input.cpf ? { cpf: digits(input.cpf) } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    },
  });
  return toUserDto(user);
}

export async function changePassword(id: string, input: z.infer<typeof changePasswordSchema>) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('Conta não encontrada.', 404, 'not_found');
  if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
    throw new AppError('A senha atual está incorreta.', 400, 'wrong_password');
  if (input.currentPassword === input.newPassword)
    throw new AppError('A nova senha precisa ser diferente da atual.', 400, 'same_password');
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(input.newPassword) } });
}

export async function resendVerification(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user && !user.emailVerifiedAt) await sendVerificationEmail(user);
}

export async function confirmEmail(token: string): Promise<void> {
  const id = await consumeToken(token, 'EmailVerification');
  if (!id) throw new AppError('Este link é inválido ou expirou. Peça um novo.', 400, 'invalid_token');
  await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return; // resposta genérica, sem enumeração
  try {
    const raw = await issueToken(user.id, 'PasswordReset', PASSWORD_RESET_TTL_MS);
    const link = `${config.hubWebUrl}/redefinir-senha?token=${encodeURIComponent(raw)}`;
    await sendEmail(
      user.email,
      'Redefinir sua senha — OpenDriver',
      `<p>Olá, ${escapeHtml(user.name)}!</p><p>Para criar uma nova senha, abra o link:</p><p><a href="${link}">${link}</a></p><p>Ele expira em 1 hora. Se não foi você, ignore este e-mail.</p>`,
    );
  } catch (err) {
    if (!config.isTest) console.warn('Falha ao enviar e-mail de redefinição', err);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const id = await consumeToken(token, 'PasswordReset');
  if (!id) throw new AppError('Este link é inválido ou expirou. Peça um novo.', 400, 'invalid_token');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('Conta não encontrada.', 404, 'not_found');
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
}

/**
 * Exclusão de conta pedida pela pessoa (App Store 5.1.1(v) / Google Play). Orquestra os DOIS
 * serviços, porque a conta é a mesma nos dois: `public.users` é compartilhada, mas cada serviço é
 * dono do seu schema e dos arquivos que subiu.
 *
 * A linha de `public.users` é ANONIMIZADA, não apagada: corridas, pedidos e lançamentos fiscais
 * continuam íntegros.
 *
 * Ordem deliberada:
 *  1. senha e papel conferidos aqui;
 *  2. impedimentos somados dos dois lados (corrida em andamento aqui, voucher não resgatado lá) —
 *     se o hub não responder, a exclusão é recusada, nunca feita pela metade;
 *  3. hub apaga o lado dele;
 *  4. OpenDriver apaga o lado dele (inclui CNH, selfie e CRLV no storage) e anonimiza `users`.
 *
 * O passo 4 vem no fim porque os dois purges são idempotentes: se algo falhar no meio, a conta
 * continua viva e a pessoa pode repetir até concluir. O contrário — conta morta com dado pessoal
 * sobrando no outro schema — é o resultado que não pode acontecer.
 */
export async function deleteAccount(id: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('Conta não encontrada.', 404, 'not_found');
  if (!(await verifyPassword(password, user.passwordHash))) throw new AppError('Senha incorreta.', 400, 'wrong_password');
  if (user.partnerId || ['Partner', 'Admin', 'Financeiro'].includes(user.role))
    throw new AppError('Contas de loja ou da equipe são encerradas pelo suporte.', 409, 'managed_account');

  const blockers = [...(await accountPurge.deletionBlockers(id)), ...(await hubDeletionBlockers(id))];
  if (blockers.length) throw new AppError(`${blockers.join(' ')} Resolva antes de excluir a conta.`, 409, 'deletion_blocked');

  await purgeHubAccount(id);
  await accountPurge.purgeOpendriverAccount(id);
}
