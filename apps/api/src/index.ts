import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "fs";
import path from "path";
import { ZodError } from "zod";

import { config } from "./config.js";
import { registerMarketplaceRoutes } from "./marketplaceRoutes.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: true
});

mkdirSync(config.uploadDir, { recursive: true });

await app.register(cors, {
  origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((origin) => origin.trim())
});

await app.register(multipart, {
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

await app.register(fastifyStatic, {
  root: path.resolve(config.uploadDir),
  prefix: "/uploads/"
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "validation_error",
      issues: error.issues
    });
  }

  const statusCode = (error as Error & { statusCode?: number }).statusCode;

  if (statusCode) {
    return reply.code(statusCode).send({
      error: error.message
    });
  }

  app.log.error(error);

  return reply.code(500).send({
    error: "internal_server_error"
  });
});

await registerRoutes(app);
await registerMarketplaceRoutes(app);

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
