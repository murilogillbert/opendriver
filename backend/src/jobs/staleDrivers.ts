import { prisma } from '../infra/prisma.js';
import { sendPush } from '../infra/push.js';

/**
 * Motorista "online" sem enviar posição há muito tempo (app encerrado pelo
 * sistema, sem internet, celular desligado) não recebe corridas de fato, mas
 * aparece como online para ele e nas métricas. Fica offline sozinho e é
 * avisado — nunca durante uma corrida.
 */
export const STALE_ONLINE_MS = 15 * 60_000;

export async function offlineStaleDrivers(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - STALE_ONLINE_MS);
  const online = await prisma.driverProfile.findMany({
    where: { isOnline: true, OR: [{ onlineSince: null }, { onlineSince: { lt: cutoff } }] },
    select: { userId: true },
    take: 500,
  });
  if (!online.length) return 0;
  const ids = online.map((d) => d.userId);
  const [fresh, busy] = await Promise.all([
    prisma.driverLocation.findMany({ where: { driverId: { in: ids }, updatedAt: { gte: cutoff } }, select: { driverId: true } }),
    prisma.ride.findMany({ where: { driverId: { in: ids }, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } }, select: { driverId: true } }),
  ]);
  const keep = new Set([...fresh.map((f) => f.driverId), ...busy.map((b) => b.driverId!)]);
  const stale = ids.filter((id) => !keep.has(id));
  if (!stale.length) return 0;
  // Condição repetida no UPDATE: não derruba quem voltou a mandar posição no meio do caminho.
  const res = await prisma.driverProfile.updateMany({ where: { userId: { in: stale }, isOnline: true }, data: { isOnline: false, onlineSince: null } });
  for (const id of stale) {
    void sendPush(id, { title: 'Você ficou offline', body: 'Não recebemos sua localização por 15 minutos. Abra o app e toque em Ficar online para voltar.' });
  }
  return res.count;
}

let timer: NodeJS.Timeout | null = null;
export function startStaleDriverSweep(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => void offlineStaleDrivers().catch((e) => console.error('Falha ao verificar motoristas sem sinal', e)), intervalMs);
  timer.unref?.();
}

export function stopStaleDriverSweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
