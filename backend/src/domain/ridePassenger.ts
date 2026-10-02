import { ageOn } from './validators.js';

/**
 * Quem embarca na corrida, que não é necessariamente quem pede e paga.
 *
 *  - `self`   — o solicitante viaja (caso de sempre).
 *  - `linked` — outro usuário da plataforma, vinculado antes por convite + aceite. A identidade é
 *               da própria conta dele, então o que ele declarou sobre si mesmo vale.
 *  - `guest`  — dependente sem perfil (nome, CPF e nascimento informados por quem pede). Aqui só
 *               existe o que foi digitado: nada é verificado contra fonte oficial.
 */
export const RIDE_PASSENGER_KINDS = ['self', 'linked', 'guest'] as const;

export type RidePassengerKind = (typeof RIDE_PASSENGER_KINDS)[number];

/** Maioridade civil brasileira — abaixo disso a corrida exige adulto responsável embarcando junto. */
export const ADULT_AGE = 18;

/**
 * O passageiro avulso é menor e, portanto, a corrida só pode seguir com a confirmação explícita de
 * que um adulto responsável embarca com ele. Vale só para `guest`: é o único caso em que a data de
 * nascimento é coletada (contas da plataforma não informam nascimento ao pedir corrida).
 */
export function requiresAdultEscort(birthDate: Date, ref = new Date()): boolean {
  return ageOn(birthDate, ref) < ADULT_AGE;
}
