import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';

/**
 * Fila persistente de gravações a enviar (RF16). O áudio fica no aparelho só
 * até o upload; a API aceita envios até 2 h após o fim da viagem.
 */
const KEY = 'odh.pendingRecordings';
const MAX_AGE_MS = 2 * 3600_000;

interface Pending {
  rideId: string;
  uri: string;
  endedAt: number;
}

async function read(): Promise<Pending[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Pending[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(list: Pending[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

export async function enqueueRecording(rideId: string, uri: string): Promise<void> {
  const list = await read();
  if (!list.some((p) => p.uri === uri)) list.push({ rideId, uri, endedAt: Date.now() });
  await write(list);
  await flushRecordings();
}

let flushing: Promise<void> | null = null;

/** Envia o que estiver pendente. Seguro para chamar várias vezes (single-flight). */
export function flushRecordings(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const list = await read();
    const keep: Pending[] = [];
    for (const p of list) {
      if (Date.now() - p.endedAt > MAX_AGE_MS) continue; // janela da API já fechou
      try {
        await api.rides.uploadRecording(p.rideId, { uri: p.uri, name: 'viagem.m4a', type: 'audio/mp4' });
      } catch (err) {
        // Falha transitória (sem internet, 5xx): tenta de novo depois. Recusa definitiva: descarta.
        if (err instanceof ApiError && err.isTransient) keep.push(p);
        else if (!(err instanceof ApiError)) keep.push(p);
      }
    }
    await write(keep);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function clearPendingRecordings(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
