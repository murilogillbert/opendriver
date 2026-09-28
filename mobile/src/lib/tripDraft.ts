import type { Address } from '@/api/types';
import { createStore } from './store';

/**
 * Rascunho da próxima corrida do passageiro. Origem null = "minha localização"
 * (padrão inteligente — UX09). A busca de endereço grava aqui e volta.
 */
export interface TripDraft {
  origin: Address | null;
  destination: Address | null;
}

export const tripDraftStore = createStore<TripDraft>({ origin: null, destination: null });

export const resetTripDraft = () => tripDraftStore.set({ origin: null, destination: null });

/** Corridas finalizadas que o usuário já dispensou (não reaparecem no painel). */
export const dismissedRidesStore = createStore<ReadonlySet<string>>(new Set());

export function dismissRide(id: string) {
  dismissedRidesStore.set((prev) => new Set([...prev, id]));
}
