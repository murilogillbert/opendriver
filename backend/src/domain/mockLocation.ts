import { haversineMeters } from './geo.js';

/**
 * Antifraude de localização (plano §11.4) — detecta, não bloqueia. Um "teleporte"
 * (distância grande num intervalo muito curto, implicando velocidade impossível de
 * carro) é o sinal mais confiável de GPS falsificado; ignora deslocamentos pequenos
 * (jitter normal do GPS) mesmo que o relógio marque quase nada de diferença.
 */
const MAX_PLAUSIBLE_SPEED_KMH = 180;
const MIN_JUMP_METERS = 300;

export function isImplausibleJump(prevLat: number, prevLng: number, prevAt: Date, lat: number, lng: number, at: Date): boolean {
  const meters = haversineMeters({ lat: prevLat, lng: prevLng }, { lat, lng });
  if (meters < MIN_JUMP_METERS) return false;
  const seconds = Math.max(0.001, (at.getTime() - prevAt.getTime()) / 1000);
  const kmh = meters / 1000 / (seconds / 3600);
  return kmh > MAX_PLAUSIBLE_SPEED_KMH;
}
