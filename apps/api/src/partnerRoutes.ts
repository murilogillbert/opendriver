import { FastifyInstance } from "fastify";
import { z } from "zod";

import { requirePartner } from "./auth.js";
import { query, sqlTypes } from "./db.js";

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
  // Accepts either the redemption_token (12 alphanumeric chars, the "real" QR token)
  // or the voucher_code (OD-XXXXXXXX, friendlier code shown on digital vouchers).
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
        // Show only first name to keep customer privacy at the counter.
        cliente_primeiro_nome: activation.user_nome.split(" ")[0],
        economia_estimada: Number(activation.economia_estimada ?? 0),
        usable: activation.status === "ativo" && !expired && !exhausted,
        expired,
        exhausted
      }
    };
  });

  // Convenience wrapper that re-invokes the redeem business logic — but the partner_id
  // is implicitly the actor's, so the terminal UI doesn't have to send it.
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

    // Re-dispatch through the regular benefits/redeem endpoint, identifying ourselves
    // via the same Authorization header so the partner-id enforcement still applies.
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

  // Recent redemptions performed at this partner so the operator has confidence the
  // last few cupons were captured correctly.
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
}
