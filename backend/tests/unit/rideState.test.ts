import { describe, expect, it } from 'vitest';
import { canTransition, driverActions, passengerActions, type RideStatus } from '../../src/domain/rideState.js';

const ctx = (status: RideStatus, extra: Partial<Parameters<typeof passengerActions>[0]> = {}) => ({
  status,
  paymentStatus: 'NotDue' as const,
  rated: false,
  withinRatingWindow: true,
  ...extra,
});

describe('máquina de estados da corrida (UX07, UX14)', () => {
  it('só permite as transições do fluxo', () => {
    expect(canTransition('Searching', 'DriverAssigned')).toBe(true);
    expect(canTransition('DriverAssigned', 'DriverArrived')).toBe(true);
    expect(canTransition('DriverArrived', 'InProgress')).toBe(true);
    expect(canTransition('InProgress', 'Completed')).toBe(true);
    expect(canTransition('InProgress', 'Cancelled')).toBe(false);
    expect(canTransition('Searching', 'InProgress')).toBe(false);
    expect(canTransition('Completed', 'Cancelled')).toBe(false);
    expect(canTransition('DriverAssigned', 'Searching')).toBe(true); // motorista desistiu
  });

  it('passageiro vê só ações válidas', () => {
    expect(passengerActions(ctx('Searching'))).toEqual(['cancel']);
    expect(passengerActions(ctx('DriverAssigned'))).toEqual(['cancel', 'share', 'safety']);
    expect(passengerActions(ctx('InProgress'))).toEqual(['share', 'safety']); // não cancela em viagem
    expect(passengerActions(ctx('Completed', { paymentStatus: 'Paid' }))).toEqual(['rate']);
    expect(passengerActions(ctx('Completed', { paymentStatus: 'Failed' }))).toEqual(['pay', 'rate']);
    expect(passengerActions(ctx('Completed', { paymentStatus: 'Paid', rated: true }))).toEqual([]);
    expect(passengerActions(ctx('NoDrivers'))).toEqual([]);
  });

  it('motorista: aceitar → chegar → iniciar → finalizar (1 ação dominante por estado)', () => {
    expect(driverActions(ctx('DriverAssigned'))[0]).toBe('arrived');
    expect(driverActions(ctx('DriverArrived'))[0]).toBe('start');
    expect(driverActions(ctx('InProgress'))).toEqual(['finish', 'safety']);
    expect(driverActions(ctx('Completed', { withinRatingWindow: false }))).toEqual([]);
    expect(driverActions(ctx('Searching'))).toEqual([]);
  });

  it('"não compareceu" só aparece 5 min depois de "cheguei" (plano §8)', () => {
    expect(driverActions(ctx('DriverArrived'))).toEqual(['start', 'cancel', 'safety']);
    expect(driverActions(ctx('DriverArrived', { arrivalGraceElapsed: true }))).toEqual(['start', 'cancel', 'safety', 'no_show']);
  });
});
