export interface CustomerInfo {
  userId: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
}

export interface CardInput {
  number: string;
  holder: string;
  /** MM/AA */
  expiry: string;
  cvv: string;
  postalCode: string;
  addressNumber: string;
}

export interface TokenizedCard {
  token: string;
  brand: string;
  last4: string;
}

export type ChargeStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface ChargeResult {
  externalId: string | null;
  status: ChargeStatus;
  detail: string | null;
}

export interface PixCharge {
  externalId: string;
  copyPaste: string;
  expiresAt: Date;
}

/** Contrato dos gateways (mock/asaas), escolhido por PAYMENT_PROVIDER. */
export interface PaymentGateway {
  readonly provider: 'mock' | 'asaas';
  tokenizeCard(customer: CustomerInfo, card: CardInput, remoteIp: string): Promise<TokenizedCard>;
  chargeCard(customer: CustomerInfo, cardToken: string, amount: number, description: string, externalReference: string, remoteIp: string): Promise<ChargeResult>;
  createPix(customer: CustomerInfo, amount: number, description: string, externalReference: string): Promise<PixCharge>;
  status(externalId: string): Promise<ChargeStatus>;
}

export function brandOf(number: string): string {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return 'Elo';
  if (/^(606282|3841)/.test(n)) return 'Hipercard';
  return 'Cartão';
}
