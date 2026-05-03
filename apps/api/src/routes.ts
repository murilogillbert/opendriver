import { FastifyInstance } from "fastify";

import { generateOpenDriverCommission } from "./commission.js";
import { execute, getPool, query, sqlTypes } from "./db.js";
import {
  confirmServiceOrderSchema,
  createBotInteractionSchema,
  createCommissionRuleSchema,
  createLeadSchema,
  createPartnerSchema,
  createPartnerServiceSchema,
  createPaymentSchema,
  createServiceOrderSchema,
  updateLeadStatusSchema
} from "./schemas.js";

const pageQuery = (requestQuery: unknown) => {
  const queryParams = requestQuery as { limit?: string; offset?: string };
  const limit = Math.min(Number(queryParams.limit ?? 50), 200);
  const offset = Number(queryParams.offset ?? 0);

  return {
    limit: Number.isNaN(limit) ? 50 : limit,
    offset: Number.isNaN(offset) ? 0 : offset
  };
};

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await getPool();
    return { ok: true };
  });

  app.get("/api/partners", async (request) => {
    const { limit, offset } = pageQuery(request.query);
    const data = await query(
      `SELECT *
         FROM dbo.partners
        ORDER BY created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      (sqlRequest) =>
        sqlRequest.input("offset", sqlTypes.Int, offset).input("limit", sqlTypes.Int, limit)
    );

    return { data };
  });

  app.post("/api/partners", async (request, reply) => {
    const body = createPartnerSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.partners (
          razao_social, nome_fantasia, cnpj, responsavel, telefone, whatsapp, email,
          endereco, bairro, cidade, estado, latitude, longitude, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @razao_social, @nome_fantasia, @cnpj, @responsavel, @telefone, @whatsapp, @email,
          @endereco, @bairro, @cidade, @estado, @latitude, @longitude, @status
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("razao_social", sqlTypes.NVarChar(180), body.razao_social)
          .input("nome_fantasia", sqlTypes.NVarChar(180), body.nome_fantasia)
          .input("cnpj", sqlTypes.VarChar(20), body.cnpj ?? null)
          .input("responsavel", sqlTypes.NVarChar(120), body.responsavel ?? null)
          .input("telefone", sqlTypes.VarChar(30), body.telefone ?? null)
          .input("whatsapp", sqlTypes.VarChar(30), body.whatsapp ?? null)
          .input("email", sqlTypes.NVarChar(180), body.email ?? null)
          .input("endereco", sqlTypes.NVarChar(240), body.endereco ?? null)
          .input("bairro", sqlTypes.NVarChar(120), body.bairro ?? null)
          .input("cidade", sqlTypes.NVarChar(120), body.cidade)
          .input("estado", sqlTypes.Char(2), body.estado.toUpperCase())
          .input("latitude", sqlTypes.Decimal(10, 7), body.latitude ?? null)
          .input("longitude", sqlTypes.Decimal(10, 7), body.longitude ?? null)
          .input("status", sqlTypes.VarChar(20), body.status)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.get("/api/partner-services", async (request) => {
    const queryParams = request.query as { partner_id?: string };
    const data = await query(
      `SELECT ps.*, p.nome_fantasia AS partner_nome
         FROM dbo.partner_services ps
         JOIN dbo.partners p ON p.id = ps.partner_id
        WHERE (@partner_id IS NULL OR ps.partner_id = @partner_id)
        ORDER BY ps.created_at DESC`,
      (sqlRequest) =>
        sqlRequest.input(
          "partner_id",
          sqlTypes.BigInt,
          queryParams.partner_id ? Number(queryParams.partner_id) : null
        )
    );

    return { data };
  });

  app.post("/api/partner-services", async (request, reply) => {
    const body = createPartnerServiceSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.partner_services (
          partner_id, categoria, nome_servico, descricao, preco_padrao, preco_open_driver, ativo
        )
        OUTPUT INSERTED.id
        VALUES (
          @partner_id, @categoria, @nome_servico, @descricao, @preco_padrao, @preco_open_driver, @ativo
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("partner_id", sqlTypes.BigInt, body.partner_id)
          .input("categoria", sqlTypes.VarChar(40), body.categoria)
          .input("nome_servico", sqlTypes.NVarChar(140), body.nome_servico)
          .input("descricao", sqlTypes.NVarChar(sqlTypes.MAX), body.descricao ?? null)
          .input("preco_padrao", sqlTypes.Decimal(12, 2), body.preco_padrao ?? null)
          .input("preco_open_driver", sqlTypes.Decimal(12, 2), body.preco_open_driver ?? null)
          .input("ativo", sqlTypes.Bit, body.ativo)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.post("/api/commission-rules", async (request, reply) => {
    const body = createCommissionRuleSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.commission_rules (
          partner_id, partner_service_id, tipo_comissao, valor_fixo, percentual,
          recorrencia, prazo_pagamento, ativo
        )
        OUTPUT INSERTED.id
        VALUES (
          @partner_id, @partner_service_id, @tipo_comissao, @valor_fixo, @percentual,
          @recorrencia, @prazo_pagamento, @ativo
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("partner_id", sqlTypes.BigInt, body.partner_id)
          .input("partner_service_id", sqlTypes.BigInt, body.partner_service_id ?? null)
          .input("tipo_comissao", sqlTypes.VarChar(20), body.tipo_comissao)
          .input("valor_fixo", sqlTypes.Decimal(12, 2), body.valor_fixo ?? null)
          .input("percentual", sqlTypes.Decimal(5, 2), body.percentual ?? null)
          .input("recorrencia", sqlTypes.VarChar(30), body.recorrencia)
          .input("prazo_pagamento", sqlTypes.VarChar(20), body.prazo_pagamento)
          .input("ativo", sqlTypes.Bit, body.ativo)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.get("/api/leads", async (request) => {
    const { limit, offset } = pageQuery(request.query);
    const data = await query(
      `SELECT l.*, p.nome_fantasia AS partner_nome, ps.nome_servico
         FROM dbo.leads l
         LEFT JOIN dbo.partners p ON p.id = l.partner_id
         LEFT JOIN dbo.partner_services ps ON ps.id = l.partner_service_id
        ORDER BY l.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      (sqlRequest) =>
        sqlRequest.input("offset", sqlTypes.Int, offset).input("limit", sqlTypes.Int, limit)
    );

    return { data };
  });

  app.post("/api/leads", async (request, reply) => {
    const body = createLeadSchema.parse(request.body);
    const estado = typeof body.estado === "string" ? body.estado.toUpperCase() : null;
    const result = await execute<{ id: number; public_token: string }>(
      `INSERT INTO dbo.leads (
          user_id, driver_id, campaign_id, origem, telefone, nome, cidade, estado,
          servico_interesse, partner_id, partner_service_id, status, observacao
        )
        OUTPUT INSERTED.id, INSERTED.public_token
        VALUES (
          @user_id, @driver_id, @campaign_id, @origem, @telefone, @nome, @cidade, @estado,
          @servico_interesse, @partner_id, @partner_service_id, @status, @observacao
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("user_id", sqlTypes.BigInt, body.user_id ?? null)
          .input("driver_id", sqlTypes.BigInt, body.driver_id ?? null)
          .input("campaign_id", sqlTypes.BigInt, body.campaign_id ?? null)
          .input("origem", sqlTypes.VarChar(30), body.origem)
          .input("telefone", sqlTypes.VarChar(30), body.telefone ?? null)
          .input("nome", sqlTypes.NVarChar(140), body.nome ?? null)
          .input("cidade", sqlTypes.NVarChar(120), body.cidade ?? null)
          .input("estado", sqlTypes.Char(2), estado)
          .input("servico_interesse", sqlTypes.NVarChar(140), body.servico_interesse ?? null)
          .input("partner_id", sqlTypes.BigInt, body.partner_id ?? null)
          .input("partner_service_id", sqlTypes.BigInt, body.partner_service_id ?? null)
          .input("status", sqlTypes.VarChar(30), body.status)
          .input("observacao", sqlTypes.NVarChar(sqlTypes.MAX), body.observacao ?? null)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.patch("/api/leads/:id/status", async (request) => {
    const params = request.params as { id: string };
    const body = updateLeadStatusSchema.parse(request.body);
    await execute(
      `UPDATE dbo.leads
          SET status = @status,
              observacao = COALESCE(@observacao, observacao),
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("status", sqlTypes.VarChar(30), body.status)
          .input("observacao", sqlTypes.NVarChar(sqlTypes.MAX), body.observacao ?? null)
    );

    return { data: { id: Number(params.id), status: body.status } };
  });

  app.post("/api/bot/interactions", async (request, reply) => {
    const body = createBotInteractionSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.bot_interactions (
          user_id, telefone, canal, mensagem_usuario, resposta_bot, etapa_fluxo, intencao, lead_id
        )
        OUTPUT INSERTED.id
        VALUES (
          @user_id, @telefone, @canal, @mensagem_usuario, @resposta_bot, @etapa_fluxo, @intencao, @lead_id
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("user_id", sqlTypes.BigInt, body.user_id ?? null)
          .input("telefone", sqlTypes.VarChar(30), body.telefone ?? null)
          .input("canal", sqlTypes.VarChar(20), body.canal)
          .input("mensagem_usuario", sqlTypes.NVarChar(sqlTypes.MAX), body.mensagem_usuario)
          .input("resposta_bot", sqlTypes.NVarChar(sqlTypes.MAX), body.resposta_bot)
          .input("etapa_fluxo", sqlTypes.NVarChar(80), body.etapa_fluxo ?? null)
          .input("intencao", sqlTypes.VarChar(40), body.intencao)
          .input("lead_id", sqlTypes.BigInt, body.lead_id ?? null)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.post("/api/service-orders", async (request, reply) => {
    const body = createServiceOrderSchema.parse(request.body);
    const dataServico = typeof body.data_servico === "string" ? new Date(body.data_servico) : null;
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.service_orders (
          lead_id, partner_id, partner_service_id, user_id, driver_id, valor_servico,
          data_servico, comprovante_url, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @lead_id, @partner_id, @partner_service_id, @user_id, @driver_id, @valor_servico,
          COALESCE(@data_servico, SYSUTCDATETIME()), @comprovante_url, @status
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("lead_id", sqlTypes.BigInt, body.lead_id)
          .input("partner_id", sqlTypes.BigInt, body.partner_id)
          .input("partner_service_id", sqlTypes.BigInt, body.partner_service_id)
          .input("user_id", sqlTypes.BigInt, body.user_id ?? null)
          .input("driver_id", sqlTypes.BigInt, body.driver_id ?? null)
          .input("valor_servico", sqlTypes.Decimal(12, 2), body.valor_servico)
          .input("data_servico", sqlTypes.DateTime2, dataServico)
          .input("comprovante_url", sqlTypes.NVarChar(500), body.comprovante_url ?? null)
          .input("status", sqlTypes.VarChar(40), body.status)
    );

    if (body.status === "confirmado") {
      await generateOpenDriverCommission(result.recordset[0].id);
    }

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.patch("/api/service-orders/:id/confirm", async (request) => {
    const params = request.params as { id: string };
    const body = confirmServiceOrderSchema.parse(request.body);
    const serviceOrderId = Number(params.id);
    const dataServico = typeof body.data_servico === "string" ? new Date(body.data_servico) : null;

    await execute(
      `UPDATE dbo.service_orders
          SET status = 'confirmado',
              valor_servico = COALESCE(@valor_servico, valor_servico),
              data_servico = COALESCE(@data_servico, data_servico),
              comprovante_url = COALESCE(@comprovante_url, comprovante_url),
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (sqlRequest) =>
        sqlRequest
          .input("id", sqlTypes.BigInt, serviceOrderId)
          .input("valor_servico", sqlTypes.Decimal(12, 2), body.valor_servico ?? null)
          .input("data_servico", sqlTypes.DateTime2, dataServico)
          .input("comprovante_url", sqlTypes.NVarChar(500), body.comprovante_url ?? null)
    );

    const commission = await generateOpenDriverCommission(serviceOrderId);

    return { data: { id: serviceOrderId, status: "confirmado", commission } };
  });

  app.get("/api/commissions", async () => {
    const data = await query(
      `SELECT c.*, p.nome_fantasia AS partner_nome
         FROM dbo.commissions c
         JOIN dbo.partners p ON p.id = c.partner_id
        ORDER BY c.created_at DESC`
    );

    return { data };
  });

  app.post("/api/payments", async (request, reply) => {
    const body = createPaymentSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.payments (
          commission_id, partner_id, valor_pago, forma_pagamento, comprovante_url,
          data_pagamento, status, observacao
        )
        OUTPUT INSERTED.id
        VALUES (
          @commission_id, @partner_id, @valor_pago, @forma_pagamento, @comprovante_url,
          COALESCE(@data_pagamento, SYSUTCDATETIME()), @status, @observacao
        )`,
      (sqlRequest) =>
        sqlRequest
          .input("commission_id", sqlTypes.BigInt, body.commission_id)
          .input("partner_id", sqlTypes.BigInt, body.partner_id)
          .input("valor_pago", sqlTypes.Decimal(12, 2), body.valor_pago)
          .input("forma_pagamento", sqlTypes.VarChar(30), body.forma_pagamento)
          .input("comprovante_url", sqlTypes.NVarChar(500), body.comprovante_url ?? null)
          .input("data_pagamento", sqlTypes.DateTime2, body.data_pagamento ? new Date(body.data_pagamento) : null)
          .input("status", sqlTypes.VarChar(20), body.status)
          .input("observacao", sqlTypes.NVarChar(sqlTypes.MAX), body.observacao ?? null)
    );

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.get("/api/reports/overview", async () => {
    const data = await query(
      `SELECT
          (SELECT COUNT(*) FROM dbo.leads) AS total_leads,
          (SELECT COUNT(*) FROM dbo.leads WHERE status = 'convertido') AS leads_convertidos,
          (SELECT COUNT(*) FROM dbo.service_orders WHERE status = 'confirmado') AS servicos_confirmados,
          (SELECT COALESCE(SUM(valor_comissao), 0) FROM dbo.commissions WHERE status IN ('a_receber', 'recebido')) AS receita_estimada,
          (SELECT COALESCE(SUM(valor_comissao), 0) FROM dbo.commissions WHERE status = 'recebido') AS receita_recebida`
    );

    return { data: data[0] };
  });
}
