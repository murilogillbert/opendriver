import fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeExpiredRecordings } from '../../src/modules/recording/recording.service.js';
import { call, CNH, CPF, PASSWORD, startServer, type TestServer, TINY_JPEG, uniqueEmail, upload } from '../helpers.js';
import { db, driver, offline, passenger } from '../rideKit.js';

let srv: TestServer;
let adminToken: string;

beforeAll(async () => {
  srv = await startServer();
  const email = uniqueEmail('admin');
  const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Ana Admin', email, password: PASSWORD, phone: '65999993333', role: 'Passenger' });
  await db.user.update({ where: { id: reg.data.user.id }, data: { role: 'Admin' } });
  adminToken = (await call(srv.url, 'POST', '/auth/login', { email, password: PASSWORD })).data.token;
});
afterAll(async () => {
  await srv.close();
  await db.$disconnect();
});

const AT = { lat: -11.0, lng: -61.0 };
/** Cabeçalho mínimo de um .m4a (ftyp M4A) seguido de dados. */
const FAKE_M4A = Buffer.concat([Buffer.from('00000020667479704d344120', 'hex'), Buffer.alloc(64, 7)]);

async function adminGetRaw(path: string) {
  const res = await fetch(`${srv.url}/api/v1${path}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
}

describe('administração (RF17)', () => {
  it('análise de motorista: fila, documento decifrado, aprovação, auditoria', async () => {
    const email = uniqueEmail('rev');
    const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Rui Revisado', email, password: PASSWORD, phone: '65999994444', cpf: CPF, role: 'Driver' });
    const t = reg.data.token;
    const id = reg.data.user.id;
    expect((await call(srv.url, 'GET', '/admin/metrics', undefined, t)).status).toBe(403);

    await call(srv.url, 'PUT', '/driver/profile', { cnhNumber: CNH, cnhCategory: 'B', cnhExpiresAt: '2031-01-01', birthDate: '1985-01-01' }, t);
    await upload(srv.url, '/driver/documents/cnh', t, TINY_JPEG);
    await upload(srv.url, '/driver/documents/selfie', t, TINY_JPEG);
    const v = await call(srv.url, 'POST', '/driver/vehicles', { plate: `RVW${Math.floor(Math.random() * 9)}A${Math.floor(Math.random() * 90 + 10)}`, brand: 'Hyundai', model: 'HB20', color: 'Branco', year: 2021 }, t);
    await upload(srv.url, `/driver/vehicles/${v.data.id}/crlv`, t, TINY_JPEG);
    await call(srv.url, 'POST', '/driver/submit', {}, t);

    const queue = await call(srv.url, 'GET', `/admin/drivers?status=InReview&q=${encodeURIComponent(email)}`, undefined, adminToken);
    expect(queue.data.items.map((d: any) => d.userId)).toContain(id);

    const doc = await adminGetRaw(`/admin/drivers/${id}/documents/cnh`);
    expect(doc.status).toBe(200);
    expect(doc.type).toBe('image/jpeg');
    expect(doc.body.equals(TINY_JPEG)).toBe(true); // decifrado corretamente

    const rej = await call(srv.url, 'POST', `/admin/drivers/${id}/reject`, { reason: 'Foto da CNH ilegível' }, adminToken);
    expect(rej.data.status).toBe('Rejected');
    expect((await call(srv.url, 'GET', '/me', undefined, t)).data.driver.rejectionReason).toBe('Foto da CNH ilegível');
    const appr = await call(srv.url, 'POST', `/admin/drivers/${id}/approve`, {}, adminToken);
    expect(appr.data.status).toBe('Approved');
    await call(srv.url, 'POST', `/admin/vehicles/${v.data.id}/approve`, {}, adminToken);
    expect((await call(srv.url, 'POST', '/driver/online', {}, t)).data.isOnline).toBe(true);
    await call(srv.url, 'POST', '/driver/offline', {}, t);

    const logs = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['opendriver.driver.document_viewed', 'opendriver.driver.reject', 'opendriver.driver.approve']);

    const metrics = await call(srv.url, 'GET', '/admin/metrics', undefined, adminToken);
    expect(metrics.data).toHaveProperty('last7Days.gmv');
  });

  it('preços: validação e atualização', async () => {
    const list = await call(srv.url, 'GET', '/admin/pricing', undefined, adminToken);
    const eco = list.data.find((p: any) => p.category === 'Economy');
    const bad = await call(srv.url, 'PUT', '/admin/pricing/Economy', { ...eco, minimumFare: 1, baseFare: 5 }, adminToken);
    expect(bad.code).toBe('invalid_pricing');
    const ok = await call(srv.url, 'PUT', '/admin/pricing/Economy', { ...eco, perKm: eco.perKm }, adminToken);
    expect(ok.status).toBe(200);
  });
});

describe('segurança e gravação (RF15, RF16)', () => {
  it('gravação opt-in, emergência, acompanhamento público, acesso auditado e retenção', async () => {
    const pax = await passenger(srv.url, { card: '4111 1111 1111 1111' });
    const drv = await driver(srv.url, { lat: AT.lat + 0.003, lng: AT.lng + 0.003 });

    const terms = await call(srv.url, 'GET', '/me/recording', undefined, pax.token);
    expect(terms.data.retentionDays).toBe(30);
    expect((await call(srv.url, 'PUT', '/me/recording', { enabled: true, consentVersion: 'v0' }, pax.token)).code).toBe('consent_outdated');
    expect((await call(srv.url, 'PUT', '/me/recording', { enabled: true, consentVersion: terms.data.consentVersion }, pax.token)).data.enabled).toBe(true);

    expect((await call(srv.url, 'POST', '/me/trusted-contacts', { name: 'Mãe', phone: '(65) 98888-7777' }, pax.token)).data).toHaveLength(1);

    const q = await call(srv.url, 'POST', '/rides/quote', { origin: { ...AT, address: 'A' }, destination: { lat: AT.lat + 0.02, lng: AT.lng + 0.02, address: 'B' } }, pax.token);
    const ride = (await call(srv.url, 'POST', '/rides', { quoteId: q.data.id }, pax.token)).data;
    const offer = await drv.waitFor('ride:offer');
    await call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.id}/arrived`, {}, drv.token);

    // Antes de iniciar a viagem não aceita áudio
    expect((await upload(srv.url, `/rides/${ride.id}/recordings`, pax.token, FAKE_M4A, 'a.m4a', 'audio/mp4')).code).toBe('recording_window_closed');
    const pickupCode = (await call(srv.url, 'GET', `/rides/${ride.id}`, undefined, pax.token)).data.pickupCode;
    await call(srv.url, 'POST', `/rides/${ride.id}/start`, { code: pickupCode }, drv.token);
    expect((await upload(srv.url, `/rides/${ride.id}/recordings`, pax.token, TINY_JPEG, 'a.jpg', 'image/jpeg')).code).toBe('unsupported_file');
    const rec = await upload(srv.url, `/rides/${ride.id}/recordings`, pax.token, FAKE_M4A, 'a.m4a', 'audio/mp4');
    expect(rec.status).toBe(201);
    // Motorista sem opt-in não grava
    expect((await upload(srv.url, `/rides/${ride.id}/recordings`, drv.token, FAKE_M4A, 'a.m4a', 'audio/mp4')).code).toBe('recording_disabled');

    // Sem ocorrência a equipe NÃO acessa o áudio
    expect((await adminGetRaw(`/admin/recordings/${rec.data.id}`)).status).toBe(403);

    const em = await call(srv.url, 'POST', `/rides/${ride.id}/emergency`, { lat: AT.lat, lng: AT.lng }, pax.token);
    expect(em.data.emergencyNumber).toBe('190');
    expect(em.data.contacts[0]).toMatchObject({ name: 'Mãe', phone: '65988887777' });
    const token = em.data.shareUrl.split('/t/')[1];

    const page = await fetch(`${srv.url}/t/${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    const data = await (await fetch(`${srv.url}/t/${token}/data`)).json();
    expect(data).toMatchObject({ active: true, status: 'Em viagem', driver: 'Diego' });
    expect(JSON.stringify(data)).not.toMatch(/9999/); // nenhum telefone exposto
    expect((await fetch(`${srv.url}/t/${'x'.repeat(30)}/data`)).status).toBe(404);

    // Com ocorrência: áudio decifrado e acesso auditado
    const audio = await adminGetRaw(`/admin/recordings/${rec.data.id}`);
    expect(audio.status).toBe(200);
    expect(audio.body.equals(FAKE_M4A)).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: rec.data.id, action: 'opendriver.recording.accessed' } })).toBe(1);

    const detail = await call(srv.url, 'GET', `/admin/rides/${ride.id}`, undefined, adminToken);
    expect(detail.data.incidents[0].type).toBe('Emergency');
    expect(detail.data.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['requested', 'offer_sent', 'accepted', 'arrived', 'started', 'emergency']));

    // Admin encerra a corrida em andamento; link público deixa de mostrar posição
    const cancelled = await call(srv.url, 'POST', `/admin/rides/${ride.id}/cancel`, { reason: 'Ocorrência de segurança' }, adminToken);
    expect(cancelled.data.ride.status).toBe('Cancelled');
    const after = await (await fetch(`${srv.url}/t/${token}/data`)).json();
    expect(after).toMatchObject({ active: false, location: null });
    // Passados 30 min do fim, o link deixa de expor qualquer dado da viagem.
    await db.ride.update({ where: { id: ride.id }, data: { cancelledAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await fetch(`${srv.url}/t/${token}/data`)).status).toBe(404);
    expect((await fetch(`${srv.url}/t/abc<script>`)).status).toBe(404);

    // Retenção de 30 dias: vencida → apagada do storage e inacessível
    const row = await db.rideRecording.findUniqueOrThrow({ where: { id: rec.data.id } });
    const file = `/tmp/od-test-storage/${row.storageKey}`;
    expect((await fs.readFile(file)).includes(FAKE_M4A.subarray(12, 40))).toBe(false); // cifrado em disco
    await db.rideRecording.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await purgeExpiredRecordings()).toBeGreaterThanOrEqual(1);
    await expect(fs.access(file)).rejects.toThrow();
    expect((await adminGetRaw(`/admin/recordings/${rec.data.id}`)).status).toBe(404);

    pax.close();
    await offline(srv.url, drv);
  });

  it('saque do motorista: pedido, pagamento pelo admin, débito no livro-caixa', async () => {
    const drv = await driver(srv.url, { lat: -9.0, lng: -60.0 });
    await db.driverEarning.create({ data: { driverId: drv.id, type: 'Adjustment', amount: 42.5, description: 'Crédito de teste' } });
    await db.user.update({ where: { id: drv.id }, data: { emailVerifiedAt: new Date() } });
    expect((await call(srv.url, 'POST', '/driver/payouts', { amount: 20 }, drv.token)).code).toBe('no_pix');
    await call(srv.url, 'PUT', '/driver/pix', { pixKeyType: 'CPF', pixKey: CPF }, drv.token);
    expect((await call(srv.url, 'POST', '/driver/payouts', { amount: 5 }, drv.token)).code).toBe('payout_min');
    expect((await call(srv.url, 'POST', '/driver/payouts', { amount: 100 }, drv.token)).code).toBe('insufficient_balance');

    // Pedidos concorrentes não ultrapassam o saldo
    const reqs = await Promise.all([30, 30].map((amount) => call(srv.url, 'POST', '/driver/payouts', { amount }, drv.token)));
    expect(reqs.filter((r) => r.status === 201)).toHaveLength(1);
    const payout = reqs.find((r) => r.status === 201)!.data;
    expect((await call(srv.url, 'GET', '/driver/earnings/summary', undefined, drv.token)).data).toMatchObject({ balance: 42.5, pendingPayout: 30, withdrawable: 12.5 });

    const list = await call(srv.url, 'GET', '/admin/payouts?status=Pending', undefined, adminToken);
    expect(list.data.items.some((p: any) => p.id === payout.id && p.pixKey === CPF)).toBe(true);
    expect((await call(srv.url, 'POST', `/admin/payouts/${payout.id}/paid`, { note: 'Pix enviado' }, adminToken)).data.status).toBe('Paid');
    expect((await call(srv.url, 'POST', `/admin/payouts/${payout.id}/paid`, {}, adminToken)).code).toBe('already_resolved');
    expect((await call(srv.url, 'GET', '/driver/earnings/summary', undefined, drv.token)).data).toMatchObject({ balance: 12.5, pendingPayout: 0 });
    await offline(srv.url, drv);
  });
  it('limite por usuário: relatos em excesso são recusados sem afetar outra pessoa', async () => {
    const reg = async (tag: string) =>
      (await call(srv.url, 'POST', '/auth/register', { name: 'Rita Relato', email: uniqueEmail(tag), password: PASSWORD, phone: '65999990077', role: 'Passenger' })).data.token as string;
    const [a, b] = [await reg('rl-a'), await reg('rl-b')];
    for (let i = 0; i < 10; i++) expect((await call(srv.url, 'POST', '/safety/incidents', { description: `Relato de teste número ${i}` }, a)).status).toBe(201);
    const blocked = await call(srv.url, 'POST', '/safety/incidents', { description: 'Relato de teste excedente' }, a);
    expect(blocked.status).toBe(429);
    expect(blocked.code).toBe('rate_limited');
    expect((await call(srv.url, 'POST', '/safety/incidents', { description: 'Relato de outra pessoa' }, b)).status).toBe(201);
  });
});

