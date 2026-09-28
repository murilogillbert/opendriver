import { prisma } from '../infra/prisma.js';
import { syncRidePayment } from '../modules/payments/settlement.service.js';
import { publishRide } from '../modules/rides/publish.js';

/** Confere Pix/cartões pendentes (caso o webhook não chegue) e expira Pix vencido. */
export async function reconcilePayments(): Promise<void> {
  const pending = await prisma.ridePayment.findMany({ where: { status: 'Pending', externalId: { not: null } }, take: 100, orderBy: { createdAt: 'asc' } });
  for (const p of pending) {
    const before = p.status;
    const after = await syncRidePayment(p.id);
    if (after !== 'pending' && before === 'Pending') await publishRide(p.rideId);
  }
  // Corrida marcada Pending sem cobrança registrada (processo caiu no meio): libera nova tentativa.
  const orphan = await prisma.ride.findMany({
    where: { paymentStatus: 'Pending', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) }, payments: { none: { status: 'Pending' } } },
    select: { id: true },
    take: 50,
  });
  for (const r of orphan) {
    await prisma.ride.updateMany({ where: { id: r.id, paymentStatus: 'Pending' }, data: { paymentStatus: 'Failed' } });
    await publishRide(r.id);
  }
}

let timer: NodeJS.Timeout | null = null;
export function startPaymentReconciliation(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(() => void reconcilePayments().catch((e) => console.error('Falha na reconciliação', e)), intervalMs);
  timer.unref?.();
}
