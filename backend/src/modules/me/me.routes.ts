import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';

/** Preferências do usuário: push, lugares salvos (Casa/Trabalho — UX09). */
export const meRouter = Router();

meRouter.post(
  '/me/push-tokens',
  requireAuth,
  validateBody(z.object({ token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de push inválido.'), platform: z.enum(['ios', 'android']) })),
  async (req, res) => {
    const uid = userId(req);
    // Um aparelho pertence a um usuário por vez (troca de conta no mesmo celular).
    await prisma.pushToken.upsert({
      where: { token: req.body.token },
      create: { userId: uid, token: req.body.token, platform: req.body.platform },
      update: { userId: uid, platform: req.body.platform, lastSeen: new Date() },
    });
    res.status(204).send();
  },
);

meRouter.delete('/me/push-tokens', requireAuth, validateBody(z.object({ token: z.string() })), async (req, res) => {
  await prisma.pushToken.deleteMany({ where: { token: req.body.token, userId: userId(req) } });
  res.status(204).send();
});

const placeSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome ao local.').max(40),
  address: z.string().trim().min(3).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

meRouter.get('/me/places', requireAuth, async (req, res) => {
  const uid = userId(req);
  const saved = await prisma.savedPlace.findMany({ where: { userId: uid }, orderBy: { createdAt: 'asc' } });
  // Destinos recentes (sem repetir endereço) — sugestões sem digitar (UX09).
  const recent = await prisma.ride.findMany({
    where: { passengerId: uid, status: 'Completed' },
    orderBy: { completedAt: 'desc' },
    take: 20,
    select: { destAddress: true, destLat: true, destLng: true },
  });
  const seen = new Set<string>();
  const recents = recent
    .filter((r) => (seen.has(r.destAddress) ? false : (seen.add(r.destAddress), true)))
    .slice(0, 5)
    .map((r) => ({ address: r.destAddress, lat: r.destLat, lng: r.destLng }));
  res.json(envelope({ saved: saved.map(({ id, label, address, lat, lng }) => ({ id, label, address, lat, lng })), recent: recents }));
});

meRouter.post('/me/places', requireAuth, validateBody(placeSchema), async (req, res) => {
  const uid = userId(req);
  if ((await prisma.savedPlace.count({ where: { userId: uid } })) >= 10) throw new AppError('Você pode salvar até 10 locais.', 409, 'too_many_places');
  const p = await prisma.savedPlace.create({ data: { ...req.body, userId: uid } });
  res.status(201).json(envelope({ id: p.id, label: p.label, address: p.address, lat: p.lat, lng: p.lng }));
});

meRouter.delete('/me/places/:id', requireAuth, async (req, res) => {
  await prisma.savedPlace.deleteMany({ where: { id: z.string().uuid().parse(req.params.id), userId: userId(req) } });
  res.status(204).send();
});
