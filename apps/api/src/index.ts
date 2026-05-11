import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "fs";
import path from "path";
import { ZodError } from "zod";

import { config } from "./config.js";
import { registerBenefitRoutes } from "./benefitRoutes.js";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerCheckinRoutes } from "./checkinRoutes.js";
import { registerEngagementRoutes } from "./engagementRoutes.js";
import { registerGeoRoutes } from "./geoRoutes.js";
import { startBackgroundJobs } from "./jobs.js";
import { registerMarketplaceRoutes } from "./marketplaceRoutes.js";
import { registerPartnerRoutes } from "./partnerRoutes.js";
import { registerPaymentWebhookRoutes } from "./paymentWebhooks.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? (config.isProduction ? "info" : "debug"),
    // Strip credentials and tokens from request/response logs. Pino's redact uses
    // glob-style paths — `*` covers a single key, `**` recurses. Anything redacted
    // is replaced with "[REDACTED]" before being emitted to stdout.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-webhook-secret']",
        "req.headers['x-opendriver-webhook-secret']",
        'req.headers["x-signature"]',
        "req.body.senha",
        "req.body.password",
        "req.body.token",
        "req.body.cpf",
        "req.body.payment_method_id",
        "req.body.cashback_amount",
        "*.password",
        "*.senha",
        "*.token",
        "*.access_token",
        "*.refresh_token"
      ],
      censor: "[REDACTED]"
    }
  },
  trustProxy: true
});

mkdirSync(config.uploadDir, { recursive: true });

// Locked-down baseline security headers. CSP is reasonably permissive because the
// SPA inlines styles via Tailwind's runtime and pulls images from /uploads and
// remote partner sites; tighten further if the asset mix stops needing it.
await app.register(helmet, {
  global: true,
  contentSecurityPolicy: config.isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "https:"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"]
        }
      }
    : false,
  // The reverse proxy already terminates TLS; let it own HSTS so we don't double up.
  strictTransportSecurity: false,
  crossOriginEmbedderPolicy: false,
  // Allow images uploaded to /uploads to be embedded across origins (admin previews, etc.).
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

await app.register(cors, {
  origin: config.corsOrigin === "*" ? true : config.corsOrigin
});

await app.register(rateLimit, {
  global: false,
  max: 200,
  timeWindow: "1 minute"
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

app.setErrorHandler((error, request, reply) => {
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

  request.log.error({ err: error }, "unhandled_error");

  return reply.code(500).send({
    error: "internal_server_error"
  });
});

await registerRoutes(app);
await registerMarketplaceRoutes(app);
await registerPaymentWebhookRoutes(app);
await registerBenefitRoutes(app);
await registerGeoRoutes(app);
await registerCheckinRoutes(app);
await registerPartnerRoutes(app);
await registerChatRoutes(app);
await registerEngagementRoutes(app);

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});

if (process.env.DISABLE_BACKGROUND_JOBS !== "1") {
  startBackgroundJobs(app.log);
}

// Graceful shutdown — give in-flight requests up to 10 s to drain before forcing exit.
const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutdown_received");
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, "shutdown_close_failed");
  } finally {
    setTimeout(() => process.exit(0), 100).unref();
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
