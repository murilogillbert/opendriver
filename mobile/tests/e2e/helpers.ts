import { execFileSync } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import { createApi } from '@/api/endpoints';
import { createHttpClient, type TokenPair, type TokenStorage } from '@/api/http';

export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:5199').replace(/\/+$/, '');
const DB_URL = (process.env.E2E_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/hub').replace(/\?.*$/, '');

export const PASSWORD = 'Senha1234';
export const CPF = '52998224725';
export const CNH = '02650306461';
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
export const uniqueEmail = (p: string) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@od-e2e.dev`;

export function memoryStorage(): TokenStorage & { tokens: TokenPair | null } {
  const s = {
    tokens: null as TokenPair | null,
    getAccessToken: async () => s.tokens?.token ?? null,
    getRefreshToken: async () => s.tokens?.refreshToken ?? null,
    setTokens: async (t: TokenPair) => {
      s.tokens = t;
    },
    clear: async () => {
      s.tokens = null;
    },
  };
  return s;
}

/** Um "aparelho": cliente HTTP + API + socket, como o app monta. */
export function device() {
  const storage = memoryStorage();
  const http = createHttpClient({ baseUrl: `${API_URL}/api/v1`, storage });
  const api = createApi(http);
  let socket: Socket | null = null;
  const events: { event: string; payload: any }[] = [];
  const waiters: { event: string; pred: (p: any) => boolean; resolve: (p: any) => void }[] = [];

  return {
    storage,
    http,
    api,
    events,
    async connect() {
      socket = io(API_URL, { path: '/realtime', transports: ['websocket'], auth: (cb) => void storage.getAccessToken().then((t) => cb({ token: t ?? '' })) });
      socket.onAny((event, payload) => {
        events.push({ event, payload });
        for (const w of [...waiters]) {
          if (w.event === event && w.pred(payload)) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(payload);
          }
        }
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once('connect', () => resolve());
        socket!.once('connect_error', reject);
      });
    },
    waitFor<T = any>(event: string, pred: (p: T) => boolean = () => true, timeoutMs = 20_000): Promise<T> {
      const seen = events.find((e) => e.event === event && pred(e.payload));
      if (seen) return Promise.resolve(seen.payload);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeoutMs);
        waiters.push({ event, pred: pred as (p: any) => boolean, resolve: (p) => (clearTimeout(t), resolve(p)) });
      });
    },
    emitWithAck(event: string, payload: unknown): Promise<{ ok: boolean }> {
      return new Promise((resolve) => socket!.timeout(5000).emit(event, payload, (err: unknown, res: { ok: boolean }) => resolve(err ? { ok: false } : res)));
    },
    close() {
      socket?.disconnect();
    },
  };
}

/** Upload como o app faz (multipart "file"), com Blob em vez de { uri } do React Native. */
export async function uploadJpeg(path: string, token: string) {
  const form = new FormData();
  form.append('file', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'foto.jpg');
  const res = await fetch(`${API_URL}/api/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
}

/** O que o admin faria no painel do hub (aprovar cadastro e veículo). */
export function approveDriver(userId: string) {
  const sql = `UPDATE opendriver.driver_profiles SET status='Approved' WHERE user_id='${userId}'; UPDATE opendriver.vehicles SET status='Approved' WHERE driver_id='${userId}';`;
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'pipe' });
}
