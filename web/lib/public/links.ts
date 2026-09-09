import { safeNext } from "@/lib/safe-next";

/**
 * Link builders for the public surface, so pages never hand-roll query strings and the
 * sign-up gate can change its parameter names in one place.
 */

export const JOIN_INTENTS = ["quote", "save", "message", "tour"] as const;
export type JoinIntent = (typeof JOIN_INTENTS)[number];

export function isJoinIntent(value: string | undefined | null): value is JoinIntent {
  return typeof value === "string" && (JOIN_INTENTS as readonly string[]).includes(value);
}

export interface JoinLink {
  intent?: JoinIntent;
  /** Catalog slug the visitor was looking at. Resolved against the catalog on /join. */
  trip?: string;
  /** Same-origin path to return to after sign-up. */
  next?: string;
}

/** `/join?intent=quote&trip=<slug>&next=/explore/<slug>` (Screen Inventory 2.0.6). */
export function joinHref({ intent, trip, next }: JoinLink = {}): string {
  const params = new URLSearchParams();
  if (intent) params.set("intent", intent);
  if (trip) params.set("trip", trip);
  if (next) {
    const safe = safeNext(next, "");
    if (safe) params.set("next", safe);
  }
  const qs = params.toString();
  return qs ? `/join?${qs}` : "/join";
}

/** `/login?next=…` with the same open-redirect guard. */
export function loginHref(next?: string): string {
  if (!next) return "/login";
  const safe = safeNext(next, "");
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

export function tripHref(slug: string): string {
  return `/explore/${encodeURIComponent(slug)}`;
}

/**
 * What a visitor was looking at when they asked for a quote.
 *
 * A curated trip is a slug — the catalog resolves it. A hotel is NOT: hotels are
 * deliberately never stored (Free-Travel-APIs §10.1 syncs content, and availability is
 * fetched live), so there is no row to point at and the identifying fields have to travel.
 * Kept deliberately small — no photo, no description — because this whole object is
 * URL-encoded a second time when it rides through the sign-up gate as `?next=`.
 */
export interface QuoteTarget {
  /**
   * A `component_kind`, not a UI category. The curated catalog's four `TripType` values map
   * onto three of these — see `quoteKindFor` — because "what kind of thing is this" and
   * "what kind of trip does it become" are different questions and the schema asks both.
   */
  kind: "hotel" | "cruise" | "excursion" | "custom";
  /** The trip this becomes. Omitted lets the function default it from the kind. */
  tripType?: "cruise" | "all_inclusive" | "multi_destination" | "group" | "custom";
  /** Provenance. Allow-listed by the function; anything else is recorded as curated. */
  source?: "curated" | "serpapi_google_hotels" | "track_cruises";
  /** Curated catalog slug. */
  slug?: string;
  name?: string;
  place?: string;
  checkIn?: string;
  checkOut?: string;
  travelers?: number;
  /** The provider's opaque property token, so the inquiry names which hotel. */
  ref?: string;
  /** Indicative nightly rate in integer cents. Never a quote — see quote-request's header. */
  rateCents?: number;
  hotelClass?: number;
  rating?: number;
  propertyType?: string;
}

/** `/trips/new?…` — Screen 2.3.8, the quote request form. Requires a signed-in client. */
export function quoteHref(target: QuoteTarget): string {
  const params = new URLSearchParams();
  params.set("kind", target.kind);
  if (target.tripType) params.set("tripType", target.tripType);
  if (target.source) params.set("source", target.source);
  if (target.slug) params.set("trip", target.slug);
  if (target.name) params.set("name", target.name);
  if (target.place) params.set("place", target.place);
  if (target.checkIn && target.checkOut) {
    params.set("in", target.checkIn);
    params.set("out", target.checkOut);
  }
  if (target.travelers) params.set("adults", String(target.travelers));
  if (target.ref) params.set("ref", target.ref);
  if (target.rateCents) params.set("rate", String(target.rateCents));
  if (target.hotelClass) params.set("class", String(target.hotelClass));
  if (target.rating) params.set("rating", String(target.rating));
  if (target.propertyType) params.set("type", target.propertyType);
  return `/trips/new?${params.toString()}`;
}

/**
 * The curated catalog's `TripType` → the `component_kind` and `trip_type` it becomes.
 *
 * An all-inclusive week and a boutique hotel are both `hotel` COMPONENTS; only one is an
 * `all_inclusive` TRIP. A tour is an `excursion`. Keeping the mapping here means the two
 * cards and any future caller agree, and a new catalog type is one edit.
 */
export function quoteKindFor(
  type: "all-inclusive" | "cruise" | "hotel" | "tour",
): Pick<QuoteTarget, "kind" | "tripType"> {
  switch (type) {
    case "cruise":
      return { kind: "cruise", tripType: "cruise" };
    case "all-inclusive":
      return { kind: "hotel", tripType: "all_inclusive" };
    case "hotel":
      return { kind: "hotel", tripType: "custom" };
    case "tour":
      return { kind: "excursion", tripType: "custom" };
  }
}

/**
 * The one CTA every "Request a quote" button uses.
 *
 * It always points at the GATE, never at the quote form, and that is deliberate: a public
 * page reads no session (it is what keeps these routes prerenderable), so it cannot know
 * whether the visitor is signed in. The proxy does know — a signed-in visitor is forwarded
 * from `/join` straight to `next`, and an anonymous one registers and lands there
 * afterwards. Both paths end at the same URL, built once, here.
 */
export function requestQuoteHref(target: QuoteTarget): string {
  return joinHref({ intent: "quote", trip: target.slug, next: quoteHref(target) });
}
