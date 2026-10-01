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

/** Upload de várias fotos de uma vez (ex.: anexos de reclamação — plano §3). */
export function multiImageUpload(field: string, maxFiles: number, maxBytes: number) {
  const mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: maxFiles } }).array(field, maxFiles);
  return (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
        return next(new AppError(`Cada foto deve ter no máximo ${Math.floor(maxBytes / 1024 / 1024)} MB.`, 413, 'file_too_large'));
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT')
        return next(new AppError(`Envie no máximo ${maxFiles} fotos.`, 413, 'too_many_files'));
      if (err) return next(new AppError('Não foi possível ler os arquivos enviados.', 400, 'bad_upload'));
      next();
    });
}

/** Valida cada arquivo recebido por multiImageUpload — só imagens de verdade (magic bytes), nunca HEIC. */
export function requireImages(req: Request): { buffer: Buffer; ext: string }[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new AppError('Envie ao menos uma foto.', 400, 'missing_file');
  return files.map((f) => {
    const kind = sniff(f.buffer);
    if (!kind || !kind.mime.startsWith('image/') || kind.ext === 'heic')
      throw new AppError('Formato de imagem não suportado. Use JPG ou PNG.', 415, 'unsupported_file');
    return { buffer: f.buffer, ext: kind.ext };
  });
}
