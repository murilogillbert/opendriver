import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import type { LatLng } from '../../domain/geo.js';
import type { Place } from './geocoding.js';

/**
 * Google é o provedor PADRÃO de geocoding quando GOOGLE_MAPS_API_KEY está
 * configurada (plano §10) — tentado antes do Nominatim, que vira reserva
 * (chamado só se o Google não encontrar nada). Sem chave configurada,
 * `apiKey()` devolve null e as duas funções abaixo saem de cara com
 * [] / null, caindo direto pro Nominatim — nenhum código chamador precisa
 * checar se o Google está configurado.
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

/** Endereço de um ponto do mapa (pin arrastável — plano §9). */
export async function googleReverse(point: LatLng): Promise<Place | null> {
  const key = await apiKey();
  if (!key) return null;
  const params = new URLSearchParams({ latlng: `${point.lat},${point.lng}`, key, language: 'pt-BR', region: 'br' });
  let res: Response;
  try {
    res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(config.geo.timeoutMs) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as GoogleGeocodeResponse;
  if (body.status !== 'OK' || !body.results.length) return null;
  return { ...componentsToPlace(body.results[0]!), lat: point.lat, lng: point.lng };
}
