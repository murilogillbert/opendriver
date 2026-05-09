import { FastifyInstance } from "fastify";
import { z } from "zod";

import { requirePartner } from "./auth.js";
import { execute, query, sqlTypes } from "./db.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170);

// Public for partner terminals only — every endpoint here requires `requirePartner`
// (valid JWT + tipo_usuario='parceiro' + partner_id non-null).
export async function registerPartnerRoutes(app: FastifyInstance) {
  app.get("/api/partner/me", async (request, reply) => {
    const actor = await requirePartner(request);
    const partner = await query<{
      id: number;
      nome_fantasia: string;
      cidade: string;
      estado: string;
      whatsapp: string | null;
    }>(
      `SELECT id, nome_fantasia, cidade, estado, whatsapp
         FROM dbo.partners
        WHERE id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, actor.partner_id)
    );
    if (!partner[0]) return reply.code(404).send({ error: "partner_not_found" });
    return {
      data: {
        ...partner[0],
        operator: { id: actor.id, nome: actor.nome, email: actor.email }
      }
    };
  });

  // Preview a voucher token before confirming. No side-effects so the operator can
  // inspect the activation, talk to the customer and only then press confirm.
  app.get("/api/partner/me/lookup", async (request, reply) => {
    const actor = await requirePartner(request);
    const queryParams = request.query as { token?: string };
    const token = (queryParams.token ?? "").trim().toUpperCase();
    if (!token || token.length < 6 || token.length > 40) {
      return reply.code(400).send({ error: "invalid_token" });
    }

    const rows = await query<{
      id: number;
      product_id: number;
      partner_id: number | null;
      product_partner_id: number | null;
      produto_nome: string;
      offer_type: string | null;
      delivery_method: string | null;
      voucher_code: string | null;
      status: string;
      activated_at: Date;
      expires_at: Date | null;
      redemption_limit: number | null;
      redemption_count: number;
      user_id: number;
      user_nome: string;
      economia_estimada: number;
      redemption_token: string;
    }>(
      `SELECT TOP 1
              a.id, a.product_id, p.partner_id AS product_partner_id, p.partner_id,
              p.nome AS produto_nome, p.offer_type, p.delivery_method,
              a.voucher_code, a.status, a.activated_at, a.expires_at,
              a.redemption_limit, a.redemption_count,
              a.user_id, u.nome AS user_nome, p.economia_estimada,
              a.redemption_token
         FROM dbo.benefit_activations a
         JOIN dbo.products p ON p.id = a.product_id
         JOIN dbo.users u ON u.id = a.user_id
        WHERE a.redemption_token = @token OR a.voucher_code = @token
        ORDER BY a.activated_at DESC`,
      (req) => req.input("token", sqlTypes.NVarChar(40), token)
    );
    const activation = rows[0];
    if (!activation) return reply.code(404).send({ error: "activation_not_found" });

    if (
      activation.product_partner_id != null &&
      Number(activation.product_partner_id) !== Number(actor.partner_id)
    ) {
      return reply.code(403).send({ error: "voucher_belongs_to_another_partner" });
    }

    const expired = activation.expires_at != null && new Date(activation.expires_at) < new Date();
    const exhausted =
      activation.redemption_limit != null &&
      activation.redemption_count >= activation.redemption_limit;

    return {
      data: {
        activation_id: activation.id,
        produto_nome: activation.produto_nome,
        offer_type: activation.offer_type,
        delivery_method: activation.delivery_method,
        voucher_code: activation.voucher_code,
        status: activation.status,
        activated_at: activation.activated_at,
        expires_at: activation.expires_at,
        redemption_limit: activation.redemption_limit,
        redemption_count: activation.redemption_count,
        cliente_primeiro_nome: activation.user_nome.split(" ")[0],
        economia_estimada: Number(activation.economia_estimada ?? 0),
        usable: activation.status === "ativo" && !expired && !exhausted,
        expired,
        exhausted
      }
    };
  });

  app.post("/api/partner/me/redeem", async (request, reply) => {
    const actor = await requirePartner(request);
    if (actor.password_must_change) {
      return reply.code(409).send({ error: "password_change_required" });
    }
    const body = z
      .object({
        redemption_token: z.string().trim().min(6).max(20),
        valor_referencia: z.coerce.number().nonnegative().optional(),
        notes: z.string().trim().max(500).optional(),
        confirmation_method: z.enum(["token", "qr"]).default("token")
      })
      .parse(request.body);

    const auth = request.headers.authorization;
    const baseUrl = `http://127.0.0.1:${process.env.APP_PORT ?? 3001}`;
    const response = await fetch(`${baseUrl}/api/benefits/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {})
      },
      body: JSON.stringify({
        redemption_token: body.redemption_token,
        valor_referencia: body.valor_referencia,
        notes: body.notes,
        confirmation_method: body.confirmation_method
      })
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return reply.code(response.status).send(payload);
  });

  app.get("/api/partner/me/redemptions", async (request) => {
    const actor = await requirePartner(request);
    const queryParams = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(queryParams.limit ?? 20), 1), 100);

    const data = await query(
      `SELECT TOP (@limit) r.id, r.redeemed_at, r.confirmation_method, r.valor_referencia,
              p.nome AS produto_nome, u.nome AS cliente_nome,
              a.redemption_token
         FROM dbo.redemptions r
         JOIN dbo.products p ON p.id = r.product_id
         JOIN dbo.users u ON u.id = r.user_id
         JOIN dbo.benefit_activations a ON a.id = r.activation_id
        WHERE r.partner_id = @partner_id
        ORDER BY r.redeemed_at DESC`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("limit", sqlTypes.Int, limit)
    );
    return { data };
  });

  app.get("/api/partner/me/stats", async (request) => {
    const actor = await requirePartner(request);

    const data = await query<{
      resgates_hoje: number;
      resgates_mes: number;
      a_receber: number;
      pago_total: number;
    }>(
      `SELECT
          (SELECT COUNT(*) FROM dbo.redemptions
            WHERE partner_id = @partner_id
              AND redeemed_at >= CAST(SYSUTCDATETIME() AS DATE)) AS resgates_hoje,
          (SELECT COUNT(*) FROM dbo.redemptions
            WHERE partner_id = @partner_id
              AND redeemed_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS resgates_mes,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.receivables
            WHERE partner_id = @partner_id AND status IN ('pendente', 'fechado')) AS a_receber,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.receivables
            WHERE partner_id = @partner_id AND status = 'pago') AS pago_total`,
      (req) => req.input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );

    return { data: data[0] };
  });

  // ─── Products: list/create/update/delete (self-service) ──────────────────
  app.get("/api/partner/me/products", async (request) => {
    const actor = await requirePartner(request);
    const data = await query(
      `SELECT id, nome, slug, descricao_curta, status, offer_type, delivery_method,
              preco_original, preco_desconto, economia_estimada, cashback_percent,
              estoque, destaque_home, imagem_url, created_at, updated_at
         FROM dbo.products
        WHERE partner_id = @partner_id AND deleted_at IS NULL
        ORDER BY status ASC, created_at DESC`,
      (req) => req.input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    return { data };
  });

  // Sales/redemption count per product so partners see what works.
  app.get("/api/partner/me/products/:id/sales", async (request, reply) => {
    const actor = await requirePartner(request);
    const productId = Number((request.params as { id: string }).id);
    if (!Number.isFinite(productId)) return reply.code(400).send({ error: "invalid_id" });

    const ownership = await query<{ id: number }>(
      `SELECT TOP 1 id FROM dbo.products WHERE id = @id AND partner_id = @partner_id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, productId)
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    if (!ownership[0]) return reply.code(404).send({ error: "product_not_found" });

    const data = await query<{
      total_pedidos: number;
      total_resgates: number;
      receita_total: number;
    }>(
      `SELECT
          (SELECT COUNT(*) FROM dbo.product_orders WHERE product_id = @id AND payment_status = 'approved') AS total_pedidos,
          (SELECT COUNT(*) FROM dbo.redemptions WHERE product_id = @id) AS total_resgates,
          (SELECT COALESCE(SUM(valor_pago_total), 0) FROM dbo.product_orders WHERE product_id = @id AND payment_status = 'approved') AS receita_total`,
      (req) => req.input("id", sqlTypes.BigInt, productId)
    );
    return { data: data[0] };
  });

  const partnerProductSchema = z.object({
    nome: z.string().trim().min(2).max(180),
    descricao_curta: z.string().trim().min(2).max(280),
    descricao: z.string().trim().min(2),
    offer_type: z.enum([
      "produto_fisico",
      "produto_digital",
      "servico",
      "voucher",
      "beneficio_recorrente",
      "assinatura",
      "combo"
    ]),
    delivery_method: z.enum(["digital", "presencial", "fisica"]).default("presencial"),
    tipo_entrega: z.enum(["digital", "fisico", "ambos"]).default("digital"),
    tipo: z.enum(["digital", "fisico"]).default("digital"),
    preco_original: z.coerce.number().nonnegative(),
    preco_desconto: z.coerce.number().nonnegative(),
    economia_estimada: z.coerce.number().nonnegative().optional().nullable(),
    cashback_percent: z.coerce.number().min(0).max(100).optional().nullable(),
    estoque: z.coerce.number().int().nonnegative().optional().nullable(),
    imagem_url: z.string().trim().optional().nullable(),
    usage_rules: z.string().trim().optional().nullable(),
    status: z.enum(["ativo", "pausado", "rascunho"]).default("rascunho")
  });

  app.post("/api/partner/me/products", async (request, reply) => {
    const actor = await requirePartner(request);
    if (actor.password_must_change) {
      return reply.code(409).send({ error: "password_change_required" });
    }
    const body = partnerProductSchema.parse(request.body);

    const slug = `${slugify(body.nome)}-${Date.now().toString(36)}`;
    const economia = body.economia_estimada ?? Math.max(0, body.preco_original - body.preco_desconto);

    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.products (
          partner_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega,
          offer_type, delivery_method, preco_original, preco_desconto, economia_estimada,
          economia_mensal_estimada, imagem_url, usage_rules, estoque, destaque_home,
          status, cashback_percent
       )
       OUTPUT INSERTED.id
       VALUES (
          @partner_id, @nome, @slug, @descricao_curta, @descricao, @tipo, @tipo_entrega,
          @offer_type, @delivery_method, @preco_original, @preco_desconto, @economia_estimada,
          0, @imagem_url, @usage_rules, @estoque, 0,
          @status, @cashback_percent
       )`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("nome", sqlTypes.NVarChar(180), body.nome)
          .input("slug", sqlTypes.NVarChar(180), slug)
          .input("descricao_curta", sqlTypes.NVarChar(280), body.descricao_curta)
          .input("descricao", sqlTypes.NVarChar(sqlTypes.MAX), body.descricao)
          .input("tipo", sqlTypes.VarChar(20), body.tipo)
          .input("tipo_entrega", sqlTypes.VarChar(20), body.tipo_entrega)
          .input("offer_type", sqlTypes.VarChar(30), body.offer_type)
          .input("delivery_method", sqlTypes.VarChar(30), body.delivery_method)
          .input("preco_original", sqlTypes.Decimal(12, 2), body.preco_original)
          .input("preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto)
          .input("economia_estimada", sqlTypes.Decimal(12, 2), economia)
          .input("imagem_url", sqlTypes.NVarChar(400), body.imagem_url ?? null)
          .input("usage_rules", sqlTypes.NVarChar(sqlTypes.MAX), body.usage_rules ?? null)
          .input("estoque", sqlTypes.Int, body.estoque ?? null)
          .input("status", sqlTypes.VarChar(20), body.status)
          .input("cashback_percent", sqlTypes.Decimal(5, 2), body.cashback_percent ?? null)
    );

    return reply.code(201).send({ data: { id: result.recordset[0].id } });
  });

  app.patch("/api/partner/me/products/:id", async (request, reply) => {
    const actor = await requirePartner(request);
    const productId = Number((request.params as { id: string }).id);
    if (!Number.isFinite(productId)) return reply.code(400).send({ error: "invalid_id" });

    const ownership = await query<{ id: number }>(
      `SELECT TOP 1 id FROM dbo.products WHERE id = @id AND partner_id = @partner_id AND deleted_at IS NULL`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, productId)
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    if (!ownership[0]) return reply.code(404).send({ error: "product_not_found" });

    const body = partnerProductSchema.partial().parse(request.body);

    // Build dynamic SET clause only with provided fields
    const sets: string[] = [];
    const inputs: Array<[string, unknown, unknown]> = [];
    if (body.nome !== undefined) {
      sets.push("nome = @nome");
      inputs.push(["nome", sqlTypes.NVarChar(180), body.nome]);
    }
    if (body.descricao_curta !== undefined) {
      sets.push("descricao_curta = @descricao_curta");
      inputs.push(["descricao_curta", sqlTypes.NVarChar(280), body.descricao_curta]);
    }
    if (body.descricao !== undefined) {
      sets.push("descricao = @descricao");
      inputs.push(["descricao", sqlTypes.NVarChar(sqlTypes.MAX), body.descricao]);
    }
    if (body.preco_original !== undefined) {
      sets.push("preco_original = @preco_original");
      inputs.push(["preco_original", sqlTypes.Decimal(12, 2), body.preco_original]);
    }
    if (body.preco_desconto !== undefined) {
      sets.push("preco_desconto = @preco_desconto");
      inputs.push(["preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto]);
    }
    if (body.cashback_percent !== undefined) {
      sets.push("cashback_percent = @cashback_percent");
      inputs.push(["cashback_percent", sqlTypes.Decimal(5, 2), body.cashback_percent ?? null]);
    }
    if (body.estoque !== undefined) {
      sets.push("estoque = @estoque");
      inputs.push(["estoque", sqlTypes.Int, body.estoque ?? null]);
    }
    if (body.imagem_url !== undefined) {
      sets.push("imagem_url = @imagem_url");
      inputs.push(["imagem_url", sqlTypes.NVarChar(400), body.imagem_url ?? null]);
    }
    if (body.usage_rules !== undefined) {
      sets.push("usage_rules = @usage_rules");
      inputs.push(["usage_rules", sqlTypes.NVarChar(sqlTypes.MAX), body.usage_rules ?? null]);
    }
    if (body.status !== undefined) {
      sets.push("status = @status");
      inputs.push(["status", sqlTypes.VarChar(20), body.status]);
    }
    if (body.offer_type !== undefined) {
      sets.push("offer_type = @offer_type");
      inputs.push(["offer_type", sqlTypes.VarChar(30), body.offer_type]);
    }
    if (body.delivery_method !== undefined) {
      sets.push("delivery_method = @delivery_method");
      inputs.push(["delivery_method", sqlTypes.VarChar(30), body.delivery_method]);
    }

    if (sets.length === 0) return reply.send({ data: { id: productId } });

    sets.push("updated_at = SYSUTCDATETIME()");

    await execute(
      `UPDATE dbo.products SET ${sets.join(", ")} WHERE id = @id AND partner_id = @partner_id`,
      (req) => {
        req
          .input("id", sqlTypes.BigInt, productId)
          .input("partner_id", sqlTypes.BigInt, actor.partner_id);
        for (const [name, type, value] of inputs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (req as any).input(name, type, value);
        }
        return req;
      }
    );

    return reply.send({ data: { id: productId } });
  });

  app.delete("/api/partner/me/products/:id", async (request, reply) => {
    const actor = await requirePartner(request);
    const productId = Number((request.params as { id: string }).id);
    if (!Number.isFinite(productId)) return reply.code(400).send({ error: "invalid_id" });

    const result = await execute(
      `UPDATE dbo.products
          SET deleted_at = SYSUTCDATETIME(), status = 'pausado', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND partner_id = @partner_id AND deleted_at IS NULL`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, productId)
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    if (result.rowsAffected[0] === 0) {
      return reply.code(404).send({ error: "product_not_found" });
    }
    return reply.code(204).send();
  });

  // ─── Receivables (transparent statement) ──────────────────────────────────
  app.get("/api/partner/me/receivables", async (request) => {
    const actor = await requirePartner(request);
    const q = request.query as { from?: string; to?: string; status?: string; limit?: string };
    const limit = Math.min(Math.max(Number(q.limit ?? 100), 1), 500);

    const data = await query(
      `SELECT TOP (@limit) r.id, r.descricao, r.valor, r.status, r.due_date, r.settled_at,
              r.created_at, r.payout_request_id,
              re.redeemed_at, re.valor_referencia, re.confirmation_method,
              p.nome AS produto_nome,
              u.nome AS cliente_nome
         FROM dbo.receivables r
         LEFT JOIN dbo.redemptions re ON re.id = r.redemption_id
         LEFT JOIN dbo.products p ON p.id = re.product_id
         LEFT JOIN dbo.users u ON u.id = re.user_id
        WHERE r.partner_id = @partner_id
          AND (@from IS NULL OR r.created_at >= @from)
          AND (@to IS NULL OR r.created_at <= @to)
          AND (@status IS NULL OR r.status = @status)
        ORDER BY r.created_at DESC`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("limit", sqlTypes.Int, limit)
          .input("from", sqlTypes.DateTime2, q.from ? new Date(q.from) : null)
          .input("to", sqlTypes.DateTime2, q.to ? new Date(q.to) : null)
          .input("status", sqlTypes.VarChar(40), q.status ?? null)
    );

    return { data };
  });

  // ─── Analytics: redemptions per day, top products, QR performance ───────
  app.get("/api/partner/me/analytics/redemptions", async (request) => {
    const actor = await requirePartner(request);
    const days = Math.min(Math.max(Number((request.query as { days?: string }).days ?? 30), 1), 180);

    const data = await query(
      `SELECT CAST(redeemed_at AS DATE) AS dia, COUNT(*) AS total,
              COALESCE(SUM(valor_referencia), 0) AS receita
         FROM dbo.redemptions
        WHERE partner_id = @partner_id
          AND redeemed_at >= DATEADD(DAY, -@days, CAST(SYSUTCDATETIME() AS DATE))
        GROUP BY CAST(redeemed_at AS DATE)
        ORDER BY dia ASC`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("days", sqlTypes.Int, days)
    );
    return { data };
  });

  app.get("/api/partner/me/analytics/top-products", async (request) => {
    const actor = await requirePartner(request);
    const days = Math.min(Math.max(Number((request.query as { days?: string }).days ?? 30), 1), 365);

    const data = await query(
      `SELECT TOP 10
              p.id, p.nome,
              COUNT(r.id) AS resgates,
              COALESCE(SUM(r.valor_referencia), 0) AS receita
         FROM dbo.products p
         LEFT JOIN dbo.redemptions r ON r.product_id = p.id
                                     AND r.partner_id = @partner_id
                                     AND r.redeemed_at >= DATEADD(DAY, -@days, CAST(SYSUTCDATETIME() AS DATE))
        WHERE p.partner_id = @partner_id AND p.deleted_at IS NULL
        GROUP BY p.id, p.nome
        ORDER BY resgates DESC, receita DESC`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("days", sqlTypes.Int, days)
    );
    return { data };
  });

  app.get("/api/partner/me/analytics/qr-performance", async (request) => {
    const actor = await requirePartner(request);
    const days = Math.min(Math.max(Number((request.query as { days?: string }).days ?? 30), 1), 180);

    const data = await query(
      `SELECT q.id, q.label, q.token, q.status,
              (SELECT COUNT(*) FROM dbo.checkin_events e
                WHERE e.qrcode_id = q.id
                  AND e.created_at >= DATEADD(DAY, -@days, CAST(SYSUTCDATETIME() AS DATE))) AS scans,
              (SELECT COUNT(*) FROM dbo.product_orders o
                JOIN dbo.checkin_events e ON e.id = o.checkin_event_id
                WHERE e.qrcode_id = q.id
                  AND o.payment_status = 'approved'
                  AND o.created_at >= DATEADD(DAY, -@days, CAST(SYSUTCDATETIME() AS DATE))) AS conversions,
              (SELECT COALESCE(SUM(o.valor_pago_total), 0) FROM dbo.product_orders o
                JOIN dbo.checkin_events e ON e.id = o.checkin_event_id
                WHERE e.qrcode_id = q.id
                  AND o.payment_status = 'approved'
                  AND o.created_at >= DATEADD(DAY, -@days, CAST(SYSUTCDATETIME() AS DATE))) AS receita
         FROM dbo.checkin_qrcodes q
        WHERE q.partner_id = @partner_id
        ORDER BY scans DESC`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("days", sqlTypes.Int, days)
    );
    return { data };
  });

  // ─── Payout requests (self-service) ──────────────────────────────────────
  app.get("/api/partner/me/payout-requests", async (request) => {
    const actor = await requirePartner(request);
    const data = await query(
      `SELECT TOP 50 id, amount, status, bank_info, notes, admin_notes,
              requested_at, approved_at, paid_at, rejected_at
         FROM dbo.payout_requests
        WHERE partner_id = @partner_id
        ORDER BY requested_at DESC`,
      (req) => req.input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    return { data };
  });

  const payoutRequestSchema = z.object({
    amount: z.coerce.number().positive().max(1_000_000),
    bank_info: z.string().trim().min(5).max(2000),
    notes: z.string().trim().max(500).optional()
  });

  app.post("/api/partner/me/payout-requests", async (request, reply) => {
    const actor = await requirePartner(request);
    if (actor.password_must_change) {
      return reply.code(409).send({ error: "password_change_required" });
    }
    const body = payoutRequestSchema.parse(request.body);

    // Verify available balance: pending receivables minus already requested (não-rejeitado) amounts.
    const balanceRow = await query<{ disponivel: number }>(
      `SELECT
          COALESCE(
            (SELECT SUM(valor) FROM dbo.receivables WHERE partner_id = @partner_id AND status IN ('pendente','fechado'))
          - (SELECT COALESCE(SUM(amount), 0) FROM dbo.payout_requests
              WHERE partner_id = @partner_id AND status IN ('solicitado','em_analise','aprovado'))
          , 0) AS disponivel`,
      (req) => req.input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    const disponivel = Number(balanceRow[0]?.disponivel ?? 0);

    if (body.amount > disponivel) {
      return reply.code(409).send({ error: "amount_exceeds_available_balance", disponivel });
    }

    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.payout_requests (partner_id, requested_by_user_id, amount, bank_info, notes, status)
       OUTPUT INSERTED.id
       VALUES (@partner_id, @user_id, @amount, @bank_info, @notes, 'solicitado')`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
          .input("user_id", sqlTypes.BigInt, actor.id)
          .input("amount", sqlTypes.Decimal(12, 2), body.amount)
          .input("bank_info", sqlTypes.NVarChar(sqlTypes.MAX), body.bank_info)
          .input("notes", sqlTypes.NVarChar(500), body.notes ?? null)
    );

    return reply.code(201).send({ data: { id: result.recordset[0].id } });
  });

  // Cancel a payout that hasn't been approved yet.
  app.delete("/api/partner/me/payout-requests/:id", async (request, reply) => {
    const actor = await requirePartner(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "invalid_id" });

    const result = await execute(
      `UPDATE dbo.payout_requests
          SET status = 'cancelado'
        WHERE id = @id AND partner_id = @partner_id
          AND status IN ('solicitado','em_analise')`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, id)
          .input("partner_id", sqlTypes.BigInt, actor.partner_id)
    );
    if (result.rowsAffected[0] === 0) {
      return reply.code(404).send({ error: "payout_request_not_found_or_already_processed" });
    }
    return reply.code(204).send();
  });
}
