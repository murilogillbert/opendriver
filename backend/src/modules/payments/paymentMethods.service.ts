import type { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { encryptString } from '../../infra/crypto.js';
import { gateway } from '../../infra/payments/index.js';
import { prisma } from '../../infra/prisma.js';
import { customerInfo } from './customer.js';

const MAX_CARDS = 5;

function luhn(n: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = Number(n[i]);
    if (dbl) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export const cardSchema = z.object({
  number: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 13 && v.length <= 19 && luhn(v), 'Número do cartão inválido.'),
  holder: z.string().trim().min(3, 'Informe o nome como está no cartão.').max(26),
  expiry: z.string().refine((v) => {
    const m = /^(\d{2})\/(\d{2})$/.exec(v.trim());
    if (!m) return false;
    const month = Number(m[1]);
    const year = 2000 + Number(m[2]);
    return month >= 1 && month <= 12 && new Date(year, month, 1).getTime() > Date.now();
  }, 'Validade inválida ou vencida (MM/AA).'),
  cvv: z.string().regex(/^\d{3,4}$/, 'Código de segurança inválido.'),
  postalCode: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length === 8, 'CEP inválido.'),
  addressNumber: z.string().trim().min(1, 'Informe o número do endereço.').max(10),
});

export function toMethodDto(m: PaymentMethod, defaultId: string | null) {
  return {
    id: m.id,
    type: m.type,
    label: m.type === 'Pix' ? 'Pix' : `${m.brand ?? 'Cartão'} •••• ${m.last4}`,
    brand: m.brand,
    last4: m.last4,
    expiry: m.expiryMonth && m.expiryYear ? `${String(m.expiryMonth).padStart(2, '0')}/${String(m.expiryYear).slice(-2)}` : null,
    isDefault: m.id === defaultId,
  };
}

/** Garante a opção Pix (sempre válida) e devolve os métodos ativos. */
async function activeMethods(userId: string): Promise<PaymentMethod[]> {
  let methods = await prisma.paymentMethod.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  if (!methods.some((m) => m.type === 'Pix')) {
    await prisma.paymentMethod.create({ data: { userId, type: 'Pix', provider: gateway.provider } });
    methods = await prisma.paymentMethod.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }
  return methods;
}

/**
 * Método padrão (UX04, UX09): o escolhido pelo usuário; senão o cartão mais
 * recente; senão Pix — nunca bloqueia o pedido de corrida.
 */
export async function resolveDefault(userId: string): Promise<PaymentMethod> {
  const methods = await activeMethods(userId);
  const profile = await prisma.passengerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  const chosen = methods.find((m) => m.id === profile.defaultPaymentMethodId);
  if (chosen) return chosen;
  const cards = methods.filter((m) => m.type === 'Card');
  return cards[cards.length - 1] ?? methods.find((m) => m.type === 'Pix')!;
}

export async function list(userId: string) {
  const methods = await activeMethods(userId);
  const def = await resolveDefault(userId);
  const profile = await prisma.passengerProfile.findUnique({ where: { userId } });
  return {
    methods: methods.map((m) => toMethodDto(m, def.id)),
    useHubCashback: profile?.useHubCashback ?? true,
  };
}

export async function addCard(userId: string, input: z.infer<typeof cardSchema>, remoteIp: string) {
  const count = await prisma.paymentMethod.count({ where: { userId, type: 'Card', deletedAt: null } });
  if (count >= MAX_CARDS) throw new AppError(`Você pode salvar até ${MAX_CARDS} cartões. Remova um para adicionar outro.`, 409, 'too_many_cards');
  const customer = await customerInfo(userId);
  const tokenized = await gateway.tokenizeCard(customer, input, remoteIp);
  const [month, year] = input.expiry.split('/').map((s) => Number(s));
  const created = await prisma.paymentMethod.create({
    data: {
      userId,
      type: 'Card',
      brand: tokenized.brand,
      last4: tokenized.last4,
      holderName: input.holder.toUpperCase(),
      expiryMonth: month,
      expiryYear: 2000 + (year ?? 0),
      tokenEnc: encryptString(tokenized.token),
      provider: gateway.provider,
    },
  });
  // Cartão recém-adicionado vira o padrão (intenção explícita do usuário).
  await prisma.passengerProfile.upsert({
    where: { userId },
    create: { userId, defaultPaymentMethodId: created.id },
    update: { defaultPaymentMethodId: created.id },
  });
  return toMethodDto(created, created.id);
}

export async function setDefault(userId: string, id: string) {
  const m = await prisma.paymentMethod.findFirst({ where: { id, userId, deletedAt: null } });
  if (!m) throw new AppError('Forma de pagamento não encontrada.', 404, 'not_found');
  await prisma.passengerProfile.upsert({ where: { userId }, create: { userId, defaultPaymentMethodId: id }, update: { defaultPaymentMethodId: id } });
  return list(userId);
}

export async function remove(userId: string, id: string) {
  const m = await prisma.paymentMethod.findFirst({ where: { id, userId, deletedAt: null } });
  if (!m) throw new AppError('Forma de pagamento não encontrada.', 404, 'not_found');
  if (m.type === 'Pix') throw new AppError('O Pix fica sempre disponível e não pode ser removido.', 409, 'pix_permanent');
  const inUse = await prisma.ride.count({
    where: { paymentMethodId: id, status: { in: ['Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'] } },
  });
  if (inUse) throw new AppError('Este cartão está sendo usado numa corrida em andamento.', 409, 'in_use');
  await prisma.$transaction([
    prisma.paymentMethod.update({ where: { id }, data: { deletedAt: new Date(), tokenEnc: null } }),
    prisma.passengerProfile.updateMany({ where: { userId, defaultPaymentMethodId: id }, data: { defaultPaymentMethodId: null } }),
  ]);
  return list(userId);
}

export async function setUseCashback(userId: string, useHubCashback: boolean) {
  await prisma.passengerProfile.upsert({ where: { userId }, create: { userId, useHubCashback }, update: { useHubCashback } });
  return list(userId);
}
