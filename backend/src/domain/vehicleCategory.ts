/**
 * Classificação de veículo em Econômico ou Conforto a partir do retorno do Detran.
 *
 * Por que existe: `vehicles.category` era escolha livre do motorista, e a categoria define a
 * tarifa (`pricing` tem `category` como chave primária, e Conforto é mais caro em base, por
 * km, por minuto e na mínima). Na prática o motorista escolhia quanto o passageiro paga.
 *
 * A consulta ao Detran já devolvia marca, modelo e ano — e esse retorno era usado só para
 * conferir se batia com o que o motorista digitou. Este módulo usa o mesmo dado para decidir
 * a categoria.
 *
 * Tudo aqui é função pura: a regra é a parte que precisa de teste, e teste de regra não deve
 * depender de banco nem de rede.
 */

import type { VehicleCategory } from '@prisma/client';

/**
 * Ordem das categorias, da mais barata para a mais cara.
 *
 * É o que dá sentido a "a menor vence" na divergência. Se uma categoria nova entrar no enum,
 * ela precisa entrar aqui também — e o `ORDEM[c]` indefinido faria a comparação silenciosa e
 * errada, por isso {@link posicaoDaCategoria} falha alto em vez de devolver zero.
 */
const ORDEM: Record<string, number> = { Economy: 0, Comfort: 1 };

export function posicaoDaCategoria(c: VehicleCategory): number {
  const p = ORDEM[c];
  if (p === undefined) {
    throw new Error(`Categoria sem ordem definida em vehicleCategory.ts: ${c}`);
  }
  return p;
}

/**
 * Normaliza texto para comparação: maiúsculas, sem acento, sem pontuação, espaço único.
 *
 * O Detran responde de formas diferentes por UF — "VW/GOL 1.0", "CHEVROLET/ONIX JOY 1.0",
 * "FIAT MOBI LIKE" — e com acento inconsistente. Comparar sem normalizar faria a regra casar
 * por acidente, dependendo da UF que respondeu.
 */
export function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .normalize('NFD')
    // Remove os diacríticos que o NFD separou.
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MarcaModelo {
  brand: string;
  model: string;
}

/**
 * Códigos de marca do cadastro do Renavam, traduzidos para o nome da marca.
 *
 * O Detran não devolve "Volkswagen": devolve `VW/GOL 1.0`. Nem "Chevrolet": devolve
 * `GM/ONIX`. Sem esta tradução, a tabela de classificação teria que repetir cada regra uma
 * vez por apelido — e um apelido esquecido não dá erro, só deixa de casar silenciosamente,
 * que é o pior defeito possível aqui.
 */
const APELIDOS_DE_MARCA: Record<string, string> = {
  VW: 'VOLKSWAGEN',
  GM: 'CHEVROLET',
  MMC: 'MITSUBISHI',
  'M BENZ': 'MERCEDES BENZ',
  MB: 'MERCEDES BENZ',
  MERCEDES: 'MERCEDES BENZ',
  LR: 'LAND ROVER',
  'KIA MOTORS': 'KIA',
  'CAOA CHERY': 'CHERY',
  'HYUNDAI CAOA': 'HYUNDAI',
  TOYOTA: 'TOYOTA',
};

export function canonizarMarca(bruta: string): string {
  const n = normalizarTexto(bruta);
  return APELIDOS_DE_MARCA[n] ?? n;
}

/**
 * Marcadores de origem que o Detran põe **antes** da marca: `I/` para importado, `IMP/` em
 * alguns registros. Precisam cair antes de procurar a barra que separa marca de modelo,
 * senão `I/HYUNDAI HB20` viraria marca "I" e modelo "HYUNDAI HB20".
 */
const PREFIXOS_DE_ORIGEM = new Set(['I', 'IMP', 'IMPORTADO']);

