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

/**
 * The one host we will point a visitor's browser at for a ship photo.
 *
 * Repeated from the database ON PURPOSE, and the reason is the same one `hotels.ts` gives
 * for repeating the hotel list: `web/next.config.ts` registers a CUSTOM next/image loader,
 * so `remotePatterns` is never consulted and any URL reaching `<Image src>` is fetched by
 * the visitor's browser from whatever origin we named. There is no framework-level check to
 * fall back on — this is it.
 *
 * The earlier layer here is `cruise_ship_image_host`, a CHECK on the column, rather than a
 * mapper allow-list: ship photos are written by migration, not received from a provider. A
 * CHECK is the stronger of the two, and it is also the one that is not in this repo's
 * request path — a restored dump, a hotfixed row or a relaxed constraint all reach `<Image>`
 * through here and not through it.
 */
const IMAGE_HOSTS = new Set(["upload.wikimedia.org"]);

function isAllowedImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * A ship photo and its attribution, which travel together or not at all.
 *
 * `credit` IS REQUIRED, not nullable. The photos are CC BY / CC BY-SA, so the credit is a
 * licence condition, and a schema that let it be null would let a card render the photo
 * bare. Postgres enforces the same pair in `cruise_ship_image_attributed`; this is the
 * copy of it that survives a change to that constraint.
 *
 * The maxima are sized off the real catalog with room to spare — the longest credit in the
 * 151 photographs is 214 characters, because Commons attribution runs to whole paragraphs
 * ("No machine-readable author provided. NormanEinstein assumed…"). Too tight a bound here
 * would not drop a photo, it would fail `responseSchema` and take the entire results page
 * to "unavailable"; see the `.catch(null)` below, which is the other half of that guard.
 */
const shipImageSchema = z.object({
  url: z.string().url().max(500).refine(isAllowedImage, "image host not allow-listed"),
  credit: z.string().min(1).max(400),
  license: z.string().max(60).nullable(),
  sourceUrl: z.string().url().max(500).nullable(),
});

const sailingSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  line: z.string().max(120).nullable(),
  ship: z.string().max(120).nullable(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.number().int().min(1).max(120).nullable(),
  destinations: z.array(z.string().max(80)).max(6),
  ports: z.array(z.string().max(120)).max(12),
  /**
   * `.catch(null)` DEGRADES TO NO PHOTO instead of failing the sailing.
   *
   * Every other field on this card is the card; the photo is decoration. A rejected host, an
   * over-long credit or a field the Edge Function stops sending should cost one image, not
   * the whole page — and without this, it costs the whole page, because one bad element
   * fails `z.array` and `parseCruiseResponse` maps any failure to "unavailable".
   *
   * It is also what makes the `refine` above safe to be strict.
   */
  shipImage: shipImageSchema.nullable().catch(null),
});

const responseSchema = z.object({ results: z.array(sailingSchema) });

export type PublicSailing = z.infer<typeof sailingSchema>;
export type ShipImage = z.infer<typeof shipImageSchema>;

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
