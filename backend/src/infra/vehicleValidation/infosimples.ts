import { config } from '../../config.js';
import { prisma } from '../prisma.js';
import { getSetting } from '../settings.js';
import { normalizarTexto, separarMarcaModelo } from '../../domain/vehicleCategory.js';
import type {
  DadosDoDetran,
  VehicleValidationInput,
  VehicleValidationOutput,
  VehicleValidationProvider,
} from './types.js';

/**
 * Consulta de veículo no Detran, pela Infosimples.
 *
 * **A lista de UFs saiu do código e foi para o banco** (`opendriver.detran_providers`,
 * editável no admin). Antes era uma constante com MT e MS, e qualquer outra UF caía em
 * revisão manual para sempre — inclusive GO e DF, que é onde a operação começa.
 *
 * O motivo de a configuração ser dado e não código: o caminho de cada serviço da Infosimples
 * não é verificável de graça. Uma sondagem sem token devolve `601 Não foi possível se
 * autenticar` **antes** de validar a rota, então resposta 601 não prova que o endpoint
 * existe — e uma varredura com token válido poderia gerar cobrança por consulta executada.
 * Com a tabela, um caminho errado é edição no admin e um clique em "testar", não um deploy.
 *
 * Os serviços divergem no que exigem, e é por isso que `detran_providers` tem os
 * `requires_*`:
 *   - MT e MS: placa + renavam
 *   - DF (Mobile): placa + renavam, e devolve `marca` e `modelo` separados
 *   - GO: placa + renavam **mais** login do gov.br (CPF + senha) ou certificado A1
 *   - consulta unificada: exige chassi
 *   - TO: exige CPF/CNPJ do proprietário
 */

const NOTHING_FOUND = 'nada consta';

/** Cache curto do registro de UF: a tabela muda por ação de operador, não por requisição. */
const CACHE_TTL_MS = 60_000;
const cacheProvedor = new Map<string, { valor: ProvedorDeUf | null; at: number }>();

export interface ProvedorDeUf {
  uf: string;
  label: string;
  endpoint: string;
  requiresChassi: boolean;
  requiresLogin: boolean;
  requiresCpfCnpj: boolean;
  loginSettingKey: string | null;
  senhaSettingKey: string | null;
  active: boolean;
}

async function carregarProvedor(uf: string): Promise<ProvedorDeUf | null> {
  const chave = uf.toUpperCase();
  const hit = cacheProvedor.get(chave);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.valor;

  const row = await prisma.detranProvider.findUnique({ where: { uf: chave } });
  const valor: ProvedorDeUf | null = row
    ? {
        uf: row.uf,
        label: row.label,
        endpoint: row.endpoint,
        requiresChassi: row.requiresChassi,
        requiresLogin: row.requiresLogin,
        requiresCpfCnpj: row.requiresCpfCnpj,
        loginSettingKey: row.loginSettingKey,
        senhaSettingKey: row.senhaSettingKey,
        active: row.active,
      }
    : null;
  cacheProvedor.set(chave, { valor, at: Date.now() });
  return valor;
}

export function limparCacheDeProvedores(): void {
  cacheProvedor.clear();
}

async function getToken(): Promise<string> {
  const token = await getSetting('Infosimples:Token');
  if (token) return token;
  if (config.vehicleValidation.infosimplesToken) return config.vehicleValidation.infosimplesToken;
  throw new Error('Token da Infosimples não configurado (Infosimples:Token ou INFOSIMPLES_TOKEN).');
}

/** Linha de dados da resposta. Os campos variam por serviço, então quase tudo é opcional. */
interface LinhaDeVeiculo {
  placa?: string;
  renavam?: string;
  chassi?: string;
  /** MT e MS: marca e modelo num campo só, separados por barra. */
  marca_modelo?: string;
  /** DF (Mobile): campos separados. */
  marca?: string;
  modelo?: string;
  ano?: string | number;
  ano_fabricacao?: string | number;
  ano_modelo?: string | number;
  situacao?: string;
  situacao_veiculo?: string;
  /** String, não booleano: "NADA CONSTA" quando limpo. */
  roubo_furto?: string;
  /** String, vazia quando não há restrição. */
  restricoes?: string;
  bloqueios?: Array<{ tipo?: string; situacao?: string }>;
  bloqueios_judiciais?: Array<{ tipo?: string; numero_processo?: string }>;
}

