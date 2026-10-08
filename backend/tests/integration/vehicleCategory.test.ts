import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, PASSWORD, startServer, type TestServer, uniqueEmail } from '../helpers.js';
import { db } from '../rideKit.js';
import { isValidRenavam } from '../../src/domain/validators.js';
import { limparCacheDeRegras } from '../../src/modules/vehicles/validation.service.js';
import { limparCacheDeProvedores } from '../../src/infra/vehicleValidation/infosimples.js';

/**
 * Classificação automática de veículo, ponta a ponta.
 *
 * O que estes testes protegem, e por que:
 *
 *   - **A categoria deixou de ser escolha do motorista.** Era: `vehicleSchema` validava o
 *     enum e nada mais, então quem cadastrava escolhia a própria tarifa. Se a regra parar de
 *     ser aplicada no cadastro, o defeito volta sem fazer barulho — o veículo é criado, o
 *     cadastro funciona, e só a tarifa fica errada.
 *   - **A política de divergência.** Quando a declaração e a regra discordam, a menor vence.
 *     É decisão de produto, não detalhe: trocá-la sem querer passa a cobrar Conforto de quem
 *     declarou Econômico.
 *   - **A precedência do operador.** Reclassificar à mão tem de sobreviver a uma
 *     revalidação. Sem isso a correção dura até o próximo reprocessamento.
 *
 * O provedor é o `mock`, que **ecoa** marca, modelo e ano do cadastro. É o que torna isto
 * testável sem gastar consulta paga — e o eco é honesto: o mock não descobre nada, ele
 * confirma o que foi digitado, então o que está sendo exercitado aqui é a tabela de regras.
 *
 * O último dígito do RENAVAM governa o resultado no mock: 0-6 aprova, 7-8 revisão, 9 rejeita.
 */

let srv: TestServer;
let adminToken: string;
const criados: string[] = [];

/**
 * Placa única **entre execuções**, não só dentro de uma.
 *
 * Uma placa derivada só do contador colide com o que a execução anterior deixou no banco: a
 * API recusa placa já cadastrada por outro motorista, e o teste quebra na segunda rodada
 * parecendo defeito de produto. O contador entra junto para garantir unicidade dentro da
 * mesma execução, onde o sorteio poderia repetir.
 */
let seq = 0;
const letra = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
const placa = () => {
  seq += 1;
  return `${letra()}${letra()}${letra()}${Math.floor(Math.random() * 10)}${letra()}${String(seq % 100).padStart(2, '0')}`;
};

/**
 * RENAVAM válido cujo dígito verificador faz o mock **aprovar**.
 *
 * Os dois requisitos colidem e foi isso que derrubou a primeira versão destes testes: o
 * `vehicleSchema` exige o dígito verificador mod-11 correto, e o mock decide o resultado pelo
 * **último** dígito (0-6 aprova, 7-8 revisão, 9 rejeita) — que é exatamente o verificador.
 * Não dá para escolher os dois: o dígito tem de ser calculado da base, e só então se sabe
 * qual resultado ele produz. Daí a busca por uma base cujo verificador caia na faixa certa.
 *
 * O dígito é descoberto por `isValidRenavam` em vez de o algoritmo ser reimplementado aqui:
 * um teste que duplica a regra que pretende exercitar passa a concordar consigo mesmo.
 */
function renavamQueAprova(): string {
  for (let i = 0; i < 2000; i++) {
    const base = String((seq * 7919 + i * 13 + 1_000_000_000) % 10_000_000_000).padStart(10, '0');
    for (let dv = 0; dv <= 6; dv++) {
      const candidato = `${base}${dv}`;
      if (isValidRenavam(candidato)) return candidato;
    }
  }
  throw new Error('nao encontrei um RENAVAM valido que o mock aprove');
}

async function novoMotorista(): Promise<{ token: string; id: string }> {
  const email = uniqueEmail('cat');
  const reg = await call(srv.url, 'POST', '/auth/register', {
    name: 'Carla Categoria',
    email,
    password: PASSWORD,
    phone: '65999991111',
    cpf: '52998224725',
    role: 'Driver',
  });
  return { token: reg.data.token as string, id: reg.data.user.id as string };
}

