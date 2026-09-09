/**
 * Request accounting for the cruise sync (Data-Model §24.9).
 *
 * The provider's free tier is 100 requests a month. That is small enough that "roughly
 * right" is not good enough: overspend and the catalogue stops refreshing until the cycle
 * turns, with no way to buy the month back.
 *
 * TWO CLOCKS, AND THEY DO NOT AGREE. This is the fact the whole module is shaped around.
 * Our ledger counts calendar months, because that is the only boundary a SQL query can see.
 * RapidAPI counts the SUBSCRIPTION BILLING CYCLE, which starts on whatever day the plan was
 * taken out. So on any given day the two numbers legitimately differ, and ours is the one
 * that is guessing.
 *
 * Hence the rule: OUR COUNT IS A PRE-FLIGHT GUARD, THE HEADER IS THE TRUTH. Every response
 * carries x-ratelimit-requests-remaining. Whenever it is lower than our ledger implies —
 * a mid-cycle reset, quota spent from another environment, a manual curl, a colleague's
 * test — the header wins, the drift is recorded, and the run stops. We never conclude we
 * have budget left because our own arithmetic said so.
 *
 * The ceiling is deliberately below the plan limit. The reserve is for the quote-time detail
 * fetch, which spends quota outside any run and must not find the tank empty because a
 * background job drank it: a client clicking "request a quote" is worth more than a
 * catalogue refresh.
 */
import type { Db } from "../db.ts";
import { uuidV7 } from "../uuid.ts";
import type { QuotaSnapshot, RequestRecord } from "./client.ts";

/**
 * Requests per calendar month this service may spend. 90 of the free tier's 100, leaving 10
 * for quote-time detail fetches and manual runs. Override with CRUISE_SYNC_MONTHLY_CEILING
 * when the plan changes — PRO is 10,000, and nothing else in the code needs to know.
 */
export const DEFAULT_MONTHLY_CEILING = 90;

export function monthlyCeiling(): number {
  const raw = Deno.env.get("CRUISE_SYNC_MONTHLY_CEILING");
  if (!raw) return DEFAULT_MONTHLY_CEILING;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_CEILING;
}

export interface Budget {
  /** Our own count for the current calendar month. A guard, not the truth. */
  ledgerSpent: number;
  ceiling: number;
  /** Most recent x-ratelimit-requests-remaining we have seen, if any. */
  quotaRemaining: number | null;
  quotaLimit: number | null;
  /**
   * Requests this run may still make — the smaller of what our ceiling allows and what
   * the relay says is left.
   */
  allowance: number;
  /**
   * (limit - remaining) - ledgerSpent, when the relay reported both. Positive means quota
   * was spent that our ledger never saw, which is the case worth logging: it is either
   * another environment sharing the key, or the billing cycle not lining up with the month.
   */
  drift: number | null;
}

/** UTC first-of-month. The ledger index is on created_at, so this is a range scan. */
export function monthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Pre-flight read: what has this calendar month cost, and what did the relay last say.
 *
 * The stored quota figure is only trusted within the current month. Past that it describes
 * a cycle that has certainly turned over, and a stale "3 remaining" would wedge the sync
 * shut for a month with no way to notice.
 */
export async function readBudget(db: Db, ceiling = monthlyCeiling()): Promise<Budget> {
  const since = monthStart();

  const { count, error: countError } = await db
    .from("cruise_api_request")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if (countError) {
    throw new Error(`cruise budget read failed: ${countError.message}`);
  }

  const { data: latest, error: latestError } = await db
    .from("cruise_api_request")
    .select("quota_limit, quota_remaining")
    .gte("created_at", since)
    .not("quota_remaining", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`cruise quota read failed: ${latestError.message}`);
  }

  const ledgerSpent = count ?? 0;
  return finalise({
    ledgerSpent,
    ceiling,
    quotaRemaining: latest?.quota_remaining ?? null,
    quotaLimit: latest?.quota_limit ?? null,
    allowance: 0,
    drift: null,
  });
}

/**
 * Fold a fresh response's headers into the budget. Called after every request, so the run
 * reacts to the relay's own number rather than to its own counting.
 */
export function applyQuota(budget: Budget, quota: QuotaSnapshot): Budget {
  return finalise({
    ...budget,
    ledgerSpent: budget.ledgerSpent + 1,
    quotaRemaining: quota.remaining ?? budget.quotaRemaining,
    quotaLimit: quota.limit ?? budget.quotaLimit,
  });
}

function finalise(budget: Budget): Budget {
  const byCeiling = Math.max(0, budget.ceiling - budget.ledgerSpent);
  // The header wins whenever it is stricter. It is never used to grant MORE than the
  // ceiling: the reserve for quote-time fetches has to survive a generous-looking header.
  const allowance = budget.quotaRemaining === null
    ? byCeiling
    : Math.max(0, Math.min(byCeiling, budget.quotaRemaining));

  const drift = budget.quotaLimit !== null && budget.quotaRemaining !== null
    ? (budget.quotaLimit - budget.quotaRemaining) - budget.ledgerSpent
    : null;

  return { ...budget, allowance, drift };
}

/** Human-readable reason a run stopped or was skipped, for cruise_sync_run.error_detail. */
export function exhaustionReason(budget: Budget): string {
  if (budget.quotaRemaining !== null && budget.quotaRemaining <= 0) {
    return "provider reports no requests remaining on the plan";
  }
  if (budget.ledgerSpent >= budget.ceiling) {
    return `monthly ceiling reached (${budget.ledgerSpent}/${budget.ceiling} this month)`;
  }
  return `no allowance left (ceiling ${budget.ceiling}, relay remaining ` +
    `${budget.quotaRemaining ?? "unknown"})`;
}

/**
 * A recorder for the client's onRequest hook — one ledger row per attempt.
 *
 * Deliberately swallows its own write errors. The ledger is important, but losing a whole
 * sync run because an observability insert failed is the wrong trade, and the request it
 * describes has already been spent either way. It logs loudly instead.
 */
export function makeRecorder(db: Db, runId: string | null) {
  return async function record(entry: RequestRecord): Promise<void> {
    const { error } = await db.from("cruise_api_request").insert({
      id: uuidV7(),
      run_id: runId,
      endpoint: entry.endpoint,
      path: entry.path,
      query: entry.query,
      status_code: entry.statusCode,
      rows_returned: entry.rowsReturned,
      duration_ms: entry.durationMs,
      provider_request_id: entry.providerRequestId,
      quota_limit: entry.quota.limit,
      quota_remaining: entry.quota.remaining,
      quota_reset_seconds: entry.quota.resetSeconds,
      error_code: entry.errorCode,
      error_detail: entry.errorDetail,
    });

    if (error) {
      console.error(
        `cruise_api_request insert failed for ${entry.endpoint}: ${error.message}`,
      );
    }
  };
}
