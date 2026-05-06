import { randomBytes } from "crypto";

import { writeAuditLog } from "./audit.js";
import { ensureActivationForOrder } from "./benefits.js";
import { config } from "./config.js";
import { execute, query, sqlTypes } from "./db.js";

export type MercadoPagoPaymentRecord = Record<string, unknown>;

export type PaymentSyncResult = {
  orderId: number | null;
  paymentId: string | null;
  paymentReference: string | null;
  paymentStatus: string;
  gatewayStatus: string | null;
  statusDetail: string | null;
  orderStatus: string | null;
  voucherCode: string | null;
  paidAt: string | null;
};

type OrderPaymentRow = {
  id: number;
  user_id: number;
  product_id: number;
  product_name: string;
  tipo_entrega: "digital" | "fisico";
  voucher_code: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  mercado_pago_payment_id: string | null;
  mercado_pago_status: string | null;
  paid_at: Date | null;
  status: string;
  offer_type: string | null;
  delivery_method: string | null;
  limite_resgates: number | null;
  valor_pago_total: number;
};

const paymentApprovedStatuses = new Set(["approved"]);
const paymentCancelledStatuses = new Set(["rejected", "cancelled", "refunded"]);

export function sanitizeMercadoPagoToken(raw: string) {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code <= 0x7e;
    })
    .join("");
}

function getMercadoPagoAccessToken() {
  const token = sanitizeMercadoPagoToken(config.mercadoPago.accessToken ?? "");
  if (!token) {
    throw Object.assign(new Error("mercado_pago_access_token_missing"), { statusCode: 500 });
  }

  return token;
}

export function normalizeMercadoPagoStatus(status?: string | null) {
  if (!status) return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "refunded" || status === "charged_back") return "refunded";
  if (status === "cancelled" || status === "cancelled_by_user") return "cancelled";
  if (status === "in_process" || status === "pending" || status === "authorized") return "pending";
  return status;
}

export function paymentStatusToOrderStatus(paymentStatus: string) {
  if (paymentStatus === "approved") return "confirmado";
  if (paymentCancelledStatuses.has(paymentStatus)) return "cancelado";
  return "pendente_pagamento";
}

export function generatePaymentReference(userId: number, productId: number) {
  return `DH-${userId}-${productId}-${Date.now().toString(36)}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function generateVoucherCode() {
  return `OD-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createMercadoPagoPayment(body: unknown) {
  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomBytes(16).toString("hex")
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json()) as MercadoPagoPaymentRecord;

  if (!response.ok) {
    throw Object.assign(new Error("mercado_pago_payment_failed"), {
      statusCode: 502,
      details: data
    });
  }

  return data;
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`
    }
  });

  if (!response.ok) {
    throw Object.assign(new Error("mercado_pago_lookup_failed"), {
      statusCode: 502,
      details: await response.text().catch(() => null)
    });
  }

  return (await response.json()) as MercadoPagoPaymentRecord;
}

export async function findMercadoPagoPaymentByExternalReference(externalReference: string) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(externalReference)}`,
    {
      headers: {
        Authorization: `Bearer ${getMercadoPagoAccessToken()}`
      }
    }
  );

  if (!response.ok) {
    throw Object.assign(new Error("mercado_pago_search_failed"), {
      statusCode: 502,
      details: await response.text().catch(() => null)
    });
  }

  const data = (await response.json()) as { results?: MercadoPagoPaymentRecord[] };
  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0) {
    return null;
  }

  return (
    results.find((item) => normalizeMercadoPagoStatus(typeof item.status === "string" ? item.status : null) === "approved") ??
    results[0]
  );
}

export async function recordPaymentTransaction(input: {
  orderId: number;
  userId: number;
  productId: number;
  externalReference: string | null;
  externalPaymentId: string | null;
  paymentMethod: string | null;
  amount: number;
  status: string;
  statusDetail: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
}) {
  await execute(
    `INSERT INTO dbo.payment_transactions (
        order_id, user_id, product_id, provider, external_reference, external_payment_id,
        payment_method, amount, status, status_detail, request_payload, response_payload, last_synced_at
      )
      VALUES (
        @order_id, @user_id, @product_id, 'mercado_pago', @external_reference, @external_payment_id,
        @payment_method, @amount, @status, @status_detail, @request_payload, @response_payload, SYSUTCDATETIME()
      )`,
    (request) =>
      request
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("product_id", sqlTypes.BigInt, input.productId)
        .input("external_reference", sqlTypes.NVarChar(120), input.externalReference)
        .input("external_payment_id", sqlTypes.NVarChar(80), input.externalPaymentId)
        .input("payment_method", sqlTypes.VarChar(30), input.paymentMethod)
        .input("amount", sqlTypes.Decimal(12, 2), input.amount)
        .input("status", sqlTypes.VarChar(30), input.status)
        .input("status_detail", sqlTypes.NVarChar(120), input.statusDetail)
        .input(
          "request_payload",
          sqlTypes.NVarChar(sqlTypes.MAX),
          input.requestPayload === undefined ? null : JSON.stringify(input.requestPayload)
        )
        .input(
          "response_payload",
          sqlTypes.NVarChar(sqlTypes.MAX),
          input.responsePayload === undefined ? null : JSON.stringify(input.responsePayload)
        )
  );
}

