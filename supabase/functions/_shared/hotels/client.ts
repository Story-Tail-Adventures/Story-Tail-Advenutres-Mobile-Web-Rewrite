/**
 * SerpApi client.
 *
 * Same shape as _shared/cruise/client.ts — injected fetch, a recorder that fires before we
 * judge the response, one place that decides retryability — with one unavoidable
 * difference, and it is the reason this file is careful:
 *
 * SERPAPI TAKES ITS CREDENTIAL AS A QUERY PARAMETER. The cruise client's invariant ("the
 * key is never logged, never persisted, and never placed in a URL — a query-string key ends
 * up in every access log between here and there") cannot hold literally. So it is preserved
 * where it matters, by ORDERING rather than by filtering: `buildUrl` derives the sanitised
 * copy of the parameters BEFORE attaching the key, and returns both. There is no code path
 * where someone has to remember to strip it, because it was never in the thing we keep.
 *
 * Everything downstream is defence in depth: `redact()` runs at error construction, and the
 * ledger's CHECK constraints refuse a row containing `api_key` at all.
 */
import type { ProviderAccount, ProviderSearchResponse } from "./types.ts";

export const SERPAPI_SEARCH_URL = "https://serpapi.com/search";
export const SERPAPI_ACCOUNT_URL = "https://serpapi.com/account.json";

export interface QuotaSnapshot {
  limit: number | null;
  remaining: number | null;
  monthUsage: number | null;
  thisHour: number | null;
  hourLimit: number | null;
}

export interface RequestRecord {
  endpoint: "search" | "account";
  path: string;
  /** SANITISED. Never contains `api_key` — see `buildUrl`. */
  query: Record<string, string>;
  statusCode: number | null;
  rowsReturned: number | null;
  durationMs: number;
  providerSearchId: string | null;
  quota: QuotaSnapshot | null;
  errorCode: string | null;
  errorDetail: string | null;
}

export type RequestRecorder = (record: RequestRecord) => Promise<void> | void;

export class SerpApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly detail: string;
  readonly permanent: boolean;

  constructor(args: {
    status: number | null;
    code: string;
    detail: string;
    permanent: boolean;
    apiKey: string;
  }) {
    super(args.code);
    this.name = "SerpApiError";
    this.status = args.status;
    this.code = args.code;
    // Redacted HERE, at construction, and not at the call site that persists it. This
    // string reaches the ledger, the function log and an audit metadata blob; redacting at
    // one of three readers protects one of three.
    this.detail = redact(args.detail, args.apiKey);
    this.permanent = args.permanent;
  }
}

/**
 * Two passes, because equality alone is not enough.
 *
 * The first catches the key we hold. The second catches a URL-encoded one, a truncated one,
 * and — the case equality misses entirely — a DIFFERENT key echoed back, such as a rotated
 * credential still present in a cached upstream error.
 */
