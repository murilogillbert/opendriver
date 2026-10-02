import { Router } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireApiKey } from '../../middleware/apiKey.js';
import * as accountPurge from './accountPurge.service.js';

/**
 * Rotas internas chamadas pelo hub (nunca por usuário logado nem pelo app), quando a pessoa exclui
 * a conta pelo app/site do hub: a conta é a mesma, mas cada serviço é dono do seu schema, então
 * quem recebe o pedido pede ao outro que apague o lado dele.
 *
 * Autenticação por `public.service_api_keys` com escopo — a mesma loja de chaves do hub.
 */
export const internalRouter = Router();
const uuid = (v: unknown) => z.string().uuid().parse(v);

internalRouter.get('/internal/accounts/:userId/deletion-blockers', requireApiKey('account:read'), async (req, res) => {
  res.json(envelope({ blockers: await accountPurge.deletionBlockers(uuid(req.params.userId)) }));
});

/** Idempotente: repetir numa conta já anonimizada não é erro (permite reexecutar a exclusão). */
internalRouter.post('/internal/accounts/:userId/purge', requireApiKey('account:purge'), async (req, res) => {
  await accountPurge.purgeOpendriverAccount(uuid(req.params.userId));
  res.status(204).send();
});
