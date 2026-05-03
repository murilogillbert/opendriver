import { FastifyInstance } from "fastify";
import { z } from "zod";

import { writeAuditLog } from "./audit.js";
import { requireAdmin, requireUser } from "./auth.js";
import { ensureActivationForOrder } from "./benefits.js";
import { execute, query, sqlTypes } from "./db.js";

const redeemSchema = z.object({
  redemption_token: z.string().trim().min(6).max(20),
  partner_id: z.coerce.number().int().positive().optional(),
  confirmation_method: z.enum(["token", "qr", "partner", "admin", "voucher"]).default("token"),
  valor_referencia: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional()
});

type ActivationRow = {
  id: number;
  user_id: number;
  product_id: number;
  status: string;
  redemption_limit: number | null;
  redemption_count: number;
  expires_at: Date | null;
  voucher_code: string | null;
  partner_id: number | null;
  economia_estimada: number;
};

async function loadActivationByToken(token: string) {
  const rows = await query<ActivationRow>(
    `SELECT a.id, a.user_id, a.product_id, a.status, a.redemption_limit, a.redemption_count,
            a.expires_at, a.voucher_code, p.partner_id, p.economia_estimada
       FROM dbo.benefit_activations a
       JOIN dbo.products p ON p.id = a.product_id
      WHERE a.redemption_token = @token`,
    (request) => request.input("token", sqlTypes.Char(12), token.trim().toUpperCase())
  );
  return rows[0] ?? null;
}

async function createReceivableForRedemption(input: {
  partnerId: number;
  redemptionId: number;
  productOrderId: number | null;
  descricao: string;
  valor: number;
}) {
  if (input.valor <= 0) return null;

  const result = await execute<{ id: number }>(
    `INSERT INTO dbo.receivables (partner_id, redemption_id, product_order_id, descricao, valor)
     OUTPUT INSERTED.id
     VALUES (@partner_id, @redemption_id, @product_order_id, @descricao, @valor)`,
    (request) =>
      request
        .input("partner_id", sqlTypes.BigInt, input.partnerId)
        .input("redemption_id", sqlTypes.BigInt, input.redemptionId)
        .input("product_order_id", sqlTypes.BigInt, input.productOrderId ?? null)
        .input("descricao", sqlTypes.NVarChar(240), input.descricao)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
  );
  return result.recordset[0] ?? null;
}

