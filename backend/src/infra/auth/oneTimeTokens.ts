import crypto from 'node:crypto';
import type { AuthTokenPurpose } from '@prisma/client';
import { prisma } from '../prisma.js';

/** Mesma tabela/semântica do hub (public.auth_tokens): só o SHA-256 é salvo,
 * então os links dos e-mails podem ser consumidos por qualquer um dos serviços. */
function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueToken(userId: string, purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.authToken.create({ data: { userId, purpose, tokenHash: hash(raw), expiresAt: new Date(Date.now() + ttlMs) } }),
  ]);
  return raw;
}

/** Consome atomicamente (evita uso duplo em requisições concorrentes). */
export async function consumeToken(raw: string, purpose: AuthTokenPurpose): Promise<string | null> {
  const now = new Date();
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < now) return null;
  const updated = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return updated.count === 1 ? row.userId : null;
}
