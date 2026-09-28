import { Router } from 'express';
import { z } from 'zod';
import { isValidLatLng } from '../../domain/geo.js';
import { AppError } from '../../errors.js';
import { reverse, search } from '../../infra/geo/geocoding.js';
import { envelope } from '../../lib/envelope.js';
import { requireAuth } from '../../middleware/auth.js';
import { geoRateLimiter } from '../../middleware/rateLimit.js';
import { validateQuery } from '../../middleware/validate.js';

export const geoRouter = Router();

const coord = z.coerce.number();

geoRouter.get(
  '/geo/search',
  requireAuth,
  geoRateLimiter,
  validateQuery(z.object({ q: z.string().trim().min(1).max(120), lat: coord.optional(), lng: coord.optional() })),
  async (_req, res) => {
    const { q, lat, lng } = res.locals.query as { q: string; lat?: number; lng?: number };
    const near = lat !== undefined && lng !== undefined && isValidLatLng({ lat, lng }) ? { lat, lng } : undefined;
    res.json(envelope(await search(q, near)));
  },
);

geoRouter.get(
  '/geo/reverse',
  requireAuth,
  geoRateLimiter,
  validateQuery(z.object({ lat: coord, lng: coord })),
  async (_req, res) => {
    const p = res.locals.query as { lat: number; lng: number };
    if (!isValidLatLng(p)) throw new AppError('Localização inválida.', 400, 'invalid_location');
    res.json(envelope(await reverse(p)));
  },
);
