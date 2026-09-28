import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { type AccessTokenClaims, verifyAccessToken } from '../infra/auth/jwt.js';

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

/** Exige usuário autenticado (token do OpenDriver ou do hub — mesmo formato). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearer(req.headers.authorization);
  if (!token) throw new AppError('Entre na sua conta para continuar.', 401, 'unauthenticated');
  try {
    req.auth = authFromToken(token);
  } catch {
    throw new AppError('Sua sessão expirou. Entre novamente.', 401, 'unauthenticated');
  }
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
