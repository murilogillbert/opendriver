import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';

/**
 * Formato de token IDÊNTICO ao do hub (hub/backend/src/infra/auth/jwt.ts):
 * mesmo algoritmo, issuer/audience, claims e formato de refresh token. Com o
 * mesmo JWT_SECRET, tokens emitidos aqui valem no hub e vice-versa (RF11).
 * Qualquer mudança aqui precisa ser feita também no hub.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  partnerId: string | null;
}

export interface AccessTokenClaims {
  sub: string;
  name: string;
  email: string;
  role: string;
  partnerId?: string;
}

export function issueTokens(user: AuthUser): { token: string; refreshToken: string } {
  const claims: AccessTokenClaims = { sub: user.id, name: user.name, email: user.email, role: user.role };
  if (user.partnerId) claims.partnerId = user.partnerId;
  const token = jwt.sign(claims, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: config.jwt.accessTtlSeconds,
    algorithm: 'HS256',
  });
  return { token, refreshToken: createRefreshToken(user.id) };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    algorithms: ['HS256'],
  }) as AccessTokenClaims;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.jwt.secret).update(payload).digest('hex');
}

function createRefreshToken(userId: string): string {
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlSeconds * 1000).toISOString();
  const payload = `${userId}|${expiresAt}`;
  return Buffer.from(`${payload}|${sign(payload)}`, 'utf8').toString('base64');
}

/** userId do refresh token, ou null se inválido/expirado. */
export function validateRefreshToken(refreshToken: string): string | null {
  try {
    const parts = Buffer.from(refreshToken, 'base64').toString('utf8').split('|');
    if (parts.length !== 3) return null;
    const [userId, expiresAt, sig] = parts as [string, string, string];
    const expected = Buffer.from(sign(`${userId}|${expiresAt}`), 'utf8');
    const received = Buffer.from(sig, 'utf8');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    if (new Date(expiresAt).getTime() < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}
