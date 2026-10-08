import { describe, expect, it } from 'vitest';
import {
  canonizarMarca,
  decidirCategoria,
  escolherCategoria,
  lerCsvDeCategorias,
  normalizarTexto,
  posicaoDaCategoria,
  separarMarcaModelo,
  type RegraDeCategoria,
} from '../../src/domain/vehicleCategory.js';

const regra = (r: Partial<RegraDeCategoria> & { brand: string; modelPattern: string; category: 'Economy' | 'Comfort' }): RegraDeCategoria => ({
  yearFrom: null,
  yearTo: null,
  priority: 100,
  active: true,
  ...r,
});

describe('normalizarTexto', () => {
  it('tira acento, pontuacao e caixa', () => {
    expect(normalizarTexto('Citroën C3 1.6')).toBe('CITROEN C3 1 6');
    expect(normalizarTexto('  VW/GOL   ')).toBe('VW GOL');
  });

  it('trata nulo e vazio sem lancar', () => {
    expect(normalizarTexto(null)).toBe('');
    expect(normalizarTexto(undefined)).toBe('');
    expect(normalizarTexto('   ')).toBe('');
  });
});

describe('separarMarcaModelo', () => {
  it('usa marca e modelo separados quando o servico os devolve assim (DF Mobile)', () => {
    expect(separarMarcaModelo({ marca: 'Chevrolet', modelo: 'Onix 1.0 LT' })).toEqual({
      brand: 'CHEVROLET',
      model: 'ONIX 1 0 LT',
    });
  });

  it('separa pela barra quando vem num campo so (MT e MS)', () => {
    expect(separarMarcaModelo({ marcaModelo: 'CHEVROLET/ONIX 1.0 LT' })).toEqual({
      brand: 'CHEVROLET',
      model: 'ONIX 1 0 LT',
    });
  });

  it('sem barra, assume que a primeira palavra e a marca', () => {
    // Devolver vazio aqui faria a regra nunca casar, que e pior que casar pela marca.
    expect(separarMarcaModelo({ marcaModelo: 'FIAT MOBI LIKE' })).toEqual({
      brand: 'FIAT',
      model: 'MOBI LIKE',
    });
  });

  it('uma palavra so vira marca sem modelo', () => {
    expect(separarMarcaModelo({ marcaModelo: 'FIAT' })).toEqual({ brand: 'FIAT', model: '' });
  });

  it('entrada vazia devolve vazio', () => {
    expect(separarMarcaModelo({})).toEqual({ brand: '', model: '' });
  });
});

