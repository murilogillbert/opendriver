import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { envelope } from '../../lib/envelope.js';
import { multiImageUpload, requireImages } from '../../lib/upload.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { limits } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import * as complaints from './complaints.service.js';

export const complaintsRouter = Router();
const uuid = (v: unknown) => z.string().uuid().parse(v);

complaintsRouter.get('/complaints/categories', requireAuth, (_req, res) => {
  res.json(envelope(complaints.complaintCategories()));
});

complaintsRouter.post('/complaints', requireAuth, limits.complaint, validateBody(complaints.complaintSchema), async (req, res) => {
  res.status(201).json(envelope(await complaints.openComplaint(userId(req), req.body)));
});

complaintsRouter.post(
  '/complaints/:id/attachments',
  requireAuth,
  limits.upload,
  multiImageUpload('files', config.complaints.maxAttachments, config.storage.maxImageBytes),
  async (req, res) => {
    const files = requireImages(req);
    res.status(201).json(envelope(await complaints.uploadAttachments(uuid(req.params.id), userId(req), files)));
  },
);

complaintsRouter.get('/me/complaints', requireAuth, async (req, res) => {
  res.json(envelope(await complaints.listMyComplaints(userId(req))));
});

complaintsRouter.get('/me/complaints/:id', requireAuth, async (req, res) => {
  res.json(envelope(await complaints.getMyComplaint(uuid(req.params.id), userId(req))));
});
