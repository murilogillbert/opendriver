import type { NextFunction, Request, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

export function validateBody<T>(schema: ZodType<T, ZodTypeDef, unknown>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}

/** Valida e converte a querystring; o resultado fica em res.locals.query. */
export function validateQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);
    next();
  };
}