/**
 * Separa marca e modelo do retorno do Detran.
 *
 * Dois formatos, porque os serviços divergem:
 *
 *   - MT e MS devolvem `marca_modelo` num campo só, no formato `MARCA/MODELO VERSAO`
 *     ("CHEVROLET/ONIX 1.0 LT"). A barra é o separador.
 *   - DF (Mobile) devolve `marca` e `modelo` em campos separados, e nesse caso não há o que
 *     separar — só normalizar.
 *
 * Sem barra e sem campos separados, assume que a primeira palavra é a marca. É o melhor
 * palpite possível e cobre "FIAT MOBI LIKE"; devolver vazio faria a regra nunca casar, que é
 * pior do que casar pela marca.
 */
export function separarMarcaModelo(entrada: {
  marcaModelo?: string | null;
  marca?: string | null;
  modelo?: string | null;
}): MarcaModelo {
  const marcaSeparada = normalizarTexto(entrada.marca);
  const modeloSeparado = normalizarTexto(entrada.modelo);
  if (marcaSeparada && modeloSeparado) {
    return { brand: canonizarMarca(marcaSeparada), model: modeloSeparado };
  }

  // Descarta os marcadores de origem ("I/HYUNDAI HB20") antes de procurar o separador.
  let juntos = entrada.marcaModelo ?? '';
  for (;;) {
    const barra = juntos.indexOf('/');
    if (barra <= 0) break;
    if (!PREFIXOS_DE_ORIGEM.has(normalizarTexto(juntos.slice(0, barra)))) break;
    juntos = juntos.slice(barra + 1);
  }

  const barra = juntos.indexOf('/');
  if (barra > 0) {
    return {
      brand: canonizarMarca(juntos.slice(0, barra)),
      model: normalizarTexto(juntos.slice(barra + 1)),
    };
  }

  const normalizado = normalizarTexto(juntos || marcaSeparada || modeloSeparado);
  if (!normalizado) return { brand: '', model: '' };

  /**
   * Sem barra, assume que a primeira palavra é a marca — menos quando as duas primeiras
   * formam um apelido conhecido ("M BENZ C180", "KIA MOTORS SPORTAGE"). Cortar sempre no
   * primeiro espaço faria "M BENZ C180" virar marca "M".
   */
  const duas = normalizado.split(' ').slice(0, 2).join(' ');
  if (APELIDOS_DE_MARCA[duas]) {
    return { brand: APELIDOS_DE_MARCA[duas]!, model: normalizado.slice(duas.length + 1).trim() };
  }

  const espaco = normalizado.indexOf(' ');
  if (espaco < 0) return { brand: canonizarMarca(normalizado), model: '' };
  return {
    brand: canonizarMarca(normalizado.slice(0, espaco)),
    model: normalizado.slice(espaco + 1),
  };
}

export interface RegraDeCategoria {
  brand: string;
  modelPattern: string;
  yearFrom: number | null;
  yearTo: number | null;
  category: VehicleCategory;
  priority: number;
  active: boolean;
}

export interface VeiculoParaClassificar {
  brand: string;
  model: string;
  year: number | null;
}

/**
 * Escolhe a categoria pela regra mais específica que casar, ou `null` quando nenhuma casa.
 *
 * `null` é resposta legítima e importante: sem regra, a declaração do motorista permanece.
 * Inventar uma categoria quando a tabela não cobre o modelo reclassificaria frota inteira a
 * partir de nada.
 *
 * Desempate, em ordem:
 *   1. `priority` menor (o operador manda)
 *   2. `modelPattern` mais longo (regra mais específica ganha de regra genérica)
 *   3. faixa de ano mais estreita (regra com faixa ganha de regra sem faixa)
 */
