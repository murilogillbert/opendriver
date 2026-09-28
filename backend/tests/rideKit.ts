import { PrismaClient } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import { call, CNH, CPF, PASSWORD, TINY_JPEG, uniqueEmail, upload } from './helpers.js';

export const db = new PrismaClient();

export interface Actor {
  id: string;
  token: string;
  socket: Socket;
  events: { event: string; payload: any }[];
  waitFor(event: string, pred?: (p: any) => boolean, timeoutMs?: number): Promise<any>;
  close(): void;
}

export async function connect(base: string, id: string, token: string): Promise<Actor> {
  const socket = io(base, { path: '/realtime', auth: { token }, transports: ['websocket'], forceNew: true });
  const events: Actor['events'] = [];
  socket.onAny((event, payload) => events.push({ event, payload }));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return {
    id,
    token,
    socket,
    events,
    async waitFor(event, pred = () => true, timeoutMs = 8000) {
      const start = Date.now();
      let seen = 0;
      while (Date.now() - start < timeoutMs) {
        for (let i = seen; i < events.length; i++) {
          const e = events[i]!;
          if (e.event === event && pred(e.payload)) {
            events.splice(0, i + 1);
            return e.payload;
          }
        }
        seen = events.length;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`timeout esperando ${event}`);
    },
    close: () => socket.close(),
  };
}

export async function passenger(base: string, opts: { cashback?: number; card?: string } = {}) {
  const email = uniqueEmail('pax');
  const reg = await call(base, 'POST', '/auth/register', { name: 'Paula Passageira', email, password: PASSWORD, phone: '65999991111', cpf: CPF, role: 'Passenger' });
  if (reg.status !== 201) throw new Error(`cadastro falhou: ${reg.error}`);
  const id = reg.data.user.id as string;
  if (opts.cashback !== undefined) await db.user.update({ where: { id }, data: { cashbackBalance: opts.cashback } });
  if (opts.card) {
    const r = await call(base, 'POST', '/payment-methods/card', { number: opts.card, holder: 'PAULA P', expiry: '12/35', cvv: '123', postalCode: '78000-000', addressNumber: '10' }, reg.data.token);
    if (r.status !== 201) throw new Error(`cartão falhou: ${r.error}`);
  }
  return connect(base, id, reg.data.token);
}

/** Motorista aprovado, online e posicionado. */
export async function driver(base: string, at: { lat: number; lng: number }, category: 'Economy' | 'Comfort' = 'Economy') {
  const email = uniqueEmail('drv');
  const reg = await call(base, 'POST', '/auth/register', { name: 'Diego Motorista', email, password: PASSWORD, phone: '65999992222', cpf: CPF, role: 'Driver' });
  const token = reg.data.token as string;
  const id = reg.data.user.id as string;
  await call(base, 'PUT', '/driver/profile', { cnhNumber: CNH, cnhCategory: 'B', cnhExpiresAt: '2031-01-01', birthDate: '1988-03-03' }, token);
  await upload(base, '/driver/documents/cnh', token, TINY_JPEG);
  await upload(base, '/driver/documents/selfie', token, TINY_JPEG);
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const L = () => letters[Math.floor(Math.random() * letters.length)];
  const plate = `${L()}${L()}${L()}${Math.floor(Math.random() * 10)}${L()}${Math.floor(Math.random() * 90 + 10)}`;
  const v = await call(base, 'POST', '/driver/vehicles', { plate, brand: 'Chevrolet', model: 'Onix', color: 'Prata', year: 2023, category }, token);
  await upload(base, `/driver/vehicles/${v.data.id}/crlv`, token, TINY_JPEG);
  await call(base, 'POST', '/driver/submit', {}, token);
  await db.driverProfile.update({ where: { userId: id }, data: { status: 'Approved' } });
  await db.vehicle.update({ where: { id: v.data.id }, data: { status: 'Approved' } });
  const on = await call(base, 'POST', '/driver/online', {}, token);
  if (!on.data?.isOnline) throw new Error(`online falhou: ${on.error}`);
  const actor = await connect(base, id, token);
  await moveDriver(actor, at);
  return actor;
}

export async function moveDriver(d: Actor, at: { lat: number; lng: number }) {
  const r = await d.socket.timeout(5000).emitWithAck('driver:location', { lat: at.lat, lng: at.lng, heading: 0, speed: 0 });
  if (!r.ok) throw new Error('posição recusada');
}

export async function waitRide(base: string, token: string, rideId: string, pred: (r: any) => boolean, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await call(base, 'GET', `/rides/${rideId}`, undefined, token);
    if (pred(r.data)) return r.data;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('corrida não chegou ao estado esperado');
}

export async function offline(base: string, ...drivers: Actor[]) {
  for (const d of drivers) {
    await call(base, 'POST', '/driver/offline', {}, d.token);
    d.close();
  }
}
