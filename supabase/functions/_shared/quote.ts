/**
 * Validation and normalisation for `quote-request`.
 *
 * Separate from the handler because `index.ts` calls `Deno.serve` at module load — importing
 * it from a test would start a listener. Same split as `_shared/onboarding.ts`.
 */
import { badRequest } from "./problem.ts";
import { assertRecentUuidV7 } from "./uuid.ts";

/** What the visitor was looking at when they asked. */
export type QuoteKind = "hotel" | "cruise";

export const MAX_NOTE = 2_000;
export const MAX_TITLE = 120;

export interface QuoteInput {
  tripId: string;
  kind: QuoteKind;
  tripType: "cruise" | "custom";
  title: string;
  displayName: string;
  destinations: string[];
  location: string | null;
  checkIn: string | null;
  checkOut: string | null;
  travelers: number;
  note: string | null;
  snapshot: Record<string, unknown>;
  apiSource: string;
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

  const kind = payload.kind === "cruise" ? "cruise" : payload.kind === "hotel" ? "hotel" : null;
  if (!kind) throw badRequest("kind must be 'hotel' or 'cruise'.");

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
    // The enum has no 'hotel' member — 'custom' is the honest mapping for a stay, since a
    // hotel is only all-inclusive when the property is, and we do not know that reliably.
    tripType: kind === "cruise" ? "cruise" : "custom",
    title: location ? `${displayName} · ${location}`.slice(0, MAX_TITLE) : displayName,
    displayName,
    destinations: location ? [location] : [],
    location,
    checkIn,
    checkOut,
    travelers,
    note,
    snapshot: sanitiseSnapshot(snapshot),
    apiSource: kind === "hotel" ? "serpapi_google_hotels" : "track_cruises",
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
