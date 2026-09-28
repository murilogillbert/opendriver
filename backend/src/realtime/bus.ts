/**
 * Barramento de eventos de tempo real. Os serviços emitem aqui sem depender do
 * Socket.IO (testáveis e desacoplados); io.ts registra o transporte real.
 */
export type Emitter = {
  toUser(userId: string, event: string, payload: unknown): void;
  toRide(rideId: string, event: string, payload: unknown): void;
};

let emitter: Emitter = { toUser: () => undefined, toRide: () => undefined };

export function setEmitter(e: Emitter): void {
  emitter = e;
}

export const realtime = {
  toUser: (userId: string, event: string, payload: unknown) => emitter.toUser(userId, event, payload),
  toRide: (rideId: string, event: string, payload: unknown) => emitter.toRide(rideId, event, payload),
};
