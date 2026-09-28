import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, http, subscribeSession, tokenStorage } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { AuthResponse, Me } from '@/api/types';

export type AppMode = 'passenger' | 'driver';

const MODE_KEY = 'odh.mode';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  me: Me | null;
  /** Qual experiência está na tela: pedir corrida ou dirigir. */
  mode: AppMode;
  isDriver: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: Parameters<typeof api.auth.register>[0]): Promise<void>;
  signOut(): Promise<void>;
  /** Recarrega /me (após mudar perfil, pagamento, cadastro de motorista…). */
  refreshMe(): Promise<Me | null>;
  setMode(mode: AppMode): void;
  /** RF12: passageiro vira motorista — troca os tokens (o papel vai no JWT). */
  becomeDriver(): Promise<void>;
  /** Hooks de saída (ex.: desregistrar push, parar rastreio) antes de limpar a sessão. */
  addSignOutHook(fn: () => Promise<void> | void): () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setModeState] = useState<AppMode>('passenger');
  const hooks = useRef(new Set<() => Promise<void> | void>());

  const applyMe = useCallback(async (next: Me) => {
    setMe(next);
    const saved = (await AsyncStorage.getItem(MODE_KEY).catch(() => null)) as AppMode | null;
    // Padrão inteligente (UX09): motorista abre no modo motorista.
    const canDrive = !!next.driver;
    setModeState(saved === 'driver' && canDrive ? 'driver' : saved === 'passenger' ? 'passenger' : canDrive ? 'driver' : 'passenger');
    setStatus('signedIn');
  }, []);

  const clearLocal = useCallback(async () => {
    await http.endSession();
    await AsyncStorage.removeItem(MODE_KEY).catch(() => undefined);
    queryClient.clear();
    setMe(null);
    setModeState('passenger');
    setStatus('signedOut');
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me.get();
      setMe(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) return null; // onExpired cuida
      throw err;
    }
  }, []);

  // Restaura a sessão salva no Keychain/Keystore.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await tokenStorage.init();
      if (!(await http.hasSession())) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        const current = await api.me.get();
        if (!cancelled) await applyMe(current);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          setStatus('signedOut');
          return;
        }
        // Sem internet na abertura: mantém a sessão (com o último modo usado);
        // as telas mostram o erro com "Tentar de novo".
        const saved = (await AsyncStorage.getItem(MODE_KEY).catch(() => null)) as AppMode | null;
        if (saved === 'driver' || saved === 'passenger') setModeState(saved);
        setStatus('signedIn');
        setTimeout(() => {
          api.me
            .get()
            .then((m) => (cancelled ? undefined : applyMe(m)))
            .catch(() => undefined);
        }, 3000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  // Volta do segundo plano: atualiza o perfil (cadastro aprovado, ficou
  // offline por falta de sinal, saldo de cashback…). No máximo a cada 30 s.
  const lastSync = useRef(0);
  useEffect(() => {
    if (status !== 'signedIn') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || Date.now() - lastSync.current < 30_000) return;
      lastSync.current = Date.now();
      refreshMe().catch(() => undefined);
    });
    return () => sub.remove();
  }, [status, refreshMe]);

  useEffect(
    () =>
      subscribeSession({
        onExpired: () => {
          queryClient.clear();
          setMe(null);
          setStatus('signedOut');
        },
      }),
    [queryClient],
  );

  const startSession = useCallback(
    async (res: AuthResponse) => {
      await http.startSession({ token: res.token, refreshToken: res.refreshToken });
      queryClient.clear();
      await applyMe(await api.me.get());
    },
    [applyMe, queryClient],
  );

  const signIn = useCallback(async (email: string, password: string) => startSession(await api.auth.login(email, password)), [startSession]);

  const signUp = useCallback(
    async (input: Parameters<typeof api.auth.register>[0]) => {
      const res = await api.auth.register(input);
      await AsyncStorage.setItem(MODE_KEY, input.role === 'Driver' ? 'driver' : 'passenger').catch(() => undefined);
      await startSession(res);
    },
    [startSession],
  );

  const signOut = useCallback(async () => {
    for (const fn of hooks.current) {
      try {
        await fn();
      } catch (err) {
        console.warn('Falha num passo de saída', err);
      }
    }
    await clearLocal();
  }, [clearLocal]);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
  }, []);

  const becomeDriver = useCallback(async () => {
    const res = await api.driver.become();
    await http.startSession({ token: res.token, refreshToken: res.refreshToken });
    const next = await api.me.get();
    setMe(next);
    setMode('driver');
  }, [setMode]);

  const addSignOutHook = useCallback((fn: () => Promise<void> | void) => {
    hooks.current.add(fn);
    return () => {
      hooks.current.delete(fn);
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      mode,
      isDriver: !!me?.driver && me.role === 'driver',
      signIn,
      signUp,
      signOut,
      refreshMe,
      setMode,
      becomeDriver,
      addSignOutHook,
    }),
    [status, me, mode, signIn, signUp, signOut, refreshMe, setMode, becomeDriver, addSignOutHook],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
