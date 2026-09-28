import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, CNH, CPF, PASSWORD, startServer, type TestServer, TINY_JPEG, uniqueEmail, upload } from '../helpers.js';

const db = new PrismaClient();
let srv: TestServer;
beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = '/tmp/od-test-storage';
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
  await db.$disconnect();
});

describe('motorista (RF12, RF13, RF14)', () => {
  it('passageiro vira motorista, completa o cadastro, é aprovado e fica online', async () => {
    const email = uniqueEmail('onb');
    const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Eva Motorista', email, password: PASSWORD, phone: '65999990003', cpf: CPF, role: 'Passenger' });
    let token = reg.data.token as string;

    // Passageiro não acessa a área do motorista
    expect((await call(srv.url, 'GET', '/driver/profile', undefined, token)).status).toBe(403);

    const become = await call(srv.url, 'POST', '/driver/become', {}, token);
    expect(become.data.user.role).toBe('driver');
    token = become.data.token;

    let prof = await call(srv.url, 'GET', '/driver/profile', undefined, token);
    expect(prof.data.status).toBe('PendingDocuments');
    expect(prof.data.checklist).toEqual({ personalData: false, cnhPhoto: false, selfie: false, vehicle: false, pixKey: false });

    // Online antes da aprovação: motivo claro
    const early = await call(srv.url, 'POST', '/driver/online', {}, token);
    expect(early.code).toBe('driver_not_approved');

    const incomplete = await call(srv.url, 'POST', '/driver/submit', {}, token);
    expect(incomplete.error).toMatch(/Falta enviar: dados da CNH, foto da CNH, selfie, veículo com CRLV/);

    const bad = await call(srv.url, 'PUT', '/driver/profile', { cnhNumber: '12345678901', cnhCategory: 'B', cnhExpiresAt: '2030-01-01', birthDate: '1990-01-01' }, token);
    expect(bad.error).toBe('Número da CNH inválido.');
    const young = await call(srv.url, 'PUT', '/driver/profile', { cnhNumber: CNH, cnhCategory: 'B', cnhExpiresAt: '2030-01-01', birthDate: '2010-01-01' }, token);
    expect(young.code).toBe('underage');
    const catA = await call(srv.url, 'PUT', '/driver/profile', { cnhNumber: CNH, cnhCategory: 'A', cnhExpiresAt: '2030-01-01', birthDate: '1990-01-01' }, token);
    expect(catA.error).toMatch(/categoria B/);
    prof = await call(srv.url, 'PUT', '/driver/profile', { cnhNumber: CNH, cnhCategory: 'ab', cnhExpiresAt: '2030-01-01', birthDate: '1990-05-10' }, token);
    expect(prof.data.checklist.personalData).toBe(true);

    const heic = await upload(srv.url, '/driver/documents/cnh', token, Buffer.from('000000186674797068656963000000000000', 'hex'), 'x.heic', 'image/heic');
    expect(heic.code).toBe('unsupported_file');
    expect((await upload(srv.url, '/driver/documents/cnh', token, TINY_JPEG)).status).toBe(200);
    prof = await upload(srv.url, '/driver/documents/selfie', token, TINY_JPEG);
    expect(prof.data.checklist).toMatchObject({ cnhPhoto: true, selfie: true });

    // Documento fica cifrado no storage (nunca em claro)
    const row = await db.driverProfile.findUnique({ where: { userId: reg.data.user.id } });
    const fs = await import('node:fs/promises');
    const stored = await fs.readFile(`/tmp/od-test-storage/${row!.cnhPhotoKey}`);
    expect(stored.includes(TINY_JPEG.subarray(0, 16))).toBe(false);

    const plate = `QAB${Math.floor(Math.random() * 10)}C${String(Math.floor(Math.random() * 90) + 10)}`;
    const old = await call(srv.url, 'POST', '/driver/vehicles', { plate, brand: 'Fiat', model: 'Uno', color: 'Branco', year: 2000 }, token);
    expect(old.code).toBe('vehicle_too_old');
    const veh = await call(srv.url, 'POST', '/driver/vehicles', { plate: plate.toLowerCase(), brand: 'Chevrolet', model: 'Onix', color: 'Prata', year: 2022 }, token);
    expect(veh.status).toBe(201);
    expect(veh.data.plate).toBe(plate);
    expect((await call(srv.url, 'POST', '/driver/vehicles', { plate, brand: 'Fiat', model: 'Argo', color: 'Azul', year: 2022 }, token)).code).toBe('plate_duplicate');
    await upload(srv.url, `/driver/vehicles/${veh.data.id}/crlv`, token, TINY_JPEG);

    const pixBad = await call(srv.url, 'PUT', '/driver/pix', { pixKeyType: 'CPF', pixKey: '123' }, token);
    expect(pixBad.code).toBe('invalid_pix');
    prof = await call(srv.url, 'PUT', '/driver/pix', { pixKeyType: 'Phone', pixKey: '(65) 99999-0003' }, token);
    expect(prof.data.pixKey).toBe('+5565999990003');

    const submitted = await call(srv.url, 'POST', '/driver/submit', {}, token);
    expect(submitted.data.status).toBe('InReview');
    expect(submitted.data.currentVehicleId).toBe(veh.data.id); // único veículo selecionado sozinho
    expect((await call(srv.url, 'POST', '/driver/online', {}, token)).error).toMatch(/em análise/);

    // Aprovação do admin (módulo admin testado à parte)
    await db.driverProfile.update({ where: { userId: reg.data.user.id }, data: { status: 'Approved' } });
    expect((await call(srv.url, 'POST', '/driver/online', {}, token)).code).toBe('vehicle_not_approved');
    await db.vehicle.update({ where: { id: veh.data.id }, data: { status: 'Approved' } });
    expect((await call(srv.url, 'POST', '/driver/online', {}, token)).data).toEqual({ isOnline: true });

    expect((await call(srv.url, 'POST', '/driver/location', { lat: -15.6, lng: -56.1, heading: 90, speed: 10 }, token)).status).toBe(204);
    expect((await call(srv.url, 'POST', '/driver/location', { lat: 0, lng: 0 }, token)).code).toBe('invalid_location');
    expect((await call(srv.url, 'PUT', `/driver/vehicles/${veh.data.id}/current`, {}, token)).code).toBe('online');
    expect((await call(srv.url, 'POST', '/driver/offline', {}, token)).data).toEqual({ isOnline: false });

    const sum = await call(srv.url, 'GET', '/driver/earnings/summary', undefined, token);
    expect(sum.data).toMatchObject({ today: 0, balance: 0, withdrawable: 0 });
    expect((await call(srv.url, 'POST', '/driver/payouts', { amount: 50 }, token)).code).toBe('email_not_verified');
  });
});
