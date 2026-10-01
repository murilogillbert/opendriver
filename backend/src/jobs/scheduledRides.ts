import { config } from '../config.js';
import { prisma } from '../infra/prisma.js';
import { dispatch } from '../modules/rides/dispatch.js';
import { publishRide } from '../modules/rides/publish.js';

/**
 * Promove corridas agendadas (plano §5) de `Scheduled` para `Searching` quando
 * faltar `SCHEDULE_DISPATCH_LEAD_MINUTES` para o horário marcado, e dispara o
 * despacho normal (dispatch.ts já sabe dar a janela exclusiva ao motorista
 * favorito, quando houver um escolhido).
 */
export async function promoteScheduledRides(): Promise<void> {
  const due = await prisma.ride.findMany({
    where: { status: 'Scheduled', scheduledAt: { lte: new Date(Date.now() + config.scheduled.dispatchLeadMinutes * 60_000) } },
    select: { id: true },
    take: 50,
  });
  for (const r of due) {
    const updated = await prisma.ride.updateMany({ where: { id: r.id, status: 'Scheduled' }, data: { status: 'Searching' } });
    if (!updated.count) continue; // outra instância já promoveu
    await prisma.rideEvent.create({ data: { rideId: r.id, type: 'scheduled_promoted', actor: 'System' } });
    await publishRide(r.id);
    await dispatch(r.id);
  }
}

let timer: NodeJS.Timeout | null = null;
export function startScheduledRidesSweeper(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => void promoteScheduledRides().catch((err) => console.error('Falha ao promover corridas agendadas', err)), intervalMs);
  timer.unref?.();
}

export function stopScheduledRidesSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
