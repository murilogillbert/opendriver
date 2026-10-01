/** Validações puras de documentos brasileiros e chaves Pix. */
export const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * w[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** CNH: 11 dígitos com dois dígitos verificadores (algoritmo de referência do DENATRAN). */
export function isValidCnh(value: string): boolean {
  const cnh = onlyDigits(value);
  if (cnh.length !== 11 || /^(\d)\1{10}$/.test(cnh)) return false;
  let v = 0;
  for (let i = 0, j = 9; i < 9; i++, j--) v += Number(cnh[i]) * j;
  let dsc = 0;
  let dv1 = v % 11;
  if (dv1 >= 10) {
    dv1 = 0;
    dsc = 2;
  }
  v = 0;
  for (let i = 0, j = 1; i < 9; i++, j++) v += Number(cnh[i]) * j;
  const x = v % 11;
  const dv2 = x >= 10 ? 0 : x - dsc;
  return `${dv1}${dv2}` === cnh.slice(9);
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export function normalizePlate(value: string): string | null {
  const p = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
}

export type PixKeyType = 'CPF' | 'CNPJ' | 'Email' | 'Phone' | 'Random';

/** Normaliza e valida a chave Pix conforme o tipo; null se inválida. */
export function normalizePixKey(key: string, type: PixKeyType): string | null {
  const k = key.trim();
  switch (type) {
    case 'CPF':
      return isValidCpf(k) ? onlyDigits(k) : null;
    case 'CNPJ':
      return isValidCnpj(k) ? onlyDigits(k) : null;
    case 'Email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 77 ? k.toLowerCase() : null;
    case 'Phone': {
      const d = onlyDigits(k).replace(/^55(?=\d{10,11}$)/, '');
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case 'Random':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k) ? k.toLowerCase() : null;
  }
}

/** RENAVAM: 11 dígitos, dígito verificador mod-11 (algoritmo padrão Detran).
 * Só checa formato localmente antes da consulta real (Infosimples, plano §4). */
export function isValidRenavam(value: string): boolean {
  const digits = onlyDigits(value).padStart(11, '0');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const base = digits.slice(0, 10);
  const checkDigit = Number(digits[10]);
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = (sum * 10) % 11;
  const expected = remainder === 10 ? 0 : remainder;
  return expected === checkDigit;
}

/** Idade completa em anos numa data de referência. */
export function ageOn(birth: Date, ref = new Date()): number {
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const m = ref.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}
