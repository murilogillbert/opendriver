import http from 'node:http';
import { createApp } from './app.js';

/** HTTP + (depois) Socket.IO no mesmo servidor — usado pelo server.ts e pelos testes. */
export async function createServer(): Promise<http.Server> {
  const app = createApp();
  return http.createServer(app);
}
