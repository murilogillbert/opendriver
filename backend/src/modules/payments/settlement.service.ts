import type { PaymentMethod, Ride } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { decryptString } from '../../infra/crypto.js';
import { gateway } from '../../infra/payments/index.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { d, round2 } from '../../lib/money.js';
import { withLock } from '../../lib/mutex.js';
import { customerInfo } from './customer.js';

export type SettleOutcome = 'paid' | 'pending' | 'failed' | 'not_required';

/**
 * Abate o saldo de cashback do hub (public.users.cashback_balance) com trava de
 * linha e lança "Used" no extrato do hub. Devolve o valor abatido.
 */
async function useCashback(ride: Ride, amountDue: number): Promise<number> {
  if (!ride.useCashback || amountDue <= 0) return 0;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ cashback_balance: Prisma.Decimal }[]>`
      SELECT cashback_balance FROM public.users WHERE id = ${ride.passengerId}::uuid FOR UPDATE`;
    const balance = d(rows[0]?.cashback_balance ?? 0);
    const used = round2(Prisma.Decimal.min(balance, d(amountDue)));
    if (used <= 0) return 0;
    await tx.user.update({ where: { id: ride.passengerId }, data: { cashbackBalance: { decrement: used } } });
    await tx.cashbackEntry.create({
      data: { userId: ride.passengerId, type: 'Used', amount: used, description: `Corrida OpenDriver — ${ride.destAddress.slice(0, 180)}` },
    });
    // Mesma transação: uma retentativa (ou reinício do processo) nunca abate de novo.
    await tx.ride.update({ where: { id: ride.id }, data: { cashbackUsed: used, paymentStatus: 'Pending' } });
    return used;
  });
}

function amountDueOf(ride: Ride): number {
  if (ride.status === 'Completed') return round2(ride.fare);
  if (ride.status === 'Cancelled') return round2(ride.cancellationFee);
  return 0;
}

async function markStatus(rideId: string, status: 'Paid' | 'Pending' | 'Failed' | 'NotRequired') {
  await prisma.ride.update({ where: { id: rideId }, data: { paymentStatus: status } });
}

/**
 * Cobra a corrida concluída (ou a taxa de cancelamento). Idempotente e NUNCA
 * lança: falhas viram paymentStatus=Failed e o passageiro recebe a ação "pagar"
 * (UX11). `method` troca o meio de pagamento numa nova tentativa.
 */
