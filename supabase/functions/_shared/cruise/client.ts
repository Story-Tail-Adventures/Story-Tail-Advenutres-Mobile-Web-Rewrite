/**
 * track.cruises HTTP client (Free-Travel-APIs §4.8).
 *
 * Everything odd about this file traces to one fact: the free tier is 100 requests a MONTH,
 * and the month does not roll over early because we were careless. So the client is built to
 * (a) never spend a request it did not mean to, (b) report what every request cost, and
 * (c) fail permanently rather than retry when a retry cannot possibly succeed.
 *
 * THE RELAY IS NOT THE BACKEND, AND THAT SHOWS UP IN THE ERRORS. All tiers route through
 * RapidAPI (`cruise-pricing-api1.p.rapidapi.com`); there is no direct subscription. Two
 * consequences the hard way:
 *
 *   * Errors come in TWO shapes. Their backend returns RFC 9457 problem+json with `code` and
 *     `request_id`; the relay, when its own throttle trips or the key is bad, returns
 *     `{"message": "..."}` with neither. Their spec says handlers must tolerate both, and it
 *     is right — a probe of /coverage with no key returns the relay's shape, not theirs.
 *   * `/coverage` is documented "Public, no auth required", and that is true of their
 *     backend but NOT of the relay in front of it. It 401s without a key like everything
 *     else, and it counts against the quota like everything else. There is no free probe.
 *
 * THE RELAY CACHES, AND CACHING DOES NOT REFUND. Two identical requests seconds apart come
 * back byte-identical — same `request_id` ULID and all — while STILL decrementing the quota.
 * Observed: a repeat run took 0.71s against 1.31s and burned its three requests anyway. So a
 * duplicate `provider_request_id` in the ledger is the relay serving a cached body, not this
 * module reusing an id, and re-running to "get fresher data" buys nothing but spends real
 * budget. It is also why the incremental levers live in cruise_sync_scope rather than in a
 * retry.
 *
 * THE RELAY ALSO TELLS THE TRUTH ABOUT THE BUDGET, on every single response:
 * x-ratelimit-requests-limit / -remaining / -reset. That is more trustworthy than any count
 * we keep, because quota gets spent from other places — a second environment, a manual curl.
 * So every response's headers are captured and handed to the caller; budget.ts treats them
 * as authoritative and our own ledger as a pre-flight guard. See §24.9.
 *
 * `fetch` IS INJECTED. ci.yml runs the PR workflow with zero secrets and no network by
 * design ("That is deliberate; keep it that way"), so the tests drive this with a stub over
 * committed fixtures. A module-level `fetch` would make this file untestable there.
 */
import type {
  ProviderCoverage,
  ProviderCruise,
  ProviderCruiseLine,
  ProviderFilterOptions,
  ProviderItemEnvelope,
  ProviderListEnvelope,
  ProviderPort,
  ProviderProblem,
  ProviderShip,
} from "./types.ts";

export const TRACK_CRUISES_HOST = "cruise-pricing-api1.p.rapidapi.com";
const BASE_URL = `https://${TRACK_CRUISES_HOST}`;

/** Mirrors the cruise_sync_endpoint enum, so a ledger row is one lookup away. */
export type SyncEndpoint =
  | "cruise_lines"
  | "filter_options"
  | "coverage"
  | "ships"
  | "ports"
  | "cruises"
  | "cruise_detail";

export interface QuotaSnapshot {
  /** x-ratelimit-requests-limit — the plan's monthly cap (100 on BASIC). */
  limit: number | null;
  /** x-ratelimit-requests-remaining — authoritative. See budget.ts. */
  remaining: number | null;
  /** x-ratelimit-requests-reset — seconds until the quota resets. */
  resetSeconds: number | null;
}

