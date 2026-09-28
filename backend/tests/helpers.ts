import type { AddressInfo } from 'node:net';
import http from 'node:http';

export interface TestServer {
  url: string;
  close(): Promise<void>;
}

/** Sobe o app numa porta livre (com Socket.IO quando `withRealtime`). */
export async function startServer(): Promise<TestServer> {
  const { createServer } = await import('../src/httpServer.js');
  const server: http.Server = await createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

export async function call<T = any>(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: T; error?: string; code?: string }> {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { status: res.status, data: json.data, error: json.error, code: json.code };
}

export const uniqueEmail = (p: string) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@od-test.dev`;
export const PASSWORD = 'Senha1234';
/** CPF válido de teste. */
export const CPF = '52998224725';
