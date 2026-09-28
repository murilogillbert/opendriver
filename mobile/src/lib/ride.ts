import type { Ride, RideAction, RideStatus } from '@/api/types';

/**
 * Textos da corrida em linguagem simples (UX03, UX11) e vocabulário fixo das
 * ações (princípios de UX: Aceitar, Cancelar, Iniciar, Finalizar, Voltar).
 */

export const ACTIVE: RideStatus[] = ['Searching', 'DriverAssigned', 'DriverArrived', 'InProgress'];

export const isActive = (r: Pick<Ride, 'status'> | null | undefined) => !!r && ACTIVE.includes(r.status);

export const can = (r: Pick<Ride, 'actions'> | null | undefined, action: RideAction) => !!r?.actions.includes(action);

/** Título do estado para o passageiro — "o que está acontecendo agora". */
export function passengerHeadline(r: Ride): string {
  switch (r.status) {
    case 'Searching':
      return 'Procurando motorista';
    case 'DriverAssigned':
      return 'Motorista a caminho';
    case 'DriverArrived':
      return 'Seu motorista chegou';
    case 'InProgress':
      return 'Em viagem';
    case 'Completed':
      return 'Você chegou';
    case 'Cancelled':
      return 'Corrida cancelada';
    case 'NoDrivers':
      return 'Nenhum motorista disponível';
  }
}

export function driverHeadline(r: Ride): string {
  switch (r.status) {
    case 'DriverAssigned':
      return 'Vá até o passageiro';
    case 'DriverArrived':
      return 'Aguardando o passageiro';
    case 'InProgress':
      return 'Leve ao destino';
    case 'Completed':
      return 'Corrida finalizada';
    case 'Cancelled':
      return 'Corrida cancelada';
    default:
      return 'Corrida';
  }
}

export const statusLabel: Record<RideStatus, string> = {
  Searching: 'Procurando',
  DriverAssigned: 'A caminho',
  DriverArrived: 'Motorista chegou',
  InProgress: 'Em viagem',
  Completed: 'Concluída',
  Cancelled: 'Cancelada',
  NoDrivers: 'Sem motorista',
};

export function statusTone(s: RideStatus): 'success' | 'danger' | 'info' | 'neutral' {
  if (s === 'Completed') return 'success';
  if (s === 'Cancelled' || s === 'NoDrivers') return 'danger';
  if (ACTIVE.includes(s)) return 'info';
  return 'neutral';
}

export function paymentLabel(r: Ride): string {
  switch (r.payment.status) {
    case 'Paid':
      return 'Pago';
    case 'Pending':
      return r.payment.methodType === 'Pix' ? 'Aguardando Pix' : 'Processando';
    case 'Failed':
      return 'Pagamento não concluído';
    case 'Refunded':
      return 'Estornado';
    case 'NotRequired':
      return 'Sem cobrança';
    default:
      return '—';
  }
}

export function vehicleLine(v: { brand: string; model: string; color: string } | null | undefined): string {
  return v ? `${v.brand} ${v.model} · ${v.color}` : '';
}
