import { config } from '../../config.js';
import { encodePolyline, haversineMeters, type LatLng } from '../../domain/geo.js';

export interface RouteResult {
  distanceM: number;
  durationS: number;
  /** Polilinha precisão 5 (formato OSRM "polyline"). */
  polyline: string;
  /** 'osrm' = rota real; 'estimate' = linha reta × sinuosidade (OSRM indisponível). */
  source: 'osrm' | 'estimate';
}

function estimate(from: LatLng, to: LatLng): RouteResult {
  const distanceM = Math.round(haversineMeters(from, to) * config.geo.fallbackDetourFactor);
  const durationS = Math.round((distanceM / 1000 / config.geo.fallbackAvgSpeedKmh) * 3600);
  return { distanceM, durationS, polyline: encodePolyline([from, to]), source: 'estimate' };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': `OpenDriver/1.0 (${config.geo.contactEmail})`, Accept: 'application/json' },
    signal: AbortSignal.timeout(config.geo.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface OsrmRoute {
  code: string;
  routes?: { distance: number; duration: number; geometry: string }[];
}

/** Rota de carro (OSRM /route/v1/driving). Sem OSRM → estimativa (nunca falha). */
export async function route(from: LatLng, to: LatLng): Promise<RouteResult> {
  if (!config.geo.osrmUrl) return estimate(from, to);
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const data = (await getJson(
      `${config.geo.osrmUrl}/route/v1/driving/${coords}?overview=simplified&geometries=polyline&alternatives=false&steps=false`,
    )) as OsrmRoute;
    const r = data.code === 'Ok' ? data.routes?.[0] : undefined;
    if (!r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return estimate(from, to);
    return { distanceM: Math.round(r.distance), durationS: Math.round(r.duration), polyline: r.geometry, source: 'osrm' };
  } catch (err) {
    if (!config.isTest) console.warn('OSRM indisponível, usando estimativa', (err as Error).message);
    return estimate(from, to);
  }
}

interface OsrmTable {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

/**
 * Tempo/distância de vários motoristas até um ponto (OSRM /table) numa única
 * chamada — usado para ordenar candidatos e informar "~8 min até você".
 */
export async function etaMany(origins: LatLng[], dest: LatLng): Promise<{ distanceM: number; durationS: number }[]> {
  const fallback = () =>
    origins.map((o) => {
      const e = estimate(o, dest);
      return { distanceM: e.distanceM, durationS: e.durationS };
    });
  if (!config.geo.osrmUrl || origins.length === 0) return fallback();
  try {
    const coords = [...origins, dest].map((p) => `${p.lng},${p.lat}`).join(';');
    const sources = origins.map((_, i) => i).join(';');
    const data = (await getJson(
      `${config.geo.osrmUrl}/table/v1/driving/${coords}?sources=${sources}&destinations=${origins.length}&annotations=duration,distance`,
    )) as OsrmTable;
    if (data.code !== 'Ok' || !data.durations) return fallback();
    const fb = fallback();
    return origins.map((_, i) => {
      const dur = data.durations?.[i]?.[0];
      const dist = data.distances?.[i]?.[0];
      return dur == null || dist == null ? fb[i]! : { distanceM: Math.round(dist), durationS: Math.round(dur) };
    });
  } catch {
    return fallback();
  }
}
