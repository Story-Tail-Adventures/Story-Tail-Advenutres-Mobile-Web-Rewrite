/**
 * Per-caller rate limiting.
 *
 * This is the first application-level limiter in the codebase, because nothing before it
 * was both reachable by strangers and metered per call. The Supabase anon key is public —
 * it is inlined into the browser bundle — so "only our server calls this" is a claim the
 * shared caller token makes, and this is what holds if that token ever leaks.
 *
 * THE RAW IP NEVER LEAVES THIS MODULE. It is hashed with a server-only pepper before it is
 * used as a key. Data-Model classifies IP as PII, and a counter is not a licence to keep a
 * visitor log on a public marketing route — a peppered digest can be compared but not
 * enumerated back to an address. A CHECK constraint on the table refuses anything else.
 */
import type { Db } from "../db.ts";

export type RateWindow = "minute" | "hour" | "day";

/** UTC window boundaries. One clock, so two workers agree on which bucket they are in. */
export function windowStart(kind: RateWindow, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  if (kind === "minute") return d.toISOString();
  d.setUTCMinutes(0);
  if (kind === "hour") return d.toISOString();
  d.setUTCHours(0);
  return d.toISOString();
}

/**
 * `ip:<sha256 hex>`, or the shared `unknown` bucket.
 *
 * A request with no forwarded address gets the tighter shared bucket rather than a free
 * pass — "no header" must not be the way around the limiter.
 */
export async function bucketKey(ip: string | null, pepper: string): Promise<string> {
  if (!ip) return "unknown";
  const bytes = new TextEncoder().encode(`${ip}${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ip:${hex}`;
}

/** The left-most entry is the client; the rest are proxies that appended themselves. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export interface RateVerdict {
  allowed: boolean;
  /** The window that refused, for the Retry-After hint. */
  refusedBy: RateWindow | null;
}

/**
 * Take one token from each window, and refuse if any is over.
 *
 * Every window is incremented even when an earlier one already refused: a caller hammering
 * the endpoint should still accumulate in the hour and day buckets, or a burst every minute
 * would never trip the longer limits.
 */
export async function takeTokens(
  db: Db,
  key: string,
  limits: { minute: number; hour: number; day: number },
  now: Date = new Date(),
): Promise<RateVerdict> {
  const windows: Array<[RateWindow, number]> = [
    ["minute", limits.minute],
    ["hour", limits.hour],
    ["day", limits.day],
  ];

  let refusedBy: RateWindow | null = null;

  for (const [kind, limit] of windows) {
    const { data, error } = await db.rpc("hotel_search_take_token", {
      p_bucket_key: key,
      p_window_kind: kind,
      p_window_start: windowStart(kind, now),
      p_limit: limit,
    });
    // A limiter that fails open is worse than no limiter, because it reads as protection.
    // But a limiter that fails closed on a transient DB error takes the page down for
    // everyone. The budget ceiling is the backstop, so this fails OPEN and says so.
    if (error) {
      console.warn("[hotel-search] rate bucket unavailable", { kind, code: error.code });
      continue;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false && !refusedBy) refusedBy = kind;
  }

  return { allowed: refusedBy === null, refusedBy };
}

export function retryAfterSeconds(window: RateWindow): number {
  return window === "minute" ? 60 : window === "hour" ? 900 : 3_600;
}
