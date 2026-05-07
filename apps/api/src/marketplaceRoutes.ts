import { randomBytes } from "crypto";

import { FastifyInstance } from "fastify";
import { z } from "zod";

import { clientIp, hashPassword, requireAdmin, requireUser, signToken, verifyPassword } from "./auth.js";
import { writeAuditLog } from "./audit.js";
import { createBenefitActivation, shouldCreateActivationFor } from "./benefits.js";
import {
  debitCashback,
  ensureOrderCashbackCredit,
  effectiveCashbackPercent,
  listCashbackTransactions,
  loadCashbackBalance
} from "./cashback.js";
import { config } from "./config.js";
import { execute, query, sqlTypes, withTransaction } from "./db.js";
import {
  createMercadoPagoPayment,
  generatePaymentReference,
  generateVoucherCode,
  loadCachedPaymentStatus,
  normalizeMercadoPagoStatus,
  paymentStatusToOrderStatus,
  recordPaymentTransaction,
  reconcileOrderPaymentStatus,
  refundOrderManually
} from "./payments.js";
import { saveUpload } from "./upload.js";
import {
  checkinQrcodeSchema,
  createOrderSchema,
  forgotPasswordSchema,
  loginSchema,
  processCartPaymentSchema,
  processPaymentSchema,
  productSchema,
  refundOrderSchema,
  registerSchema
} from "./schemas.js";

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170);

const resetToken = () => randomBytes(24).toString("hex");

const eligibleOrderStatuses = "'confirmado', 'enviado', 'entregue'";

const levelCaseSql = `
  CASE
    WHEN monthly_acquisitions >= 10 THEN 'Ouro'
    WHEN monthly_acquisitions >= 5 THEN 'Prata'
    ELSE 'Bronze'
  END
`;

const nextLevelCaseSql = `
  CASE
    WHEN monthly_acquisitions >= 10 THEN 'Maximo'
    WHEN monthly_acquisitions >= 5 THEN 'Ouro'
    ELSE 'Prata'
  END
`;

async function getProductForCheckout(productId: number) {
  const products = await query<{
    id: number;
    nome: string;
    offer_type: string;
    delivery_method: "digital" | "presencial" | "fisica";
    tipo_entrega: "digital" | "fisico" | "ambos";
    preco_original: number;
    preco_desconto: number;
    economia_estimada: number;
    status: string;
    limite_resgates: number | null;
    cashback_percent: number | null;
  }>(
    `SELECT id, nome, offer_type, delivery_method, tipo_entrega, preco_original, preco_desconto, economia_estimada, status, limite_resgates, cashback_percent
       FROM dbo.products
      WHERE id = @id AND status = 'ativo'`,
    (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, productId)
  );

  return products[0];
}

// Records a check-in event for the given QR token (if present and active) and returns its id
// so the order created next can be linked back to the partner location.
async function resolveCheckinEventId(
  token: string | null | undefined,
  userId: number,
  request: import("fastify").FastifyRequest
): Promise<number | null> {
  if (!token) return null;
  const qrcodes = await query<{ id: number; status: string }>(
    `SELECT TOP 1 id, status FROM dbo.checkin_qrcodes WHERE token = @token`,
    (sqlRequest) => sqlRequest.input("token", sqlTypes.UniqueIdentifier, token)
  );
  const qr = qrcodes[0];
  if (!qr || qr.status !== "ativo") return null;

  const result = await execute<{ id: number }>(
    `INSERT INTO dbo.checkin_events (qrcode_id, user_id, ip_address, user_agent)
     OUTPUT INSERTED.id
     VALUES (@qrcode_id, @user_id, @ip, @ua)`,
    (sqlRequest) =>
      sqlRequest
        .input("qrcode_id", sqlTypes.BigInt, qr.id)
        .input("user_id", sqlTypes.BigInt, userId)
        .input("ip", sqlTypes.VarChar(64), clientIp(request))
        .input("ua", sqlTypes.NVarChar(240), (request.headers["user-agent"] as string | undefined) ?? null)
  );
  return result.recordset[0]?.id ?? null;
}

// Atomic stock decrement: returns false if the product has finite stock and is depleted.
async function tryDecrementStock(productId: number, quantidade = 1) {
  const result = await execute<{ id: number }>(
    `UPDATE dbo.products
        SET estoque = estoque - @quantidade,
            updated_at = SYSUTCDATETIME()
       OUTPUT INSERTED.id
      WHERE id = @id AND (estoque IS NULL OR estoque >= @quantidade)`,
    (sqlRequest) =>
      sqlRequest
        .input("id", sqlTypes.BigInt, productId)
        .input("quantidade", sqlTypes.Int, quantidade)
  );
  return result.recordset.length > 0;
}

async function restoreStock(productId: number, quantidade: number) {
  await execute(
    `UPDATE dbo.products SET estoque = estoque + @quantidade, updated_at = SYSUTCDATETIME()
      WHERE id = @id AND estoque IS NOT NULL`,
    (req) =>
      req
        .input("id", sqlTypes.BigInt, productId)
        .input("quantidade", sqlTypes.Int, quantidade)
  );
}

async function createOrderRecord(input: {
  userId: number;
  product: {
    id: number;
    nome: string;
    offer_type?: string | null;
    delivery_method?: "digital" | "presencial" | "fisica";
    tipo_entrega?: "digital" | "fisico" | "ambos";
    preco_original: number;
    preco_desconto: number;
    economia_estimada: number;
    limite_resgates?: number | null;
  };
  paymentStatus: string;
  paymentMethod: string;
  paymentReference?: string | null;
  mercadoPagoPaymentId?: string | number | null;
  mercadoPagoStatus?: string | null;
  cashbackApplied?: number;
  paidTotalOverride?: number | null;
  checkinEventId?: number | null;
}) {
  const userRows = await query<{
    email: string;
    endereco: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  }>(
    `SELECT email, endereco, numero, complemento, bairro, cidade, estado, cep
       FROM dbo.users
      WHERE id = @id`,
    (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, input.userId)
  );
  const profile = userRows[0];
  const enderecoEntrega = `${profile.endereco}, ${profile.numero}${profile.complemento ? ` - ${profile.complemento}` : ""}, ${profile.bairro}, ${profile.cidade}/${profile.estado}, CEP ${profile.cep}`;
  const deliveryType =
    input.product.delivery_method === "fisica" || input.product.tipo_entrega === "fisico" ? "fisico" : "digital";
  const paymentStatus = input.paymentStatus;
  const orderStatus = paymentStatusToOrderStatus(paymentStatus);
  const code = deliveryType === "digital" && paymentStatus === "approved" ? generateVoucherCode() : null;

  const paidTotal = input.paidTotalOverride != null ? input.paidTotalOverride : Number(input.product.preco_desconto);

  const result = await execute<{ id: number; public_code: string; voucher_code: string | null }>(
    `INSERT INTO dbo.product_orders (
        user_id, product_id, quantidade, valor_original_total, valor_pago_total,
        economia_total, tipo_entrega, email_entrega, endereco_entrega, voucher_code, status, payment_reference,
        payment_status, payment_method, mercado_pago_payment_id, mercado_pago_status, paid_at,
        cashback_aplicado, checkin_event_id
      )
      OUTPUT INSERTED.id, INSERTED.public_code, INSERTED.voucher_code
      VALUES (
        @user_id, @product_id, 1, @valor_original_total, @valor_pago_total,
        @economia_total, @tipo_entrega, @email_entrega, @endereco_entrega, @voucher_code, @status, @payment_reference,
        @payment_status, @payment_method, @mercado_pago_payment_id, @mercado_pago_status, @paid_at,
        @cashback_aplicado, @checkin_event_id
      )`,
    (sqlRequest) =>
      sqlRequest
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("product_id", sqlTypes.BigInt, input.product.id)
        .input("valor_original_total", sqlTypes.Decimal(12, 2), input.product.preco_original)
        .input("valor_pago_total", sqlTypes.Decimal(12, 2), paidTotal)
        .input("economia_total", sqlTypes.Decimal(12, 2), input.product.economia_estimada)
        .input("tipo_entrega", sqlTypes.VarChar(20), deliveryType)
        .input("email_entrega", sqlTypes.NVarChar(180), deliveryType === "digital" ? profile.email : null)
        .input("endereco_entrega", sqlTypes.NVarChar(500), enderecoEntrega)
        .input("voucher_code", sqlTypes.VarChar(40), code)
        .input("status", sqlTypes.VarChar(30), orderStatus)
        .input("payment_reference", sqlTypes.NVarChar(120), input.paymentReference ?? null)
        .input("payment_status", sqlTypes.VarChar(30), paymentStatus)
        .input("payment_method", sqlTypes.VarChar(30), input.paymentMethod)
        .input("mercado_pago_payment_id", sqlTypes.NVarChar(80), input.mercadoPagoPaymentId ? String(input.mercadoPagoPaymentId) : null)
        .input("mercado_pago_status", sqlTypes.NVarChar(80), input.mercadoPagoStatus ?? null)
        .input("paid_at", sqlTypes.DateTime2, paymentStatus === "approved" ? new Date() : null)
        .input("cashback_aplicado", sqlTypes.Decimal(12, 2), input.cashbackApplied ?? 0)
        .input("checkin_event_id", sqlTypes.BigInt, input.checkinEventId ?? null)
  );

  const orderRow = result.recordset[0];

  if (paymentStatus === "approved" && shouldCreateActivationFor(input.product)) {
    await createBenefitActivation({
      userId: input.userId,
      orderId: orderRow.id,
      voucherCode: orderRow.voucher_code,
      product: input.product
    }).catch((err) => {
      console.error("benefit_activation_failed", err);
    });
  }

  return orderRow;
}

