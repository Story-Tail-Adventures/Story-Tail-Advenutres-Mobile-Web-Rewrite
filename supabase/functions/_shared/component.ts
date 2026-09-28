/**
 * §3.4.5 – §3.4.12's forms, validated.
 *
 * ── THIS FILE IS THE PRICE OF THE JSONB RULING ───────────────────────────────────────────
 *
 * Data-Model §23 settled on 2026-09-27 that `trip_component.payload` stays jsonb and no
 * subtype tables are added, and it stated the cost in plain words: *"Postgres will not stop
 * a malformed payload. The validation lives in the Edge Function."* This is that Edge
 * Function. If this file is wrong, nothing downstream is going to catch it.
 *
 * ── UNKNOWN KEYS ARE REFUSED, NOT DROPPED ────────────────────────────────────────────────
 *
 * A dropped key is a silent gap: the advisor types a cabin number, the save succeeds, the
 * field comes back empty, and nothing anywhere says why. A refused key is a 400 the first
 * time anybody saves — which makes this list and the form that feeds it drift-proof by
 * construction rather than by a parity script. It is the same reasoning
 * `check_copy_parity.py` exists for, arrived at from the other direction.
 *
 * ── WHAT IS A COLUMN AND WHAT IS PAYLOAD ─────────────────────────────────────────────────
 *
 * §23's boundary: anything a QUERY needs — filtered, sorted, summed, joined — is a column.
 * `payload` is detail a screen renders and nothing aggregates. Every key below was checked
 * against that line. Dates, times, place, confirmation number, cost and commission are all
 * columns on `trip_component` already and none of them appear here; what is left is a
 * flight's seats, a cruise's dining time, a policy's plan name.
 *
 * A field that starts here and later needs filtering is a migration, not a reinterpretation
 * of the jsonb.
 */
import { badRequest } from "./problem.ts";

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

type PayloadField =
  | { key: string; type: "text"; max: number }
  | { key: string; type: "flag" };

/**
 * Per-kind payload keys. THE WEB FORM'S FIELD LIST MUST MATCH THIS, kind for kind —
 * `web/lib/agent/components.ts` holds the other copy and names this file in its own header,
 * the same two-sided arrangement `TRIP_TYPES` has had since §3.4.3.
 *
 * SNAKE_CASE, matching every other jsonb in this schema — `audit_event.metadata`,
 * `client.important_dates`, and the `trip_component.payload` rows that already exist. The
 * first draft of this file used camelCase and the mismatch was silent in the worst way: the
 * edit sheet showed blank fields over a seeded component that HAD the data, and saving
 * would have replaced the whole payload with the empty set the form had rendered.
 *
 * `notes` is on every kind. It is the field an advisor reaches for when the structured ones
 * do not fit, and leaving it off any one kind would push that note into `display_name`,
 * where it would show up as the row title on the proposal a client reads.
 *
 * `dining` IS NOT A KIND. The prototype draws `A3410_AddDining` and the builder rail lists
 * "Dining · manual"; `component_kind` has no such value and §23 ruled that a dinner
 * reservation is a `custom` component. That ruling is honoured by this list's shape, not by
 * a comment somewhere: there is no dining entry to fall through to.
 */
const PAYLOAD_FIELDS: Record<ComponentKind, readonly PayloadField[]> = {
  flight: [
    { key: "flight_number", type: "text", max: 20 },
    { key: "cabin", type: "text", max: 60 },
    { key: "seat", type: "text", max: 80 },
    { key: "notes", type: "text", max: 2000 },
  ],
  hotel: [
    { key: "room_type", type: "text", max: 160 },
    { key: "board_basis", type: "text", max: 80 },
    { key: "notes", type: "text", max: 2000 },
  ],
  cruise: [
    { key: "ship", type: "text", max: 120 },
    { key: "itinerary_name", type: "text", max: 160 },
    { key: "cabin", type: "text", max: 60 },
    { key: "dining_seating", type: "text", max: 60 },
    { key: "gratuities_included", type: "flag" },
    { key: "notes", type: "text", max: 2000 },
  ],
  transfer: [
    { key: "dropoff", type: "text", max: 200 },
    { key: "vehicle", type: "text", max: 120 },
    { key: "notes", type: "text", max: 2000 },
  ],
  excursion: [
    { key: "duration", type: "text", max: 60 },
    { key: "notes", type: "text", max: 2000 },
  ],
  insurance: [
    { key: "plan", type: "text", max: 120 },
    { key: "coverage", type: "text", max: 160 },
    { key: "notes", type: "text", max: 2000 },
  ],
  custom: [
    { key: "notes", type: "text", max: 2000 },
  ],
};