interface InfosimplesResponse {
  code: number;
  code_message: string;
  errors?: string[];
  data?: LinhaDeVeiculo[];
}

/** Primeiro ano plausível entre os campos que cada serviço usa para "ano". */
function extrairAno(row: LinhaDeVeiculo): number | null {
  for (const bruto of [row.ano_fabricacao, row.ano, row.ano_modelo]) {
    const n = Number(String(bruto ?? '').replace(/\D/g, '').slice(0, 4));
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) return n;
  }
  return null;
}

function extrairDetran(row: LinhaDeVeiculo): DadosDoDetran {
  const { brand, model } = separarMarcaModelo({
    marcaModelo: row.marca_modelo,
    marca: row.marca,
    modelo: row.modelo,
  });
  return { brand, model, year: extrairAno(row) };
}

/**
 * Monta o corpo da consulta conforme o que a UF exige.
 *
 * Devolve `{ erro }` em vez de lançar quando falta credencial: a falta de uma senha do gov.br
 * não é defeito de programa, é configuração pendente — e tem de virar revisão manual com
 * motivo legível, não exceção.
 */
async function montarCorpo(
  p: ProvedorDeUf,
  input: VehicleValidationInput,
  token: string
): Promise<{ form: URLSearchParams } | { erro: string }> {
  const form = new URLSearchParams({
    token,
    timeout: '300',
    ignore_site_receipt: '1',
    placa: input.plate,
    renavam: input.renavam,
  });

  if (p.requiresChassi) {
    // O campo existe no cadastro desde o início e nunca era enviado — a consulta unificada
    // o exige, e sem ele a resposta é erro de parâmetro.
    if (!input.chassi?.trim()) {
      return { erro: 'chassi_obrigatorio_para_a_uf' };
    }
    form.set('chassi', input.chassi.trim());
  }

  if (p.requiresCpfCnpj) {
    if (!input.ownerDocument?.trim()) {
      return { erro: 'cpf_cnpj_do_proprietario_obrigatorio_para_a_uf' };
    }
    form.set('cpf_cnpj', input.ownerDocument.replace(/\D/g, ''));
  }

  if (p.requiresLogin) {
    const login = p.loginSettingKey ? await getSetting(p.loginSettingKey) : null;
    const senha = p.senhaSettingKey ? await getSetting(p.senhaSettingKey) : null;
    if (!login || !senha) {
      return { erro: 'credencial_da_uf_nao_configurada' };
    }
    form.set('login_cpf', login.replace(/\D/g, ''));
    form.set('login_senha', senha);
  }

  return { form };
}

/** Registra o resultado da última consulta, para o operador ver no admin sem abrir log. */
async function anotarSonda(uf: string, resultado: string): Promise<void> {
  try {
    await prisma.detranProvider.update({
      where: { uf: uf.toUpperCase() },
      data: { lastProbeAt: new Date(), lastProbeResult: resultado.slice(0, 400) },
    });
  } catch {
    // Anotação é diagnóstico, não parte da validação: falhar aqui não pode derrubar o
    // cadastro do veículo.
  }
}

/**
 * Consulta crua, para o botão "testar" do admin.
 *
 * Existe porque não há outro jeito honesto de confirmar um endpoint: a documentação lista os
 * parâmetros mas não a URL, e sondar sem token não distingue rota inexistente de erro de
 * credencial. Um operador digitando uma placa real e vendo a resposta resolve em segundos o
 * que um palpite no código não resolve.
 */
export async function consultarDetranCru(input: {
  uf: string;
  plate: string;
  renavam: string;
  chassi?: string;
  ownerDocument?: string;
}): Promise<{ httpStatus: number | null; code: number | null; message: string; body: unknown }> {
  const p = await carregarProvedor(input.uf);
  if (!p) {
    return { httpStatus: null, code: null, message: `UF ${input.uf} não tem provedor cadastrado.`, body: null };
  }

  const token = await getToken();
  const montado = await montarCorpo(
    p,
    { ...input, plate: input.plate, renavam: input.renavam, registered: { brand: '', model: '', year: 0 } },
    token
  );
  if ('erro' in montado) {
    return { httpStatus: null, code: null, message: montado.erro, body: null };
  }

  const res = await fetch(p.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: montado.form.toString(),
  });
  const texto = await res.text();
  let body: unknown = texto.slice(0, 4000);
  let code: number | null = null;
  let message = '';
  try {
    const json = JSON.parse(texto) as InfosimplesResponse;
    body = json;
    code = json.code ?? null;
    message = json.code_message ?? '';
  } catch {
    message = 'resposta não é JSON (caminho provavelmente inexistente)';
  }

  await anotarSonda(input.uf, `HTTP ${res.status} code ${code ?? '-'}: ${message}`);
  return { httpStatus: res.status, code, message, body };
}

