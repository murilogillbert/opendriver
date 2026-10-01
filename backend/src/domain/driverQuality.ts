/** Métricas de qualidade por motorista (plano §11.6) — null sem dados suficientes, nunca 0 enganoso. */
const MIN_SAMPLE = 3;

export function acceptanceRate(offersSent: number, offersAccepted: number): number | null {
  if (offersSent < MIN_SAMPLE) return null;
  return Math.round((offersAccepted / offersSent) * 100);
}

export function cancellationRate(offersAccepted: number, ridesCancelled: number): number | null {
  if (offersAccepted < MIN_SAMPLE) return null;
  return Math.round((ridesCancelled / offersAccepted) * 100);
}
