import { randomBytes } from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUser } from "./auth.js";
import { execute, query, sqlTypes } from "./db.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

// Short, readable, human-friendly referral code.
// Avoids ambiguous chars (0/O, 1/I, etc.). 8 chars → ~10^14 combinations, easily unique.
const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateReferralCode(length = 8): string {
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += REFERRAL_ALPHABET[buf[i] % REFERRAL_ALPHABET.length];
  }
  return out;
}

async function ensureUserHasReferralCode(userId: number): Promise<string> {
  const existing = await query<{ referral_code: string | null }>(
    `SELECT referral_code FROM dbo.users WHERE id = @id`,
    (req) => req.input("id", sqlTypes.BigInt, userId)
  );
  if (existing[0]?.referral_code) return existing[0].referral_code;

  // Try a few times in case of collision (very unlikely with 31^8 space).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await execute(
        `UPDATE dbo.users SET referral_code = @code, updated_at = SYSUTCDATETIME() WHERE id = @id AND referral_code IS NULL`,
        (req) =>
          req
            .input("id", sqlTypes.BigInt, userId)
            .input("code", sqlTypes.VarChar(12), code)
      );
      const updated = await query<{ referral_code: string | null }>(
        `SELECT referral_code FROM dbo.users WHERE id = @id`,
        (req) => req.input("id", sqlTypes.BigInt, userId)
      );
      if (updated[0]?.referral_code === code) return code;
      if (updated[0]?.referral_code) return updated[0].referral_code;
    } catch {
      // unique-constraint collision — try next code
    }
  }

  throw new Error("could_not_generate_referral_code");
}

// ─── Routes ───────────────────────────────────────────────────────────────

