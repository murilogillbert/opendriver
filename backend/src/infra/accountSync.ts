import { config } from '../config.js';
import { AppError } from '../errors.js';
import { getSetting } from './settings.js';

/**
 * Chamada servidor-a-servidor para o hub, usada na exclusão de conta.
 *
 * Os dois serviços compartilham `public.users` mas são donos de schemas diferentes, então nenhum
 * dos dois apaga a tabela do outro: cada um expõe `/internal/accounts/:id/...` e o que recebe o
 * pedido da pessoa orquestra os dois lados.
 *
 * Autenticação pela mesma `public.service_api_keys` do hub (hash no banco, escopos, revogável em
 * Admin → Chaves de API). O valor em texto puro fica em `integration_settings` sob
 * `Internal:AccountSyncKey`, para poder rotacionar sem redeploy.
 *
 * **Fail closed de propósito**: sem URL ou sem chave, a exclusão é recusada em vez de apagar só
 * metade. Conta anonimizada com dado pessoal sobrando no outro schema seria o pior resultado.
 */
const UNAVAILABLE = 'Exclusão de conta temporariamente indisponível. Tente mais tarde ou fale com o suporte.';
const TIMEOUT_MS = 10_000;

/**
 * Nos testes não existe um hub de verdade no ar, e cada suíte verifica o seu próprio lado. Fora de
 * teste NUNCA é desligado: é justamente o fail-closed que impede a exclusão pela metade.
 *
 * A orquestração entre os dois serviços não tem teste automatizado — exigiria subir os dois. O
 * contrato inteiro está em `hub/docs/normalizacao-banco.md`.
 */
const skip = () => config.isTest;

async function call(path: string, method: 'GET' | 'POST'): Promise<unknown> {
  const base = config.hubApiUrl;
  const key = await getSetting('Internal:AccountSyncKey');
  if (!base || !key) {
    console.error('accountSync: HUB_API_URL ou Internal:AccountSyncKey não configurados.');
    throw new AppError(UNAVAILABLE, 503, 'account_sync_unavailable');
  }
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('accountSync: hub inacessível', (err as Error).message);
    throw new AppError(UNAVAILABLE, 503, 'account_sync_unavailable');
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    console.error('accountSync: hub respondeu', res.status, await res.text().catch(() => ''));
    throw new AppError(UNAVAILABLE, 503, 'account_sync_unavailable');
  }
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Impedimentos do lado do hub (ex.: voucher pago e não resgatado). Lista vazia = pode excluir. */
export async function hubDeletionBlockers(userId: string): Promise<string[]> {
  if (skip()) return [];
  const data = (await call(`/internal/accounts/${encodeURIComponent(userId)}/deletion-blockers`, 'GET')) as
    | { blockers?: unknown }
    | null;
  const blockers = data?.blockers;
  return Array.isArray(blockers) ? blockers.filter((b): b is string => typeof b === 'string') : [];
}

/** Apaga os dados do schema `public` do hub. Idempotente: repetir não é erro. */
export async function purgeHubAccount(userId: string): Promise<void> {
  if (skip()) return;
  await call(`/internal/accounts/${encodeURIComponent(userId)}/purge`, 'POST');
}
