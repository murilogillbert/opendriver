import { Router, type Response } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, requireRole, userId } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { readComplaintAttachmentForStaff } from '../complaints/complaints.service.js';
import { readRecordingForStaff } from '../recording/recording.service.js';
import * as categorias from '../vehicles/categories.admin.service.js';
import * as validacao from '../vehicles/validation.service.js';
import * as admin from './admin.service.js';

/** Ferramentas administrativas (RF17) — papel Admin do hub. As telas ficam no painel web do hub. */
export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole('Admin'));

const uuid = (v: unknown) => z.string().uuid().parse(v);

function sendPrivateImage(res: Response, data: Buffer) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', data[0] === 0x89 ? 'image/png' : data.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/jpeg');
  res.send(data);
}

adminRouter.get('/admin/metrics', async (_req, res) => {
  res.json(envelope(await admin.metrics()));
});

adminRouter.get(
  '/admin/drivers',
  validateQuery(admin.pageSchema.extend({ status: z.enum(['PendingDocuments', 'InReview', 'Approved', 'Rejected', 'Suspended']).optional(), q: z.string().trim().max(80).optional() })),
  async (_req, res) => {
    res.json(envelope(await admin.listDrivers(res.locals.query)));
  },
);
adminRouter.get('/admin/drivers/:id', async (req, res) => {
  res.json(envelope(await admin.driverDetail(uuid(req.params.id))));
});
adminRouter.get('/admin/drivers/:id/documents/:kind', async (req, res) => {
  const kind = z.enum(['cnh', 'selfie']).parse(req.params.kind);
  sendPrivateImage(res, await admin.driverDocument(userId(req), uuid(req.params.id), kind));
});
adminRouter.post('/admin/drivers/:id/approve', async (req, res) => {
  res.json(envelope(await admin.reviewDriver(userId(req), uuid(req.params.id), 'approve')));
});
adminRouter.post('/admin/drivers/:id/reject', validateBody(admin.reasonSchema), async (req, res) => {
  res.json(envelope(await admin.reviewDriver(userId(req), uuid(req.params.id), 'reject', req.body.reason)));
});
adminRouter.post('/admin/drivers/:id/suspend', validateBody(admin.reasonSchema), async (req, res) => {
  res.json(envelope(await admin.reviewDriver(userId(req), uuid(req.params.id), 'suspend', req.body.reason)));
});
adminRouter.post('/admin/drivers/:id/reactivate', async (req, res) => {
  res.json(envelope(await admin.reviewDriver(userId(req), uuid(req.params.id), 'reactivate')));
});

adminRouter.get('/admin/vehicles/:id/crlv', async (req, res) => {
  sendPrivateImage(res, await admin.vehicleCrlv(userId(req), uuid(req.params.id)));
});
adminRouter.post('/admin/vehicles/:id/approve', async (req, res) => {
  res.json(envelope(await admin.reviewVehicle(userId(req), uuid(req.params.id), 'approve')));
});
adminRouter.post('/admin/vehicles/:id/reject', validateBody(admin.reasonSchema), async (req, res) => {
  res.json(envelope(await admin.reviewVehicle(userId(req), uuid(req.params.id), 'reject', req.body.reason)));
});

// ------------------------------------------------------- categoria do veículo (Econômico × Conforto)
// A categoria define a tarifa (`pricing` tem `category` como chave), e até aqui era escolha livre
// do motorista — ou seja, ele decidia quanto o passageiro paga. Estas rotas dão ao operador a
// tabela de classificação, a fila de divergência e o direito de última palavra.

/** Fila de divergência vem antes das rotas com `:id` só por clareza de leitura — o formato do
 * caminho já as distingue. */
adminRouter.get('/admin/vehicles/divergences', validateQuery(categorias.divergenceQuerySchema), async (_req, res) => {
  res.json(envelope(await categorias.listCategoryDivergences(res.locals.query)));
});

adminRouter.put(
  '/admin/vehicles/:id/category',
  validateBody(z.object({ category: z.enum(['Economy', 'Comfort']), reason: z.string().trim().min(3, 'Informe o motivo.').max(400) })),
  async (req, res) => {
    res.json(envelope(await validacao.reclassificarPorAdmin(userId(req), uuid(req.params.id), req.body.category, req.body.reason)));
  },
);

/** Consulta o Detran de novo. **Consome crédito** — é ação deliberada de operador. */
adminRouter.post('/admin/vehicles/:id/revalidate', async (req, res) => {
  res.json(envelope(await validacao.revalidarPorAdmin(userId(req), uuid(req.params.id))));
});

/** Reaplica as regras sobre o retorno do Detran já guardado. Não consulta nada, não custa nada.
 * `aplicar: false` (o padrão) é ensaio: devolve o que mudaria sem mudar. */
adminRouter.post('/admin/vehicles/reclassify-batch', validateBody(z.object({ aplicar: z.boolean().default(false) })), async (req, res) => {
  res.json(envelope(await validacao.reclassificarEmLote(userId(req), { aplicar: req.body.aplicar })));
});

