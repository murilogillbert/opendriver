import type { LatLng } from '@/api/types';

/** Coordenada no formato do MapLibre: [lng, lat]. */
export type LngLat = [number, number];

export const toLngLat = (p: LatLng): LngLat => [p.lng, p.lat];

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: LatLng | null | undefined): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);
}

/**
 * Polilinha codificada (OSRM/Google, precisão 5) → pontos. Tolerante a string
 * truncada/corrompida: descarta o ponto incompleto em vez de gerar NaN.
 */
export function decodePolyline(str: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (index >= str.length) return null;
      b = str.charCodeAt(index++) - 63;
      if (b < 0 || shift > 30) return null;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** Limites [oeste, sul, leste, norte] que contêm todos os pontos (para enquadrar a câmera). */
export function boundsOf(points: LatLng[]): [number, number, number, number] | null {
  const valid = points.filter(isValidLatLng);
  if (!valid.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of valid) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  // Um único ponto: abre uma janela mínima (~300 m) para não dar zoom infinito.
  const pad = 0.0015;
  if (e - w < pad) {
    w -= pad;
    e += pad;
  }
  if (n - s < pad) {
    s -= pad;
    n += pad;
  }
  return [w, s, e, n];
}
