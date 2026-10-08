import type { Vehicle, VehicleCategory } from '@prisma/client';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { vehicleValidation } from '../../infra/vehicleValidation/index.js';
import type { DadosDoDetran, VehicleValidationOutput } from '../../infra/vehicleValidation/types.js';
import {
  canonizarMarca,
  decidirCategoria,
  escolherCategoria,
  type FonteDaCategoria,
  type RegraDeCategoria,
} from '../../domain/vehicleCategory.js';

/**
 * Validação de veículo no Detran **e** classificação em Econômico ou Conforto.
 *
 * Vive fora de `driver.service.ts` porque três caminhos precisam do mesmo comportamento, e
 * antes só o primeiro existia:
 *
 *   1. cadastro de veículo pelo motorista (`POST /driver/vehicles`)
 *   2. revalidação pelo operador (`POST /admin/vehicles/:id/revalidate`)
 *   3. reclassificação em lote quando a tabela de regras muda
 *
 * O terceiro é o que justifica guardar `detran_brand`, `detran_model` e `detran_year` no
 * veículo: mudar uma regra e reprocessar a frota **não deve** pagar a consulta ao Detran de
 * novo. Consulta é cobrada por chamada.
 */

/** Cache curto das regras por marca: mudam por ação de operador, não por requisição. */
const CACHE_TTL_MS = 60_000;
const cacheRegras = new Map<string, { regras: RegraDeCategoria[]; at: number }>();

export function limparCacheDeRegras(): void {
  cacheRegras.clear();
}

async function carregarRegras(brand: string): Promise<RegraDeCategoria[]> {
  const marca = canonizarMarca(brand);
  if (!marca) return [];
  const hit = cacheRegras.get(marca);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.regras;

  /**
   * Busca por marca normalizada no banco exige que a coluna também esteja normalizada. A
   * escrita (admin e importação de CSV) normaliza antes de gravar, então a comparação é
   * direta — e por isso `mode: 'insensitive'` não é suficiente aqui: acento também precisa
   * cair, e o Postgres não tira acento sem `unaccent`.
   */
  const rows = await prisma.vehicleModelCategory.findMany({
    where: { brand: marca, active: true },
    orderBy: [{ priority: 'asc' }],
  });
  const regras: RegraDeCategoria[] = rows.map((r) => ({
    brand: r.brand,
    modelPattern: r.modelPattern,
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    category: r.category,
    priority: r.priority,
    active: r.active,
  }));
  cacheRegras.set(marca, { regras, at: Date.now() });
  return regras;
}

/**
 * Calcula a categoria a partir do que o Detran respondeu. `null` quando não há regra que
 * cubra o modelo — e `null` significa "a declaração do motorista permanece", não "Econômico".
 */
export async function calcularCategoria(detran: DadosDoDetran | null): Promise<VehicleCategory | null> {
  if (!detran) return null;
  const regras = await carregarRegras(detran.brand);
  if (!regras.length) return null;
  const escolha = escolherCategoria(regras, {
    brand: detran.brand,
    model: detran.model,
    year: detran.year,
  });
  return escolha?.category ?? null;
}

/**
 * Consulta o Detran e grava o resultado, incluindo a categoria decidida.
 *
 * **Nunca lança.** Indisponibilidade do provedor cai em revisão manual, que é o fluxo que já
 * existia — e é o certo: um serviço externo fora do ar não pode impedir o motorista de
 * cadastrar o carro.
 */