/**
 * Keys this registry DELIBERATELY DOES NOT HAVE, each one because a column already holds
 * the fact. They were all in `trip_component.payload` in the seed and in Data-Model §8.3's
 * illustrative shapes before §3.4.4, and dropping them is the §23 boundary applied to data
 * that predates the boundary being written down:
 *
 *   airline, provider          → `supplier_id`, and `display_name` for the itinerary line
 *   origin, destination        → `location`
 *   meeting_point              → `location`
 *   policy_number              → `confirmation_number` (the seed held the SAME string twice)
 *   nights                     → `start_date` to `end_date`
 *   rate_cents_per_night       → money belongs in a column. This one had already drifted:
 *                                144328 × 7 is 1,010,296 against a `cost_cents` of
 *                                1,010,300, so the blob and the column disagreed by four
 *                                cents with nothing anywhere to notice.
 *   duration_hours / _minutes  → one `duration`, written the way an advisor says it
 *
 * `20260928130000_normalise_component_payload.sql` moves existing rows onto this shape.
 */
export function isComponentKind(value: unknown): value is ComponentKind {
  return typeof value === "string" &&
    (COMPONENT_KINDS as readonly string[]).includes(value);
}

export function requireComponentKind(value: unknown): ComponentKind {
  if (!isComponentKind(value)) {
    throw badRequest(`kind must be one of ${COMPONENT_KINDS.join(", ")}.`);
  }
  return value;
}

/**
 * The kind's payload, or a 400.
 *
 * An absent key and an empty string are both "not filled in" and both come back ABSENT —
 * never as `""`. `agent_upsert_trip_component` compares the whole stored payload against the
 * incoming one to decide `noop`, so `{}` and `{"notes": ""}` differing would make every save
 * of an untouched form look like a real edit, bump `updated_at`, and re-run the totals
 * trigger for nothing.
 */
export function readComponentPayload(
  kind: ComponentKind,
  raw: unknown,
): Record<string, string | boolean> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw badRequest("Component detail must be an object.");
  }

  const fields = PAYLOAD_FIELDS[kind];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = byKey.get(key);
    if (!field) {
      // Named, not generic. The advisor cannot act on this — it is a drift between the form
      // and this list — so the sentence is for whoever reads the log.
      throw badRequest(`"${key}" is not a field on a ${kind} component.`);
    }

    if (field.type === "flag") {
      if (value === undefined || value === null || value === false) continue;
      if (value !== true) throw badRequest(`"${key}" must be true or false.`);
      out[key] = true;
      continue;
    }

    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") throw badRequest(`"${key}" must be text.`);
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (trimmed.length > field.max) throw badRequest(`"${key}" is too long.`);
    out[key] = trimmed;
  }

  return out;
}

/** Every payload key a kind accepts. Exported for the test, and for nothing else. */
export function payloadKeysFor(kind: ComponentKind): string[] {
  return PAYLOAD_FIELDS[kind].map((f) => f.key);
}

/**
 * `HH:MM` or `HH:MM:SS`, or null.
 *
 * `<input type="time">` submits `HH:MM`, and Postgres accepts both — but it also accepts
 * "25:00" as an error rather than a value, so the ranges are checked here where the message
 * can say which field. The shape test alone is not enough: `/^\d{2}:\d{2}$/` passes "99:99".
 */
