import { env } from '@/config/env';
import { createApi } from './endpoints';
import { createHttpClient } from './http';
import { createSecureTokenStorage } from './secureTokenStorage';
import type { User } from './types';

type SessionListener = {
  onExpired?: () => void;
  onRefreshed?: (user: User) => void;
};

const listeners = new Set<SessionListener>();

/** AuthContext se inscreve aqui para reagir a sessão expirada/renovada. */
export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const tokenStorage = createSecureTokenStorage();

export const http = createHttpClient<User>({
  baseUrl: env.apiBaseUrl,
  storage: tokenStorage,
  onSessionExpired: () => listeners.forEach((l) => l.onExpired?.()),
  onTokensRefreshed: (user) => listeners.forEach((l) => l.onRefreshed?.(user)),
});

export const api = createApi(http);
