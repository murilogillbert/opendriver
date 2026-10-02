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

/**
 * Limite por USUÁRIO (usar depois de requireAuth) para ações que custam
 * dinheiro ou acionam pessoas: evita teste de cartões roubados, spam de
 * alertas à equipe e de links. Sem usuário (não deveria acontecer), cai no IP.
 */
export function userRateLimiter(name: string, windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${(req as { auth?: { userId: string } }).auth?.userId ?? req.ip ?? 'anon'}`,
    handler,
  });
}

export const limits = {
  requestRide: userRateLimiter('ride', 60 * 60_000, 30),
  emergency: userRateLimiter('emergency', 10 * 60_000, 5),
  report: userRateLimiter('report', 60 * 60_000, 10),
  complaint: userRateLimiter('complaint', 60 * 60_000, 10),
  addCard: userRateLimiter('card', 60 * 60_000, 5),
  share: userRateLimiter('share', 60 * 60_000, 30),
  payout: userRateLimiter('payout', 60 * 60_000, 5),
  upload: userRateLimiter('upload', 60 * 60_000, 40),
  /// Chat mascarado (plano §11.1) — mensagens rápidas, mas sem permitir espamar a outra parte.
  message: userRateLimiter('message', 60_000, 20),
  /// Convite de vínculo de passageiro (corrida para terceiros): aciona outra pessoa e responde de
  /// forma genérica a e-mail inexistente, então o limite também é o que impede varrer e-mails.
  passengerInvite: userRateLimiter('passenger-invite', 60 * 60_000, 10),
};
