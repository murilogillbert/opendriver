import 'dotenv/config';

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function float(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function list(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'dev-only-secret-change-me-please-32bytes-min';

export const config = {
  isProduction,
  isTest: process.env.NODE_ENV === 'test',
  port: int(process.env.PORT, 5100),
  /** Deve ser IGUAL ao JWT_SECRET do hub: tokens valem nos dois serviços (RF11). */
  jwt: {
    secret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
    issuer: 'opendriverhub',
    audience: 'opendriverhub',
    accessTtlSeconds: int(process.env.JWT_ACCESS_TTL_SECONDS, 2 * 60 * 60),
    refreshTtlSeconds: int(process.env.JWT_REFRESH_TTL_SECONDS, 7 * 24 * 60 * 60),
  },
  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:5173'),
  /** Site do OpenDriverHub: aba Hub do app e páginas de e-mail (/verificar-email, /redefinir-senha). */
  hubWebUrl: (process.env.HUB_WEB_URL ?? 'https://opendriver.com.br').replace(/\/+$/, ''),
  /** URL pública desta API (link de compartilhar viagem /t/:token). */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5100').replace(/\/+$/, ''),
  rateLimit: {
    authPermit: int(process.env.RATE_LIMIT_AUTH_PERMIT, 10),
    authWindowSeconds: int(process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS, 60),
  },
  /** Chave-mestra (32 bytes em base64) para cifrar tokens de cartão e gravações. */
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY ?? '',
  payments: {
    provider: (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase() as 'mock' | 'asaas',
    webhookRequireToken: bool(process.env.PAYMENT_WEBHOOK_REQUIRE_TOKEN, true),
  },
  geo: {
    osrmUrl: (process.env.OSRM_URL ?? '').replace(/\/+$/, ''),
    nominatimUrl: (process.env.NOMINATIM_URL ?? '').replace(/\/+$/, ''),
    /** Contato exigido pela política de uso do Nominatim (User-Agent/e-mail). */
    contactEmail: process.env.GEO_CONTACT_EMAIL ?? 'contato@opendriver.com.br',
    countryCodes: process.env.GEO_COUNTRY_CODES ?? 'br',
    /** Sinuosidade usada na estimativa em linha reta quando o OSRM não responde. */
    fallbackDetourFactor: float(process.env.GEO_FALLBACK_DETOUR_FACTOR, 1.35),
    fallbackAvgSpeedKmh: float(process.env.GEO_FALLBACK_AVG_SPEED_KMH, 28),
    timeoutMs: int(process.env.GEO_TIMEOUT_MS, 4000),
  },
  dispatch: {
    offerTimeoutSeconds: int(process.env.DISPATCH_OFFER_TIMEOUT_SECONDS, 15),
    searchRadiusKm: float(process.env.DISPATCH_SEARCH_RADIUS_KM, 8),
    maxOffers: int(process.env.DISPATCH_MAX_OFFERS, 8),
    /** Tempo máximo procurando motorista antes de encerrar como NoDrivers. */
    searchTimeoutSeconds: int(process.env.DISPATCH_SEARCH_TIMEOUT_SECONDS, 180),
    locationStaleSeconds: int(process.env.DISPATCH_LOCATION_STALE_SECONDS, 60),
    quoteTtlSeconds: int(process.env.QUOTE_TTL_SECONDS, 300),
    /** Cancelamento do passageiro após este tempo do aceite gera taxa. */
    freeCancelSeconds: int(process.env.FREE_CANCEL_SECONDS, 120),
  },
  storage: {
    endpoint: process.env.MINIO_ENDPOINT ?? '',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    /** Bucket PRIVADO (documentos, gravações) — nunca público. */
    privateBucket: process.env.MINIO_PRIVATE_BUCKET ?? 'opendriver-private',
    maxImageBytes: int(process.env.STORAGE_MAX_IMAGE_BYTES, 8 * 1024 * 1024),
    maxAudioBytes: int(process.env.STORAGE_MAX_AUDIO_BYTES, 60 * 1024 * 1024),
  },
  recording: {
    retentionDays: int(process.env.RECORDING_RETENTION_DAYS, 30),
    consentVersion: process.env.RECORDING_CONSENT_VERSION ?? 'v1-2026-09',
  },
};

/** Falha cedo em produção em vez de rodar com segredos de desenvolvimento. */
export function assertProductionConfig(): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (config.jwt.secret === DEV_JWT_SECRET || config.jwt.secret.length < 32)
    problems.push('JWT_SECRET ausente/fraco (deve ser o MESMO do hub, 32+ caracteres)');
  if (Buffer.from(config.dataEncryptionKey, 'base64').length !== 32)
    problems.push('DATA_ENCRYPTION_KEY deve ter 32 bytes em base64 (openssl rand -base64 32)');
  if (!config.publicBaseUrl.startsWith('https://')) problems.push('PUBLIC_BASE_URL deve ser https');
  if (config.payments.provider === 'mock') problems.push('PAYMENT_PROVIDER=mock não é permitido em produção');
  if (problems.length) throw new Error(`Configuração inválida para produção:\n- ${problems.join('\n- ')}`);
}
