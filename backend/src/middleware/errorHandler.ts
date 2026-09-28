import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

/** Converte erros em { error, code } com mensagem em linguagem simples (UX11). */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    res.status(400).json({ error: issue?.message ?? 'Dados inválidos.', code: 'validation', field: issue?.path.join('.') });
    return;
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Requisição inválida.', code: 'bad_json' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Algo deu errado do nosso lado. Tente novamente em instantes.', code: 'internal' });
}
