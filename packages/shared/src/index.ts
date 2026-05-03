export const leadStatuses = [
  "novo",
  "enviado_ao_parceiro",
  "em_atendimento",
  "convertido",
  "perdido",
  "cancelado"
] as const;

export const serviceOrderStatuses = [
  "aguardando_confirmacao",
  "confirmado",
  "contestado",
  "cancelado"
] as const;

export const commissionStatuses = ["a_receber", "recebido", "cancelado", "contestado"] as const;

export const partnerServiceCategories = [
  "troca_oleo",
  "pneus",
  "lava_jato",
  "mecanica",
  "alinhamento",
  "balanceamento",
  "outros"
] as const;

export type LeadStatus = (typeof leadStatuses)[number];
export type ServiceOrderStatus = (typeof serviceOrderStatuses)[number];
export type CommissionStatus = (typeof commissionStatuses)[number];
export type PartnerServiceCategory = (typeof partnerServiceCategories)[number];

export type ApiEnvelope<T> = {
  data: T;
};
