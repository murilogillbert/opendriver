import { z } from 'zod';
import {
  DRIVER_QUICK_MESSAGE_CODES,
  PASSENGER_QUICK_MESSAGE_CODES,
  quickMessagesFor,
  type DriverQuickMessageCode,
  type PassengerQuickMessageCode,
} from '../../domain/quickMessages.js';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { realtime } from '../../realtime/bus.js';

export const sendMessageSchema = z.object({
  code: z.enum([...PASSENGER_QUICK_MESSAGE_CODES, ...DRIVER_QUICK_MESSAGE_CODES] as [string, ...string[]]),
});

async function loadParty(rideId: string, userId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { id: true, passengerId: true, driverId: true, status: true } });
  if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  const role: 'passenger' | 'driver' = ride.passengerId === userId ? 'passenger' : 'driver';
  return { ride, role };
}

/** Chat mascarado (plano §11.1) — só enquanto motorista e passageiro estão de fato pareados. */
function assertCanMessage(status: string): void {
  if (!['DriverAssigned', 'DriverArrived', 'InProgress'].includes(status))
    throw new AppError('O chat fica disponível enquanto o motorista estiver a caminho ou em viagem.', 409, 'invalid_state');
}

/** Resolve o rótulo em pt-BR a partir de quem mandou — o app nunca hard-coda (mesmo princípio do UX12). */
function labelFor(senderRole: 'passenger' | 'driver', code: string): string {
  return quickMessagesFor(senderRole).find((m) => m.code === code)?.label ?? code;
}

export async function myQuickMessages(rideId: string, userId: string) {
  const { role } = await loadParty(rideId, userId);
  return quickMessagesFor(role);
}

export async function sendMessage(rideId: string, userId: string, code: string) {
  const { ride, role } = await loadParty(rideId, userId);
  assertCanMessage(ride.status);
  const validCodes = role === 'driver' ? DRIVER_QUICK_MESSAGE_CODES : PASSENGER_QUICK_MESSAGE_CODES;
  if (!(validCodes as readonly string[]).includes(code)) throw new AppError('Mensagem inválida.', 400, 'invalid_code');

  const msg = await prisma.rideMessage.create({ data: { rideId, senderId: userId, code } });
  const otherPartyId = role === 'passenger' ? ride.driverId : ride.passengerId;
  const payload = { id: msg.id, rideId, senderRole: role, code, label: labelFor(role, code), createdAt: msg.createdAt };
  if (otherPartyId) realtime.toUser(otherPartyId, 'ride:message', payload);
  return payload;
}

export async function listMessages(rideId: string, userId: string) {
  const { ride } = await loadParty(rideId, userId);
  const rows = await prisma.rideMessage.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } });
  return rows.map((m) => {
    const senderRole: 'passenger' | 'driver' = m.senderId === ride.passengerId ? 'passenger' : 'driver';
    return {
      id: m.id,
      senderRole,
      code: m.code as PassengerQuickMessageCode | DriverQuickMessageCode,
      label: labelFor(senderRole, m.code),
      createdAt: m.createdAt,
    };
  });
}
