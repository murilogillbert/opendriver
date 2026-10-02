import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { prisma } from '../infra/prisma.js';

/**
 * Autentica chamadas servidor-a-servidor do hub (`Authorization: Bearer <chave>`), checando os
 * escopos exigidos pela rota.
 *
 * A fonte das chaves é `public.service_api_keys`, a MESMA que o hub usa nas outras integrações:
 * uma loja de chaves só, com hash no banco, escopo e revogação pelo Admin → Chaves de API. Aqui a
 * tabela é lida, nunca escrita (`lastUsedAt` fica por conta do hub) — ver o comentário do espelho
 * em prisma/schema.prisma.
 *
 * O hash é SHA-256 do valor em texto puro, igual a `hub/backend/src/infra/auth/apiKey.ts`.
 */
export function requireApiKey(...scopes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const key = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!key) throw new AppError('Chave de API ausente.', 401, 'unauthenticated');

    const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
    const row = await prisma.serviceApiKey.findUnique({ where: { hashedKey } });
    if (!row || !row.active) throw new AppError('Chave de API inválida.', 401, 'unauthenticated');
    if (!scopes.every((s) => row.scopes.includes(s))) throw new AppError('Chave sem permissão para esta operação.', 403, 'forbidden');

    next();
  };
}