/** One ledger row's worth of fact, handed to the recorder for EVERY attempt. */
export interface RequestRecord {
  endpoint: SyncEndpoint;
  path: string;
  /** Sanitised: request parameters only, never headers, never the key. */
  query: Record<string, string>;
  statusCode: number | null;
  rowsReturned: number | null;
  durationMs: number;
  providerRequestId: string | null;
  quota: QuotaSnapshot;
  errorCode: string | null;
  errorDetail: string | null;
}

export type RequestRecorder = (record: RequestRecord) => Promise<void> | void;

export class TrackCruisesError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string,
    /**
     * ALREADY REDACTED, at construction rather than at the one call site that writes a
     * ledger row — because `detail` does not stop there. It also reaches
     * cruise_sync_scope.last_error, cruise_sync_run.error_detail,
     * audit_event.metadata.notes and the function's own HTTP response body. Redacting at
     * one of five readers protects one of five.
     */
    readonly detail: string,
    /** True when retrying cannot succeed: bad key, bad request, tier gate. */
    readonly permanent: boolean,
    readonly retryAfterSeconds: number | null = null,
    readonly requiredTier: string | null = null,
    readonly providerRequestId: string | null = null,
    /**
     * The quota the relay reported on the response that failed.
     *
     * Carried on the error because otherwise it is lost precisely when it matters most: a
     * 429 whose headers say "0 remaining" is the most useful budget signal there is, and
     * dropping it forces the caller to null out what it already knew. budget.ts's whole
     * invariant is that the header wins — an error path that discards the header breaks it.
     */
    readonly quota: QuotaSnapshot = { limit: null, remaining: null, resetSeconds: null },
  ) {
    super(`${code}: ${detail}`);
    this.name = "TrackCruisesError";
  }
}

export interface ClientOptions {
  apiKey: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Called for every attempt, before success or failure is decided. */
  onRequest?: RequestRecorder;
  /** Retries for transient failures only. Default 2, i.e. 3 attempts. */
  maxRetries?: number;
  /** Overridable so tests do not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface Page<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
  quota: QuotaSnapshot;
}

export interface ListParams {
  limit?: number;
  /** Opaque cursor from a previous page's nextCursor. */
  startingAfter?: string;
  company?: string;
  locale?: string;
}

