import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";

import { MultipartFile } from "@fastify/multipart";

import { config } from "./config.js";

const safeExtension = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  return extension.match(/^\.[a-z0-9]{1,8}$/) ? extension : "";
};

export async function saveUpload(file: MultipartFile) {
  await mkdir(config.uploadDir, { recursive: true });

  const filename = `${randomUUID()}${safeExtension(file.filename)}`;
  const destination = path.join(config.uploadDir, filename);

  await pipeline(file.file, createWriteStream(destination));

  return {
    url: `/uploads/${filename}`,
    filename
  };
}
