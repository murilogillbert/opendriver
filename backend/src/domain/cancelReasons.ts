/** Motivos de cancelamento por papel — fonte única; o app renderiza o que a API devolver (UX12). */
export const PASSENGER_CANCEL_REASONS = [
  { code: 'driver_too_far', label: 'Motorista está muito longe' },
  { code: 'driver_not_moving', label: 'Motorista não sai do lugar' },
  { code: 'wrong_pickup', label: 'Local de embarque errado' },
  { code: 'changed_plans', label: 'Mudei de ideia' },
  { code: 'found_another_ride', label: 'Consegui outra condução' },
  { code: 'wait_too_long', label: 'Espera muito longa' },
  { code: 'other', label: 'Outro motivo' },
] as const;

export const DRIVER_CANCEL_REASONS = [
  { code: 'passenger_no_show', label: 'Passageiro não apareceu' },
  { code: 'cannot_reach', label: 'Não consegui contato com o passageiro' },
  { code: 'wrong_address', label: 'Endereço de embarque incorreto' },
  { code: 'too_many_passengers', label: 'Passageiros ou bagagem além do combinado' },
  { code: 'vehicle_issue', label: 'Problema com o veículo' },
  { code: 'safety_concern', label: 'Questão de segurança' },
  { code: 'other', label: 'Outro motivo' },
] as const;

export type PassengerCancelReasonCode = (typeof PASSENGER_CANCEL_REASONS)[number]['code'];
export type DriverCancelReasonCode = (typeof DRIVER_CANCEL_REASONS)[number]['code'];

export const PASSENGER_CANCEL_REASON_CODES = PASSENGER_CANCEL_REASONS.map((r) => r.code) as [PassengerCancelReasonCode, ...PassengerCancelReasonCode[]];
export const DRIVER_CANCEL_REASON_CODES = DRIVER_CANCEL_REASONS.map((r) => r.code) as [DriverCancelReasonCode, ...DriverCancelReasonCode[]];

export function cancelReasonsFor(role: 'passenger' | 'driver') {
  return role === 'driver' ? DRIVER_CANCEL_REASONS : PASSENGER_CANCEL_REASONS;
}
