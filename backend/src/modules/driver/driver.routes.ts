import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { envelope } from '../../lib/envelope.js';
import { imageUpload, requireImage } from '../../lib/upload.js';
import { requireAuth, requireRole, userId } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import * as driver from './driver.service.js';

export const driverRouter = Router();
const asDriver = [requireAuth, requireRole('Driver')] as const;

// Qualquer usuário comum pode se tornar motorista (RF12).
driverRouter.post('/driver/become', requireAuth, async (req, res) => {
  res.json(envelope(await driver.becomeDriver(userId(req))));
});

driverRouter.get('/driver/profile', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.getProfile(userId(req))));
});

driverRouter.put('/driver/profile', ...asDriver, validateBody(driver.driverDataSchema), async (req, res) => {
  res.json(envelope(await driver.updateDriverData(userId(req), req.body)));
});

driverRouter.post('/driver/documents/:kind', ...asDriver, imageUpload, async (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'cnh' && kind !== 'selfie') throw new AppError('Documento inválido.', 400, 'invalid_document');
  res.json(envelope(await driver.uploadDocument(userId(req), kind, requireImage(req))));
});

driverRouter.post('/driver/submit', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.submitForReview(userId(req))));
});

driverRouter.post('/driver/vehicles', ...asDriver, validateBody(driver.vehicleSchema), async (req, res) => {
  res.status(201).json(envelope(await driver.addVehicle(userId(req), req.body)));
});

driverRouter.post('/driver/vehicles/:id/crlv', ...asDriver, imageUpload, async (req, res) => {
  res.json(envelope(await driver.uploadCrlv(userId(req), String(req.params.id), requireImage(req))));
});

driverRouter.put('/driver/vehicles/:id/current', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.selectVehicle(userId(req), String(req.params.id))));
});

driverRouter.delete('/driver/vehicles/:id', ...asDriver, async (req, res) => {
  await driver.removeVehicle(userId(req), String(req.params.id));
  res.status(204).send();
});

driverRouter.put('/driver/pix', ...asDriver, validateBody(driver.pixSchema), async (req, res) => {
  res.json(envelope(await driver.setPixKey(userId(req), req.body)));
});

driverRouter.post('/driver/online', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.goOnline(userId(req))));
});

driverRouter.post('/driver/offline', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.goOffline(userId(req))));
});

driverRouter.post('/driver/location', ...asDriver, validateBody(driver.locationSchema), async (req, res) => {
  await driver.updateLocation(userId(req), req.body);
  res.status(204).send();
});

driverRouter.get('/driver/earnings/summary', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.earningsSummary(userId(req))));
});

driverRouter.get('/driver/earnings', ...asDriver, validateQuery(z.object({ cursor: z.string().uuid().optional() })), async (req, res) => {
  res.json(envelope(await driver.earningsList(userId(req), (res.locals.query as { cursor?: string }).cursor)));
});

driverRouter.get('/driver/payouts', ...asDriver, async (req, res) => {
  res.json(envelope(await driver.listPayouts(userId(req))));
});

driverRouter.post('/driver/payouts', ...asDriver, validateBody(driver.payoutSchema), async (req, res) => {
  res.status(201).json(envelope(await driver.requestPayout(userId(req), req.body.amount)));
});
