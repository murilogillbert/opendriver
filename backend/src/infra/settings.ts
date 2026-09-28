import { prisma } from './prisma.js';

/** Credenciais de integração: public.integration_settings (editável no admin
 * do hub) com fallback para env ("Asaas:ApiKey" → Asaas__ApiKey). Cache curto
 * para não consultar o banco a cada cobrança. */
const cache = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 30_000;

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await prisma.integrationSetting.findUnique({ where: { key } });
  let value: string | null = row && row.value.trim() !== '' ? row.value : null;
  if (!value) {
    const env = process.env[key.replace(/:/g, '__')] ?? process.env[key];
    value = env && env.trim() !== '' ? env : null;
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function clearSettingsCache(): void {
  cache.clear();
}
