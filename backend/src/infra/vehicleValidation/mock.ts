import type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';

/**
 * Provedor determinístico para dev/testes — nunca chama serviço externo.
 * Decide pelo último dígito do RENAVAM, para dar resultados prevísiveis:
 *   0-6 → aprova automaticamente (dados batem)
 *   7-8 → cai em revisão manual (simula divergência de dados)
 *   9   → rejeitada (simula restrição encontrada no Detran)
 */
export const mockVehicleValidation: VehicleValidationProvider = {
  name: 'mock',
  async validate(input: VehicleValidationInput): Promise<VehicleValidationOutput> {
    const lastDigit = Number(input.renavam.slice(-1));
    if (lastDigit === 9) {
      return { result: 'rejected', matched: false, detail: { simulated: true, reason: 'restricao_simulada' } };
    }
    if (lastDigit >= 7) {
      return { result: 'needs_review', matched: false, detail: { simulated: true, reason: 'divergencia_simulada' } };
    }
    return { result: 'approved', matched: true, detail: { simulated: true, plate: input.plate } };
  },
};
