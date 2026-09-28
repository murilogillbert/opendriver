import { config } from '../config.js';
import { prisma } from './prisma.js';

/**
 * Push via Expo Push Service (o app registra o token em /me/push-tokens).
 * Fire-and-forget: falha de push nunca quebra o fluxo da corrida — o app em
 * primeiro plano recebe o mesmo evento por Socket.IO.
 */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Oferta de corrida: som e prioridade máximos. */
  urgent?: boolean;
}

const enabled = () => process.env.PUSH_ENABLED !== 'false' && !config.isTest;

export async function sendPush(userId: string, msg: PushMessage): Promise<void> {
  if (!enabled()) return;
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (!tokens.length) return;
    const body = tokens.map((t) => ({
      to: t.token,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      sound: 'default',
      priority: msg.urgent ? 'high' : 'default',
      channelId: msg.urgent ? 'ride-offers' : 'default',
      ttl: msg.urgent ? 20 : 3600,
    }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    // Remove tokens que o Expo diz não existirem mais (app desinstalado).
    const dead = (json?.data ?? [])
      .map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? tokens[i]?.token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  } catch (err) {
    console.warn('Falha ao enviar push', (err as Error).message);
  }
}
