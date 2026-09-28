import { ApiError } from './errors';

/**
 * Núcleo HTTP sem dependência de React Native (testável em Node contra a API
 * real). Espelha o contrato do hub:
 *  - respostas vêm no envelope `{ data }`, erros em `{ error }`;
 *  - access token JWT (2h) + refresh token opaco (7d) via POST /auth/refresh;
 *  - /auth/refresh tem rate limit por IP (5/min por padrão), por isso o
 *    refresh é single-flight: N requisições com 401 simultâneo disparam UM
 *    refresh só.
 */

export interface TokenPair {
  token: string;
  refreshToken: string;
}

export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface HttpClientOptions<TRefreshUser = unknown> {
  baseUrl: string;
  storage: TokenStorage;
  fetchImpl?: typeof fetch;
  /** Timeout padrão por requisição (ms). */
  timeoutMs?: number;
  /** Chamado quando a sessão fica inválida (refresh recusado) — força logout na UI. */
  onSessionExpired?: () => void;
  /** Chamado após um refresh bem-sucedido com o usuário atualizado devolvido pela API. */
  onTokensRefreshed?: (user: TRefreshUser) => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false = rota pública: não envia Authorization nem tenta refresh. */
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type RefreshOutcome = 'refreshed' | 'invalid';

const DEFAULT_TIMEOUT_MS = 20_000;

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

export function createHttpClient<TRefreshUser = unknown>(options: HttpClientOptions<TRefreshUser>) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage = options.storage;

  /** Incrementa a cada login/logout: um refresh iniciado numa sessão antiga
   * nunca sobrescreve os tokens de uma sessão nova (nem "ressuscita" um logout). */
  let sessionGeneration = 0;
  let refreshInFlight: Promise<RefreshOutcome> | null = null;

  async function send(path: string, init: RequestInit, timeoutMs: number, external?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort);
    }
    try {
      return await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch {
      if (timedOut) throw new ApiError('O servidor demorou para responder. Tente novamente.', 0, 'timeout');
      if (external?.aborted) throw new ApiError('Requisição cancelada.', 0, 'aborted');
      throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0, 'network');
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const body = json && typeof json === 'object' ? (json as { error?: unknown; code?: unknown }) : {};
      // Nunca mostra código técnico ao usuário (UX11): sem mensagem da API, texto genérico.
      const message =
        typeof body.error === 'string'
          ? body.error
          : res.status >= 500
            ? 'Algo deu errado do nosso lado. Tente novamente em instantes.'
            : 'Não foi possível concluir. Tente novamente.';
      throw new ApiError(message, res.status, 'http', typeof body.code === 'string' ? body.code : undefined);
    }
    if (json === null) {
      if (!text) return undefined as T;
      throw new ApiError('Resposta inválida do servidor.', res.status, 'invalid_response');
    }
    if (typeof json === 'object' && 'data' in (json as object)) return (json as { data: T }).data;
    return json as T;
  }

  async function expireSession(): Promise<void> {
    sessionGeneration++;
    await storage.clear();
    options.onSessionExpired?.();
  }

  function refreshTokens(): Promise<RefreshOutcome> {
    if (refreshInFlight) return refreshInFlight;
    const generation = sessionGeneration;
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      const refreshToken = await storage.getRefreshToken();
      if (!refreshToken) return 'invalid';
      const res = await send(
        '/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        DEFAULT_TIMEOUT_MS,
      );
      // 400/401: refresh expirado/adulterado/usuário removido → sessão morreu.
      // 429/5xx: problema transitório — NÃO desloga, propaga o erro.
      if (res.status === 400 || res.status === 401) return 'invalid';
      const data = await parse<TokenPair & { user: TRefreshUser }>(res);
      if (!data?.token || !data?.refreshToken) throw new ApiError('Resposta inválida do servidor.', res.status, 'invalid_response');
      if (generation !== sessionGeneration) return 'refreshed'; // sessão trocada no meio do caminho: descarta
      await storage.setTokens({ token: data.token, refreshToken: data.refreshToken });
      options.onTokensRefreshed?.(data.user);
      return 'refreshed';
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function request<T>(path: string, opts: RequestOptions = {}, allowRefresh = true): Promise<T> {
    const auth = opts.auth !== false;
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (isFormData(opts.body)) {
        body = opts.body; // boundary do multipart é definido pelo runtime
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
    }
    const generation = sessionGeneration;
    if (auth) {
      const token = await storage.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await send(
      path,
      { method: opts.method ?? 'GET', headers, body },
      opts.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      opts.signal,
    );

    if (res.status === 401 && auth) {
      // Login/logout aconteceu enquanto esta requisição voava: repete com a sessão atual.
      if (generation !== sessionGeneration && allowRefresh) return request<T>(path, opts, false);
      if (allowRefresh) {
        const outcome = await refreshTokens();
        if (outcome === 'refreshed') return request<T>(path, opts, false);
      }
      await expireSession();
      throw new ApiError('Sua sessão expirou. Entre novamente.', 401, 'http');
    }

    return parse<T>(res);
  }

  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    postPublic: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
    getPublic: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', auth: false, signal }),
    /** Grava os tokens de um login/cadastro — invalida refresh de sessões anteriores. */
    async startSession(tokens: TokenPair): Promise<void> {
      sessionGeneration++;
      await storage.setTokens(tokens);
    },
    async endSession(): Promise<void> {
      sessionGeneration++;
      await storage.clear();
    },
    hasSession: async () => (await storage.getAccessToken()) !== null || (await storage.getRefreshToken()) !== null,
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
