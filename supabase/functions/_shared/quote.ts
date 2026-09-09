/**
 * Validation and normalisation for `quote-request`.
 *
 * Separate from the handler because `index.ts` calls `Deno.serve` at module load — importing
 * it from a test would start a listener. Same split as `_shared/onboarding.ts`.
 */
import { badRequest } from "./problem.ts";
import { assertRecentUuidV7 } from "./uuid.ts";

/**
 * What the visitor was looking at, as a `component_kind`.
 *
 * Narrower than the enum on purpose: only the four a public search surface can produce.
 * `flight`, `transfer` and `insurance` are things an advisor adds while building the trip,
 * not things a traveler asks about from a search result.
 */
export const QUOTE_KINDS = ["hotel", "cruise", "excursion", "custom"] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];

/**
 * The `trip_type` the inquiry becomes. Sent by the caller because the curated catalog knows
 * things the component kind does not — a Sandals week and a boutique hotel are both `hotel`
 * components, but only one of them is an `all_inclusive` trip.
 */
export const QUOTE_TRIP_TYPES = ["cruise", "all_inclusive", "multi_destination", "group", "custom"] as const;
export type QuoteTripType = (typeof QUOTE_TRIP_TYPES)[number];

/**
 * Where the thing being asked about came from — `trip_component.api_source`.
 *
 * An ALLOW-LIST rather than free text, because this is provenance: a caller must not be able
 * to label its own request as having come from a supplier feed. `curated` is Gyasi's own
 * catalog, which is where anything that is not a live provider result comes from.
 */
export const QUOTE_SOURCES = ["curated", "serpapi_google_hotels", "track_cruises"] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];

export const MAX_NOTE = 2_000;
export const MAX_TITLE = 120;

export interface QuoteInput {
  tripId: string;
  kind: QuoteKind;
  tripType: QuoteTripType;
  title: string;
  displayName: string;
  destinations: string[];
  location: string | null;
  checkIn: string | null;
  checkOut: string | null;
  travelers: number;
  note: string | null;
  snapshot: Record<string, unknown>;
  apiSource: QuoteSource;
  apiReference: string | null;
}

export function parseBody(payload: Record<string, unknown>): QuoteInput {
  const tripId = payload.tripId;
  if (typeof tripId !== "string") throw badRequest("Send a tripId.");
  try {
    // Client-generated v7, validated recent — the same contract every other write here uses,
    // and what makes a retry idempotent rather than a second trip.
    assertRecentUuidV7(tripId);
  } catch (err) {
    throw badRequest(`tripId must be a recent UUID v7: ${(err as Error).message}`);
  }

  const kind = typeof payload.kind === "string" && (QUOTE_KINDS as readonly string[]).includes(payload.kind)
    ? payload.kind as QuoteKind
    : null;
  if (!kind) throw badRequest(`kind must be one of: ${QUOTE_KINDS.join(", ")}.`);

  // Defaulted from the kind rather than required, so a caller that does not know (a future
  // mobile client, say) still produces a coherent trip instead of a rejected request.
  const tripType =
    typeof payload.tripType === "string" &&
      (QUOTE_TRIP_TYPES as readonly string[]).includes(payload.tripType)
      ? payload.tripType as QuoteTripType
      : kind === "cruise"
      ? "cruise"
      : "custom";

  const displayName = text(payload.name, MAX_TITLE);
  if (!displayName) throw badRequest("Send the name of what you are asking about.");

  const location = text(payload.location, 120);
  // ABSENT AND INVALID ARE DIFFERENT ANSWERS. "I like this place, when could we go?" is a
  // real inquiry, so no dates is allowed. But a date that was SENT and does not parse must
  // be refused rather than quietly dropped — silently recording an undated trip loses the
  // one piece of information the traveler was most deliberate about, and nothing downstream
  // could tell it had happened.
  const checkIn = optionalDate(payload.checkIn, "checkIn");
  const checkOut = optionalDate(payload.checkOut, "checkOut");
  if (Boolean(checkIn) !== Boolean(checkOut)) {
    throw badRequest("Send both checkIn and checkOut, or neither.");
  }
  if (checkIn && checkOut && checkOut <= checkIn) {
    throw badRequest("checkOut must be after checkIn.");
  }

  const travelers = clamp(payload.travelers, 1, 20, 2);
  const note = text(payload.note, MAX_NOTE);

  const snapshot = payload.snapshot && typeof payload.snapshot === "object" &&
      !Array.isArray(payload.snapshot)
    ? payload.snapshot as Record<string, unknown>
    : {};

  return {
    tripId,
    kind,
    tripType,
    title: location ? `${displayName} · ${location}`.slice(0, MAX_TITLE) : displayName,
    displayName,
    destinations: location ? [location] : [],
    location,
    checkIn,
    checkOut,
    travelers,
    note,
    snapshot: sanitiseSnapshot(snapshot),
    apiSource: typeof payload.source === "string" &&
        (QUOTE_SOURCES as readonly string[]).includes(payload.source)
      ? payload.source as QuoteSource
      : "curated",
    apiReference: text(payload.apiReference, 220),
  };
}

/**
 * The snapshot is echoed back by the client, so it is treated as hostile: an allow-list of
 * scalar keys, capped, with no nesting.
 *
 * `indicativeRateCents` is named for what it is. It must never be read as a cost — the
 * money columns beside it stay zero, and a future reader who wants to price the trip has to
 * decide to, rather than inherit a number Google produced.
 */
function sanitiseSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const strings = ["propertyType", "photoUrl", "propertyToken"];
  const numbers = ["indicativeRateCents", "hotelClass", "rating", "reviewCount"];

  for (const key of strings) {
    const value = text(raw[key], 300);
    if (value) out[key] = value;
  }
  for (const key of numbers) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  if (Array.isArray(raw.amenities)) {
    out.amenities = raw.amenities
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.slice(0, 60))
      .slice(0, 12);
  }
  out.capturedAt = new Date().toISOString();
  return out;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

/** Null when the field was not sent at all; throws when it was sent and is not a date. */
function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = isoDate(value);
  if (!parsed) throw badRequest(`${field} must be a real date as YYYY-MM-DD.`);
  return parsed;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return real ? value : null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
