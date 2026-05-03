import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "fs";
import path from "path";
import { ZodError } from "zod";

import { config } from "./config.js";
import { registerBenefitRoutes } from "./benefitRoutes.js";
import { registerGeoRoutes } from "./geoRoutes.js";
import { registerMarketplaceRoutes } from "./marketplaceRoutes.js";
import { registerPaymentWebhookRoutes } from "./paymentWebhooks.js";
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
    fileSize: config.uploadMaxBytes
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

  const fastifyCode = (error as Error & { code?: string }).code;
  if (fastifyCode === "FST_REQ_FILE_TOO_LARGE") {
    return reply.code(413).send({
      error: "file_too_large",
      max_bytes: config.uploadMaxBytes
    });
  }
  if (fastifyCode === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
    return reply.code(415).send({ error: "invalid_multipart" });
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
await registerPaymentWebhookRoutes(app);
await registerBenefitRoutes(app);
await registerGeoRoutes(app);

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
