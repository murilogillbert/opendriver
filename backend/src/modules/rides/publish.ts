import { prisma } from '../../infra/prisma.js';
import { realtime } from '../../realtime/bus.js';
import { rideInclude, type RideRow, toRideDto } from './rideDto.js';

/** Envia a cada participante a SUA visão da corrida (ações e dados diferentes por papel). */
export async function publishRide(rideId: string): Promise<RideRow | null> {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: rideInclude });
  if (!ride) return null;
  realtime.toUser(ride.passengerId, 'ride:update', toRideDto(ride, ride.passengerId));
  if (ride.driverId) realtime.toUser(ride.driverId, 'ride:update', toRideDto(ride, ride.driverId));
  return ride;
}

/** Repassa a posição do motorista ao passageiro só nos estados permitidos (RF06). */
export async function broadcastDriverLocation(driverId: string, loc: { lat: number; lng: number; heading?: number | null }): Promise<void> {
  const ride = await prisma.ride.findFirst({
    where: { driverId, status: { in: ['DriverAssigned', 'DriverArrived', 'InProgress'] } },
    select: { id: true, passengerId: true },
  });
  if (ride) realtime.toUser(ride.passengerId, 'driver:location', { rideId: ride.id, lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, at: Date.now() });
}
