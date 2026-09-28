/**
 * Exclusão mútua por chave dentro do processo (ex.: uma liquidação por
 * corrida por vez). A API roda como processo único (Coolify); a integridade
 * entre processos é garantida pelas atualizações condicionais no banco.
 */
const tails = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => current);
  tails.set(key, tail);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
