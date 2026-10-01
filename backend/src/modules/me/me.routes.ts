import { Router } from 'express';
import { z } from 'zod';
import { ratingAverage } from '../../domain/rating.js';
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

/** Modo acessibilidade (plano §11.7) — preferência salva, usada como padrão ao pedir corrida. */
meRouter.put('/me/accessibility', requireAuth, validateBody(z.object({ wheelchairAccessible: z.boolean() })), async (req, res) => {
  const uid = userId(req);
  const p = await prisma.passengerProfile.upsert({
    where: { userId: uid },
    create: { userId: uid, wheelchairAccessible: req.body.wheelchairAccessible },
    update: { wheelchairAccessible: req.body.wheelchairAccessible },
  });
  res.json(envelope({ wheelchairAccessible: p.wheelchairAccessible }));
});

/** Motoristas favoritos (plano §6) — leve prioridade no despacho (dispatch.ts) e opção preferencial no agendamento. */
meRouter.get('/me/favorites', requireAuth, async (req, res) => {
  const rows = await prisma.favoriteDriver.findMany({
    where: { passengerId: userId(req) },
    include: { driver: { select: { id: true, name: true, avatarUrl: true, driverProfile: { select: { ratingSum: true, ratingCount: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    envelope(
      rows.map((f) => ({
        driverId: f.driverId,
        name: f.driver.name,
        avatarUrl: f.driver.avatarUrl,
        rating: ratingAverage(f.driver.driverProfile?.ratingSum, f.driver.driverProfile?.ratingCount),
      })),
    ),
  );
});

meRouter.post('/me/favorites', requireAuth, validateBody(z.object({ driverId: z.string().uuid() })), async (req, res) => {
  const uid = userId(req);
  const { driverId } = req.body as { driverId: string };
  if (driverId === uid) throw new AppError('Você não pode favoritar você mesmo.', 400, 'invalid_driver');
  const rode = await prisma.ride.findFirst({ where: { passengerId: uid, driverId, status: 'Completed' } });
  if (!rode) throw new AppError('Você só pode favoritar motoristas com quem já viajou.', 409, 'no_shared_ride');
  await prisma.favoriteDriver.upsert({
    where: { passengerId_driverId: { passengerId: uid, driverId } },
    create: { passengerId: uid, driverId },
    update: {},
  });
  res.status(204).send();
});

meRouter.delete('/me/favorites/:driverId', requireAuth, async (req, res) => {
  await prisma.favoriteDriver.deleteMany({ where: { passengerId: userId(req), driverId: z.string().uuid().parse(req.params.driverId) } });
  res.status(204).send();
});

/** Bloqueio mútuo (plano §6, complemento) — só entre quem já pegou uma corrida junto; respeitado no despacho. */
meRouter.get('/me/blocked', requireAuth, async (req, res) => {
  const rows = await prisma.blockedUser.findMany({
    where: { userId: userId(req) },
    include: { blocked: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(envelope(rows.map((b) => ({ userId: b.blockedId, name: b.blocked.name, avatarUrl: b.blocked.avatarUrl }))));
});

meRouter.post('/me/blocked', requireAuth, validateBody(z.object({ userId: z.string().uuid() })), async (req, res) => {
  const uid = userId(req);
  const blockedId = (req.body as { userId: string }).userId;
  if (blockedId === uid) throw new AppError('Você não pode bloquear você mesmo.', 400, 'invalid_user');
  const rode = await prisma.ride.findFirst({ where: { OR: [{ passengerId: uid, driverId: blockedId }, { driverId: uid, passengerId: blockedId }] } });
  if (!rode) throw new AppError('Você só pode bloquear quem já pegou uma corrida com você.', 409, 'no_shared_ride');
  await prisma.blockedUser.upsert({
    where: { userId_blockedId: { userId: uid, blockedId } },
    create: { userId: uid, blockedId },
    update: {},
  });
  // Bloquear desfaz um favorito mútuo, se existir, nos dois sentidos.
  await prisma.favoriteDriver.deleteMany({
    where: { OR: [{ passengerId: uid, driverId: blockedId }, { passengerId: blockedId, driverId: uid }] },
  });
  res.status(204).send();
});

meRouter.delete('/me/blocked/:userId', requireAuth, async (req, res) => {
  await prisma.blockedUser.deleteMany({ where: { userId: userId(req), blockedId: z.string().uuid().parse(req.params.userId) } });
  res.status(204).send();
});