export function escolherCategoria(
  regras: RegraDeCategoria[],
  veiculo: VeiculoParaClassificar
): { category: VehicleCategory; regra: RegraDeCategoria } | null {
  // Canoniza nos dois lados para a função ser correta por si: uma regra gravada como "VW"
  // casa com um retorno "VOLKSWAGEN" e vice-versa, sem depender de quem chamou normalizar.
  const marca = canonizarMarca(veiculo.brand);
  const modelo = normalizarTexto(veiculo.model);
  if (!marca && !modelo) return null;

  const candidatas = regras.filter((r) => {
    if (!r.active) return false;
    if (canonizarMarca(r.brand) !== marca) return false;

    const padrao = normalizarTexto(r.modelPattern);
    // Padrão vazio = regra da marca inteira.
    if (padrao && !modelo.startsWith(padrao)) return false;

    // Sem ano conhecido, uma regra com faixa não pode ser aplicada com segurança.
    if (r.yearFrom !== null || r.yearTo !== null) {
      if (veiculo.year === null) return false;
      if (r.yearFrom !== null && veiculo.year < r.yearFrom) return false;
      if (r.yearTo !== null && veiculo.year > r.yearTo) return false;
    }
    return true;
  });

  if (!candidatas.length) return null;

  const largura = (r: RegraDeCategoria): number => {
    if (r.yearFrom === null && r.yearTo === null) return Number.MAX_SAFE_INTEGER;
    return (r.yearTo ?? 9999) - (r.yearFrom ?? 0);
  };

  candidatas.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const pa = normalizarTexto(a.modelPattern).length;
    const pb = normalizarTexto(b.modelPattern).length;
    if (pa !== pb) return pb - pa;
    return largura(a) - largura(b);
  });

  const vencedora = candidatas[0]!;
  return { category: vencedora.category, regra: vencedora };
}

export type FonteDaCategoria = 'driver' | 'auto' | 'admin';

export interface DecisaoDeCategoria {
  /** A categoria que passa a vigorar. */
  category: VehicleCategory;
  source: FonteDaCategoria;
  /** O que a regra calculou, guardado mesmo quando não é o que vigora. */
  categoryAuto: VehicleCategory | null;
  divergence: boolean;
}

/**
 * Concilia o que o motorista declarou com o que a regra calculou.
 *
 * **Na divergência, a menor vence** — Econômico ganha de Conforto. É a política escolhida
 * entre três:
 *
 *   - a regra vence sempre: honesto com o passageiro, mas pune o motorista que cadastrou
 *     errado de boa-fé e ainda cobra mais caro por decisão automática;
 *   - a menor vence: nunca cobra Conforto de quem recebe Econômico, e a divergência fica
 *     registrada para o operador medir quantos casos existem antes de endurecer;
 *   - divergência vai para revisão: menos erro, mas cria fila humana desde o primeiro
 *     cadastro.
 *
 * A segunda protege o passageiro sem travar o cadastro, e é reversível: com `divergence`
 * gravado, trocar de política depois é uma consulta, não uma migração.
 *
 * `admin` tem precedência sobre tudo. Revalidar um veículo não desfaz decisão humana — se
 * desfizesse, a reclassificação manual duraria até o próximo reprocessamento e o operador
 * não teria como saber por quê.
 */
export function decidirCategoria(entrada: {
  declarada: VehicleCategory;
  calculada: VehicleCategory | null;
  fonteAtual: FonteDaCategoria;
  categoriaAtual: VehicleCategory;
}): DecisaoDeCategoria {
  const { declarada, calculada, fonteAtual, categoriaAtual } = entrada;

  if (fonteAtual === 'admin') {
    return {
      category: categoriaAtual,
      source: 'admin',
      categoryAuto: calculada,
      divergence: calculada !== null && calculada !== categoriaAtual,
    };
  }

  if (calculada === null) {
    return { category: declarada, source: 'driver', categoryAuto: null, divergence: false };
  }

  if (calculada === declarada) {
    return { category: calculada, source: 'auto', categoryAuto: calculada, divergence: false };
  }

  const menor =
    posicaoDaCategoria(calculada) <= posicaoDaCategoria(declarada) ? calculada : declarada;
  return { category: menor, source: 'auto', categoryAuto: calculada, divergence: true };
}

// --------------------------------------------------------------- importação de CSV

