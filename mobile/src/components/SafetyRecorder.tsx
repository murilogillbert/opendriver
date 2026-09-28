import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useActiveRide } from '@/context/RealtimeContext';
import { createStore } from '@/lib/store';
import { enqueueRecording, flushRecordings } from '@/services/recordingQueue';

/** Voz com arquivo pequeno (~15 MB/h): mono, 22 kHz, AAC 32 kbps em .m4a. */
const OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

/** A tela da corrida mostra "Gravando áudio" enquanto isto for true (transparência). */
export const recordingActiveStore = createStore(false);

/**
 * Gravação de segurança (RF16) — só com opt-in do usuário e só durante a
 * viagem (InProgress). Montado uma vez no layout autenticado, independente da
 * tela aberta. Ao terminar, o arquivo entra na fila de upload criptografado.
 */
export function SafetyRecorder() {
  const { me } = useAuth();
  const { data: ride } = useActiveRide();
  const recorder = useAudioRecorder(OPTIONS);
  const recordingRideId = useRef<string | null>(null);
  const busy = useRef(false);
  // Reavalia depois de uma troca em andamento (a corrida pode ter mudado no meio).
  const [tick, setTick] = useState(0);
  // Sem permissão ou falha do gravador: não insiste na mesma viagem.
  const gaveUpFor = useRef<string | null>(null);

  const enabled = !!me?.passenger?.recordingEnabled;
  const shouldRecord = enabled && ride?.status === 'InProgress' ? ride.id : null;

  useEffect(() => {
    void flushRecordings();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushRecordings();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (busy.current) return;
    const current = recordingRideId.current;
    if (shouldRecord === current) return;
    if (!current && shouldRecord && gaveUpFor.current === shouldRecord) return;
    busy.current = true;
    (async () => {
      try {
        if (current) {
          await recorder.stop().catch(() => undefined);
          recordingActiveStore.set(false);
          recordingRideId.current = null;
          await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
          if (recorder.uri) await enqueueRecording(current, recorder.uri);
        }
        if (shouldRecord) {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          if (!perm.granted) {
            gaveUpFor.current = shouldRecord;
            return;
          }
          await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true, interruptionMode: 'mixWithOthers' });
          await recorder.prepareToRecordAsync();
          recorder.record();
          recordingRideId.current = shouldRecord;
          recordingActiveStore.set(true);
        }
      } catch (err) {
        console.warn('Gravação de segurança indisponível', err);
        if (shouldRecord && !recordingRideId.current) gaveUpFor.current = shouldRecord;
        recordingActiveStore.set(false);
      } finally {
        busy.current = false;
        setTick((t) => t + 1);
      }
    })();
  }, [shouldRecord, recorder, tick]);

  return null;
}
