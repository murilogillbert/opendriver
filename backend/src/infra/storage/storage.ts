import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { decryptBuffer, encryptBuffer } from '../crypto.js';

/**
 * Storage PRIVADO de arquivos sensíveis (documentos do motorista, gravações).
 * Tudo é cifrado (AES-256-GCM) antes de sair do processo; o objeto guardado é
 * iv(12) + tag(16) + dados. Nada é público: leitura só pela API.
 *
 * Driver: MinIO/S3 (produção) ou disco local (dev/test, STORAGE_DRIVER=local).
 */
interface Driver {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
}

function s3Driver(): Driver {
  if (!config.storage.endpoint || !config.storage.accessKey || !config.storage.secretKey)
    throw new AppError('Envio de arquivos indisponível no momento.', 503, 'storage_unavailable');
  const client = new S3Client({
    endpoint: config.storage.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey },
  });
  const Bucket = config.storage.privateBucket;
  return {
    async put(Key, Body) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: 'application/octet-stream' }));
    },
    async get(Key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key }));
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new AppError('Arquivo não encontrado.', 404, 'not_found');
      return Buffer.from(bytes);
    },
    async del(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    },
  };
}

function localDriver(): Driver {
  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? '.storage');
  const file = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new AppError('Chave inválida.', 400);
    return p;
  };
  return {
    async put(key, body) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), body);
    },
    async get(key) {
      try {
        return await fs.readFile(file(key));
      } catch {
        throw new AppError('Arquivo não encontrado.', 404, 'not_found');
      }
    },
    async del(key) {
      await fs.rm(file(key), { force: true });
    },
  };
}

let driver: Driver | null = null;
function current(): Driver {
  if (driver) return driver;
  const mode = process.env.STORAGE_DRIVER ?? (config.isProduction ? 's3' : 'local');
  if (mode === 'local' && config.isProduction) throw new AppError('Storage local não é permitido em produção.', 500);
  driver = mode === 'local' ? localDriver() : s3Driver();
  return driver;
}

export async function putEncrypted(key: string, plain: Buffer): Promise<void> {
  const { data, iv, authTag } = encryptBuffer(plain);
  await current().put(key, Buffer.concat([Buffer.from(iv, 'base64'), Buffer.from(authTag, 'base64'), data]));
}

export async function getDecrypted(key: string): Promise<Buffer> {
  const blob = await current().get(key);
  return decryptBuffer(blob.subarray(28), blob.subarray(0, 12).toString('base64'), blob.subarray(12, 28).toString('base64'));
}

export async function deleteObject(key: string): Promise<void> {
  await current().del(key);
}

/** Tipo real do arquivo pelos magic bytes (não confia no content-type do cliente). */
export function sniff(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.subarray(4, 8).toString() === 'ftyp') {
    const brand = buf.subarray(8, 12).toString();
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'avif'].includes(brand)) return { ext: 'heic', mime: 'image/heic' }; // não aceito
    return { ext: 'm4a', mime: 'audio/mp4' }; // AAC/M4A (gravação do app)
  }
  if (buf.subarray(0, 4).toString() === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  return null;
}

/** Grava/lê bytes já cifrados pelo chamador (IV/tag guardados no banco). */
export async function rawPut(key: string, data: Buffer): Promise<void> {
  await current().put(key, data);
}

export async function rawGet(key: string): Promise<Buffer> {
  return current().get(key);
}