async function updatePaymentTransactionSnapshot(input: {
  orderId: number | null;
  userId: number | null;
  productId: number | null;
  externalReference: string | null;
  externalPaymentId: string | null;
  paymentMethod: string | null;
  amount: number | null;
  status: string;
  statusDetail: string | null;
  responsePayload?: unknown;
}) {
  const existing = await query<{ id: number }>(
    `SELECT TOP 1 id
       FROM dbo.payment_transactions
      WHERE (@order_id IS NOT NULL AND order_id = @order_id)
         OR (@external_payment_id IS NOT NULL AND external_payment_id = @external_payment_id)
         OR (@external_reference IS NOT NULL AND external_reference = @external_reference)
      ORDER BY created_at DESC`,
    (request) =>
      request
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("external_payment_id", sqlTypes.NVarChar(80), input.externalPaymentId)
        .input("external_reference", sqlTypes.NVarChar(120), input.externalReference)
  );

  if (!existing[0]) {
    if (input.orderId && input.userId && input.productId && input.amount != null) {
      await recordPaymentTransaction({
        orderId: input.orderId,
        userId: input.userId,
        productId: input.productId,
        externalReference: input.externalReference,
        externalPaymentId: input.externalPaymentId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        status: input.status,
        statusDetail: input.statusDetail,
        responsePayload: input.responsePayload
      });
    }
    return;
  }

  await execute(
    `UPDATE dbo.payment_transactions
        SET order_id = COALESCE(order_id, @order_id),
            user_id = COALESCE(user_id, @user_id),
            product_id = COALESCE(product_id, @product_id),
            external_reference = COALESCE(external_reference, @external_reference),
            external_payment_id = COALESCE(external_payment_id, @external_payment_id),
            payment_method = COALESCE(payment_method, @payment_method),
            amount = COALESCE(amount, @amount),
            status = @status,
            status_detail = @status_detail,
            response_payload = COALESCE(@response_payload, response_payload),
            last_synced_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
      WHERE id = @id`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, existing[0].id)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("product_id", sqlTypes.BigInt, input.productId)
        .input("external_reference", sqlTypes.NVarChar(120), input.externalReference)
        .input("external_payment_id", sqlTypes.NVarChar(80), input.externalPaymentId)
        .input("payment_method", sqlTypes.VarChar(30), input.paymentMethod)
        .input("amount", sqlTypes.Decimal(12, 2), input.amount)
        .input("status", sqlTypes.VarChar(30), input.status)
        .input("status_detail", sqlTypes.NVarChar(120), input.statusDetail)
        .input(
          "response_payload",
          sqlTypes.NVarChar(sqlTypes.MAX),
          input.responsePayload === undefined ? null : JSON.stringify(input.responsePayload)
        )
  );
}

