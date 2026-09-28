import { z } from 'zod';
import { config } from '../../config.js';
import { haversineMeters, isValidLatLng } from '../../domain/geo.js';
import { computeFare } from '../../domain/pricing.js';
import { AppError } from '../../errors.js';
import { reverse } from '../../infra/geo/geocoding.js';
import { route } from '../../infra/geo/routing.js';
import { prisma } from '../../infra/prisma.js';

const point = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().trim().max(300).optional(),
});

export const quoteSchema = z.object({ origin: point, destination: point });

const MIN_DISTANCE_M = 200;
const MAX_DISTANCE_M = 200_000;

export interface QuotePrice {
  category: 'Economy' | 'Comfort';
  label: string;
  fare: number;
  platformFee: number;
  driverEarning: number;
  breakdown: { baseFare: number; distanceFare: number; timeFare: number; minimumApplied: boolean };
}

/**
 * Cotação no servidor (RF07). O preço mostrado é o preço cobrado: a corrida
 * referencia a cotação e o valor fica travado (sem surpresa no fim — UX01).
 */
export async function createQuote(passengerId: string, input: z.infer<typeof quoteSchema>) {
  if (!isValidLatLng(input.origin) || !isValidLatLng(input.destination))
    throw new AppError('Não conseguimos identificar a origem ou o destino.', 400, 'invalid_location');
  const straight = haversineMeters(input.origin, input.destination);
  if (straight < MIN_DISTANCE_M) throw new AppError('O destino está muito perto da origem.', 400, 'too_close');
  if (straight > MAX_DISTANCE_M) throw new AppError('O destino está longe demais para uma corrida.', 400, 'too_far');

  const [r, originAddr, destAddr, rules] = await Promise.all([
    route(input.origin, input.destination),
    input.origin.address ? Promise.resolve(input.origin.address) : reverse(input.origin).then((p) => p.address),
    input.destination.address ? Promise.resolve(input.destination.address) : reverse(input.destination).then((p) => p.address),
    prisma.pricing.findMany({ where: { active: true }, orderBy: { baseFare: 'asc' } }),
  ]);
  if (!rules.length) throw new AppError('Nenhuma categoria disponível no momento.', 503, 'no_categories');

  const prices: QuotePrice[] = rules.map((rule) => {
    const f = computeFare(rule, r.distanceM, r.durationS);
    return {
      category: rule.category,
      label: rule.label,
      fare: f.fare,
      platformFee: f.platformFee,
      driverEarning: f.driverEarning,
      breakdown: { baseFare: f.baseFare, distanceFare: f.distanceFare, timeFare: f.timeFare, minimumApplied: f.minimumApplied },
    };
  });

  const quote = await prisma.rideQuote.create({
    data: {
      passengerId,
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      originAddress: originAddr.slice(0, 300),
      destLat: input.destination.lat,
      destLng: input.destination.lng,
      destAddress: destAddr.slice(0, 300),
      distanceM: r.distanceM,
      durationS: r.durationS,
      polyline: r.polyline,
      routeSource: r.source,
      prices: prices as unknown as object,
      expiresAt: new Date(Date.now() + config.dispatch.quoteTtlSeconds * 1000),
    },
  });

  return {
    id: quote.id,
    origin: { lat: quote.originLat, lng: quote.originLng, address: quote.originAddress },
    destination: { lat: quote.destLat, lng: quote.destLng, address: quote.destAddress },
    distanceM: quote.distanceM,
    durationS: quote.durationS,
    polyline: quote.polyline,
    /** 'estimate' = rota aproximada (OSRM indisponível) — preço segue válido. */
    routeSource: r.source,
    expiresAt: quote.expiresAt,
    prices,
  };
}
