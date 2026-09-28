import { config } from '../../config.js';
import { asaasGateway } from './asaas.js';
import { mockGateway } from './mock.js';
import type { PaymentGateway } from './types.js';

export const gateway: PaymentGateway = config.payments.provider === 'asaas' ? asaasGateway : mockGateway;
export type { CardInput, CustomerInfo, PaymentGateway } from './types.js';
