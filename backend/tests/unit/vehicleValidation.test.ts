import { describe, expect, it } from 'vitest';
import { mockVehicleValidation } from '../../src/infra/vehicleValidation/mock.js';

const input = (renavam: string) => ({
  plate: 'ABC1D23',
  renavam,
  uf: 'MT',
  registered: { brand: 'Chevrolet', model: 'Onix', year: 2022 },
});

describe('validação de CRLV — provedor mock (plano §4)', () => {
  it('último dígito 0-6 aprova automaticamente', async () => {
    const r = await mockVehicleValidation.validate(input('1234567890'));
    expect(r.result).toBe('approved');
    expect(r.matched).toBe(true);
  });

  it('último dígito 7-8 cai em revisão manual', async () => {
    const r = await mockVehicleValidation.validate(input('1234567897'));
    expect(r.result).toBe('needs_review');
    expect(r.matched).toBe(false);
  });

  it('último dígito 9 é rejeitada (restrição simulada)', async () => {
    const r = await mockVehicleValidation.validate(input('1234567899'));
    expect(r.result).toBe('rejected');
  });

  it('é determinístico — mesma entrada, mesmo resultado', async () => {
    const a = await mockVehicleValidation.validate(input('1234567890'));
    const b = await mockVehicleValidation.validate(input('1234567890'));
    expect(a).toEqual(b);
  });
});
