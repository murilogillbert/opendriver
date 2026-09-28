import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { driverRouter } from './modules/driver/driver.routes.js';
import { geoRouter } from './modules/geo/geo.routes.js';
import { legalRouter } from './modules/legal/legal.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { recordingRouter } from './modules/recording/recording.routes.js';
import { safetyRouter, trackingRouter } from './modules/safety/safety.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { ridesRouter } from './modules/rides/rides.routes.js';

export function createApp() {
  const app = express();
  // Exatamente 1 proxy reverso (Traefik/Coolify) — IP real para rate limit.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Link público de acompanhamento da viagem (RF15).
  app.use(trackingRouter);
  // Privacidade e termos públicos (URL exigida pelas lojas).
  app.use(legalRouter);

  const api = express.Router();
  api.use(authRouter);
  api.use(geoRouter);
  api.use(driverRouter);
  api.use(ridesRouter);
  api.use(paymentsRouter);
  api.use(meRouter);
  api.use(safetyRouter);
  api.use(recordingRouter);
  api.use(adminRouter);
  app.use('/api/v1', api);

  app.use((_req, res) => res.status(404).json({ error: 'Recurso não encontrado.', code: 'not_found' }));
  app.use(errorHandler);
  return app;
}
