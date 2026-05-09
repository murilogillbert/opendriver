import type { FastifyInstance } from "fastify";
import Groq from "groq-sdk";
import { z } from "zod";

import { config } from "./config.js";
import { query, sqlTypes } from "./db.js";

// ─── Groq client ─────────────────────────────────────────────────────────────
let groqClient: Groq | null = null;
if (config.groqApiKey) {
  groqClient = new Groq({ apiKey: config.groqApiKey });
}

// ─── Product cache (refreshed every 5 minutes) ───────────────────────────────
type CachedProduct = {
  id: number;
  nome: string;
  descricao_curta: string | null;
  offer_type: string | null;
  delivery_method: string | null;
  preco_original: number;
  preco_desconto: number;
  economia_estimada: number;
  cashback_percent: number | null;
  usage_rules: string | null;
};

let productCache: CachedProduct[] = [];
let productCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getActiveProducts(): Promise<CachedProduct[]> {
  if (Date.now() - productCacheAt < CACHE_TTL_MS && productCache.length > 0) {
    return productCache;
  }
  const rows = await query<CachedProduct>(
    `SELECT TOP 40 id, nome, descricao_curta, offer_type, delivery_method,
            preco_original, preco_desconto, economia_estimada, cashback_percent, usage_rules
       FROM dbo.products
      WHERE status = 'ativo'
      ORDER BY destaque_home DESC, id DESC`
  );
  productCache = rows;
  productCacheAt = Date.now();
  return rows;
}

// ─── System prompt builder ────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `Você é o Assistente DriverHub, um assistente virtual especializado em ajudar motoristas profissionais no Brasil — app (Uber, 99, InDrive), táxi, mototaxi e entregadores.

## Sobre a DriverHub
A DriverHub é uma plataforma de benefícios exclusivos para motoristas profissionais. Oferece:
- Descontos em combustível, manutenção, pneus e serviços automotivos via rede de parceiros
- Marketplace com produtos digitais e físicos com preços especiais
- Sistema de cashback: percentual do valor pago retorna como crédito na conta do motorista
- Sistema de níveis com benefícios crescentes:
  • Bronze: nível inicial (0-4 aquisições/mês)
  • Prata: 5-9 aquisições/mês → mais benefícios
  • Ouro: 10+ aquisições/mês → benefícios premium
- Rede de parceiros presenciais: motorista escaneia QR code do parceiro → escolhe serviço → paga → cashback liberado automaticamente
- Crédito de cashback expira em 90 dias se não utilizado

## Como o resgate funciona
1. Motorista compra um produto/benefício no app
2. Recebe voucher ou token de resgate único
3. Para parceiros presenciais: escaneia QR code na loja → seleciona o serviço → paga → cashback creditado

## Seu papel
- Responder dúvidas sobre produtos, benefícios, cashback, pedidos e como usar a plataforma
- Orientar sobre como ativar, resgatar e acompanhar benefícios
- Explicar o sistema de níveis e como subir de nível
- Dar dicas relevantes para motoristas profissionais (economia de combustível, manutenção preventiva, direitos trabalhistas básicos, apps de abastecimento, etc.)
- Para fechar vendas, problemas técnicos graves ou negociações: sugerir continuar pelo WhatsApp

## Regras
- Responda SEMPRE em português do Brasil, com linguagem próxima ao motorista
- Seja direto e objetivo (máximo 4-5 linhas por resposta)
- Não invente preços ou promoções que não estejam nos dados reais fornecidos
- Se não souber algo específico, seja honesto e ofereça o WhatsApp
- Pode responder perguntas gerais úteis para motoristas profissionais (não só sobre a DriverHub)
- Use emojis com moderação para deixar a conversa mais leve`;

function buildSystemPrompt(products: CachedProduct[], leadContext?: Record<string, string | undefined>): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Inject real products
  if (products.length > 0) {
    const offerTypeLabel: Record<string, string> = {
      produto_fisico: "Produto físico",
      produto_digital: "Produto digital",
      servico: "Serviço",
      voucher: "Voucher",
      beneficio_recorrente: "Benefício recorrente",
      combo: "Combo"
    };
    const deliveryLabel: Record<string, string> = {
      digital: "entrega digital",
      presencial: "resgate presencial (QR code)",
      fisica: "entrega física"
    };

    const lines = products.map((p) => {
      const tipo = offerTypeLabel[p.offer_type ?? ""] ?? p.offer_type ?? "Produto";
      const entrega = deliveryLabel[p.delivery_method ?? ""] ?? p.delivery_method ?? "";
      const preco = p.preco_desconto > 0
        ? `R$ ${p.preco_desconto.toFixed(2).replace(".", ",")} (de R$ ${p.preco_original.toFixed(2).replace(".", ",")})`
        : p.preco_original > 0
          ? `R$ ${p.preco_original.toFixed(2).replace(".", ",")}`
          : "Gratuito";
      const cashback = p.cashback_percent && p.cashback_percent > 0
        ? ` | Cashback: ${p.cashback_percent}%`
        : "";
      const desc = p.descricao_curta ? ` — ${p.descricao_curta}` : "";
      return `• ${p.nome} [${tipo}${entrega ? `, ${entrega}` : ""}] ${preco}${cashback}${desc}`;
    });

    prompt += `\n\n## Produtos e benefícios disponíveis agora\n${lines.join("\n")}`;
    prompt += `\n\nUse essas informações para responder perguntas sobre preços, cashback e tipos de entrega. Cite os nomes exatos dos produtos ao responder.`;
  } else {
    prompt += `\n\n## Produtos\nNenhum produto ativo no momento. Informe que o catálogo está sendo atualizado e ofereça o WhatsApp para mais detalhes.`;
  }

  // Inject lead context
  if (leadContext) {
    const parts: string[] = [];
    if (leadContext.driverType) parts.push(`Tipo de motorista: ${leadContext.driverType}`);
    if (leadContext.city) parts.push(`Cidade: ${leadContext.city}`);
    if (leadContext.mainPain) parts.push(`Principal interesse: ${leadContext.mainPain}`);
    if (parts.length > 0) {
      prompt += `\n\n## Contexto do usuário\n${parts.join("\n")}`;
    }
  }

  return prompt;
}

// ─── Validation schemas ───────────────────────────────────────────────────────
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

// ─── Route registration ───────────────────────────────────────────────────────
export async function registerChatRoutes(app: FastifyInstance) {
  app.post(
    "/api/chat",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!groqClient) {
        return reply.code(503).send({ error: "chat_unavailable" });
      }

      const body = ChatRequestSchema.parse(request.body);

      // Fetch products (cached)
      const products = await getActiveProducts().catch(() => [] as CachedProduct[]);

      const systemPrompt = buildSystemPrompt(products, body.leadContext);

      const completion = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...body.messages.map((m) => ({ role: m.role, content: m.content }))
        ],
        max_tokens: 450,
        temperature: 0.7
      });

      const message =
        completion.choices[0]?.message?.content?.trim() ??
        "Ops, não consegui processar sua pergunta agora. Tente novamente em instantes 😊";

      return reply.send({ data: { message } });
    }
  );
}