export interface CruiseListParams extends ListParams {
  sort?:
    | "departure_date:asc"
    | "departure_date:desc"
    | "updated_at:asc"
    | "updated_at:desc";
  departureAfter?: string;
  departureBefore?: string;
  destination?: string;
  ship?: string;
  port?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTrackCruisesClient(options: ClientOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(
    endpoint: SyncEndpoint,
    path: string,
    query: Record<string, string | undefined>,
  ): Promise<{ body: T; quota: QuotaSnapshot }> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }

    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, v);

    let attempt = 0;
    for (;;) {
      const started = Date.now();
      let statusCode: number | null = null;
      let quota: QuotaSnapshot = { limit: null, remaining: null, resetSeconds: null };
      let providerRequestId: string | null = null;
      let rowsReturned: number | null = null;
      let failure: TrackCruisesError | null = null;
      let body: T | null = null;

      try {
        const response = await doFetch(url.toString(), {
          method: "GET",
          headers: {
            // RapidAPI's two required headers. The key is never logged, never persisted,
            // and never placed in a URL — a query-string key ends up in every access log
            // between here and there.
            "X-RapidAPI-Key": options.apiKey,
            "X-RapidAPI-Host": TRACK_CRUISES_HOST,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        statusCode = response.status;
        quota = readQuota(response.headers);

        const text = await response.text();
        const parsed = safeJsonParse(text);

        if (!response.ok) {
          failure = toError(response, parsed, text, quota, options.apiKey);
          providerRequestId = failure.providerRequestId;
        } else {
          body = (parsed ?? {}) as T;
          providerRequestId = extractRequestId(parsed);
          rowsReturned = countRows(parsed);
        }
      } catch (err) {
        // Network-level: timeout, DNS, abort. statusCode stays null, which is exactly what
        // "the request never completed" means in the ledger.
        failure = new TrackCruisesError(
          null,
          "network_error",
          redact(err instanceof Error ? err.message : String(err), options.apiKey),
          false,
        );
      }

      // Record BEFORE judging. A rejected request has usually still been counted by the
      // relay, so a ledger that only wrote successes would drift optimistic in precisely
      // the situation where the number matters. See cruise_api_request.status_code.
      if (options.onRequest) {
        await options.onRequest({
          endpoint,
          path,
          query: clean,
          statusCode,
          rowsReturned,
          durationMs: Date.now() - started,
          providerRequestId,
          quota,
          errorCode: failure?.code ?? null,
          errorDetail: failure?.detail ?? null,
        });
      }

      if (!failure) return { body: body as T, quota };

      const canRetry = !failure.permanent && attempt < maxRetries;
      if (!canRetry) throw failure;

      // Honour the server's own number when it gave one; otherwise back off. Capped,
      // because an Edge Function has 150s total (Tech-Recommendations §7) and a 429 that
      // resets next month is not something to wait out inside a request.
      const waitMs = failure.retryAfterSeconds !== null
        ? Math.min(failure.retryAfterSeconds * 1000, 30_000)
        : Math.min(500 * 2 ** attempt, 8_000);
      await sleep(waitMs);
      attempt += 1;
    }
  }

  async function listPage<T>(
    endpoint: SyncEndpoint,
    path: string,
    query: Record<string, string | undefined>,
  ): Promise<Page<T>> {
    const { body, quota } = await request<ProviderListEnvelope<T>>(endpoint, path, query);
    return {
      data: Array.isArray(body.data) ? body.data : [],
      hasMore: body.has_more === true,
      nextCursor: body.next_cursor ?? null,
      quota,
    };
  }

  return {
    /**
     * All ten lines in ONE request. No `limit` parameter, so the tier row-cap does not
     * apply — and even if it silently did, BASIC's cap is 10 and there are exactly 10
     * lines. cruise_api_request.rows_returned is what would reveal it either way.
     */
    cruiseLines(): Promise<Page<ProviderCruiseLine>> {
      return listPage<ProviderCruiseLine>("cruise_lines", "/cruise-lines", {});
    },

    /**
     * Companies, locales, destinations, ship names and ports in one request. This is the
     * cheap route to the vocabularies /ships and /ports charge 10 rows at a time for.
     */
    async filterOptions(company?: string): Promise<{
      data: ProviderFilterOptions;
      quota: QuotaSnapshot;
    }> {
      const { body, quota } = await request<ProviderItemEnvelope<ProviderFilterOptions>>(
        "filter_options",
        "/filter-options",
        { company },
      );
      // Their spec does not pin whether this endpoint wraps in `data`. Accept both rather
      // than spend a request finding out, then losing it to a shape assumption.
      const data = (body?.data ?? body ?? {}) as ProviderFilterOptions;
      return { data, quota };
    },

    coverage(company?: string): Promise<Page<ProviderCoverage>> {
      return listPage<ProviderCoverage>("coverage", "/coverage", { company });
    },

    ships(params: ListParams = {}): Promise<Page<ProviderShip>> {
      return listPage<ProviderShip>("ships", "/ships", listQuery(params));
    },

    ports(params: ListParams = {}): Promise<Page<ProviderPort>> {
      return listPage<ProviderPort>("ports", "/ports", listQuery(params));
    },

    cruises(params: CruiseListParams = {}): Promise<Page<ProviderCruise>> {
      return listPage<ProviderCruise>("cruises", "/cruises", {
        ...listQuery(params),
        sort: params.sort,
        departure_after: params.departureAfter,
        departure_before: params.departureBefore,
        destination: params.destination,
        ship: params.ship,
        port: params.port,
      });
    },

    /**
     * One sailing, with `cabin_prices_per_person` the list endpoint omits.
     *
     * `company` is not optional in practice even though their spec allows omitting it:
     * cruise ids are unique only per line, and Princess and Holland America share the
     * `Y731` voyage-code format. Omitting it is how you fetch the wrong ship's prices.
     */
    async cruise(
      cruiseId: string,
      company: string,
    ): Promise<{ data: ProviderCruise; quota: QuotaSnapshot }> {
      const { body, quota } = await request<ProviderItemEnvelope<ProviderCruise>>(
        "cruise_detail",
        `/cruises/${encodeURIComponent(cruiseId)}`,
        { company },
      );
      return { data: body.data, quota };
    },
  };
}

export type TrackCruisesClient = ReturnType<typeof createTrackCruisesClient>;

function listQuery(params: ListParams): Record<string, string | undefined> {
  return {
    limit: params.limit !== undefined ? String(params.limit) : undefined,
    // Their pagination is cursor-only. There is deliberately no page/offset here because
    // there is no page/offset there — passing one is silently ignored, which reads as a
    // stuck loop paying for page 1 forever.
    starting_after: params.startingAfter,
    company: params.company,
    locale: params.locale,
  };
}

function readQuota(headers: Headers): QuotaSnapshot {
  return {
    limit: intHeader(headers, "x-ratelimit-requests-limit"),
    remaining: intHeader(headers, "x-ratelimit-requests-remaining"),
    resetSeconds: intHeader(headers, "x-ratelimit-requests-reset"),
  };
}

function intHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractRequestId(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && "request_id" in parsed) {
    const id = (parsed as { request_id?: unknown }).request_id;
    if (typeof id === "string") return id;
  }
  return null;
}

