import { Camera, Map } from '@maplibre/maplibre-react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { LatLng } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { AppText, Card, Icon } from '@/components/ui/primitives';
import { env } from '@/config/env';
import { useHere } from '@/hooks/useHere';
import { useStore } from '@/lib/store';
import { tripDraftStore } from '@/lib/tripDraft';
import { colors, radius, spacing } from '@/theme/tokens';

type Field = 'origin' | 'destination';
/** Cuiabá — só usado se não houver GPS nem rascunho (caso raro, sem permissão de localização). */
const FALLBACK_CENTER: LatLng = { lat: -15.6, lng: -56.1 };

/**
 * Pin fixo no centro da tela — a pessoa arrasta o MAPA por baixo dele (mesmo
 * efeito visual de "arrastar o pin", mais confiável que um marcador
 * arrastável nesta versão do MapLibre). Sempre disponível, não só quando a
 * busca por texto falha (plano §9, revisto).
 */
export default function PickLocation() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ field?: string }>();
  const field: Field = params.field === 'origin' ? 'origin' : 'destination';
  const { here } = useHere();
  const draft = useStore(tripDraftStore);

  const [initial] = useState<LatLng>(() => draft[field] ?? here ?? FALLBACK_CENTER);
  const [center, setCenter] = useState<LatLng>(initial);
  const [address, setAddress] = useState<string | null>(draft[field]?.address ?? null);
  const [loading, setLoading] = useState(!draft[field]?.address);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallbackAddress = (point: LatLng) => `Local no mapa (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;

  // Movimento do mapa (evento, não efeito de montagem): busca o endereço do novo centro, com
  // debounce pra não martelar a API a cada frame do arrasto.
  const reverseFor = (point: LatLng) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api.geo
        .reverse(point)
        .then((p) => setAddress(p.address))
        // A API já devolve um endereço genérico de fallback; só chega aqui se a chamada falhar de
        // verdade (sem rede) — a corrida segue com as coordenadas mesmo assim.
        .catch(() => setAddress(fallbackAddress(point)))
        .finally(() => setLoading(false));
    }, 500);
  };

  // Busca inicial (montagem): dispara a chamada async sem setState síncrono no corpo do efeito —
  // só nos callbacks, que já são assíncronos de verdade.
  useEffect(() => {
    if (draft[field]?.address) return; // já tem endereço (reabrindo a tela) — nada a buscar agora.
    let alive = true;
    api.geo
      .reverse(initial)
      .then((p) => alive && setAddress(p.address))
      .catch(() => alive && setAddress(fallbackAddress(initial)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    if (!address) return;
    tripDraftStore.set((d) => ({ ...d, [field]: { lat: center.lat, lng: center.lng, address } }));
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: field === 'origin' ? 'Embarque no mapa' : 'Destino no mapa' }} />
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={env.mapStyleUrl}
        logo={false}
        attribution
        compass={false}
        onRegionDidChange={(e) => {
          const [lng, lat] = e.nativeEvent.center;
          const next = { lat, lng };
          setCenter(next);
          reverseFor(next);
        }}
      >
        <Camera center={[initial.lng, initial.lat]} zoom={16} />
      </Map>
      <View style={styles.pinWrap} pointerEvents="none">
        <Icon name="location" size={40} color={colors.navy} />
      </View>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Card style={{ gap: 4 }}>
          <AppText variant="small">{field === 'origin' ? 'Embarque' : 'Destino'}</AppText>
          <AppText variant="bodyStrong" numberOfLines={2} accessibilityLiveRegion="polite">
            {loading ? 'Buscando endereço…' : address}
          </AppText>
        </Card>
        <Button title="Confirmar local" size="lg" disabled={loading} onPress={confirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
