import { Decimal } from 'decimal.js';

/** Dinheiro em decimal.js (como o hub): arredondamento half-up em 2 casas. */
export type Money = number | string | Decimal | { toString(): string };

export function d(v: Money): Decimal {
  return new Decimal(v.toString());
}

export function round2(v: Money): number {
  return d(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function percentOf(v: Money, percent: Money): number {
  return d(v).times(d(percent)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
