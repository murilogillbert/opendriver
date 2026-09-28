import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { driverRouter } from './modules/driver/driver.routes.js';
import { geoRouter } from './modules/geo/geo.routes.js';

export function createApp() {
  const app = express();
  // Exatamente 1 proxy reverso (Traefik/Coolify) — IP real para rate limit.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const api = express.Router();
  api.use(authRouter);
  api.use(geoRouter);
  api.use(driverRouter);
  app.use('/api/v1', api);

  app.use((_req, res) => res.status(404).json({ error: 'Recurso não encontrado.', code: 'not_found' }));
  app.use(errorHandler);
  return app;
}