export async function validarEClassificar(
  v: Vehicle,
  opts: { ownerDocument?: string } = {}
): Promise<Vehicle> {
  if (!v.renavam || !v.uf) return v;

  let outcome: VehicleValidationOutput;
  try {
    outcome = await vehicleValidation.validate({
      plate: v.plate,
      renavam: v.renavam,
      uf: v.uf,
      chassi: v.chassi ?? undefined,
      ownerDocument: opts.ownerDocument,
      registered: { brand: v.brand, model: v.model, year: v.year },
    });
  } catch (err) {
    outcome = {
      result: 'needs_review',
      matched: false,
      detail: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  const validationStatus =
    outcome.result === 'approved' ? 'Auto' : outcome.result === 'rejected' ? 'Rejected' : 'Manual';
  const vehicleStatus =
    outcome.result === 'approved' ? 'Approved' : outcome.result === 'rejected' ? 'Rejected' : v.status;

  const detran = outcome.detran ?? null;
  const calculada = await calcularCategoria(detran);
  const decisao = decidirCategoria({
    declarada: v.category,
    calculada,
    fonteAtual: v.categorySource as FonteDaCategoria,
    categoriaAtual: v.category,
  });

  const [updated] = await prisma.$transaction([
    prisma.vehicle.update({
      where: { id: v.id },
      data: {
        validationStatus,
        status: vehicleStatus,
        category: decisao.category,
        categorySource: decisao.source,
        categoryAuto: decisao.categoryAuto,
        categoryDivergence: decisao.divergence,
        // Só sobrescreve o que o Detran disse quando ele disse algo. Consulta indisponível
        // não deve apagar o retorno de uma consulta anterior que funcionou.
        ...(detran
          ? {
              detranBrand: detran.brand || null,
              detranModel: detran.model || null,
              detranYear: detran.year,
            }
          : {}),
      },
    }),
    prisma.vehicleValidation.create({
      data: {
        vehicleId: v.id,
        provider: vehicleValidation.name,
        result: outcome.result,
        matched: outcome.matched,
        detailJson: {
          ...outcome.detail,
          categoriaDeclarada: v.category,
          categoriaCalculada: calculada,
          categoriaVigente: decisao.category,
          divergencia: decisao.divergence,
        } as never,
      },
    }),
  ]);
  return updated;
}

/**
 * Recalcula a categoria a partir do retorno do Detran **já guardado**, sem nova consulta.
 *
 * É o que torna a tabela de regras editável sem custo: o operador ajusta uma regra, roda
 * isto, e a frota é reclassificada de graça. Sem as colunas `detran_*` guardadas, a única
 * alternativa seria consultar o Detran de novo para cada veículo — pago, lento e sujeito a
 * indisponibilidade.
 *
 * Veículo com `category_source = 'admin'` é preservado: decisão humana não é desfeita por
 * reprocessamento.
 */
export async function reclassificarEmLote(
  adminId: string,
  opts: { aplicar: boolean } = { aplicar: true }
): Promise<{ avaliados: number; alterados: number; divergentes: number; amostra: unknown[] }> {
  const veiculos = await prisma.vehicle.findMany({
    where: { active: true, detranBrand: { not: null } },
    select: {
      id: true,
      plate: true,
      brand: true,
      model: true,
      year: true,
      category: true,
      categorySource: true,
      detranBrand: true,
      detranModel: true,
      detranYear: true,
    },
  });

  let alterados = 0;
  let divergentes = 0;
  const amostra: unknown[] = [];

  for (const v of veiculos) {
    const calculada = await calcularCategoria({
      brand: v.detranBrand ?? '',
      model: v.detranModel ?? '',
      year: v.detranYear ?? null,
    });
    const decisao = decidirCategoria({
      declarada: v.category,
      calculada,
      fonteAtual: v.categorySource as FonteDaCategoria,
      categoriaAtual: v.category,
    });
    if (decisao.divergence) divergentes += 1;
    const mudou =
      decisao.category !== v.category ||
      decisao.source !== v.categorySource ||
      decisao.categoryAuto !== null;

    if (!mudou) continue;
    if (amostra.length < 20) {
      amostra.push({
        plate: v.plate,
        de: v.category,
        para: decisao.category,
        calculada,
        divergencia: decisao.divergence,
      });
    }
    if (decisao.category !== v.category) alterados += 1;

    if (opts.aplicar) {
      await prisma.vehicle.update({
        where: { id: v.id },
        data: {
          category: decisao.category,
          categorySource: decisao.source,
          categoryAuto: decisao.categoryAuto,
          categoryDivergence: decisao.divergence,
        },
      });
    }
  }

  if (opts.aplicar) {
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'opendriver.vehicle.reclassify_batch',
        entityType: 'Vehicle',
        entityId: 'lote',
        payloadJson: JSON.stringify({ avaliados: veiculos.length, alterados, divergentes }),
      },
    });
  }

  return { avaliados: veiculos.length, alterados, divergentes, amostra };
}

/**
 * Reclassificação manual por operador.
 *
 * Marca `category_source = 'admin'`, e é isso que impede a próxima revalidação de desfazer a
 * decisão. Sem essa marca, a correção duraria até o próximo reprocessamento e o operador não
 * teria como saber por quê.
 */
export async function reclassificarPorAdmin(
  adminId: string,
  vehicleId: string,
  category: VehicleCategory,
  reason: string
): Promise<Vehicle> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v) throw new AppError('Veículo não encontrado.', 404, 'not_found');

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      category,
      categorySource: 'admin',
      // A divergência passa a ser medida contra o que a regra calculou, que não muda aqui.
      categoryDivergence: v.categoryAuto !== null && v.categoryAuto !== category,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'opendriver.vehicle.reclassify',
      entityType: 'Vehicle',
      entityId: vehicleId,
      payloadJson: JSON.stringify({ de: v.category, para: category, reason, fonteAnterior: v.categorySource }),
    },
  });

  return updated;
}

/** Revalidação sob demanda de um veículo, pelo operador. */
export async function revalidarPorAdmin(adminId: string, vehicleId: string): Promise<Vehicle> {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { driver: { select: { cpf: true } } },
  });
  if (!v) throw new AppError('Veículo não encontrado.', 404, 'not_found');
  if (!v.renavam || !v.uf) {
    throw new AppError('O veículo não tem RENAVAM e UF cadastrados.', 400, 'sem_renavam');
  }

  const { driver, ...vehicle } = v;
  const updated = await validarEClassificar(vehicle as Vehicle, {
    ownerDocument: driver?.cpf ?? undefined,
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'opendriver.vehicle.revalidate',
      entityType: 'Vehicle',
      entityId: vehicleId,
      payloadJson: JSON.stringify({
        validationStatus: updated.validationStatus,
        category: updated.category,
        categorySource: updated.categorySource,
      }),
    },
  });

  return updated;
}
