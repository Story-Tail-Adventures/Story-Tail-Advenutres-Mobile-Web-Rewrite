import type { IconName } from "@/components/ui/icon-paths";
import { BUILDER_COPY } from "@/lib/agent/content";

/**
 * §3.4.5 – §3.4.12's eight sheets, as one spec.
 *
 * `display_name` IS THE LINE THE CLIENT READS, in every one of the seven. Not the airline,
 * not the provider — "AA 1413 · MIA → MBJ", "Allianz OneTrip Prime". The first draft made
 * it the airline and the seeded rows disagreed: they already store the descriptive line
 * there and the airline in `payload`. The supplier is `supplier_id`, which is a picker.
 *
 * SERVER-FREE, like `tripStatuses.ts` and `newTrip.ts` and for the same reason: the sheet is
 * a client component, and anything it imports that reaches `lib/supabase/server.ts` drags
 * `next/headers` into the browser bundle and 500s the route. Nothing in this file may import
 * from `trips.ts`, `tripDetail.ts`, `clients.ts` or `queries.ts`.
 *
 * ── ONE SPEC, EIGHT SCREENS ──────────────────────────────────────────────────────────────
 *
 * The Screen Inventory draws seven "add" sheets and one "edit", and §3.4.12's own entry says
 * *"Same form as the corresponding Add screen, pre-filled"*. They differ only in which
 * fields they show, so they are one component reading this table — the same call
 * `agent_upsert_trip_component` made in SQL and `agent-trip` made at the route.
 *
 * ── THE PAYLOAD KEYS MUST MATCH `supabase/functions/_shared/component.ts` ────────────────
 *
 * That file holds the other copy and refuses any key it does not know, so a field added here
 * and left out there is a 400 the first time anyone saves — loud, not silent. That refusal
 * IS the parity check; there is no script pairing these two the way `check_copy_parity.py`
 * pairs web copy with Kotlin.
 *
 * SNAKE_CASE, matching that file, the rows already in the table, and every other jsonb in
 * this schema. A camelCase key here would not be refused — it would simply never match
 * what is stored, so the sheet would open blank over a component that has the data and the
 * save would write the blank over it. That failure is invisible; the 400 is not.
 *
 * ── WHAT IS A COLUMN AND WHAT IS PAYLOAD ─────────────────────────────────────────────────
 *
 * Data-Model §23: anything a QUERY needs is a column. So a flight's route is `location`, its
 * PNR is `confirmation_number`, and its seats are payload. `columns` below names which of
 * the shared columns a kind shows and what it calls them; `detail` is the rest.
 */

/** The seven `component_kind` values, exactly. */
export const COMPONENT_KINDS = [
  "flight",
  "hotel",
  "cruise",
  "transfer",
  "excursion",
  "insurance",
  "custom",
] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** Every shared column a sheet may show. `displayName` is on all seven and always first. */
export type ComponentColumn =
  | "location"
  | "startDate"
  | "endDate"
  | "startTime"
  | "endTime"
  | "confirmationNumber";

/**
 * All six, as a list — so the sheet can find the ones its kind does NOT show.
 *
 * THIS IS A CORRECTNESS FIXTURE, NOT A CONVENIENCE. `agent_upsert_trip_component` writes
 * every column on an update, so a column the form leaves out arrives as NULL and CLEARS
 * what was there. An insurance policy has no `location` and no times, and editing one
 * would have quietly emptied any that had been set. The sheet carries them as hidden
 * inputs; see `TripComponentSheet`.
 */
export const COMPONENT_COLUMNS: readonly ComponentColumn[] = [
  "location",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "confirmationNumber",
];

export type DetailField = { key: string; label: string; kind: "text" | "long" | "flag" };

export type ComponentSpec = {
  kind: ComponentKind;
  icon: IconName;
  /** "Add flight" — the sheet's own heading. */
  addLabel: string;
  /** "Flight" — the rail button and the edit heading. */
  shortLabel: string;
  /** What `display_name` is called on this sheet. It is NOT NULL, so it is always required. */
  nameLabel: string;
  namePlaceholder: string;
  columns: Partial<Record<ComponentColumn, string>>;
  detail: readonly DetailField[];
};

const NOTES: DetailField = { key: "notes", label: BUILDER_COPY.fieldNotes, kind: "long" };

