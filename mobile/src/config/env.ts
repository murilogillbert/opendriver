import Constants from 'expo-constants';

type Variant = 'development' | 'preview' | 'production';

interface Extra {
  variant?: Variant;
  apiUrl?: string;
  hubUrl?: string;
  mapStyleUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const strip = (url: string) => url.replace(/\/+$/, '');
/** `new URL().origin` não é confiável no runtime do React Native. */
const originOf = (url: string) => /^(https?:\/\/[^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? url;

/**
 * EXPO_PUBLIC_* é embutido no bundle em tempo de build; `extra` (app.config.ts)
 * é o fallback do mesmo build. Em builds de loja o app.config.ts já recusou
 * URLs que não sejam https.
 */
const apiUrl = strip(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'http://localhost:5100');
const hubUrl = strip(process.env.EXPO_PUBLIC_HUB_URL || extra.hubUrl || 'https://opendriver.com.br');

export const env = {
  variant: (extra.variant ?? 'development') as Variant,
  /** Origem da API do OpenDriver (sem /api/v1) — também serve o Socket.IO em /realtime. */
  apiUrl,
  apiBaseUrl: `${apiUrl}/api/v1`,
  /** Site do OpenDriverHub aberto na aba Hub (RF11). */
  hubUrl,
  hubOrigin: originOf(hubUrl),
  /** Estilo MapLibre (tiles OSM). Vazio em dev → estilo de demonstração. */
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL || extra.mapStyleUrl || 'https://demotiles.maplibre.org/style.json',
} as const;

/** As lojas exigem URL pública de política de privacidade e canal de suporte (servidas pela API). */
export const links = {
  privacyPolicy: process.env.EXPO_PUBLIC_PRIVACY_URL || `${apiUrl}/legal/privacidade`,
  terms: process.env.EXPO_PUBLIC_TERMS_URL || `${apiUrl}/legal/termos`,
  /**
   * Caixa que **recebe de verdade**, conferido por DNS.
   *
   * `suporte@opendriver.com.br` não recebia nada: o domínio publica `MX .` (null MX, que
   * declara "este domínio não recebe e-mail"), `SPF -all` e `DMARC p=reject`. As duas lojas
   * exigem canal de suporte funcional, e caixa morta é reprovação.
   */
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'murilogillbert@gmail.com',
} as const;
