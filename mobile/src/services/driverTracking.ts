import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { LatLng } from '@/api/types';
import { createStore } from '@/lib/store';
import { colors } from '@/theme/tokens';

/**
 * Rastreio do motorista online (RF06). Uma única fonte de posições: a tarefa
 * de localização em segundo plano (roda também com o app aberto). Cada ponto
 * vai pelo socket quando conectado (leve) e por HTTP quando não — inclusive
 * com o app fechado no Android (tarefa headless, sem socket).
 */
export const LOCATION_TASK = 'opendriver-driver-location';
const MIN_INTERVAL_MS = 3500;

type Loc = LatLng & { heading: number | null; speed: number | null; accuracy: number | null };
type Emitter = (loc: Loc) => Promise<boolean>;

let emitter: Emitter | null = null;
let lastSentAt = 0;
let foregroundSub: Location.LocationSubscription | null = null;

/** Posição mais recente do próprio motorista (mapa da tela Dirigir). */
export const myLocationStore = createStore<LatLng | null>(null);
/** 'background' = segue com o app fechado; 'foreground' = só com o app aberto. */
export const trackingModeStore = createStore<'off' | 'background' | 'foreground'>('off');

export function setLocationEmitter(fn: Emitter | null) {
  emitter = fn;
}

async function deliver(raw: Location.LocationObject): Promise<void> {
  const loc: Loc = {
    lat: raw.coords.latitude,
    lng: raw.coords.longitude,
    heading: raw.coords.heading != null && raw.coords.heading >= 0 ? raw.coords.heading : null,
    speed: raw.coords.speed != null && raw.coords.speed >= 0 ? Math.min(raw.coords.speed, 100) : null,
    accuracy: raw.coords.accuracy != null ? Math.min(raw.coords.accuracy, 10_000) : null,
  };
  myLocationStore.set({ lat: loc.lat, lng: loc.lng });
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return;
  lastSentAt = now;
  if (emitter && (await emitter(loc).catch(() => false))) return;
  try {
    await api.driver.location(loc);
  } catch (err) {
    // Não é mais motorista / sessão encerrada: para de rastrear em vez de insistir.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) await stopDriverTracking();
  }
}

// Precisa estar no escopo global (o sistema acorda o JS só com esta tarefa).
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const latest = data.locations[data.locations.length - 1];
    if (latest) await deliver(latest);
  });
}

/**
 * Liga o rastreio. Tenta segundo plano ("Permitir sempre"); se o motorista
 * não permitir, segue só com o app aberto e avisa a tela para explicar.
 */
export async function startDriverTracking(): Promise<'background' | 'foreground' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  let bgGranted = (await Location.getBackgroundPermissionsAsync()).granted;
  if (!bgGranted) bgGranted = (await Location.requestBackgroundPermissionsAsync().catch(() => ({ granted: false }))).granted;

  if (bgGranted) {
    await stopForegroundWatch();
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (!running) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 10,
        deferredUpdatesInterval: 4000,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Você está online',
          notificationBody: 'Recebendo corridas próximas. Fique offline no app para parar.',
          notificationColor: colors.navy,
          killServiceOnDestroy: false,
        },
      });
    }
    trackingModeStore.set('background');
    return 'background';
  }

  if (!foregroundSub) {
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
      (loc) => void deliver(loc),
    );
  }
  trackingModeStore.set('foreground');
  return 'foreground';
}

async function stopForegroundWatch() {
  foregroundSub?.remove();
  foregroundSub = null;
}

export async function stopDriverTracking(): Promise<void> {
  await stopForegroundWatch();
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  trackingModeStore.set('off');
}

/** Envia a posição atual já (ao ficar online), sem esperar o próximo ponto. */
export async function pushCurrentLocationNow(): Promise<void> {
  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (current) {
    lastSentAt = 0;
    await deliver(current);
  }
}

export const isAndroid = Platform.OS === 'android';
