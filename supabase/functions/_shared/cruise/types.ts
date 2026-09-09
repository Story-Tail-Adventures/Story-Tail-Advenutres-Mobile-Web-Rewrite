/**
 * track.cruises response shapes, transcribed from their OpenAPI 3.1 spec.
 *
 * Source of truth: https://www.track.cruises/openapi.json (public, unauthenticated).
 * These are hand-written rather than generated because contracts/ generates OUR api, and
 * pulling a third party's spec into that pipeline would put their release cadence on our
 * build. When the spec changes, edit this file and the fixtures together.
 *
 * NULLABILITY HERE IS LOAD-BEARING. Almost every field on Cruise is nullable in their
 * schema, including `ship_name` and `title`, and the mapper has to survive all of it — a
 * sailing with a real date and no ship is still inventory. Where a field is optional in a
 * way that has bitten us, the comment says which line it happens on.
 */

/**
 * Their `company` values, as published in the spec's CompanyEnum.
 *
 * OBSERVED REALITY DIFFERS: a live GET /cruise-lines returns NINE, not ten — `aida` is in
 * the enum but absent from the response, which is why info.description says "9 cruise
 * lines". `aida` is kept here so a row for it maps cleanly if it ever appears; nothing
 * depends on the count.
 */
export const COMPANIES = [
  "princess",
  "ncl",
  "celebrity-cruises",
  "royal-caribbean",
  "costa",
  "carnival",
  "holland-america",
  "msc",
  "disney-cruise-line",
  "aida",
] as const;

export type Company = typeof COMPANIES[number];

/**
 * Their `locale` values. Determines pricing currency and source market.
 *
 * THE PUBLISHED ENUM IS INCOMPLETE. Their LocaleEnum lists eight; a live GET /cruises
 * returns `pt_BR` (priced in BRL) too. That is exactly the failure mode Data-Model §24.0
 * rule 4 anticipates, and it is why cruise_sailing.provider_locale is `text` rather than a
 * Postgres enum — had it been an enum, the first Brazilian sailing would have failed the
 * whole page's upsert instead of just landing.
 *
 * So this list is documentation and a convenience type, NOT a validator. Nothing in the
 * mapper checks membership, and nothing should start.
 */
export const LOCALES = [
  "de_AT",
  "de_DE",
  "en_AU",
  "en_CA",
  "en_GB",
  "en_US",
  "it_IT",
  "nl_NL",
  // Not in their published enum. Observed live.
  "pt_BR",
] as const;

/** A market identifier. Widened to `string` because the enum above is known incomplete. */
export type Locale = typeof LOCALES[number] | string;

export interface ProviderCruiseLine {
  company: Company;
  display_name: string;
  cruise_count?: number;
  ship_count?: number;
  destination_count?: number;
  destinations?: string[];
  locales?: string[];
  /** date-time in their schema, though it carries a date. */
  earliest_departure?: string | null;
  latest_departure?: string | null;
}

export interface ProviderShip {
  ship_name: string;
  company: Company;
  sailing_count: number;
  earliest_departure?: string | null;
  latest_departure?: string | null;
}

export interface ProviderPort {
  /** Free text, "Barcelona, Spain" — city and country in one field. */
  port: string;
  sailing_count: number;
}

export interface ProviderCoverage {
  company: Company;
  display_name?: string;
  tracked_since?: string | null;
  last_updated?: string | null;
  total_sailings?: number;
  /** Their spec: "Reserved. Currently always 0". Do not report it as real. */
  total_snapshots?: number;
  avg_snapshot_frequency_days?: number | null;
  markets?: Array<{ locale?: Locale; market_name?: string; currency?: string }>;
}

/** `GET /filter-options`. Their spec does not pin the property names, so all optional. */
export interface ProviderFilterOptions {
  companies?: string[];
  locales?: string[];
  destinations?: string[];
  ships?: string[];
  ship_names?: string[];
  ports?: string[];
}

export interface ProviderPortStop {
  port: string;
  /**
   * 1-indexed day. NULL whenever the source feed omitted it — their spec calls out Holland
   * America specifically, whose feed omits every one. Treat null as "unknown day", never
   * as 0 or 1, and never order by this. See cruise_port_call.sequence.
   */
  day?: number | null;
  arrival?: string | null;
  departure?: string | null;
}

export interface ProviderCruise {
  cruise_id: string;
  itinerary_id?: string | null;
  title?: string | null;
  company: Company;
  locale: Locale;
  ship_name?: string | null;
  departure_date: string;
  duration?: number | null;
  /** Float, in `currency`. Money rule 5 means this is cents by the time it lands. */
  price?: number | null;
  price_euro?: number | null;
  currency?: string | null;
  /**
   * ONLY populated by GET /cruises/{id}; the list endpoint omits it to stay lean. Keys are
   * normalised cabin codes and the vocabulary is open — their own spec says "plus
   * line-specific tiers like CONCIERGE, AQUA, VISTA_SUITE, NEPTUNE_SUITE, HAVEN".
   */
  cabin_prices_per_person?: Record<string, number> | null;
  destinations?: string[];
  /** Ordered by day. */
  ports_list?: ProviderPortStop[];
  itinerary_url?: string | null;
  updated_at?: string;
}

/** RFC 9457 problem body. Their errors use `application/problem+json`. */
export interface ProviderProblem {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  param?: string;
  request_id?: string;
  /** Set on 403 tier_insufficient. */
  required_tier?: string;
  /** Set on 429. */
  retry_after_seconds?: number;
}

/** Every list endpoint. Cursor-only — there is no page or offset parameter. */
export interface ProviderListEnvelope<T> {
  data: T[];
  has_more?: boolean;
  /** Send back unchanged as `starting_after`. Null when has_more is false. */
  next_cursor?: string | null;
  request_id?: string;
}

export interface ProviderItemEnvelope<T> {
  data: T;
  request_id?: string;
}