export async function registerEngagementRoutes(app: FastifyInstance) {
  // ─── Cashback: expiring credits banner ──────────────────────────────────
  // Returns the breakdown of credits that will expire in the next N days
  // so the AccountPage can show "you have R$X expiring on Y".
  app.get("/api/me/cashback/expiring", async (request, reply) => {
    const user = await requireUser(request);
    const days = Math.max(1, Math.min(90, Number((request.query as { days?: string }).days ?? 30)));

    const rows = await query<{
      total_expiring: number;
      next_expires_at: Date | null;
    }>(
      `SELECT
          COALESCE(SUM(valor), 0) AS total_expiring,
          MIN(expires_at) AS next_expires_at
         FROM dbo.cashback_transactions
        WHERE user_id = @id
          AND tipo = 'credito'
          AND expires_at IS NOT NULL
          AND expires_at > SYSUTCDATETIME()
          AND expires_at <= DATEADD(DAY, @days, SYSUTCDATETIME())`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, user.id)
          .input("days", sqlTypes.Int, days)
    );

    const balanceRow = await query<{ cashback_balance: number }>(
      `SELECT COALESCE(cashback_balance, 0) AS cashback_balance FROM dbo.users WHERE id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );
    const balance = Number(balanceRow[0]?.cashback_balance ?? 0);
    const totalExpiring = Math.min(balance, Number(rows[0]?.total_expiring ?? 0));

    return reply.send({
      data: {
        balance,
        days_window: days,
        total_expiring: totalExpiring,
        next_expires_at: rows[0]?.next_expires_at ?? null
      }
    });
  });

  // ─── Referrals: my code + stats ─────────────────────────────────────────
  app.get("/api/me/referrals", async (request, reply) => {
    const user = await requireUser(request);
    const code = await ensureUserHasReferralCode(user.id);

    const stats = await query<{
      total_indicados: number;
      qualificados: number;
      pagos: number;
      total_ganho: number;
    }>(
      `SELECT
          COUNT(*) AS total_indicados,
          SUM(CASE WHEN status = 'qualificado' THEN 1 ELSE 0 END) AS qualificados,
          SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS pagos,
          COALESCE(SUM(CASE WHEN status IN ('qualificado','pago') THEN bonus_amount ELSE 0 END), 0) AS total_ganho
         FROM dbo.referrals
        WHERE referrer_user_id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );

    const recent = await query(
      `SELECT TOP 10 r.id, r.status, r.bonus_amount, r.created_at, r.qualified_at, u.nome AS indicado_nome
         FROM dbo.referrals r
         JOIN dbo.users u ON u.id = r.referred_user_id
        WHERE r.referrer_user_id = @id
        ORDER BY r.created_at DESC`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );

    return reply.send({
      data: {
        code,
        stats: stats[0] ?? { total_indicados: 0, qualificados: 0, pagos: 0, total_ganho: 0 },
        recent
      }
    });
  });

  // Public — validate a referral code on the registration page.
  // Returns the referrer's first name so the new user sees "Indicado por João".
  app.get("/api/referrals/lookup", async (request, reply) => {
    const code = ((request.query as { code?: string }).code ?? "").trim().toUpperCase();
    if (!code || code.length < 4 || code.length > 12) {
      return reply.code(400).send({ error: "invalid_code" });
    }
    const rows = await query<{ id: number; nome: string }>(
      `SELECT TOP 1 id, nome FROM dbo.users WHERE referral_code = @code AND status = 'ativo'`,
      (req) => req.input("code", sqlTypes.VarChar(12), code)
    );
    if (!rows[0]) return reply.code(404).send({ error: "referral_not_found" });
    return reply.send({
      data: {
        referrer_id: rows[0].id,
        referrer_first_name: rows[0].nome.split(" ")[0]
      }
    });
  });

  // ─── Order tracking timeline ────────────────────────────────────────────
  app.get("/api/me/orders/:id/timeline", async (request, reply) => {
    const user = await requireUser(request);
    const orderId = Number((request.params as { id: string }).id);
    if (!Number.isFinite(orderId)) {
      return reply.code(400).send({ error: "invalid_order_id" });
    }

    // Confirm ownership before exposing internals.
    const owner = await query<{ id: number }>(
      `SELECT TOP 1 id FROM dbo.product_orders WHERE id = @id AND user_id = @user_id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, orderId)
          .input("user_id", sqlTypes.BigInt, user.id)
    );
    if (!owner[0]) return reply.code(404).send({ error: "order_not_found" });

    const order = await query(
      `SELECT id, public_code, status, payment_status, payment_method,
              valor_pago_total, voucher_code, created_at, updated_at,
              tipo_entrega, offer_type, delivery_method
         FROM dbo.product_orders
        WHERE id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, orderId)
    );

    const events = await query(
      `SELECT id, status, payment_status, note, created_at
         FROM dbo.order_status_events
        WHERE order_id = @id
        ORDER BY created_at ASC`,
      (req) => req.input("id", sqlTypes.BigInt, orderId)
    );

    return reply.send({
      data: {
        order: order[0],
        events
      }
    });
  });

  // Search/filter orders for the current user.
  app.get("/api/me/orders/search", async (request, reply) => {
    const user = await requireUser(request);
    const q = request.query as {
      status?: string;
      payment_status?: string;
      from?: string;
      to?: string;
      partner_id?: string;
      search?: string;
      limit?: string;
    };

    const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 200);
    const partnerId = q.partner_id ? Number(q.partner_id) : null;

    const data = await query(
      `SELECT TOP (@limit) o.id, o.public_code, o.status, o.payment_status, o.payment_method,
              o.valor_pago_total, o.voucher_code, o.tipo_entrega,
              o.created_at, p.nome AS produto_nome, p.imagem_url, pa.nome_fantasia AS partner_nome
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
         LEFT JOIN dbo.partners pa ON pa.id = p.partner_id
        WHERE o.user_id = @user_id
          AND (@status IS NULL OR o.status = @status)
          AND (@payment_status IS NULL OR o.payment_status = @payment_status)
          AND (@from IS NULL OR o.created_at >= @from)
          AND (@to IS NULL OR o.created_at <= @to)
          AND (@partner_id IS NULL OR p.partner_id = @partner_id)
          AND (@search IS NULL OR p.nome LIKE '%' + @search + '%' OR o.public_code LIKE '%' + @search + '%')
        ORDER BY o.created_at DESC`,
      (req) =>
        req
          .input("user_id", sqlTypes.BigInt, user.id)
          .input("limit", sqlTypes.Int, limit)
          .input("status", sqlTypes.VarChar(40), q.status ?? null)
          .input("payment_status", sqlTypes.VarChar(40), q.payment_status ?? null)
          .input("from", sqlTypes.DateTime2, q.from ? new Date(q.from) : null)
          .input("to", sqlTypes.DateTime2, q.to ? new Date(q.to) : null)
          .input("partner_id", sqlTypes.BigInt, partnerId && Number.isFinite(partnerId) ? partnerId : null)
          .input("search", sqlTypes.NVarChar(140), q.search?.trim() || null)
    );

    return reply.send({ data });
  });

  // ─── Notifications: list user notifications ─────────────────────────────
  app.get("/api/me/notifications", async (request, reply) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT TOP 50 id, titulo, mensagem, canal, lida, created_at
         FROM dbo.notifications
        WHERE user_id = @id
        ORDER BY created_at DESC`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );
    return reply.send({ data });
  });

  app.patch("/api/me/notifications/:id/read", async (request, reply) => {
    const user = await requireUser(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "invalid_id" });
    await execute(
      `UPDATE dbo.notifications SET lida = 1 WHERE id = @id AND user_id = @user_id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, id)
          .input("user_id", sqlTypes.BigInt, user.id)
    );
    return reply.code(204).send();
  });

  // ─── Apply referral code (called during checkout/registration follow-up) ─
  // Also accepts an authenticated POST to backfill a code post-signup.
  const applyReferralSchema = z.object({
    code: z.string().trim().min(4).max(12)
  });

  app.post("/api/me/referrals/apply", async (request, reply) => {
    const user = await requireUser(request);
    const body = applyReferralSchema.parse(request.body);
    const code = body.code.toUpperCase();

    // Block self-referral
    const referrer = await query<{ id: number; referral_code: string | null }>(
      `SELECT id, referral_code FROM dbo.users WHERE referral_code = @code`,
      (req) => req.input("code", sqlTypes.VarChar(12), code)
    );
    if (!referrer[0]) return reply.code(404).send({ error: "referral_not_found" });
    if (referrer[0].id === user.id) return reply.code(400).send({ error: "cannot_self_refer" });

    // Block re-applying for a user who already has a referrer
    const me = await query<{ referred_by_user_id: number | null }>(
      `SELECT referred_by_user_id FROM dbo.users WHERE id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );
    if (me[0]?.referred_by_user_id) {
      return reply.code(409).send({ error: "already_referred" });
    }

    await execute(
      `UPDATE dbo.users
          SET referred_by_user_id = @referrer, updated_at = SYSUTCDATETIME()
        WHERE id = @id AND referred_by_user_id IS NULL`,
      (req) =>
        req
          .input("referrer", sqlTypes.BigInt, referrer[0].id)
          .input("id", sqlTypes.BigInt, user.id)
    );

    await execute(
      `INSERT INTO dbo.referrals (referrer_user_id, referred_user_id, referral_code, status, bonus_amount)
       SELECT @referrer, @referred, @code, 'pendente', 10.00
       WHERE NOT EXISTS (SELECT 1 FROM dbo.referrals WHERE referred_user_id = @referred)`,
      (req) =>
        req
          .input("referrer", sqlTypes.BigInt, referrer[0].id)
          .input("referred", sqlTypes.BigInt, user.id)
          .input("code", sqlTypes.VarChar(12), code)
    );

    return reply.code(201).send({ data: { ok: true } });
  });
}
