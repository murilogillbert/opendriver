import { randomBytes } from "crypto";

import { FastifyInstance } from "fastify";
import { z } from "zod";

import { hashPassword, requireAdmin, requireUser, signToken, verifyPassword } from "./auth.js";
import { execute, query, sqlTypes } from "./db.js";
import { saveUpload } from "./upload.js";
import {
  createOrderSchema,
  forgotPasswordSchema,
  loginSchema,
  productSchema,
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

const voucherCode = () => `OD-${randomBytes(4).toString("hex").toUpperCase()}`;

const resetToken = () => randomBytes(24).toString("hex");

export async function registerMarketplaceRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(body.senha);

    const result = await execute<{ id: number; email: string; nome: string; tipo_usuario: "passageiro" }>(
      `INSERT INTO dbo.users (
          nome, email, telefone, tipo_usuario, cidade, estado, status, password_hash,
          endereco, numero, complemento, bairro, cep
        )
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.nome, INSERTED.tipo_usuario
        VALUES (
          @nome, @email, @telefone, 'passageiro', @cidade, @estado, 'ativo', @password_hash,
          @endereco, @numero, @complemento, @bairro, @cep
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("nome", sqlTypes.NVarChar(140), body.nome)
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

  app.post("/api/auth/bootstrap-admin", async (request, reply) => {
    const body = loginSchema.extend({ nome: z.string().trim().min(2).optional() }).parse(request.body);
    const existingAdmins = await query<{ total: number }>(
      "SELECT COUNT(*) AS total FROM dbo.users WHERE tipo_usuario = 'admin'"
    );

    if (Number(existingAdmins[0]?.total ?? 0) > 0) {
      return reply.code(403).send({ error: "admin_already_exists" });
    }

    const passwordHash = await hashPassword(body.senha);
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
    const user = result.recordset[0];

    return reply.code(201).send({
      data: {
        user,
        token: signToken(user)
      }
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const users = await query<{
      id: number;
      email: string;
      nome: string;
      tipo_usuario: "motorista" | "passageiro" | "parceiro" | "admin";
      password_hash: string | null;
      status: string;
    }>(
      `SELECT id, email, nome, tipo_usuario, password_hash, status
         FROM dbo.users
        WHERE email = @email`,
      (sqlRequest) => sqlRequest.input("email", sqlTypes.NVarChar(180), body.email.toLowerCase())
    );

    const user = users[0];
    const valid = user?.password_hash ? await verifyPassword(body.senha, user.password_hash) : false;

    if (!user || !valid || user.status !== "ativo") {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          tipo_usuario: user.tipo_usuario
        },
        token: signToken(user)
      }
    };
  });

  app.post("/api/auth/forgot-password", async (request) => {
    const body = forgotPasswordSchema.parse(request.body);
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

    return { data: { sent: true } };
  });

  app.get("/api/me", async (request) => {
    const user = await requireUser(request);
    const profile = await query(
      `SELECT id, nome, email, telefone, tipo_usuario, cidade, estado, endereco, numero,
              complemento, bairro, cep
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
    const queryParams = request.query as { category?: string; featured?: string };
    const data = await query(
      `SELECT p.*, c.nome AS categoria_nome, c.slug AS categoria_slug
         FROM dbo.products p
         LEFT JOIN dbo.product_categories c ON c.id = p.category_id
        WHERE p.status = 'ativo'
          AND (@category IS NULL OR c.slug = @category)
          AND (@featured IS NULL OR p.destaque_home = 1)
        ORDER BY p.destaque_home DESC, p.economia_mensal_estimada DESC, p.created_at DESC`,
      (sqlRequest) =>
        sqlRequest
          .input("category", sqlTypes.VarChar(140), queryParams.category ?? null)
          .input("featured", sqlTypes.VarChar(10), queryParams.featured ?? null)
    );

    return { data };
  });

  app.get("/api/products/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const data = await query(
      `SELECT p.*, c.nome AS categoria_nome, c.slug AS categoria_slug
         FROM dbo.products p
         LEFT JOIN dbo.product_categories c ON c.id = p.category_id
        WHERE p.slug = @slug AND p.status = 'ativo'`,
      (sqlRequest) => sqlRequest.input("slug", sqlTypes.VarChar(180), params.slug)
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
      `SELECT p.*, c.nome AS categoria_nome
         FROM dbo.products p
         LEFT JOIN dbo.product_categories c ON c.id = p.category_id
        ORDER BY p.created_at DESC`
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
          imagem_url, video_url, estoque, limite_resgates, destaque_home, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @category_id, @partner_id, @nome, @slug, @descricao_curta, @descricao, @tipo, @tipo_entrega,
          @preco_original, @preco_desconto, @economia_estimada, @economia_mensal_estimada,
          @imagem_url, @video_url, @estoque, @limite_resgates, @destaque_home, @status
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
          .input("preco_original", sqlTypes.Decimal(12, 2), body.preco_original)
          .input("preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto)
          .input("economia_estimada", sqlTypes.Decimal(12, 2), economy)
          .input("economia_mensal_estimada", sqlTypes.Decimal(12, 2), body.economia_mensal_estimada)
          .input("imagem_url", sqlTypes.NVarChar(500), body.imagem_url ?? null)
          .input("video_url", sqlTypes.NVarChar(500), body.video_url ?? null)
          .input("estoque", sqlTypes.Int, body.estoque ?? null)
          .input("limite_resgates", sqlTypes.Int, body.limite_resgates ?? null)
          .input("destaque_home", sqlTypes.Bit, body.destaque_home)
          .input("status", sqlTypes.VarChar(20), body.status)
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
              preco_original = @preco_original,
              preco_desconto = @preco_desconto,
              economia_estimada = @economia_estimada,
              economia_mensal_estimada = @economia_mensal_estimada,
              imagem_url = @imagem_url,
              video_url = @video_url,
              estoque = @estoque,
              limite_resgates = @limite_resgates,
              destaque_home = @destaque_home,
              status = @status,
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
          .input("preco_original", sqlTypes.Decimal(12, 2), body.preco_original)
          .input("preco_desconto", sqlTypes.Decimal(12, 2), body.preco_desconto)
          .input("economia_estimada", sqlTypes.Decimal(12, 2), economy)
          .input("economia_mensal_estimada", sqlTypes.Decimal(12, 2), body.economia_mensal_estimada)
          .input("imagem_url", sqlTypes.NVarChar(500), body.imagem_url ?? null)
          .input("video_url", sqlTypes.NVarChar(500), body.video_url ?? null)
          .input("estoque", sqlTypes.Int, body.estoque ?? null)
          .input("limite_resgates", sqlTypes.Int, body.limite_resgates ?? null)
          .input("destaque_home", sqlTypes.Bit, body.destaque_home)
          .input("status", sqlTypes.VarChar(20), body.status)
    );

    return { data: { id: Number(params.id) } };
  });

  app.delete("/api/admin/products/:id", async (request) => {
    await requireAdmin(request);
    const params = request.params as { id: string };

    await execute(
      `UPDATE dbo.products
          SET status = 'pausado',
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, Number(params.id))
    );

    return { data: { id: Number(params.id), status: "pausado" } };
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
      status: string;
    }>(
      `SELECT id, nome, tipo_entrega, preco_original, preco_desconto, economia_estimada, status
         FROM dbo.products
        WHERE id = @id AND status = 'ativo'`,
      (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, body.product_id)
    );
    const product = products[0];

    if (!product) {
      return reply.code(404).send({ error: "product_not_found" });
    }

    const deliveryType =
      body.tipo_entrega ?? (product.tipo_entrega === "fisico" ? "fisico" : "digital");

    if (product.tipo_entrega !== "ambos" && product.tipo_entrega !== deliveryType) {
      return reply.code(400).send({ error: "invalid_delivery_type" });
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
    const code = deliveryType === "digital" ? voucherCode() : null;

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

  app.get("/api/orders/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT o.*, p.nome AS produto_nome, p.imagem_url, p.tipo AS produto_tipo
         FROM dbo.product_orders o
         JOIN dbo.products p ON p.id = o.product_id
        WHERE o.user_id = @user_id
        ORDER BY o.created_at DESC`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );

    return { data };
  });

  app.get("/api/savings/my", async (request) => {
    const user = await requireUser(request);
    const data = await query(
      `SELECT COALESCE(SUM(economia_total), 0) AS economia_total,
              COUNT(*) AS pedidos
         FROM dbo.product_orders
        WHERE user_id = @user_id
          AND status IN ('confirmado', 'enviado', 'entregue')`,
      (sqlRequest) => sqlRequest.input("user_id", sqlTypes.BigInt, user.id)
    );

    return { data: data[0] };
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