export const COMPONENT_SPECS: Record<ComponentKind, ComponentSpec> = {
  flight: {
    kind: "flight",
    icon: "plane",
    addLabel: BUILDER_COPY.addFlight,
    shortLabel: BUILDER_COPY.kindFlight,
    nameLabel: BUILDER_COPY.flightName,
    namePlaceholder: "AA 1413 · MIA → MBJ",
    columns: {
      location: BUILDER_COPY.flightFrom,
      startDate: BUILDER_COPY.fieldDate,
      startTime: BUILDER_COPY.flightDeparts,
      // A red-eye lands the next day, so the arrival DATE is a real field and not just a
      // time. It was missing from the first draft, and because the upsert writes every
      // column, a flight that had one lost it the first time anybody edited the row.
      endDate: BUILDER_COPY.flightArrivesOn,
      endTime: BUILDER_COPY.flightArrives,
      confirmationNumber: BUILDER_COPY.flightPnr,
    },
    detail: [
      { key: "flight_number", label: BUILDER_COPY.flightNumber, kind: "text" },
      { key: "cabin", label: BUILDER_COPY.flightCabin, kind: "text" },
      { key: "seat", label: BUILDER_COPY.flightSeats, kind: "text" },
      NOTES,
    ],
  },
  hotel: {
    kind: "hotel",
    icon: "building",
    addLabel: BUILDER_COPY.addHotel,
    shortLabel: BUILDER_COPY.kindHotel,
    nameLabel: BUILDER_COPY.hotelName,
    namePlaceholder: "Ocean-view suite · 7 nights",
    columns: {
      location: BUILDER_COPY.hotelWhere,
      startDate: BUILDER_COPY.hotelCheckIn,
      startTime: BUILDER_COPY.hotelCheckInTime,
      endDate: BUILDER_COPY.hotelCheckOut,
      endTime: BUILDER_COPY.hotelCheckOutTime,
      confirmationNumber: BUILDER_COPY.fieldConfirmation,
    },
    detail: [
      { key: "room_type", label: BUILDER_COPY.hotelRoomType, kind: "text" },
      { key: "board_basis", label: BUILDER_COPY.hotelBoard, kind: "text" },
      NOTES,
    ],
  },
  cruise: {
    kind: "cruise",
    icon: "ship",
    addLabel: BUILDER_COPY.addCruise,
    shortLabel: BUILDER_COPY.kindCruise,
    nameLabel: BUILDER_COPY.cruiseName,
    namePlaceholder: "Symphony · 7-night Eastern Caribbean",
    columns: {
      location: BUILDER_COPY.cruisePort,
      startDate: BUILDER_COPY.cruiseSails,
      startTime: BUILDER_COPY.cruiseBoarding,
      endDate: BUILDER_COPY.cruiseReturns,
      endTime: BUILDER_COPY.cruiseDisembark,
      confirmationNumber: BUILDER_COPY.cruiseBooking,
    },
    detail: [
      { key: "ship", label: BUILDER_COPY.cruiseShip, kind: "text" },
      { key: "itinerary_name", label: BUILDER_COPY.cruiseItinerary, kind: "text" },
      { key: "cabin", label: BUILDER_COPY.cruiseCabin, kind: "text" },
      { key: "dining_seating", label: BUILDER_COPY.cruiseDining, kind: "text" },
      { key: "gratuities_included", label: BUILDER_COPY.cruiseGratuities, kind: "flag" },
      NOTES,
    ],
  },
  transfer: {
    kind: "transfer",
    icon: "trip",
    addLabel: BUILDER_COPY.addTransfer,
    shortLabel: BUILDER_COPY.kindTransfer,
    nameLabel: BUILDER_COPY.transferName,
    namePlaceholder: "Private transfer · Mercedes Vito",
    columns: {
      location: BUILDER_COPY.transferPickup,
      startDate: BUILDER_COPY.fieldDate,
      startTime: BUILDER_COPY.transferTime,
      endTime: BUILDER_COPY.transferArrives,
      confirmationNumber: BUILDER_COPY.fieldConfirmation,
    },
    detail: [
      { key: "dropoff", label: BUILDER_COPY.transferDropoff, kind: "text" },
      { key: "vehicle", label: BUILDER_COPY.transferVehicle, kind: "text" },
      NOTES,
    ],
  },
  excursion: {
    kind: "excursion",
    icon: "sparkle",
    addLabel: BUILDER_COPY.addExcursion,
    shortLabel: BUILDER_COPY.kindExcursion,
    nameLabel: BUILDER_COPY.excursionName,
    namePlaceholder: "Catamaran to Booby Cay",
    columns: {
      location: BUILDER_COPY.excursionMeet,
      startDate: BUILDER_COPY.fieldDate,
      startTime: BUILDER_COPY.excursionStarts,
      endDate: BUILDER_COPY.excursionEndsOn,
      endTime: BUILDER_COPY.excursionEnds,
      confirmationNumber: BUILDER_COPY.fieldConfirmation,
    },
    detail: [
      { key: "duration", label: BUILDER_COPY.excursionDuration, kind: "text" },
      NOTES,
    ],
  },
  insurance: {
    kind: "insurance",
    icon: "shield",
    addLabel: BUILDER_COPY.addInsurance,
    shortLabel: BUILDER_COPY.kindInsurance,
    nameLabel: BUILDER_COPY.insuranceName,
    namePlaceholder: "Allianz OneTrip Prime",
    // No `location`. A policy is not anywhere, and an empty "Where" on an insurance sheet
    // is a field the advisor has to decide to skip every single time.
    columns: {
      startDate: BUILDER_COPY.insuranceFrom,
      endDate: BUILDER_COPY.insuranceTo,
      confirmationNumber: BUILDER_COPY.insurancePolicy,
    },
    detail: [
      { key: "plan", label: BUILDER_COPY.insurancePlan, kind: "text" },
      { key: "coverage", label: BUILDER_COPY.insuranceCoverage, kind: "text" },
      NOTES,
    ],
  },
  custom: {
    kind: "custom",
    icon: "receipt",
    addLabel: BUILDER_COPY.addCustom,
    shortLabel: BUILDER_COPY.kindCustom,
    nameLabel: BUILDER_COPY.customName,
    namePlaceholder: "Welcome bottle · in-room",
    columns: {
      location: BUILDER_COPY.fieldWhere,
      startDate: BUILDER_COPY.fieldDate,
      startTime: BUILDER_COPY.fieldTime,
      endDate: BUILDER_COPY.fieldEndDate,
      endTime: BUILDER_COPY.fieldEndTime,
      confirmationNumber: BUILDER_COPY.fieldConfirmation,
    },
    detail: [NOTES],
  },
};

