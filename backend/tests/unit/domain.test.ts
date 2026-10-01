import { describe, expect, it } from 'vitest';
import { boundingBox, decodePolyline, encodePolyline, haversineMeters } from '../../src/domain/geo.js';
import { computeFare } from '../../src/domain/pricing.js';
import { ageOn, isValidCnh, isValidCpf, isValidRenavam, normalizePixKey, normalizePlate } from '../../src/domain/validators.js';
import { cancelReasonsFor } from '../../src/domain/cancelReasons.js';
import { COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_CODES } from '../../src/domain/complaintCategories.js';
import { acceptanceRate, cancellationRate } from '../../src/domain/driverQuality.js';
import { isImplausibleJump } from '../../src/domain/mockLocation.js';
import { DRIVER_QUICK_MESSAGE_CODES, PASSENGER_QUICK_MESSAGE_CODES, quickMessagesFor } from '../../src/domain/quickMessages.js';

describe('geo', () => {
  it('haversine ~ distância conhecida', () => {
    // Praça Alencastro (Cuiabá) → Shopping Pantanal ≈ 3,1 km em linha reta
    const d = haversineMeters({ lat: -15.5961, lng: -56.0967 }, { lat: -15.5754, lng: -56.0790 });
    expect(d).toBeGreaterThan(2900);
    expect(d).toBeLessThan(3200);
  });
  it('bounding box contém o raio', () => {
    const c = { lat: -15.6, lng: -56.1 };
    const b = boundingBox(c, 5);
    expect(haversineMeters(c, { lat: b.maxLat, lng: c.lng })).toBeCloseTo(5000, -2);
    expect(haversineMeters(c, { lat: c.lat, lng: b.maxLng })).toBeCloseTo(5000, -2);
  });
  it('polyline codifica e decodifica (exemplo oficial do algoritmo)', () => {
    const pts = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    const enc = encodePolyline(pts);
    expect(enc).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline(enc)).toEqual(pts);
  });
});

describe('preço (RF07)', () => {
  const rule = { baseFare: 4, perKm: 1.6, perMinute: 0.3, minimumFare: 8, platformFeePercent: 20 };
  it('base + km + minuto, com taxa da plataforma', () => {
    const f = computeFare(rule, 8400, 17 * 60);
    expect(f.distanceFare).toBe(13.44);
    expect(f.timeFare).toBe(5.1);
    expect(f.fare).toBe(22.54);
    expect(f.platformFee).toBe(4.51);
    expect(f.driverEarning).toBe(18.03);
    expect(f.platformFee + f.driverEarning).toBeCloseTo(f.fare, 10);
  });
  it('aplica tarifa mínima', () => {
    const f = computeFare(rule, 500, 120);
    expect(f.minimumApplied).toBe(true);
    expect(f.fare).toBe(8);
  });
});

describe('validadores', () => {
  it('CPF, CNH, placa, Pix, idade', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCnh('02650306461')).toBe(true);
    expect(isValidCnh('02650306462')).toBe(false);
    expect(isValidCnh('11111111111')).toBe(false);
    expect(normalizePlate('abc-1234')).toBe('ABC1234');
    expect(normalizePlate('BRA2E19')).toBe('BRA2E19');
    expect(normalizePlate('AB12345')).toBeNull();
    expect(normalizePixKey('529.982.247-25', 'CPF')).toBe('52998224725');
    expect(normalizePixKey('(65) 99999-1234', 'Phone')).toBe('+5565999991234');
    expect(normalizePixKey('X@Y.COM', 'Email')).toBe('x@y.com');
    expect(normalizePixKey('123e4567-e89b-12d3-a456-426614174000', 'Random')).toBeTruthy();
    expect(normalizePixKey('abc', 'Random')).toBeNull();
    expect(ageOn(new Date('2000-09-29'), new Date('2026-09-28'))).toBe(25);
    expect(ageOn(new Date('2000-09-28'), new Date('2026-09-28'))).toBe(26);
  });

  it('RENAVAM: dígito verificador mod-11 (plano §4)', () => {
    expect(isValidRenavam('12345678900')).toBe(true);
    expect(isValidRenavam('12345678901')).toBe(false); // dígito errado
    expect(isValidRenavam('11111111111')).toBe(false); // todos iguais
    expect(isValidRenavam('123')).toBe(false); // tamanho errado
    expect(isValidRenavam('123.456.789-00')).toBe(true); // ignora pontuação
  });
});

