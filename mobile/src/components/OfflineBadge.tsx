import { useEffect, useState } from 'react';
import { useConnected } from '@/context/RealtimeContext';
import { Badge } from './ui/primitives';

/**
 * Aviso discreto quando o tempo real cai (só depois de alguns segundos, para
 * não piscar em reconexões rápidas). As telas seguem funcionando por consulta.
 */
export function OfflineBadge() {
  const connected = useConnected();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (connected) return;
    const t = setTimeout(() => setShow(true), 6000);
    return () => {
      clearTimeout(t);
      setShow(false);
    };
  }, [connected]);
  return !connected && show ? <Badge label="Reconectando…" tone="warning" icon="cloud-offline-outline" /> : null;
}
