import { AssistantLead, AssistantStep, getLeadInterestLabel } from "./localAssistantEngine";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

type CreatedLead = {
  id: number;
  public_token: string;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const intentToBotIntent = (intent: AssistantLead["mainIntent"]) => {
  if (intent === "maintenance" || intent === "fuel" || intent === "cashback" || intent === "benefits") {
    return "servico_automotivo";
  }

  if (intent === "earnings") {
    return "ativacao_motorista";
  }

  if (intent === "support") {
    return "suporte";
  }

  return "outros";
};

export async function createLeadFromAssistant(lead: AssistantLead) {
  const response = await postJson<{ data: CreatedLead }>("/leads", {
    origem: "bot_whatsapp",
    nome: "Lead assistente Open Driver",
    cidade: lead.city,
    servico_interesse: getLeadInterestLabel(lead),
    observacao: JSON.stringify({
      driverType: lead.driverType,
      mainPain: lead.mainPain,
      temperature: lead.temperature,
      score: lead.score
    })
  });

  return response.data;
}

export async function recordBotInteraction(input: {
  mensagemUsuario: string;
  respostaBot: string;
  etapaFluxo: AssistantStep;
  leadId?: number;
  lead: AssistantLead;
}) {
  await postJson<{ data: { id: number } }>("/bot/interactions", {
    canal: "web",
    mensagem_usuario: input.mensagemUsuario,
    resposta_bot: input.respostaBot,
    etapa_fluxo: input.etapaFluxo,
    intencao: intentToBotIntent(input.lead.mainIntent),
    lead_id: input.leadId
  });
}
