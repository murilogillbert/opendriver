import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import type { LatLng } from '@/api/types';

/**
 * Abre a navegação turn-by-turn num app que o motorista já usa (Waze, Google
 * Maps, Apple Maps). No Android o sistema mostra os apps de mapa instalados.
 */
export async function openNavigation(to: LatLng, label: string) {
  const ll = `${to.lat},${to.lng}`;
  if (Platform.OS === 'android') {
    const url = `geo:${ll}?q=${ll}(${encodeURIComponent(label)})`;
    await Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`));
    return;
  }
  const options: { title: string; url: string }[] = [];
  if (await Linking.canOpenURL('waze://').catch(() => false)) options.push({ title: 'Waze', url: `waze://?ll=${ll}&navigate=yes` });
  if (await Linking.canOpenURL('comgooglemaps://').catch(() => false))
    options.push({ title: 'Google Maps', url: `comgooglemaps://?daddr=${ll}&directionsmode=driving` });
  options.push({ title: 'Mapas (Apple)', url: `maps://?daddr=${ll}&dirflg=d` });
  if (options.length === 1) {
    await Linking.openURL(options[0]!.url).catch(() => Alert.alert('Não foi possível abrir o mapa.'));
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    { title: 'Navegar com', options: [...options.map((o) => o.title), 'Voltar'], cancelButtonIndex: options.length },
    (i) => {
      const o = options[i];
      if (o) void Linking.openURL(o.url).catch(() => Alert.alert('Não foi possível abrir o mapa.'));
    },
  );
}
