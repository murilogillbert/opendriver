import type { FastifyInstance } from "fastify";
import Groq from "groq-sdk";
import { z } from "zod";

import { config } from "./config.js";

// Lazy-init: only instantiate if key is present
let groqClient: Groq | null = null;
if (config.groqApiKey) {
  groqClient = new Groq({ apiKey: config.groqApiKey });
}

const SYSTEM_PROMPT = `Você é o Assistente DriverHub, um assistente virtual especializado em ajudar motoristas de aplicativo, táxi e entregas no Brasil.

A DriverHub é uma plataforma de benefícios para motoristas profissionais que oferece:
- Descontos em combustível, manutenção, pneus e serviços automotivos via parceiros
- Cashback em gastos com estabelecimentos parceiros da rede
- Marketplace com produtos digitais e físicos com preços especiais para motoristas
- Sistema de níveis (Bronze → Prata → Ouro) com benefícios crescentes conforme o número de aquisições mensais:
  • Bronze: nível inicial
  • Prata: 5+ aquisições/mês
  • Ouro: 10+ aquisições/mês
- Parcerias com estabelecimentos locais para resgatar benefícios presencialmente via QR code

Como o sistema de benefícios funciona:
1. O motorista adquire um produto ou benefício no marketplace
2. Recebe um voucher ou token de resgate único
3. Para benefícios presenciais: o parceiro tem um QR code físico na loja
4. O motorista escaneia o QR → seleciona o serviço → efetua o pagamento
5. Após pagamento confirmado, o cashback é liberado automaticamente na conta

Como o cashback funciona:
- Percentual do valor pago retorna como saldo na conta do motorista
- Saldo pode ser usado como desconto em compras futuras
- Cashback liberado após confirmação do pagamento no parceiro
- Saldo expira em 90 dias se não utilizado

Seu papel:
- Tirar dúvidas sobre produtos, benefícios, cashback e como usar a plataforma
- Orientar sobre como ativar e resgatar benefícios
- Explicar o sistema de níveis e como subir de nível
- Ser simpático, direto e usar linguagem próxima ao dia a dia do motorista brasileiro
- Para negociações, fechamentos de vendas ou problemas técnicos complexos: sugerir continuar pelo WhatsApp

Regras importantes:
- Responda SEMPRE em português do Brasil
- Seja objetivo: máximo 3-4 linhas por resposta
- Use linguagem simples, sem termos técnicos
- Não invente preços específicos ou produtos que não foram mencionados — diga que pode verificar no WhatsApp
- Se a pergunta fugir completamente do contexto da DriverHub, redirecione gentilmente
- Seja humano e próximo, não robótico`;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000)
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  leadContext: z
    .object({
      driverType: z.string().max(80).optional(),
      city: z.string().max(80).optional(),
      mainPain: z.string().max(120).optional()
    })
    .optional()
});

export async function registerChatRoutes(app: FastifyInstance) {
  app.post(
    "/api/chat",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      if (!groqClient) {
        return reply.code(503).send({ error: "chat_unavailable" });
      }

      const body = ChatRequestSchema.parse(request.body);

      // Build system prompt, optionally injecting lead context
      let systemPrompt = SYSTEM_PROMPT;
      if (body.leadContext) {
        const parts: string[] = [];
        if (body.leadContext.driverType) parts.push(`Tipo de motorista: ${body.leadContext.driverType}`);
        if (body.leadContext.city) parts.push(`Cidade: ${body.leadContext.city}`);
        if (body.leadContext.mainPain) parts.push(`Principal interesse declarado: ${body.leadContext.mainPain}`);
        if (parts.length > 0) {
          systemPrompt += `\n\nContexto do usuário atual:\n${parts.join("\n")}`;
        }
      }

      const completion = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...body.messages.map((m) => ({ role: m.role, content: m.content }))
        ],
        max_tokens: 350,
        temperature: 0.65
      });

      const message =
        completion.choices[0]?.message?.content?.trim() ??
        "Ops, não consegui processar sua pergunta agora. Tente novamente em instantes 😊";

      return reply.send({ data: { message } });
    }
  );
}
