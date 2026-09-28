import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const handler = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.', code: 'rate_limited' });

/** Anti força-bruta nas rotas de autenticação (por IP). */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowSeconds * 1000,
  limit: config.rateLimit.authPermit,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** Limite amplo para endpoints caros (geocodificação, cotação). */
export const geoRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
