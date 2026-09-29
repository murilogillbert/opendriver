import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { errorCode } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import type { Offer } from '@/api/types';
import { RideMap } from '@/components/map/RideMap';
import { OfflineBadge } from '@/components/OfflineBadge';
import { useToast } from '@/components/Toast';
import { LoadingState } from '@/components/ui/States';
import { useAuth } from '@/context/AuthContext';
import { useActiveRide } from '@/context/RealtimeContext';
import { DriverRidePanel } from '@/features/driver/DriverRidePanel';
import { IdlePanel } from '@/features/driver/IdlePanel';
import { OfferModal } from '@/features/driver/OfferModal';
import { useHere } from '@/hooks/useHere';
import { useLiveRoute } from '@/hooks/useLiveRoute';
import { alertError } from '@/lib/recovery';
import { useStore } from '@/lib/store';
import { dismissedRidesStore } from '@/lib/tripDraft';
import { myLocationStore } from '@/services/driverTracking';
import { colors } from '@/theme/tokens';

/** Aba Dirigir: mapa + ficar online, receber oferta e conduzir a corrida. */
export default function Drive() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const { here } = useHere();
  const myLoc = useStore(myLocationStore);
  const active = useActiveRide();
  const dismissed = useStore(dismissedRidesStore);
  const [panelHeight, setPanelHeight] = useState(0);
  const online = !!me?.driver?.isOnline;

  const ride = active.data && active.data.role === 'driver' && !dismissed.has(active.data.id) ? active.data : null;

  // Motorista online ou dirigindo: a tela não apaga (oferta chega a qualquer momento; mapa à vista).
  const keepAwake = online || !!ride;
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('drive').catch(() => undefined);
    return () => {
      void deactivateKeepAwake('drive').catch(() => undefined);
    };
  }, [keepAwake]);

  // Oferta atual: chega pelo socket; a consulta recupera após reconexão/abrir pelo push.
  const offerQ = useQuery({
    queryKey: qk.offer,
    queryFn: () => api.driver.currentOffer(),
    enabled: online && !ride,
    refetchInterval: false,
  });
  const offer = online && !ride ? (offerQ.data ?? null) : null;

  const clearOffer = useCallback(() => queryClient.setQueryData<Offer | null>(qk.offer, null), [queryClient]);

  const accept = useMutation({
    mutationFn: (o: Offer) => api.driver.accept(o.offerId),
    onSuccess: (r) => {
      clearOffer();
      queryClient.setQueryData(qk.activeRide, r);
    },
    onError: (err) => {
      clearOffer();
      if (errorCode(err) === 'offer_unavailable') toast.info('Essa corrida não está mais disponível.');
      else alertError(err, 'Não foi possível aceitar');
      void queryClient.invalidateQueries({ queryKey: qk.activeRide });
    },
  });

  const decline = (o: Offer) => {
    clearOffer();
    api.driver.decline(o.offerId).catch(() => undefined); // expira sozinha se falhar
  };

  const toPickup = !!ride && (ride.status === 'DriverAssigned' || ride.status === 'DriverArrived');
  // Trajeto até o embarque e, depois, até o destino (o que resta da rota, não a rota inteira).
  const live = useLiveRoute(ride);

  if (active.isPending && !active.data) return <LoadingState />;

  const position = myLoc ?? here;

  return (
    <View style={styles.container}>
      <RideMap
        center={position}
        bottomInset={panelHeight}
        origin={ride && ride.status !== 'InProgress' ? ride.origin : null}
        destination={ride && !toPickup ? ride.destination : null}
        polyline={!ride ? null : (live.polyline ?? (toPickup ? null : ride.polyline))}
        driver={ride && position ? position : null}
        showUser={!ride}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <OfflineBadge />
      </View>
      {ride ? <DriverRidePanel ride={ride} onHeight={setPanelHeight} /> : <IdlePanel onHeight={setPanelHeight} />}
      {offer ? (
        <OfferModal
          key={offer.offerId}
          offer={offer}
          accepting={accept.isPending}
          onAccept={() => accept.mutate(offer)}
          onDecline={() => decline(offer)}
          onExpire={clearOffer}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
