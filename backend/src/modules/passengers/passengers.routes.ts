import { Router } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { limits } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import * as passengers from './passengers.service.js';

/** Corrida para terceiros: dependentes sem perfil e vínculo (convite + aceite) entre contas. */
export const passengersRouter = Router();
const uuid = (v: unknown) => z.string().uuid().parse(v);

// ---------- Dependentes sem perfil ----------
passengersRouter.get('/me/guest-passengers', requireAuth, async (req, res) => {
  res.json(envelope(await passengers.listGuestPassengers(userId(req))));
});

passengersRouter.post('/me/guest-passengers', requireAuth, validateBody(passengers.guestPassengerSchema), async (req, res) => {
  res.status(201).json(envelope(await passengers.createGuestPassenger(userId(req), req.body)));
});

passengersRouter.put('/me/guest-passengers/:id', requireAuth, validateBody(passengers.guestPassengerUpdateSchema), async (req, res) => {
  res.json(envelope(await passengers.updateGuestPassenger(uuid(req.params.id), userId(req), req.body)));
});

passengersRouter.delete('/me/guest-passengers/:id', requireAuth, async (req, res) => {
  await passengers.removeGuestPassenger(uuid(req.params.id), userId(req));
  res.status(204).send();
});

// ---------- Vínculo entre contas ----------
passengersRouter.get('/me/passenger-links', requireAuth, async (req, res) => {
  res.json(envelope(await passengers.listLinks(userId(req))));
});

passengersRouter.post(
  '/me/passenger-links',
  requireAuth,
  limits.passengerInvite,
  validateBody(passengers.inviteSchema),
  async (req, res) => {
    // Resposta sempre igual, exista ou não a conta — a rota não serve pra descobrir e-mails.
    res.status(202).json(envelope(await passengers.invitePassenger(userId(req), req.body.email)));
  },
);

passengersRouter.post('/me/passenger-links/:id/accept', requireAuth, validateBody(passengers.respondLinkSchema), async (req, res) => {
  res.json(envelope(await passengers.respondLink(uuid(req.params.id), userId(req), true, req.body.womenOnlyAllowed)));
});

passengersRouter.post('/me/passenger-links/:id/decline', requireAuth, async (req, res) => {
  res.json(envelope(await passengers.respondLink(uuid(req.params.id), userId(req), false)));
});

passengersRouter.delete('/me/passenger-links/:id', requireAuth, async (req, res) => {
  res.json(envelope(await passengers.removeLink(uuid(req.params.id), userId(req))));
});
