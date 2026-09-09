/**
 * Orchestration: cache → limiter → budget → provider → cache.
 *
 * The ORDER is the design. The cache is consulted before the limiter and the limiter before
 * the budget, so the cheapest check runs first and a crawler replaying one URL is stopped by
 * an index lookup rather than by a bill. Nothing here throws at a visitor: every degraded
 * path returns a 200 with a discriminant, because a public marketing page must not show an
 * error card when a third party is having a bad afternoon.
 */
import type { Database } from "../database.types.ts";
import type { Db } from "../db.ts";

type Json = Database["public"]["Tables"]["hotel_search_cache"]["Insert"]["payload"];
import { uuidV7 } from "../uuid.ts";
import {
  type Budget,
  applyQuota,
  exhaustionReason,
  type HotelSearchConfig,
  readBudget,
} from "./budget.ts";
import {
  cacheKey,
  type CanonicalQuery,
  canonicalize,
  echo,
  providerParams,
  type SearchInput,
  ttlSeconds,
} from "./cache.ts";
import {
  createSerpApiClient,
  type RequestRecord,
  SerpApiError,
} from "./client.ts";
import { mapSearchResponse, PAYLOAD_VERSION, rateSpread } from "./map.ts";
import type { HotelSearchPayload, HotelSearchResponse } from "./types.ts";

export interface SearchDeps {
  db: Db;
  apiKey: string;
  config: HotelSearchConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Injected so tests are deterministic; production passes nothing. */
  sleep?: (ms: number) => Promise<void>;
}

interface CacheRow {
  payload: HotelSearchPayload;
  fetched_at: string;
  expires_at: string;
}

/** One row per HTTP attempt. Failures are logged, never thrown — see the cruise recorder. */
function makeRecorder(db: Db, key: string) {
  return async (record: RequestRecord): Promise<void> => {
    const { error } = await db.from("hotel_api_request").insert({
      id: uuidV7(),
      endpoint: record.endpoint,
      path: record.path,
      query: record.query,
      cache_key: record.endpoint === "search" ? key : null,
      status_code: record.statusCode,
      rows_returned: record.rowsReturned,
      duration_ms: record.durationMs,
      provider_search_id: record.providerSearchId,
      quota_limit: record.quota?.limit ?? null,
      quota_remaining: record.quota?.remaining ?? null,
      quota_month_usage: record.quota?.monthUsage ?? null,
      quota_this_hour: record.quota?.thisHour ?? null,
      quota_hour_limit: record.quota?.hourLimit ?? null,
      quota_observed_at: record.quota ? new Date().toISOString() : null,
      error_code: record.errorCode,
      error_detail: record.errorDetail,
    });
    // Losing a whole search because an observability insert failed is the wrong trade.
    if (error) console.error("[hotel-search] ledger insert failed", { code: error.code });
  };
}

async function readCache(db: Db, key: string): Promise<CacheRow | null> {
  const { data, error } = await db
    .from("hotel_search_cache")
    .select("payload, fetched_at, expires_at")
    .eq("cache_key", key)
    .eq("payload_version", PAYLOAD_VERSION)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as CacheRow;
}

async function writeCache(
  db: Db,
  key: string,
  canonical: CanonicalQuery,
  payload: HotelSearchPayload,
  ttl: number,
  now: Date,
): Promise<void> {
  const spread = rateSpread(payload);
  const { error } = await db.from("hotel_search_cache").upsert({
    id: uuidV7(),
    cache_key: key,
    payload_version: PAYLOAD_VERSION,
    query_fingerprint: canonical as unknown as Json,
    payload: payload as unknown as Json,
    result_count: payload.results.length,
    currency: payload.currency,
    lowest_rate_cents: spread.lowest,
    highest_rate_cents: spread.highest,
    fetched_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
  }, { onConflict: "cache_key,payload_version" });
  if (error) console.error("[hotel-search] cache write failed", { code: error.code });
}

export async function runSearch(
  input: SearchInput,
  deps: SearchDeps,
): Promise<HotelSearchResponse> {
  const now = deps.now ?? new Date();
  const canonical = canonicalize(input);
  const key = await cacheKey(canonical);
  const query = echo(canonical);
  const base = {
    version: PAYLOAD_VERSION,
    currency: canonical.currency,
    hasMore: false as const,
    query,
  };

  // 1. Fresh cache. Checked FIRST, before any counter moves.
  const cached = await readCache(deps.db, key);
  if (cached && new Date(cached.expires_at) > now) {
    return {
      ...cached.payload,
      ...base,
      source: "cache",
      degraded: null,
      asOf: cached.fetched_at,
      staleAsOf: null,
    };
  }

  // 2. Budget. `allowance` folds our monthly and hourly ceilings together with whatever the
  //    provider last told us, taking the strictest.
  const budget = await readBudget(deps.db, deps.config, now);
  if (!deps.config.enabled || budget.allowance <= 0) {
    return degraded(base, cached, budget, deps.config, now, "budget_exhausted");
  }

  // 3. The provider.
  const client = createSerpApiClient({
    apiKey: deps.apiKey,
    fetchImpl: deps.fetchImpl,
    onRequest: makeRecorder(deps.db, key),
    sleep: deps.sleep,
  });

  try {
    const raw = await client.search(providerParams(canonical));
    const payload = mapSearchResponse(raw, canonical.currency);
    const ttl = ttlSeconds(canonical.checkIn, isoDay(now), deps.config.cacheTtlSeconds);
    // Written even when empty: a destination that genuinely has nothing must not be
    // re-fetched fifty times before somebody notices.
    await writeCache(deps.db, key, canonical, payload, ttl, now);

    return { ...payload, ...base, source: "live", degraded: null, asOf: now.toISOString(), staleAsOf: null };
  } catch (err) {
    const code = err instanceof SerpApiError ? err.code : "unknown";
    console.warn("[hotel-search] provider call failed", { code });
    return degraded(base, cached, budget, deps.config, now, "provider_unavailable");
  }
}

/**
 * Stale-while-degraded, then empty.
 *
 * An expired-but-recent row with an honest "prices as of Tuesday" line beats a blank page,
 * and it is arguably MORE compliant than a live number: it makes the indicative nature of
 * the figure explicit, which is what §3.8 wants anyway.
 */
function degraded(
  base: { version: number; currency: string; hasMore: false; query: ReturnType<typeof echo> },
  cached: CacheRow | null,
  _budget: Budget,
  config: HotelSearchConfig,
  now: Date,
  reason: "budget_exhausted" | "provider_unavailable",
): HotelSearchResponse {
  if (cached) {
    const age = now.getTime() - new Date(cached.fetched_at).getTime();
    if (age <= config.cacheGraceHours * 3_600_000) {
      return {
        ...cached.payload,
        ...base,
        source: "stale",
        degraded: reason,
        asOf: cached.fetched_at,
        staleAsOf: cached.fetched_at,
      };
    }
  }
  return {
    ...base,
    totalAvailable: null,
    results: [],
    source: "live",
    degraded: reason,
    asOf: now.toISOString(),
    staleAsOf: null,
  };
}

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export { applyQuota, exhaustionReason };
