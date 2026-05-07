import { FastifyInstance } from "fastify";
import { z } from "zod";

import { writeAuditLog } from "./audit.js";
import { clientIp, requireAdmin } from "./auth.js";
import { execute, query, sqlTypes, withTransaction } from "./db.js";
import { checkinQrcodeSchema } from "./schemas.js";

export async function registerCheckinRoutes(app: FastifyInstance) {
  // ---- Public ---------------------------------------------------------
  app.get("/api/checkin/:token", async (request, reply) => {
    const params = request.params as { token: string };
    const tokenSchema = z.string().uuid();
    const parsed = tokenSchema.safeParse(params.token);
    if (!parsed.success) {
      return reply.code(404).send({ error: "checkin_not_found" });
    }

    const qrcodes = await query<{
      id: number;
      partner_id: number;
      partner_location_id: number | null;
      label: string | null;
      status: string;
      partner_nome: string;
      partner_cidade: string;
      partner_estado: string;
      location_nome: string | null;
      location_endereco: string | null;
    }>(
      `SELECT TOP 1 q.id, q.partner_id, q.partner_location_id, q.label, q.status,
              p.nome_fantasia AS partner_nome, p.cidade AS partner_cidade, p.estado AS partner_estado,
              l.nome AS location_nome, l.endereco AS location_endereco
         FROM dbo.checkin_qrcodes q
         JOIN dbo.partners p ON p.id = q.partner_id
         LEFT JOIN dbo.partner_locations l ON l.id = q.partner_location_id
        WHERE q.token = @token`,
      (req) => req.input("token", sqlTypes.UniqueIdentifier, parsed.data)
    );
    const qrcode = qrcodes[0];
    if (!qrcode || qrcode.status !== "ativo") {
      return reply.code(404).send({ error: "checkin_not_found" });
    }

    const products = await query(
      `SELECT p.id, p.nome, p.slug, p.descricao_curta, p.preco_original, p.preco_desconto,
              p.economia_estimada, p.imagem_url, p.cashback_percent, p.offer_type,
              p.delivery_method, qp.ordem
         FROM dbo.checkin_qrcode_products qp
         JOIN dbo.products p ON p.id = qp.product_id
        WHERE qp.qrcode_id = @qrcode_id AND p.status = 'ativo'
        ORDER BY qp.ordem, p.nome`,
      (req) => req.input("qrcode_id", sqlTypes.BigInt, qrcode.id)
    );

    return {
      data: {
        qrcode: {
          id: qrcode.id,
          token: parsed.data,
          label: qrcode.label
        },
        partner: {
          id: qrcode.partner_id,
          nome: qrcode.partner_nome,
          cidade: qrcode.partner_cidade,
          estado: qrcode.partner_estado
        },
        location: qrcode.partner_location_id
          ? {
              id: qrcode.partner_location_id,
              nome: qrcode.location_nome,
              endereco: qrcode.location_endereco
            }
          : null,
        products
      }
    };
  });

  // Lightweight tracking endpoint: caller logs that a user (or anonymous visitor) opened the QR page.
  // The actual `checkin_event` row that gets attached to an order is created server-side by the
  // payment route — this is purely analytics so we can measure scans-without-purchase.
  app.post("/api/checkin/:token/track", async (request, reply) => {
    const params = request.params as { token: string };
    const tokenSchema = z.string().uuid();
    const parsed = tokenSchema.safeParse(params.token);
    if (!parsed.success) {
      return reply.code(404).send({ error: "checkin_not_found" });
    }

    const qrcodes = await query<{ id: number; status: string }>(
      `SELECT TOP 1 id, status FROM dbo.checkin_qrcodes WHERE token = @token`,
      (req) => req.input("token", sqlTypes.UniqueIdentifier, parsed.data)
    );
    const qr = qrcodes[0];
    if (!qr || qr.status !== "ativo") {
      return reply.code(404).send({ error: "checkin_not_found" });
    }

    await execute(
      `INSERT INTO dbo.page_events (event_name, path, metadata)
       VALUES ('checkin_visit', @path, @metadata)`,
      (req) =>
        req
          .input("path", sqlTypes.NVarChar(240), `/c/${parsed.data}`)
          .input(
            "metadata",
            sqlTypes.NVarChar(sqlTypes.MAX),
            JSON.stringify({ qrcode_id: qr.id, ip: clientIp(request) })
          )
    );

    return { data: { tracked: true } };
  });

  // ---- Admin ----------------------------------------------------------
  app.get("/api/admin/checkin-qrcodes", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT q.id, q.partner_id, q.partner_location_id, q.token, q.label, q.status,
              q.created_at, q.updated_at,
              p.nome_fantasia AS partner_nome,
              l.nome AS location_nome,
              (SELECT COUNT(*) FROM dbo.checkin_qrcode_products qp WHERE qp.qrcode_id = q.id) AS product_count,
              (SELECT COUNT(*) FROM dbo.checkin_events ev WHERE ev.qrcode_id = q.id) AS event_count
         FROM dbo.checkin_qrcodes q
         JOIN dbo.partners p ON p.id = q.partner_id
         LEFT JOIN dbo.partner_locations l ON l.id = q.partner_location_id
        ORDER BY q.created_at DESC`
    );
    return { data };
  });

  app.post("/api/admin/checkin-qrcodes", async (request, reply) => {
    const admin = await requireAdmin(request);
    const body = checkinQrcodeSchema.parse(request.body);

    const created = await withTransaction(async (tx) => {
      const insert = await tx.query<{ id: number; token: string }>(
        `INSERT INTO dbo.checkin_qrcodes (partner_id, partner_location_id, label, status)
         OUTPUT INSERTED.id, CAST(INSERTED.token AS NVARCHAR(36)) AS token
         VALUES (@partner_id, @partner_location_id, @label, @status)`,
        (req) =>
          req
            .input("partner_id", sqlTypes.BigInt, body.partner_id)
            .input("partner_location_id", sqlTypes.BigInt, body.partner_location_id ?? null)
            .input("label", sqlTypes.NVarChar(140), body.label ?? null)
            .input("status", sqlTypes.VarChar(20), body.status)
      );
      const row = insert[0];
      if (!row) throw new Error("checkin_qrcode_insert_failed");

      for (let i = 0; i < body.product_ids.length; i += 1) {
        const productId = body.product_ids[i];
        await tx.execute(
          `INSERT INTO dbo.checkin_qrcode_products (qrcode_id, product_id, ordem)
           VALUES (@qrcode_id, @product_id, @ordem)`,
          (req) =>
            req
              .input("qrcode_id", sqlTypes.BigInt, row.id)
              .input("product_id", sqlTypes.BigInt, productId)
              .input("ordem", sqlTypes.Int, i)
        );
      }
      return row;
    });

    await writeAuditLog({
      actorId: admin.id,
      action: "checkin_qrcode.created",
      entityType: "checkin_qrcode",
      entityId: created.id,
      payload: { partner_id: body.partner_id, products: body.product_ids.length }
    });

    return reply.code(201).send({
      data: {
        id: created.id,
        token: created.token,
        url: `/c/${created.token}`
      }
    });
  });

  app.patch("/api/admin/checkin-qrcodes/:id", async (request, reply) => {
    const admin = await requireAdmin(request);
    const params = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["ativo", "pausado"]).optional(),
        label: z.string().trim().min(1).max(140).optional().nullable(),
        product_ids: z.array(z.coerce.number().int().positive()).min(1).optional()
      })
      .parse(request.body ?? {});

    const id = Number(params.id);

    await withTransaction(async (tx) => {
      if (body.status || body.label !== undefined) {
        await tx.execute(
          `UPDATE dbo.checkin_qrcodes
              SET status = COALESCE(@status, status),
                  label = CASE WHEN @label_set = 1 THEN @label ELSE label END,
                  updated_at = SYSUTCDATETIME()
            WHERE id = @id`,
          (req) =>
            req
              .input("id", sqlTypes.BigInt, id)
              .input("status", sqlTypes.VarChar(20), body.status ?? null)
              .input("label_set", sqlTypes.Bit, body.label !== undefined ? 1 : 0)
              .input("label", sqlTypes.NVarChar(140), body.label ?? null)
        );
      }

      if (body.product_ids) {
        await tx.execute(
          `DELETE FROM dbo.checkin_qrcode_products WHERE qrcode_id = @id`,
          (req) => req.input("id", sqlTypes.BigInt, id)
        );
        for (let i = 0; i < body.product_ids.length; i += 1) {
          const productId = body.product_ids[i];
          await tx.execute(
            `INSERT INTO dbo.checkin_qrcode_products (qrcode_id, product_id, ordem)
             VALUES (@qrcode_id, @product_id, @ordem)`,
            (req) =>
              req
                .input("qrcode_id", sqlTypes.BigInt, id)
                .input("product_id", sqlTypes.BigInt, productId)
                .input("ordem", sqlTypes.Int, i)
          );
        }
      }
    });

    await writeAuditLog({
      actorId: admin.id,
      action: "checkin_qrcode.updated",
      entityType: "checkin_qrcode",
      entityId: id,
      payload: body
    });

    return reply.send({ data: { id } });
  });

  app.get("/api/admin/cashback-summary", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT
          (SELECT COALESCE(SUM(cashback_balance), 0) FROM dbo.users) AS saldo_total,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.cashback_transactions WHERE tipo = 'credito') AS total_creditado,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.cashback_transactions WHERE tipo = 'debito') AS total_debitado,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.cashback_transactions WHERE tipo = 'expirado') AS total_expirado,
          (SELECT COALESCE(SUM(valor), 0) FROM dbo.cashback_transactions WHERE tipo = 'estornado') AS total_estornado,
          (SELECT COUNT(DISTINCT user_id) FROM dbo.cashback_transactions WHERE tipo = 'credito') AS usuarios_com_cashback`
    );
    const top = await query(
      `SELECT TOP 20 u.id, u.nome, u.email, u.cashback_balance
         FROM dbo.users u
        WHERE u.cashback_balance > 0
        ORDER BY u.cashback_balance DESC`
    );
    return { data: { totals: data[0], top_users: top } };
  });
}
