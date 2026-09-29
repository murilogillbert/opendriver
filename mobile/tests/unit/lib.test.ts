import { formatCurrency, formatDistance, formatDuration, formatPhone } from '@/lib/format';
import { boundsOf, decodePolyline } from '@/lib/geo';
import { brDateToIso, isoToBrDate, maskDate, maskPlate, parseMoney } from '@/lib/masks';
import { can, isActive, liveRoutePhase, passengerHeadline } from '@/lib/ride';
import { isCpf, isEmail, isPhone, passwordProblem } from '@/lib/validation';
import type { Ride } from '@/api/types';

describe('geo', () => {
  it('decodifica a polilinha de referência do Google', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(pts[2]).toEqual({ lat: 43.252, lng: -126.453 });
  });

  it('polilinha truncada não gera NaN', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulL');
    expect(pts.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
    expect(pts).toHaveLength(1);
  });

  it('bounds de um ponto só abre uma janela mínima', () => {
    const b = boundsOf([{ lat: -15.6, lng: -56.1 }])!;
    expect(b[2] - b[0]).toBeGreaterThan(0.002);
    expect(b[3] - b[1]).toBeGreaterThan(0.002);
    expect(boundsOf([])).toBeNull();
  });
});

describe('máscaras e datas', () => {
  it('placa Mercosul e antiga', () => {
    expect(maskPlate('abc1d23')).toBe('ABC1D23');
    expect(maskPlate('abc1234')).toBe('ABC-1234');
    expect(maskPlate('ab-c 1d2 3x')).toBe('ABC1D23');
  });

  it('datas BR ⇄ ISO sem deslocar o dia', () => {
    expect(maskDate('15061990')).toBe('15/06/1990');
    expect(brDateToIso('15/06/1990')).toBe('1990-06-15');
    expect(brDateToIso('31/02/2020')).toBeNull();
    expect(isoToBrDate('1990-06-15T00:00:00.000Z')).toBe('15/06/1990');
  });

  it('dinheiro digitado', () => {
    expect(parseMoney('12,50')).toBe(12.5);
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(Number.isNaN(parseMoney('abc'))).toBe(true);
  });
});

describe('validação', () => {
  it('CPF, e-mail, telefone e senha', () => {
    expect(isCpf('529.982.247-25')).toBe(true);
    expect(isCpf('111.111.111-11')).toBe(false);
    expect(isCpf('529.982.247-24')).toBe(false);
    expect(isEmail('a@b.com')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isPhone('(65) 99999-1234')).toBe(true);
    expect(isPhone('9999-1234')).toBe(false);
    expect(passwordProblem('Senha1234')).toBeNull();
    expect(passwordProblem('senhasemnumero')).toMatch(/número/);
  });
});

describe('formatação', () => {
  it('distância, duração, moeda e telefone', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12345)).toBe('12,3 km');
    expect(formatDuration(30)).toBe('1 min');
    expect(formatDuration(4000)).toBe('1 h 7 min');
    expect(formatCurrency(1234.5)).toBe('R$ 1.234,50');
    expect(formatPhone('65999991234')).toBe('(65) 99999-1234');
  });
});

describe('corrida', () => {
  const base = { status: 'DriverAssigned', actions: ['cancel', 'share', 'safety'] } as unknown as Ride;
  it('ações vêm da API; o app só consulta', () => {
    expect(can(base, 'cancel')).toBe(true);
    expect(can(base, 'pay')).toBe(false);
    expect(isActive(base)).toBe(true);
    expect(isActive({ ...base, status: 'Completed' })).toBe(false);
    expect(passengerHeadline({ ...base, status: 'DriverArrived' })).toBe('Seu motorista chegou');
  });
  it('trajeto do carro: até o embarque, depois até o destino, nunca fora da corrida', () => {
    expect(liveRoutePhase({ status: 'DriverAssigned' })).toBe('pickup');
    expect(liveRoutePhase({ status: 'DriverArrived' })).toBe('pickup');
    expect(liveRoutePhase({ status: 'InProgress' })).toBe('dropoff');
    for (const status of ['Searching', 'Completed', 'Cancelled', 'NoDrivers'] as const) expect(liveRoutePhase({ status })).toBeNull();
    expect(liveRoutePhase(null)).toBeNull();
  });
});
