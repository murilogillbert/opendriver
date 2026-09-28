import { z } from 'zod';
import { config } from '../../config.js';
import { isValidLatLng } from '../../domain/geo.js';
import { AppError } from '../../errors.js';
import { escapeHtml, sendEmail } from '../../infra/email.js';
import { prisma } from '../../infra/prisma.js';
import { sendPush } from '../../infra/push.js';
import { getSetting } from '../../infra/settings.js';
import { shareRide } from '../rides/rides.service.js';

const MAX_CONTACTS = 5;
const digits = (v: string) => v.replace(/\D/g, '');

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do contato.').max(80),
  phone: z
    .string()
    .transform((v) => digits(v).replace(/^55(?=\d{10,11}$)/, ''))
    .refine((v) => v.length === 10 || v.length === 11, 'Telefone inválido. Use DDD + número.'),
});

export const emergencySchema = z.object({ lat: z.number().optional(), lng: z.number().optional() });
export const reportSchema = z.object({
  rideId: z.string().uuid().optional(),
  description: z.string().trim().min(10, 'Conte em poucas palavras o que aconteceu.').max(1000),
});

export async function listContacts(userId: string) {
  const rows = await prisma.trustedContact.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map(({ id, name, phone }) => ({ id, name, phone }));
}

export async function addContact(userId: string, input: z.infer<typeof contactSchema>) {
  if ((await prisma.trustedContact.count({ where: { userId } })) >= MAX_CONTACTS)
    throw new AppError(`Você pode ter até ${MAX_CONTACTS} contatos de confiança.`, 409, 'too_many_contacts');
  await prisma.trustedContact.create({ data: { userId, name: input.name, phone: input.phone } });
  return listContacts(userId);
}

export async function removeContact(userId: string, id: string) {
  await prisma.trustedContact.deleteMany({ where: { id, userId } });
  return listContacts(userId);
}

/** Alerta a equipe (push para admins + e-mail de plantão, se configurado). */
async function alertStaff(title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { role: 'Admin' }, select: { id: true }, take: 50 });
  await Promise.all(admins.map((a) => sendPush(a.id, { title, body, urgent: true })));
  const email = await getSetting('OpenDriver:SafetyEmail');
  if (email) await sendEmail(email, title, `<p>${escapeHtml(body)}</p>`).catch(() => undefined);
}

/**
 * Botão de emergência (RF15, UX13): registra a ocorrência com posição, avisa a
 * equipe e devolve o que o app precisa para agir em 1 toque — número 190,
 * link de acompanhamento e contatos para avisar.
 */
export async function emergency(rideId: string, userId: string, input: z.infer<typeof emergencySchema>) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  const point = input.lat !== undefined && input.lng !== undefined && isValidLatLng({ lat: input.lat, lng: input.lng }) ? input : null;
  const incident = await prisma.safetyIncident.create({
    data: { rideId, reporterId: userId, type: 'Emergency', lat: point?.lat, lng: point?.lng, description: 'Botão de emergência acionado' },
  });
  await prisma.rideEvent.create({ data: { rideId, type: 'emergency', actor: ride.passengerId === userId ? 'Passenger' : 'Driver', actorId: userId } });
  void alertStaff('🚨 Emergência numa corrida', `Ocorrência ${incident.id} na corrida ${rideId}.`);
  let shareUrl: string | null = null;
  if (ride.passengerId === userId && ['DriverAssigned', 'DriverArrived', 'InProgress'].includes(ride.status)) {
    shareUrl = (await shareRide(rideId, userId)).url;
  }
  return { incidentId: incident.id, emergencyNumber: '190', shareUrl, contacts: await listContacts(userId) };
}

export async function report(userId: string, input: z.infer<typeof reportSchema>) {
  if (input.rideId) {
    const ride = await prisma.ride.findUnique({ where: { id: input.rideId } });
    if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  }
  const incident = await prisma.safetyIncident.create({ data: { rideId: input.rideId, reporterId: userId, type: 'Report', description: input.description } });
  void alertStaff('Nova ocorrência de segurança', `Ocorrência ${incident.id}${input.rideId ? ` na corrida ${input.rideId}` : ''}.`);
  return { incidentId: incident.id };
}

/** Dados públicos mínimos do acompanhamento compartilhado (sem telefone, sem sobrenome). */
export async function trackingData(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const ride = await prisma.ride.findUnique({ where: { shareToken: token }, include: { driver: true, vehicle: true } });
  if (!ride) return null;
  const active = ['DriverAssigned', 'DriverArrived', 'InProgress'].includes(ride.status);
  const loc = active && ride.driverId ? await prisma.driverLocation.findUnique({ where: { driverId: ride.driverId } }) : null;
  const statusLabel: Record<string, string> = {
    DriverAssigned: 'Motorista a caminho do embarque',
    DriverArrived: 'Motorista no local de embarque',
    InProgress: 'Em viagem',
    Completed: 'Viagem concluída',
    Cancelled: 'Viagem cancelada',
  };
  return {
    active,
    status: statusLabel[ride.status] ?? 'Viagem encerrada',
    destination: ride.destAddress,
    driver: ride.driver ? ride.driver.name.split(' ')[0] : null,
    vehicle: ride.vehicle ? `${ride.vehicle.model} ${ride.vehicle.color} · ${ride.vehicle.plate}` : null,
    location: loc ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt } : null,
  };
}

export function trackingPage(token: string): string {
  const safe = escapeHtml(token);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Acompanhar viagem — OpenDriver</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f7f9fb;color:#1f2937}main{max-width:480px;margin:0 auto;padding:24px}
h1{font-size:20px;color:#0a1726}.card{background:#fff;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 1px 3px #0001}
.muted{color:#6b7280;font-size:14px}a.btn{display:block;text-align:center;background:#b5dc2f;color:#0a1726;font-weight:700;padding:14px;border-radius:12px;text-decoration:none}</style>
</head><body><main><h1>Acompanhamento de viagem</h1><div class="card"><div id="status">Carregando…</div><div class="muted" id="dest"></div></div>
<div class="card"><div id="driver"></div><div class="muted" id="vehicle"></div></div><a class="btn" id="map" href="#" target="_blank" rel="noopener" hidden>Ver no mapa</a>
<p class="muted">Atualiza sozinho a cada 10 segundos. Em emergência, ligue 190.</p></main>
<script>
async function load(){try{const r=await fetch('/t/${safe}/data',{cache:'no-store'});if(!r.ok){document.getElementById('status').textContent='Link inválido ou expirado.';return}
const d=await r.json();document.getElementById('status').textContent=d.status;document.getElementById('dest').textContent='Destino: '+d.destination;
document.getElementById('driver').textContent=d.driver?('Motorista: '+d.driver):'';document.getElementById('vehicle').textContent=d.vehicle||'';
const m=document.getElementById('map');if(d.location){m.hidden=false;m.href='https://www.openstreetmap.org/?mlat='+d.location.lat+'&mlon='+d.location.lng+'#map=16/'+d.location.lat+'/'+d.location.lng}else{m.hidden=true}
if(d.active)setTimeout(load,10000)}catch(e){setTimeout(load,15000)}}load();
</script></body></html>`;
}
