/** Mesmo envelope da API do hub: { data } no sucesso, { error } na falha. */
export function envelope<T>(data: T): { data: T } {
  return { data };
}
