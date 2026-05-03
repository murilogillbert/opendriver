import {
  AssistantIntent,
  AssistantQuickReply,
  cityReplies,
  driverTypeReplies,
  fallbackPainResponse,
  intentResponses,
  painReplies
} from "./assistantFlow";

export type AssistantStep = "driverType" | "city" | "mainPain" | "ready";

export type LeadTemperature = "frio" | "morno" | "quente";

export type AssistantLead = {
  driverType?: string;
  city?: string;
  mainPain?: string;
  mainIntent?: AssistantIntent;
  score: number;
  temperature: LeadTemperature;
};

export type AssistantEngineState = {
  step: AssistantStep;
  lead: AssistantLead;
};

export type AssistantEngineResult = AssistantEngineState & {
  responses: string[];
  quickReplies: AssistantQuickReply[];
};

const intentKeywords: Record<Exclude<AssistantIntent, "unknown">, string[]> = {
  fuel: ["combustivel", "combustível", "gasolina", "etanol", "diesel", "abastecer", "posto"],
  maintenance: ["manutencao", "manutenção", "oficina", "oleo", "óleo", "pneu", "revisao", "revisão"],
  cashback: ["cashback", "cartao", "cartão", "servico", "serviço", "economizar"],
  earnings: ["ganhar", "ganho", "lucro", "renda", "dinheiro", "corrida", "mais"],
  benefits: ["beneficio", "benefício", "vantagem", "parceiro", "desconto", "clube"],
  support: ["suporte", "atendimento", "ajuda", "explicar", "duvida", "dúvida"]
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function createInitialAssistantState(): AssistantEngineState {
  return {
    step: "driverType",
    lead: {
      score: 0,
      temperature: "frio"
    }
  };
}

export function getQuickRepliesForStep(step: AssistantStep): AssistantQuickReply[] {
  if (step === "driverType") {
    return driverTypeReplies;
  }

  if (step === "city") {
    return cityReplies;
  }

  if (step === "mainPain") {
    return painReplies;
  }

  return [];
}

export function detectIntent(input: string): AssistantIntent {
  const text = normalize(input);
  const match = Object.entries(intentKeywords).find(([, keywords]) =>
    keywords.some((keyword) => text.includes(normalize(keyword)))
  );

  return (match?.[0] as AssistantIntent | undefined) ?? "unknown";
}

function getTemperature(score: number): LeadTemperature {
  if (score >= 6) {
    return "quente";
  }

  if (score >= 3) {
    return "morno";
  }

  return "frio";
}

function buildReadyResponse(lead: AssistantLead) {
  const city = lead.city ? ` em ${lead.city}` : "";
  const driver = lead.driverType ? ` como ${lead.driverType.toLowerCase()}` : "";
  const interest =
    lead.mainIntent && lead.mainIntent !== "unknown"
      ? intentResponses[lead.mainIntent].label
      : "benefícios para motorista";

  return `Pelo que você contou, faz sentido seguir com ${interest}${driver}${city}. Eu já monto uma mensagem com esse contexto para o atendimento continuar no WhatsApp.`;
}

export function advanceAssistant(
  state: AssistantEngineState,
  userInput: string
): AssistantEngineResult {
  const input = userInput.trim();

  if (state.step === "driverType") {
    const score = state.lead.score + (normalize(input).includes("motorista") ? 2 : 1);
    const lead = {
      ...state.lead,
      driverType: input,
      score,
      temperature: getTemperature(score)
    };

    return {
      step: "city",
      lead,
      responses: [
        "Boa. Isso já ajuda a direcionar melhor os benefícios.",
        "Agora me diz uma coisa: em qual cidade ou região você costuma rodar?"
      ],
      quickReplies: getQuickRepliesForStep("city")
    };
  }

  if (state.step === "city") {
    const score = state.lead.score + 1;
    const lead = {
      ...state.lead,
      city: input,
      score,
      temperature: getTemperature(score)
    };

    return {
      step: "mainPain",
      lead,
      responses: [
        "Perfeito. Última pergunta para eu personalizar melhor.",
        "Hoje, o que mais pesa no seu bolso como motorista?"
      ],
      quickReplies: getQuickRepliesForStep("mainPain")
    };
  }

  if (state.step === "mainPain") {
    const intent = detectIntent(input);
    const matched = intent !== "unknown" ? intentResponses[intent] : undefined;
    const score = state.lead.score + (matched?.score ?? 1);
    const lead = {
      ...state.lead,
      mainPain: input,
      mainIntent: intent,
      score,
      temperature: getTemperature(score)
    };

    return {
      step: "ready",
      lead,
      responses: [matched?.response ?? fallbackPainResponse, buildReadyResponse(lead)],
      quickReplies: []
    };
  }

  return {
    ...state,
    responses: [
      "Já tenho o essencial para encaminhar seu atendimento. Se quiser, é só continuar pelo WhatsApp com o resumo pronto."
    ],
    quickReplies: []
  };
}

export function getLeadInterestLabel(lead: AssistantLead) {
  if (!lead.mainIntent || lead.mainIntent === "unknown") {
    return "benefícios para motorista";
  }

  return intentResponses[lead.mainIntent].summary;
}
