import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { type AccessTokenClaims, verifyAccessToken } from '../infra/auth/jwt.js';
import { prisma } from '../infra/prisma.js';

export interface AuthContext {
  userId: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function bearer(header: string | undefined): string | null {
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export function authFromToken(token: string): AuthContext {
  const claims: AccessTokenClaims = verifyAccessToken(token);
  return { userId: claims.sub, role: claims.role, name: claims.name };
}

/** Conta excluída = anonimizada com este sufixo de e-mail (ver deleteAccount). */
export const DELETED_EMAIL_SUFFIX = '@invalid.opendriver';

// JWT é sem estado: uma conta excluída ainda teria tokens válidos até expirar.
// Checa no banco (com cache curto) se o usuário continua ativo.
const ACTIVE_TTL_MS = 60_000;
const activeCache = new Map<string, { active: boolean; at: number }>();

export function markUserRevoked(userId: string): void {
  activeCache.set(userId, { active: false, at: Date.now() });
}

export async function isUserActive(userId: string): Promise<boolean> {
  const hit = activeCache.get(userId);
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.active;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const active = !!u && !u.email.endsWith(DELETED_EMAIL_SUFFIX);
  if (activeCache.size > 50_000) activeCache.clear();
  activeCache.set(userId, { active, at: Date.now() });
  return active;
}

/** Exige usuário autenticado (token do OpenDriver ou do hub — mesmo formato). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req.headers.authorization);
  if (!token) throw new AppError('Entre na sua conta para continuar.', 401, 'unauthenticated');
  let auth: AuthContext;
  try {
    auth = authFromToken(token);
  } catch {
    throw new AppError('Sua sessão expirou. Entre novamente.', 401, 'unauthenticated');
  }
  if (!(await isUserActive(auth.userId))) throw new AppError('Sua sessão expirou. Entre novamente.', 401, 'unauthenticated');
  req.auth = auth;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw new AppError('Entre na sua conta para continuar.', 401, 'unauthenticated');
    if (!roles.includes(req.auth.role)) throw new AppError('Você não tem acesso a esta área.', 403, 'forbidden');
    next();
  };
}

export function userId(req: Request): string {
  if (!req.auth) throw new AppError('Entre na sua conta para continuar.', 401, 'unauthenticated');
  return req.auth.userId;
}
