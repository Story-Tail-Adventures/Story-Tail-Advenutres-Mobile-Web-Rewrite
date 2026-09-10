/**
 * SerpApi client, built on the provider's official library (`deno.land/x/serpapi`).
 *
 * WHY THE LIBRARY, AND WHAT IT COST. This file used to own the HTTP call. It now delegates
 * transport to `getJson`/`getAccount` and keeps everything that call sits inside: the
 * ledger write, the retry policy, the timeout, and the redaction. The library supplies a
 * request and nothing else — no retries (it documents none), a 60s default timeout, and an
 * error channel described below — so "just call getJson" would have quietly removed three
 * safeguards the 250-a-month budget depends on.
 *
 * THE ONE REAL LOSS: THE HTTP STATUS CODE. The library resolves on 200 and, on anything
 * else, rejects with the raw response body AS A STRING — not an Error, and with no status
 * attached (`src/utils.ts`: `if (resp.statusCode == 200) resolve(data); else reject(data)`).
 * Verified against the real Edge Runtime, not just the docs: a rejection arrives as
 * `typeof "string"`. So `statusCode` is now null on every failed attempt, and retryability
 * is inferred from the provider's message instead of from 401/429/5xx. `classify()` is that
 * inference, and it is a weaker instrument than a status code — deliberately conservative:
 * anything it does not recognise is treated as transient and retried, because the previous
 * behaviour retried 5xx.
 *
 * SERPAPI TAKES ITS CREDENTIAL AS A QUERY PARAMETER, so the cruise client's invariant ("the
 * key is never logged, never persisted, never placed in a URL") cannot hold literally. It is
 * preserved where it matters, by ORDERING rather than by filtering: `buildCall` derives the
 * sanitised copy of the parameters BEFORE attaching the key, and returns both. There is no
 * code path where someone has to remember to strip it, because it was never in the thing we
 * keep.
 *
 * Everything downstream is defence in depth: `redact()` runs at error construction, and the
 * ledger's CHECK constraints refuse a row containing `api_key` at all.
 */
import { getAccount, getJson } from "serpapi";
import type { AccountApiParameters, EngineParameters } from "serpapi";
import type { ProviderAccount, ProviderSearchResponse } from "./types.ts";

/**
 * Our LABEL for each endpoint, not a captured URL — we no longer build one. Kept at the
 * historical values so `hotel_api_request.path` stays comparable across the change.
 */
export const SEARCH_PATH = "/search";
export const ACCOUNT_PATH = "/account.json";

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
  /** SANITISED. Never contains `api_key` — see `buildCall`. */
  query: Record<string, string>;
  /**
   * 200 on success; NULL on every failure. The library does not surface the provider's
   * status — see the header. A null here means "the attempt failed", and `errorCode`
   * carries what we could infer about why.
   */
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
 * Build the parameters we hand the library, and the copy we are allowed to keep.
 *
 * The ordering is the control: `query` is taken from `params`, which never contained the
 * key, and only then are the key and timeout added. `callParams` is passed straight to
 * `getJson` and read by nothing else here.
 */
export function buildCall(
  params: Record<string, string>,
  apiKey: string,
  timeoutMs: number,
): { callParams: Record<string, string | number>; query: Record<string, string> } {
  const query = { ...params };
  return { callParams: { ...params, api_key: apiKey, timeout: timeoutMs }, query };
}

/** The library's two calls, injectable so the tests never touch the network. */
export type ProviderCall = (
  params: Record<string, string | number>,
) => Promise<unknown>;

export interface ClientOptions {
  apiKey: string;
  onRequest?: RequestRecorder;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Defaults to the library. Injected by client_test.ts. */
  searchImpl?: ProviderCall;
  accountImpl?: ProviderCall;
}

/**
 * 12s per attempt, NOT the library's 60s default.
 *
 * The web caller (web/lib/public/hotels.ts) aborts at 14s, chosen to sit just above this.
 * Taking the library's default would put the provider's ceiling four times beyond the
 * caller's, so every slow attempt would be abandoned by the browser while still counting
 * against the month.
 */
const DEFAULT_TIMEOUT_MS = 12_000;

export function createSerpApiClient(options: ClientOptions) {
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const searchImpl = options.searchImpl ??
    ((p) => getJson(p as unknown as EngineParameters));
  const accountImpl = options.accountImpl ??
    ((p) => getAccount(p as unknown as AccountApiParameters));

  async function call<T>(
    endpoint: "search" | "account",
    path: string,
    impl: ProviderCall,
    params: Record<string, string>,
  ): Promise<T> {
    const { callParams, query } = buildCall(params, options.apiKey, timeoutMs);

    let lastError: SerpApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const startedAt = Date.now();
      let body: (ProviderSearchResponse & ProviderAccount) | null = null;
      let error: SerpApiError | null = null;

      try {
        body = coerce(await impl(callParams));
        // SerpApi answers some failures with HTTP 200 and an error body. Mapping that to
        // "no hotels here" would cache an empty page for six hours, so it is a failure —
        // and the library cannot tell us, because it resolved.
        if (!body || typeof body.error === "string") {
          error = classify(body?.error ?? "Empty response body.", options.apiKey);
        }
      } catch (cause) {
        error = classify(cause, options.apiKey);
      }

      const durationMs = Date.now() - startedAt;
      const quota = endpoint === "account" && body && !error ? readQuota(body) : null;
      const rows = Array.isArray(body?.properties) ? body.properties.length : null;

      // RECORD BEFORE JUDGING — i.e. before deciding whether to retry or throw. A rejected
      // request has usually still been counted upstream, and a ledger that only sees
      // successes under-reports exactly when it matters.
      await options.onRequest?.({
        endpoint,
        path,
        query,
        statusCode: error ? null : 200,
        rowsReturned: rows,
        durationMs,
        providerSearchId: body?.search_metadata?.id ?? null,
        quota,
        errorCode: error?.code ?? null,
        errorDetail: error?.detail ?? null,
      });

      if (!error) return body as T;

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
      return call<ProviderSearchResponse>("search", SEARCH_PATH, searchImpl, params);
    },
    /** Free, and not counted against the monthly quota — so it is the authoritative read. */
    account(): Promise<ProviderAccount> {
      return call<ProviderAccount>("account", ACCOUNT_PATH, accountImpl, {});
    },
  };
}

