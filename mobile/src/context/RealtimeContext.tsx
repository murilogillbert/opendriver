import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, tokenStorage } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { DriverLocationEvent, Offer, Ride, RideMessage } from '@/api/types';
import { env } from '@/config/env';
import { isActive } from '@/lib/ride';
import { createStore, useStore } from '@/lib/store';
import { useAuth } from './AuthContext';

/** Última posição do motorista recebida (passageiro acompanha no mapa — RF06). */
export const driverLocationStore = createStore<DriverLocationEvent | null>(null);
/** Última mensagem rápida recebida (chat mascarado — plano §11.1), pra mostrar um aviso no painel da corrida. */
export const lastMessageStore = createStore<(RideMessage & { rideId: string }) | null>(null);
/** Conexão em tempo real ativa? Sem ela as telas passam a consultar a API periodicamente. */
export const connectionStore = createStore(false);

interface RealtimeValue {
  /** Envia a posição do motorista pelo socket; false = sem conexão (use HTTP). */
  emitLocation(loc: { lat: number; lng: number; heading?: number | null; speed?: number | null; accuracy?: number | null }): Promise<boolean>;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let disposed = false;
    let authRetry: ReturnType<typeof setTimeout> | undefined;
    let authFailures = 0;

    const socket = io(env.apiUrl, {
      path: '/realtime',
      transports: ['websocket'],
      // Lido a cada (re)conexão: pega o token renovado pelo cliente HTTP.
      auth: (cb) => {
        tokenStorage
          .getAccessToken()
          .then((token) => cb({ token: token ?? '' }))
          .catch(() => cb({ token: '' }));
      },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    const resync = () => {
      void queryClient.invalidateQueries({ queryKey: qk.activeRide });
      void queryClient.invalidateQueries({ queryKey: qk.offer });
    };

    socket.on('connect', () => {
      authFailures = 0;
      connectionStore.set(true);
      resync(); // eventos perdidos enquanto estava desconectado
    });
    socket.on('disconnect', () => connectionStore.set(false));
    socket.on('connect_error', (err) => {
      connectionStore.set(false);
      if (err.message !== 'unauthorized' || disposed) return;
      // Token expirado: o servidor recusa e o socket.io NÃO reconecta sozinho.
      // Uma chamada autenticada força o refresh (ou encerra a sessão).
      authFailures++;
      if (authFailures > 5) return;
      authRetry = setTimeout(() => {
        api.me
          .get()
          .then(() => !disposed && socket.connect())
          .catch(() => undefined);
      }, Math.min(30_000, 1000 * 2 ** authFailures));
    });

    socket.on('ride:update', (ride: Ride) => {
      queryClient.setQueryData(qk.ride(ride.id), ride);
      const current = queryClient.getQueryData<Ride | null>(qk.activeRide);
      if (isActive(ride) || current?.id === ride.id) {
        queryClient.setQueryData(qk.activeRide, ride);
      } else {
        void queryClient.invalidateQueries({ queryKey: qk.activeRide });
      }
      if (ride.status === 'Completed') {
        void queryClient.invalidateQueries({ queryKey: ['rides', 'history'] });
        void queryClient.invalidateQueries({ queryKey: ['driver', 'earnings'] });
        void queryClient.invalidateQueries({ queryKey: qk.me }); // saldo de cashback
      }
    });
    socket.on('driver:location', (loc: DriverLocationEvent) => driverLocationStore.set(loc));
    socket.on('ride:offer', (offer: Offer | null) => {
      if (offer) queryClient.setQueryData(qk.offer, offer);
    });
    socket.on('ride:offer_closed', (e: { offerId: string }) => {
      const current = queryClient.getQueryData<Offer | null>(qk.offer);
      if (current?.offerId === e.offerId) queryClient.setQueryData(qk.offer, null);
    });
    // Chat mascarado (plano §11.1): só anexa se a lista já estiver em cache (chat aberto nesta sessão).
    socket.on('ride:message', (msg: RideMessage & { rideId: string }) => {
      lastMessageStore.set(msg);
      queryClient.setQueryData(qk.messages(msg.rideId), (prev: RideMessage[] | undefined) => (prev ? [...prev, msg] : prev));
    });

    // Volta do segundo plano: reconecta já e ressincroniza.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (!socket.connected) socket.connect();
      resync();
    });

    return () => {
      disposed = true;
      clearTimeout(authRetry);
      sub.remove();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      connectionStore.set(false);
      driverLocationStore.set(null);
      lastMessageStore.set(null);
    };
  }, [status, queryClient]);

  const value = useMemo<RealtimeValue>(
    () => ({
      emitLocation(loc) {
        const socket = socketRef.current;
        if (!socket?.connected) return Promise.resolve(false);
        return new Promise((resolve) => {
          socket.timeout(5000).emit('driver:location', loc, (err: unknown, res?: { ok: boolean }) => resolve(!err && !!res?.ok));
        });
      },
    }),
    [],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime fora do RealtimeProvider');
  return ctx;
}

export const useConnected = () => useStore(connectionStore);

/**
 * Corrida em andamento (ou recém-concluída pendente de pagamento/avaliação).
 * Tempo real pelo socket; sem conexão, consulta a cada 5 s enquanto houver corrida.
 */
export function useActiveRide() {
  const { status } = useAuth();
  const connected = useConnected();
  return useQuery({
    queryKey: qk.activeRide,
    queryFn: () => api.rides.active(),
    enabled: status === 'signedIn',
    staleTime: 10_000,
    refetchInterval: (q) => (!connected && isActive(q.state.data as Ride | null | undefined) ? 5000 : false),
  });
}