export async function registerMarketplaceRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(body.senha);

    const result = await execute<{ id: number; email: string; nome: string; tipo_usuario: "passageiro" }>(
      `INSERT INTO dbo.users (
          nome, cpf, email, telefone, tipo_usuario, cidade, estado, status, password_hash,
          endereco, numero, complemento, bairro, cep
        )
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.nome, INSERTED.tipo_usuario
        VALUES (
          @nome, @cpf, @email, @telefone, 'passageiro', @cidade, @estado, 'ativo', @password_hash,
          @endereco, @numero, @complemento, @bairro, @cep
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("nome", sqlTypes.NVarChar(140), body.nome)
          .input("cpf", sqlTypes.VarChar(14), body.cpf)
          .input("email", sqlTypes.NVarChar(180), body.email.toLowerCase())
          .input("telefone", sqlTypes.VarChar(30), body.telefone)
          .input("cidade", sqlTypes.NVarChar(120), body.cidade)
          .input("estado", sqlTypes.Char(2), body.estado.toUpperCase())
          .input("password_hash", sqlTypes.NVarChar(255), passwordHash)
          .input("endereco", sqlTypes.NVarChar(240), body.endereco)
          .input("numero", sqlTypes.NVarChar(30), body.numero)
          .input("complemento", sqlTypes.NVarChar(120), body.complemento ?? null)
          .input("bairro", sqlTypes.NVarChar(120), body.bairro)
          .input("cep", sqlTypes.VarChar(12), body.cep)
    );

    const user = result.recordset[0];

    return reply.code(201).send({
      data: {
        user,
        token: signToken(user)
      }
    });
  });

  app.post(
    "/api/auth/bootstrap-admin",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" }
      }
    },
    async (request, reply) => {
      const body = loginSchema
        .extend({
          nome: z.string().trim().min(2).optional(),
          bootstrap_token: z.string().min(1).optional()
        })
        .parse(request.body);
      const ip = clientIp(request);

      // Require a configured shared secret for the public endpoint, and constant-time compare it.
      const expected = config.adminBootstrapToken;
      const providedHeader = (request.headers["x-admin-bootstrap-token"] as string | undefined) ?? null;
      const provided = (body.bootstrap_token ?? providedHeader ?? "").trim();
      if (!expected) {
        await writeAuditLog({
          action: "auth.bootstrap_blocked_no_token_configured",
          entityType: "user",
          payload: { reason: "ADMIN_BOOTSTRAP_TOKEN not configured", email: body.email.toLowerCase() },
          ipAddress: ip
        });
        return reply.code(403).send({ error: "bootstrap_token_required" });
      }
      const valid =
        provided.length === expected.length &&
        // timingSafeEqual requires equal-length buffers; checking length first avoids leaks.
        (await import("crypto")).timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (!valid) {
        await writeAuditLog({
          action: "auth.bootstrap_invalid_token",
          entityType: "user",
          payload: { email: body.email.toLowerCase() },
          ipAddress: ip
        });
        return reply.code(401).send({ error: "invalid_bootstrap_token" });
      }

      // Block if any *active* admin already exists. This prevents reopening the bootstrap window when
      // a single admin is soft-deleted or marked inactive.
      const existingAdmins = await query<{ total: number }>(
        "SELECT COUNT(*) AS total FROM dbo.users WHERE tipo_usuario = 'admin'"
      );
      if (Number(existingAdmins[0]?.total ?? 0) > 0) {
        await writeAuditLog({
          action: "auth.bootstrap_blocked_admin_exists",
          entityType: "user",
          payload: { email: body.email.toLowerCase() },
          ipAddress: ip
        });
        return reply.code(403).send({ error: "admin_already_exists" });
      }

      // Stronger password policy for the very first admin.
      if (body.senha.length < 12) {
        return reply.code(400).send({ error: "weak_admin_password" });
      }

      const passwordHash = await hashPassword(body.senha);
      const existingUsers = await query<{
        id: number;
        email: string;
        nome: string;
        password_hash: string | null;
      }>(
        `SELECT id, email, nome, password_hash
           FROM dbo.users
          WHERE email = @email`,
        (sqlRequest) => sqlRequest.input("email", sqlTypes.NVarChar(180), body.email.toLowerCase())
      );

      if (existingUsers[0]) {
        // Refuse to take over a real, password-bearing account: the operator must pick a fresh email.
        if (existingUsers[0].password_hash) {
          await writeAuditLog({
            action: "auth.bootstrap_blocked_account_takeover",
            entityType: "user",
            entityId: existingUsers[0].id,
            payload: { email: body.email.toLowerCase() },
            ipAddress: ip
          });
          return reply.code(409).send({ error: "email_already_in_use" });
        }

        await execute(
          `UPDATE dbo.users
              SET nome = @nome,
                  tipo_usuario = 'admin',
                  status = 'ativo',
                  password_hash = @password_hash,
                  token_version = COALESCE(token_version, 0) + 1,
                  updated_at = SYSUTCDATETIME()
            WHERE id = @id`,
          (sqlRequest) =>
            sqlRequest
              .input("id", sqlTypes.BigInt, existingUsers[0].id)
              .input("nome", sqlTypes.NVarChar(140), body.nome ?? existingUsers[0].nome)
              .input("password_hash", sqlTypes.NVarChar(255), passwordHash)
        );

        const promoted = {
          id: existingUsers[0].id,
          email: existingUsers[0].email,
          nome: body.nome ?? existingUsers[0].nome,
          tipo_usuario: "admin" as const,
          token_version: 1
        };

        await writeAuditLog({
          actorId: promoted.id,
          action: "auth.bootstrap_promoted",
          entityType: "user",
          entityId: promoted.id,
          payload: { email: promoted.email },
          ipAddress: ip
        });

        return reply.code(201).send({
          data: {
            user: { id: promoted.id, email: promoted.email, nome: promoted.nome, tipo_usuario: promoted.tipo_usuario },
            token: signToken(promoted)
          }
        });
      }

      const result = await execute<{ id: number; email: string; nome: string; tipo_usuario: "admin" }>(
        `INSERT INTO dbo.users (
            nome, email, tipo_usuario, status, password_hash, telefone,
            endereco, numero, bairro, cidade, estado, cep
          )
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.nome, INSERTED.tipo_usuario
          VALUES (
            @nome, @email, 'admin', 'ativo', @password_hash, '',
            'Endereco administrativo', '0', 'Centro', 'Brasilia', 'DF', '00000000'
          )`,
        (sqlRequest) =>
          sqlRequest
            .input("nome", sqlTypes.NVarChar(140), body.nome ?? "Administrador Open Driver")
            .input("email", sqlTypes.NVarChar(180), body.email.toLowerCase())
            .input("password_hash", sqlTypes.NVarChar(255), passwordHash)
      );
      const user = { ...result.recordset[0], token_version: 0 };

      await writeAuditLog({
        actorId: user.id,
        action: "auth.bootstrap_created",
        entityType: "user",
        entityId: user.id,
        payload: { email: user.email },
        ipAddress: ip
      });

      return reply.code(201).send({
        data: {
          user: { id: user.id, email: user.email, nome: user.nome, tipo_usuario: user.tipo_usuario },
          token: signToken(user)
        }
      });
    }
  );

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const ip = clientIp(request);
      const emailLower = body.email.toLowerCase();
      const users = await query<{
        id: number;
        email: string;
        nome: string;
        tipo_usuario: "motorista" | "passageiro" | "parceiro" | "admin";
        password_hash: string | null;
        status: string;
        token_version: number;
        failed_login_count: number;
        lockout_until: Date | null;
        partner_id: number | null;
        password_must_change: boolean | number;
      }>(
        `SELECT id, email, nome, tipo_usuario, password_hash, status,
                COALESCE(token_version, 0) AS token_version,
                COALESCE(failed_login_count, 0) AS failed_login_count,
                lockout_until,
                partner_id,
                COALESCE(password_must_change, 0) AS password_must_change
           FROM dbo.users
          WHERE email = @email`,
        (sqlRequest) => sqlRequest.input("email", sqlTypes.NVarChar(180), emailLower)
      );

      const user = users[0];
      const now = new Date();

      // If the account is locked out, refuse before even running bcrypt — but keep the response uniform.
      if (user?.lockout_until && new Date(user.lockout_until).getTime() > now.getTime()) {
        await writeAuditLog({
          action: "auth.login_blocked_lockout",
          entityType: "user",
          entityId: user.id,
          payload: { email: emailLower },
          ipAddress: ip
        });
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      const valid = user?.password_hash ? await verifyPassword(body.senha, user.password_hash) : false;

      if (!user || !valid || user.status !== "ativo") {
        if (user) {
          const nextCount = Number(user.failed_login_count ?? 0) + 1;
          const lockoutUntil = nextCount >= 10 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
          await execute(
            `UPDATE dbo.users
                SET failed_login_count = @count,
                    lockout_until = @lockout_until,
                    updated_at = SYSUTCDATETIME()
              WHERE id = @id`,
            (sqlRequest) =>
              sqlRequest
                .input("id", sqlTypes.BigInt, user.id)
                .input("count", sqlTypes.Int, nextCount)
                .input("lockout_until", sqlTypes.DateTime2, lockoutUntil)
          );
          await writeAuditLog({
            action: "auth.login_failed",
            entityType: "user",
            entityId: user.id,
            payload: { email: emailLower, attempts: nextCount, locked: Boolean(lockoutUntil) },
            ipAddress: ip
          });
        } else {
          await writeAuditLog({
            action: "auth.login_failed_unknown_user",
            entityType: "user",
            payload: { email: emailLower },
            ipAddress: ip
          });
        }
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      await execute(
        `UPDATE dbo.users
            SET failed_login_count = 0,
                lockout_until = NULL,
                last_login_at = SYSUTCDATETIME(),
                updated_at = SYSUTCDATETIME()
          WHERE id = @id`,
        (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, user.id)
      );

      await writeAuditLog({
        actorId: user.id,
        action: user.tipo_usuario === "admin" ? "auth.admin_login" : "auth.login",
        entityType: "user",
        entityId: user.id,
        payload: { email: user.email },
        ipAddress: ip
      });

      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            nome: user.nome,
            tipo_usuario: user.tipo_usuario,
            partner_id: user.partner_id == null ? null : Number(user.partner_id),
            password_must_change: Boolean(user.password_must_change)
          },
          token: signToken({
            id: user.id,
            email: user.email,
            nome: user.nome,
            tipo_usuario: user.tipo_usuario,
            token_version: user.token_version
          })
        }
      };
    }
  );

  // Authenticated user changes their own password. Used by the partner terminal to
  // clear password_must_change after the initial '123456' was assigned by the admin.
  app.post(
    "/api/auth/change-password",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" }
      }
    },
    async (request, reply) => {
      const actor = await requireUser(request);
      const body = z
        .object({
          current_password: z.string().min(1),
          new_password: z.string().min(6).max(120)
        })
        .parse(request.body);

      const rows = await query<{ password_hash: string | null }>(
        `SELECT password_hash FROM dbo.users WHERE id = @id`,
        (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, actor.id)
      );
      const ok = rows[0]?.password_hash
        ? await verifyPassword(body.current_password, rows[0].password_hash)
        : false;
      if (!ok) {
        await writeAuditLog({
          actorId: actor.id,
          action: "auth.change_password_failed",
          entityType: "user",
          entityId: actor.id,
          ipAddress: clientIp(request)
        });
        return reply.code(401).send({ error: "invalid_current_password" });
      }
      if (body.new_password === body.current_password) {
        return reply.code(400).send({ error: "new_password_same_as_current" });
      }

      const newHash = await hashPassword(body.new_password);
      await execute(
        `UPDATE dbo.users
            SET password_hash = @hash,
                password_must_change = 0,
                token_version = COALESCE(token_version, 0) + 1,
                updated_at = SYSUTCDATETIME()
          WHERE id = @id`,
        (sqlRequest) =>
          sqlRequest
            .input("id", sqlTypes.BigInt, actor.id)
            .input("hash", sqlTypes.NVarChar(255), newHash)
      );

      await writeAuditLog({
        actorId: actor.id,
        action: "auth.change_password",
        entityType: "user",
        entityId: actor.id,
        ipAddress: clientIp(request)
      });

      // Re-issue a fresh token reflecting the bumped token_version so the client doesn't 401.
      const freshUser = {
        ...actor,
        token_version: (actor.token_version ?? 0) + 1
      };
      return reply.send({
        data: {
          token: signToken(freshUser),
          password_must_change: false
        }
      });
    }
  );

  app.post(
    "/api/auth/forgot-password",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "10 minutes" }
      }
    },
    async (request) => {
      const body = forgotPasswordSchema.parse(request.body);
      const ip = clientIp(request);
      const token = resetToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      await execute(
        `UPDATE dbo.users
            SET reset_token = @reset_token,
                reset_token_expires_at = @expires_at,
                updated_at = SYSUTCDATETIME()
          WHERE email = @email`,
        (sqlRequest) =>
          sqlRequest
            .input("email", sqlTypes.NVarChar(180), body.email.toLowerCase())
            .input("reset_token", sqlTypes.NVarChar(120), token)
            .input("expires_at", sqlTypes.DateTime2, expiresAt)
      );

      // Always return a uniform response regardless of whether the email exists, to avoid enumeration.
      await writeAuditLog({
        action: "auth.forgot_password_requested",
        entityType: "user",
        payload: { email: body.email.toLowerCase() },
        ipAddress: ip
      });

      return { data: { sent: true } };
    }
  );

  app.post("/api/auth/logout", async (request, reply) => {
    // Bumping token_version revokes every JWT previously signed for this user.
    const user = await requireUser(request);
    await execute(
      `UPDATE dbo.users
          SET token_version = COALESCE(token_version, 0) + 1,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, user.id)
    );
    await writeAuditLog({
      actorId: user.id,
      action: "auth.logout",
      entityType: "user",
      entityId: user.id,
      ipAddress: clientIp(request)
    });
    return reply.code(204).send();
  });

  app.get("/api/me", async (request) => {
    const user = await requireUser(request);
    const profile = await query(
      `SELECT id, nome, cpf, email, telefone, tipo_usuario, cidade, estado, endereco, numero,
              complemento, bairro, cep, partner_id,
              CAST(COALESCE(password_must_change, 0) AS BIT) AS password_must_change
         FROM dbo.users
        WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, user.id)
    );

    return { data: profile[0] };
  });

  app.get("/api/product-categories", async () => {
    const data = await query(
      `SELECT id, nome, slug, descricao
         FROM dbo.product_categories
        WHERE ativo = 1
        ORDER BY ordem, nome`
    );

    return { data };
  });

  app.get("/api/products", async (request) => {
    const queryParams = request.query as {
      category?: string;
      featured?: string;
      offer_type?: string;
      partner_id?: string;
    };
    const partnerId = queryParams.partner_id ? Number(queryParams.partner_id) : null;
    const data = await query(
      `SELECT p.*, c.nome AS categoria_nome, c.slug AS categoria_slug,
              pa.nome_fantasia AS partner_nome
         FROM dbo.products p
         LEFT JOIN dbo.product_categories c ON c.id = p.category_id
         LEFT JOIN dbo.partners pa ON pa.id = p.partner_id
        WHERE p.status = 'ativo'
          AND p.deleted_at IS NULL
          AND (@category IS NULL OR c.slug = @category)
          AND (@offer_type IS NULL OR p.offer_type = @offer_type)
          AND (@featured IS NULL OR p.destaque_home = 1)
          AND (@partner_id IS NULL OR p.partner_id = @partner_id)
        ORDER BY p.destaque_home DESC, p.economia_mensal_estimada DESC, p.created_at DESC`,
      (sqlRequest) =>
        sqlRequest
          .input("category", sqlTypes.VarChar(140), queryParams.category ?? null)
          .input("offer_type", sqlTypes.VarChar(30), queryParams.offer_type ?? null)
          .input("featured", sqlTypes.VarChar(10), queryParams.featured ?? null)
          .input("partner_id", sqlTypes.BigInt, partnerId && Number.isFinite(partnerId) ? partnerId : null)
    );

    return { data };
  });

  // Public: list active partners that have at least one published product.
  // Used by the homepage filter.
  app.get("/api/partners", async () => {
    const data = await query(
      `SELECT p.id, p.nome_fantasia, p.cidade, p.estado,
              (SELECT COUNT(*) FROM dbo.products pr
                 WHERE pr.partner_id = p.id
                   AND pr.status = 'ativo'
                   AND pr.deleted_at IS NULL) AS total_produtos
         FROM dbo.partners p
        WHERE p.status = 'ativo'
        ORDER BY total_produtos DESC, p.nome_fantasia`
    );
    return { data };
  });

  // Public: list active partner locations with coordinates so the homepage
  // can render "lojas proximas" and order by distance client-side.
  app.get("/api/partner-locations", async () => {
    const data = await query(
      `SELECT pl.id, pl.partner_id, pl.nome, pl.endereco, pl.latitude, pl.longitude,
              pl.raio_metros, p.nome_fantasia AS partner_nome, p.cidade, p.estado,
              (SELECT TOP 1 CAST(token AS NVARCHAR(36)) FROM dbo.checkin_qrcodes q
                 WHERE q.partner_location_id = pl.id AND q.status = 'ativo'
                 ORDER BY q.created_at DESC) AS checkin_token
         FROM dbo.partner_locations pl
         JOIN dbo.partners p ON p.id = pl.partner_id
        WHERE pl.status = 'ativo' AND p.status = 'ativo'
        ORDER BY pl.created_at DESC`
    );
    return { data };
  });

  app.get("/api/products/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const slug = params.slug;
    const numericId = /^\d+$/.test(slug) ? Number(slug) : null;

    const data = numericId
      ? await query(
          `SELECT p.*, c.nome AS categoria_nome, c.slug AS categoria_slug
             FROM dbo.products p
             LEFT JOIN dbo.product_categories c ON c.id = p.category_id
            WHERE p.id = @id AND p.status = 'ativo' AND p.deleted_at IS NULL`,
          (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, numericId)
        )
      : await query(
          `SELECT p.*, c.nome AS categoria_nome, c.slug AS categoria_slug
             FROM dbo.products p
             LEFT JOIN dbo.product_categories c ON c.id = p.category_id
            WHERE p.slug = @slug AND p.status = 'ativo' AND p.deleted_at IS NULL`,
          (sqlRequest) => sqlRequest.input("slug", sqlTypes.VarChar(180), slug)
        );

    if (!data[0]) {
      return reply.code(404).send({ error: "product_not_found" });
    }

    return { data: data[0] };
  });

  app.post("/api/admin/uploads", async (request, reply) => {
    await requireAdmin(request);
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ error: "file_required" });
    }

    const data = await saveUpload(file);

    return reply.code(201).send({ data });
  });

  app.get("/api/admin/products", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT p.*, c.nome AS categoria_nome, pa.nome_fantasia AS partner_nome
         FROM dbo.products p
         LEFT JOIN dbo.product_categories c ON c.id = p.category_id
         LEFT JOIN dbo.partners pa ON pa.id = p.partner_id
        WHERE p.deleted_at IS NULL
        ORDER BY p.created_at DESC`
    );

    return { data };
  });

  app.get("/api/admin/session", async (request) => {
    const user = await requireAdmin(request);

    return {
      data: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        tipo_usuario: user.tipo_usuario
      }
    };
  });

  app.get("/api/admin/metrics", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT
          (SELECT COUNT(*) FROM dbo.users) AS total_usuarios,
          (SELECT COUNT(*) FROM dbo.users WHERE status = 'ativo') AS usuarios_ativos,
          (SELECT COUNT(*) FROM dbo.products) AS total_produtos,
          (SELECT COUNT(*) FROM dbo.products WHERE status = 'ativo') AS produtos_ativos,
          (SELECT COUNT(*) FROM dbo.product_orders) AS total_pedidos,
          (SELECT COUNT(*) FROM dbo.product_orders WHERE created_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS pedidos_mes,
          (SELECT COALESCE(SUM(valor_pago_total), 0) FROM dbo.product_orders WHERE status IN (${eligibleOrderStatuses})) AS receita_produtos,
          (SELECT COALESCE(SUM(economia_total), 0) FROM dbo.product_orders WHERE status IN (${eligibleOrderStatuses})) AS economia_gerada,
          (SELECT COALESCE(AVG(CAST(valor_pago_total AS DECIMAL(12,2))), 0) FROM dbo.product_orders WHERE status IN (${eligibleOrderStatuses})) AS ticket_medio,
          (SELECT COUNT(*) FROM dbo.product_orders WHERE payment_status = 'approved') AS pagamentos_aprovados,
          (SELECT COUNT(*) FROM dbo.product_orders WHERE payment_status = 'pending') AS pagamentos_pendentes,
          (SELECT COUNT(*) FROM dbo.product_orders WHERE payment_status = 'rejected') AS pagamentos_recusados,
          (SELECT COUNT(*) FROM dbo.page_events WHERE event_name = 'home_view') AS home_views,
          (SELECT COUNT(*) FROM dbo.page_events WHERE event_name IN ('checkout_started', 'purchase_completed')) AS home_conversions,
          (SELECT COALESCE(SUM(o.valor_pago_total), 0) FROM dbo.product_orders o JOIN dbo.products p ON p.id = o.product_id WHERE o.status IN (${eligibleOrderStatuses}) AND p.offer_type = 'produto_fisico') AS receita_produto_fisico,
          (SELECT COALESCE(SUM(o.valor_pago_total), 0) FROM dbo.product_orders o JOIN dbo.products p ON p.id = o.product_id WHERE o.status IN (${eligibleOrderStatuses}) AND p.offer_type = 'produto_digital') AS receita_produto_digital,
          (SELECT COALESCE(SUM(o.valor_pago_total), 0) FROM dbo.product_orders o JOIN dbo.products p ON p.id = o.product_id WHERE o.status IN (${eligibleOrderStatuses}) AND p.offer_type = 'servico') AS receita_servico,
          (SELECT COALESCE(SUM(o.valor_pago_total), 0) FROM dbo.product_orders o JOIN dbo.products p ON p.id = o.product_id WHERE o.status IN (${eligibleOrderStatuses}) AND p.offer_type = 'voucher') AS receita_voucher,
          (SELECT COUNT(*) FROM dbo.leads) AS total_leads,
          (SELECT COUNT(*) FROM dbo.bot_interactions) AS total_interacoes_bot,
          (SELECT COUNT(*) FROM (
             SELECT user_id
               FROM dbo.product_orders
              WHERE status IN (${eligibleOrderStatuses})
                AND created_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)
              GROUP BY user_id
             HAVING COUNT(*) >= 5
           ) eligible) AS usuarios_com_nivel`
    );

    return { data: data[0] };
  });

  app.get("/api/admin/users", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `WITH monthly AS (
          SELECT user_id, COUNT(*) AS monthly_acquisitions
            FROM dbo.product_orders
           WHERE status IN (${eligibleOrderStatuses})
             AND created_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)
           GROUP BY user_id
        ),
        totals AS (
          SELECT user_id,
                 COUNT(*) AS total_orders,
                 COALESCE(SUM(economia_total), 0) AS total_savings
            FROM dbo.product_orders
           WHERE status IN (${eligibleOrderStatuses})
           GROUP BY user_id
        ),
        base AS (
          SELECT u.id, u.nome, u.email, u.telefone, u.tipo_usuario, u.cidade, u.estado, u.status,
                 u.created_at,
                 COALESCE(m.monthly_acquisitions, 0) AS monthly_acquisitions,
                 COALESCE(t.total_orders, 0) AS total_orders,
                 COALESCE(t.total_savings, 0) AS total_savings
            FROM dbo.users u
            LEFT JOIN monthly m ON m.user_id = u.id
            LEFT JOIN totals t ON t.user_id = u.id
        )
        SELECT *,
               ${levelCaseSql} AS nivel_atual,
               ${nextLevelCaseSql} AS proximo_nivel,
               CASE WHEN monthly_acquisitions >= 5 THEN 'nivel_liberado' ELSE 'em_progresso' END AS nivel_status,
               CASE WHEN monthly_acquisitions >= 5 THEN 0 ELSE 5 - monthly_acquisitions END AS faltam_para_subir
          FROM base
         ORDER BY created_at DESC`
    );

    return { data };
  });

  app.get("/api/admin/orders", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT o.*, u.nome AS usuario_nome, u.email AS usuario_email, p.nome AS produto_nome,
              p.tipo AS produto_tipo, p.offer_type, p.delivery_method, p.imagem_url
         FROM dbo.product_orders o
         JOIN dbo.users u ON u.id = o.user_id
         JOIN dbo.products p ON p.id = o.product_id
        ORDER BY o.created_at DESC`
    );

    return { data };
  });

  app.post("/api/admin/products", async (request, reply) => {
    await requireAdmin(request);
    const body = productSchema.parse(request.body);
    const slug = slugify(body.slug ?? body.nome);
    const economy = body.economia_estimada ?? Math.max(body.preco_original - body.preco_desconto, 0);

    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.products (
          category_id, partner_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega,
          preco_original, preco_desconto, economia_estimada, economia_mensal_estimada,
          imagem_url, gallery_urls, video_url, usage_rules, delivery_deadline,
          estoque, limite_resgates, destaque_home, status, offer_type, delivery_method,
          cashback_percent
        )
        OUTPUT INSERTED.id
        VALUES (
          @category_id, @partner_id, @nome, @slug, @descricao_curta, @descricao, @tipo, @tipo_entrega,
          @preco_original, @preco_desconto, @economia_estimada, @economia_mensal_estimada,
          @imagem_url, @gallery_urls, @video_url, @usage_rules, @delivery_deadline,
          @estoque, @limite_resgates, @destaque_home, @status, @offer_type, @delivery_method,
          @cashback_percent
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("category_id", sqlTypes.BigInt, body.category_id ?? null)
          .input("partner_id", sqlTypes.BigInt, body.partner_id ?? null)
          .input("nome", sqlTypes.NVarChar(160), body.nome)
          .input("slug", sqlTypes.VarChar(180), slug)
          .input("descricao_curta", sqlTypes.NVarChar(280), body.descricao_curta)
          .input("descricao", sqlTypes.NVarChar(sqlTypes.MAX), body.descricao)
          .input("tipo", sqlTypes.VarChar(20), body.tipo)
          .input("tipo_entrega", sqlTypes.VarChar(20), body.tipo_entrega)
          .input("offer_type", sqlTypes.VarChar(30), body.offer_type)
          .input("delivery_method", sqlTypes.VarChar(30), body.delivery_method)
          .input("preco_original", sqlTypes.Decimal(12, 2), body.preco_original)
          .input("preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto)
          .input("economia_estimada", sqlTypes.Decimal(12, 2), economy)
          .input("economia_mensal_estimada", sqlTypes.Decimal(12, 2), body.economia_mensal_estimada)
          .input("imagem_url", sqlTypes.NVarChar(500), body.imagem_url ?? null)
          .input("gallery_urls", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify(body.gallery_urls ?? []))
          .input("video_url", sqlTypes.NVarChar(500), body.video_url ?? null)
          .input("usage_rules", sqlTypes.NVarChar(sqlTypes.MAX), body.usage_rules ?? null)
          .input("delivery_deadline", sqlTypes.NVarChar(120), body.delivery_deadline ?? null)
          .input("estoque", sqlTypes.Int, body.estoque ?? null)
          .input("limite_resgates", sqlTypes.Int, body.limite_resgates ?? null)
          .input("destaque_home", sqlTypes.Bit, body.destaque_home)
          .input("status", sqlTypes.VarChar(20), body.status)
          .input("cashback_percent", sqlTypes.Decimal(5, 2), body.cashback_percent ?? null)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.put("/api/admin/products/:id", async (request) => {
    await requireAdmin(request);
    const params = request.params as { id: string };
    const body = productSchema.parse(request.body);
    const slug = slugify(body.slug ?? body.nome);
    const economy = body.economia_estimada ?? Math.max(body.preco_original - body.preco_desconto, 0);

    await execute(
      `UPDATE dbo.products
          SET category_id = @category_id,
              partner_id = @partner_id,
              nome = @nome,
              slug = @slug,
              descricao_curta = @descricao_curta,
              descricao = @descricao,
              tipo = @tipo,
              tipo_entrega = @tipo_entrega,
              offer_type = @offer_type,
              delivery_method = @delivery_method,
              preco_original = @preco_original,
              preco_desconto = @preco_desconto,
              economia_estimada = @economia_estimada,
              economia_mensal_estimada = @economia_mensal_estimada,
              imagem_url = @imagem_url,
              gallery_urls = @gallery_urls,
              video_url = @video_url,
              usage_rules = @usage_rules,
              delivery_deadline = @delivery_deadline,
              estoque = @estoque,
              limite_resgates = @limite_resgates,
              destaque_home = @destaque_home,
              status = @status,
              cashback_percent = @cashback_percent,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("category_id", sqlTypes.BigInt, body.category_id ?? null)
          .input("partner_id", sqlTypes.BigInt, body.partner_id ?? null)
          .input("nome", sqlTypes.NVarChar(160), body.nome)
          .input("slug", sqlTypes.VarChar(180), slug)
          .input("descricao_curta", sqlTypes.NVarChar(280), body.descricao_curta)
          .input("descricao", sqlTypes.NVarChar(sqlTypes.MAX), body.descricao)
          .input("tipo", sqlTypes.VarChar(20), body.tipo)
          .input("tipo_entrega", sqlTypes.VarChar(20), body.tipo_entrega)
          .input("offer_type", sqlTypes.VarChar(30), body.offer_type)
          .input("delivery_method", sqlTypes.VarChar(30), body.delivery_method)
          .input("preco_original", sqlTypes.Decimal(12, 2), body.preco_original)
          .input("preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto)
          .input("economia_estimada", sqlTypes.Decimal(12, 2), economy)
          .input("economia_mensal_estimada", sqlTypes.Decimal(12, 2), body.economia_mensal_estimada)
          .input("imagem_url", sqlTypes.NVarChar(500), body.imagem_url ?? null)
          .input("gallery_urls", sqlTypes.NVarChar(sqlTypes.MAX), JSON.stringify(body.gallery_urls ?? []))
          .input("video_url", sqlTypes.NVarChar(500), body.video_url ?? null)
          .input("usage_rules", sqlTypes.NVarChar(sqlTypes.MAX), body.usage_rules ?? null)
          .input("delivery_deadline", sqlTypes.NVarChar(120), body.delivery_deadline ?? null)
          .input("estoque", sqlTypes.Int, body.estoque ?? null)
          .input("limite_resgates", sqlTypes.Int, body.limite_resgates ?? null)
          .input("destaque_home", sqlTypes.Bit, body.destaque_home)
          .input("status", sqlTypes.VarChar(20), body.status)
          .input("cashback_percent", sqlTypes.Decimal(5, 2), body.cashback_percent ?? null)
    );

    return { data: { id: Number(params.id) } };
  });

  app.patch("/api/admin/products/:id/status", async (request) => {
    await requireAdmin(request);
    const params = request.params as { id: string };
    const body = z.object({ status: z.enum(["ativo", "pausado", "esgotado", "rascunho"]) }).parse(request.body);

    await execute(
      `UPDATE dbo.products
          SET status = @status,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("status", sqlTypes.VarChar(20), body.status)
    );

    return { data: { id: Number(params.id), status: body.status } };
  });

  app.post("/api/admin/products/activate-all", async (request) => {
    await requireAdmin(request);

    const result = await execute<{ affected: number }>(
      `UPDATE dbo.products
          SET status = 'ativo',
              updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id AS affected
        WHERE status IN ('pausado', 'rascunho')`
    );

    return { data: { affected: result.recordset.length } };
  });

  app.delete("/api/admin/products/:id", async (request) => {
    const admin = await requireAdmin(request);
    const params = request.params as { id: string };
    const id = Number(params.id);

    // Hard delete is only safe when no order ever referenced the product. If anything
    // points to it, fall back to a soft delete so historical orders/cashback ledgers
    // keep their FK targets intact but the product disappears from listings.
    const orderRows = await query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM dbo.product_orders WHERE product_id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, id)
    );
    const hasOrders = Number(orderRows[0]?.total ?? 0) > 0;

    if (!hasOrders) {
      // Wipe references in tables we own that don't have FK to product_orders.
      await execute(
        `DELETE FROM dbo.checkin_qrcode_products WHERE product_id = @id`,
        (req) => req.input("id", sqlTypes.BigInt, id)
      );
      await execute(
        `DELETE FROM dbo.products WHERE id = @id`,
        (req) => req.input("id", sqlTypes.BigInt, id)
      );
      await writeAuditLog({
        actorId: admin.id,
        action: "product.hard_deleted",
        entityType: "product",
        entityId: id
      });
      return { data: { id, deleted: true, mode: "hard" } };
    }

    await execute(
      `UPDATE dbo.products
          SET status = 'pausado',
              deleted_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, id)
    );
    // Detach from any check-in QR so customers stop seeing it.
    await execute(
      `DELETE FROM dbo.checkin_qrcode_products WHERE product_id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, id)
    );

    await writeAuditLog({
      actorId: admin.id,
      action: "product.soft_deleted",
      entityType: "product",
      entityId: id,
      payload: { reason: "has_orders" }
    });

    return { data: { id, deleted: true, mode: "soft" } };
  });

  app.patch("/api/admin/orders/:id/status", async (request) => {
    await requireAdmin(request);
    const params = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["pendente_pagamento", "confirmado", "enviado", "entregue", "cancelado"])
      })
      .parse(request.body);

    const orders = await query<{ user_id: number; produto_nome: string }>(
      `SELECT o.user_id, p.nome AS produto_nome
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, Number(params.id))
    );

    await execute(
      `UPDATE dbo.product_orders
          SET status = @status,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("status", sqlTypes.VarChar(30), body.status)
    );

    if (orders[0]) {
      await execute(
        `INSERT INTO dbo.notifications (user_id, titulo, mensagem, canal)
         VALUES (@user_id, @titulo, @mensagem, 'interno')`,
        (sqlRequest) =>
          sqlRequest
            .input("user_id", sqlTypes.BigInt, orders[0].user_id)
            .input("titulo", sqlTypes.NVarChar(160), "Status do pedido atualizado")
            .input(
              "mensagem",
              sqlTypes.NVarChar(700),
              `Seu pedido de ${orders[0].produto_nome} foi atualizado para ${body.status}.`
            )
      );
    }

    return { data: { id: Number(params.id), status: body.status } };
  });

  app.post("/api/orders", async (request, reply) => {
    const user = await requireUser(request);
    const body = createOrderSchema.parse(request.body);
    const products = await query<{
      id: number;
      nome: string;
      tipo_entrega: "digital" | "fisico" | "ambos";
      preco_original: number;
      preco_desconto: number;
      economia_estimada: number;
      payment_required: boolean;
      status: string;
      offer_type: string;
      delivery_method: "digital" | "presencial" | "fisica";
      limite_resgates: number | null;
    }>(
      `SELECT id, nome, tipo_entrega, preco_original, preco_desconto, economia_estimada, payment_required, status,
              offer_type, delivery_method, limite_resgates
         FROM dbo.products
        WHERE id = @id AND status = 'ativo'`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, body.product_id)
    );
    const product = products[0];

    if (!product) {
      return reply.code(404).send({ error: "product_not_found" });
    }

    if (product.payment_required) {
      return reply.code(409).send({ error: "payment_required_use_process_payment" });
    }

    const deliveryType =
      body.tipo_entrega ?? (product.tipo_entrega === "fisico" ? "fisico" : "digital");

    if (product.tipo_entrega !== "ambos" && product.tipo_entrega !== deliveryType) {
      return reply.code(400).send({ error: "invalid_delivery_type" });
    }

    const stockOk = await tryDecrementStock(product.id);
    if (!stockOk) {
      return reply.code(409).send({ error: "out_of_stock" });
    }

    const userRows = await query<{
      email: string;
      endereco: string;
      numero: string;
      complemento: string | null;
      bairro: string;
      cidade: string;
      estado: string;
      cep: string;
    }>(
      `SELECT email, endereco, numero, complemento, bairro, cidade, estado, cep
         FROM dbo.users
        WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, user.id)
    );
    const profile = userRows[0];
    const enderecoEntrega = `${profile.endereco}, ${profile.numero}${profile.complemento ? ` - ${profile.complemento}` : ""}, ${profile.bairro}, ${profile.cidade}/${profile.estado}, CEP ${profile.cep}`;
    const quantidade = body.quantidade;
    const originalTotal = Number(product.preco_original) * quantidade;
    const paidTotal = Number(product.preco_desconto) * quantidade;
    const economyTotal = Number(product.economia_estimada) * quantidade;
    const code = deliveryType === "digital" ? generateVoucherCode() : null;

    const result = await execute<{ id: number; public_code: string; voucher_code: string | null }>(
      `INSERT INTO dbo.product_orders (
          user_id, product_id, quantidade, valor_original_total, valor_pago_total,
          economia_total, tipo_entrega, email_entrega, endereco_entrega, voucher_code, status
        )
        OUTPUT INSERTED.id, INSERTED.public_code, INSERTED.voucher_code
        VALUES (
          @user_id, @product_id, @quantidade, @valor_original_total, @valor_pago_total,
          @economia_total, @tipo_entrega, @email_entrega, @endereco_entrega, @voucher_code, 'confirmado'
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("user_id", sqlTypes.BigInt, user.id)
          .input("product_id", sqlTypes.BigInt, product.id)
          .input("quantidade", sqlTypes.Int, quantidade)
          .input("valor_original_total", sqlTypes.Decimal(12, 2), originalTotal)
          .input("valor_pago_total", sqlTypes.Decimal(12, 2), paidTotal)
          .input("economia_total", sqlTypes.Decimal(12, 2), economyTotal)
          .input("tipo_entrega", sqlTypes.VarChar(20), deliveryType)
          .input("email_entrega", sqlTypes.NVarChar(180), deliveryType === "digital" ? profile.email : null)
          .input("endereco_entrega", sqlTypes.NVarChar(500), enderecoEntrega)
          .input("voucher_code", sqlTypes.VarChar(40), code)
    );

    if (shouldCreateActivationFor(product)) {
      await createBenefitActivation({
        userId: user.id,
        orderId: result.recordset[0].id,
        voucherCode: result.recordset[0].voucher_code,
        product
      }).catch((err) => {
        request.log.error({ err }, "benefit_activation_failed");
      });
    }

    await execute(
      `INSERT INTO dbo.notifications (user_id, titulo, mensagem, canal)
       VALUES (@user_id, @titulo, @mensagem, 'interno')`,
      (sqlRequest) =>
        sqlRequest
          .input("user_id", sqlTypes.BigInt, user.id)
          .input("titulo", sqlTypes.NVarChar(160), "Pedido confirmado")
          .input(
            "mensagem",
            sqlTypes.NVarChar(700),
            `Voce economizou R$ ${economyTotal.toFixed(2)} no pedido ${result.recordset[0].public_code}.`
          )
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.get("/api/payments/config", async () => ({
    data: {
      public_key: config.mercadoPago.publicKey
    }
  }));

  app.post("/api/payments/process_payment", async (request, reply) => {
    const user = await requireUser(request);
    const body = processPaymentSchema.parse(request.body);
    const product = await getProductForCheckout(body.product_id);

    if (!product) {
      return reply.code(404).send({ error: "product_not_found" });
    }

    const profile = await query<{ email: string; nome: string; cpf: string | null }>(
      `SELECT email, nome, cpf FROM dbo.users WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, user.id)
    );

    const profileRow = profile[0];
    if (!profileRow || !profileRow.email) {
      return reply.code(400).send({ error: "user_profile_incomplete" });
    }

    const productPrice = Number(product.preco_desconto);
    const requestedCashback = Number((body.cashback_amount ?? 0).toFixed(2));
    if (requestedCashback > productPrice + 0.0001) {
      return reply.code(400).send({ error: "cashback_amount_exceeds_total" });
    }

    // Resolve check-in association up front so a stock failure doesn't leave a dangling event.
    const checkinEventId = await resolveCheckinEventId(body.checkin_token, user.id, request);

    // Reserve stock immediately. Restored later if the order ends up cancelled/refunded.
    const stockOk = await tryDecrementStock(product.id);
    if (!stockOk) {
      return reply.code(409).send({ error: "out_of_stock" });
    }

    const cashAmount = Number((productPrice - requestedCashback).toFixed(2));
    const fullyCovered = cashAmount <= 0.0099;
    const paymentReference = generatePaymentReference(user.id, product.id);

    // 100% paid with cashback: skip MP entirely and approve immediately.
    if (fullyCovered) {
      const debitResult = requestedCashback > 0
        ? await withTransaction((tx) =>
            debitCashback(tx, {
              userId: user.id,
              orderId: null,
              valor: requestedCashback,
              descricao: `Pagamento integral em cashback de ${product.nome}.`
            })
          )
        : ({ ok: true, saldoApos: 0, valor: 0 } as const);

      if (!debitResult.ok) {
        // Restore the stock we just reserved.
        await execute(
          `UPDATE dbo.products SET estoque = estoque + 1 WHERE id = @id AND estoque IS NOT NULL`,
          (req) => req.input("id", sqlTypes.BigInt, product.id)
        );
        return reply.code(409).send({ error: "insufficient_cashback_balance" });
      }

      const order = await createOrderRecord({
        userId: user.id,
        product,
        paymentStatus: "approved",
        paymentMethod: "cashback",
        paymentReference,
        mercadoPagoPaymentId: null,
        mercadoPagoStatus: "approved",
        cashbackApplied: requestedCashback,
        paidTotalOverride: 0,
        checkinEventId
      });

      // Re-key the cashback debit transaction to the order id (created after the debit).
      await execute(
        `UPDATE dbo.cashback_transactions
            SET order_id = @order_id
          WHERE id = (SELECT TOP 1 id FROM dbo.cashback_transactions
                       WHERE user_id = @user_id AND order_id IS NULL AND tipo = 'debito'
                       ORDER BY created_at DESC)`,
        (req) =>
          req
            .input("order_id", sqlTypes.BigInt, order.id)
            .input("user_id", sqlTypes.BigInt, user.id)
      );

      // Issue any tier-based cashback on this purchase too. Computed on cashAmount=0,
      // so it credits 0; harmless. Kept for symmetry/idempotency.
      await ensureOrderCashbackCredit({
        userId: user.id,
        orderId: order.id,
        paidAmount: 0,
        productCashbackPercent: product.cashback_percent ?? null,
        productName: product.nome
      }).catch((err) => request.log.error({ err }, "ensure_cashback_credit_failed"));

      return reply.code(201).send({
        data: {
          order,
          payment: {
            id: null,
            status: "approved",
            status_detail: "fully_paid_with_cashback",
            external_reference: paymentReference,
            cashback_used: requestedCashback
          }
        }
      });
    }

    // Mixed cashback + Mercado Pago, or cashback=0 + Mercado Pago.
    const paymentMethodId = body.payment_method === "pix" ? "pix" : body.payment_method_id;
    const mpBody: Record<string, unknown> = {
      transaction_amount: cashAmount,
      description: product.nome,
      payment_method_id: paymentMethodId,
      external_reference: paymentReference,
      payer: {
        email: profileRow.email,
        ...(profileRow.cpf
          ? {
              identification: {
                type: "CPF",
                number: profileRow.cpf.replace(/\D/g, "")
              }
            }
          : {})
      }
    };

    if (body.payment_method !== "pix") {
      if (!body.token) {
        await execute(
          `UPDATE dbo.products SET estoque = estoque + 1 WHERE id = @id AND estoque IS NOT NULL`,
          (req) => req.input("id", sqlTypes.BigInt, product.id)
        );
        return reply.code(400).send({ error: "card_token_required" });
      }
      if (!paymentMethodId) {
        await execute(
          `UPDATE dbo.products SET estoque = estoque + 1 WHERE id = @id AND estoque IS NOT NULL`,
          (req) => req.input("id", sqlTypes.BigInt, product.id)
        );
        return reply.code(400).send({ error: "card_payment_method_required" });
      }

      mpBody.token = body.token;
      mpBody.installments = body.installments;
      if (body.issuer_id) {
        mpBody.issuer_id = body.issuer_id;
      }
    }

    // Debit the cashback portion BEFORE talking to MP, so a payment that succeeds is fully
    // backed. If MP fails afterwards we refund the cashback and restore the stock.
    let cashbackDebited = 0;
    if (requestedCashback > 0) {
      const debit = await withTransaction((tx) =>
        debitCashback(tx, {
          userId: user.id,
          orderId: null,
          valor: requestedCashback,
          descricao: `Pagamento parcial em cashback de ${product.nome}.`
        })
      );
      if (!debit.ok) {
        await execute(
          `UPDATE dbo.products SET estoque = estoque + 1 WHERE id = @id AND estoque IS NOT NULL`,
          (req) => req.input("id", sqlTypes.BigInt, product.id)
        );
        return reply.code(409).send({ error: "insufficient_cashback_balance" });
      }
      cashbackDebited = requestedCashback;
    }

    let mpPayment: Awaited<ReturnType<typeof createMercadoPagoPayment>>;
    try {
      mpPayment = await createMercadoPagoPayment(mpBody);
    } catch (err) {
      // Rollback both reservations.
      if (cashbackDebited > 0) {
        await withTransaction((tx) =>
          tx.execute(
            `UPDATE dbo.users SET cashback_balance = cashback_balance + @valor, updated_at = SYSUTCDATETIME() WHERE id = @id`,
            (req) =>
              req
                .input("id", sqlTypes.BigInt, user.id)
                .input("valor", sqlTypes.Decimal(12, 2), cashbackDebited)
          )
        ).catch((rollbackErr) => request.log.error({ rollbackErr }, "cashback_rollback_failed"));
      }
      await execute(
        `UPDATE dbo.products SET estoque = estoque + 1 WHERE id = @id AND estoque IS NOT NULL`,
        (req) => req.input("id", sqlTypes.BigInt, product.id)
      );
      throw err;
    }

    const mpStatus = String(mpPayment.status ?? "pending");
    const paymentStatus = normalizeMercadoPagoStatus(mpStatus);
    const order = await createOrderRecord({
      userId: user.id,
      product,
      paymentStatus,
      paymentMethod: body.payment_method,
      paymentReference,
      mercadoPagoPaymentId: mpPayment.id as string | number | undefined,
      mercadoPagoStatus: mpStatus,
      cashbackApplied: cashbackDebited,
      paidTotalOverride: cashAmount,
      checkinEventId
    });

    if (cashbackDebited > 0) {
      await execute(
        `UPDATE dbo.cashback_transactions
            SET order_id = @order_id
          WHERE id = (SELECT TOP 1 id FROM dbo.cashback_transactions
                       WHERE user_id = @user_id AND order_id IS NULL AND tipo = 'debito'
                       ORDER BY created_at DESC)`,
        (req) =>
          req
            .input("order_id", sqlTypes.BigInt, order.id)
            .input("user_id", sqlTypes.BigInt, user.id)
      );
    }

    await recordPaymentTransaction({
      orderId: order.id,
      userId: user.id,
      productId: product.id,
      externalReference: paymentReference,
      externalPaymentId:
        typeof mpPayment.id === "number" || typeof mpPayment.id === "string" ? String(mpPayment.id) : null,
      paymentMethod: body.payment_method,
      amount: cashAmount,
      status: paymentStatus,
      statusDetail: typeof mpPayment.status_detail === "string" ? mpPayment.status_detail : null,
      requestPayload: mpBody,
      responsePayload: mpPayment
    });

    // If MP returned approved synchronously (rare for Pix, common for cards), fire cashback credit now.
    if (paymentStatus === "approved") {
      await ensureOrderCashbackCredit({
        userId: user.id,
        orderId: order.id,
        paidAmount: cashAmount,
        productCashbackPercent: product.cashback_percent ?? null,
        productName: product.nome
      }).catch((err) => request.log.error({ err }, "ensure_cashback_credit_failed"));
    }

    const pointOfInteraction = mpPayment.point_of_interaction as
      | {
          transaction_data?: {
            qr_code_base64?: string;
            qr_code?: string;
            ticket_url?: string;
          };
        }
      | undefined;

    return reply.code(201).send({
      data: {
        order,
        payment: {
          id: mpPayment.id,
          status: mpStatus,
          status_detail: mpPayment.status_detail,
          external_reference: paymentReference,
          qr_code_base64: pointOfInteraction?.transaction_data?.qr_code_base64,
          qr_code: pointOfInteraction?.transaction_data?.qr_code,
          ticket_url: pointOfInteraction?.transaction_data?.ticket_url,
          cashback_used: cashbackDebited
        }
      }
    });
  });

  // Multi-item cart checkout. Creates one Mercado Pago payment for the entire cart
  // total and N product_orders sharing the same payment_reference + cart_id, so the
  // existing per-order reconcile/voucher/cashback/refund logic still applies.
  app.post("/api/payments/process_cart_payment", async (request, reply) => {
    const user = await requireUser(request);
    const body = processCartPaymentSchema.parse(request.body);

    const profileRows = await query<{ email: string; nome: string; cpf: string | null }>(
      `SELECT email, nome, cpf FROM dbo.users WHERE id = @id`,
      (req) => req.input("id", sqlTypes.BigInt, user.id)
    );
    const profileRow = profileRows[0];
    if (!profileRow || !profileRow.email) {
      return reply.code(400).send({ error: "user_profile_incomplete" });
    }

    // Load all product rows in a single round-trip.
    const productRows = await query<{
      id: number;
      nome: string;
      offer_type: string;
      delivery_method: "digital" | "presencial" | "fisica";
      tipo_entrega: "digital" | "fisico" | "ambos";
      preco_original: number;
      preco_desconto: number;
      economia_estimada: number;
      status: string;
      limite_resgates: number | null;
      cashback_percent: number | null;
    }>(
      `SELECT id, nome, offer_type, delivery_method, tipo_entrega, preco_original, preco_desconto,
              economia_estimada, status, limite_resgates, cashback_percent
         FROM dbo.products
        WHERE id IN (${body.items.map((_, i) => `@id${i}`).join(", ")})
          AND status = 'ativo'
          AND deleted_at IS NULL`,
      (req) => {
        body.items.forEach((item, i) => req.input(`id${i}`, sqlTypes.BigInt, item.product_id));
        return req;
      }
    );
    const productById = new Map(productRows.map((p) => [Number(p.id), p]));
    for (const item of body.items) {
      if (!productById.has(item.product_id)) {
        return reply.code(404).send({ error: "product_not_found", product_id: item.product_id });
      }
    }

    // Compute totals.
    let cartTotal = 0;
    for (const item of body.items) {
      const product = productById.get(item.product_id)!;
      cartTotal += Number(product.preco_desconto) * item.quantidade;
    }
    cartTotal = Number(cartTotal.toFixed(2));

    const requestedCashback = Number((body.cashback_amount ?? 0).toFixed(2));
    if (requestedCashback > cartTotal + 0.0099) {
      return reply.code(400).send({ error: "cashback_amount_exceeds_total" });
    }
    const cashAmount = Number((cartTotal - requestedCashback).toFixed(2));
    const fullyCovered = cashAmount <= 0.0099;

    // Resolve check-in event (if present and active) once for all orders in this cart.
    const checkinEventId = await resolveCheckinEventId(body.checkin_token, user.id, request);

    // Reserve stock for every item. Roll back partial reservations on first failure.
    const reservedSoFar: Array<{ productId: number; quantidade: number }> = [];
    for (const item of body.items) {
      const ok = await tryDecrementStock(item.product_id, item.quantidade);
      if (!ok) {
        for (const reserved of reservedSoFar) {
          await restoreStock(reserved.productId, reserved.quantidade);
        }
        return reply.code(409).send({ error: "out_of_stock", product_id: item.product_id });
      }
      reservedSoFar.push({ productId: item.product_id, quantidade: item.quantidade });
    }

    const restoreAllStock = async () => {
      for (const reserved of reservedSoFar) {
        await restoreStock(reserved.productId, reserved.quantidade).catch(() => undefined);
      }
    };

    const cartId = randomBytes(16).toString("hex");
    const paymentReference = `DH-CART-${user.id}-${Date.now().toString(36)}-${randomBytes(4).toString("hex").toUpperCase()}`;

    // Debit the cashback portion before talking to MP so the wallet stays consistent.
    let cashbackDebited = 0;
    if (requestedCashback > 0) {
      const debit = await withTransaction((tx) =>
        debitCashback(tx, {
          userId: user.id,
          orderId: null,
          valor: requestedCashback,
          descricao: `Carrinho ${cartId.slice(0, 8)} (${body.items.length} itens).`
        })
      );
      if (!debit.ok) {
        await restoreAllStock();
        return reply.code(409).send({ error: "insufficient_cashback_balance" });
      }
      cashbackDebited = requestedCashback;
    }

    let mpPayment: Awaited<ReturnType<typeof createMercadoPagoPayment>> | null = null;
    if (!fullyCovered) {
      const paymentMethodId = body.payment_method === "pix" ? "pix" : body.payment_method_id;
      const mpBody: Record<string, unknown> = {
        transaction_amount: cashAmount,
        description: `Carrinho Open Driver (${body.items.length} itens)`,
        payment_method_id: paymentMethodId,
        external_reference: paymentReference,
        payer: {
          email: profileRow.email,
          ...(profileRow.cpf
            ? {
                identification: { type: "CPF", number: profileRow.cpf.replace(/\D/g, "") }
              }
            : {})
        }
      };

      if (body.payment_method !== "pix") {
        if (!body.token) {
          await restoreAllStock();
          // Rollback cashback debit if any.
          if (cashbackDebited > 0) {
            await withTransaction((tx) =>
              tx.execute(
                `UPDATE dbo.users SET cashback_balance = cashback_balance + @valor WHERE id = @id`,
                (req) =>
                  req
                    .input("id", sqlTypes.BigInt, user.id)
                    .input("valor", sqlTypes.Decimal(12, 2), cashbackDebited)
              )
            ).catch(() => undefined);
          }
          return reply.code(400).send({ error: "card_token_required" });
        }
        if (!paymentMethodId) {
          await restoreAllStock();
          return reply.code(400).send({ error: "card_payment_method_required" });
        }
        mpBody.token = body.token;
        mpBody.installments = body.installments;
        if (body.issuer_id) mpBody.issuer_id = body.issuer_id;
      }

      try {
        mpPayment = await createMercadoPagoPayment(mpBody);
      } catch (err) {
        // Rollback everything we did locally before MP.
        if (cashbackDebited > 0) {
          await withTransaction((tx) =>
            tx.execute(
              `UPDATE dbo.users SET cashback_balance = cashback_balance + @valor WHERE id = @id`,
              (req) =>
                req
                  .input("id", sqlTypes.BigInt, user.id)
                  .input("valor", sqlTypes.Decimal(12, 2), cashbackDebited)
            )
          ).catch(() => undefined);
        }
        await restoreAllStock();
        throw err;
      }
    }

    const mpStatus = mpPayment ? String(mpPayment.status ?? "pending") : "approved";
    const paymentStatus = fullyCovered ? "approved" : normalizeMercadoPagoStatus(mpStatus);

    // Create one product_order per item, splitting the cashback proportionally to each
    // item's share of the cart total. We accept a small rounding drift on the last item.
    const createdOrders: Array<{
      id: number;
      public_code: string;
      voucher_code: string | null;
      product_id: number;
      quantidade: number;
      valor_pago_total: number;
      cashback_aplicado: number;
    }> = [];
    let cashbackAllocated = 0;

    for (let index = 0; index < body.items.length; index += 1) {
      const item = body.items[index];
      const product = productById.get(item.product_id)!;
      const itemSubtotal = Number((Number(product.preco_desconto) * item.quantidade).toFixed(2));
      const isLast = index === body.items.length - 1;
      const itemCashback = isLast
        ? Number((cashbackDebited - cashbackAllocated).toFixed(2))
        : Number(((cashbackDebited * itemSubtotal) / cartTotal).toFixed(2));
      cashbackAllocated += itemCashback;
      const itemPaid = Number(Math.max(0, itemSubtotal - itemCashback).toFixed(2));

      const order = await createOrderRecord({
        userId: user.id,
        product: {
          id: product.id,
          nome: product.nome,
          offer_type: product.offer_type,
          delivery_method: product.delivery_method,
          tipo_entrega: product.tipo_entrega,
          preco_original: Number(product.preco_original) * item.quantidade,
          preco_desconto: itemPaid,
          economia_estimada: Number(product.economia_estimada) * item.quantidade,
          limite_resgates: product.limite_resgates
        },
        paymentStatus,
        paymentMethod: fullyCovered ? "cashback" : body.payment_method,
        paymentReference,
        mercadoPagoPaymentId: mpPayment ? (mpPayment.id as string | number) : null,
        mercadoPagoStatus: mpStatus,
        cashbackApplied: itemCashback,
        paidTotalOverride: itemPaid,
        checkinEventId
      });

      // Tag the order with the cart group + override quantidade (createOrderRecord forces 1).
      await execute(
        `UPDATE dbo.product_orders
            SET cart_id = @cart_id,
                quantidade = @quantidade,
                updated_at = SYSUTCDATETIME()
          WHERE id = @id`,
        (req) =>
          req
            .input("id", sqlTypes.BigInt, order.id)
            .input("cart_id", sqlTypes.NVarChar(40), cartId)
            .input("quantidade", sqlTypes.Int, item.quantidade)
      );

      createdOrders.push({
        id: order.id,
        public_code: order.public_code,
        voucher_code: order.voucher_code,
        product_id: product.id,
        quantidade: item.quantidade,
        valor_pago_total: itemPaid,
        cashback_aplicado: itemCashback
      });
    }

    // Re-key the cashback debit transaction to the first order in the cart so the user
    // can trace it from their cashback ledger.
    if (cashbackDebited > 0 && createdOrders[0]) {
      await execute(
        `UPDATE dbo.cashback_transactions
            SET order_id = @order_id
          WHERE id = (SELECT TOP 1 id FROM dbo.cashback_transactions
                       WHERE user_id = @user_id AND order_id IS NULL AND tipo = 'debito'
                       ORDER BY created_at DESC)`,
        (req) =>
          req
            .input("order_id", sqlTypes.BigInt, createdOrders[0].id)
            .input("user_id", sqlTypes.BigInt, user.id)
      );
    }

    // Record the payment transaction once for the cart (using the first order as anchor).
    if (mpPayment && createdOrders[0]) {
      await recordPaymentTransaction({
        orderId: createdOrders[0].id,
        userId: user.id,
        productId: createdOrders[0].product_id,
        externalReference: paymentReference,
        externalPaymentId:
          typeof mpPayment.id === "number" || typeof mpPayment.id === "string" ? String(mpPayment.id) : null,
        paymentMethod: body.payment_method,
        amount: cashAmount,
        status: paymentStatus,
        statusDetail: typeof mpPayment.status_detail === "string" ? mpPayment.status_detail : null,
        requestPayload: { cart_id: cartId, items: body.items },
        responsePayload: mpPayment
      });
    }

    // Synchronous approval (cards or 100% cashback) → fire cashback credit per order now.
    if (paymentStatus === "approved") {
      for (const order of createdOrders) {
        const product = productById.get(order.product_id)!;
        await ensureOrderCashbackCredit({
          userId: user.id,
          orderId: order.id,
          paidAmount: order.valor_pago_total,
          productCashbackPercent: product.cashback_percent ?? null,
          productName: product.nome
        }).catch((err) => request.log.error({ err }, "ensure_cashback_credit_failed"));
      }
    }

    const pointOfInteraction = mpPayment?.point_of_interaction as
      | {
          transaction_data?: {
            qr_code_base64?: string;
            qr_code?: string;
            ticket_url?: string;
          };
        }
      | undefined;

    return reply.code(201).send({
      data: {
        cart_id: cartId,
        orders: createdOrders,
        total: cartTotal,
        cashback_used: cashbackDebited,
        cash_amount: cashAmount,
        payment: {
          id: mpPayment ? mpPayment.id : null,
          status: mpStatus,
          status_detail: mpPayment ? mpPayment.status_detail : "fully_paid_with_cashback",
          external_reference: paymentReference,
          qr_code_base64: pointOfInteraction?.transaction_data?.qr_code_base64,
          qr_code: pointOfInteraction?.transaction_data?.qr_code,
          ticket_url: pointOfInteraction?.transaction_data?.ticket_url
        }
      }
    });
  });

  app.post("/api/process_payment", async (_request, reply) => {
    return reply
      .code(308)
      .header("Location", "/api/payments/process_payment")
      .send({ error: "moved", location: "/api/payments/process_payment" });
  });

  app.post("/api/analytics/page-view", async (request) => {
    const body = z
      .object({
        event_name: z.string().default("home_view"),
        path: z.string().optional(),
        metadata: z.record(z.unknown()).optional()
      })
      .parse(request.body);

    await execute(
      `INSERT INTO dbo.page_events (event_name, path, metadata)
       VALUES (@event_name, @path, @metadata)`,
      (sqlRequest) =>
        sqlRequest
          .input("event_name", sqlTypes.VarChar(60), body.event_name)
          .input("path", sqlTypes.NVarChar(240), body.path ?? null)
          .input("metadata", sqlTypes.NVarChar(sqlTypes.MAX), body.metadata ? JSON.stringify(body.metadata) : null)
    );

    return { data: { tracked: true } };
  });

  app.get("/api/orders/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT o.*, p.nome AS produto_nome, p.imagem_url, p.tipo AS produto_tipo,
              p.offer_type, p.delivery_method, p.video_url,
              tx.status_detail AS payment_status_detail,
              tx.external_payment_id,
              tx.last_synced_at
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
         OUTER APPLY (
           SELECT TOP 1 status_detail, external_reference, external_payment_id, last_synced_at
             FROM dbo.payment_transactions tx
            WHERE tx.order_id = o.id
            ORDER BY tx.created_at DESC
         ) tx
        WHERE o.user_id = @user_id
        ORDER BY o.created_at DESC`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );

    return { data };
  });

  app.get("/api/orders/:id/payment-status", async (request, reply) => {
    const user = await requireUser(request);
    const params = request.params as { id: string };
    const queryParams = request.query as { force?: string };
    const orderId = Number(params.id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return reply.code(400).send({ error: "invalid_order_id" });
    }

    const ownership = await query<{
      id: number;
      payment_status: string | null;
      last_synced_at: Date | null;
    }>(
      `SELECT TOP 1 o.id, o.payment_status,
              (SELECT TOP 1 last_synced_at FROM dbo.payment_transactions tx
                 WHERE tx.order_id = o.id ORDER BY tx.created_at DESC) AS last_synced_at
         FROM dbo.product_orders o
        WHERE o.id = @id AND o.user_id = @user_id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, orderId)
          .input("user_id", sqlTypes.BigInt, user.id)
    );

    if (!ownership[0]) {
      return reply.code(404).send({ error: "order_not_found" });
    }

    const ownershipRow = ownership[0];
    const cooldownMs = 8000;
    const force = queryParams.force === "1" || queryParams.force === "true";
    const lastSyncedAt = ownershipRow.last_synced_at ? new Date(ownershipRow.last_synced_at).getTime() : 0;
    const isTerminal =
      ownershipRow.payment_status === "approved" ||
      ownershipRow.payment_status === "rejected" ||
      ownershipRow.payment_status === "cancelled" ||
      ownershipRow.payment_status === "refunded";
    const recent = lastSyncedAt && Date.now() - lastSyncedAt < cooldownMs;

    const sync =
      !force && (isTerminal || recent)
        ? await loadCachedPaymentStatus(orderId)
        : await reconcileOrderPaymentStatus({
            orderId,
            actorId: user.id,
            eventType: "customer_poll"
          });

    const orderRows = await query(
      `SELECT TOP 1 o.id, o.public_code, o.voucher_code, o.status, o.payment_status, o.payment_method,
              o.paid_at, o.mercado_pago_status, o.payment_reference,
              p.nome AS produto_nome, p.offer_type, p.delivery_method, p.imagem_url
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, orderId)
    );

    return {
      data: {
        order: orderRows[0],
        payment: sync
      }
    };
  });

  app.get("/api/savings/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT COALESCE(SUM(economia_total), 0) AS economia_total,
              COUNT(*) AS pedidos,
              (SELECT COUNT(*)
                 FROM dbo.product_orders
                WHERE user_id = @user_id
                  AND status IN (${eligibleOrderStatuses})
                  AND created_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS aquisicoes_mes
         FROM dbo.product_orders
        WHERE user_id = @user_id
          AND status IN (${eligibleOrderStatuses})`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );

    const row = data[0] as { economia_total: number; pedidos: number; aquisicoes_mes: number };
    const monthlyAcquisitions = Number(row.aquisicoes_mes ?? 0);

    return {
      data: {
        ...row,
        meta_mensal: 5,
        faltam_para_subir: Math.max(5 - monthlyAcquisitions, 0),
        nivel_atual: monthlyAcquisitions >= 10 ? "Ouro" : monthlyAcquisitions >= 5 ? "Prata" : "Bronze",
        proximo_nivel: monthlyAcquisitions >= 10 ? "Maximo" : monthlyAcquisitions >= 5 ? "Ouro" : "Prata",
        nivel_status: monthlyAcquisitions >= 5 ? "nivel_liberado" : "em_progresso"
      }
    };
  });

  app.get("/api/cashback/my", async (request) => {
    const user = await requireUser(request);
    const [balance, transactions, percent] = await Promise.all([
      loadCashbackBalance(user.id),
      listCashbackTransactions(user.id, 30),
      effectiveCashbackPercent({ userId: user.id, productCashbackPercent: null })
    ]);
    return {
      data: {
        balance: balance.balance,
        tier: balance.tier,
        tier_rate: balance.tierRate,
        monthly_acquisitions: balance.monthlyAcquisitions,
        expiring_soon: balance.expiringSoon,
        effective_rate: percent,
        transactions
      }
    };
  });

  app.post("/api/admin/orders/:id/refund", async (request, reply) => {
    const admin = await requireAdmin(request);
    const params = request.params as { id: string };
    const body = refundOrderSchema.parse(request.body ?? {});
    const orderId = Number(params.id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return reply.code(400).send({ error: "invalid_order_id" });
    }

    const result = await refundOrderManually({
      orderId,
      actorId: admin.id,
      reason: body.reason ?? null
    });

    return reply.code(200).send({ data: result });
  });

  app.get("/api/notifications/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT TOP 20 id, titulo, mensagem, canal, lida, created_at
         FROM dbo.notifications
        WHERE user_id = @user_id
        ORDER BY created_at DESC`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );

    return { data };
  });
}
