import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Offer, Ride } from '@/api/types';
import { ToastProvider } from '@/components/Toast';
import { DriverRidePanel } from '@/features/driver/DriverRidePanel';
import { OfferModal } from '@/features/driver/OfferModal';
import { PassengerRidePanel } from '@/features/passenger/RidePanel';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock é içado; import estático não funciona aqui
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() } }));
jest.mock('@/api/client', () => ({ api: {}, http: {}, tokenStorage: {}, subscribeSession: () => () => undefined }));
jest.mock('@/components/SafetyRecorder', () => {
  const { createStore } = jest.requireActual('@/lib/store');
  return { recordingActiveStore: createStore(false) };
});

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const base: Ride = {
  id: 'r1',
  role: 'passenger',
  status: 'Searching',
  category: 'Economy',
  origin: { lat: -15.6, lng: -56.1, address: 'Rua das Flores, 100' },
  destination: { lat: -15.57, lng: -56.08, address: 'Shopping Pantanal' },
  distanceM: 5300,
  durationS: 900,
  polyline: '',
  fare: 15.9,
  cashbackUsed: 0,
  cancellationFee: 0,
  amountDue: 15.9,
  payment: { status: 'NotDue', methodType: 'Pix', label: 'Pix', pix: null, failureReason: null },
  driver: { id: 'driver-1', name: 'Diego', avatarUrl: null, rating: 4.9, vehicle: { plate: 'ABC1D23', brand: 'Chevrolet', model: 'Onix', color: 'Prata' } },
  passenger: null,
  actions: ['cancel'],
  requestedAt: new Date().toISOString(),
  acceptedAt: null,
  arrivedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
};

const noop = () => undefined;

