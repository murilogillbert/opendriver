import { ApiError } from '@/api/errors';
import type { Offer, Ride } from '@/api/types';
import { API_URL, approveDriver, CNH, CPF, device, PASSWORD, uniqueEmail, uploadJpeg } from './helpers';

/**
 * Fluxo completo do app contra a API real: o passageiro pede em poucos
 * toques, o motorista recebe a oferta por socket, conduz a corrida com as
 * ações que a API libera, o Pix é confirmado e ambos avaliam.
 */
const base = { lat: -20.4 - Math.random() * 0.5, lng: -54.6 - Math.random() * 0.5 };
const dest = { lat: base.lat + 0.03, lng: base.lng + 0.02, address: 'Shopping Campo Grande' };

describe('app ↔ API (passageiro e motorista)', () => {
  const pax = device();
  const drv = device();
  let paxId = '';
  let drvId = '';

  afterAll(async () => {
    await drv.api.driver.offline().catch(() => undefined);
    pax.close();
    drv.close();
  });

  it('cadastro e sessão como o app faz (inclui refresh transparente)', async () => {
    const p = await pax.api.auth.register({ name: 'Paula Passageira', email: uniqueEmail('pax'), password: PASSWORD, phone: '67999990001', cpf: CPF, role: 'Passenger' });
    await pax.http.startSession(p);
    paxId = p.user.id;
    const me = await pax.api.me.get();
    expect(me.role).toBe('passenger');
    expect(me.passenger).not.toBeNull();
    expect(me.driver).toBeNull();

    // Access token inválido: o cliente renova com o refresh e repete a chamada.
    await pax.storage.setTokens({ token: 'invalido', refreshToken: pax.storage.tokens!.refreshToken });
    expect((await pax.api.me.get()).id).toBe(paxId);
    expect(pax.storage.tokens!.token).not.toBe('invalido');

    const d = await drv.api.auth.register({ name: 'Diego Motorista', email: uniqueEmail('drv'), password: PASSWORD, phone: '67999990002', cpf: CPF, role: 'Driver' });
    await drv.http.startSession(d);
    drvId = d.user.id;
    expect((await drv.api.me.get()).driver?.status).toBe('PendingDocuments');
  });

  it('cadastro do motorista pelo checklist e ficar online', async () => {
    const api = drv.api;
    await api.driver.updateData({ cnhNumber: CNH, cnhCategory: 'B', cnhExpiresAt: '2032-01-01', birthDate: '1988-03-03' });
    const token = drv.storage.tokens!.token;
    await uploadJpeg('/driver/documents/cnh', token);
    await uploadJpeg('/driver/documents/selfie', token);
    const v = await api.driver.addVehicle({ plate: `EEE${Math.floor(Math.random() * 9)}A${Math.floor(Math.random() * 90 + 10)}`, brand: 'Chevrolet', model: 'Onix', color: 'Prata', year: 2023, category: 'Economy' });
    await uploadJpeg(`/driver/vehicles/${v.id}/crlv`, token);
    await api.driver.setPix('CPF', CPF);

    // Trocar a chave sem senha é recusado com código de recuperação.
    const swap = await api.driver.setPix('Email', 'outra@exemplo.com').catch((e) => e);
    expect(swap).toBeInstanceOf(ApiError);
    expect((swap as ApiError).code).toBe('password_required');

    const submitted = await api.driver.submit();
    expect(submitted.status).toBe('InReview');
    expect(Object.values(submitted.checklist).every(Boolean)).toBe(true);

    const blocked = await api.driver.online().catch((e) => e);
    expect((blocked as ApiError).code).toBe('driver_not_approved');

    approveDriver(drvId);
    await api.driver.online();
    await api.driver.location({ lat: base.lat + 0.004, lng: base.lng + 0.004, heading: 90, speed: 5, accuracy: 8 });
    expect((await api.me.get()).driver?.isOnline).toBe(true);
    await drv.connect();
    // Posição pelo socket (caminho do app em primeiro plano).
    expect((await drv.emitWithAck('driver:location', { lat: base.lat + 0.004, lng: base.lng + 0.004 })).ok).toBe(true);
  });

  it('pedir corrida com padrões (pagamento sem toques) e conduzir até o fim', async () => {
    await pax.connect();
    const methods = await pax.api.payments.list();
    expect(methods.methods.find((m) => m.isDefault)?.type).toBe('Pix'); // sem cartão: Pix automático

    const quote = await pax.api.rides.quote({ ...base, address: 'Rua das Flores, 100' }, dest);
    expect(quote.prices.length).toBeGreaterThan(0);
    const ride = await pax.api.rides.request({ quoteId: quote.id, category: quote.prices[0]!.category });
    expect(ride.status).toBe('Searching');
    expect(ride.actions).toEqual(['cancel']);

    const offer = await drv.waitFor<Offer>('ride:offer', (o) => o?.rideId === ride.id);
    expect(offer.driverEarning).toBeGreaterThan(0);
    expect((await drv.api.driver.currentOffer())?.offerId).toBe(offer.offerId);

    const accepted = await drv.api.driver.accept(offer.offerId);
    expect(accepted.role).toBe('driver');
    expect(accepted.actions).toEqual(['arrived', 'cancel', 'safety']);
    const paxView = await pax.waitFor<Ride>('ride:update', (r) => r.id === ride.id && r.status === 'DriverAssigned');
    expect(paxView.actions).toEqual(['cancel', 'share', 'safety']);
    expect(paxView.driver?.vehicle?.model).toBe('Onix');
    expect(JSON.stringify(paxView)).not.toContain('67999990002'); // telefone nunca exposto

    // Passageiro acompanha o motorista (RF06).
    await drv.emitWithAck('driver:location', { lat: base.lat + 0.002, lng: base.lng + 0.002, heading: 180 });
    const loc = await pax.waitFor<{ rideId: string; lat: number }>('driver:location', (l) => l.rideId === ride.id);
    expect(loc.lat).toBeCloseTo(base.lat + 0.002, 5);

    const share = await pax.api.rides.share(ride.id);
    expect(share.url).toMatch(/\/t\//);

    expect((await drv.api.rides.arrived(ride.id)).actions[0]).toBe('start');
    expect((await drv.api.rides.start(ride.id)).actions[0]).toBe('finish');
    const inProgress = await pax.waitFor<Ride>('ride:update', (r) => r.id === ride.id && r.status === 'InProgress');
    expect(inProgress.actions).not.toContain('cancel');
    const finished = await drv.api.rides.finish(ride.id);
    expect(finished.status).toBe('Completed');

    // Pix gerado sozinho ao finalizar; o app mostra QR e copia-e-cola.
    const due = await pax.waitFor<Ride>('ride:update', (r) => r.id === ride.id && r.payment.status === 'Pending' && !!r.payment.pix);
    expect(due.actions).toContain('pay');
    const active = await pax.api.rides.active();
    expect(active?.id).toBe(ride.id); // o app retoma a corrida pendente ao abrir

    // Banco confirma o Pix (webhook de desenvolvimento) → tempo real atualiza.
    const uuid = due.payment.pix!.copyPaste.slice(32, 68); // mock: "…PIX0136" + id da cobrança
    const hook = await fetch(`${API_URL}/api/v1/payments/webhook/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: `mockpix_${uuid}` }),
    });
    expect(hook.status).toBe(200);
    const paid = await pax.waitFor<Ride>('ride:update', (r) => r.id === ride.id && r.payment.status === 'Paid');
    expect(paid.actions).toEqual(['rate']);
    // "Já paguei" depois de pago: idempotente, sem nova cobrança.
    expect((await pax.api.rides.pay(ride.id)).payment.status).toBe('Paid');

    const rated = await pax.api.rides.rate(ride.id, 5, 'Ótimo!');
    expect(rated.actions).not.toContain('rate');
    await drv.api.rides.rate(ride.id, 5);

    const hist = await pax.api.rides.history('passenger');
    expect(hist.items[0]?.id).toBe(ride.id);
    const drvHist = await drv.api.rides.history('driver');
    expect(drvHist.items[0]?.driverEarning).toBeGreaterThan(0);
  });

  it('segurança, locais e erros com ação de recuperação', async () => {
    const contacts = await pax.api.me.addContact('Mãe', '(67) 99999-0003');
    expect(contacts).toHaveLength(1);
    const place = await pax.api.me.addPlace({ label: 'Casa', address: 'Rua das Flores, 100', lat: base.lat, lng: base.lng });
    const places = await pax.api.me.places();
    expect(places.saved.map((p) => p.id)).toContain(place.id);
    expect(places.recent[0]?.address).toBe(dest.address); // destino recente vira atalho

    const terms = await pax.api.me.recordingTerms();
    const on = await pax.api.me.setRecording(true, terms.consentVersion);
    expect(on.enabled).toBe(true);
    expect((await pax.api.me.get()).passenger?.recordingEnabled).toBe(true);

    const summary = await drv.api.driver.earningsSummary();
    expect(summary.today).toBeGreaterThan(0);
    const payout = await drv.api.driver.requestPayout(10).catch((e) => e);
    expect((payout as ApiError).code).toBe('email_not_verified');
    expect((payout as ApiError).message).not.toMatch(/\d{3}/);
  });

  it('virar motorista troca os tokens e exclusão de conta encerra a sessão', async () => {
    const res = await pax.api.driver.become();
    await pax.http.startSession(res);
    const me = await pax.api.me.get();
    expect(me.role).toBe('driver');
    expect(me.driver?.status).toBe('PendingDocuments');
    expect((await pax.api.driver.profile()).checklist.personalData).toBe(false);

    await pax.api.me.deleteAccount(PASSWORD);
    // Tokens antigos morrem junto com a conta: o cliente encerra a sessão local.
    const after = await pax.api.me.get().catch((e) => e);
    expect(after).toBeInstanceOf(ApiError);
    expect((after as ApiError).status).toBe(401);
    expect(pax.storage.tokens).toBeNull();
    expect(paxId).toBeTruthy();
  });
});
