import { AppError } from '../../errors.js';
import { getSetting } from '../settings.js';
import { brandOf, type ChargeStatus, type CustomerInfo, type PaymentGateway } from './types.js';
import { prisma } from '../prisma.js';

/**
 * Asaas (mesma conta/credenciais do hub, em public.integration_settings).
 * Cartão: tokenizado UMA vez (POST /creditCard/tokenizeCreditCard) e cobrado
 * depois só com o token — o número nunca é persistido (UX04: pagamento
 * automático ao finalizar). Pix: cobrança + QR copia-e-cola.
 */
async function api(): Promise<{ base: string; headers: Record<string, string> }> {
  const key = await getSetting('Asaas:ApiKey');
  if (!key) throw new AppError('Pagamentos indisponíveis no momento.', 503, 'payments_unavailable');
  const env = await getSetting('Asaas:Environment');
  return {
    base: (env ?? '').toLowerCase() === 'production' ? 'https://api.asaas.com/v3/' : 'https://api-sandbox.asaas.com/v3/',
    headers: { access_token: key, 'User-Agent': 'OpenDriver', 'Content-Type': 'application/json' },
  };
}

async function request(method: string, path: string, body?: unknown): Promise<{ ok: boolean; json: Record<string, any> }> {
  const { base, headers } = await api();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new AppError('Não conseguimos falar com o meio de pagamento. Tente de novo.', 503, 'payments_unavailable');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { ok: res.ok, json };
}

const errorOf = (json: Record<string, any>) => json?.errors?.[0]?.description ?? 'falha na comunicação com o meio de pagamento';

export function mapAsaasStatus(s: string | undefined): ChargeStatus {
  if (s === 'RECEIVED' || s === 'CONFIRMED' || s === 'RECEIVED_IN_CASH') return 'paid';
  if (s === 'REFUNDED' || s === 'REFUND_REQUESTED' || s === 'REFUND_IN_PROGRESS' || s === 'CHARGEBACK_REQUESTED') return 'refunded';
  if (s === 'OVERDUE' || s === 'DELETED') return 'failed';
  return 'pending';
}

/** Um cliente Asaas por usuário (o hub cria um por pedido; aqui reaproveitamos). */
async function customerId(c: CustomerInfo): Promise<string> {
  const cached = await prisma.asaasCustomer.findUnique({ where: { userId: c.userId } });
  if (cached) return cached.customerId;
  if (!c.cpf) throw new AppError('Informe seu CPF no perfil para pagar com cartão ou Pix.', 400, 'cpf_required');
  const { ok, json } = await request('POST', 'customers', {
    name: c.name,
    email: c.email,
    cpfCnpj: c.cpf,
    mobilePhone: c.phone ?? undefined,
    externalReference: `od-user:${c.userId}`,
    notificationDisabled: true,
  });
  if (!ok || !json.id) throw new AppError(`Não foi possível cadastrar seus dados de pagamento: ${errorOf(json)}`, 502, 'payments_error');
  await prisma.asaasCustomer.upsert({ where: { userId: c.userId }, create: { userId: c.userId, customerId: json.id }, update: {} });
  return json.id as string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const asaasGateway: PaymentGateway = {
  provider: 'asaas',
  async tokenizeCard(c, card, remoteIp) {
    const customer = await customerId(c);
    const [month, yearRaw] = card.expiry.split('/').map((s) => s.trim());
    const year = yearRaw?.length === 2 ? `20${yearRaw}` : yearRaw;
    const { ok, json } = await request('POST', 'creditCard/tokenizeCreditCard', {
      customer,
      creditCard: { holderName: card.holder, number: card.number.replace(/\D/g, ''), expiryMonth: month, expiryYear: year, ccv: card.cvv },
      creditCardHolderInfo: {
        name: card.holder,
        email: c.email,
        cpfCnpj: c.cpf,
        postalCode: card.postalCode.replace(/\D/g, ''),
        addressNumber: card.addressNumber,
        mobilePhone: c.phone ?? undefined,
      },
      remoteIp,
    });
    if (!ok || !json.creditCardToken) throw new AppError(`Cartão não aceito: ${errorOf(json)}`, 400, 'card_declined');
    const number = card.number.replace(/\D/g, '');
    return { token: json.creditCardToken as string, brand: (json.creditCardBrand as string) ?? brandOf(number), last4: (json.creditCardNumber as string)?.slice(-4) ?? number.slice(-4) };
  },
  async chargeCard(c, cardToken, amount, description, externalReference, remoteIp) {
    const customer = await customerId(c);
    const { ok, json } = await request('POST', 'payments', {
      customer,
      billingType: 'CREDIT_CARD',
      value: amount,
      dueDate: today(),
      description,
      externalReference,
      creditCardToken: cardToken,
      remoteIp,
    });
    if (!ok) return { externalId: null, status: 'failed', detail: errorOf(json) };
    return { externalId: json.id as string, status: mapAsaasStatus(json.status), detail: json.status ?? null };
  },
  async createPix(c, amount, description, externalReference) {
    const customer = await customerId(c);
    const created = await request('POST', 'payments', { customer, billingType: 'PIX', value: amount, dueDate: today(), description, externalReference });
    if (!created.ok || !created.json.id) throw new AppError(`Não foi possível gerar o Pix: ${errorOf(created.json)}`, 502, 'payments_error');
    const qr = await request('GET', `payments/${created.json.id}/pixQrCode`);
    if (!qr.ok || !qr.json.payload) throw new AppError('Não foi possível gerar o QR Code do Pix.', 502, 'payments_error');
    return {
      externalId: created.json.id as string,
      copyPaste: qr.json.payload as string,
      expiresAt: qr.json.expirationDate ? new Date(qr.json.expirationDate) : new Date(Date.now() + 30 * 60_000),
    };
  },
  async status(externalId) {
    const { ok, json } = await request('GET', `payments/${encodeURIComponent(externalId)}`);
    return ok ? mapAsaasStatus(json.status) : 'pending';
  },
};
