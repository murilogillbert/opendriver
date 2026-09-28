import http from 'node:http';
import { createApp } from './app.js';
import { attachRealtime } from './realtime/io.js';

/** HTTP + Socket.IO no mesmo servidor — usado pelo server.ts e pelos testes. */
export async function createServer(): Promise<http.Server> {
  const server = http.createServer(createApp());
  attachRealtime(server);
  return server;
}
