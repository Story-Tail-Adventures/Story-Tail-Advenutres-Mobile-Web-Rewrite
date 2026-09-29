import { NEW_TRIP_COPY } from "@/lib/agent/content";

/**
 * §3.4.3's vocabulary and form shape — SERVER-FREE, like `tripStatuses.ts` and for the same
 * reason: the form is a client component, and anything it imports that reaches
 * `lib/supabase/server.ts` drags `next/headers` into the browser bundle and 500s the route.
 * Nothing in this file may import from `trips.ts`, `clients.ts` or `queries.ts`.
 */

/**
 * FIVE, matching `trip_type` exactly.
 *
 * The prototype draws SIX — it adds "Honeymoon", which is not a value in `trip_type` and
 * never has been. A honeymoon is an all-inclusive or a custom trip, and the all-inclusive
 * hint says so rather than pretending the tile was never drawn.
 */
export const TRIP_TYPES = [
  { value: "all_inclusive", label: NEW_TRIP_COPY.typeAllInclusive, hint: NEW_TRIP_COPY.typeAllInclusiveHint, icon: "building" },
  { value: "cruise", label: NEW_TRIP_COPY.typeCruise, hint: NEW_TRIP_COPY.typeCruiseHint, icon: "ship" },
  { value: "multi_destination", label: NEW_TRIP_COPY.typeMultiDestination, hint: NEW_TRIP_COPY.typeMultiDestinationHint, icon: "plane" },
  { value: "group", label: NEW_TRIP_COPY.typeGroup, hint: NEW_TRIP_COPY.typeGroupHint, icon: "users" },
  { value: "custom", label: NEW_TRIP_COPY.typeCustom, hint: NEW_TRIP_COPY.typeCustomHint, icon: "sparkle" },
] as const;

export type TripTypeValue = (typeof TRIP_TYPES)[number]["value"];

/**
 * The human label for a stored `trip_type`, for anywhere that renders one it did not pick
 * (§3.4.13's template cards, so far).
 *
 * Falls back to the raw value rather than an empty string: `trip_type` is an enum with six
 * members and TRIP_TYPES deliberately carries five — "Honeymoon" is not a trip_type, and
 * the prototype's sixth tile was dropped for that reason. A value outside this list is
 * real data, so showing it beats showing nothing.
 */
export function tripTypeLabel(value: string): string {
  return TRIP_TYPES.find((t) => t.value === value)?.label ?? value;
}

export type NewTripValues = {
  clientId: string;
  tripType: TripTypeValue;
  title: string;
  travelerCount: string;
  /**
   * §3.4.13's "start from a template". Empty string means none, never null: this rides in a
   * FormData and a `<select>` with no selection submits "".
   *
   * NOT VALIDATED here. A stale or foreign id is refused by the RPC's ownership check and
   * comes back as an outcome, and a second copy of that rule in the browser is a second
   * place for it to drift.
   */
  templateId: string;
};

export type NewTripState = {
  fieldErrors?: Partial<Record<keyof NewTripValues, string[]>>;
  formError?: string;
  values?: NewTripValues;
};

export const EMPTY_NEW_TRIP: NewTripValues = {
  clientId: "",
  // All-inclusive is the most common shape this business books, so it is the one the form
  // opens on rather than leaving five tiles and no default.
  tripType: "all_inclusive",
  title: "",
  travelerCount: "2",
  templateId: "",
};

export function newTripFromFormData(form: FormData): NewTripValues {
  const raw = (form.get("tripType") ?? "").toString();
  const valid = TRIP_TYPES.map((t) => t.value as string);
  return {
    clientId: (form.get("clientId") ?? "").toString().trim(),
    tripType: (valid.includes(raw) ? raw : EMPTY_NEW_TRIP.tripType) as TripTypeValue,
    title: (form.get("title") ?? "").toString().trim(),
    travelerCount: (form.get("travelerCount") ?? "").toString().trim(),
    templateId: (form.get("templateId") ?? "").toString().trim(),
  };
}

/** Field-level, so each message lands against the control that caused it. */
export function validateNewTrip(
  values: NewTripValues,
): Partial<Record<keyof NewTripValues, string[]>> | null {
  const errors: Partial<Record<keyof NewTripValues, string[]>> = {};
  if (!values.clientId) errors.clientId = [NEW_TRIP_COPY.clientRequired];
  if (!values.title) errors.title = [NEW_TRIP_COPY.titleRequired];
  return Object.keys(errors).length > 0 ? errors : null;
}
