/**
 * Chat mascarado motorista↔passageiro (plano §11.1) — só mensagens rápidas
 * predefinidas, sem texto livre: mais seguro (nada a moderar), mais rápido de
 * usar guiando/no trânsito. "Mascarado" porque não há contato real nenhum —
 * tudo passa só pelo app, como a ligação por número mascarado faria (essa
 * parte específica segue pendente: precisa de um provedor de telefonia/SMS
 * como Twilio, que o projeto não tem contratado — ver docs/plano-implementacao.md §11.1).
 */
export const PASSENGER_QUICK_MESSAGES = [
  { code: 'coming', label: 'Já estou indo' },
  { code: 'wait', label: 'Só um minuto, por favor' },
  { code: 'ready', label: 'Pronto, pode vir' },
  { code: 'thanks', label: 'Obrigado!' },
] as const;

export const DRIVER_QUICK_MESSAGES = [
  { code: 'arriving', label: 'Estou chegando' },
  { code: 'arrived', label: 'Cheguei, te aguardo' },
  { code: 'delay', label: 'Vou demorar um pouco mais' },
  { code: 'ok', label: 'Ok!' },
] as const;

export type PassengerQuickMessageCode = (typeof PASSENGER_QUICK_MESSAGES)[number]['code'];
export type DriverQuickMessageCode = (typeof DRIVER_QUICK_MESSAGES)[number]['code'];

export const PASSENGER_QUICK_MESSAGE_CODES = PASSENGER_QUICK_MESSAGES.map((m) => m.code) as [PassengerQuickMessageCode, ...PassengerQuickMessageCode[]];
export const DRIVER_QUICK_MESSAGE_CODES = DRIVER_QUICK_MESSAGES.map((m) => m.code) as [DriverQuickMessageCode, ...DriverQuickMessageCode[]];

export function quickMessagesFor(role: 'passenger' | 'driver') {
  return role === 'driver' ? DRIVER_QUICK_MESSAGES : PASSENGER_QUICK_MESSAGES;
}
