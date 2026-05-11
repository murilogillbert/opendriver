import type { FastifyRequest } from "fastify";

// Single source of truth for caller IP. trustProxy is enabled, but we still parse
// X-Forwarded-For explicitly because Cloudflare and Nginx in front of us can append
// IPs and request.ip alone would only expose the first entry.
export function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  retry?: { attempts: number; baseDelayMs?: number };
};

const DEFAULT_TIMEOUT_MS = 8_000;

// Wraps fetch with an AbortSignal-based timeout and (optional) bounded retry for
// transient failures (5xx, 429, network drops). Use this for any outbound HTTP
// call that talks to a third party so a stuck remote can never wedge a request.
export async function fetchWithTimeout(input: string, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retry, ...rest } = options;
  const attempts = Math.max(1, retry?.attempts ?? 1);
  const baseDelay = retry?.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const externalSignal = rest.signal as AbortSignal | undefined;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
    }
    const timer = setTimeout(() => controller.abort(new Error("fetch_timeout")), timeoutMs);
    try {
      const response = await fetch(input, { ...rest, signal: controller.signal });
      clearTimeout(timer);

      // Retry only on transient server errors / rate limits.
      if (attempt < attempts - 1 && (response.status === 429 || response.status >= 500)) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        const wait = retryAfter > 0 ? retryAfter * 1000 : baseDelay * 2 ** attempt;
        await sleep(wait + Math.floor(Math.random() * baseDelay));
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= attempts - 1) break;
      await sleep(baseDelay * 2 ** attempt + Math.floor(Math.random() * baseDelay));
    }
  }
  throw lastError ?? new Error("fetch_failed");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
