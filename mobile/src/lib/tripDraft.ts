import type { Address } from '@/api/types';
import { createStore } from './store';

/**
 * Rascunho da próxima corrida do passageiro. Origem null = "minha localização"
 * (padrão inteligente — UX09). A busca de endereço grava aqui e volta.
 */
export interface TripDraft {
  origin: Address | null;
  destination: Address | null;
  /** Plano §5 — corrida agendada: horário marcado (ISO) e, opcionalmente, motorista favorito escolhido. */
  scheduledAt: string | null;
  favoriteDriverId: string | null;
}

const EMPTY_DRAFT: TripDraft = { origin: null, destination: null, scheduledAt: null, favoriteDriverId: null };

export const tripDraftStore = createStore<TripDraft>(EMPTY_DRAFT);

export const resetTripDraft = () => tripDraftStore.set(EMPTY_DRAFT);

/** Corridas finalizadas que o usuário já dispensou (não reaparecem no painel). */
export const dismissedRidesStore = createStore<ReadonlySet<string>>(new Set());

export function dismissRide(id: string) {
  dismissedRidesStore.set((prev) => new Set([...prev, id]));
}
