import { FastifyInstance } from "fastify";
import { z } from "zod";

import { writeAuditLog } from "./audit.js";
import { ensureActivationForOrder } from "./benefits.js";
import { config } from "./config.js";
import { execute, query, sqlTypes } from "./db.js";

const orderStatusFromPayment = (paymentStatus: string) =>
  paymentStatus === "approved"
    ? "confirmado"
    : paymentStatus === "rejected"
      ? "cancelado"
      : paymentStatus === "refunded"
        ? "cancelado"
        : "pendente_pagamento";

const normalizeStatus = (status?: string | null) => {
  if (!status) return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "refunded") return "refunded";
  if (status === "cancelled" || status === "cancelled_by_user") return "cancelled";
  if (status === "in_process" || status === "pending" || status === "authorized") return "pending";
  return status;
};

const webhookBodySchema = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
    resource: z.string().optional(),
    topic: z.string().optional()
  })
  .passthrough();

async function fetchMercadoPagoPayment(paymentId: string) {
  if (!config.mercadoPago.accessToken) {
    throw Object.assign(new Error("mercado_pago_access_token_missing"), { statusCode: 500 });
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${config.mercadoPago.accessToken}`
    }
  });

  if (!response.ok) {
    throw Object.assign(new Error("mercado_pago_lookup_failed"), {
      statusCode: 502,
      details: await response.text().catch(() => null)
    });
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function processMercadoPagoPaymentUpdate(paymentId: string, eventType?: string) {
  const remote = await fetchMercadoPagoPayment(paymentId);
  const status = normalizeStatus(typeof remote.status === "string" ? remote.status : null);
  const statusDetail = typeof remote.status_detail === "string" ? remote.status_detail : null;

  const orders = await query<{ id: number; payment_status: string; status: string }>(
    `SELECT id, payment_status, status
       FROM dbo.product_orders
      WHERE mercado_pago_payment_id = @payment_id`,
    (request) => request.input("payment_id", sqlTypes.NVarChar(80), paymentId)
  );

  const order = orders[0];
  const orderId = order?.id ?? null;
  const orderStatus = orderStatusFromPayment(status);
  const paidAt = status === "approved" ? new Date() : null;

  if (order) {
    await execute(
      `UPDATE dbo.product_orders
          SET payment_status = @payment_status,
              mercado_pago_status = @mp_status,
              status = CASE
                         WHEN @payment_status = 'approved' AND status IN ('pendente_pagamento') THEN 'confirmado'
                         WHEN @payment_status IN ('rejected', 'cancelled', 'refunded') AND status = 'pendente_pagamento' THEN 'cancelado'
                         ELSE status
                       END,
              paid_at = COALESCE(paid_at, @paid_at),
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (request) =>
        request
          .input("id", sqlTypes.BigInt, order.id)
          .input("payment_status", sqlTypes.VarChar(30), status)
          .input("mp_status", sqlTypes.NVarChar(80), typeof remote.status === "string" ? remote.status : null)
          .input("paid_at", sqlTypes.DateTime2, paidAt)
    );

    if (status === "approved") {
      await ensureActivationForOrder(order.id).catch((err) => {
        console.error("ensure_activation_failed", err);
      });

      await execute(
        `INSERT INTO dbo.notifications (user_id, titulo, mensagem, canal)
           SELECT user_id, @titulo, @mensagem, 'interno'
             FROM dbo.product_orders WHERE id = @id`,
        (request) =>
          request
            .input("id", sqlTypes.BigInt, order.id)
            .input("titulo", sqlTypes.NVarChar(160), "Pagamento confirmado")
            .input(
              "mensagem",
              sqlTypes.NVarChar(700),
              "Recebemos a confirmacao do seu pagamento. Seu beneficio ja esta ativo."
            )
      );
    }
  }

  await execute(
    `INSERT INTO dbo.payment_events (
        provider, event_type, external_id, payment_id, order_id, status, status_detail, raw_payload, processed_at
      )
      VALUES (
        'mercado_pago', @event_type, @external_id, @payment_id, @order_id, @status, @status_detail, @raw_payload, SYSUTCDATETIME()
      )`,
    (request) =>
      request
        .input("event_type", sqlTypes.VarChar(60), eventType ?? null)
        .input("external_id", sqlTypes.NVarChar(80), typeof remote.id === "string" || typeof remote.id === "number" ? String(remote.id) : null)
        .input("payment_id", sqlTypes.NVarChar(80), paymentId)
        .input("order_id", sqlTypes.BigInt, orderId)
        .input("status", sqlTypes.NVarChar(40), status)
        .input("status_detail", sqlTypes.NVarChar(80), statusDetail)
        .input("raw_payload", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify(remote))
  );

  await writeAuditLog({
    actorId: null,
    action: "payment.webhook_processed",
    entityType: "product_order",
    entityId: orderId,
    payload: { paymentId, status, eventType, orderStatus }
  });

  return { orderId, status };
}

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

    // Always ack quickly; Mercado Pago will retry only on non-2xx responses.
    if (!dataId || (topic && topic !== "payment" && topic !== "payment.updated" && topic !== "payment.created")) {
      reply.code(200).send({ received: true, ignored: true });
      return;
    }

    try {
      await processMercadoPagoPaymentUpdate(String(dataId), topic);
    } catch (error) {
      app.log.error({ err: error }, "mercado_pago_webhook_failed");
      // Persist a raw event for replay even when remote lookup failed.
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
  // Mercado Pago can also call via GET notifications (legacy IPN)
  app.get("/api/webhooks/mercado-pago", handler);
}
