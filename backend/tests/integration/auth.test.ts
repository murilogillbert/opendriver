import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, CPF, PASSWORD, startServer, type TestServer, uniqueEmail } from '../helpers.js';

/** API do hub rodando localmente com o MESMO JWT_SECRET (valida RF11). Opcional. */
const HUB_API = process.env.HUB_API_URL ?? 'http://127.0.0.1:5055/api/v1';

async function hubAvailable(): Promise<boolean> {
  try {
    const r = await fetch(HUB_API.replace(/\/api\/v1$/, '/health'));
    return r.ok;
  } catch {
    return false;
  }
}

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
});

describe('auth (RF01, RF02)', () => {
  it('cadastra passageiro e motorista, entra, renova e lê o perfil', async () => {
    const email = uniqueEmail('pass');
    const reg = await call(srv.url, 'POST', '/auth/register', {
      name: 'Ana Passageira',
      email: email.toUpperCase(),
      password: PASSWORD,
      phone: '(65) 99999-1234',
      cpf: '529.982.247-25',
      role: 'Passenger',
    });
    expect(reg.status).toBe(201);
    expect(reg.data.user.email).toBe(email);
    expect(reg.data.user.role).toBe('passenger');
    expect(reg.data.user.phone).toBe('65999991234');

    const dup = await call(srv.url, 'POST', '/auth/register', { name: 'Ana 2', email, password: PASSWORD, phone: '65999991234', role: 'Passenger' });
    expect(dup.status).toBe(409);
    expect(dup.code).toBe('email_taken');

    const bad = await call(srv.url, 'POST', '/auth/login', { email, password: 'errada123' });
    expect(bad.status).toBe(401);
    expect(bad.error).toBe('E-mail ou senha incorretos.');

    const login = await call(srv.url, 'POST', '/auth/login', { email, password: PASSWORD });
    expect(login.status).toBe(200);
    const me = await call(srv.url, 'GET', '/me', undefined, login.data.token);
    expect(me.data.passenger).toMatchObject({ useHubCashback: true, recordingEnabled: false });
    expect(me.data.driver).toBeNull();

    const refreshed = await call(srv.url, 'POST', '/auth/refresh', { refreshToken: login.data.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.data.token).toBeTruthy();

    const driver = await call(srv.url, 'POST', '/auth/register', {
      name: 'Bruno Motorista',
      email: uniqueEmail('drv'),
      password: PASSWORD,
      phone: '65988887777',
      cpf: CPF,
      role: 'Driver',
    });
    expect(driver.status).toBe(201);
    const dme = await call(srv.url, 'GET', '/me', undefined, driver.data.token);
    expect(dme.data.driver).toMatchObject({ status: 'PendingDocuments', isOnline: false, hasPixKey: false });
  });

  it('valida entrada com mensagens simples', async () => {
    const weak = await call(srv.url, 'POST', '/auth/register', { name: 'X Y Z', email: uniqueEmail('w'), password: 'abc', phone: '65999991234', role: 'Passenger' });
    expect(weak.status).toBe(400);
    expect(weak.error).toMatch(/8 caracteres/);
    const cpf = await call(srv.url, 'POST', '/auth/register', { name: 'X Y Z', email: uniqueEmail('c'), password: PASSWORD, phone: '65999991234', cpf: '111.111.111-11', role: 'Passenger' });
    expect(cpf.error).toBe('CPF inválido.');
    const noAuth = await call(srv.url, 'GET', '/me');
    expect(noAuth.status).toBe(401);
    expect(noAuth.error).not.toMatch(/HTTP|401/);
  });

  it('perfil, troca de senha e respostas genéricas de recuperação', async () => {
    const email = uniqueEmail('prof');
    const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Carla Silva', email, password: PASSWORD, phone: '65999990000', role: 'Passenger' });
    const t = reg.data.token;
    const upd = await call(srv.url, 'PUT', '/me/profile', { name: 'Carla S. Souza', phone: '(65) 98888-0000', cpf: CPF }, t);
    expect(upd.data).toMatchObject({ name: 'Carla S. Souza', phone: '65988880000', cpf: CPF });

    const wrong = await call(srv.url, 'PUT', '/me/password', { currentPassword: 'nada1234', newPassword: 'Nova12345' }, t);
    expect(wrong.code).toBe('wrong_password');
    expect((await call(srv.url, 'PUT', '/me/password', { currentPassword: PASSWORD, newPassword: 'Nova12345' }, t)).status).toBe(204);
    expect((await call(srv.url, 'POST', '/auth/login', { email, password: 'Nova12345' })).status).toBe(200);

    const f1 = await call(srv.url, 'POST', '/auth/forgot-password', { email });
    const f2 = await call(srv.url, 'POST', '/auth/forgot-password', { email: uniqueEmail('ninguem') });
    expect(f1.data.message).toBe(f2.data.message);
    const inv = await call(srv.url, 'POST', '/auth/reset-password', { token: 'x'.repeat(20), newPassword: 'Outra1234' });
    expect(inv.code).toBe('invalid_token');
  });

  it('exclui a conta anonimizando o usuário compartilhado', async () => {
    const email = uniqueEmail('del');
    const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Para Excluir', email, password: PASSWORD, phone: '65999990001', role: 'Passenger' });
    const wrong = await call(srv.url, 'POST', '/me/delete', { password: 'errada' }, reg.data.token);
    expect(wrong.code).toBe('wrong_password');
    expect((await call(srv.url, 'POST', '/me/delete', { password: PASSWORD }, reg.data.token)).status).toBe(204);
    expect((await call(srv.url, 'POST', '/auth/login', { email, password: PASSWORD })).status).toBe(401);
    // Tokens emitidos antes da exclusão deixam de valer (acesso e renovação).
    expect((await call(srv.url, 'GET', '/me', undefined, reg.data.token)).status).toBe(401);
    expect((await call(srv.url, 'POST', '/auth/refresh', { refreshToken: reg.data.refreshToken })).status).toBe(401);
    const db = new PrismaClient();
    const row = await db.user.findUnique({ where: { id: reg.data.user.id } });
    await db.$disconnect();
    expect(row!.name).toBe('Conta excluída');
    expect(row!.email).not.toBe(email);
    expect(row!.cpf).toBeNull();
  });
});

describe('autenticação compartilhada com o hub (RF11)', () => {
  it('token do OpenDriver vale no hub e token do hub vale no OpenDriver', async () => {
    if (!(await hubAvailable())) {
      console.warn(`Hub não disponível em ${HUB_API} — teste de interoperabilidade pulado.`);
      return;
    }
    const email = uniqueEmail('sso');
    const reg = await call(srv.url, 'POST', '/auth/register', { name: 'Dora SSO', email, password: PASSWORD, phone: '65999990002', role: 'Passenger' });

    // Token do OpenDriver → API do hub
    const hubMe = await fetch(`${HUB_API}/auth/me`, { headers: { Authorization: `Bearer ${reg.data.token}` } });
    expect(hubMe.status).toBe(200);
    expect((await hubMe.json()).data.email).toBe(email);

    // Login no hub com a senha criada aqui (mesmo bcrypt) → token do hub no OpenDriver
    const hubLogin = await fetch(`${HUB_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(hubLogin.status).toBe(200);
    const hubTokens = (await hubLogin.json()).data;
    const odMe = await call(srv.url, 'GET', '/me', undefined, hubTokens.token);
    expect(odMe.status).toBe(200);
    expect(odMe.data.email).toBe(email);

    // Refresh token do hub renova aqui (mesmo formato HMAC)
    const r = await call(srv.url, 'POST', '/auth/refresh', { refreshToken: hubTokens.refreshToken });
    expect(r.status).toBe(200);
  });
});

describe('páginas legais (lojas)', () => {
  it('privacidade e termos são públicos, em HTML e com a exclusão de conta descrita', async () => {
    const priv = await fetch(`${srv.url}/legal/privacidade`);
    expect(priv.status).toBe(200);
    expect(priv.headers.get('content-type')).toMatch(/text\/html/);
    const html = await priv.text();
    expect(html).toContain('Excluir minha conta');
    expect(html).toContain('30 dias');
    expect((await fetch(`${srv.url}/legal/termos`)).status).toBe(200);
  });
});
