import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors.js';

/** AES-256-GCM com a chave-mestra DATA_ENCRYPTION_KEY. Em dev/test sem chave,
 * deriva uma chave fixa (NUNCA em produção — assertProductionConfig bloqueia). */
function key(): Buffer {
  const k = Buffer.from(config.dataEncryptionKey, 'base64');
  if (k.length === 32) return k;
  if (config.isProduction) throw new AppError('Chave de criptografia não configurada.', 500);
  return crypto.createHash('sha256').update('opendriver-dev-only-key').digest();
}

/** Texto → "v1:iv:tag:ciphertext" (base64). */
export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptString(payload: string): string {
  const [v, iv, tag, data] = payload.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('payload cifrado inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Binário (gravações): devolve o conteúdo cifrado + iv/tag para guardar no banco. */
export function encryptBuffer(plain: Buffer): { data: Buffer; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { data, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptBuffer(data: Buffer, iv: string, authTag: string): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
