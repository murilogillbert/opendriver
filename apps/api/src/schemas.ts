import { z } from "zod";

import {
  leadStatuses,
  partnerServiceCategories,
  serviceOrderStatuses
} from "@opendriver/shared";

const nullableString = z.string().trim().min(1).optional().nullable();
const optionalMoney = z.coerce.number().nonnegative().optional().nullable();

export const createPartnerSchema = z.object({
  razao_social: z.string().trim().min(1),
  nome_fantasia: z.string().trim().min(1),
  cnpj: nullableString,
  responsavel: nullableString,
  telefone: nullableString,
  whatsapp: nullableString,
  email: nullableString,
  endereco: nullableString,
  bairro: nullableString,
  cidade: z.string().trim().min(1),
  estado: z.string().trim().min(2).max(2),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  status: z.enum(["ativo", "inativo", "pendente"]).default("pendente")
});

export const createPartnerServiceSchema = z.object({
  partner_id: z.coerce.number().int().positive(),
  categoria: z.enum(partnerServiceCategories),
  nome_servico: z.string().trim().min(1),
  descricao: nullableString,
  preco_padrao: optionalMoney,
  preco_open_driver: optionalMoney,
  ativo: z.boolean().default(true)
});

export const createCommissionRuleSchema = z.object({
  partner_id: z.coerce.number().int().positive(),
  partner_service_id: z.coerce.number().int().positive().optional().nullable(),
  tipo_comissao: z.enum(["fixa", "percentual", "hibrida"]),
  valor_fixo: optionalMoney,
  percentual: z.coerce.number().min(0).max(100).optional().nullable(),
  recorrencia: z.enum(["primeira_compra", "todas_as_compras"]).default("todas_as_compras"),
  prazo_pagamento: z.enum(["semanal", "quinzenal", "mensal"]).default("mensal"),
  ativo: z.boolean().default(true)
});

export const createLeadSchema = z.object({
  user_id: z.coerce.number().int().positive().optional().nullable(),
  driver_id: z.coerce.number().int().positive().optional().nullable(),
  campaign_id: z.coerce.number().int().positive().optional().nullable(),
  origem: z
    .enum(["bot_whatsapp", "app", "grupo_whatsapp", "indicacao", "campanha"])
    .default("bot_whatsapp"),
  telefone: nullableString,
  nome: nullableString,
  cidade: nullableString,
  estado: nullableString,
  servico_interesse: nullableString,
  partner_id: z.coerce.number().int().positive().optional().nullable(),
  partner_service_id: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(leadStatuses).default("novo"),
  observacao: nullableString
});

export const updateLeadStatusSchema = z.object({
  status: z.enum(leadStatuses),
  observacao: nullableString
});

export const createBotInteractionSchema = z.object({
  user_id: z.coerce.number().int().positive().optional().nullable(),
  telefone: nullableString,
  canal: z.enum(["whatsapp", "app", "web"]).default("web"),
  mensagem_usuario: z.string().trim().min(1),
  resposta_bot: z.string().trim().min(1),
  etapa_fluxo: nullableString,
  intencao: z
    .enum(["ativacao_motorista", "servico_automotivo", "indicacao", "suporte", "outros"])
    .default("outros"),
  lead_id: z.coerce.number().int().positive().optional().nullable()
});

export const createServiceOrderSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  partner_id: z.coerce.number().int().positive(),
  partner_service_id: z.coerce.number().int().positive(),
  user_id: z.coerce.number().int().positive().optional().nullable(),
  driver_id: z.coerce.number().int().positive().optional().nullable(),
  valor_servico: z.coerce.number().nonnegative(),
  data_servico: z.coerce.string().optional().nullable(),
  comprovante_url: nullableString,
  status: z.enum(serviceOrderStatuses).default("aguardando_confirmacao")
});

export const confirmServiceOrderSchema = z.object({
  valor_servico: z.coerce.number().nonnegative().optional(),
  data_servico: z.coerce.string().optional().nullable(),
  comprovante_url: nullableString
});

export const createPaymentSchema = z.object({
  commission_id: z.coerce.number().int().positive(),
  partner_id: z.coerce.number().int().positive(),
  valor_pago: z.coerce.number().nonnegative(),
  forma_pagamento: z.enum(["pix", "transferencia", "dinheiro", "boleto"]),
  comprovante_url: nullableString,
  data_pagamento: z.coerce.string().optional().nullable(),
  status: z.enum(["pendente", "pago", "recusado"]).default("pendente"),
  observacao: nullableString
});
