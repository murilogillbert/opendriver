import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, startServer, type TestServer } from '../helpers.js';
import { approveMockPix } from '../../src/infra/payments/mock.js';
import { offlineStaleDrivers } from '../../src/jobs/staleDrivers.js';
import { db, driver, moveDriver, offline, passenger, waitRide } from '../rideKit.js';

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
  await db.$disconnect();
});

// Cada cenário numa região diferente (raio de busca 8 km) para não haver
// interferência entre motoristas de cenários distintos.
const REGION = {
  happy: { lat: -15.6, lng: -56.1 },
  decline: { lat: -16.47, lng: -54.64 },
  pix: { lat: -12.54, lng: -55.72 },
  race: { lat: -10.0, lng: -56.0 },
  driverCancel: { lat: -13.0, lng: -57.0 },
  fee: { lat: -14.0, lng: -58.0 },
  paidPix: { lat: -11.0, lng: -60.0 },
  stale: { lat: -9.0, lng: -61.0 },
};
const near = (p: { lat: number; lng: number }, dLat = 0.004, dLng = 0.004) => ({ lat: p.lat + dLat, lng: p.lng + dLng });

async function quoteAndRequest(base: string, token: string, o: { lat: number; lng: number }, body: Record<string, unknown> = {}) {
  const q = await call(base, 'POST', '/rides/quote', { origin: { ...o, address: 'Rua A, 1' }, destination: { ...near(o, 0.03, 0.02), address: 'Shopping' } }, token);
  expect(q.status).toBe(200);
  const r = await call(base, 'POST', '/rides', { quoteId: q.data.id, ...body }, token);
  return { quote: q.data, ride: r };
}

