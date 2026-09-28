import { useLastNotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useActiveRide, useRealtime } from '@/context/RealtimeContext';
import { isActive } from '@/lib/ride';
import { setLocationEmitter, startDriverTracking, stopDriverTracking } from '@/services/driverTracking';
import { registerForPush, targetOf, unregisterPush } from '@/services/push';
import { clearPendingRecordings } from '@/services/recordingQueue';
import { SafetyRecorder } from './SafetyRecorder';

/**
 * Efeitos de sessão sem UI: push, rastreio do motorista, modo coerente com a
 * corrida em andamento, toque em notificação e limpeza na saída.
 */
export function SessionEffects() {
  const { status, me, mode, setMode, addSignOutHook } = useAuth();
  const { emitLocation } = useRealtime();
  const { data: ride } = useActiveRide();
  const signedIn = status === 'signedIn';

  // Push: pede permissão só depois do login.
  useEffect(() => {
    if (signedIn) void registerForPush();
  }, [signedIn]);

  // Posições do motorista vão pelo socket quando conectado.
  useEffect(() => {
    if (!signedIn) return;
    setLocationEmitter(emitLocation);
    return () => setLocationEmitter(null);
  }, [signedIn, emitLocation]);

  // Rastreio: online no servidor OU dirigindo uma corrida.
  const drivingRide = ride?.role === 'driver' && isActive(ride);
  const shouldTrack = signedIn && (!!me?.driver?.isOnline || drivingRide);
  useEffect(() => {
    if (shouldTrack) void startDriverTracking().catch((err) => console.warn('Rastreio indisponível', err));
    else void stopDriverTracking();
  }, [shouldTrack]);

  // Corrida em andamento decide o modo (abrir o app no meio de uma corrida leva a ela).
  useEffect(() => {
    if (!ride || !isActive(ride)) return;
    if (ride.role !== mode) setMode(ride.role);
  }, [ride, mode, setMode]);

  // Saída: deixa de receber push, fica offline e para o GPS.
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(
    () =>
      addSignOutHook(async () => {
        await unregisterPush();
        if (meRef.current?.driver?.isOnline) await api.driver.offline().catch(() => undefined);
        await stopDriverTracking();
        await clearPendingRecordings();
      }),
    [addSignOutHook],
  );

  // Toque numa notificação.
  const response = useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const target = targetOf(response);
    if (!target) return;
    if (target.kind === 'offer') {
      setMode('driver');
      router.navigate('/drive');
    } else if (ride?.id === target.rideId) {
      router.navigate(ride.role === 'driver' ? '/drive' : '/passenger');
    } else {
      router.push({ pathname: '/ride/[id]', params: { id: target.rideId } });
    }
  }, [signedIn, response, ride, setMode]);

  return signedIn ? <SafetyRecorder /> : null;
}
