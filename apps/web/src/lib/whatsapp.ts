import { AssistantLead, getLeadInterestLabel } from "./localAssistantEngine";

const WHATSAPP_NUMBER = "556182187476";

export function createWhatsAppLeadUrl(lead: AssistantLead) {
  const lines = [
    "Olá, vim pelo assistente da Open Driver.",
    lead.driverType ? `Perfil: ${lead.driverType}` : undefined,
    lead.city ? `Cidade/região: ${lead.city}` : undefined,
    `Principal interesse: ${getLeadInterestLabel(lead)}`,
    `Temperatura do lead: ${lead.temperature}`,
    "Quero saber como ativar os benefícios."
  ].filter(Boolean);

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}
