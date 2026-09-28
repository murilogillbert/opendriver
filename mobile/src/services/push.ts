import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/api/client';
import { connectionStore } from '@/context/RealtimeContext';
import { colors } from '@/theme/tokens';

let registeredToken: string | null = null;

// Com o app aberto e o socket conectado, a própria tela já mostra o evento
// (oferta, motorista chegou…): não duplica com banner.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const data = (n.request.content.data ?? {}) as Record<string, unknown>;
    const coveredByUi = connectionStore.get() && (typeof data.rideId === 'string' || typeof data.offerId === 'string');
    return { shouldShowBanner: !coveredByUi, shouldShowList: true, shouldPlaySound: !coveredByUi, shouldSetBadge: false };
  },
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Corridas e conta',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.lime,
  });
  // Mesmo channelId que o backend usa em pushes urgentes (ofertas de corrida).
  await Notifications.setNotificationChannelAsync('ride-offers', {
    name: 'Novas corridas',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registra o aparelho para push. Pede permissão só depois do login (contexto
 * claro). Falhas nunca bloqueiam o app — o socket cobre o app aberto.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulador não recebe push remoto
    await ensureChannels();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const id = projectId();
    if (!id) return; // build sem EAS_PROJECT_ID (dev local)
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.me.registerPush(data, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = data;
  } catch (err) {
    console.warn('Push não registrado', err);
  }
}

/** Na saída: o aparelho deixa de receber push desta conta. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await api.me.unregisterPush(token).catch(() => undefined);
}

export type PushTarget = { kind: 'ride'; rideId: string } | { kind: 'offer' } | null;

export function targetOf(response: Notifications.NotificationResponse | null): PushTarget {
  const data = (response?.notification.request.content.data ?? {}) as Record<string, unknown>;
  if (data.type === 'ride_offer') return { kind: 'offer' };
  if (typeof data.rideId === 'string') return { kind: 'ride', rideId: data.rideId };
  return null;
}
