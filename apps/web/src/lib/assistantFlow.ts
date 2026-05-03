export type AssistantQuickReply = {
  label: string;
  value: string;
};

export type AssistantIntent =
  | "fuel"
  | "maintenance"
  | "cashback"
  | "earnings"
  | "benefits"
  | "support"
  | "unknown";

export const driverTypeReplies: AssistantQuickReply[] = [
  { label: "Motorista de app", value: "Motorista de app" },
  { label: "Táxi", value: "Táxi" },
  { label: "Entregas", value: "Entregas" },
  { label: "Outro", value: "Outro" }
];

export const cityReplies: AssistantQuickReply[] = [
  { label: "Brasília", value: "Brasília" },
  { label: "Entorno DF", value: "Entorno DF" },
  { label: "Goiânia", value: "Goiânia" }
];

export const painReplies: AssistantQuickReply[] = [
  { label: "Combustível", value: "Combustível" },
  { label: "Manutenção", value: "Manutenção" },
  { label: "Quero ganhar mais", value: "Quero ganhar mais" },
  { label: "Benefícios", value: "Benefícios" }
];

export const assistantWelcomeText =
  "Oi, sou o assistente da Open Driver. Vou entender seu perfil rapidinho e te mostrar o melhor caminho para aumentar seu ganho.";

export const intentResponses: Record<
  Exclude<AssistantIntent, "unknown">,
  {
    label: string;
    response: string;
    summary: string;
    score: number;
  }
> = {
  fuel: {
    label: "desconto em combustível",
    response:
      "Combustível costuma pesar muito na rotina. Para esse perfil, a Open Driver destaca economia por abastecimento e parceiros para reduzir o custo por corrida.",
    summary: "interesse em desconto em combustível",
    score: 3
  },
  maintenance: {
    label: "manutenção com preço reduzido",
    response:
      "Manutenção também come margem. A Open Driver pode direcionar você para vantagens com oficinas parceiras e serviços essenciais com preço menor.",
    summary: "interesse em manutenção com preço reduzido",
    score: 3
  },
  cashback: {
    label: "cashback em serviços",
    response:
      "Boa. Cashback ajuda a transformar gastos recorrentes em retorno. A Open Driver organiza benefícios para você aproveitar melhor os serviços do dia a dia.",
    summary: "interesse em cashback em serviços",
    score: 2
  },
  earnings: {
    label: "aumentar ganhos",
    response:
      "Perfeito. Quando o custo por corrida cai, o ganho líquido melhora. A Open Driver foca em benefícios práticos para sobrar mais no fim do mês.",
    summary: "interesse em aumentar ganhos",
    score: 3
  },
  benefits: {
    label: "benefícios para motorista",
    response:
      "Esse é o coração da Open Driver: reunir vantagens úteis para motorista em um só lugar, com ativação simples e atendimento direto.",
    summary: "interesse em benefícios parceiros",
    score: 2
  },
  support: {
    label: "suporte direto",
    response:
      "Você não precisa ficar tentando entender tudo sozinho. A Open Driver direciona o atendimento para explicar os benefícios e te ajudar na ativação.",
    summary: "interesse em suporte direto",
    score: 1
  }
};

export const fallbackPainResponse =
  "Entendi. Vou considerar isso como interesse em benefícios para reduzir custos e melhorar seu ganho como motorista.";
