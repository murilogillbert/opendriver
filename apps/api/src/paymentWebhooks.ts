import { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "./config.js";
import { execute, sqlTypes } from "./db.js";
import { reconcileOrderPaymentStatus } from "./payments.js";

const webhookBodySchema = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
    resource: z.string().optional(),
    topic: z.string().optional()
  })
  .passthrough();

export async function registerPaymentWebhookRoutes(app: FastifyInstance) {
  const handler = async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    const queryParams = request.query as { id?: string; topic?: string; type?: string; secret?: string };
    const configuredSecret = config.mercadoPago.webhookSecret;

    if (configuredSecret) {
      const receivedSecret =
        (request.headers["x-webhook-secret"] as string | undefined) ??
        (request.headers["x-opendriver-webhook-secret"] as string | undefined) ??
        queryParams.secret;

      if (receivedSecret !== configuredSecret) {
        return reply.code(401).send({ error: "invalid_webhook_secret" });
      }
    }

    const body = webhookBodySchema.safeParse(request.body ?? {});
    const parsed = body.success ? body.data : {};
    const topic = parsed.type ?? parsed.topic ?? queryParams.type ?? queryParams.topic;
    const dataId = parsed.data?.id ?? queryParams.id;

    if (!dataId || (topic && topic !== "payment" && topic !== "payment.updated" && topic !== "payment.created")) {
      reply.code(200).send({ received: true, ignored: true });
      return;
    }

    try {
      await reconcileOrderPaymentStatus({
        paymentId: String(dataId),
        eventType: topic ?? "payment"
      });
    } catch (error) {
      app.log.error({ err: error }, "mercado_pago_webhook_failed");
      await execute(
        `INSERT INTO dbo.payment_events (provider, event_type, payment_id, raw_payload)
         VALUES ('mercado_pago', @event_type, @payment_id, @raw_payload)`,
        (req) =>
          req
            .input("event_type", sqlTypes.VarChar(60), topic ?? null)
            .input("payment_id", sqlTypes.NVarChar(80), String(dataId))
            .input("raw_payload", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify({ query: queryParams, body: request.body ?? null }))
      ).catch(() => undefined);
    }

    reply.code(200).send({ received: true });
  };

  app.post("/api/webhooks/mercado-pago", handler);
  app.get("/api/webhooks/mercado-pago", handler);
}
