import { createHmac, timingSafeEqual } from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "./config.js";
import { execute, query, sqlTypes } from "./db.js";
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

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function parseSignatureHeader(rawHeader: string) {
  const parts = rawHeader.split(",");
  const result: { ts?: string; v1?: string } = {};
  for (const part of parts) {
    const [key, value] = part.split("=").map((piece) => piece?.trim());
    if (!key || !value) continue;
    if (key === "ts") result.ts = value;
    if (key === "v1") result.v1 = value;
  }
  return result;
}

function safeEqualHex(expected: string, received: string) {
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

type SignatureCheckResult =
  | { ok: true; mode: "hmac" | "shared_secret" | "open" }
  | { ok: false; reason: string };

function verifyMercadoPagoSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  legacySecret: string | null;
  configuredSecret: string | null;
}): SignatureCheckResult {
  const { signatureHeader, requestId, dataId, legacySecret, configuredSecret } = input;

  if (!configuredSecret) {
    return { ok: true, mode: "open" };
  }

  if (signatureHeader) {
    const parsed = parseSignatureHeader(signatureHeader);
    if (!parsed.ts || !parsed.v1) {
      return { ok: false, reason: "malformed_signature_header" };
    }

    const tsNumber = Number(parsed.ts);
    if (!Number.isFinite(tsNumber)) {
      return { ok: false, reason: "invalid_signature_timestamp" };
    }

    const tsSeconds = tsNumber > 1e12 ? Math.floor(tsNumber / 1000) : tsNumber;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
      return { ok: false, reason: "signature_timestamp_out_of_range" };
    }

    if (!dataId) {
      return { ok: false, reason: "missing_data_id_for_signature" };
    }

    const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${parsed.ts};`;
    const expected = createHmac("sha256", configuredSecret).update(manifest).digest("hex");

    if (!safeEqualHex(expected, parsed.v1)) {
      return { ok: false, reason: "signature_mismatch" };
    }

    return { ok: true, mode: "hmac" };
  }

  if (legacySecret && legacySecret === configuredSecret) {
    return { ok: true, mode: "shared_secret" };
  }

  return { ok: false, reason: "missing_signature" };
}

// Records the webhook event for idempotent processing. Returns true if this is the
// first time we see it (caller should process). Returns false if we already have a
// row for (provider, eventId) — caller should skip work and just ACK with 200.
async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string | null;
}): Promise<boolean> {
  try {
    // INSERT-then-fail on UNIQUE is the cheapest way to "claim" the event. If the
    // unique constraint fires we know another delivery is already mid-flight.
    await execute(
      `INSERT INTO dbo.webhook_events (provider, event_id, event_type)
       VALUES (@provider, @event_id, @event_type)`,
      (req) =>
        req
          .input("provider", sqlTypes.VarChar(40), input.provider)
          .input("event_id", sqlTypes.NVarChar(120), input.eventId)
          .input("event_type", sqlTypes.NVarChar(80), input.eventType)
    );
    return true;
  } catch (err) {
    // SQL Server returns error 2627 for unique key violations. Any other failure
    // is unexpected — re-throw so the caller can decide (we want a 500 in that case
    // so MP retries instead of swallowing a real error).
    const code = (err as { number?: number; code?: string }).number ?? null;
    if (code === 2627 || code === 2601) return false;
    throw err;
  }
}

async function markWebhookEventProcessed(input: { provider: string; eventId: string; error?: string | null }) {
  await execute(
    `UPDATE dbo.webhook_events
        SET processed_at = SYSUTCDATETIME(),
            status = CASE WHEN @error IS NULL THEN 'processed' ELSE 'error' END,
            error_message = @error
      WHERE provider = @provider AND event_id = @event_id`,
    (req) =>
      req
        .input("provider", sqlTypes.VarChar(40), input.provider)
        .input("event_id", sqlTypes.NVarChar(120), input.eventId)
        .input("error", sqlTypes.NVarChar(500), input.error ?? null)
  ).catch(() => undefined);
}

export async function registerPaymentWebhookRoutes(app: FastifyInstance) {
  const handler = async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    const queryParams = request.query as { id?: string; topic?: string; type?: string; "data.id"?: string };
    const configuredSecret = config.mercadoPago.webhookSecret;

    const body = webhookBodySchema.safeParse(request.body ?? {});
    const parsed = body.success ? body.data : {};
    const topic = parsed.type ?? parsed.topic ?? queryParams.type ?? queryParams.topic;
    const dataId = parsed.data?.id ?? queryParams.id ?? queryParams["data.id"];

    const signatureHeader = (request.headers["x-signature"] as string | undefined) ?? null;
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? null;
    const legacySecret =
      (request.headers["x-webhook-secret"] as string | undefined) ??
      (request.headers["x-opendriver-webhook-secret"] as string | undefined) ??
      null;

    const verification = verifyMercadoPagoSignature({
      signatureHeader,
      requestId,
      dataId: dataId != null ? String(dataId) : null,
      legacySecret,
      configuredSecret: configuredSecret ?? null
    });

    if (!verification.ok) {
      app.log.warn({ reason: verification.reason, requestId }, "mercado_pago_webhook_rejected");
      return reply.code(401).send({ error: "invalid_webhook_signature" });
    }

    if (!dataId || (topic && topic !== "payment" && topic !== "payment.updated" && topic !== "payment.created")) {
      return reply.code(200).send({ received: true, ignored: true });
    }

    // Build a stable event id. Mercado Pago includes x-request-id on retries that
    // mirror the original delivery, so payment_id + request_id is enough to dedupe.
    const provider = "mercado_pago";
    const eventId = `${String(dataId)}:${requestId ?? "no-req-id"}`;

    let firstDelivery: boolean;
    try {
      firstDelivery = await claimWebhookEvent({ provider, eventId, eventType: topic ?? null });
    } catch (err) {
      // Failing to insert into webhook_events means the DB is unreachable. Don't ACK —
      // let MP retry rather than silently drop the event.
      app.log.error({ err, eventId }, "webhook_claim_failed");
      return reply.code(500).send({ error: "internal_error" });
    }

    // Acknowledge MP immediately so retries don't pile up while we reconcile.
    reply.code(200).send({ received: true, deduped: !firstDelivery });

    if (!firstDelivery) {
      // Check whether the previous attempt finished. If it's still pending, we still
      // skip processing — the original handler is responsible for finishing it. This
      // avoids two webhooks racing on the same order during retry storms.
      const existing = await query<{ status: string }>(
        `SELECT status FROM dbo.webhook_events WHERE provider = @provider AND event_id = @event_id`,
        (req) =>
          req
            .input("provider", sqlTypes.VarChar(40), provider)
            .input("event_id", sqlTypes.NVarChar(120), eventId)
      ).catch(() => [] as { status: string }[]);
      app.log.info({ eventId, status: existing[0]?.status ?? "unknown" }, "webhook_duplicate_skipped");
      return;
    }

    void reconcileOrderPaymentStatus({
      paymentId: String(dataId),
      eventType: topic ?? "payment"
    })
      .then(() => markWebhookEventProcessed({ provider, eventId, error: null }))
      .catch(async (error) => {
        app.log.error({ err: error, paymentId: dataId }, "mercado_pago_webhook_failed");
        await markWebhookEventProcessed({
          provider,
          eventId,
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
        });
        await execute(
          `INSERT INTO dbo.payment_events (provider, event_type, payment_id, raw_payload)
           VALUES ('mercado_pago', @event_type, @payment_id, @raw_payload)`,
          (req) =>
            req
              .input("event_type", sqlTypes.VarChar(60), topic ?? null)
              .input("payment_id", sqlTypes.NVarChar(80), String(dataId))
              .input(
                "raw_payload",
                sqlTypes.NVarChar(sqlTypes.MAX),
                JSON.stringify({ query: queryParams, body: request.body ?? null, error: String(error) })
              )
        ).catch(() => undefined);
      });
  };

  app.post("/api/webhooks/mercado-pago", handler);
  app.get("/api/webhooks/mercado-pago", handler);
}
