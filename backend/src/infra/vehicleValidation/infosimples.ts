import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';

/**
 * ATENÇÃO — confirmar os nomes de campo abaixo antes do primeiro uso real:
 * O formato GERAL da API (confirmado na documentação oficial,
 * api.infosimples.com/consultas/docs): POST, corpo
 * application/x-www-form-urlencoded, token como parâmetro do corpo (não
 * query string), resposta sempre `{ code, code_message, data: [...], errors:
 * [...], site_receipts, header }` — `data` é sempre um array.
 *
 * O serviço escolhido é o unificado `detran/restricoes` (consulta de
 * restrições por placa, válida pra qualquer UF — está no catálogo de
 * serviços da conta). O que NÃO está confirmado ainda: os nomes exatos dos
 * parâmetros de entrada (abaixo assumimos `placa`/`renavam`/`uf`, o padrão
 * das páginas por UF) e os nomes dos campos de saída dentro de `data[0]`
 * (abaixo assumimos os mesmos nomes das páginas por UF: `marca_modelo`,
 * `situacao`, `existe_restricao`, `roubo_furto`, `bloqueios_judiciais`).
 * Isso só é visível na página de documentação específica de
 * `detran/restricoes` (atrás de login) — confirme lá, ou rode uma consulta
 * real de teste (gasta 1 da cota) e ajuste o parsing contra a resposta real
 * antes de trocar VEHICLE_VALIDATION_PROVIDER de mock pra infosimples.
 */
const BASE_URL = 'https://api.infosimples.com/api/v2/consultas/detran/restricoes';

interface InfosimplesResponse {
  code: number;
  code_message: string;
  errors?: string[];
  data?: Array<{
    placa?: string;
    renavam?: string;
    chassi?: string;
    marca_modelo?: string;
    ano_fabricacao?: string | number;
    situacao?: string;
    existe_restricao?: boolean;
    restricoes?: unknown[];
    roubo_furto?: boolean;
    bloqueios?: unknown[];
    bloqueios_judiciais?: unknown[];
  }>;
}

async function getToken(): Promise<string> {
  const token = await getSetting('Infosimples:Token');
  if (token) return token;
  if (config.vehicleValidation.infosimplesToken) return config.vehicleValidation.infosimplesToken;
  throw new Error('Token da Infosimples não configurado (Infosimples:Token ou INFOSIMPLES_TOKEN).');
}

export const infosimplesVehicleValidation: VehicleValidationProvider = {
  name: 'infosimples',
  async validate(input: VehicleValidationInput): Promise<VehicleValidationOutput> {
    const token = await getToken();
    const form = new URLSearchParams({
      token,
      timeout: '300',
      ignore_site_receipt: '1',
      placa: input.plate,
      renavam: input.renavam,
      uf: input.uf,
    });
    if (input.chassi) form.set('chassi', input.chassi);

    const res = await fetch(BASE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (!res.ok) {
      return { result: 'needs_review', matched: false, detail: { httpStatus: res.status, reason: 'consulta_indisponivel' } };
    }
    const body = (await res.json()) as InfosimplesResponse;
    if (body.code !== 200 || !body.data?.length) {
      return { result: 'needs_review', matched: false, detail: { code: body.code, message: body.code_message, errors: body.errors, reason: 'consulta_sem_dados' } };
    }
    const row = body.data[0]!;
    const hasImpeditiveRestriction = Boolean(row.existe_restricao || row.roubo_furto || row.bloqueios_judiciais?.length);

    // Confere se marca/modelo batem com o que o motorista cadastrou (comparação tolerante: substring).
    const registeredLabel = `${input.registered.brand} ${input.registered.model}`.toLowerCase();
    const returnedLabel = (row.marca_modelo ?? '').toLowerCase();
    const matched = !returnedLabel || registeredLabel.includes(returnedLabel) || returnedLabel.includes(registeredLabel);

    const detail = {
      situacao: row.situacao,
      existeRestricao: row.existe_restricao ?? false,
      matched,
    };

    if (hasImpeditiveRestriction) return { result: 'rejected', matched, detail };
    if (!matched) return { result: 'needs_review', matched, detail };
    return { result: 'approved', matched, detail };
  },
};