async function loadOrderPaymentRow(input: {
  orderId?: number | null;
  paymentId?: string | null;
  externalReference?: string | null;
}) {
  if (input.orderId) {
    const rows = await query<OrderPaymentRow>(
      `SELECT TOP 1 o.id, o.user_id, o.product_id, p.nome AS product_name, o.tipo_entrega,
              o.voucher_code, o.payment_status, o.payment_method, o.payment_reference,
              o.mercado_pago_payment_id, o.mercado_pago_status, o.paid_at, o.status,
              p.offer_type, p.delivery_method, p.limite_resgates, o.valor_pago_total
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.id = @order_id`,
      (request) => request.input("order_id", sqlTypes.BigInt, input.orderId)
    );

    return rows[0] ?? null;
  }

  if (input.paymentId) {
    const rows = await query<OrderPaymentRow>(
      `SELECT TOP 1 o.id, o.user_id, o.product_id, p.nome AS product_name, o.tipo_entrega,
              o.voucher_code, o.payment_status, o.payment_method, o.payment_reference,
              o.mercado_pago_payment_id, o.mercado_pago_status, o.paid_at, o.status,
              p.offer_type, p.delivery_method, p.limite_resgates, o.valor_pago_total
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.mercado_pago_payment_id = @payment_id
        ORDER BY o.created_at DESC`,
      (request) => request.input("payment_id", sqlTypes.NVarChar(80), input.paymentId)
    );

    return rows[0] ?? null;
  }

  if (input.externalReference) {
    const rows = await query<OrderPaymentRow>(
      `SELECT TOP 1 o.id, o.user_id, o.product_id, p.nome AS product_name, o.tipo_entrega,
              o.voucher_code, o.payment_status, o.payment_method, o.payment_reference,
              o.mercado_pago_payment_id, o.mercado_pago_status, o.paid_at, o.status,
              p.offer_type, p.delivery_method, p.limite_resgates, o.valor_pago_total
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.payment_reference = @payment_reference
        ORDER BY o.created_at DESC`,
      (request) => request.input("payment_reference", sqlTypes.NVarChar(120), input.externalReference)
    );

    return rows[0] ?? null;
  }

  return null;
}

async function loadPaymentSnapshotForOrder(orderId: number) {
  const rows = await query<{
    status_detail: string | null;
    external_reference: string | null;
    external_payment_id: string | null;
    last_synced_at: Date | null;
  }>(
    `SELECT TOP 1 status_detail, external_reference, external_payment_id, last_synced_at
       FROM dbo.payment_transactions
      WHERE order_id = @order_id
      ORDER BY created_at DESC`,
    (request) => request.input("order_id", sqlTypes.BigInt, orderId)
  );

  return rows[0] ?? null;
}

