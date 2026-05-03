import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";

import { config } from "./config.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((origin) => origin.trim())
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "validation_error",
      issues: error.issues
    });
  }

  app.log.error(error);

  return reply.code(500).send({
    error: "internal_server_error"
  });
});

await registerRoutes(app);

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