/**
 * Rows in the response, for the ledger. Detects a silent tier clamp: the provider clamps an
 * over-tier `limit` down to the cap and still answers 200, so a run that asks for 100 and is
 * quietly handed 10 looks perfectly healthy without this.
 */
function countRows(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = (parsed as { data?: unknown }).data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") return 1;
  return null;
}

/**
 * Both error shapes, into one error.
 *
 * Retryability is decided here and only here, because getting it wrong is expensive in both
 * directions: retrying a 401 burns three requests to learn the key is still bad, and not
 * retrying a 503 loses a run to a blip.
 */
function toError(
  response: Response,
  parsed: unknown,
  rawText: string,
  quota: QuotaSnapshot,
  apiKey: string,
): TrackCruisesError {
  const status = response.status;
  const problem = (parsed ?? {}) as ProviderProblem & { message?: string };

  // Shape 1: their backend, RFC 9457. Shape 2: the relay, `{"message": "..."}` with no
  // code and no request_id — only ever seen through cruise-pricing-api1.p.rapidapi.com.
  const code = problem.code ?? relayCode(status);
  const fallback = rawText.slice(0, 300) || `HTTP ${status}`;
  const detail = problem.detail ?? problem.message ?? problem.title ?? fallback;

  const retryAfterHeader = intHeader(response.headers, "retry-after");
  const retryAfter = problem.retry_after_seconds ?? retryAfterHeader ?? null;

  // 401 — the key is wrong or unsubscribed. 403 — a tier gate (price-history on BASIC);
  // their spec sets `required_tier` on these. 400/404 — our bug or a real absence.
  // Every one of those is permanent: a retry cannot change the answer and each attempt is
  // metered.
  const permanent = status === 400 || status === 401 || status === 403 || status === 404;

  return new TrackCruisesError(
    status,
    code,
    redact(detail, apiKey),
    permanent,
    retryAfter,
    problem.required_tier ?? null,
    problem.request_id ?? null,
    quota,
  );
}

function relayCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "tier_insufficient";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit_exceeded";
  if (status >= 500) return "upstream_error";
  return `http_${status}`;
}

/**
 * Last line of defence before an error string is persisted or logged. The key should never
 * reach here — it lives only in a header — but `error_detail` outlives the incident, and a
 * credential in a table is worse than the failure that put it there.
 */
function redact(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("[redacted]");
}