export async function reconcileOrderPaymentStatus(input: {
  orderId?: number | null;
  paymentId?: string | null;
  externalReference?: string | null;
  eventType?: string | null;
  actorId?: number | null;
}) {
  let order = await loadOrderPaymentRow(input);
  const remote =
    input.paymentId || order?.mercado_pago_payment_id
      ? await fetchMercadoPagoPayment(String(input.paymentId ?? order?.mercado_pago_payment_id))
      : input.externalReference || order?.payment_reference
        ? await findMercadoPagoPaymentByExternalReference(String(input.externalReference ?? order?.payment_reference))
        : null;

  if (!remote) {
    if (!order) {
      throw Object.assign(new Error("payment_not_found"), { statusCode: 404 });
    }

    const snapshot = await loadPaymentSnapshotForOrder(order.id);
    return {
      orderId: order.id,
      paymentId: order.mercado_pago_payment_id,
      paymentReference: order.payment_reference,
      paymentStatus: order.payment_status ?? "pending",
      gatewayStatus: order.mercado_pago_status,
      statusDetail: snapshot?.status_detail ?? null,
      orderStatus: order.status,
      voucherCode: order.voucher_code,
      paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null
    } satisfies PaymentSyncResult;
  }

  const paymentId =
    typeof remote.id === "number" || typeof remote.id === "string" ? String(remote.id) : input.paymentId ?? order?.mercado_pago_payment_id ?? null;
  const remoteStatus = typeof remote.status === "string" ? remote.status : null;
  const normalizedStatus = normalizeMercadoPagoStatus(remoteStatus);
  const statusDetail = typeof remote.status_detail === "string" ? remote.status_detail : null;
  const externalReference =
    typeof remote.external_reference === "string"
      ? remote.external_reference
      : input.externalReference ?? order?.payment_reference ?? null;

  if (!order) {
    order = await loadOrderPaymentRow({ paymentId, externalReference });
  }

  if (!order) {
    await execute(
      `INSERT INTO dbo.payment_events (
          provider, event_type, external_id, payment_id, status, status_detail, raw_payload, processed_at
        )
        VALUES (
          'mercado_pago', @event_type, @external_id, @payment_id, @status, @status_detail, @raw_payload, SYSUTCDATETIME()
        )`,
      (request) =>
        request
          .input("event_type", sqlTypes.VarChar(60), input.eventType ?? "orphan_sync")
          .input("external_id", sqlTypes.NVarChar(80), paymentId)
          .input("payment_id", sqlTypes.NVarChar(80), paymentId)
          .input("status", sqlTypes.NVarChar(40), normalizedStatus)
          .input("status_detail", sqlTypes.NVarChar(120), statusDetail)
          .input("raw_payload", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify(remote))
    );

    throw Object.assign(new Error("payment_order_not_found"), { statusCode: 404 });
  }

  const wasApproved = order.payment_status === "approved";
  const voucherCode =
    paymentApprovedStatuses.has(normalizedStatus) && !order.voucher_code && order.tipo_entrega === "digital"
      ? generateVoucherCode()
      : order.voucher_code;

  await execute(
    `UPDATE dbo.product_orders
        SET payment_status = @payment_status,
            mercado_pago_status = @mercado_pago_status,
            mercado_pago_payment_id = COALESCE(mercado_pago_payment_id, @mercado_pago_payment_id),
            payment_reference = COALESCE(payment_reference, @payment_reference),
            voucher_code = COALESCE(voucher_code, @voucher_code),
            status = CASE
                       WHEN @payment_status = 'approved' AND status = 'pendente_pagamento' THEN 'confirmado'
                       WHEN @payment_status IN ('rejected', 'cancelled', 'refunded') AND status = 'pendente_pagamento' THEN 'cancelado'
                       ELSE status
                     END,
            paid_at = CASE
                        WHEN @payment_status = 'approved' THEN COALESCE(paid_at, SYSUTCDATETIME())
                        ELSE paid_at
                      END,
            updated_at = SYSUTCDATETIME()
      WHERE id = @id`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, order.id)
        .input("payment_status", sqlTypes.VarChar(30), normalizedStatus)
        .input("mercado_pago_status", sqlTypes.NVarChar(80), remoteStatus)
        .input("mercado_pago_payment_id", sqlTypes.NVarChar(80), paymentId)
        .input("payment_reference", sqlTypes.NVarChar(120), externalReference)
        .input("voucher_code", sqlTypes.VarChar(40), voucherCode)
  );

  await updatePaymentTransactionSnapshot({
    orderId: order.id,
    userId: order.user_id,
    productId: order.product_id,
    externalReference,
    externalPaymentId: paymentId,
    paymentMethod: order.payment_method,
    amount: Number(order.valor_pago_total),
    status: normalizedStatus,
    statusDetail,
    responsePayload: remote
  });

  if (!wasApproved && paymentApprovedStatuses.has(normalizedStatus)) {
    await ensureActivationForOrder(order.id).catch((error) => {
      console.error("ensure_activation_failed", error);
    });

    await execute(
      `INSERT INTO dbo.notifications (user_id, titulo, mensagem, canal)
       VALUES (@user_id, @titulo, @mensagem, 'interno')`,
      (request) =>
        request
          .input("user_id", sqlTypes.BigInt, order.user_id)
          .input("titulo", sqlTypes.NVarChar(160), "Pagamento confirmado")
          .input(
            "mensagem",
            sqlTypes.NVarChar(700),
            `Recebemos a confirmacao do pagamento de ${order.product_name}. Seu pedido ja esta sendo liberado.`
          )
    );
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
        .input("event_type", sqlTypes.VarChar(60), input.eventType ?? "manual_sync")
        .input("external_id", sqlTypes.NVarChar(80), paymentId)
        .input("payment_id", sqlTypes.NVarChar(80), paymentId)
        .input("order_id", sqlTypes.BigInt, order.id)
        .input("status", sqlTypes.NVarChar(40), normalizedStatus)
        .input("status_detail", sqlTypes.NVarChar(120), statusDetail)
        .input("raw_payload", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify(remote))
  );

  const syncedOrder = await loadOrderPaymentRow({ orderId: order.id });
  const snapshot = await loadPaymentSnapshotForOrder(order.id);

  await writeAuditLog({
    actorId: input.actorId ?? null,
    action: "payment.sync",
    entityType: "product_order",
    entityId: order.id,
    payload: {
      eventType: input.eventType ?? "manual_sync",
      paymentId,
      externalReference,
      previousStatus: order.payment_status,
      currentStatus: normalizedStatus
    }
  });

  return {
    orderId: syncedOrder?.id ?? order.id,
    paymentId,
    paymentReference: syncedOrder?.payment_reference ?? externalReference,
    paymentStatus: syncedOrder?.payment_status ?? normalizedStatus,
    gatewayStatus: syncedOrder?.mercado_pago_status ?? remoteStatus,
    statusDetail: snapshot?.status_detail ?? statusDetail,
    orderStatus: syncedOrder?.status ?? paymentStatusToOrderStatus(normalizedStatus),
    voucherCode: syncedOrder?.voucher_code ?? voucherCode,
    paidAt: syncedOrder?.paid_at ? new Date(syncedOrder.paid_at).toISOString() : null
  } satisfies PaymentSyncResult;
}
