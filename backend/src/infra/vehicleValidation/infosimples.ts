import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';

/**
 * Consulta de veículo por UF — URL, parâmetros (placa + renavam, ambos
 * obrigatórios) e o formato de resposta abaixo vêm da documentação oficial
 * de cada serviço (confirmada pelo cliente, não mais um palpite — plano §4).
 * Cada UF tem seu próprio endpoint; a conta só tem acesso aos do
 * Centro-Oeste por ora (área de operação atual). UFs fora da lista caem em
 * 'needs_review' (revisão manual) em vez de falhar — nunca bloqueiam o
 * cadastro silenciosamente.
 *
 * DF e GO exigem autenticação no GOV.BR (login_cpf/login_senha ou
 * certificado digital A1) que não temos e não é razoável pedir ao
 * motorista — ficam fora por ora, mesmo tendo endpoint próprio.
 *
 * Ainda sem uma chamada real confirmando um retorno positivo (só temos o
 * exemplo de resposta da documentação, não um teste contra uma placa de
 * verdade) — validar na primeira consulta real de produção, com motorista
 * de verdade. Até lá, VEHICLE_VALIDATION_PROVIDER continua em mock por
 * padrão; trocar é uma variável de ambiente só.
 */
const STATE_ENDPOINT: Record<string, string> = {
  MT: 'https://api.infosimples.com/api/v2/consultas/detran/mt/veiculo',
  MS: 'https://api.infosimples.com/api/v2/consultas/detran/ms/veiculo',
};

/** Exemplo real de resposta (serviço GO, mesmo formato nos demais estados). */
interface InfosimplesResponse {
  code: number;
  code_message: string;
  errors?: string[];
  data?: Array<{
    placa?: string;
    renavam?: string;
    chassi?: string;
    marca_modelo?: string;
    ano_fabricacao?: string;
    situacao?: string;
    /** String, não booleano: "NADA CONSTA" quando limpo. */
    roubo_furto?: string;
    /** String, vazia quando não há restrição. */
    restricoes?: string;
    bloqueios?: Array<{ tipo?: string; situacao?: string }>;
    bloqueios_judiciais?: Array<{ tipo?: string; numero_processo?: string }>;
  }>;
}

async function getToken(): Promise<string> {
  const token = await getSetting('Infosimples:Token');
  if (token) return token;
  if (config.vehicleValidation.infosimplesToken) return config.vehicleValidation.infosimplesToken;
  throw new Error('Token da Infosimples não configurado (Infosimples:Token ou INFOSIMPLES_TOKEN).');
}

const NOTHING_FOUND = 'nada consta';

export const infosimplesVehicleValidation: VehicleValidationProvider = {
  name: 'infosimples',
  async validate(input: VehicleValidationInput): Promise<VehicleValidationOutput> {
    const url = STATE_ENDPOINT[input.uf.toUpperCase()];
    if (!url) return { result: 'needs_review', matched: false, detail: { reason: 'uf_sem_consulta_automatica', uf: input.uf } };

    const token = await getToken();
    const form = new URLSearchParams({ token, timeout: '300', ignore_site_receipt: '1', placa: input.plate, renavam: input.renavam });

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (!res.ok) {
      return { result: 'needs_review', matched: false, detail: { httpStatus: res.status, reason: 'consulta_indisponivel' } };
    }
    const body = (await res.json()) as InfosimplesResponse;
    if (body.code !== 200 || !body.data?.length) {
      return { result: 'needs_review', matched: false, detail: { code: body.code, message: body.code_message, errors: body.errors, reason: 'consulta_sem_dados' } };
    }
    const row = body.data[0]!;
    const roubFurto = (row.roubo_furto ?? NOTHING_FOUND).trim().toLowerCase();
    const hasImpeditiveRestriction = (roubFurto !== NOTHING_FOUND && roubFurto !== '') || !!row.restricoes?.trim() || !!row.bloqueios_judiciais?.length;

    // Confere se marca/modelo batem com o que o motorista cadastrou (comparação tolerante: substring).
    const registeredLabel = `${input.registered.brand} ${input.registered.model}`.toLowerCase();
    const returnedLabel = (row.marca_modelo ?? '').toLowerCase().trim();
    const matched = !returnedLabel || registeredLabel.includes(returnedLabel) || returnedLabel.includes(registeredLabel);

    const detail = {
      situacao: row.situacao,
      roubFurto: row.roubo_furto,
      restricoes: row.restricoes || null,
      bloqueios: row.bloqueios?.length ?? 0,
      bloqueiosJudiciais: row.bloqueios_judiciais?.length ?? 0,
      matched,
    };

    if (hasImpeditiveRestriction) return { result: 'rejected', matched, detail };
    // Bloqueio administrativo (não-judicial) existe mas não é necessariamente impeditivo — manda pra revisão humana em vez de aprovar/rejeitar sozinho.
    if (row.bloqueios?.length) return { result: 'needs_review', matched, detail };
    if (!matched) return { result: 'needs_review', matched, detail };
    return { result: 'approved', matched, detail };
  },
};