describe('corrida do passageiro: só as ações válidas do estado (UX07)', () => {
  it('procurando: tranquiliza e só permite Cancelar', async () => {
    await render(wrap(<PassengerRidePanel ride={base} onHeight={noop} />));
    expect(screen.getByText('Procurando motorista')).toBeTruthy();
    expect(screen.getByText(/menos de um minuto/)).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
    expect(screen.queryByText('Segurança')).toBeNull();
  });

  it('motorista a caminho: previsão de chegada, placa, segurança e compartilhar', async () => {
    const ride: Ride = {
      ...base,
      status: 'DriverAssigned',
      acceptedAt: new Date().toISOString(),
      pickupEta: new Date(Date.now() + 4 * 60_000 - 1000).toISOString(),
      actions: ['cancel', 'share', 'safety'],
      pickupCode: '4821',
    };
    await render(wrap(<PassengerRidePanel ride={ride} onHeight={noop} />));
    expect(screen.getByText('Motorista a caminho')).toBeTruthy();
    expect(screen.getByText('Chega em ~4 min')).toBeTruthy();
    expect(screen.getByText('ABC1D23')).toBeTruthy();
    expect(screen.getByText('Segurança')).toBeTruthy();
    expect(screen.getByText('Compartilhar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
    // PIN de embarque (plano §8): só o passageiro vê, pra passar ao motorista.
    expect(screen.getByText('4821')).toBeTruthy();
  });

  it('em viagem: não oferece Cancelar', async () => {
    const ride: Ride = { ...base, status: 'InProgress', startedAt: new Date().toISOString(), actions: ['share', 'safety'] };
    await render(wrap(<PassengerRidePanel ride={ride} onHeight={noop} />));
    expect(screen.getByText('Em viagem')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('concluída e paga: avaliar é a ação dominante, com opção de pular', async () => {
    const ride: Ride = {
      ...base,
      status: 'Completed',
      completedAt: new Date().toISOString(),
      payment: { ...base.payment, status: 'Paid' },
      actions: ['rate'],
    };
    await render(wrap(<PassengerRidePanel ride={ride} onHeight={noop} />));
    expect(screen.getByText('Você chegou')).toBeTruthy();
    expect(screen.getByText(/Pago/)).toBeTruthy();
    expect(screen.getByText('Enviar avaliação')).toBeTruthy();
    expect(screen.getByText('Pular')).toBeTruthy();
  });

  it('pagamento recusado: diz o motivo e oferece pagar; não deixa sair sem pagar (UX11)', async () => {
    const ride: Ride = {
      ...base,
      status: 'Completed',
      completedAt: new Date().toISOString(),
      payment: { ...base.payment, status: 'Failed', methodType: 'Card', label: 'Visa •••• 4242', failureReason: 'Cartão recusado pelo banco emissor.' },
      actions: ['pay', 'rate'],
    };
    await render(wrap(<PassengerRidePanel ride={ride} onHeight={noop} />));
    expect(screen.getByText('Pagamento não concluído')).toBeTruthy();
    expect(screen.getByText(/Cartão recusado/)).toBeTruthy();
    expect(screen.getByText('Pagar R$ 15,90')).toBeTruthy();
    expect(screen.queryByText('Pular')).toBeNull();
    expect(screen.queryByText('Concluir')).toBeNull();
  });
});

describe('corrida do motorista: uma ação dominante por estado (UX06)', () => {
  const driverRide = (status: Ride['status'], actions: Ride['actions']): Ride => ({
    ...base,
    role: 'driver',
    status,
    actions,
    driver: null,
    passenger: { id: 'passenger-1', name: 'Paula', avatarUrl: null, rating: 4.8 },
    driverEarning: 12.72,
  });

  it('a caminho: Cheguei (e Cancelar), nunca Iniciar/Finalizar', async () => {
    await render(wrap(<DriverRidePanel ride={driverRide('DriverAssigned', ['arrived', 'cancel', 'safety'])} onHeight={noop} />));
    expect(screen.getByText('Cheguei')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
    expect(screen.getByText('Navegar')).toBeTruthy();
    expect(screen.queryByText('Corrida pedida por outra pessoa')).toBeNull();
    expect(screen.queryByText('Iniciar')).toBeNull();
    expect(screen.queryByText('Finalizar')).toBeNull();
  });

  it('no embarque: Iniciar exige o código do passageiro (plano §8)', async () => {
    await render(wrap(<DriverRidePanel ride={driverRide('DriverArrived', ['start', 'cancel', 'safety'])} onHeight={noop} />));
    expect(screen.getByText('Iniciar')).toBeTruthy();
    expect(screen.queryByText('Cheguei')).toBeNull();
    expect(screen.queryByText('Passageiro não veio')).toBeNull();
    // Sem o código ainda, o botão fica desabilitado.
    expect(screen.getByRole('button', { name: 'Iniciar' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Código do passageiro'), '1234');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar' }).props.accessibilityState.disabled).toBe(false));
  });

  it('no embarque depois da tolerância: oferece "Passageiro não veio" (plano §8.1)', async () => {
    await render(wrap(<DriverRidePanel ride={driverRide('DriverArrived', ['start', 'cancel', 'safety', 'no_show'])} onHeight={noop} />));
    expect(screen.getByText('Passageiro não veio')).toBeTruthy();
  });

  it('corrida pedida pra outra pessoa: mostra o aviso pro motorista', async () => {
    const ride = { ...driverRide('DriverAssigned', ['arrived', 'cancel', 'safety']), guestPassengerName: 'Michael Gillbert' };
    await render(wrap(<DriverRidePanel ride={ride} onHeight={noop} />));
    expect(screen.getByText('Corrida pedida por outra pessoa')).toBeTruthy();
  });

  it('em viagem: Finalizar, sem Cancelar', async () => {
    await render(wrap(<DriverRidePanel ride={driverRide('InProgress', ['finish', 'safety'])} onHeight={noop} />));
    expect(screen.getByText('Finalizar')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('concluída: mostra quanto recebe', async () => {
    await render(wrap(<DriverRidePanel ride={driverRide('Completed', ['rate'])} onHeight={noop} />));
    expect(screen.getByText('R$ 12,72')).toBeTruthy();
    expect(screen.getByText('Enviar avaliação')).toBeTruthy();
  });
});

describe('oferta de corrida', () => {
  const offer: Offer = {
    offerId: 'o1',
    rideId: 'r1',
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
    pickupDistanceM: 1200,
    pickupEtaS: 240,
    origin: base.origin,
    destination: base.destination,
    distanceM: 5300,
    durationS: 900,
    category: 'Economy',
    fare: 15.9,
    driverEarning: 12.72,
    paymentMethodType: 'Pix',
  };

  it('mostra o ganho e aceita com 1 toque', async () => {
    const onAccept = jest.fn();
    await render(wrap(<OfferModal offer={offer} onAccept={onAccept} onDecline={noop} onExpire={noop} accepting={false} />));
    expect(screen.getByText('R$ 12,72')).toBeTruthy();
    expect(screen.getByText(/4 min até o passageiro/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Aceitar'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
