const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function assetUrl(url?: string | null) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;

  if (url.startsWith("/uploads/") && API_BASE_URL.startsWith("http")) {
    const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "/");
    return new URL(url, apiOrigin).toString();
  }

  return url;
}