export interface LinhaDeCsv {
  linha: number;
  brand: string;
  modelPattern: string;
  yearFrom: number | null;
  yearTo: number | null;
  category: VehicleCategory;
  priority: number;
}

export interface ErroDeCsv {
  linha: number;
  motivo: string;
  conteudo: string;
}

/**
 * Lê a tabela de classificação em CSV.
 *
 * Colunas, nesta ordem: `marca;modelo;ano_de;ano_ate;categoria;prioridade`. Só as duas
 * primeiras e a categoria são obrigatórias — `modelo` vazio é regra da marca inteira, e isso
 * é intencional: "toda Fiat é Econômico" é uma linha legítima.
 *
 * Aceita `;` ou `,` como separador porque o Excel em português salva com `;`, e exigir vírgula
 * faria o operador abrir o arquivo num editor de texto para consertar.
 *
 * **Não lança.** Devolve as linhas boas e a lista de erros com número de linha, para a
 * importação ser parcial e o operador ver exatamente o que recusou. Abortar tudo por uma
 * linha torta faria uma planilha de 300 modelos inutilizável.
 */
export function lerCsvDeCategorias(texto: string): { linhas: LinhaDeCsv[]; erros: ErroDeCsv[] } {
  const linhas: LinhaDeCsv[] = [];
  const erros: ErroDeCsv[] = [];
  // \r\n, \n e \r: planilha salva no Windows e exportação de Mac antigo chegam diferentes.
  const brutas = texto.split(/\r\n|\n|\r/);

  const numeroOuNulo = (v: string | undefined): number | null | 'erro' => {
    const t = (v ?? '').trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) return 'erro';
    return n;
  };

  brutas.forEach((bruta, i) => {
    const numero = i + 1;
    const conteudo = bruta.trim();
    if (!conteudo || conteudo.startsWith('#')) return;

    const sep = conteudo.includes(';') ? ';' : ',';
    const col = conteudo.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));

    // Cabeçalho é reconhecido pelo conteúdo, não pela posição: o operador pode colar as
    // linhas sem cabeçalho, e exigir uma primeira linha fixa só criaria um erro a mais.
    const primeira = normalizarTexto(col[0]);
    if (primeira === 'MARCA' || primeira === 'BRAND') return;

    const brand = normalizarTexto(col[0]);
    if (!brand) {
      erros.push({ linha: numero, motivo: 'marca vazia', conteudo });
      return;
    }

    const categoriaBruta = normalizarTexto(col[4]);
    const category =
      categoriaBruta === 'ECONOMY' || categoriaBruta === 'ECONOMICO'
        ? ('Economy' as VehicleCategory)
        : categoriaBruta === 'COMFORT' || categoriaBruta === 'CONFORTO'
          ? ('Comfort' as VehicleCategory)
          : null;
    if (!category) {
      erros.push({ linha: numero, motivo: `categoria inválida: "${col[4] ?? ''}"`, conteudo });
      return;
    }

    const yearFrom = numeroOuNulo(col[2]);
    const yearTo = numeroOuNulo(col[3]);
    if (yearFrom === 'erro' || yearTo === 'erro') {
      erros.push({ linha: numero, motivo: 'ano fora de 1900–2100', conteudo });
      return;
    }
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
      erros.push({ linha: numero, motivo: 'ano inicial maior que o final', conteudo });
      return;
    }

    const prioridadeBruta = (col[5] ?? '').trim();
    const priority = prioridadeBruta ? Number(prioridadeBruta) : 100;
    if (!Number.isInteger(priority) || priority < 0 || priority > 9999) {
      erros.push({ linha: numero, motivo: 'prioridade inválida', conteudo });
      return;
    }

    linhas.push({
      linha: numero,
      // Mesma canonização do retorno do Detran: uma planilha com "VW" tem de casar com o
      // "VOLKSWAGEN" que a consulta produz.
      brand: canonizarMarca(brand),
      modelPattern: normalizarTexto(col[1]),
      yearFrom,
      yearTo,
      category,
      priority,
    });
  });

  return { linhas, erros };
}
