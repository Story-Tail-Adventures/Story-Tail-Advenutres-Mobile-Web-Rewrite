import type { ImageKey } from "@/lib/images";

/**
 * Which photograph stands in for a trip.
 *
 * `trip.cover_image_url` and `itinerary.cover_image_url` both exist and are both null for
 * every seeded trip, because nobody has uploaded trip photography yet — and the whole
 * registry in web/lib/images.ts is still `licensed: false` placeholders anyway (see the
 * §2.0 delivery note). So a trip picks a photo from what it knows about itself.
 *
 * Destination first, because a client who is going to Negril should see Jamaica rather than
 * a generic beach. Trip type second. A stable fallback last, chosen by hashing the trip id
 * so the same trip always draws the same photo — a card that changes picture on every
 * render looks broken, and `Math.random()` in a server component would also differ between
 * the server render and any client re-render.
 *
 * Replaced wholesale the moment `cover_image_url` carries anything: this is a fallback, not
 * a feature.
 */

const BY_DESTINATION: ReadonlyArray<readonly [RegExp, ImageKey]> = [
  [/jamaica|negril|montego/i, "jamaica"],
  [/turks|caicos|provider?nciales/i, "turks"],
  [/bahama|nassau|paradise island/i, "bahamas"],
  [/aruba|palm beach|oranjestad/i, "aruba"],
  [/lucia|piton|soufri/i, "stlucia"],
  [/virgin islands|tortola|bvi/i, "bvi"],
];

const BY_TRIP_TYPE: Readonly<Record<string, ImageKey>> = {
  cruise: "cruiseShip",
  all_inclusive: "resortPool",
  multi_destination: "palmTree",
  group: "family",
  custom: "sunset",
};

/** The pool a trip falls back into, in a fixed order so the hash is stable across deploys. */
const FALLBACK: readonly ImageKey[] = [
  "overwater",
  "resortPool",
  "palmTree",
  "sunset",
  "snorkel",
];

export type TripImageInput = {
  id: string;
  tripType: string;
  destinations: readonly string[];
};

export function imageKeyForTrip(trip: TripImageInput): ImageKey {
  const where = trip.destinations.join(" ");
  for (const [pattern, key] of BY_DESTINATION) {
    if (pattern.test(where)) return key;
  }

  const byType = BY_TRIP_TYPE[trip.tripType];
  if (byType) return byType;

  // A cheap stable hash. Not cryptographic and does not need to be — it only has to be the
  // same number for the same id on every render, on both the server and the client.
  let hash = 0;
  for (let i = 0; i < trip.id.length; i += 1) {
    hash = (hash * 31 + trip.id.charCodeAt(i)) % 100_000;
  }
  return FALLBACK[hash % FALLBACK.length];
}
