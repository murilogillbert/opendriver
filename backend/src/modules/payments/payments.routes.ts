import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { approveMockPix } from '../../infra/payments/mock.js';
import { prisma } from '../../infra/prisma.js';
import { getSetting } from '../../infra/settings.js';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { authRateLimiter, limits } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { publishRide } from '../rides/publish.js';
import * as methods from './paymentMethods.service.js';
import { syncRidePayment } from './settlement.service.js';

export const paymentsRouter = Router();

paymentsRouter.get('/payment-methods', requireAuth, async (req, res) => {
  res.json(envelope(await methods.list(userId(req))));
});

paymentsRouter.post('/payment-methods/card', requireAuth, authRateLimiter, limits.addCard, validateBody(methods.cardSchema), async (req, res) => {
  res.status(201).json(envelope(await methods.addCard(userId(req), req.body, req.ip ?? '127.0.0.1')));
});

paymentsRouter.put('/payment-methods/:id/default', requireAuth, async (req, res) => {
  res.json(envelope(await methods.setDefault(userId(req), z.string().uuid().parse(req.params.id))));
});

paymentsRouter.delete('/payment-methods/:id', requireAuth, async (req, res) => {
  res.json(envelope(await methods.remove(userId(req), z.string().uuid().parse(req.params.id))));
});

paymentsRouter.put('/payment-methods/preferences', requireAuth, validateBody(z.object({ useHubCashback: z.boolean() })), async (req, res) => {
  res.json(envelope(await methods.setUseCashback(userId(req), req.body.useHubCashback)));
});

async function syncByExternalId(externalId: string): Promise<string> {
  const payment = await prisma.ridePayment.findFirst({ where: { externalId }, orderBy: { createdAt: 'desc' } });
  if (!payment) return 'ignored'; // cobrança do hub (mesma conta Asaas) ou desconhecida
  const status = await syncRidePayment(payment.id);
  await publishRide(payment.rideId);
  return status;
}

/** Webhook do Asaas (mesma conta do hub: eventos que não são de corrida são ignorados). */
paymentsRouter.post('/payments/webhook/asaas', async (req, res) => {
  const expected = await getSetting('OpenDriver:AsaasWebhookToken') ?? (await getSetting('Asaas:WebhookToken'));
  if (expected) {
    const got = Buffer.from(String(req.headers['asaas-access-token'] ?? ''), 'utf8');
    const exp = Buffer.from(expected, 'utf8');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
  } else if (config.payments.webhookRequireToken) {
    res.status(503).json({ error: 'webhook_token_not_configured' });
    return;
  }
  const paymentId = req.body?.payment?.id;
  if (typeof paymentId !== 'string') {
    res.status(400).json({ error: 'missing_payment_id' });
    return;
  }
  // A confirmação vem do próprio Asaas (sync), nunca do corpo do webhook.
  res.json({ received: true, status: await syncByExternalId(paymentId) });
});

/** Só para desenvolvimento/testes com PAYMENT_PROVIDER=mock: simula o Pix pago. */
paymentsRouter.post('/payments/webhook/mock', async (req, res) => {
  if (config.isProduction || config.payments.provider !== 'mock') throw new AppError('Recurso não encontrado.', 404, 'not_found');
  const externalId = z.string().parse(req.body?.externalId);
  if (!approveMockPix(externalId)) throw new AppError('Cobrança não encontrada.', 404, 'not_found');
  res.json({ received: true, status: await syncByExternalId(externalId) });
});
