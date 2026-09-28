import type http from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { authFromToken, isUserActive } from '../middleware/auth.js';
import { locationSchema, updateLocation } from '../modules/driver/driver.service.js';
import { broadcastDriverLocation } from '../modules/rides/publish.js';
import { setEmitter } from './bus.js';

/**
 * Socket.IO autenticado com o MESMO JWT da API/hub. Cada usuário entra na
 * sala user:<id>. O motorista envia a posição por aqui (mais leve que HTTP a
 * cada 4 s); ela é repassada ao passageiro só nos estados em que o
 * compartilhamento é permitido (RF06).
 */
// Janela deslizante: o app manda a cada ~4 s; aceita rajadas curtas, barra inundação.
const LOCATION_WINDOW_MS = 5000;
const LOCATION_MAX_PER_WINDOW = 5;
let current: Server | null = null;

/** Encerra os sockets (deploy/reinício): os apps reconectam sozinhos na nova instância. */
export async function closeRealtime(): Promise<void> {
  const io = current;
  current = null;
  if (io) await new Promise<void>((resolve) => void io.close(() => resolve()));
}

export function attachRealtime(server: http.Server): Server {
  const io = new Server(server, {
    path: '/realtime',
    cors: { origin: config.corsOrigins },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 16_000,
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    let auth: ReturnType<typeof authFromToken>;
    try {
      auth = authFromToken(token);
    } catch {
      next(new Error('unauthorized'));
      return;
    }
    isUserActive(auth.userId)
      .then((active) => {
        if (!active) return next(new Error('unauthorized'));
        socket.data.auth = auth;
        next();
      })
      .catch(() => next(new Error('unavailable')));
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as { userId: string; role: string };
    void socket.join(`user:${auth.userId}`);

    const recent: number[] = [];
    socket.on('driver:location', async (raw: unknown, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        if (auth.role !== 'Driver') throw new Error('forbidden');
        const now = Date.now();
        while (recent.length && now - recent[0]! > LOCATION_WINDOW_MS) recent.shift();
        if (recent.length >= LOCATION_MAX_PER_WINDOW) {
          ack?.({ ok: true }); // descarta sem gravar; a próxima posição válida chega em segundos
          return;
        }
        recent.push(now);
        const loc = locationSchema.parse(raw);
        await updateLocation(auth.userId, loc);
        await broadcastDriverLocation(auth.userId, loc);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'invalid_location' });
      }
    });
  });

  current = io;
  setEmitter({
    toUser: (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload),
    toRide: (rideId, event, payload) => io.to(`ride:${rideId}`).emit(event, payload),
  });
  return io;
}
