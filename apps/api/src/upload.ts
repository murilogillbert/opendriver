import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";

import { MultipartFile } from "@fastify/multipart";

import { config } from "./config.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/3gpp": ".3gp"
};

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".3gp"
]);

const httpError = (statusCode: number, message: string, extra?: Record<string, unknown>) =>
  Object.assign(new Error(message), { statusCode, ...(extra ?? {}) });

const safeExtensionFromName = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : "";
};

const resolveExtension = (file: MultipartFile) => {
  const fromMime = MIME_EXTENSION[(file.mimetype ?? "").toLowerCase()];
  if (fromMime) return fromMime;

  const fromName = safeExtensionFromName(file.filename ?? "");
  if (fromName) return fromName;

  return null;
};

export async function saveUpload(file: MultipartFile) {
  const extension = resolveExtension(file);

  if (!extension) {
    throw httpError(415, "unsupported_file_type", {
      mimetype: file.mimetype ?? null,
      filename: file.filename ?? null
    });
  }

  await mkdir(config.uploadDir, { recursive: true });

  const filename = `${randomUUID()}${extension}`;
  const destination = path.join(config.uploadDir, filename);

  try {
    await pipeline(file.file, createWriteStream(destination));
  } catch (error) {
    await unlink(destination).catch(() => undefined);

    if (file.file?.truncated) {
      throw httpError(413, "file_too_large", { max_bytes: config.uploadMaxBytes });
    }

    throw error;
  }

  if (file.file?.truncated) {
    await unlink(destination).catch(() => undefined);
    throw httpError(413, "file_too_large", { max_bytes: config.uploadMaxBytes });
  }

  return {
    url: `/uploads/${filename}`,
    filename,
    mimetype: file.mimetype ?? null
  };
}
