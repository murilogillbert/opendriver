import { Router } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, requireRole, userId } from '../../middleware/auth.js';
import { geoRateLimiter, limits } from '../../middleware/rateLimit.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { acceptOffer, currentOffer, declineOffer } from './dispatch.js';
import { createQuote, quoteSchema } from './quote.service.js';
import * as rides from './rides.service.js';

export const ridesRouter = Router();
const asDriver = [requireAuth, requireRole('Driver')] as const;
const id = (v: unknown) => z.string().uuid('Corrida não encontrada.').parse(v);

// ---------- Passageiro ----------
ridesRouter.post('/rides/quote', requireAuth, geoRateLimiter, validateBody(quoteSchema), async (req, res) => {
  res.json(envelope(await createQuote(userId(req), req.body)));
});

ridesRouter.post('/rides', requireAuth, limits.requestRide, validateBody(rides.requestSchema), async (req, res) => {
  res.status(201).json(envelope(await rides.requestRide(userId(req), req.body)));
});

ridesRouter.get('/rides/active', requireAuth, async (req, res) => {
  res.json(envelope(await rides.activeRide(userId(req))));
});

ridesRouter.get(
  '/rides',
  requireAuth,
  validateQuery(z.object({ role: z.enum(['passenger', 'driver']).default('passenger'), cursor: z.string().uuid().optional() })),
  async (req, res) => {
    const q = res.locals.query as { role: 'passenger' | 'driver'; cursor?: string };
    res.json(envelope(await rides.history(userId(req), q.role, q.cursor)));
  },
);

ridesRouter.get('/rides/:id', requireAuth, async (req, res) => {
  res.json(envelope(await rides.getRide(id(req.params.id), userId(req))));
});

ridesRouter.post('/rides/:id/cancel', requireAuth, validateBody(rides.cancelSchema), async (req, res) => {
  res.json(envelope(await rides.cancelRide(id(req.params.id), userId(req), req.body.reason)));
});

ridesRouter.post('/rides/:id/pay', requireAuth, validateBody(rides.paySchema), async (req, res) => {
  res.json(envelope(await rides.payRide(id(req.params.id), userId(req), req.body.paymentMethodId, req.ip ?? '127.0.0.1')));
});

ridesRouter.post('/rides/:id/rating', requireAuth, validateBody(rides.ratingSchema), async (req, res) => {
  res.json(envelope(await rides.rateRide(id(req.params.id), userId(req), req.body)));
});

ridesRouter.post('/rides/:id/share', requireAuth, limits.share, async (req, res) => {
  res.json(envelope(await rides.shareRide(id(req.params.id), userId(req))));
});

// ---------- Motorista ----------
ridesRouter.get('/driver/offers/current', ...asDriver, async (req, res) => {
  res.json(envelope(await currentOffer(userId(req))));
});

ridesRouter.post('/driver/offers/:offerId/accept', ...asDriver, async (req, res) => {
  const rideId = await acceptOffer(z.string().uuid().parse(req.params.offerId), userId(req));
  res.json(envelope(await rides.getRide(rideId, userId(req))));
});

ridesRouter.post('/driver/offers/:offerId/decline', ...asDriver, async (req, res) => {
  await declineOffer(z.string().uuid().parse(req.params.offerId), userId(req));
  res.status(204).send();
});

ridesRouter.get('/rides/:id/pickup-route', ...asDriver, geoRateLimiter, async (req, res) => {
  res.json(envelope(await rides.pickupRoute(id(req.params.id), userId(req))));
});

ridesRouter.post('/rides/:id/arrived', ...asDriver, async (req, res) => {
  res.json(envelope(await rides.markArrived(id(req.params.id), userId(req))));
});

ridesRouter.post('/rides/:id/start', ...asDriver, async (req, res) => {
  res.json(envelope(await rides.startRide(id(req.params.id), userId(req))));
});

ridesRouter.post('/rides/:id/finish', ...asDriver, async (req, res) => {
  res.json(envelope(await rides.finishRide(id(req.params.id), userId(req))));
});
