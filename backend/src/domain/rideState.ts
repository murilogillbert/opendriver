/**
 * Máquina de estados da corrida — fonte ÚNICA de quais transições e ações
 * são válidas em cada estado para cada papel (UX07, UX14). O app não decide
 * sozinho: ele renderiza `actions` que a API devolve em cada corrida.
 */
export type RideStatus = 'Searching' | 'DriverAssigned' | 'DriverArrived' | 'InProgress' | 'Completed' | 'Cancelled' | 'NoDrivers';
export type PaymentStatus = 'NotDue' | 'Pending' | 'Paid' | 'Failed' | 'Refunded' | 'NotRequired';
export type Role = 'passenger' | 'driver';

export type PassengerAction = 'cancel' | 'pay' | 'rate' | 'share' | 'safety';
export type DriverAction = 'arrived' | 'start' | 'finish' | 'cancel' | 'rate' | 'safety';

export const ACTIVE_STATUSES: RideStatus[] = ['Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'];
/** Estados em que a posição do motorista é transmitida ao passageiro (RF06). */
export const LOCATION_SHARING_STATUSES: RideStatus[] = ['DriverAssigned', 'DriverArrived', 'InProgress'];

const TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  // Searching → Searching acontece quando o motorista desiste antes do embarque (novo matching).
  Searching: ['DriverAssigned', 'Cancelled', 'NoDrivers'],
  DriverAssigned: ['DriverArrived', 'Cancelled', 'Searching'],
  DriverArrived: ['InProgress', 'Cancelled', 'Searching'],
  InProgress: ['Completed'],
  Completed: [],
  Cancelled: [],
  NoDrivers: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isActive(status: RideStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export interface ActionContext {
  status: RideStatus;
  paymentStatus: PaymentStatus;
  /** Já avaliou esta corrida? */
  rated: boolean;
  /** Corrida concluída há menos de 7 dias (janela de avaliação). */
  withinRatingWindow: boolean;
}

export function passengerActions(c: ActionContext): PassengerAction[] {
  const a: PassengerAction[] = [];
  if (['Searching', 'DriverAssigned', 'DriverArrived'].includes(c.status)) a.push('cancel');
  if (LOCATION_SHARING_STATUSES.includes(c.status)) a.push('share', 'safety');
  if ((c.status === 'Completed' || c.status === 'Cancelled') && c.paymentStatus === 'Failed') a.push('pay');
  if (c.status === 'Completed' && c.paymentStatus === 'Pending') a.push('pay');
  if (c.status === 'Completed' && !c.rated && c.withinRatingWindow) a.push('rate');
  return a;
}

export function driverActions(c: ActionContext): DriverAction[] {
  switch (c.status) {
    case 'DriverAssigned':
      return ['arrived', 'cancel', 'safety'];
    case 'DriverArrived':
      return ['start', 'cancel', 'safety'];
    case 'InProgress':
      return ['finish', 'safety'];
    case 'Completed':
      return !c.rated && c.withinRatingWindow ? ['rate'] : [];
    default:
      return [];
  }
}
