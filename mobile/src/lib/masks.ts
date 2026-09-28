import type { PixKeyType } from '@/api/types';

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const maskCpf = (value: string) =>
  onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

export const maskCnpj = (value: string) =>
  onlyDigits(value)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');


export const maskCep = (value: string) =>
  onlyDigits(value)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2');

export const maskPhone = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};

/** "4111111111111111" → "4111 1111 1111 1111" (até 19 dígitos). */
export const maskCardNumber = (value: string) =>
  onlyDigits(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

/** "1229" → "12/29". */
export const maskExpiry = (value: string) => {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

export const maskPixKey = (value: string, type: PixKeyType) => {
  switch (type) {
    case 'CPF':
      return maskCpf(value);
    case 'CNPJ':
      return maskCnpj(value);
    case 'Phone':
      return maskPhone(value);
    default:
      return value.trim();
  }
};

/**
 * Entrada de dinheiro digitada como "12,50" ou "1.234,56" → número.
 * Retorna NaN se não for um valor válido (nunca 0 silencioso).
 */
export function parseMoney(value: string): number {
  const n = parseLocaleNumber(value.replace(/[^\d,.\-R$\s]/g, ''));
  if (!Number.isFinite(n)) return Number.NaN;
  // no máximo centavos
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n : Number.NaN;
}

/**
 * Número digitado em pt-BR ou en: "1.500,50" → 1500.5; "6,29" → 6.29;
 * "6.29" → 6.29; "60.000" → 60000 (ponto seguido de exatamente 3 dígitos =
 * milhar); "1.234.567" → 1234567. NaN se inválido.
 */
export function parseLocaleNumber(value: string): number {
  let v = value.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!v) return Number.NaN;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if ((v.match(/\./g) ?? []).length > 1 || /^\d{1,3}\.\d{3}$/.test(v)) v = v.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(v)) return Number.NaN;
  return Number(v);
}

/** Número decimal genérico ("12,5" ou "12.5"). NaN se inválido. */
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** Inteiro não negativo. NaN se inválido. */
export function parseInteger(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

/** 12.5 → "12,50" (para preencher campos de edição). */
export function moneyToInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Placa Mercosul/antiga: "abc1d23" → "ABC1D23"; "abc1234" → "ABC-1234". */
export const maskPlate = (value: string) => {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return /^[A-Z]{3}\d{4}$/.test(raw) ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
};

/** "15061990" → "15/06/1990". */
export const maskDate = (value: string) => {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};

/** "15/06/1990" → "1990-06-15" (ou null se a data não existir). */
export function brDateToIso(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO (data ou data-hora UTC) → "15/06/1990" sem deslocar o dia pelo fuso. */
export function isoToBrDate(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
