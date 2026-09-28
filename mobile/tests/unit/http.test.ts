import { ApiError } from '@/api/errors';
import { createHttpClient, type TokenPair, type TokenStorage } from '@/api/http';

/** Espera rejeição e devolve o erro tipado (falha o teste se resolver). */
async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('esperava rejeição');
}

function memoryStorage(initial?: TokenPair): TokenStorage & { snapshot(): TokenPair | null } {
  let tokens: TokenPair | null = initial ?? null;
  return {
    getAccessToken: async () => tokens?.token ?? null,
    getRefreshToken: async () => tokens?.refreshToken ?? null,
    setTokens: async (t) => {
      tokens = t;
    },
    clear: async () => {
      tokens = null;
    },
    snapshot: () => tokens,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('http core', () => {
  it('desembrulha { data } e envia o Bearer', async () => {
    const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer A1');
      return json(200, { data: { ok: true } });
    });
    const client = createHttpClient({
      baseUrl: 'http://api/api/v1/',
      storage: memoryStorage({ token: 'A1', refreshToken: 'R1' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get('/x')).resolves.toEqual({ ok: true });
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://api/api/v1/x');
  });

  it('converte { error } em ApiError com status', async () => {
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage(),
      fetchImpl: (async () => json(409, { error: 'Estoque insuficiente.' })) as unknown as typeof fetch,
    });
    const err = await rejection(client.post('/orders', {}));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Estoque insuficiente.');
  });

  it('propaga o código estável da API e nunca mostra "HTTP 500" ao usuário', async () => {
    const withCode = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage(),
      fetchImpl: (async () => json(409, { error: 'Cadastre sua chave Pix antes de sacar.', code: 'no_pix' })) as unknown as typeof fetch,
    });
    const err = await rejection(withCode.post('/driver/payouts', {}));
    expect(err.code).toBe('no_pix');

    const bare = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage(),
      fetchImpl: (async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch,
    });
    const err2 = await rejection(bare.get('/x'));
    expect(err2.message).not.toMatch(/\d{3}/);
    expect(err2.isTransient).toBe(true);
  });

  it('faz UM refresh para vários 401 simultâneos e repete as requisições', async () => {
    const storage = memoryStorage({ token: 'OLD', refreshToken: 'R1' });
    let refreshCalls = 0;
    const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { data: { token: 'NEW', refreshToken: 'R2', user: { id: 'u1' } } });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer NEW' ? json(200, { data: u }) : json(401, { error: 'Não autenticado.' });
    });
    const onRefreshed = jest.fn();
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onTokensRefreshed: onRefreshed,
    });
    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(results).toEqual(['http://api/a', 'http://api/b', 'http://api/c']);
    expect(refreshCalls).toBe(1);
    expect(storage.snapshot()).toEqual({ token: 'NEW', refreshToken: 'R2' });
    expect(onRefreshed).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('refresh recusado (401) limpa a sessão e avisa a UI', async () => {
    const storage = memoryStorage({ token: 'OLD', refreshToken: 'BAD' });
    const onExpired = jest.fn();
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage,
      onSessionExpired: onExpired,
      fetchImpl: (async () => json(401, { error: 'Refresh token inválido.' })) as unknown as typeof fetch,
    });
    const err = await rejection(client.get('/me'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(storage.snapshot()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('refresh com erro transitório (429) NÃO desloga', async () => {
    const storage = memoryStorage({ token: 'OLD', refreshToken: 'R1' });
    const onExpired = jest.fn();
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage,
      onSessionExpired: onExpired,
      fetchImpl: (async (url: RequestInfo | URL) =>
        String(url).endsWith('/auth/refresh')
          ? json(429, { error: 'Muitas tentativas.' })
          : json(401, { error: 'Não autenticado.' })) as unknown as typeof fetch,
    });
    const err = await rejection(client.get('/me'));
    expect(err.status).toBe(429);
    expect(storage.snapshot()).toEqual({ token: 'OLD', refreshToken: 'R1' });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('refresh de sessão antiga não sobrescreve o login novo', async () => {
    const storage = memoryStorage({ token: 'OLD', refreshToken: 'R1' });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage,
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/auth/refresh')) {
          await gate;
          return json(200, { data: { token: 'STALE', refreshToken: 'STALE', user: {} } });
        }
        const auth = (init?.headers as Record<string, string>).Authorization;
        return auth === 'Bearer FRESH' ? json(200, { data: 'ok' }) : json(401, {});
      }) as unknown as typeof fetch,
    });
    const pending = client.get('/x');
    await new Promise((r) => setTimeout(r, 5));
    await client.startSession({ token: 'FRESH', refreshToken: 'RF' });
    release();
    await expect(pending).resolves.toBe('ok');
    expect(storage.snapshot()).toEqual({ token: 'FRESH', refreshToken: 'RF' });
  });

  it('rotas públicas não mandam token nem tentam refresh', async () => {
    const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
      return json(401, { error: 'Credenciais inválidas.' });
    });
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage({ token: 'A', refreshToken: 'R' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = await rejection(client.postPublic('/auth/login', {}));
    expect(err.message).toBe('Credenciais inválidas.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('timeout e falha de rede viram erros amigáveis', async () => {
    const hanging = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage(),
      timeoutMs: 30,
      fetchImpl: ((_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof fetch,
    });
    const t = await rejection(hanging.getPublic('/slow'));
    expect(t.kind).toBe('timeout');
    expect(t.isTransient).toBe(true);

    const offline = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage(),
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    const n = await rejection(offline.getPublic('/x'));
    expect(n.kind).toBe('network');
  });

  it('204 devolve undefined; corpo não-JSON com erro vira mensagem genérica', async () => {
    const client = createHttpClient({
      baseUrl: 'http://api',
      storage: memoryStorage({ token: 'A', refreshToken: 'R' }),
      fetchImpl: (async (url: RequestInfo | URL) =>
        String(url).endsWith('/nc')
          ? new Response(null, { status: 204 })
          : new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch,
    });
    await expect(client.del('/nc')).resolves.toBeUndefined();
    const err = await rejection(client.get('/bad'));
    expect(err.status).toBe(502);
    expect(err.isTransient).toBe(true);
  });
});