export async function registerBenefitRoutes(app: FastifyInstance) {
  app.get("/api/benefits/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT a.id, a.product_id, a.order_id, a.voucher_code, a.redemption_token,
              a.status, a.activated_at, a.expires_at, a.redemption_limit, a.redemption_count,
              p.nome AS produto_nome, p.imagem_url, p.offer_type, p.delivery_method,
              p.usage_rules
         FROM dbo.benefit_activations a
         JOIN dbo.products p ON p.id = a.product_id
        WHERE a.user_id = @user_id
        ORDER BY a.activated_at DESC`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );
    return { data };
  });

  app.post("/api/orders/:orderId/activate-benefit", async (request, reply) => {
    const user = await requireUser(request);
    const params = request.params as { orderId: string };
    const orderId = Number(params.orderId);

    const orders = await query<{ user_id: number; payment_status: string }>(
      "SELECT user_id, payment_status FROM dbo.product_orders WHERE id = @id",
      (req) => req.input("id", sqlTypes.BigInt, orderId)
    );
    const order = orders[0];

    if (!order) return reply.code(404).send({ error: "order_not_found" });
    if (order.user_id !== user.id) return reply.code(403).send({ error: "forbidden" });
    if (order.payment_status !== "approved") {
      return reply.code(400).send({ error: "payment_not_approved" });
    }

    const activation = await ensureActivationForOrder(orderId);
    return reply.code(activation ? 201 : 200).send({ data: activation });
  });

  // Partner/admin presents a token (manually typed or QR scanned) to confirm usage.
  app.post("/api/benefits/redeem", async (request, reply) => {
    const actor = await requireUser(request);
    if (actor.tipo_usuario !== "admin" && actor.tipo_usuario !== "parceiro") {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = redeemSchema.parse(request.body);
    const activation = await loadActivationByToken(body.redemption_token);

    if (!activation) return reply.code(404).send({ error: "activation_not_found" });
    if (activation.status !== "ativo") return reply.code(409).send({ error: "activation_not_active" });
    if (activation.expires_at && new Date(activation.expires_at) < new Date()) {
      await execute(
        "UPDATE dbo.benefit_activations SET status = 'expirado', updated_at = SYSUTCDATETIME() WHERE id = @id",
        (req) => req.input("id", sqlTypes.BigInt, activation.id)
      );
      return reply.code(409).send({ error: "activation_expired" });
    }
    if (activation.redemption_limit != null && activation.redemption_count >= activation.redemption_limit) {
      return reply.code(409).send({ error: "activation_exhausted" });
    }

    const partnerId = body.partner_id ?? activation.partner_id ?? null;
    const valor = body.valor_referencia ?? Number(activation.economia_estimada ?? 0);

    const insert = await execute<{ id: number }>(
      `INSERT INTO dbo.redemptions (
          activation_id, user_id, product_id, partner_id, confirmed_by,
          confirmation_method, valor_referencia, economia_aplicada, notes
        )
        OUTPUT INSERTED.id
        VALUES (
          @activation_id, @user_id, @product_id, @partner_id, @confirmed_by,
          @method, @valor, @economia, @notes
        )`,
      (req) =>
        req
          .input("activation_id", sqlTypes.BigInt, activation.id)
          .input("user_id", sqlTypes.BigInt, activation.user_id)
          .input("product_id", sqlTypes.BigInt, activation.product_id)
          .input("partner_id", sqlTypes.BigInt, partnerId)
          .input("confirmed_by", sqlTypes.BigInt, actor.id)
          .input("method", sqlTypes.VarChar(30), body.confirmation_method)
          .input("valor", sqlTypes.Decimal(12, 2), valor)
          .input("economia", sqlTypes.Decimal(12, 2), Number(activation.economia_estimada ?? 0))
          .input("notes", sqlTypes.NVarChar(500), body.notes ?? null)
    );
    const redemptionId = insert.recordset[0].id;

    const newCount = activation.redemption_count + 1;
    const exhausted = activation.redemption_limit != null && newCount >= activation.redemption_limit;
    await execute(
      `UPDATE dbo.benefit_activations
          SET redemption_count = @count,
              status = CASE WHEN @exhausted = 1 THEN 'esgotado' ELSE status END,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, activation.id)
          .input("count", sqlTypes.Int, newCount)
          .input("exhausted", sqlTypes.Bit, exhausted ? 1 : 0)
    );

    let receivable = null;
    if (partnerId) {
      const orderRow = await query<{ id: number; produto_nome: string }>(
        `SELECT TOP 1 o.id, p.nome AS produto_nome
           FROM dbo.product_orders o
           JOIN dbo.products p ON p.id = o.product_id
          WHERE o.id = (SELECT order_id FROM dbo.benefit_activations WHERE id = @id)`,
        (req) => req.input("id", sqlTypes.BigInt, activation.id)
      );
      receivable = await createReceivableForRedemption({
        partnerId,
        redemptionId,
        productOrderId: orderRow[0]?.id ?? null,
        descricao: `Resgate ${orderRow[0]?.produto_nome ?? "beneficio"}`,
        valor
      });
    }

    await writeAuditLog({
      actorId: actor.id,
      action: "benefit.redeemed",
      entityType: "redemption",
      entityId: redemptionId,
      payload: { activation_id: activation.id, partner_id: partnerId, method: body.confirmation_method }
    });

    return reply.code(201).send({
      data: {
        redemption_id: redemptionId,
        activation_id: activation.id,
        receivable_id: receivable?.id ?? null,
        status: exhausted ? "esgotado" : "ativo"
      }
    });
  });

  app.get("/api/admin/benefit-activations", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT a.*, u.nome AS user_nome, u.email AS user_email, p.nome AS produto_nome
         FROM dbo.benefit_activations a
         JOIN dbo.users u ON u.id = a.user_id
         JOIN dbo.products p ON p.id = a.product_id
        ORDER BY a.activated_at DESC`
    );
    return { data };
  });

  app.get("/api/admin/redemptions", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT r.*, u.nome AS user_nome, p.nome AS produto_nome, pa.nome_fantasia AS partner_nome
         FROM dbo.redemptions r
         JOIN dbo.users u ON u.id = r.user_id
         JOIN dbo.products p ON p.id = r.product_id
         LEFT JOIN dbo.partners pa ON pa.id = r.partner_id
        ORDER BY r.redeemed_at DESC`
    );
    return { data };
  });

  app.get("/api/admin/receivables", async (request) => {
    await requireAdmin(request);
    const queryParams = request.query as { status?: string; partner_id?: string };
    const data = await query(
      `SELECT r.*, p.nome_fantasia AS partner_nome
         FROM dbo.receivables r
         JOIN dbo.partners p ON p.id = r.partner_id
        WHERE (@status IS NULL OR r.status = @status)
          AND (@partner_id IS NULL OR r.partner_id = @partner_id)
        ORDER BY r.created_at DESC`,
      (req) =>
        req
          .input("status", sqlTypes.VarChar(20), queryParams.status ?? null)
          .input("partner_id", sqlTypes.BigInt, queryParams.partner_id ? Number(queryParams.partner_id) : null)
    );
    return { data };
  });

  app.patch("/api/admin/receivables/:id/status", async (request) => {
    const admin = await requireAdmin(request);
    const params = request.params as { id: string };
    const body = z
      .object({ status: z.enum(["pendente", "fechado", "pago", "contestado", "cancelado"]) })
      .parse(request.body);

    await execute(
      `UPDATE dbo.receivables
          SET status = @status,
              settled_at = CASE WHEN @status = 'pago' THEN SYSUTCDATETIME() ELSE settled_at END,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("status", sqlTypes.VarChar(20), body.status)
    );

    await writeAuditLog({
      actorId: admin.id,
      action: "receivable.status_updated",
      entityType: "receivable",
      entityId: Number(params.id),
      payload: body
    });

    return { data: { id: Number(params.id), status: body.status } };
  });
}
