import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, type TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import type { Address, Place } from '@/api/types';
import { ListRow } from '@/components/ui/Controls';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { formatDistance } from '@/lib/format';
import { haversineMeters } from '@/lib/geo';
import { alertError } from '@/lib/recovery';
import { tripDraftStore } from '@/lib/tripDraft';
import { getCurrentPosition } from '@/services/location';
import { colors, spacing } from '@/theme/tokens';

type Field = 'origin' | 'destination' | 'save';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const LABELS = ['Casa', 'Trabalho'];

/**
 * Busca de endereço (OSM/Nominatim via API). Sem digitar nada, mostra locais
 * salvos e recentes — 1 toque escolhe (UX09).
 */
export default function Search() {
  const params = useLocalSearchParams<{ field?: string }>();
  const field: Field = params.field === 'origin' || params.field === 'save' ? params.field : 'destination';
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  // 3s: dá tempo da pessoa terminar de digitar o endereço (pode estar pensando no bairro/número
  // ainda) antes de gastar uma busca — importante agora que o Google Maps é o provedor padrão.
  const q = useDebounced(text.trim(), 3000);
  const inputRef = useRef<TextInput>(null);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    void getCurrentPosition().then(setNear);
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const places = useQuery({ queryKey: qk.places, queryFn: () => api.me.places(), enabled: field !== 'save' });
  const results = useQuery({
    queryKey: ['geo', 'search', q, near?.lat.toFixed(2), near?.lng.toFixed(2)],
    queryFn: ({ signal }) => api.geo.search(q, near, signal),
    enabled: q.length >= 3,
    staleTime: 5 * 60_000,
  });

  const choose = async (a: Address) => {
    Keyboard.dismiss();
    if (field === 'save') {
      Alert.alert('Salvar local', a.address, [
        ...LABELS.map((label) => ({ text: label, onPress: () => void save(label, a) })),
        { text: 'Outro', onPress: () => void save('Favorito', a) },
        { text: 'Voltar', style: 'cancel' as const },
      ]);
      return;
    }
    tripDraftStore.set((d) => ({ ...d, [field]: { lat: a.lat, lng: a.lng, address: a.address } }));
    router.back();
  };

  const save = async (label: string, a: Address) => {
    try {
      await api.me.addPlace({ label, address: a.address, lat: a.lat, lng: a.lng });
      await queryClient.invalidateQueries({ queryKey: qk.places });
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
    }
  };

  const useMyLocation = async () => {
    const pos = await getCurrentPosition();
    if (!pos) {
      Alert.alert('Localização indisponível', 'Ative a localização ou digite o endereço de embarque.');
      return;
    }
    tripDraftStore.set((d) => ({ ...d, origin: null }));
    router.back();
  };

  // Troca a tela (não empilha): ao confirmar o pin, "Voltar" na próxima tela volta direto pra
  // corrida, sem passar de novo pela busca.
  const pickOnMap = () => router.replace({ pathname: '/pick-location', params: { field } });

  const showSuggestions = q.length < 3;
  const suggestions: (Address & { label?: string })[] = showSuggestions
    ? [...(places.data?.saved ?? []), ...(places.data?.recent ?? [])]
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: field === 'origin' ? 'Embarque' : field === 'save' ? 'Salvar local' : 'Para onde?' }} />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TextField
          ref={inputRef}
          label={field === 'origin' ? 'Endereço de embarque' : 'Endereço ou local'}
          placeholder="Rua, número, bairro ou lugar"
          value={text}
          onChangeText={setText}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList<Place | (Address & { label?: string })>
        keyboardShouldPersistTaps="handled"
        data={showSuggestions ? suggestions : (results.data ?? [])}
        keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
        ListHeaderComponent={
          field === 'save' ? null : (
            <>
              {field === 'origin' ? <ListRow icon="navigate-outline" title="Usar minha localização" onPress={useMyLocation} /> : null}
              <ListRow icon="pin-outline" title="Marcar no mapa" subtitle="Arraste o pin até o ponto certo" onPress={pickOnMap} />
            </>
          )
        }
        ListEmptyComponent={
          <View style={{ padding: spacing.lg }}>
            <AppText variant="small" center>
              {q.length < 3
                ? 'Digite pelo menos 3 letras.'
                : results.isFetching
                  ? 'Buscando…'
                  : results.error
                    ? errorMessage(results.error)
                    : 'Nenhum endereço encontrado. Tente incluir o bairro ou a cidade.'}
            </AppText>
          </View>
        }
        renderItem={({ item }) => {
          const place = item as Partial<Place> & { label?: string } & Address;
          const title = place.label ?? place.title ?? place.address.split(',')[0] ?? place.address;
          // Distância a partir de onde a pessoa está: ajuda a escolher entre lugares com o mesmo nome.
          const away = near ? formatDistance(haversineMeters(near, place)) : null;
          const subtitle = [place.subtitle ?? place.address, away].filter(Boolean).join(' · ');
          return (
            <ListRow
              icon={place.label ? 'star-outline' : showSuggestions ? 'time-outline' : 'location-outline'}
              title={title}
              subtitle={subtitle}
              chevron={false}
              onPress={() => void choose({ lat: place.lat, lng: place.lng, address: place.address })}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}