export function redact(text: string, apiKey: string): string {
  const byValue = apiKey ? text.split(apiKey).join("[redacted]") : text;
  return byValue.replace(/([?&]api_key=)[^&\s"'<>]+/gi, "$1[redacted]");
}

/**
 * Build the request URL and the copy we are allowed to keep.
 *
 * The ordering is the control: `query` is taken from `params`, which never contained the
 * key, and only then is the key appended. Nothing else in this module reads `url` except
 * `fetch`.
 */
export function buildUrl(
  base: string,
  params: Record<string, string>,
  apiKey: string,
): { url: string; query: Record<string, string> } {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const query = { ...params };
  url.searchParams.set("api_key", apiKey);
  return { url: url.toString(), query };
}

export interface ClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  onRequest?: RequestRecorder;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function createSerpApiClient(options: ClientOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function call<T>(
    endpoint: "search" | "account",
    base: string,
    params: Record<string, string>,
  ): Promise<T> {
    const { url, query } = buildUrl(base, params, options.apiKey);
    const path = new URL(base).pathname;

    let lastError: SerpApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;

      try {
        response = await doFetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        // THE MOST LIKELY LEAK IN THE WHOLE FEATURE. Deno's fetch rejection message is
        // "error sending request for url (https://serpapi.com/search?…&api_key=…)". Feeding
        // it into the error unredacted would put the credential in the ledger and the logs.
        const error = new SerpApiError({
          status: null,
          code: "network_error",
          detail: cause instanceof Error ? cause.message : String(cause),
          permanent: false,
          apiKey: options.apiKey,
        });
        await options.onRequest?.({
          endpoint,
          path,
          query,
          statusCode: null,
          rowsReturned: null,
          durationMs: Date.now() - startedAt,
          providerSearchId: null,
          quota: null,
          errorCode: error.code,
          errorDetail: error.detail,
        });
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(Math.min(500 * 2 ** attempt, 8_000));
          continue;
        }
        throw error;
      }

      const durationMs = Date.now() - startedAt;
      const body = await response.json().catch(() => null) as
        | (ProviderSearchResponse & ProviderAccount)
        | null;

      const quota = endpoint === "account" && body ? readQuota(body) : null;
      const rows = Array.isArray(body?.properties) ? body.properties.length : null;

      // RECORD BEFORE JUDGING. A rejected request has usually still been counted upstream,
      // and a ledger that only sees successes under-reports exactly when it matters.
      await options.onRequest?.({
        endpoint,
        path,
        query,
        statusCode: response.status,
        rowsReturned: rows,
        durationMs,
        providerSearchId: body?.search_metadata?.id ?? null,
        quota,
        errorCode: null,
        errorDetail: null,
      });

      if (response.ok && body && !body.error) return body as T;

      const error = toError(response.status, body, options.apiKey);
      lastError = error;
      if (error.permanent || attempt >= maxRetries) throw error;
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
    }

    throw lastError ?? new SerpApiError({
      status: null,
      code: "exhausted",
      detail: "Retries exhausted with no response.",
      permanent: true,
      apiKey: options.apiKey,
    });
  }

  return {
    search(params: Record<string, string>): Promise<ProviderSearchResponse> {
      return call<ProviderSearchResponse>("search", SERPAPI_SEARCH_URL, params);
    },
    /** Free, and not counted against the monthly quota — so it is the authoritative read. */
    account(): Promise<ProviderAccount> {
      return call<ProviderAccount>("account", SERPAPI_ACCOUNT_URL, {});
    },
  };
}

export type SerpApiClient = ReturnType<typeof createSerpApiClient>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readQuota(body: ProviderAccount): QuotaSnapshot {
  return {
    limit: num(body.searches_per_month),
    // `total_searches_left` includes any extra credits, which is what actually constrains us.
    remaining: num(body.total_searches_left) ?? num(body.plan_searches_left),
    monthUsage: num(body.this_month_usage),
    thisHour: num(body.this_hour_searches),
    hourLimit: num(body.account_rate_limit_per_hour),
  };
}

/**
 * Retryability decided in exactly one place.
 *
 * 401/403 mean the key is wrong or the plan is spent — retrying spends requests to learn
 * nothing. 400 means we built a bad query and will build it again. A 429 is the account's
 * hourly rate limit; retrying inside one request would just burn the rest of the hour, so
 * it is permanent for this call and the limiter upstream is what should have caught it.
 */
function toError(
  status: number,
  body: (ProviderSearchResponse & ProviderAccount) | null,
  apiKey: string,
): SerpApiError {
  const detail = typeof body?.error === "string" ? body.error : `HTTP ${status}`;
  const permanent = status === 400 || status === 401 || status === 403 ||
    status === 404 || status === 429;
  return new SerpApiError({
    status,
    code: permanent ? `provider_${status}` : "provider_unavailable",
    detail,
    permanent,
    apiKey,
  });
}