async function cadastrarVeiculo(
  token: string,
  v: { brand: string; model: string; year: number; category?: 'Economy' | 'Comfort' },
) {
  const res = await call(
    srv.url,
    'POST',
    '/driver/vehicles',
    {
      plate: placa(),
      brand: v.brand,
      model: v.model,
      color: 'Prata',
      year: v.year,
      category: v.category ?? 'Economy',
      renavam: renavamQueAprova(),
      uf: 'MS',
    },
    token,
  );
  // Falhar aqui alto em vez de deixar o teste estourar num `undefined.category` três linhas
  // depois: o erro da API é a informação útil.
  if (res.status !== 201) {
    throw new Error(`cadastro de veiculo falhou (${res.status}): ${res.error ?? ''} [${res.code ?? ''}]`);
  }
  criados.push(res.data.id as string);
  return res;
}

beforeAll(async () => {
  process.env.VEHICLE_VALIDATION_PROVIDER = 'mock';
  srv = await startServer();
  const email = uniqueEmail('admincat');
  const reg = await call(srv.url, 'POST', '/auth/register', {
    name: 'Ana Admin',
    email,
    password: PASSWORD,
    phone: '65999992222',
    role: 'Passenger',
  });
  await db.user.update({ where: { id: reg.data.user.id }, data: { role: 'Admin' } });
  adminToken = (await call(srv.url, 'POST', '/auth/login', { email, password: PASSWORD })).data.token;
});

afterAll(async () => {
  // Desativa o que este arquivo criou: sem isso, cada execução deixa veículos divergentes
  // para trás e a fila de divergência vai crescendo com lixo de teste.
  if (criados.length) {
    await db.vehicle.updateMany({ where: { id: { in: criados } }, data: { active: false, categoryDivergence: false } });
  }
  await srv.close();
  await db.$disconnect();
});

describe('classificação automática de veículo', () => {
  it('a categoria vem da regra, não do que o motorista declarou', async () => {
    const { token } = await novoMotorista();
    // Corolla é Conforto na carga inicial. O motorista declara Econômico — e aqui a menor
    // vence, então continua Econômico, mas com a divergência registrada.
    const economicoDeclarado = await cadastrarVeiculo(token, { brand: 'Toyota', model: 'Corolla XEI', year: 2022, category: 'Economy' });
    expect(economicoDeclarado.status).toBe(201);
    expect(economicoDeclarado.data.category).toBe('Economy');
    expect(economicoDeclarado.data.categorySource).toBe('auto');

    const linha = await db.vehicle.findUnique({ where: { id: economicoDeclarado.data.id } });
    expect(linha).toMatchObject({
      category: 'Economy',
      categorySource: 'auto',
      categoryAuto: 'Comfort',
      categoryDivergence: true,
      detranBrand: 'TOYOTA',
    });
  });

  it('declarar Conforto num hatch econômico é corrigido para Econômico', async () => {
    const { token } = await novoMotorista();
    // Este é o caso que motivou a mudança: declarar Conforto num Mobi cobrava tarifa de
    // Conforto do passageiro.
    const v = await cadastrarVeiculo(token, { brand: 'Fiat', model: 'Mobi Like', year: 2021, category: 'Comfort' });
    expect(v.data.category).toBe('Economy');
    expect(v.data.categorySource).toBe('auto');

    const linha = await db.vehicle.findUnique({ where: { id: v.data.id } });
    expect(linha).toMatchObject({ categoryAuto: 'Economy', categoryDivergence: true });
  });

  it('regra e declaração concordando não gera divergência', async () => {
    const { token } = await novoMotorista();
    const v = await cadastrarVeiculo(token, { brand: 'Toyota', model: 'Corolla XEI', year: 2022, category: 'Comfort' });
    expect(v.data.category).toBe('Comfort');
    const linha = await db.vehicle.findUnique({ where: { id: v.data.id } });
    expect(linha).toMatchObject({ categorySource: 'auto', categoryAuto: 'Comfort', categoryDivergence: false });
  });

  it('modelo que nenhuma regra cobre mantém a declaração do motorista', async () => {
    const { token } = await novoMotorista();
    // Sem regra, `calcularCategoria` devolve nulo — e nulo significa "permanece o que foi
    // declarado", não "Econômico". Chutar aqui reclassificaria frota a partir de nada.
    const v = await cadastrarVeiculo(token, { brand: 'Fiat', model: 'Marea Turbo', year: 2019, category: 'Comfort' });
    expect(v.data.category).toBe('Comfort');
    expect(v.data.categorySource).toBe('driver');
    const linha = await db.vehicle.findUnique({ where: { id: v.data.id } });
    expect(linha).toMatchObject({ categoryAuto: null, categoryDivergence: false });
  });

  it('o código de marca do Detran casa com a regra (VW vira Volkswagen)', async () => {
    const { token } = await novoMotorista();
    // O Detran devolve `VW/GOL`, e a tabela está escrita como VOLKSWAGEN. Sem a tradução,
    // nenhuma regra casaria e tudo cairia na declaração do motorista — em silêncio.
    const v = await cadastrarVeiculo(token, { brand: 'VW', model: 'Virtus Highline', year: 2023, category: 'Economy' });
    const linha = await db.vehicle.findUnique({ where: { id: v.data.id } });
    expect(linha).toMatchObject({ detranBrand: 'VOLKSWAGEN', categoryAuto: 'Comfort' });
  });

  it('o prefixo curto não leva o modelo mais longo: GOL x GOLF', async () => {
    const { token } = await novoMotorista();
    const gol = await cadastrarVeiculo(token, { brand: 'VW', model: 'Gol 1.0', year: 2020, category: 'Economy' });
    const golf = await cadastrarVeiculo(token, { brand: 'VW', model: 'Golf 1.4 TSI', year: 2020, category: 'Comfort' });
    expect(gol.data.category).toBe('Economy');
    expect(golf.data.category).toBe('Comfort');
  });
});

