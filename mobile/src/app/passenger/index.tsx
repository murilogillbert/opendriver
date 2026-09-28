import { type ComponentProps, type ReactNode, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Quote } from '@/api/types';
import { RideMap } from '@/components/map/RideMap';
import { LoadingState } from '@/components/ui/States';
import { OfflineBadge } from '@/components/OfflineBadge';
import { useAuth } from '@/context/AuthContext';
import { driverLocationStore, useActiveRide } from '@/context/RealtimeContext';
import { PassengerRidePanel } from '@/features/passenger/RidePanel';
import { QuotePanel } from '@/features/passenger/QuotePanel';
import { WhereToPanel } from '@/features/passenger/WhereToPanel';
import { useHere } from '@/hooks/useHere';
import { useStore } from '@/lib/store';
import { dismissedRidesStore, tripDraftStore } from '@/lib/tripDraft';
import { colors } from '@/theme/tokens';

/** Aba Viagem: mapa + um painel com a única decisão do momento. */
export default function Trip() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { here } = useHere();
  const active = useActiveRide();
  const dismissed = useStore(dismissedRidesStore);
  const draft = useStore(tripDraftStore);
  const driverLoc = useStore(driverLocationStore);
  const [panelHeight, setPanelHeight] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const onQuote = useCallback((q: Quote | null) => setQuote(q), []);

  const ride = active.data && active.data.role === 'passenger' && !dismissed.has(active.data.id) ? active.data : null;
  const origin = draft.origin ?? here;

  if (active.isPending && !active.data) return <LoadingState />;

  let map: ComponentProps<typeof RideMap> = { center: here, bottomInset: panelHeight };
  let panel: ReactNode;

  if (ride) {
    const live = driverLoc?.rideId === ride.id ? driverLoc : null;
    const toPickup = ride.status === 'DriverAssigned' || ride.status === 'DriverArrived';
    map = {
      bottomInset: panelHeight,
      origin: ride.status === 'InProgress' ? null : ride.origin,
      destination: toPickup ? null : ride.destination,
      polyline: toPickup ? null : ride.polyline,
      driver: live,
      showUser: ride.status !== 'InProgress',
    };
    panel = <PassengerRidePanel ride={ride} onHeight={setPanelHeight} />;
  } else if (draft.destination && origin) {
    map = { bottomInset: panelHeight, origin, destination: draft.destination, polyline: quote?.polyline };
    panel = <QuotePanel origin={origin} destination={draft.destination} onHeight={setPanelHeight} onQuote={onQuote} />;
  } else {
    map = { center: origin, origin: draft.origin, bottomInset: panelHeight };
    panel = <WhereToPanel name={me?.name} onHeight={setPanelHeight} originLabel={draft.origin?.address ?? (here ? 'Minha localização' : 'Defina o embarque')} />;
  }

  return (
    <View style={styles.container}>
      <RideMap {...map} />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <OfflineBadge />
      </View>
      {panel}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
