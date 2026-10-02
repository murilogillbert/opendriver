/**
 * Corrida "apenas mulheres" (plano §7) — regra de elegibilidade por gênero, isolada aqui para
 * ficar testável sem banco e com um único lugar a auditar.
 *
 * Gênero é dado sensível (LGPD): a coleta é sempre opt-in explícita, com finalidade declarada
 * (decidir quem pode pedir e atender corridas "apenas mulheres"), NUNCA inferida do nome e nunca
 * exposta ao outro lado da corrida. `null` significa "preferiu não informar" e, para efeito de
 * elegibilidade, é tratado exatamente como "não é mulher" — nunca como um curinga.
 */
import type { RidePassengerKind } from './ridePassenger.js';

export const GENDERS = ['female', 'male', 'other'] as const;

/** `null` = preferiu não informar (estado inicial de todo mundo). */
export type Gender = (typeof GENDERS)[number] | null;

export function isGender(value: unknown): value is Gender {
  return value === null || (GENDERS as readonly unknown[]).includes(value);
}

/**
 * Quem pode pedir uma corrida "apenas mulheres".
 *
 * O critério é o gênero de **quem embarca** (não de quem paga) e só vale quando esse gênero vem de
 * uma declaração da própria pessoa: a titular pedindo pra si (`self`) ou uma usuária da plataforma
 * vinculada por convite + aceite (`linked`), que declarou `female` na conta dela.
 *
 * Passageiro avulso (`guest`) nunca entra na política: ali só existe um nome digitado por terceiro,
 * sem nenhuma declaração da pessoa que vai embarcar — a exclusividade não teria valor de segurança.
 */
export function canRequestWomenOnly(riderGender: Gender, kind: RidePassengerKind = 'self'): boolean {
  if (kind === 'guest') return false;
  return riderGender === 'female';
}

/**
 * O motorista pode receber a oferta desta corrida? Duas condições independentes, nos dois sentidos
 * (plano §7): a corrida restrita só vai para motorista mulher, e a motorista que optou por atender
 * só mulheres só recebe corridas de passageiras mulheres.
 *
 * `riderGender` é o gênero de quem embarca — em corrida pedida pra outra pessoa, é o da conta
 * vinculada, e `null` no caso do passageiro avulso (gênero desconhecido, nunca presumido).
 */
export function driverMatchesRideGender(
  ride: { womenOnly: boolean; riderGender: Gender },
  driver: { gender: Gender; womenOnlyPref: boolean },
): boolean {
  if (ride.womenOnly && driver.gender !== 'female') return false;
  if (driver.womenOnlyPref && ride.riderGender !== 'female') return false;
  return true;
}
