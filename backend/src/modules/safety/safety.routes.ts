import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as safety from './safety.service.js';
import { limits } from '../../middleware/rateLimit.js';

export const safetyRouter = Router();

safetyRouter.get('/me/trusted-contacts', requireAuth, async (req, res) => {
  res.json(envelope(await safety.listContacts(userId(req))));
});
safetyRouter.post('/me/trusted-contacts', requireAuth, validateBody(safety.contactSchema), async (req, res) => {
  res.status(201).json(envelope(await safety.addContact(userId(req), req.body)));
});
safetyRouter.delete('/me/trusted-contacts/:id', requireAuth, async (req, res) => {
  res.json(envelope(await safety.removeContact(userId(req), z.string().uuid().parse(req.params.id))));
});
safetyRouter.post('/rides/:id/emergency', requireAuth, limits.emergency, validateBody(safety.emergencySchema), async (req, res) => {
  res.json(envelope(await safety.emergency(z.string().uuid().parse(req.params.id), userId(req), req.body)));
});
safetyRouter.post('/safety/incidents', requireAuth, limits.report, validateBody(safety.reportSchema), async (req, res) => {
  res.status(201).json(envelope(await safety.report(userId(req), req.body)));
});

/** Página pública de acompanhamento (fora de /api/v1, link curto /t/:token). */
export const trackingRouter = Router();
const trackingLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

trackingRouter.get('/t/:token', trackingLimiter, (req, res) => {
  if (!safety.isTrackingToken(String(req.params.token))) {
    res.status(404).type('text').send('Link inválido.');
    return;
  }
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(safety.trackingPage(String(req.params.token)));
});

trackingRouter.get('/t/:token/data', trackingLimiter, async (req, res) => {
  const data = await safety.trackingData(String(req.params.token));
  res.setHeader('Cache-Control', 'no-store');
  if (!data) {
    res.status(404).json({ error: 'Link inválido ou expirado.' });
    return;
  }
  res.json(data);
});