/** The rail's order: the four kinds an advisor reaches for most, then the rest. */
export const COMPONENT_RAIL: readonly ComponentKind[] = [
  "flight",
  "hotel",
  "cruise",
  "excursion",
  "transfer",
  "insurance",
  "custom",
];

export function isComponentKind(value: unknown): value is ComponentKind {
  return typeof value === "string" &&
    (COMPONENT_KINDS as readonly string[]).includes(value);
}

/** The sheet's kind from `?add=`, or null when the URL names nothing valid. */
export function componentKindFromParam(value: unknown): ComponentKind | null {
  return isComponentKind(value) ? value : null;
}

export type ComponentValues = {
  componentId: string;
  kind: ComponentKind;
  displayName: string;
  supplierId: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  confirmationNumber: string;
  /** Dollars as typed, e.g. "4980.00" — converted to cents at the action. */
  cost: string;
  commissionPct: string;
  commission: string;
  detail: Record<string, string>;
};

export type ComponentFormState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  values?: ComponentValues;
};

export function emptyComponent(kind: ComponentKind): ComponentValues {
  return {
    componentId: "",
    kind,
    displayName: "",
    supplierId: "",
    location: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    confirmationNumber: "",
    cost: "",
    commissionPct: "",
    commission: "",
    detail: {},
  };
}

export function componentFromFormData(form: FormData): ComponentValues {
  const raw = (form.get("kind") ?? "").toString();
  const kind: ComponentKind = isComponentKind(raw) ? raw : "custom";
  const text = (name: string) => (form.get(name) ?? "").toString().trim();

  const detail: Record<string, string> = {};
  for (const field of COMPONENT_SPECS[kind].detail) {
    // A checkbox that is not ticked submits NOTHING, so its absence is the "false" — there
    // is no value to read. `"on"` is what a ticked one sends and it never leaves this file:
    // the action converts it to a real boolean, because the Edge Function refuses a string
    // where it expects a flag, and "false" would be truthy.
    const value = text(`detail.${field.key}`);
    if (value !== "") detail[field.key] = value;
  }

  return {
    componentId: text("componentId"),
    kind,
    displayName: text("displayName"),
    supplierId: text("supplierId"),
    location: text("location"),
    startDate: text("startDate"),
    endDate: text("endDate"),
    startTime: text("startTime"),
    endTime: text("endTime"),
    confirmationNumber: text("confirmationNumber"),
    cost: text("cost"),
    commissionPct: text("commissionPct"),
    commission: text("commission"),
    detail,
  };
}

/**
 * Dollars as typed to a whole number of cents, or `null` when it is not a number.
 *
 * `"$4,980.00"` is what someone pastes out of a supplier confirmation, so the currency
 * symbol, the thousands separators and the surrounding space are stripped rather than
 * refused. What is NOT stripped is a second decimal point or a letter — those mean the
 * field was misread, not mistyped.
 *
 * Cents, never a float: `Math.round(4980.1 * 100)` is 498010 and `4980.1 * 100` is
 * 498010.00000000006. The rounding is the whole of the fix and it is why this returns an
 * integer rather than a dollar amount the action multiplies later.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Cents back to the plain decimal the form shows. No symbol — the label carries that. */
export function centsToDollars(cents: string | number | null): string {
  if (cents === null || cents === "") return "";
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

/** Field-level, so each message lands against the control that caused it. */
export function validateComponent(
  values: ComponentValues,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};

  if (!values.displayName) errors.displayName = [BUILDER_COPY.nameRequired];
  if (dollarsToCents(values.cost) === null) errors.cost = [BUILDER_COPY.costNotANumber];
  if (dollarsToCents(values.commission) === null) {
    errors.commission = [BUILDER_COPY.costNotANumber];
  }

  if (values.commissionPct !== "") {
    const pct = Number(values.commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 1000) {
      errors.commissionPct = [BUILDER_COPY.pctOutOfRange];
    }
  }

  // Checked here as well as in Postgres because the database's answer is a constraint
  // violation with no field attached, and the advisor needs to know WHICH date is wrong.
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = [BUILDER_COPY.endBeforeStart];
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
