import { z } from 'zod';
import { AppError } from '../../errors.js';
import { decryptString } from '../../infra/crypto.js';
import { gateway } from '../../infra/payments/index.js';
import { prisma } from '../../infra/prisma.js';
import { round2 } from '../../lib/money.js';
import { withLock } from '../../lib/mutex.js';
import { customerInfo } from '../payments/customer.js';

export const tipSchema = z.object({ amount: z.number().positive().max(200) });

/**
 * Gorjeta pós-corrida (plano §11.5), opcional. Cobrada de verdade no cartão
 * salvo do passageiro (mesmo gateway da corrida) — nunca Pix, pra não
 * precisar de um fluxo assíncrono separado só pra isso. Só cai no
 * livro-caixa do motorista (DriverEarning) se a cobrança for aprovada na
 * hora; falha nunca é silenciosa.
 */
export async function tipRide(rideId: string, passengerId: string, amount: number): Promise<{ amount: number }> {
  return withLock(`tip:${rideId}`, async () => {
    const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { paymentMethod: true } });
    if (!ride || ride.passengerId !== passengerId) throw new AppError('Corrida não encontrada.', 404, 'not_found');
    if (ride.status !== 'Completed' || !ride.driverId) throw new AppError('Só é possível dar gorjeta em corridas concluídas.', 409, 'invalid_state');
    const already = await prisma.driverEarning.findFirst({ where: { rideId, type: 'Tip' } });
    if (already) throw new AppError('Você já deu gorjeta nesta corrida.', 409, 'already_tipped');
    const amt = round2(amount);
    if (amt <= 0) throw new AppError('Informe um valor válido.', 400, 'invalid_amount');
    if (amt > round2(ride.fare)) throw new AppError('A gorjeta não pode ser maior que o valor da corrida.', 400, 'amount_too_high');
    const method = ride.paymentMethod;
    if (!method || method.type !== 'Card' || !method.tokenEnc) throw new AppError('Adicione um cartão salvo para dar gorjeta.', 409, 'card_required');

    const customer = await customerInfo(passengerId);
    const reference = `tip:${rideId}:${Date.now()}`;
    const r = await gateway.chargeCard(customer, decryptString(method.tokenEnc), amt, 'Gorjeta OpenDriver', reference, '127.0.0.1');
    if (r.status !== 'paid') throw new AppError('Não foi possível cobrar a gorjeta no seu cartão. Tente de novo.', 402, 'tip_charge_failed');

    await prisma.driverEarning.create({
      data: { driverId: ride.driverId, rideId, type: 'Tip', amount: amt, description: `Gorjeta do passageiro${r.externalId ? ` — ${r.externalId}` : ''}` },
    });
    return { amount: amt };
  });
}
