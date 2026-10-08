import { z } from 'zod';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { config } from '../../config.js';
import { getSetting } from '../../infra/settings.js';
import {
  consultarDetranCru,
  limparCacheDeProvedores,
} from '../../infra/vehicleValidation/infosimples.js';
import { canonizarMarca, lerCsvDeCategorias, normalizarTexto } from '../../domain/vehicleCategory.js';
import { limparCacheDeRegras } from './validation.service.js';

/**
 * Ferramentas de operador para a classificação automática de veículos.
 *
 * Duas tabelas: `detran_providers` (qual UF tem consulta e o que ela exige) e
 * `vehicle_model_categories` (que modelo é Econômico e que modelo é Conforto). As duas são
 * dado de operação, não de código — mudar a classificação de um modelo não deveria exigir
 * deploy, e descobrir o caminho de um serviço da Infosimples só é possível consultando de
 * verdade.
 */

async function audit(actorId: string, action: string, entityType: string, entityId: string, payload?: unknown) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action: `opendriver.${action}`,
      entityType,
      entityId,
      payloadJson: payload ? JSON.stringify(payload) : null,
    },
  });
}

// ------------------------------------------------------------------ provedores por UF

export const detranProviderSchema = z.object({
  label: z.string().trim().min(2).max(80),
  endpoint: z.string().trim().url('Informe a URL completa do serviço.').max(300),
  requiresChassi: z.boolean().default(false),
  requiresLogin: z.boolean().default(false),
  requiresCpfCnpj: z.boolean().default(false),
  loginSettingKey: z.string().trim().max(80).nullish(),
  senhaSettingKey: z.string().trim().max(80).nullish(),
  active: z.boolean().default(true),
  notes: z.string().trim().max(400).nullish(),
});

export async function listDetranProviders() {
  const rows = await prisma.detranProvider.findMany({ orderBy: { uf: 'asc' } });
  return rows.map((r) => ({
    uf: r.uf,
    label: r.label,
    endpoint: r.endpoint,
    requiresChassi: r.requiresChassi,
    requiresLogin: r.requiresLogin,
    requiresCpfCnpj: r.requiresCpfCnpj,
    loginSettingKey: r.loginSettingKey,
    senhaSettingKey: r.senhaSettingKey,
    active: r.active,
    notes: r.notes,
    lastProbeAt: r.lastProbeAt,
    lastProbeResult: r.lastProbeResult,
    updatedAt: r.updatedAt,
  }));
}

export async function upsertDetranProvider(
  adminId: string,
  uf: string,
  input: z.infer<typeof detranProviderSchema>
) {
  const chave = uf.toUpperCase();
  /**
   * Exigir a chave da credencial quando a UF pede login evita o caso silencioso: provedor
   * marcado como ativo, `requiresLogin` ligado e nenhum lugar de onde ler a senha — que
   * manda todo veículo daquela UF para revisão manual sem o operador entender por quê.
   */
  if (input.requiresLogin && !(input.loginSettingKey && input.senhaSettingKey)) {
    throw new AppError(
      'UF que exige login precisa das duas chaves de credencial (login e senha).',
      400,
      'credencial_incompleta'
    );
  }

  const dados = {
    label: input.label,
    endpoint: input.endpoint,
    requiresChassi: input.requiresChassi,
    requiresLogin: input.requiresLogin,
    requiresCpfCnpj: input.requiresCpfCnpj,
    loginSettingKey: input.loginSettingKey ?? null,
    senhaSettingKey: input.senhaSettingKey ?? null,
    active: input.active,
    notes: input.notes ?? null,
    updatedBy: adminId,
  };

  await prisma.detranProvider.upsert({
    where: { uf: chave },
    create: { uf: chave, ...dados },
    update: dados,
  });
  limparCacheDeProvedores();
  await audit(adminId, 'detran_provider.upsert', 'DetranProvider', chave, dados);
  return listDetranProviders();
}

