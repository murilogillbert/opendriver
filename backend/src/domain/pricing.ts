import { Decimal } from 'decimal.js';

export interface PricingRule {
  baseFare: Decimal.Value;
  perKm: Decimal.Value;
  perMinute: Decimal.Value;
  minimumFare: Decimal.Value;
  platformFeePercent: Decimal.Value;
}

export interface FareBreakdown {
  fare: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  minimumApplied: boolean;
  platformFee: number;
  driverEarning: number;
}

const r2 = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Tarifa = base + km × R$/km + min × R$/min, com piso na tarifa mínima.
 * Taxa da plataforma = % da tarifa; motorista recebe o restante.
 * Valores monetários em decimal (sem erro de ponto flutuante).
 */
export function computeFare(rule: PricingRule, distanceM: number, durationS: number): FareBreakdown {
  const km = new Decimal(Math.max(0, distanceM)).div(1000);
  const min = new Decimal(Math.max(0, durationS)).div(60);
  const base = new Decimal(rule.baseFare);
  const distanceFare = r2(km.times(rule.perKm));
  const timeFare = r2(min.times(rule.perMinute));
  const raw = base.plus(distanceFare).plus(timeFare);
  const minimum = new Decimal(rule.minimumFare);
  const minimumApplied = raw.lessThan(minimum);
  const fare = r2(minimumApplied ? minimum : raw);
  const platformFee = r2(fare.times(rule.platformFeePercent).div(100));
  return {
    fare: fare.toNumber(),
    baseFare: r2(base).toNumber(),
    distanceFare: distanceFare.toNumber(),
    timeFare: timeFare.toNumber(),
    minimumApplied,
    platformFee: platformFee.toNumber(),
    driverEarning: fare.minus(platformFee).toNumber(),
  };
}
