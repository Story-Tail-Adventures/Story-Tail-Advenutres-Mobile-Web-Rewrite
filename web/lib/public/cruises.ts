import { z } from "zod";
import { env } from "@/lib/env";

/**
 * The public cruise read. Screen 2.0.4 in Cruises mode.
 *
 * Server-side by construction, the same way `hotels.ts` is: it reads
 * `STA_HOTEL_SEARCH_TOKEN`, and the absence of a `NEXT_PUBLIC_` prefix is what keeps it out
 * of the browser bundle.
 *
 * THERE IS NO FARE FIELD, and that is the point. `cruise_sailing.lead_price_cents` is
 * classified Internal (Data-Model §24.4) and Free-Travel-APIs §4.7 says to launch the public
 * surface without a fare: it re-opens §1.3.4 and §9.2, and it goes stale on a page nobody is
 * watching. The Edge Function does not select it and this type has nowhere to put it — the
 * same structural technique that keeps booking-site names off the hotel cards.
 */

const sailingSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  line: z.string().max(120).nullable(),
  ship: z.string().max(120).nullable(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.number().int().min(1).max(120).nullable(),
  destinations: z.array(z.string().max(80)).max(6),
  ports: z.array(z.string().max(120)).max(12),
});

const responseSchema = z.object({ results: z.array(sailingSchema) });

export type PublicSailing = z.infer<typeof sailingSchema>;

export type CruiseSearchResult =
  | { status: "ok"; sailings: PublicSailing[] }
  | { status: "empty" }
  | { status: "unavailable" };

export interface CruiseSearchArgs {
  destination?: string;
  from?: string;
  to?: string;
}

export function parseCruiseResponse(raw: unknown): CruiseSearchResult {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return { status: "unavailable" };
  if (parsed.data.results.length === 0) return { status: "empty" };
  return { status: "ok", sailings: parsed.data.results };
}

/**
 * Never throws: a read failure on a public marketing page is a quiet fallback to the
 * curated catalog, not an error boundary.
 *
 * Cached longer than the hotel search — 30 minutes against 5 — because this reads our own
 * synced catalog rather than a live provider, and that catalog changes weekly at most.
 */
export async function searchCruises(args: CruiseSearchArgs): Promise<CruiseSearchResult> {
  const token = env.hotelSearchToken;
  if (!token || !env.supabaseConfigured) {
    console.warn("[cruises] search skipped — not configured", {
      callerToken: token ? "set" : "MISSING (STA_HOTEL_SEARCH_TOKEN)",
      supabase: env.supabaseConfigured ? "configured" : "MISSING (NEXT_PUBLIC_SUPABASE_*)",
    });
    return { status: "unavailable" };
  }

  try {
    const response = await fetch(`${env.supabaseUrl}/functions/v1/cruise-search`, {
      method: "POST",
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
        "X-STA-Search-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 1_800, tags: ["cruise-search"] },
    });

    if (!response.ok) {
      const hint = response.status === 401
        ? "the caller token did not match — STA_HOTEL_SEARCH_TOKEN must equal HOTEL_SEARCH_CALLER_TOKEN"
        : undefined;
      console.warn("[cruises] search rejected", { status: response.status, hint });
      return { status: "unavailable" };
    }

    return parseCruiseResponse(await response.json());
  } catch (cause) {
    console.warn("[cruises] search failed", { cause: String(cause) });
    return { status: "unavailable" };
  }
}
