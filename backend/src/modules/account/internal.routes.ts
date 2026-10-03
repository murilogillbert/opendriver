import { Router } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireApiKey } from '../../middleware/apiKey.js';
import * as accountPurge from './accountPurge.service.js';
import { creditAdRevenue } from './adRevenue.service.js';

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

/**
 * Repasse por veiculacao de anuncio, creditado pelo **openad**.
 *
 * Chamado quando uma veiculacao e classificada como faturavel — depois da reconciliacao de
 * duracao e da antifraude, nunca com base no que o tablete reportou. O livro-caixa do
 * motorista mora aqui porque e aqui que ele ve extrato, saldo e pede saque por PIX; o openad
 * reporta e este servico credita, em vez de escrever no schema alheio.
 *
 * Idempotente por `referenceId`: o reprocessamento de um lote de analytics devolve **201 com
 * `duplicated: true`** em vez de pagar de novo. O status e 201 nos dois casos de proposito —
 * para quem chama, "ja estava feito" e "acabei de fazer" tem o mesmo efeito, e distinguir por
 * status faria o cliente tratar retentativa normal como erro.
 */
internalRouter.post('/internal/driver-earnings/ad-revenue', requireApiKey('ads:earning:write'), async (req, res) => {
  res.status(201).json(envelope(await creditAdRevenue(req.body)));
});