describe('motivos de cancelamento (plano §1.2)', () => {
  it('listas por papel não se misturam e sempre incluem "other"', () => {
    const passenger = cancelReasonsFor('passenger');
    const driver = cancelReasonsFor('driver');
    expect(passenger.some((r) => r.code === 'driver_too_far')).toBe(true);
    expect(driver.some((r) => r.code === 'driver_too_far')).toBe(false);
    expect(passenger.some((r) => r.code === 'other')).toBe(true);
    expect(driver.some((r) => r.code === 'other')).toBe(true);
  });
});

describe('categorias de reclamação (plano §3)', () => {
  it('lista fixa, com "other", e os códigos batem com os rótulos', () => {
    expect(COMPLAINT_CATEGORIES.some((c) => c.code === 'other')).toBe(true);
    expect(COMPLAINT_CATEGORY_CODES).toEqual(COMPLAINT_CATEGORIES.map((c) => c.code));
    expect(new Set(COMPLAINT_CATEGORY_CODES).size).toBe(COMPLAINT_CATEGORY_CODES.length);
  });
});

describe('antifraude de localização (plano §11.4)', () => {
  const a = { lat: -15.5961, lng: -56.0967 }; // Praça Alencastro
  const b = { lat: -15.5754, lng: -56.079 }; // Shopping Pantanal, ~3,1 km de a
  it('teleporte (distância grande, tempo curto) é implausível', () => {
    expect(isImplausibleJump(a.lat, a.lng, new Date('2026-01-01T12:00:00Z'), b.lat, b.lng, new Date('2026-01-01T12:00:02Z'))).toBe(true);
  });
  it('mesma distância num tempo plausível de carro não é flagrada', () => {
    expect(isImplausibleJump(a.lat, a.lng, new Date('2026-01-01T12:00:00Z'), b.lat, b.lng, new Date('2026-01-01T12:05:00Z'))).toBe(false);
  });
  it('deslocamento pequeno (jitter de GPS) nunca é flagrado, mesmo instantâneo', () => {
    expect(isImplausibleJump(a.lat, a.lng, new Date('2026-01-01T12:00:00Z'), a.lat + 0.0001, a.lng, new Date('2026-01-01T12:00:00Z'))).toBe(false);
  });
});

describe('chat mascarado: mensagens rápidas (plano §11.1)', () => {
  it('listas por papel não se misturam e não têm códigos duplicados', () => {
    expect(quickMessagesFor('passenger').map((m) => m.code)).toEqual(PASSENGER_QUICK_MESSAGE_CODES);
    expect(quickMessagesFor('driver').map((m) => m.code)).toEqual(DRIVER_QUICK_MESSAGE_CODES);
    const all = [...PASSENGER_QUICK_MESSAGE_CODES, ...DRIVER_QUICK_MESSAGE_CODES];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('métricas de qualidade do motorista (plano §11.6)', () => {
  it('null sem amostra suficiente, nunca 0 enganoso', () => {
    expect(acceptanceRate(0, 0)).toBeNull();
    expect(acceptanceRate(2, 2)).toBeNull();
    expect(cancellationRate(0, 0)).toBeNull();
    expect(cancellationRate(2, 0)).toBeNull();
  });
  it('percentual arredondado com amostra suficiente', () => {
    expect(acceptanceRate(10, 8)).toBe(80);
    expect(cancellationRate(10, 1)).toBe(10);
  });
});
