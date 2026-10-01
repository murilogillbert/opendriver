import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Ride } from '@/api/types';
import { qk } from '@/api/queryKeys';
import { liveRoutePhase } from '@/lib/ride';

/**
 * Trajeto restante do carro (motorista → embarque, depois motorista → destino),
 * o mesmo para passageiro e motorista. Atualiza sozinho; sem trajeto (offline,
 * sem posição) devolve null e o mapa segue com os marcadores — nunca bloqueia a corrida.
 */
export function useLiveRoute(ride: Ride | null): { polyline: string | null; phase: 'pickup' | 'dropoff' | null; durationS: number | null } {
  const phase = liveRoutePhase(ride);
  const q = useQuery({
    queryKey: qk.liveRoute(ride?.id ?? '', phase ?? ''),
    queryFn: () => api.rides.liveRoute(ride!.id),
    enabled: !!ride && !!phase,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });
  // Nunca mostra o trajeto (nem o ETA) de uma fase anterior (ex.: até o embarque, já em viagem).
  const current = q.data && q.data.phase === phase ? q.data : null;
  return { phase, polyline: current?.polyline ?? null, durationS: current?.durationS ?? null };
}