describe('escolherCategoria', () => {
  const regras = [
    regra({ brand: 'CHEVROLET', modelPattern: 'ONIX', category: 'Economy' }),
    regra({ brand: 'CHEVROLET', modelPattern: 'ONIX PLUS', category: 'Comfort', priority: 100 }),
    regra({ brand: 'TOYOTA', modelPattern: 'COROLLA', category: 'Comfort' }),
    regra({ brand: 'TOYOTA', modelPattern: 'COROLLA CROSS', category: 'Comfort', priority: 50 }),
    regra({ brand: 'FIAT', modelPattern: '', category: 'Economy', priority: 900 }),
  ];

  it('casa por prefixo, porque o Detran devolve o modelo com versao', () => {
    const r = escolherCategoria(regras, { brand: 'Chevrolet', model: 'ONIX 1.0 LT', year: 2022 });
    expect(r?.category).toBe('Economy');
  });

  it('regra mais especifica ganha da generica com a mesma prioridade', () => {
    const r = escolherCategoria(regras, { brand: 'CHEVROLET', model: 'ONIX PLUS 1.0 LTZ', year: 2023 });
    expect(r?.category).toBe('Comfort');
    expect(r?.regra.modelPattern).toBe('ONIX PLUS');
  });

  it('prioridade menor ganha mesmo com padrao mais curto', () => {
    const r = escolherCategoria(regras, { brand: 'TOYOTA', model: 'COROLLA CROSS XRE', year: 2024 });
    expect(r?.regra.priority).toBe(50);
  });

  it('padrao vazio cobre a marca inteira', () => {
    const r = escolherCategoria(regras, { brand: 'FIAT', model: 'ARGO DRIVE', year: 2021 });
    expect(r?.category).toBe('Economy');
  });

  it('devolve nulo quando nenhuma regra casa', () => {
    // Nulo e resposta legitima: sem regra, a declaracao do motorista permanece. Inventar
    // categoria aqui reclassificaria frota a partir de nada.
    expect(escolherCategoria(regras, { brand: 'BYD', model: 'DOLPHIN', year: 2024 })).toBeNull();
  });

  it('ignora regra inativa', () => {
    const so = [regra({ brand: 'HONDA', modelPattern: 'CIVIC', category: 'Comfort', active: false })];
    expect(escolherCategoria(so, { brand: 'HONDA', model: 'CIVIC EXL', year: 2020 })).toBeNull();
  });

  it('respeita faixa de ano', () => {
    const faixa = [
      regra({ brand: 'VW', modelPattern: 'GOL', category: 'Economy', yearTo: 2015 }),
      regra({ brand: 'VW', modelPattern: 'GOL', category: 'Comfort', yearFrom: 2016 }),
    ];
    expect(escolherCategoria(faixa, { brand: 'VW', model: 'GOL 1.0', year: 2014 })?.category).toBe('Economy');
    expect(escolherCategoria(faixa, { brand: 'VW', model: 'GOL 1.0', year: 2020 })?.category).toBe('Comfort');
  });

  it('nao aplica regra com faixa de ano quando o ano e desconhecido', () => {
    // Aplicar seria adivinhar: a faixa existe justamente porque o ano muda a resposta.
    const faixa = [regra({ brand: 'VW', modelPattern: 'GOL', category: 'Comfort', yearFrom: 2016 })];
    expect(escolherCategoria(faixa, { brand: 'VW', model: 'GOL', year: null })).toBeNull();
  });

  it('faixa mais estreita ganha de regra sem faixa', () => {
    const mix = [
      regra({ brand: 'VW', modelPattern: 'GOL', category: 'Economy' }),
      regra({ brand: 'VW', modelPattern: 'GOL', category: 'Comfort', yearFrom: 2020, yearTo: 2024 }),
    ];
    expect(escolherCategoria(mix, { brand: 'VW', model: 'GOL', year: 2022 })?.category).toBe('Comfort');
  });

  it('veiculo sem marca nem modelo devolve nulo', () => {
    expect(escolherCategoria(regras, { brand: '', model: '', year: 2020 })).toBeNull();
  });
});

describe('decidirCategoria', () => {
  it('sem regra, vale a declaracao do motorista', () => {
    expect(
      decidirCategoria({ declarada: 'Comfort', calculada: null, fonteAtual: 'driver', categoriaAtual: 'Comfort' })
    ).toEqual({ category: 'Comfort', source: 'driver', categoryAuto: null, divergence: false });
  });

  it('regra concordando com a declaracao marca a fonte como automatica', () => {
    expect(
      decidirCategoria({ declarada: 'Economy', calculada: 'Economy', fonteAtual: 'driver', categoriaAtual: 'Economy' })
    ).toEqual({ category: 'Economy', source: 'auto', categoryAuto: 'Economy', divergence: false });
  });

  it('na divergencia vale a MENOR categoria, e a divergencia fica registrada', () => {
    // O motorista declarou Conforto e a regra diz Economico: cobrar Conforto seria cobrar
    // mais caro por um carro que a regra nao reconhece como tal.
    const d = decidirCategoria({
      declarada: 'Comfort',
      calculada: 'Economy',
      fonteAtual: 'driver',
      categoriaAtual: 'Comfort',
    });
    expect(d.category).toBe('Economy');
    expect(d.categoryAuto).toBe('Economy');
    expect(d.divergence).toBe(true);
  });

  it('declarou Economico e a regra diz Conforto: continua Economico', () => {
    // A menor vence nos dois sentidos. O passageiro nunca paga Conforto por decisao
    // automatica contra a declaracao de quem dirige.
    const d = decidirCategoria({
      declarada: 'Economy',
      calculada: 'Comfort',
      fonteAtual: 'driver',
      categoriaAtual: 'Economy',
    });
    expect(d.category).toBe('Economy');
    expect(d.categoryAuto).toBe('Comfort');
    expect(d.divergence).toBe(true);
  });

  it('decisao de operador tem precedencia e nao e desfeita por revalidacao', () => {
    const d = decidirCategoria({
      declarada: 'Economy',
      calculada: 'Economy',
      fonteAtual: 'admin',
      categoriaAtual: 'Comfort',
    });
    expect(d.category).toBe('Comfort');
    expect(d.source).toBe('admin');
    expect(d.divergence).toBe(true);
  });
});