export async function removeDetranProvider(adminId: string, uf: string) {
  const chave = uf.toUpperCase();
  const row = await prisma.detranProvider.findUnique({ where: { uf: chave } });
  if (!row) throw new AppError('UF não cadastrada.', 404, 'not_found');
  await prisma.detranProvider.delete({ where: { uf: chave } });
  limparCacheDeProvedores();
  // O registro inteiro vai para a auditoria: apagar configuração sem deixar como ela era
  // torna o estrago irreversível.
  await audit(adminId, 'detran_provider.delete', 'DetranProvider', chave, row);
  return listDetranProviders();
}

export const detranTestSchema = z.object({
  plate: z.string().trim().min(7).max(10),
  renavam: z.string().trim().regex(/^\d{9,11}$/, 'RENAVAM tem de 9 a 11 dígitos.'),
  chassi: z.string().trim().max(30).optional(),
  ownerDocument: z.string().trim().max(20).optional(),
});

/**
 * Executa uma consulta real e devolve a resposta crua.
 *
 * É o único jeito honesto de confirmar o caminho de um serviço: a documentação da Infosimples
 * lista os parâmetros mas não a URL, e sondar sem token devolve `601 não foi possível se
 * autenticar` **antes** de validar a rota — ou seja, 601 não distingue rota inexistente de
 * credencial errada.
 *
 * **Consome crédito**, porque consulta executada é consulta cobrada. Por isso é rota
 * explícita de operador, com placa digitada à mão, e não varredura automática.
 */
export async function testDetranProvider(
  adminId: string,
  uf: string,
  input: z.infer<typeof detranTestSchema>
) {
  /**
   * **Não** exige que a Infosimples seja o provedor ativo do cadastro.
   *
   * A primeira versão exigia, e estava errada: para ligar o provedor real com alguma
   * confiança é preciso antes saber se o endereço do serviço funciona, e o único jeito de
   * saber é consultar. Exigir o provedor ativo invertia a ordem e deixava o botão inútil no
   * exato momento em que ele é necessário.
   *
   * O que de fato é necessário é o token — sem ele não há consulta nenhuma, e a mensagem
   * precisa dizer isso em vez de devolver o 601 cru da Infosimples.
   */
  const token = (await getSetting('Infosimples:Token')) ?? config.vehicleValidation.infosimplesToken;
  if (!token) {
    throw new AppError(
      'Cadastre o token da Infosimples em Integrações (Infosimples:Token) antes de testar.',
      409,
      'token_ausente'
    );
  }
  const resultado = await consultarDetranCru({ uf: uf.toUpperCase(), ...input });
  await audit(adminId, 'detran_provider.test', 'DetranProvider', uf.toUpperCase(), {
    plate: input.plate,
    httpStatus: resultado.httpStatus,
    code: resultado.code,
    message: resultado.message,
  });
  return resultado;
}

// ------------------------------------------------------------------ regras marca/modelo

export const categoryRuleSchema = z.object({
  brand: z.string().trim().min(2, 'Informe a marca.').max(60),
  // Vazio é válido e significa "toda a marca".
  modelPattern: z.string().trim().max(80).default(''),
  yearFrom: z.coerce.number().int().min(1900).max(2100).nullish(),
  yearTo: z.coerce.number().int().min(1900).max(2100).nullish(),
  category: z.enum(['Economy', 'Comfort']),
  priority: z.coerce.number().int().min(0).max(9999).default(100),
  active: z.boolean().default(true),
});

export const categoryRuleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  brand: z.string().trim().max(60).optional(),
  category: z.enum(['Economy', 'Comfort']).optional(),
});

function toRuleDto(r: {
  id: string;
  brand: string;
  modelPattern: string;
  yearFrom: number | null;
  yearTo: number | null;
  category: string;
  priority: number;
  source: string;
  active: boolean;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    brand: r.brand,
    modelPattern: r.modelPattern,
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    category: r.category,
    priority: r.priority,
    source: r.source,
    active: r.active,
    updatedAt: r.updatedAt,
  };
}