export const infosimplesVehicleValidation: VehicleValidationProvider = {
  name: 'infosimples',
  async validate(input: VehicleValidationInput): Promise<VehicleValidationOutput> {
    const p = await carregarProvedor(input.uf);
    if (!p) {
      return {
        result: 'needs_review',
        matched: false,
        detail: { reason: 'uf_sem_consulta_automatica', uf: input.uf },
      };
    }
    if (!p.active) {
      return {
        result: 'needs_review',
        matched: false,
        detail: { reason: 'uf_com_consulta_desativada', uf: input.uf, label: p.label },
      };
    }

    const token = await getToken();
    const montado = await montarCorpo(p, input, token);
    if ('erro' in montado) {
      return { result: 'needs_review', matched: false, detail: { reason: montado.erro, uf: p.uf } };
    }

    const res = await fetch(p.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: montado.form.toString(),
    });
    if (!res.ok) {
      await anotarSonda(p.uf, `HTTP ${res.status}`);
      return {
        result: 'needs_review',
        matched: false,
        detail: { httpStatus: res.status, reason: 'consulta_indisponivel' },
      };
    }

    const body = (await res.json()) as InfosimplesResponse;
    if (body.code !== 200 || !body.data?.length) {
      await anotarSonda(p.uf, `code ${body.code}: ${body.code_message}`);
      return {
        result: 'needs_review',
        matched: false,
        detail: {
          code: body.code,
          message: body.code_message,
          errors: body.errors,
          reason: 'consulta_sem_dados',
        },
      };
    }
    await anotarSonda(p.uf, `code 200: ${body.code_message}`);

    const row = body.data[0]!;
    const detran = extrairDetran(row);

    const roubFurto = (row.roubo_furto ?? NOTHING_FOUND).trim().toLowerCase();
    const hasImpeditiveRestriction =
      (roubFurto !== NOTHING_FOUND && roubFurto !== '') ||
      !!row.restricoes?.trim() ||
      !!row.bloqueios_judiciais?.length;

    /**
     * Confere se o que o Detran respondeu bate com o que o motorista cadastrou.
     *
     * Comparação tolerante por substring, sobre texto normalizado: o Detran devolve
     * "CHEVROLET/ONIX 1.0 LT" e o motorista digita "Chevrolet" e "Onix". Exigir igualdade
     * mandaria todo cadastro correto para revisão manual.
     */
    const cadastrado = normalizarTexto(`${input.registered.brand} ${input.registered.model}`);
    const retornado = normalizarTexto(`${detran.brand} ${detran.model}`);
    const matched = !retornado || cadastrado.includes(retornado) || retornado.includes(cadastrado);

    const detail = {
      uf: p.uf,
      situacao: row.situacao ?? row.situacao_veiculo,
      roubFurto: row.roubo_furto,
      restricoes: row.restricoes || null,
      bloqueios: row.bloqueios?.length ?? 0,
      bloqueiosJudiciais: row.bloqueios_judiciais?.length ?? 0,
      detranBrand: detran.brand || null,
      detranModel: detran.model || null,
      detranYear: detran.year,
      matched,
    };

    if (hasImpeditiveRestriction) return { result: 'rejected', matched, detail, detran };
    // Bloqueio administrativo (não-judicial) existe mas não é necessariamente impeditivo —
    // manda para revisão humana em vez de aprovar ou rejeitar sozinho.
    if (row.bloqueios?.length) return { result: 'needs_review', matched, detail, detran };
    if (!matched) return { result: 'needs_review', matched, detail, detran };
    return { result: 'approved', matched, detail, detran };
  },
};
