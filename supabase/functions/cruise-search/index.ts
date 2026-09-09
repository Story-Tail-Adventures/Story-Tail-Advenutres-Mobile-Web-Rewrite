/**
 * Public cruise search — Screen 2.0.4 in Cruises mode, and 2.3.4 later. P2.
 *
 * Roles: none. The caller is our own Next.js server acting for an anonymous visitor, the
 * same posture `hotel-search` documents at length.
 * Sensitive mutation: none — this reads, and writes nothing at all.
 * MFA step-up: not required.
 *
 * WHY A FUNCTION FOR DATA THAT IS ALREADY IN OUR DATABASE. `hotel-search` exists because
 * hotels are a live third-party proxy with no table. This one exists for a narrower reason:
 * `supabase/tests/rls_cruise_catalog.sql` asserts that NOBODY — not anon, not authenticated
 * — holds any grant on any cruise table, and that is a stronger, more useful invariant than
 * an `anon` SELECT policy would leave behind. Reading here on the service role keeps it.
 *
 * NO BUDGET, NO LEDGER, NO RATE LIMITER. Unlike the hotel search this spends nothing: the
 * catalog is already synced, so a request costs one indexed query against our own Postgres.
 * The metered call in the cruise domain is the sync (`cruise-sync`), and the other one is
 * the quote-time re-fetch, which is deliberately kept out of a read path a crawler can hit.
 */
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { badRequest, forbidden, problem, unauthorized } from "../_shared/problem.ts";
import { searchSailings, type SailingQuery } from "../_shared/cruise/public.ts";

const MAX_RESULTS = 24;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      // POST for the same reason hotel-search uses it: one serialisation of the query, and
      // nothing a link preview or a prefetch can trigger.
      return problem(forbidden("Use POST to search."));
    }

    requireCallerToken(req);

    const query = parseBody(await req.json().catch(() => null));
    // serviceClient because the caller is nobody and these tables have RLS on with zero
    // policies by design — there is no predicate that could express "an anonymous visitor
    // may read a published sailing", because there is no anonymous grant to predicate.
    const sailings = await searchSailings(serviceClient(), query);

    return new Response(JSON.stringify({ results: sailings }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});

/** Shared with hotel-search: the anon key authenticates nobody, so this is the credential. */
function requireCallerToken(req: Request): void {
  const expected = Deno.env.get("HOTEL_SEARCH_CALLER_TOKEN");
  if (!expected) {
    throw forbidden("HOTEL_SEARCH_CALLER_TOKEN is not set. See supabase/README.md.");
  }
  const presented = req.headers.get("X-STA-Search-Token");
  if (!presented || !constantTimeEqual(presented, expected)) {
    throw unauthorized("This endpoint is not called directly.");
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function parseBody(body: unknown): SailingQuery {
  const fields = (body ?? {}) as Record<string, unknown>;

  const from = isoDate(fields.from);
  const to = isoDate(fields.to);
  if (from && to && to < from) throw badRequest("`to` must not be before `from`.");

  return {
    destination: text(fields.destination, 60) ?? undefined,
    from,
    to,
    minNights: count(fields.minNights, 1, 60),
    maxNights: count(fields.maxNights, 1, 60),
    limit: count(fields.limit, 1, MAX_RESULTS) ?? MAX_RESULTS,
  };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? value : undefined;
}

function count(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}
