import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { envelope } from '../../lib/envelope.js';
import { singleFile } from '../../lib/upload.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as recording from './recording.service.js';
import { limits } from '../../middleware/rateLimit.js';

export const recordingRouter = Router();

recordingRouter.get('/me/recording', requireAuth, async (_req, res) => {
  res.json(envelope(recording.recordingTerms()));
});

recordingRouter.put('/me/recording', requireAuth, validateBody(recording.consentSchema), async (req, res) => {
  res.json(envelope(await recording.setRecording(userId(req), req.body)));
});

recordingRouter.post('/rides/:id/recordings', requireAuth, limits.upload, singleFile('file', config.storage.maxAudioBytes), async (req, res) => {
  if (!req.file) throw new AppError('Envie o arquivo de áudio.', 400, 'missing_file');
  res.status(201).json(envelope(await recording.uploadRecording(z.string().uuid().parse(req.params.id), userId(req), req.file.buffer)));
});
