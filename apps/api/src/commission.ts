import { execute, query, sqlTypes } from "./db.js";

type ServiceOrderRow = {
  id: number;
  partner_id: number;
  partner_service_id: number;
  user_id: number | null;
  valor_servico: number;
};

type CommissionRuleRow = {
  tipo_comissao: "fixa" | "percentual" | "hibrida";
  valor_fixo: number | null;
  percentual: number | null;
  prazo_pagamento: "semanal" | "quinzenal" | "mensal";
};

function calculateCommission(order: ServiceOrderRow, rule: CommissionRuleRow) {
  const fixed = Number(rule.valor_fixo ?? 0);
  const percentageValue = Number(order.valor_servico) * (Number(rule.percentual ?? 0) / 100);

  if (rule.tipo_comissao === "fixa") {
    return fixed;
  }

  if (rule.tipo_comissao === "percentual") {
    return percentageValue;
  }

  return fixed + percentageValue;
}

function paymentDateFor(rule: CommissionRuleRow) {
  const date = new Date();
  const days = rule.prazo_pagamento === "semanal" ? 7 : rule.prazo_pagamento === "quinzenal" ? 15 : 30;
  date.setDate(date.getDate() + days);

  return date;
}

export async function generateOpenDriverCommission(serviceOrderId: number) {
  const existing = await query<{ id: number }>(
    "SELECT id FROM dbo.commissions WHERE service_order_id = @service_order_id AND tipo_recebedor = 'open_driver'",
    (request) => request.input("service_order_id", sqlTypes.BigInt, serviceOrderId)
  );

  if (existing.length > 0) {
    return existing[0];
  }

  const orders = await query<ServiceOrderRow>(
    `SELECT id, partner_id, partner_service_id, user_id, valor_servico
       FROM dbo.service_orders
      WHERE id = @service_order_id AND status = 'confirmado'`,
    (request) => request.input("service_order_id", sqlTypes.BigInt, serviceOrderId)
  );

  const order = orders[0];

  if (!order) {
    return null;
  }

  const rules = await query<CommissionRuleRow>(
    `SELECT TOP 1 tipo_comissao, valor_fixo, percentual, prazo_pagamento
       FROM dbo.commission_rules
      WHERE partner_id = @partner_id
        AND ativo = 1
        AND (partner_service_id = @partner_service_id OR partner_service_id IS NULL)
      ORDER BY CASE WHEN partner_service_id = @partner_service_id THEN 0 ELSE 1 END, id DESC`,
    (request) =>
      request
        .input("partner_id", sqlTypes.BigInt, order.partner_id)
        .input("partner_service_id", sqlTypes.BigInt, order.partner_service_id)
  );

  const rule = rules[0];

  if (!rule) {
    return null;
  }

  const commissionValue = calculateCommission(order, rule);
  const paymentDate = paymentDateFor(rule);

  const result = await execute<{ id: number }>(
    `INSERT INTO dbo.commissions (
        service_order_id, partner_id, user_id_recebedor, tipo_recebedor,
        tipo_comissao, base_calculo, valor_comissao, status, data_prevista_pagamento
      )
      OUTPUT INSERTED.id
      VALUES (
        @service_order_id, @partner_id, NULL, 'open_driver',
        @tipo_comissao, @base_calculo, @valor_comissao, 'a_receber', @data_prevista_pagamento
      )`,
    (request) =>
      request
        .input("service_order_id", sqlTypes.BigInt, order.id)
        .input("partner_id", sqlTypes.BigInt, order.partner_id)
        .input("tipo_comissao", sqlTypes.VarChar(20), rule.tipo_comissao)
        .input("base_calculo", sqlTypes.Decimal(12, 2), order.valor_servico)
        .input("valor_comissao", sqlTypes.Decimal(12, 2), commissionValue)
        .input("data_prevista_pagamento", sqlTypes.DateTime2, paymentDate)
  );

  return result.recordset[0] ?? null;
}