export async function listCategoryRules(q: z.infer<typeof categoryRuleQuerySchema>) {
  const where = {
    ...(q.brand ? { brand: canonizarMarca(q.brand) } : {}),
    ...(q.category ? { category: q.category } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vehicleModelCategory.findMany({
      where,
      orderBy: [{ brand: 'asc' }, { priority: 'asc' }, { modelPattern: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.vehicleModelCategory.count({ where }),
  ]);
  return {
    items: rows.map(toRuleDto),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/**
 * Normaliza marca e modelo **na escrita**.
 *
 * A leitura em `validation.service.ts` busca por marca já normalizada, e normalizar na
 * consulta não resolveria: o Postgres não remove acento sem a extensão `unaccent`, então
 * "CITROËN" gravado com acento nunca casaria com o "CITROEN" que vem do Detran.
 */
function normalizarRegra(input: z.infer<typeof categoryRuleSchema>) {
  return {
    // `canonizarMarca` e não só `normalizarTexto`: o operador que digita "VW" espera casar com
    // o "VOLKSWAGEN" que a consulta ao Detran produz.
    brand: canonizarMarca(input.brand),
    modelPattern: normalizarTexto(input.modelPattern),
    yearFrom: input.yearFrom ?? null,
    yearTo: input.yearTo ?? null,
    category: input.category,
    priority: input.priority,
    active: input.active,
  };
}

function conferirFaixa(r: { yearFrom: number | null; yearTo: number | null }) {
  if (r.yearFrom !== null && r.yearTo !== null && r.yearFrom > r.yearTo) {
    throw new AppError('O ano inicial não pode ser maior que o final.', 400, 'faixa_invalida');
  }
}

export async function createCategoryRule(adminId: string, input: z.infer<typeof categoryRuleSchema>) {
  const dados = normalizarRegra(input);
  conferirFaixa(dados);
  const igual = await prisma.vehicleModelCategory.findFirst({
    where: {
      brand: dados.brand,
      modelPattern: dados.modelPattern,
      yearFrom: dados.yearFrom,
      yearTo: dados.yearTo,
    },
  });
  if (igual) {
    throw new AppError('Já existe uma regra com essa marca, modelo e faixa de ano.', 409, 'regra_duplicada');
  }
  const row = await prisma.vehicleModelCategory.create({
    data: { ...dados, source: 'manual', updatedBy: adminId },
  });
  limparCacheDeRegras();
  await audit(adminId, 'vehicle_category_rule.create', 'VehicleModelCategory', row.id, dados);
  return toRuleDto(row);
}

export async function updateCategoryRule(
  adminId: string,
  id: string,
  input: z.infer<typeof categoryRuleSchema>
) {
  const atual = await prisma.vehicleModelCategory.findUnique({ where: { id } });
  if (!atual) throw new AppError('Regra não encontrada.', 404, 'not_found');
  const dados = normalizarRegra(input);
  conferirFaixa(dados);
  const row = await prisma.vehicleModelCategory.update({
    where: { id },
    data: { ...dados, updatedBy: adminId },
  });
  limparCacheDeRegras();
  await audit(adminId, 'vehicle_category_rule.update', 'VehicleModelCategory', id, {
    de: toRuleDto(atual),
    para: dados,
  });
  return toRuleDto(row);
}

export async function deleteCategoryRule(adminId: string, id: string) {
  const atual = await prisma.vehicleModelCategory.findUnique({ where: { id } });
  if (!atual) throw new AppError('Regra não encontrada.', 404, 'not_found');
  await prisma.vehicleModelCategory.delete({ where: { id } });
  limparCacheDeRegras();
  // Regra apagada vai inteira para a auditoria — é a única cópia que sobra.
  await audit(adminId, 'vehicle_category_rule.delete', 'VehicleModelCategory', id, toRuleDto(atual));
  return { deleted: true };
}

export const categoryCsvSchema = z.object({
  csv: z.string().min(1, 'Cole o conteúdo do CSV.').max(180_000),
  /**
   * `false` só confere e devolve o que faria. Importação de planilha é a operação com mais
   * chance de erro de digitação em massa, e ver o resultado antes de aplicar custa um clique.
   */
  aplicar: z.boolean().default(false),
  /** Apaga as regras importadas anteriormente antes de gravar, em vez de acumular. */
  substituirImportadas: z.boolean().default(false),
});

/**
 * Importa a tabela de classificação de um CSV colado pelo operador.
 *
 * Vai como campo de JSON e não como upload de arquivo porque o corpo JSON já é aceito em
 * toda a API (limite de 200 kB, folgado para alguns milhares de linhas) e um `multipart` só
 * para isso acrescentaria dependência e uma rota com regra de validação própria.
 */
export async function importCategoryRules(adminId: string, input: z.infer<typeof categoryCsvSchema>) {
  const { linhas, erros } = lerCsvDeCategorias(input.csv);

  // Linha repetida dentro do próprio arquivo: a última vence, e o operador fica sabendo.
  const porChave = new Map<string, (typeof linhas)[number]>();
  const repetidas: number[] = [];
  for (const l of linhas) {
    const chave = `${l.brand}|${l.modelPattern}|${l.yearFrom ?? ''}|${l.yearTo ?? ''}`;
    if (porChave.has(chave)) repetidas.push(l.linha);
    porChave.set(chave, l);
  }
  const finais = [...porChave.values()];

  if (!input.aplicar) {
    return {
      aplicado: false,
      lidas: linhas.length,
      gravariam: finais.length,
      repetidasNoArquivo: repetidas,
      erros,
      amostra: finais.slice(0, 20),
    };
  }

  if (!finais.length) {
    throw new AppError('Nenhuma linha válida no CSV.', 400, 'csv_vazio');
  }

  let apagadas = 0;
  await prisma.$transaction(async (tx) => {
    if (input.substituirImportadas) {
      const r = await tx.vehicleModelCategory.deleteMany({ where: { source: 'importado' } });
      apagadas = r.count;
    }
    for (const l of finais) {
      const existente = await tx.vehicleModelCategory.findFirst({
        where: {
          brand: l.brand,
          modelPattern: l.modelPattern,
          yearFrom: l.yearFrom,
          yearTo: l.yearTo,
        },
      });
      const dados = {
        brand: l.brand,
        modelPattern: l.modelPattern,
        yearFrom: l.yearFrom,
        yearTo: l.yearTo,
        category: l.category,
        priority: l.priority,
        active: true,
        source: 'importado',
        updatedBy: adminId,
      };
      if (existente) {
        await tx.vehicleModelCategory.update({ where: { id: existente.id }, data: dados });
      } else {
        await tx.vehicleModelCategory.create({ data: dados });
      }
    }
  });

  limparCacheDeRegras();
  await audit(adminId, 'vehicle_category_rule.import', 'VehicleModelCategory', 'lote', {
    gravadas: finais.length,
    apagadas,
    recusadas: erros.length,
  });

  return {
    aplicado: true,
    lidas: linhas.length,
    gravadas: finais.length,
    apagadas,
    repetidasNoArquivo: repetidas,
    erros,
  };
}

// ------------------------------------------------------------------ fila de divergência

export const divergenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Veículos em que o motorista declarou uma categoria e a regra calculou outra.
 *
 * É a medida de acerto da tabela de classificação. Enquanto essa fila for grande, a tabela
 * não está pronta para decidir tarifa sozinha — e é melhor saber isso por uma consulta do que
 * por reclamação de passageiro.
 */
export async function listCategoryDivergences(q: z.infer<typeof divergenceQuerySchema>) {
  const where = { categoryDivergence: true, active: true };
  const [rows, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        uf: true,
        category: true,
        categorySource: true,
        categoryAuto: true,
        detranBrand: true,
        detranModel: true,
        detranYear: true,
        validationStatus: true,
        driver: { select: { id: true, name: true } },
      },
    }),
    prisma.vehicle.count({ where }),
  ]);
  return {
    items: rows,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