export function readTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest(`${field} must be a time.`);
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) throw badRequest(`${field} must be a time like 14:30.`);
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? "0")];
  if (h > 23 || min > 59 || sec > 59) throw badRequest(`${field} is not a real time.`);
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

/**
 * Cents, from a JSON number or a digit-string, as a number.
 *
 * BOTH FORMS ARE ACCEPTED because both are what callers have. `cents()` on the web side
 * hands back digit-strings — the convention this codebase adopted after PostgREST was caught
 * serialising `bigint` as a JSON number and losing precision on the way OUT. On the way IN
 * the risk is the same and the ceiling below is what removes it: ten digits is $100,000,000,
 * far under `Number.MAX_SAFE_INTEGER`, and far over any component anyone will ever book.
 * A figure above it is a typo or an attack, and either way not a cost.
 */
export function readCents(value: unknown, field: string): number {
  if (value === undefined || value === null || value === "") return 0;

  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    if (!/^-?\d{1,10}$/.test(value.trim())) throw badRequest(`${field} must be a number.`);
    n = Number(value.trim());
  } else {
    throw badRequest(`${field} must be a number.`);
  }

  if (!Number.isSafeInteger(n)) throw badRequest(`${field} must be a whole number of cents.`);
  if (n < 0) throw badRequest(`${field} cannot be negative.`);
  if (n > 9_999_999_999) throw badRequest(`${field} is too large.`);
  return n;
}

/**
 * `numeric(5,2)`, or null — so 0 through 999.99 and no more than two decimal places.
 *
 * Out of range is a 400 rather than a cast error from Postgres, which arrives as a bodyless
 * 500 and reads like the server broke. Same trade `requireExpectedVersion` makes one file
 * over, for the same reason.
 */
export function readCommissionPct(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw badRequest("Commission % must be a number.");
  if (n < 0) throw badRequest("Commission % cannot be negative.");
  if (n >= 1000) throw badRequest("Commission % is too large.");
  // Rounded rather than refused: a rate typed as 12.505 is a third decimal nobody meant,
  // and bouncing the whole sheet over it would be pedantic.
  return Math.round(n * 100) / 100;
}

/**
 * `commission_cents`, derived from the rate ONLY when the advisor left the amount blank.
 *
 * ── WHY BOTH COLUMNS EXIST, AND WHY NEITHER IS COMPUTED FROM THE OTHER ───────────────────
 *
 * `trip_component` stores `commission_pct` AND `commission_cents`, and the second is not
 * the first applied to `cost_cents`. Plenty of supplier commissions are not a clean
 * percentage of what the client pays: a flat per-booking fee, a rate on the cruise fare but
 * not the port charges, a bonus on top. If the amount were always computed, the advisor
 * could not record what they will actually be paid, and §3.7's commission tracking would
 * reconcile against a number nobody promised them.
 *
 * ── AND WHY IT IS DERIVED ANYWAY WHEN THE FIELD IS EMPTY ─────────────────────────────────
 *
 * Because the common case IS the percentage, and the alternative is asking someone to do
 * arithmetic in their head on every component — which they will skip, leaving
 * `commission_cents` at 0 on every row and §3.7 reading a book with no commission in it.
 * That is precisely how `trip.total_value_cents` became a column documented as a sum with
 * nothing computing it.
 *
 * The rule is one sentence, and the form says it out loud: TYPE AN AMOUNT AND IT WINS;
 * LEAVE IT BLANK WITH A RATE SET AND THE RATE FILLS IT IN. An explicit 0 is an amount and
 * wins too, which is how an advisor records a component they earn nothing on.
 */
export function resolveCommissionCents(
  costCents: number,
  commissionPct: number | null,
  explicit: unknown,
): number {
  const typed = explicit !== undefined && explicit !== null && explicit !== "";
  if (typed) return readCents(explicit, "Commission");
  if (commissionPct === null || commissionPct === 0) return 0;
  // Rounded to the cent, half away from zero. Both inputs are already non-negative.
  return Math.round((costCents * commissionPct) / 100);
}
