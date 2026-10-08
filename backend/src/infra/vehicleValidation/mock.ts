import { canonizarMarca, normalizarTexto } from '../../domain/vehicleCategory.js';
import type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';

/**
 * Provedor determinístico para dev/testes — nunca chama serviço externo.
 * Decide pelo último dígito do RENAVAM, para dar resultados prevísiveis:
 *   0-6 → aprova automaticamente (dados batem)
 *   7-8 → cai em revisão manual (simula divergência de dados)
 *   9   → rejeitada (simula restrição encontrada no Detran)
 *
 * Devolve `detran` **ecoando o que o motorista cadastrou**, e não um valor fixo. Dois
 * motivos: a classificação por regra passa a ser exercitável em desenvolvimento sem gastar
 * consulta paga, e o eco deixa explícito que o mock não descobre nada — ele confirma o que
 * já foi digitado. Um mock que inventasse marca e modelo faria a tabela de categorias
 * parecer testada quando não está.
 */
export const mockVehicleValidation: VehicleValidationProvider = {
  name: 'mock',
  async validate(input: VehicleValidationInput): Promise<VehicleValidationOutput> {
    const detran = {
      // Canoniza como o provedor real canoniza: o motorista pode digitar "VW".
      brand: canonizarMarca(input.registered.brand),
      model: normalizarTexto(input.registered.model),
      year: input.registered.year || null,
    };
    const lastDigit = Number(input.renavam.slice(-1));
    if (lastDigit === 9) {
      return { result: 'rejected', matched: false, detail: { simulated: true, reason: 'restricao_simulada' }, detran };
    }
    if (lastDigit >= 7) {
      return { result: 'needs_review', matched: false, detail: { simulated: true, reason: 'divergencia_simulada' }, detran };
    }
    return { result: 'approved', matched: true, detail: { simulated: true, plate: input.plate }, detran };
  },
};