export async function settleRide(rideId: string, opts: { method?: PaymentMethod; remoteIp?: string } = {}): Promise<SettleOutcome> {
  return withLock(`settle:${rideId}`, async () => {
    const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { paymentMethod: true } });
    if (!ride) throw new AppError('Corrida não encontrada.', 404, 'not_found');
    if (ride.paymentStatus === 'Paid' || ride.paymentStatus === 'NotRequired') return ride.paymentStatus === 'Paid' ? 'paid' : 'not_required';
    const due = amountDueOf(ride);
    if (due <= 0) {
      await markStatus(ride.id, 'NotRequired');
      return 'not_required';
    }

    // Cashback só na primeira liquidação (retentativas cobram o restante).
    const cashbackUsed = ride.paymentStatus === 'NotDue' ? await useCashback(ride, due) : round2(ride.cashbackUsed);
    const remaining = round2(d(due).minus(cashbackUsed));
    if (remaining <= 0) {
      await markStatus(ride.id, 'Paid');
      return 'paid';
    }

    const method = opts.method ?? ride.paymentMethod;
    const description = ride.status === 'Completed' ? 'Corrida OpenDriver' : 'Taxa de cancelamento OpenDriver';
    const attempt = await prisma.ridePayment.count({ where: { rideId: ride.id } });
    const reference = `ride:${ride.id}:${attempt + 1}`;
    try {
      const customer = await customerInfo(ride.passengerId);
      if (method?.type === 'Card' && method.tokenEnc) {
        const r = await gateway.chargeCard(customer, decryptString(method.tokenEnc), remaining, description, reference, opts.remoteIp ?? '127.0.0.1');
        const status = r.status === 'paid' ? 'Paid' : r.status === 'pending' ? 'Pending' : 'Failed';
        await prisma.$transaction([
          prisma.ridePayment.create({
            data: { rideId: ride.id, provider: gateway.provider, method: 'Card', amount: remaining, status, externalId: r.externalId, statusDetail: r.detail?.slice(0, 200) },
          }),
          prisma.ride.update({ where: { id: ride.id }, data: { paymentStatus: status, paymentMethodId: method.id, paymentMethodType: 'Card' } }),
        ]);
        if (status === 'Failed') await notifyPaymentFailed(ride.passengerId, ride.id);
        return status === 'Paid' ? 'paid' : status === 'Pending' ? 'pending' : 'failed';
      }
      // Pix (método escolhido, ou cartão sem token válido).
      const pix = await gateway.createPix(customer, remaining, description, reference);
      await prisma.$transaction([
        prisma.ridePayment.create({
          data: {
            rideId: ride.id,
            provider: gateway.provider,
            method: 'Pix',
            amount: remaining,
            status: 'Pending',
            externalId: pix.externalId,
            pixCopyPaste: pix.copyPaste,
            pixExpiresAt: pix.expiresAt,
          },
        }),
        prisma.ride.update({ where: { id: ride.id }, data: { paymentStatus: 'Pending', paymentMethodType: 'Pix', ...(method ? { paymentMethodId: method.id } : {}) } }),
      ]);
      return 'pending';
    } catch (err) {
      const detail = err instanceof AppError ? err.message : 'Falha ao processar o pagamento.';
      if (!config.isTest && !(err instanceof AppError)) console.error('Falha na liquidação da corrida', rideId, err);
      await prisma.$transaction([
        prisma.ridePayment.create({
          data: { rideId: ride.id, provider: gateway.provider, method: method?.type ?? 'Pix', amount: remaining, status: 'Failed', statusDetail: detail.slice(0, 200) },
        }),
        prisma.ride.update({ where: { id: ride.id }, data: { paymentStatus: 'Failed' } }),
      ]);
      await notifyPaymentFailed(ride.passengerId, ride.id);
      return 'failed';
    }
  });
}

async function notifyPaymentFailed(userId: string, rideId: string) {
  await sendPush(userId, { title: 'Pagamento não concluído', body: 'Não conseguimos cobrar sua corrida. Toque para escolher outra forma de pagamento.', data: { rideId } });
}

/** Confere no gateway um pagamento pendente (webhook, job ou consulta do app). */
export async function syncRidePayment(paymentId: string): Promise<'paid' | 'pending' | 'failed'> {
  const p = await prisma.ridePayment.findUnique({ where: { id: paymentId } });
  if (!p || !p.externalId) return 'failed';
  if (p.status === 'Paid') return 'paid';
  if (p.status !== 'Pending') return 'failed';
  const status = await gateway.status(p.externalId);
  if (status === 'paid') {
    await prisma.$transaction([
      prisma.ridePayment.update({ where: { id: p.id }, data: { status: 'Paid' } }),
      prisma.ride.updateMany({ where: { id: p.rideId, paymentStatus: { in: ['Pending', 'Failed'] } }, data: { paymentStatus: 'Paid' } }),
    ]);
    return 'paid';
  }
  const expired = p.pixExpiresAt && p.pixExpiresAt.getTime() < Date.now();
  if (status === 'failed' || status === 'refunded' || expired) {
    await prisma.$transaction([
      prisma.ridePayment.update({ where: { id: p.id }, data: { status: status === 'refunded' ? 'Refunded' : 'Failed', statusDetail: expired ? 'Pix expirado' : status } }),
      prisma.ride.updateMany({ where: { id: p.rideId, paymentStatus: 'Pending' }, data: { paymentStatus: 'Failed' } }),
    ]);
    return 'failed';
  }
  return 'pending';
}

export async function latestPendingPix(rideId: string) {
  return prisma.ridePayment.findFirst({ where: { rideId, method: 'Pix', status: 'Pending' }, orderBy: { createdAt: 'desc' } });
}