describe('corrida ponta a ponta (RF03–RF10)', () => {
  it('pedir → oferta → aceitar → chegar → iniciar → finalizar → cobrança automática → avaliar', async () => {
    const pax = await passenger(srv.url, { cashback: 5, card: '4111 1111 1111 1111' });
    const drv = await driver(srv.url, near(REGION.happy));

    const pm = await call(srv.url, 'GET', '/payment-methods', undefined, pax.token);
    expect(pm.data.methods.find((m: any) => m.isDefault).label).toMatch(/•••• 1111/); // cartão é o padrão (UX04)

    const { quote, ride } = await quoteAndRequest(srv.url, pax.token, REGION.happy);
    expect(quote.prices.map((p: any) => p.category)).toEqual(['Economy', 'Comfort']);
    expect(quote.routeSource).toBe('estimate'); // sem OSRM neste ambiente
    expect(ride.status).toBe(201);
    const r0 = ride.data;
    expect(r0.status).toBe('Searching');
    expect(r0.category).toBe('Economy'); // padrão: mais barata na 1ª corrida
    expect(r0.fare).toBe(quote.prices[0].fare); // preço travado
    expect(r0.actions).toEqual(['cancel']);

    // Motorista recebe a oferta com o essencial (UX06)
    const offer = await drv.waitFor('ride:offer');
    expect(offer).toMatchObject({ rideId: r0.id, driverEarning: quote.prices[0].driverEarning });
    expect(offer.pickupEtaS).toBeGreaterThan(0);
    expect((await call(srv.url, 'GET', '/driver/offers/current', undefined, drv.token)).data.offerId).toBe(offer.offerId);

    // Segundo pedido simultâneo do mesmo passageiro é recusado
    const dup = await quoteAndRequest(srv.url, pax.token, REGION.happy);
    expect(dup.ride.code).toBe('active_ride');

    const acc = await call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token);
    expect(acc.data.status).toBe('DriverAssigned');
    expect(acc.data.actions).toEqual(['arrived', 'cancel', 'safety']);
    expect(acc.data.passenger.name).toBe('Paula');
    expect(acc.data.driverEarning).toBe(offer.driverEarning);

    const upd = await pax.waitFor('ride:update', (p) => p.status === 'DriverAssigned');
    expect(upd.driver).toMatchObject({ name: 'Diego', vehicle: { model: 'Onix', color: 'Prata' } });
    expect(upd.driver.phone).toBeUndefined(); // telefone nunca é exposto
    expect(upd.driverEarning).toBeUndefined(); // passageiro não vê o repasse
    expect(upd.actions).toEqual(['cancel', 'share', 'safety']);
    // Previsão de chegada do motorista (a partir do ETA calculado na oferta)
    expect(new Date(upd.pickupEta).getTime()).toBeGreaterThan(Date.now() - 5000);

    // Trajeto do motorista até o embarque: só dele, só enquanto vai buscar o passageiro
    const toPickup = await call(srv.url, 'GET', `/rides/${r0.id}/pickup-route`, undefined, drv.token);
    expect(toPickup.status).toBe(200);
    expect(toPickup.data).toMatchObject({ routeSource: 'estimate' });
    expect(toPickup.data.polyline.length).toBeGreaterThan(0);
    expect(toPickup.data.durationS).toBeGreaterThanOrEqual(0);
    expect((await call(srv.url, 'GET', `/rides/${r0.id}/pickup-route`, undefined, pax.token)).status).not.toBe(200);

    // Localização em tempo real (RF06)
    await moveDriver(drv, near(REGION.happy, 0.001, 0.001));
    const loc = await pax.waitFor('driver:location');
    expect(loc.rideId).toBe(r0.id);

    const arrived = await call(srv.url, 'POST', `/rides/${r0.id}/arrived`, {}, drv.token);
    expect(arrived.data.status).toBe('DriverArrived');
    expect((await call(srv.url, 'POST', `/rides/${r0.id}/finish`, {}, drv.token)).code).toBe('invalid_state'); // ação fora de ordem
    const started = await call(srv.url, 'POST', `/rides/${r0.id}/start`, {}, drv.token);
    expect(started.data.actions).toEqual(['finish', 'safety']);
    expect((await call(srv.url, 'GET', `/rides/${r0.id}/pickup-route`, undefined, drv.token)).code).toBe('invalid_state'); // já embarcou
    expect((await call(srv.url, 'POST', `/rides/${r0.id}/cancel`, {}, pax.token)).code).toBe('invalid_state');

    const shared = await call(srv.url, 'POST', `/rides/${r0.id}/share`, {}, pax.token);
    expect(shared.data.url).toMatch(/\/t\/[\w-]{20,}$/);

    const finished = await call(srv.url, 'POST', `/rides/${r0.id}/finish`, {}, drv.token);
    expect(finished.data.status).toBe('Completed');

    // Pagamento automático (0 interações): cashback do hub abatido + cartão cobrado
    const paid = await waitRide(srv.url, pax.token, r0.id, (r) => r.payment.status === 'Paid');
    expect(paid.cashbackUsed).toBe(5);
    expect(paid.actions).toEqual(['rate']);
    const user = await db.user.findUnique({ where: { id: pax.id } });
    expect(Number(user!.cashbackBalance)).toBe(0);
    const entry = await db.cashbackEntry.findFirst({ where: { userId: pax.id, type: 'Used' } });
    expect(Number(entry!.amount)).toBe(5);
    const charge = await db.ridePayment.findFirst({ where: { rideId: r0.id } });
    expect(Number(charge!.amount)).toBeCloseTo(r0.fare - 5, 2);

    // Ganhos do motorista
    const sum = await call(srv.url, 'GET', '/driver/earnings/summary', undefined, drv.token);
    expect(sum.data.today).toBe(offer.driverEarning);
    expect(sum.data.ridesToday).toBe(1);

    // Avaliação nos dois sentidos (RF10)
    expect((await call(srv.url, 'POST', `/rides/${r0.id}/rating`, { stars: 5, comment: 'Ótimo' }, pax.token)).data.actions).toEqual([]);
    expect((await call(srv.url, 'POST', `/rides/${r0.id}/rating`, { stars: 4 }, pax.token)).code).toBe('already_rated');
    await call(srv.url, 'POST', `/rides/${r0.id}/rating`, { stars: 4 }, drv.token);
    const me = await call(srv.url, 'GET', '/me', undefined, drv.token);
    expect(me.data.driver.rating).toBe(5);

    // Histórico (RF09)
    const hist = await call(srv.url, 'GET', '/rides?role=passenger', undefined, pax.token);
    expect(hist.data.items[0].id).toBe(r0.id);
    const dhist = await call(srv.url, 'GET', '/rides?role=driver', undefined, drv.token);
    expect(dhist.data.items[0].id).toBe(r0.id);

    // Terceiros não veem a corrida
    const other = await passenger(srv.url);
    expect((await call(srv.url, 'GET', `/rides/${r0.id}`, undefined, other.token)).status).toBe(404);

    pax.close();
    other.close();
    await offline(srv.url, drv);
  });

  it('recusa passa ao próximo; timeout expira; cancelamento na busca é grátis', async () => {
    const pax = await passenger(srv.url);
    const a = await driver(srv.url, near(REGION.decline, 0.002, 0.002)); // mais perto
    const b = await driver(srv.url, near(REGION.decline, 0.02, 0.02));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.decline);
    expect(ride.data.payment.methodType).toBe('Pix'); // sem cartão: Pix selecionado sozinho

    const o1 = await a.waitFor('ride:offer');
    expect(o1.rideId).toBe(ride.data.id);
    expect(b.events.some((e) => e.event === 'ride:offer')).toBe(false); // um motorista por vez
    await call(srv.url, 'POST', `/driver/offers/${o1.offerId}/decline`, {}, a.token);

    const o2 = await b.waitFor('ride:offer');
    // B não responde: expira (timeout de teste = 2 s) e ninguém mais é elegível
    await b.waitFor('ride:offer_closed', (p) => p.offerId === o2.offerId, 6000);
    expect((await call(srv.url, 'POST', `/driver/offers/${o2.offerId}/accept`, {}, b.token)).code).toBe('offer_unavailable');

    const still = await call(srv.url, 'GET', `/rides/${ride.data.id}`, undefined, pax.token);
    expect(still.data.status).toBe('Searching');
    const c = await call(srv.url, 'POST', `/rides/${ride.data.id}/cancel`, { reason: 'Demorou' }, pax.token);
    expect(c.data).toEqual({ cancelled: true, cancellationFee: 0 });
    const final = await call(srv.url, 'GET', `/rides/${ride.data.id}`, undefined, pax.token);
    expect(final.data).toMatchObject({ status: 'Cancelled', cancelledBy: 'Passenger', actions: [] });
    expect(final.data.payment.status).toBe('NotRequired');

    pax.close();
    await offline(srv.url, a, b);
  });

  it('cartão recusado → corrida conclui mesmo assim → passageiro paga com Pix', async () => {
    const pax = await passenger(srv.url, { card: '4000 0000 0000 0002' }); // mock recusa final 0002
    const drv = await driver(srv.url, near(REGION.pix));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.pix, { useCashback: false });
    const offer = await drv.waitFor('ride:offer');
    await call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/arrived`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/start`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/finish`, {}, drv.token);

    const failed = await waitRide(srv.url, pax.token, ride.data.id, (r) => r.payment.status === 'Failed');
    expect(failed.status).toBe('Completed');
    expect(failed.actions).toEqual(['pay', 'rate']); // ação clara de recuperação (UX11)
    expect(failed.payment.failureReason).toMatch(/recusado/);

    const methods = await call(srv.url, 'GET', '/payment-methods', undefined, pax.token);
    const pix = methods.data.methods.find((m: any) => m.type === 'Pix');
    const pay = await call(srv.url, 'POST', `/rides/${ride.data.id}/pay`, { paymentMethodId: pix.id }, pax.token);
    expect(pay.data.payment.status).toBe('Pending');
    expect(pay.data.payment.pix.copyPaste).toMatch(/^000201/);

    // Webhook (mock) confirma o Pix
    const p = await db.ridePayment.findFirst({ where: { rideId: ride.data.id, method: 'Pix' }, orderBy: { createdAt: 'desc' } });
    const hook = await fetch(`${srv.url}/api/v1/payments/webhook/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: p!.externalId }),
    });
    expect((await hook.json()).status).toBe('paid');
    const done = await pax.waitFor('ride:update', (r) => r.payment.status === 'Paid');
    expect(done.actions).toEqual(['rate']);

    pax.close();
    await offline(srv.url, drv);
  });

  it('Pix já pago no banco e o passageiro troca para cartão: não cobra de novo', async () => {
    const pax = await passenger(srv.url); // sem cartão: a corrida sai no Pix
    const drv = await driver(srv.url, near(REGION.paidPix));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.paidPix, { useCashback: false });
    const offer = await drv.waitFor('ride:offer');
    await call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/arrived`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/start`, {}, drv.token);
    await call(srv.url, 'POST', `/rides/${ride.data.id}/finish`, {}, drv.token);
    const pending = await waitRide(srv.url, pax.token, ride.data.id, (r) => r.payment.status === 'Pending' && !!r.payment.pix);
    expect(pending.actions).toContain('pay');

    // Passageiro pagou o Pix no banco, mas o webhook ainda não chegou…
    const pix = await db.ridePayment.findFirst({ where: { rideId: ride.data.id, method: 'Pix', status: 'Pending' } });
    expect(approveMockPix(pix!.externalId!)).toBe(true);
    // …e em seguida escolhe pagar com um cartão novo.
    const card = await call(srv.url, 'POST', '/payment-methods/card', { number: '4111 1111 1111 1111', holder: 'PAULA P', expiry: '12/35', cvv: '123', postalCode: '78000-000', addressNumber: '10' }, pax.token);
    const pay = await call(srv.url, 'POST', `/rides/${ride.data.id}/pay`, { paymentMethodId: card.data.id }, pax.token);
    expect(pay.status).toBe(200);
    expect(pay.data.payment.status).toBe('Paid');
    expect(await db.ridePayment.count({ where: { rideId: ride.data.id, method: 'Card' } })).toBe(0);

    pax.close();
    await offline(srv.url, drv);
  });

  it('dois aceites simultâneos da mesma oferta: só um vence', async () => {
    const pax = await passenger(srv.url);
    const drv = await driver(srv.url, near(REGION.race));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.race);
    const offer = await drv.waitFor('ride:offer');
    const results = await Promise.all([1, 2, 3].map(() => call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const r = await db.ride.findUnique({ where: { id: ride.data.id } });
    expect(r!.status).toBe('DriverAssigned');
    await call(srv.url, 'POST', `/rides/${ride.data.id}/cancel`, {}, pax.token);
    pax.close();
    await offline(srv.url, drv);
  });

  it('motorista desiste antes do embarque: corrida volta a procurar outro motorista', async () => {
    const pax = await passenger(srv.url);
    const a = await driver(srv.url, near(REGION.driverCancel, 0.001, 0.001));
    const b = await driver(srv.url, near(REGION.driverCancel, 0.01, 0.01));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.driverCancel);
    const o1 = await a.waitFor('ride:offer');
    await call(srv.url, 'POST', `/driver/offers/${o1.offerId}/accept`, {}, a.token);
    const c = await call(srv.url, 'POST', `/rides/${ride.data.id}/cancel`, {}, a.token);
    expect(c.data.cancelled).toBe(true);
    const searching = await pax.waitFor('ride:update', (p) => p.status === 'Searching');
    expect(searching.driver).toBeNull();
    const o2 = await b.waitFor('ride:offer');
    expect(o2.rideId).toBe(ride.data.id); // outro motorista, nunca o mesmo
    await call(srv.url, 'POST', `/driver/offers/${o2.offerId}/accept`, {}, b.token);
    expect((await call(srv.url, 'GET', `/rides/${ride.data.id}`, undefined, pax.token)).data.status).toBe('DriverAssigned');
    await call(srv.url, 'POST', `/rides/${ride.data.id}/cancel`, {}, pax.token);
    pax.close();
    await offline(srv.url, a, b);
  });

  it('cancelar depois da tolerância cobra taxa e credita o motorista', async () => {
    const pax = await passenger(srv.url, { card: '5555 5555 5555 4444' });
    const drv = await driver(srv.url, near(REGION.fee));
    const { ride } = await quoteAndRequest(srv.url, pax.token, REGION.fee, { useCashback: false });
    const offer = await drv.waitFor('ride:offer');
    await call(srv.url, 'POST', `/driver/offers/${offer.offerId}/accept`, {}, drv.token);
    await new Promise((r) => setTimeout(r, 1300)); // tolerância de teste: 1 s
    const c = await call(srv.url, 'POST', `/rides/${ride.data.id}/cancel`, {}, pax.token);
    expect(c.data.cancellationFee).toBe(5);
    const r = await waitRide(srv.url, pax.token, ride.data.id, (x) => x.payment.status === 'Paid');
    expect(r.amountDue).toBe(5);
    const earn = await db.driverEarning.findFirst({ where: { rideId: ride.data.id, type: 'CancellationFee' } });
    expect(Number(earn!.amount)).toBe(5);
    pax.close();
    await offline(srv.url, drv);
  });
  it('motorista online sem enviar posição há 15 min fica offline sozinho (quem está ativo continua)', async () => {
    const quiet = await driver(srv.url, near(REGION.stale));
    const active = await driver(srv.url, near(REGION.stale, 0.01, 0.01));
    const old = new Date(Date.now() - 20 * 60_000);
    await db.driverProfile.updateMany({ where: { userId: { in: [quiet.id, active.id] } }, data: { onlineSince: old } });
    await db.driverLocation.update({ where: { driverId: quiet.id }, data: { updatedAt: old } });
    expect(await offlineStaleDrivers()).toBeGreaterThanOrEqual(1);
    expect((await db.driverProfile.findUniqueOrThrow({ where: { userId: quiet.id } })).isOnline).toBe(false);
    expect((await db.driverProfile.findUniqueOrThrow({ where: { userId: active.id } })).isOnline).toBe(true);
    quiet.close();
    await offline(srv.url, active);
  });
});
