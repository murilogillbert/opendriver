import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors.js';
import { brandOf, type ChargeStatus, type PaymentGateway } from './types.js';

/**
 * Gateway local para desenvolvimento/testes (bloqueado em produção).
 * - Cartão terminado em 0002 é recusado na cobrança.
 * - Pix fica pendente até `approveMockPix` (webhook de teste) ser chamado.
 */
const charges = new Map<string, ChargeStatus>();
const DECLINE_SUFFIX = '0002';

export function approveMockPix(externalId: string): boolean {
  if (!charges.has(externalId)) return false;
  charges.set(externalId, 'paid');
  return true;
}

export const mockGateway: PaymentGateway = {
  provider: 'mock',
  async tokenizeCard(_customer, card) {
    const digits = card.number.replace(/\D/g, '');
    if (digits.length < 13) throw new AppError('Número do cartão inválido.', 400, 'card_invalid');
    return { token: `mock_${randomUUID()}_${digits.slice(-4)}`, brand: brandOf(digits), last4: digits.slice(-4) };
  },
  async chargeCard(_customer, token) {
    const id = `mockpay_${randomUUID()}`;
    const declined = token.endsWith(`_${DECLINE_SUFFIX}`);
    charges.set(id, declined ? 'failed' : 'paid');
    return { externalId: id, status: declined ? 'failed' : 'paid', detail: declined ? 'Cartão recusado pelo banco emissor.' : null };
  },
  async createPix(_customer, amount) {
    const id = `mockpix_${randomUUID()}`;
    charges.set(id, 'pending');
    return {
      externalId: id,
      copyPaste: `00020126580014BR.GOV.BCB.PIX0136${id.slice(-36)}5204000053039865406${amount.toFixed(2)}5802BR5910OPENDRIVER6006CUIABA62070503***6304ABCD`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    };
  },
  async status(externalId) {
    return charges.get(externalId) ?? 'pending';
  },
};
