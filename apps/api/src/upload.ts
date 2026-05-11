import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, open, unlink } from "fs/promises";
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

// Detects the real format from the first bytes of the stored file. Defends against
// callers that lie about Content-Type or rename a binary to look like an image —
// without this check the API would happily serve back arbitrary content from /uploads.
type MagicByteCheck = { extensions: string[]; matches: (head: Buffer) => boolean };

const startsWith = (head: Buffer, signature: number[], offset = 0) =>
  signature.every((byte, i) => head[offset + i] === byte);

const MAGIC_BYTE_CHECKS: MagicByteCheck[] = [
  { extensions: [".jpg", ".jpeg"], matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  { extensions: [".png"], matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { extensions: [".gif"], matches: (h) => h.slice(0, 6).toString("ascii") === "GIF87a" || h.slice(0, 6).toString("ascii") === "GIF89a" },
  {
    extensions: [".webp"],
    matches: (h) => h.slice(0, 4).toString("ascii") === "RIFF" && h.slice(8, 12).toString("ascii") === "WEBP"
  },
  {
    extensions: [".avif", ".heic", ".heif", ".mp4", ".mov", ".3gp"],
    // ISO base media file format — `ftyp` at offset 4. Brand is in bytes 8-11 but we
    // accept the family broadly because the same container hosts the codecs above.
    matches: (h) => h.slice(4, 8).toString("ascii") === "ftyp"
  },
  { extensions: [".webm", ".mkv"], matches: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]) }
];

async function assertMagicBytes(filePath: string, extension: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    if (bytesRead < 8) {
      throw httpError(415, "unsupported_file_type", { reason: "header_too_short" });
    }
    const match = MAGIC_BYTE_CHECKS.find((check) => check.extensions.includes(extension));
    if (!match || !match.matches(buffer)) {
      throw httpError(415, "unsupported_file_type", { reason: "magic_bytes_mismatch", extension });
    }
  } finally {
    await handle.close();
  }
}

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

  try {
    await assertMagicBytes(destination, extension);
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }

  return {
    url: `/uploads/${filename}`,
    filename,
    mimetype: file.mimetype ?? null
  };
}
