/**
 * Request accounting for hotel search.
 *
 * Same doctrine as _shared/cruise/budget.ts, and for the same reason: the free tier is 250
 * searches a MONTH at 50 an hour, there is no way to buy an overspent month back, and here
 * the spend is driven by strangers rather than by a schedule we control.
 *
 * OUR COUNT IS A PRE-FLIGHT GUARD, THE PROVIDER IS THE TRUTH. The ledger counts calendar
 * months because that is the only boundary a SQL query can see; SerpApi counts its own
 * billing cycle. So the two legitimately disagree, and ours is the one guessing.
 * `account.json` is free and is not counted against the quota, which makes it the exact
 * analogue of the RapidAPI header the cruise budget trusts over its own arithmetic.
 *
 * One extra wrinkle SerpApi adds: THEIR CACHE DOES NOT COUNT. An identical query inside an
 * hour is served free and we cannot reliably tell from the body. So our ledger OVER-counts,
 * which means we stop early. That is the safe direction and it is why the drift below is
 * worth recording rather than correcting.
 */
import type { Db } from "../db.ts";
import type { QuotaSnapshot } from "./client.ts";

export interface HotelSearchConfig {
  enabled: boolean;
  monthlyCeiling: number;
  hourlyCeiling: number;
  cacheTtlSeconds: number;
  cacheGraceHours: number;
  ratePerMinute: number;
  ratePerHour: number;
  ratePerDay: number;
  globalPerHour: number;
}

export const FALLBACK_CONFIG: HotelSearchConfig = {
  enabled: true,
  monthlyCeiling: 200,
  hourlyCeiling: 40,
  cacheTtlSeconds: 21_600,
  cacheGraceHours: 72,
  ratePerMinute: 6,
  ratePerHour: 30,
  ratePerDay: 60,
  globalPerHour: 40,
};

/**
 * Config lives in a table, not in env: widening after a plan upgrade should be an UPDATE
 * rather than a deploy. A missing row is not a reason to fail a visitor's search, so the
 * defaults above stand in — they are the free tier's, i.e. the safe end.
 */
export async function readConfig(db: Db): Promise<HotelSearchConfig> {
  const { data, error } = await db
    .from("hotel_search_config")
    .select(
      "enabled, monthly_ceiling, hourly_ceiling, cache_ttl_seconds, cache_grace_hours, rate_per_minute, rate_per_hour, rate_per_day, global_per_hour",
    )
    .eq("id", true)
    .maybeSingle();

  if (error || !data) return FALLBACK_CONFIG;

  return {
    enabled: data.enabled,
    monthlyCeiling: data.monthly_ceiling,
    hourlyCeiling: data.hourly_ceiling,
    cacheTtlSeconds: data.cache_ttl_seconds,
    cacheGraceHours: data.cache_grace_hours,
    ratePerMinute: data.rate_per_minute,
    ratePerHour: data.rate_per_hour,
    ratePerDay: data.rate_per_day,
    globalPerHour: data.global_per_hour,
  };
}

export interface Budget {
  /** Our own count for the calendar month. A guard, not the truth. */
  ledgerMonth: number;
  ledgerHour: number;
  monthlyCeiling: number;
  hourlyCeiling: number;
  /** Latest `total_searches_left` the provider reported, if any. */
  quotaRemaining: number | null;
  quotaLimit: number | null;
  /** Requests this call may still make — the smallest of every ceiling that applies. */
  allowance: number;
  /**
   * (limit - remaining) - ledgerMonth, when the provider reported both. POSITIVE is the
   * interesting direction: quota was spent that our ledger never saw — another environment
   * sharing the key, their cache not counting, or their cycle not matching the month. On a
   * credential that travels in a query string it is also the first signal that somebody
   * else has it.
   */
  drift: number | null;
}

export function monthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function hourStart(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export async function readBudget(
  db: Db,
  config: HotelSearchConfig,
  now: Date = new Date(),
): Promise<Budget> {
  const since = monthStart(now);
  const sinceHour = hourStart(now);

  const [monthCount, hourCount, latest] = await Promise.all([
    db.from("hotel_api_request").select("id", { count: "exact", head: true })
      .eq("endpoint", "search").gte("created_at", since),
    db.from("hotel_api_request").select("id", { count: "exact", head: true })
      .eq("endpoint", "search").gte("created_at", sinceHour),
    db.from("hotel_api_request").select("quota_limit, quota_remaining")
      // Only trusted within the current month: past that it describes a cycle that has
      // certainly turned over, and a stale "3 remaining" would wedge the feature shut.
      .gte("created_at", since)
      .not("quota_remaining", "is", null)
      .order("quota_observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ledgerMonth = monthCount.count ?? 0;
  const ledgerHour = hourCount.count ?? 0;
  const quotaRemaining = latest.data?.quota_remaining ?? null;
  const quotaLimit = latest.data?.quota_limit ?? null;

  return finalise({
    ledgerMonth,
    ledgerHour,
    monthlyCeiling: config.monthlyCeiling,
    hourlyCeiling: config.hourlyCeiling,
    quotaRemaining,
    quotaLimit,
    allowance: 0,
    drift: null,
  });
}

export function applyQuota(budget: Budget, quota: QuotaSnapshot): Budget {
  return finalise({
    ...budget,
    quotaRemaining: quota.remaining ?? budget.quotaRemaining,
    quotaLimit: quota.limit ?? budget.quotaLimit,
  });
}

function finalise(budget: Budget): Budget {
  const byMonth = Math.max(0, budget.monthlyCeiling - budget.ledgerMonth);
  const byHour = Math.max(0, budget.hourlyCeiling - budget.ledgerHour);
  const byCeiling = Math.min(byMonth, byHour);

  // The provider wins whenever it is stricter, and is never used to grant MORE than our
  // ceiling — the reserve held back for the inquiry step has to survive a generous read.
  const allowance = budget.quotaRemaining === null
    ? byCeiling
    : Math.max(0, Math.min(byCeiling, budget.quotaRemaining));

  const drift = budget.quotaLimit !== null && budget.quotaRemaining !== null
    ? (budget.quotaLimit - budget.quotaRemaining) - budget.ledgerMonth
    : null;

  return { ...budget, allowance, drift };
}

export function exhaustionReason(budget: Budget): string {
  if (budget.quotaRemaining !== null && budget.quotaRemaining <= 0) {
    return "the provider reports no searches left this cycle";
  }
  if (budget.ledgerMonth >= budget.monthlyCeiling) {
    return `the monthly ceiling of ${budget.monthlyCeiling} is spent`;
  }
  return `the hourly ceiling of ${budget.hourlyCeiling} is spent`;
}
