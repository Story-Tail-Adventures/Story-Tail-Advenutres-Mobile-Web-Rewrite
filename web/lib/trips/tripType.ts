/**
 * `trip_type`: the five stored values, and the words a person reads.
 *
 * A sibling to `status.ts` rather than part of it — that file is explicitly "the one place a
 * trip becomes a chip and a label" for STATUS, and status carries a chip variant and a
 * derivation (BRD §6.2's "Final payment due") that none of this needs.
 *
 * WHY IT EXISTS AT ALL: §3.4.2's at-a-glance grid rendered `overview.tripType` straight from
 * the column, so an advisor read "all_inclusive" and "custom" in a field every one of whose
 * neighbours is mapped — status through `tripStatusPresentation`, document kind through
 * TripDocumentsList, itinerary block through TripItineraryView. A raw enum on screen is the
 * schema leaking into the product.
 *
 * FLAT OBJECT OF PLAIN STRINGS, deliberately, exactly as `TRIP_STATUS_MESSAGES` is: when a
 * Kotlin twin lands, `.github/scripts/check_copy_parity.py` only reads top-level string
 * literals, so a nested or computed shape would drift silently past the gate. There is no
 * twin today — §3.4 is web-only at MVP — so this is not yet in the gate's list.
 */

/** The stored enum, verbatim from `trip_type` in the initial migration. */
export const TRIP_TYPES = [
  "cruise",
  "all_inclusive",
  "multi_destination",
  "group",
  "custom",
] as const;

export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_MESSAGES = {
  cruise: "Cruise",
  allInclusive: "All-inclusive",
  multiDestination: "Multi-destination",
  group: "Group trip",
  custom: "Custom",
} as const;

const BY_VALUE: Record<TripType, string> = {
  cruise: TRIP_TYPE_MESSAGES.cruise,
  all_inclusive: TRIP_TYPE_MESSAGES.allInclusive,
  multi_destination: TRIP_TYPE_MESSAGES.multiDestination,
  group: TRIP_TYPE_MESSAGES.group,
  custom: TRIP_TYPE_MESSAGES.custom,
};

/**
 * The label for a stored trip type.
 *
 * An unrecognised value falls back to the raw string rather than to a placeholder: the only
 * way to get one is a migration adding a sixth enum member without touching this file, and
 * showing the new value is more useful to whoever hits it than "Unknown" would be — it names
 * what to add here. It is still a raw enum on screen, which is the thing this module exists
 * to prevent, so it is a fallback rather than a design.
 */
export function tripTypeLabel(value: string): string {
  return BY_VALUE[value as TripType] ?? value;
}
