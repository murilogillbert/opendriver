import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { LatLng } from '@/api/types';
import { ensureForegroundPermission, getCurrentPosition } from '@/services/location';

let asked = false;

/**
 * Posição atual para o embarque padrão (UX09). Pede a permissão uma vez por
 * abertura do app; atualiza ao voltar para a tela.
 */
export function useHere() {
  const [here, setHere] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        let pos = await getCurrentPosition();
        if (!pos && !asked) {
          asked = true;
          const ok = await ensureForegroundPermission('Sem ela, você precisa digitar o endereço de embarque.');
          if (ok) pos = await getCurrentPosition();
        }
        if (!alive) return;
        setHere(pos);
        setDenied(!pos);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return { here, denied };
}