describe('ferramentas do operador', () => {
  it('reclassificação manual tem precedência e sobrevive à revalidação', async () => {
    const { token } = await novoMotorista();
    const v = await cadastrarVeiculo(token, { brand: 'Fiat', model: 'Mobi Like', year: 2021, category: 'Economy' });
    const id = v.data.id as string;

    const semMotivo = await call(srv.url, 'PUT', `/admin/vehicles/${id}/category`, { category: 'Comfort' }, adminToken);
    expect(semMotivo.status).toBe(400);

    const fixado = await call(
      srv.url,
      'PUT',
      `/admin/vehicles/${id}/category`,
      { category: 'Comfort', reason: 'veiculo conferido no local, interior premium' },
      adminToken,
    );
    expect(fixado.status).toBe(200);
    expect(fixado.data.category).toBe('Comfort');
    expect(fixado.data.categorySource).toBe('admin');

    // Revalidar consulta o Detran de novo e a regra volta a dizer Econômico. A decisão do
    // operador precisa continuar valendo — se não continuasse, a correção duraria até o
    // próximo reprocessamento e ninguém saberia por quê.
    const revalidado = await call(srv.url, 'POST', `/admin/vehicles/${id}/revalidate`, {}, adminToken);
    expect(revalidado.status).toBe(200);
    expect(revalidado.data.category).toBe('Comfort');
    expect(revalidado.data.categorySource).toBe('admin');
    expect(revalidado.data.categoryAuto).toBe('Economy');
    expect(revalidado.data.categoryDivergence).toBe(true);

    const log = await db.auditLog.findFirst({
      where: { entityId: id, action: 'opendriver.vehicle.reclassify' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  });

  it('a fila de divergência lista o que precisa de olho humano', async () => {
    const fila = await call(srv.url, 'GET', '/admin/vehicles/divergences?page=1', undefined, adminToken);
    expect(fila.status).toBe(200);
    expect(fila.data.items.length).toBeGreaterThan(0);
    expect(fila.data.items[0]).toHaveProperty('categoryAuto');
    expect(fila.data.items.every((i: { categorySource: string }) => i.categorySource !== undefined)).toBe(true);
  });

  it('reclassificar em lote: simular não grava, aplicar grava', async () => {
    const { token } = await novoMotorista();
    const v = await cadastrarVeiculo(token, { brand: 'Toyota', model: 'Corolla XEI', year: 2022, category: 'Comfort' });
    const id = v.data.id as string;

    // Uma regra nova derruba o Corolla para Econômico. Reaplicar usa o retorno do Detran já
    // guardado: nenhuma consulta nova, nenhum custo.
    const regra = await call(
      srv.url,
      'POST',
      '/admin/vehicle-categories',
      { brand: 'Toyota', modelPattern: 'Corolla XEI', category: 'Economy', priority: 10, active: true },
      adminToken,
    );
    expect(regra.status).toBe(201);

    const ensaio = await call(srv.url, 'POST', '/admin/vehicles/reclassify-batch', { aplicar: false }, adminToken);
    expect(ensaio.status).toBe(200);
    expect(ensaio.data.alterados).toBeGreaterThan(0);
    // Ensaio não pode ter gravado nada.
    expect((await db.vehicle.findUnique({ where: { id } }))!.category).toBe('Comfort');

    const aplicado = await call(srv.url, 'POST', '/admin/vehicles/reclassify-batch', { aplicar: true }, adminToken);
    expect(aplicado.status).toBe(200);
    expect((await db.vehicle.findUnique({ where: { id } }))!.category).toBe('Economy');

    await call(srv.url, 'DELETE', `/admin/vehicle-categories/${regra.data.id}`, undefined, adminToken);
    limparCacheDeRegras();
  });

  it('CRUD de regra: normaliza a marca, recusa duplicata e faixa invertida', async () => {
    const criada = await call(
      srv.url,
      'POST',
      '/admin/vehicle-categories',
      { brand: ' citroën ', modelPattern: 'c4 lounge', category: 'Comfort', priority: 100, active: true },
      adminToken,
    );
    expect(criada.status).toBe(201);
    // Normalizada na escrita: sem acento, em maiúsculas. É o que permite casar com o retorno
    // do Detran, porque o Postgres não tira acento sem a extensão `unaccent`.
    expect(criada.data.brand).toBe('CITROEN');
    expect(criada.data.modelPattern).toBe('C4 LOUNGE');

    const duplicada = await call(
      srv.url,
      'POST',
      '/admin/vehicle-categories',
      { brand: 'CITROEN', modelPattern: 'C4 LOUNGE', category: 'Economy', priority: 100, active: true },
      adminToken,
    );
    expect(duplicada.status).toBe(409);
    expect(duplicada.code).toBe('regra_duplicada');

    const invertida = await call(
      srv.url,
      'PUT',
      `/admin/vehicle-categories/${criada.data.id}`,
      { brand: 'CITROEN', modelPattern: 'C4 LOUNGE', yearFrom: 2020, yearTo: 2015, category: 'Comfort', priority: 100, active: true },
      adminToken,
    );
    expect(invertida.status).toBe(400);
    expect(invertida.code).toBe('faixa_invalida');

    // "VW" tem de virar VOLKSWAGEN também na escrita, senão a regra nunca casa.
    const apelido = await call(
      srv.url,
      'POST',
      '/admin/vehicle-categories',
      { brand: 'vw', modelPattern: 'saveiro cross', category: 'Comfort', priority: 100, active: true },
      adminToken,
    );
    expect(apelido.data.brand).toBe('VOLKSWAGEN');

    expect((await call(srv.url, 'DELETE', `/admin/vehicle-categories/${criada.data.id}`, undefined, adminToken)).status).toBe(200);
    expect((await call(srv.url, 'DELETE', `/admin/vehicle-categories/${apelido.data.id}`, undefined, adminToken)).status).toBe(200);
    // Apagar deixa a regra inteira na auditoria — é a única cópia que sobra.
    const log = await db.auditLog.findFirst({
      where: { entityId: criada.data.id, action: 'opendriver.vehicle_category_rule.delete' },
    });
    expect(log?.payloadJson).toContain('C4 LOUNGE');
    limparCacheDeRegras();
  });

  it('importar CSV: ensaio não grava, importação é parcial e aponta a linha ruim', async () => {
    const csv = [
      'marca;modelo;ano_de;ano_ate;categoria;prioridade',
      'Chery;Tiggo 8;;;Conforto;100',
      'Chery;Arrizo 6;;;Luxo;100',
      'Chery;QQ3;;;Economico;100',
    ].join('\n');

    const ensaio = await call(srv.url, 'POST', '/admin/vehicle-categories/import', { csv, aplicar: false }, adminToken);
    expect(ensaio.status).toBe(200);
    expect(ensaio.data.aplicado).toBe(false);
    expect(ensaio.data.gravariam).toBe(2);
    expect(ensaio.data.erros).toHaveLength(1);
    expect(ensaio.data.erros[0].linha).toBe(3);

    const antes = await call(srv.url, 'GET', '/admin/vehicle-categories?brand=Chery', undefined, adminToken);

    const aplicado = await call(srv.url, 'POST', '/admin/vehicle-categories/import', { csv, aplicar: true }, adminToken);
    expect(aplicado.data.aplicado).toBe(true);
    expect(aplicado.data.gravadas).toBe(2);

    const depois = await call(srv.url, 'GET', '/admin/vehicle-categories?brand=Chery', undefined, adminToken);
    expect(depois.data.total).toBe(antes.data.total + 2);
    expect(depois.data.items.some((r: { modelPattern: string }) => r.modelPattern === 'TIGGO 8')).toBe(true);

    // `substituirImportadas` só apaga o que veio de CSV; a carga inicial e o que o operador
    // criou à mão continuam.
    const substituindo = await call(
      srv.url,
      'POST',
      '/admin/vehicle-categories/import',
      { csv: 'Chery;Tiggo 8;;;Conforto;100', aplicar: true, substituirImportadas: true },
      adminToken,
    );
    expect(substituindo.data.apagadas).toBe(2);
    const final = await call(srv.url, 'GET', '/admin/vehicle-categories?brand=Chery', undefined, adminToken);
    expect(final.data.items.some((r: { source: string }) => r.source === 'semente')).toBe(true);

    await db.vehicleModelCategory.deleteMany({ where: { source: 'importado' } });
    limparCacheDeRegras();
  });

  it('provedor de UF: lista a carga inicial, exige credencial completa e grava a edição', async () => {
    const lista = await call(srv.url, 'GET', '/admin/detran-providers', undefined, adminToken);
    expect(lista.status).toBe(200);
    expect(lista.data.map((p: { uf: string }) => p.uf).sort()).toEqual(['DF', 'GO', 'MS', 'MT']);
    // GO entra desativado de propósito: exige login do gov.br, que ainda não existe.
    expect(lista.data.find((p: { uf: string }) => p.uf === 'GO')).toMatchObject({ active: false, requiresLogin: true });

    const base = {
      label: 'Detran TO — Veículo',
      endpoint: 'https://api.infosimples.com/api/v2/consultas/detran/to/veiculo',
      requiresChassi: false,
      requiresLogin: true,
      requiresCpfCnpj: true,
      loginSettingKey: null,
      senhaSettingKey: null,
      active: true,
      notes: null,
    };
    // Exigir login sem dizer de onde vem a senha deixaria a UF ativa e quebrada em silêncio.
    const incompleto = await call(srv.url, 'PUT', '/admin/detran-providers/TO', base, adminToken);
    expect(incompleto.status).toBe(400);
    expect(incompleto.code).toBe('credencial_incompleta');

    const ok = await call(
      srv.url,
      'PUT',
      '/admin/detran-providers/to',
      { ...base, loginSettingKey: 'Infosimples:ToLoginCpf', senhaSettingKey: 'Infosimples:ToLoginSenha' },
      adminToken,
    );
    expect(ok.status).toBe(200);
    expect(ok.data.find((p: { uf: string }) => p.uf === 'TO')).toMatchObject({
      uf: 'TO',
      requiresCpfCnpj: true,
      loginSettingKey: 'Infosimples:ToLoginCpf',
    });

    const urlRuim = await call(srv.url, 'PUT', '/admin/detran-providers/TO', { ...base, endpoint: 'nao-e-url', loginSettingKey: 'a', senhaSettingKey: 'b' }, adminToken);
    expect(urlRuim.status).toBe(400);

    const removido = await call(srv.url, 'DELETE', '/admin/detran-providers/TO', undefined, adminToken);
    expect(removido.data.map((p: { uf: string }) => p.uf)).not.toContain('TO');
    limparCacheDeProvedores();
  });

  it('o botão de testar explica a falta do token em vez de devolver o erro cru da Infosimples', async () => {
    /**
     * Sem token, a Infosimples responde `601 Não foi possível se autenticar` — e esse erro é
     * indistinguível de endereço errado, que é justamente o que o botão existe para descobrir.
     * Então a falta de token é barrada antes da chamada, com texto que diz onde cadastrar.
     *
     * O teste **não** exige que a Infosimples seja o provedor ativo do cadastro: exigir isso
     * inverteria a ordem das coisas, porque é o resultado do teste que dá confiança para
     * ligar o provedor real.
     */
    const r = await call(
      srv.url,
      'POST',
      '/admin/detran-providers/MS/test',
      { plate: 'ABC1D23', renavam: '12345678901' },
      adminToken,
    );
    expect(r.status).toBe(409);
    expect(r.code).toBe('token_ausente');
    expect(r.error).toMatch(/Integra/);
  });

  it('nada disso é acessível sem o papel de Admin', async () => {
    const { token } = await novoMotorista();
    for (const [metodo, caminho] of [
      ['GET', '/admin/vehicles/divergences'],
      ['GET', '/admin/vehicle-categories'],
      ['GET', '/admin/detran-providers'],
      ['POST', '/admin/vehicles/reclassify-batch'],
    ] as const) {
      const r = await call(srv.url, metodo, caminho, metodo === 'POST' ? {} : undefined, token);
      expect(r.status, `${metodo} ${caminho}`).toBe(403);
    }
  });
});
