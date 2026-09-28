import { useEffect, useState } from 'react';

/** Hora atual que se atualiza sozinha (contagens e previsões na tela). */
export function useNow(intervalMs = 15_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}
