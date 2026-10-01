import { round2 } from '../lib/money.js';

/** ratingSum é guardado em meios-passos inteiros (1..10 = 0,5..5,0 — plano §2); divide por 2 para exibir. */
export function ratingAverage(sum?: number | null, count?: number | null): number | null {
  return count ? round2(sum! / count / 2) : null;
}