adminRouter.get('/admin/vehicle-categories', validateQuery(categorias.categoryRuleQuerySchema), async (_req, res) => {
  res.json(envelope(await categorias.listCategoryRules(res.locals.query)));
});
adminRouter.post('/admin/vehicle-categories', validateBody(categorias.categoryRuleSchema), async (req, res) => {
  res.status(201).json(envelope(await categorias.createCategoryRule(userId(req), req.body)));
});
adminRouter.put('/admin/vehicle-categories/:id', validateBody(categorias.categoryRuleSchema), async (req, res) => {
  res.json(envelope(await categorias.updateCategoryRule(userId(req), uuid(req.params.id), req.body)));
});
adminRouter.delete('/admin/vehicle-categories/:id', async (req, res) => {
  res.json(envelope(await categorias.deleteCategoryRule(userId(req), uuid(req.params.id))));
});
adminRouter.post('/admin/vehicle-categories/import', validateBody(categorias.categoryCsvSchema), async (req, res) => {
  res.json(envelope(await categorias.importCategoryRules(userId(req), req.body)));
});

// ------------------------------------------------------- provedores de consulta ao Detran, por UF
// A lista de UFs saiu do código e virou dado: o caminho de cada serviço da Infosimples não é
// verificável de graça (sondagem sem token devolve 601 antes de validar a rota), então corrigir um
// endpoint tem de ser edição no admin, não deploy.

const ufParam = (v: unknown) => z.string().trim().length(2).toUpperCase().parse(v);

adminRouter.get('/admin/detran-providers', async (_req, res) => {
  res.json(envelope(await categorias.listDetranProviders()));
});
adminRouter.put('/admin/detran-providers/:uf', validateBody(categorias.detranProviderSchema), async (req, res) => {
  res.json(envelope(await categorias.upsertDetranProvider(userId(req), ufParam(req.params.uf), req.body)));
});
adminRouter.delete('/admin/detran-providers/:uf', async (req, res) => {
  res.json(envelope(await categorias.removeDetranProvider(userId(req), ufParam(req.params.uf))));
});
/** Consulta real, com placa digitada pelo operador. **Consome crédito** da Infosimples. */
adminRouter.post('/admin/detran-providers/:uf/test', validateBody(categorias.detranTestSchema), async (req, res) => {
  res.json(envelope(await categorias.testDetranProvider(userId(req), ufParam(req.params.uf), req.body)));
});

adminRouter.get('/admin/users', validateQuery(admin.pageSchema.extend({ q: z.string().trim().max(80).optional() })), async (_req, res) => {
  const q = res.locals.query as { q?: string; page: number; pageSize: number };
  res.json(envelope(await admin.listUsers(q.q, q)));
});

adminRouter.get(
  '/admin/rides',
  validateQuery(
    admin.pageSchema.extend({
      status: z.enum(['Scheduled', 'Searching', 'DriverAssigned', 'DriverArrived', 'InProgress', 'Completed', 'Cancelled', 'NoDrivers']).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  ),
  async (_req, res) => {
    res.json(envelope(await admin.listRides(res.locals.query)));
  },
);
adminRouter.get('/admin/rides/:id', async (req, res) => {
  res.json(envelope(await admin.rideDetail(uuid(req.params.id))));
});
adminRouter.post('/admin/rides/:id/cancel', validateBody(admin.reasonSchema), async (req, res) => {
  res.json(envelope(await admin.forceCancel(userId(req), uuid(req.params.id), req.body.reason)));
});

adminRouter.get('/admin/payouts', validateQuery(admin.pageSchema.extend({ status: z.enum(['Pending', 'Paid', 'Rejected']).optional() })), async (_req, res) => {
  const q = res.locals.query as { status?: string; page: number; pageSize: number };
  res.json(envelope(await admin.listPayouts(q.status, q)));
});
adminRouter.post('/admin/payouts/:id/paid', validateBody(admin.noteSchema), async (req, res) => {
  res.json(envelope(await admin.resolvePayout(userId(req), uuid(req.params.id), 'paid', req.body.note)));
});
adminRouter.post('/admin/payouts/:id/reject', validateBody(admin.noteSchema), async (req, res) => {
  res.json(envelope(await admin.resolvePayout(userId(req), uuid(req.params.id), 'rejected', req.body.note)));
});

adminRouter.get('/admin/pricing', async (_req, res) => {
  res.json(envelope(await admin.listPricing()));
});
adminRouter.put('/admin/pricing/:category', validateBody(admin.pricingSchema), async (req, res) => {
  const category = z.enum(['Economy', 'Comfort']).parse(req.params.category);
  res.json(envelope(await admin.updatePricing(userId(req), category, req.body)));
});

adminRouter.get(
  '/admin/incidents',
  validateQuery(admin.pageSchema.extend({ status: z.enum(['Open', 'InReview', 'Closed']).optional(), type: z.enum(['Emergency', 'Report', 'Complaint']).optional() })),
  async (_req, res) => {
    const q = res.locals.query as { status?: string; type?: string; page: number; pageSize: number };
    res.json(envelope(await admin.listIncidents(q.status, q.type, q)));
  },
);
adminRouter.put('/admin/incidents/:id/status', validateBody(z.object({ status: z.enum(['Open', 'InReview', 'Closed']) })), async (req, res) => {
  res.json(envelope(await admin.setIncidentStatus(userId(req), uuid(req.params.id), req.body.status)));
});
adminRouter.get('/admin/incidents/attachments/:id', async (req, res) => {
  const id = uuid(req.params.id);
  const { data, mimeType } = await readComplaintAttachmentForStaff(id);
  await admin.auditComplaintAttachmentAccess(userId(req), id);
  res.setHeader('Cache-Control', 'no-store, private');
  res.type(mimeType).send(data);
});

adminRouter.get('/admin/recordings/:id', async (req, res) => {
  const id = uuid(req.params.id);
  const { data, mimeType } = await readRecordingForStaff(id);
  await admin.auditRecordingAccess(userId(req), id);
  res.setHeader('Cache-Control', 'no-store, private');
  res.type(mimeType).send(data);
});