export type SerpApiClient = ReturnType<typeof createSerpApiClient>;

/**
 * The library resolves with parsed JSON, but its own types are loose enough that a string
 * is reachable, and a stub can hand us one. Parse rather than trust.
 */
function coerce(value: unknown): (ProviderSearchResponse & ProviderAccount) | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return (value ?? null) as (ProviderSearchResponse & ProviderAccount) | null;
}

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
 * Retryability decided in exactly one place — now from the provider's MESSAGE, because the
 * library gives us no status code.
 *
 * The old rule was a status list: 400/401/403/404/429 permanent, 5xx retried. These
 * patterns are the same intent expressed against the only evidence left. Note the default:
 * UNRECOGNISED IS TRANSIENT. Getting that backwards would turn one bad minute at the
 * provider into a hard failure, whereas the cost of the other mistake is two extra attempts
 * that the ledger records and the budget already caps.
 */
const PERMANENT: ReadonlyArray<{ pattern: RegExp; code: string }> = [
  // A wrong or missing credential. Retrying spends attempts to learn nothing.
  {
    pattern: /invalid api[_ ]?key|missing api[_ ]?key|api[_ ]?key.*(invalid|missing)/i,
    code: "provider_invalid_key",
  },
  // The plan is spent. This is the wall the budget exists to stay clear of.
  {
    pattern:
      /run out of searches|no searches left|searches left.*0|exceeded your|upgrade your plan|plan.*exhaust/i,
    code: "provider_quota",
  },
  // The account's hourly limit. Retrying inside one request would burn the rest of the hour.
  { pattern: /rate limit|too many requests|throttl/i, code: "provider_rate_limited" },
  // We built a bad query and will build it again.
  {
    pattern:
      /missing (query|parameter|the)|unsupported|not supported|invalid (parameter|value|query|engine)/i,
    code: "provider_bad_request",
  },
];

/**
 * The library's own error names, matched as STRINGS rather than with `instanceof`.
 *
 * `RequestTimeoutError` is thrown but NOT exported from `mod.ts` (checked against 2.2.1's
 * runtime exports, which are the three below plus the functions), so it cannot be
 * referenced. Matching every one of them the same way beats an `instanceof` for three and a
 * name check for the fourth.
 *
 * The three validation errors are raised LOCALLY, before any request: retrying them would
 * be three passes over the same bad input. Only the timeout is worth another attempt.
 */
const LIBRARY_ERRORS: Readonly<Record<string, { code: string; permanent: boolean }>> = {
  RequestTimeoutError: { code: "provider_timeout", permanent: false },
  MissingApiKeyError: { code: "provider_invalid_key", permanent: true },
  InvalidArgumentError: { code: "provider_bad_request", permanent: true },
  InvalidTimeoutError: { code: "provider_bad_request", permanent: true },
};

export function classify(rejection: unknown, apiKey: string): SerpApiError {
  const name = (rejection as { name?: string })?.name;
  const known = name ? LIBRARY_ERRORS[name] : undefined;
  if (known) {
    return new SerpApiError({
      status: null,
      code: known.code,
      detail: messageOf(rejection) || name!,
      permanent: known.permanent,
      apiKey,
    });
  }

  const detail = messageOf(rejection);

  for (const { pattern, code } of PERMANENT) {
    if (pattern.test(detail)) {
      return new SerpApiError({ status: null, code, detail, permanent: true, apiKey });
    }
  }

  return new SerpApiError({
    status: null,
    // Kept from the old taxonomy: this is still "the provider did not answer usefully".
    code: rejection instanceof Error ? "network_error" : "provider_unavailable",
    detail,
    permanent: false,
    apiKey,
  });
}

/**
 * A rejection is a raw body STRING, an Error, or the parsed body. Reach the provider's own
 * sentence in all three cases: an operator watching the budget drain needs to tell a bad
 * key from "no results for that week", and `errorCode` alone cannot say it.
 */
function messageOf(rejection: unknown): string {
  if (typeof rejection === "string") {
    try {
      const parsed = JSON.parse(rejection);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {
      // Not JSON — an HTML error page or a bare sentence. Use it as it came.
    }
    return rejection;
  }
  if (rejection instanceof Error) return rejection.message;
  if (rejection && typeof (rejection as { error?: unknown }).error === "string") {
    return (rejection as { error: string }).error;
  }
  return String(rejection);
}