describe('posicaoDaCategoria', () => {
  it('Economico vem antes de Conforto', () => {
    expect(posicaoDaCategoria('Economy')).toBeLessThan(posicaoDaCategoria('Comfort'));
  });

  it('falha alto para categoria sem ordem definida', () => {
    // Silenciar isso faria uma categoria nova no enum comparar como zero e ganhar toda
    // divergencia sem ninguem perceber.
    expect(() => posicaoDaCategoria('Luxo' as never)).toThrow(/sem ordem definida/);
  });
});

describe('canonizarMarca', () => {
  it('traduz o codigo do Renavam para o nome da marca', () => {
    expect(canonizarMarca('VW')).toBe('VOLKSWAGEN');
    expect(canonizarMarca('gm')).toBe('CHEVROLET');
    expect(canonizarMarca('MMC')).toBe('MITSUBISHI');
    expect(canonizarMarca('M BENZ')).toBe('MERCEDES BENZ');
  });

  it('deixa passar marca que ja e o nome', () => {
    expect(canonizarMarca('Fiat')).toBe('FIAT');
    expect(canonizarMarca('Citroën')).toBe('CITROEN');
  });

  it('e idempotente, porque e aplicada na escrita e na leitura', () => {
    expect(canonizarMarca(canonizarMarca('VW'))).toBe('VOLKSWAGEN');
  });
});

describe('separarMarcaModelo com dado real do Detran', () => {
  it('descarta o marcador de importado antes de procurar a barra', () => {
    // Sem isso a marca viraria "I" e nenhuma regra casaria.
    expect(separarMarcaModelo({ marcaModelo: 'I/HYUNDAI HB20 1.0' })).toEqual({
      brand: 'HYUNDAI',
      model: 'HB20 1 0',
    });
  });

  it('descarta marcador de importado seguido de codigo de marca', () => {
    expect(separarMarcaModelo({ marcaModelo: 'I/VW/GOLF 1.4 TSI' })).toEqual({
      brand: 'VOLKSWAGEN',
      model: 'GOLF 1 4 TSI',
    });
  });

  it('traduz o codigo de marca vindo antes da barra', () => {
    expect(separarMarcaModelo({ marcaModelo: 'GM/ONIX 1.0 LT' })).toEqual({
      brand: 'CHEVROLET',
      model: 'ONIX 1 0 LT',
    });
  });

  it('nao corta apelido de duas palavras no primeiro espaco', () => {
    // "M BENZ C180" cortado no primeiro espaco daria marca "M".
    expect(separarMarcaModelo({ marcaModelo: 'M BENZ C180 CGI' })).toEqual({
      brand: 'MERCEDES BENZ',
      model: 'C180 CGI',
    });
  });

  it('traduz tambem quando marca e modelo vem separados (DF Mobile)', () => {
    expect(separarMarcaModelo({ marca: 'VW', modelo: 'Polo Track' })).toEqual({
      brand: 'VOLKSWAGEN',
      model: 'POLO TRACK',
    });
  });
});

describe('escolherCategoria com as marcas da semente', () => {
  const semente: RegraDeCategoria[] = [
    regra({ brand: 'VOLKSWAGEN', modelPattern: 'GOL', category: 'Economy' }),
    regra({ brand: 'VOLKSWAGEN', modelPattern: 'GOLF', category: 'Comfort' }),
    regra({ brand: 'CITROEN', modelPattern: 'C3', category: 'Economy' }),
    regra({ brand: 'CITROEN', modelPattern: 'C3 AIRCROSS', category: 'Comfort', priority: 50 }),
  ];

  it('GOLF nao e classificado pela regra do GOL, porque o padrao mais longo ganha', () => {
    expect(escolherCategoria(semente, { brand: 'VW', model: 'GOLF 1.4 TSI', year: 2020 })?.category).toBe('Comfort');
    expect(escolherCategoria(semente, { brand: 'VW', model: 'GOL 1.0', year: 2020 })?.category).toBe('Economy');
  });

  it('C3 AIRCROSS ganha da regra do C3 pela prioridade', () => {
    expect(escolherCategoria(semente, { brand: 'CITROEN', model: 'C3 AIRCROSS FEEL', year: 2024 })?.category).toBe('Comfort');
    expect(escolherCategoria(semente, { brand: 'CITROEN', model: 'C3 LIVE 1.0', year: 2024 })?.category).toBe('Economy');
  });

  it('casa com a regra mesmo quando o Detran manda o codigo da marca', () => {
    // A regra esta gravada como VOLKSWAGEN e a consulta devolveu VW.
    expect(escolherCategoria(semente, { brand: 'VW', model: 'GOL', year: 2019 })?.category).toBe('Economy');
  });
});

