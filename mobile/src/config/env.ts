import Constants from 'expo-constants';

type Variant = 'development' | 'preview' | 'production';

interface Extra {
  variant?: Variant;
  apiUrl?: string;
  hubUrl?: string;
  hubApiUrl?: string;
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
/**
 * API do hub, usada para **enviar a foto de perfil**.
 *
 * Por que o hub e não a API própria: o storage do opendriver é privado e cifrado, feito para
 * documento de motorista e gravação de corrida. Avatar é público — aparece no `PersonCard` do
 * outro lado da corrida —, e o hub já tem a rota, o bucket público e a validação por magic
 * bytes. Criar um segundo caminho de imagem pública aqui duplicaria tudo isso.
 *
 * E não acrescenta dependência: o avatar **já** é lido do hub (`resolveImageUrl` resolve
 * `/uploads` contra `hubOrigin`). Enviar para onde ele é lido é o consistente.
 *
 * O token funciona nos dois: os dois serviços assinam HS256 com o mesmo `JWT_SECRET` e o mesmo
 * par issuer/audience (`opendriverhub`).
 */
const hubApiUrl = strip(
  process.env.EXPO_PUBLIC_HUB_API_URL || extra.hubApiUrl || 'https://hubapi.opendriver.com.br'
);

export const env = {
  variant: (extra.variant ?? 'development') as Variant,
  /** Origem da API do OpenDriver (sem /api/v1) — também serve o Socket.IO em /realtime. */
  apiUrl,
  apiBaseUrl: `${apiUrl}/api/v1`,
  /** Site do OpenDriverHub aberto na aba Hub (RF11). */
  hubUrl,
  hubOrigin: originOf(hubUrl),
  /** API do hub. Hoje só para enviar a foto de perfil. */
  hubApiUrl,
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
