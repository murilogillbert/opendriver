import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import type { LatLng } from '../../domain/geo.js';
import type { Place } from './geocoding.js';

/**
 * Fallback de geocoding (plano §10) — só chamado quando o Nominatim não
 * retorna nada, e só se GEOCODER_FALLBACK=google estiver ligado. Mantém o
 * custo perto de zero: a maioria das buscas resolve no Nominatim (grátis,
 * self-hosted); o Google entra só na cauda de endereços difíceis.
 */
interface GoogleGeocodeResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: Array<{ long_name: string; types: string[] }>;
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
}

async function apiKey(): Promise<string | null> {
  const fromSettings = await getSetting('Google:MapsApiKey');
  return fromSettings ?? (config.geo.googleMapsApiKey || null);
}

function componentsToPlace(r: GoogleGeocodeResult): Place {
  const find = (type: string) => r.address_components.find((c) => c.types.includes(type))?.long_name ?? '';
  const streetNumber = find('street_number');
  const route = find('route');
  const title = route ? `${route}${streetNumber ? `, ${streetNumber}` : ''}` : r.formatted_address.split(',')[0]!.trim();
  const district = find('sublocality') || find('neighborhood');
  const city = find('administrative_area_level_2') || find('locality');
  const uf = find('administrative_area_level_1');
  const subtitle = [district, [city, uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  return {
    title,
    subtitle,
    address: r.formatted_address.slice(0, 300),
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  };
}

/** Só busca por texto — reverse já tem fallback gracioso próprio (geocoding.ts) e não precisa de custo extra. */
export async function googleSearch(query: string, near?: LatLng): Promise<Place[]> {
  const key = await apiKey();
  if (!key) return [];
  const params = new URLSearchParams({
    address: query,
    key,
    language: 'pt-BR',
    region: 'br',
    components: `country:${config.geo.countryCodes}`,
  });
  if (near) params.set('bounds', `${near.lat - 0.3},${near.lng - 0.3}|${near.lat + 0.3},${near.lng + 0.3}`);
  let res: Response;
  try {
    res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(config.geo.timeoutMs) });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const body = (await res.json()) as GoogleGeocodeResponse;
  if (body.status !== 'OK') return [];
  return body.results.map(componentsToPlace);
}