describe('lerCsvDeCategorias', () => {
  it('le o formato de colunas e normaliza marca e modelo', () => {
    const { linhas, erros } = lerCsvDeCategorias('Fiat;Argo;;;Economico;100');
    expect(erros).toEqual([]);
    expect(linhas).toEqual([
      { linha: 1, brand: 'FIAT', modelPattern: 'ARGO', yearFrom: null, yearTo: null, category: 'Economy', priority: 100 },
    ]);
  });

  it('aceita virgula e ponto e virgula, porque o Excel em portugues salva com ponto e virgula', () => {
    const comVirgula = lerCsvDeCategorias('Fiat,Argo,,,Economy,100');
    const comPontoEVirgula = lerCsvDeCategorias('Fiat;Argo;;;Economy;100');
    expect(comVirgula.linhas[0]).toEqual(comPontoEVirgula.linhas[0]);
  });

  it('reconhece o cabecalho pelo conteudo e nao pela posicao', () => {
    const { linhas } = lerCsvDeCategorias('marca;modelo;ano_de;ano_ate;categoria;prioridade\nFiat;Mobi;;;Economico;100');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.modelPattern).toBe('MOBI');
  });

  it('modelo vazio e regra da marca inteira, nao erro', () => {
    const { linhas, erros } = lerCsvDeCategorias('BMW;;;;Conforto;10');
    expect(erros).toEqual([]);
    expect(linhas[0]).toMatchObject({ brand: 'BMW', modelPattern: '', category: 'Comfort', priority: 10 });
  });

  it('canoniza a marca, para a planilha com apelido casar com o retorno do Detran', () => {
    expect(lerCsvDeCategorias('VW;Virtus;;;Conforto').linhas[0]!.brand).toBe('VOLKSWAGEN');
  });

  it('aceita faixa de ano e prioridade padrao', () => {
    const { linhas } = lerCsvDeCategorias('Toyota;Corolla;2015;2020;Conforto');
    expect(linhas[0]).toMatchObject({ yearFrom: 2015, yearTo: 2020, priority: 100 });
  });

  it('importacao e parcial: devolve as linhas boas e os erros com o numero da linha', () => {
    const { linhas, erros } = lerCsvDeCategorias(
      ['Fiat;Argo;;;Economico', 'Fiat;Toro;;;Luxo', ';Argo;;;Economico', 'Toyota;Corolla;;;Conforto'].join('\n'),
    );
    expect(linhas.map((l) => l.modelPattern)).toEqual(['ARGO', 'COROLLA']);
    expect(erros.map((e) => e.linha)).toEqual([2, 3]);
    expect(erros[0]!.motivo).toContain('categoria');
    expect(erros[1]!.motivo).toContain('marca');
  });

  it('recusa ano fora da faixa plausivel e faixa invertida', () => {
    expect(lerCsvDeCategorias('Fiat;Argo;1800;;Economico').erros[0]!.motivo).toContain('1900');
    expect(lerCsvDeCategorias('Fiat;Argo;2020;2015;Economico').erros[0]!.motivo).toContain('maior');
  });

  it('ignora linha vazia e comentario', () => {
    const { linhas, erros } = lerCsvDeCategorias('# tabela de 2026\n\nFiat;Argo;;;Economico\n\n');
    expect(linhas).toHaveLength(1);
    expect(erros).toEqual([]);
  });

  it('le arquivo salvo no Windows, com CRLF', () => {
    const { linhas } = lerCsvDeCategorias('Fiat;Argo;;;Economico\r\nToyota;Corolla;;;Conforto\r\n');
    expect(linhas).toHaveLength(2);
  });
});
