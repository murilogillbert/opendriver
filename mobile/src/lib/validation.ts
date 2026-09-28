import { onlyDigits } from './masks';

/** Validações locais espelhando o backend (feedback imediato, sem ida à API). */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function passwordProblem(v: string): string | null {
  if (v.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(v)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\d/.test(v)) return 'A senha precisa ter pelo menos um número.';
  return null;
}

export const isPhone = (v: string) => [10, 11].includes(onlyDigits(v).length);

export function isCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = ((sum * 10) % 11) % 10;
    return r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}
