import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import type { LatLng } from '../../domain/geo.js';
import { googleReverse, googleSearch } from './google.js';

export interface Place {
  /** Linha principal curta: "Av. Getúlio Vargas, 1200". */
  title: string;
  /** Complemento: "Centro, Cuiabá - MT". */
  subtitle: string;
  /** Endereço completo para gravar na corrida. */
  address: string;
  lat: number;
  lng: number;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

const UF = (a?: NominatimAddress) => a?.['ISO3166-2-lvl4']?.split('-')[1] ?? a?.state ?? '';

export function toPlace(item: NominatimItem): Place {
  const a = item.address;
  const street = a?.road ?? a?.pedestrian;
  const title =
    (item.name && item.name !== street ? item.name : null) ??
    (street ? `${street}${a?.house_number ? `, ${a.house_number}` : ''}` : null) ??
    item.display_name.split(',')[0]!.trim();
  const city = a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? '';
  const district = a?.suburb ?? a?.neighbourhood ?? '';
  const uf = UF(a);
  const subtitle = [district, [city, uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  const address = [title, subtitle].filter(Boolean).join(' — ');
  return { title, subtitle, address: address.slice(0, 300), lat: Number(item.lat), lng: Number(item.lon) };
}

// Cache pequeno em memória: buscas repetidas (ex.: "shopping") não martelam o Nominatim.
const cache = new Map<string, { at: number; value: Place[] }>();
const CACHE_TTL = 10 * 60_000;
function cached(key: string, value?: Place[]): Place[] | undefined {
  if (value) {
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
    return value;
  }
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.value : undefined;
}

async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  if (!config.geo.nominatimUrl) throw new AppError('Busca de endereços indisponível no momento.', 503, 'geo_unavailable');
  const qs = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'pt-BR', ...params });
  let res: Response;
  try {
    res = await fetch(`${config.geo.nominatimUrl}/${path}?${qs}`, {
      headers: { 'User-Agent': `OpenDriver/1.0 (${config.geo.contactEmail})`, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.geo.timeoutMs),
    });
  } catch {
    throw new AppError('Não conseguimos buscar endereços agora. Tente de novo.', 503, 'geo_unavailable');
  }
  if (!res.ok) throw new AppError('Não conseguimos buscar endereços agora. Tente de novo.', 503, 'geo_unavailable');
  return res.json();
}

/** Busca por texto. Google é o provedor padrão (plano §10, melhor cobertura
 * e qualidade de resultado); o Nominatim self-hosted entra como reserva —
 * só é chamado quando o Google não está configurado ou não acha nada. */
export async function search(query: string, near?: LatLng): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `s:${q.toLowerCase()}:${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''}`;
  const hit = cached(key);
  if (hit) return hit;

  let places: Place[] = await googleSearch(q, near);
  let nominatimFailed = false;
  if (places.length === 0) {
    try {
      const params: Record<string, string> = { q, limit: '8', countrycodes: config.geo.countryCodes };
      if (near) {
        const d = 0.3;
        params.viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
      }
      const data = (await nominatim('search', params)) as NominatimItem[];
      places = (Array.isArray(data) ? data : []).map(toPlace).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } catch (err) {
      nominatimFailed = true;
      if (!(err instanceof AppError)) throw err;
    }
  }

  // Google vazio/indisponível E Nominatim genuinamente fora do ar (não só "sem resultado"): serviço indisponível de verdade.
  if (places.length === 0 && nominatimFailed) {
    throw new AppError('Busca de endereços indisponível no momento.', 503, 'geo_unavailable');
  }
  return cached(key, places)!;
}

/** Endereço do ponto (usado para "Meu local" — UX09 — e para o pin arrastável — §9).
 * Mesma ordem de prioridade da busca por texto: Google primeiro, Nominatim de reserva. */
export async function reverse(point: LatLng): Promise<Place> {
  const key = `r:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
  const hit = cached(key);
  if (hit?.[0]) return hit[0];
  const generic: Place = {
    title: 'Local no mapa',
    subtitle: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    address: `Local no mapa (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
    lat: point.lat,
    lng: point.lng,
  };

  const g = await googleReverse(point);
  if (g) {
    cached(key, [g]);
    return g;
  }

  // O endereço é informativo: sem Google nem Nominatim, a corrida segue com as coordenadas.
  let data: (NominatimItem & { error?: string }) | null = null;
  try {
    data = (await nominatim('reverse', { lat: String(point.lat), lon: String(point.lng), zoom: '18' })) as NominatimItem & { error?: string };
  } catch {
    return generic;
  }
  if (!data || data.error || !data.display_name) return generic;
  const place = { ...toPlace(data), lat: point.lat, lng: point.lng };
  cached(key, [place]);
  return place;
}
