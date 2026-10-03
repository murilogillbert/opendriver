import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { round2 } from '../../lib/money.js';

/**
 * Crédito de repasse de anúncio no livro-caixa do motorista.
 *
 * Chamado pelo **openad** por `/internal/driver-earnings/ad-revenue` no instante em que uma
 * veiculação é classificada como faturável — depois da reconciliação de duração e das regras
 * de antifraude, nunca com base no que o tablete reportou.
 *
 * Por que o crédito mora aqui e não no openad: existem duas carteiras de motorista no
 * ecossistema, e esta é a que ele olha. O extrato, o saldo agregado, `payout_requests` e as
 * telas de saque por PIX já existem. O openad reporta e este serviço credita — ele nunca
 * escreve em `opendriver.driver_earnings` direto, porque a regra do ecossistema é que só o
 * dono altera o seu schema.
 */

export const adRevenueSchema = z.object({
  /** `public.users.id` do motorista. */
  driverUserId: z.string().uuid(),
  /**
   * Centavos inteiros. O openad conta dinheiro em inteiro; a conversão para `Decimal(10,2)`
   * acontece **aqui**, na fronteira, e é por isso que o contrato é explícito na unidade.
   * Receber "amount" sem unidade no nome é como se paga por um erro de fator 100.
   */
  amountCents: z.number().int().positive().max(1_000_000),
  /** `<campaignId>:<uniqueEventId>` — a trava de idempotência. */
  referenceId: z.string().min(3).max(160),
  campaignId: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
});

export type AdRevenueRequest = z.infer<typeof adRevenueSchema>;

export interface AdRevenueResult {
  earningId: string;
  /** `true` quando o lançamento já existia e nada foi criado. */
  duplicated: boolean;
}

/**
 * Credita, uma vez só.
 *
 * O `max(1_000_000)` no schema — dez mil reais numa única veiculação — não é desconfiança do
 * openad: é limite de sanidade contra erro de unidade. Se algum dia alguém passar reais em
 * vez de centavos, o pedido é recusado em vez de creditar cem vezes o devido, e o erro
 * aparece como 400 no log do openad em vez de como um passivo no caixa.
 */
export async function creditAdRevenue(
  body: unknown
): Promise<AdRevenueResult> {
  const data = adRevenueSchema.parse(body);

  /**
   * O motorista tem de existir e ser motorista.
   *
   * A FK para `public.users` já garantiria a existência, mas com `onDelete: Restrict` o erro
   * viria como violação de constraint — um 500 opaco. Checar antes devolve 404 com causa
   * legível, e o openad registra isso na conferência em vez de tentar de novo para sempre.
   */
  const driver = await prisma.user.findUnique({
    where: { id: data.driverUserId },
    select: { id: true, role: true },
  });
  if (!driver) {
    throw new AppError('Motorista nao encontrado.', 404, 'driver_not_found');
  }

  const amount = round2(new Prisma.Decimal(data.amountCents).div(100));

  try {
    const created = await prisma.driverEarning.create({
      data: {
        driverId: data.driverUserId,
        // Anúncio não tem corrida: o vídeo toca com o carro em movimento, haja passageiro ou
        // não. É justamente por `rideId` ser nulo que `referenceId` precisa existir.
        rideId: null,
        type: 'AdRevenue',
        amount,
        description: data.description.slice(0, 200),
        referenceId: data.referenceId,
      },
      select: { id: true },
    });
    return { earningId: created.id, duplicated: false };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      /**
       * Já lançado. Responder **409 com o id existente** em vez de erro: para quem chama,
       * "já estava feito" e "acabei de fazer" têm o mesmo efeito, e é isso que torna a
       * retentativa segura. O openad trata 409 como sucesso.
       */
      const existing = await prisma.driverEarning.findUnique({
        where: { referenceId: data.referenceId },
        select: { id: true },
      });
      return {
        earningId: existing?.id ?? '',
        duplicated: true,
      };
    }
    throw e;
  }
}

/**
 * Total de repasse de anúncio de um motorista num período, para o app mostrar separado.
 *
 * Separar `AdRevenue` do ganho de corrida importa para o motorista: são duas fontes de
 * receita com naturezas diferentes, e somar as duas num número só esconde quanto a tela está
 * rendendo — que é exatamente a informação que o faz aceitar o equipamento no carro.
 */
export async function adRevenueSummary(
  driverId: string,
  from: Date,
  to: Date
): Promise<{ plays: number; totalCents: number }> {
  const agg = await prisma.driverEarning.aggregate({
    where: {
      driverId,
      type: 'AdRevenue',
      createdAt: { gte: from, lte: to },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const total = agg._sum.amount ?? new Prisma.Decimal(0);
  return {
    plays: agg._count._all,
    // Volta para centavos inteiros na saída, mesma unidade da entrada.
    totalCents: Number(new Prisma.Decimal(total).mul(100).toFixed(0)),
  };
}
