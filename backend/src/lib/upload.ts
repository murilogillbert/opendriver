import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { sniff } from '../infra/storage/storage.js';

/** Upload em memória com limite de tamanho; o tipo é validado pelos magic bytes. */
export function singleFile(field: string, maxBytes: number) {
  const mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single(field);
  return (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
        return next(new AppError(`Arquivo muito grande (máx. ${Math.floor(maxBytes / 1024 / 1024)} MB).`, 413, 'file_too_large'));
      if (err) return next(new AppError('Não foi possível ler o arquivo enviado.', 400, 'bad_upload'));
      next();
    });
}

export const imageUpload = singleFile('file', config.storage.maxImageBytes);

export function requireImage(req: Request): { buffer: Buffer; ext: string } {
  if (!req.file) throw new AppError('Envie uma foto.', 400, 'missing_file');
  const kind = sniff(req.file.buffer);
  if (!kind || !kind.mime.startsWith('image/') || kind.ext === 'heic')
    throw new AppError('Formato de imagem não suportado. Use JPG ou PNG.', 415, 'unsupported_file');
  return { buffer: req.file.buffer, ext: kind.ext };
}
