// Standard Brazilian document checksum validation. Returns true for well-formed
// CPF/CNPJ — strips formatting characters, rejects trivially-invalid placeholders
// (all-equal digits like 11111111111) and validates the two check digits.

const onlyDigits = (input: string) => input.replace(/\D+/g, "");

export function isValidCpf(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = onlyDigits(raw);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const compute = (slice: string, factor: number) => {
    let sum = 0;
    for (const digit of slice) {
      sum += Number(digit) * factor--;
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const d1 = compute(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;
  const d2 = compute(digits.slice(0, 10), 11);
  return d2 === Number(digits[10]);
}

export function isValidCnpj(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const compute = (slice: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = compute(digits.slice(0, 12), w1);
  if (d1 !== Number(digits[12])) return false;
  const d2 = compute(digits.slice(0, 13), w2);
  return d2 === Number(digits[13]);
}
