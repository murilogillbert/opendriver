import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';

/**
 * ATENÇÃO — verificar antes do primeiro uso real:
 * As páginas públicas da Infosimples (infosimples.com/consultas/detran-*) não
 * publicam o endpoint exato, o nome do parâmetro de token nem o envelope da
 * resposta — isso fica no painel do cliente, atrás de login
 * (https://api.infosimples.com/, ou suporte@infosimples.com.br).
 *
 * A implementação abaixo segue o padrão documentado publicamente para a
 * família de APIs da Infosimples (base `api.infosimples.com/api/v2/consultas/…`,
 * autenticação por `token` na query string, envelope `{ code, code_message,
 * data }`) e os nomes de campo confirmados nas páginas de cada UF
 * (`placa`, `renavam`, `chassi`, `marca_modelo`, `ano_fabricacao`, `situacao`,
 * `restricoes`, `roubo_furto`, `bloqueios`, `bloqueios_judiciais`, `gravame`).
 * Rode uma consulta real de teste (gasta 1 da cota grátis) e ajuste o path/
 * parsing abaixo contra a resposta de verdade antes de confiar nisso em produção.
 */
const BASE_URL = 'https://api.infosimples.com/api/v2/consultas/detran/restricoes';

interface InfosimplesResponse {
  code: number;
  code_message: string;
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
    const params = new URLSearchParams({
      token,
      timeout: '300',
      placa: input.plate,
      renavam: input.renavam,
      uf: input.uf,
    });
    if (input.chassi) params.set('chassi', input.chassi);

    const res = await fetch(`${BASE_URL}?${params.toString()}`, { method: 'GET' });
    if (!res.ok) {
      return { result: 'needs_review', matched: false, detail: { httpStatus: res.status, reason: 'consulta_indisponivel' } };
    }
    const body = (await res.json()) as InfosimplesResponse;
    if (body.code !== 200 || !body.data?.length) {
      return { result: 'needs_review', matched: false, detail: { code: body.code, message: body.code_message, reason: 'consulta_sem_dados' } };
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
