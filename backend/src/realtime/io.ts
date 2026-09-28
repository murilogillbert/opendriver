import type http from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { authFromToken } from '../middleware/auth.js';
import { locationSchema, updateLocation } from '../modules/driver/driver.service.js';
import { broadcastDriverLocation } from '../modules/rides/publish.js';
import { setEmitter } from './bus.js';

/**
 * Socket.IO autenticado com o MESMO JWT da API/hub. Cada usuário entra na
 * sala user:<id>. O motorista envia a posição por aqui (mais leve que HTTP a
 * cada 4 s); ela é repassada ao passageiro só nos estados em que o
 * compartilhamento é permitido (RF06).
 */
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
    try {
      socket.data.auth = authFromToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as { userId: string; role: string };
    void socket.join(`user:${auth.userId}`);

    socket.on('driver:location', async (raw: unknown, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        if (auth.role !== 'Driver') throw new Error('forbidden');
        const loc = locationSchema.parse(raw);
        await updateLocation(auth.userId, loc);
        await broadcastDriverLocation(auth.userId, loc);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'invalid_location' });
      }
    });
  });

  setEmitter({
    toUser: (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload),
    toRide: (rideId, event, payload) => io.to(`ride:${rideId}`).emit(event, payload),
  });
  return io;
}
