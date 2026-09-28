import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';
import type { LatLng } from '@/api/types';

/** Última posição conhecida (rápida) ou atual (precisa). null se sem permissão/sinal. */
export async function getCurrentPosition(): Promise<LatLng | null> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 }).catch(() => null);
  if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  return current ? { lat: current.coords.latitude, lng: current.coords.longitude } : null;
}

/**
 * Pede a localização "em uso". Quando negada de vez, explica o impacto e
 * oferece o atalho para os Ajustes (UX11: o que houve + o que fazer + ação).
 */
export async function ensureForegroundPermission(reason: string): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.granted) return true;
  }
  Alert.alert('Localização desativada', `${reason} Libere o acesso à localização nos Ajustes.`, [
    { text: 'Agora não', style: 'cancel' },
    { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
  ]);
  return false;
}
