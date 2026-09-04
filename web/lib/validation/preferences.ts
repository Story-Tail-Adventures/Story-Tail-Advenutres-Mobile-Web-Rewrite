import { NO_CONTROL_CHARS } from "./text";

/**
 * Screen 2.1.11 Travel Preferences — the rules.
 *
 * Not a zod schema, and that is deliberate. Every other §2.1 form is a fixed set of named
 * inputs; this one is four chip groups whose values are checked against closed
 * vocabularies, a repeater posting parallel `getAll()` arrays, and two free-text notes. A
 * zod object over `FormData` would spend more lines describing the shape than checking it.
 * What matters is checked here and again in supabase/functions/onboarding-preferences —
 * that endpoint is reachable without this form, and it is the one the CHECK constraints
 * sit behind.
 *
 * THE VOCABULARIES ARE CLOSED, and the labels are not the values. "Honeymoon" is what a
 * person calls their trip; `romantic` is what Data-Model §6.2, Screen-Inventory §2.1.11 and
 * the CHECK constraint in 20260904124903 all call it. The prototype shows only the label,
 * so a straight transcription would store a value nothing else in the system recognises.
 *
 * Web-only copy until mobile builds 2.1m.11 — when it does, these need Kotlin twins and
 * entries in .github/scripts/check_copy_parity.py's key map.
 */

export const PREFERENCES_MESSAGES = {
  destinationsTooMany:
    "That's more than Gyasi can hold in his head — pick up to 12",
  destinationTooLong: "Keep a place name to 60 characters or fewer",
  invalidChars: "Some of those characters won't work here",
  unknownOption: "That isn't one of the options",
  dietaryNoneAlone:
    '"No restrictions" doesn\'t go with the others — pick one or the other',
  dietaryNoneWithNote:
    'You\'ve said no restrictions, but written one below — untick "No restrictions" and ' +
    "we'll pass the note on",
  accessibilityNoneAlone:
    '"None" doesn\'t go with the others — pick one or the other',
  accessibilityNoneWithNote:
    "You've said none, but written one below — untick \"None\" and we'll pass the note on",
  notesTooLong: "Keep this to 500 characters or fewer",
  favoritesTooLong: "Keep this to 1000 characters or fewer",
  loyaltyNeedsProgram: "Which program is that number for?",
  loyaltyNumberShape: "A membership number is letters, digits and hyphens",
  loyaltyProgramTooLong: "Keep a program name to 60 characters or fewer",
  loyaltyTooMany: "That's as many programs as we can hold — up to 10",
  budgetUnknown: "Pick one of the ranges, or say you're not sure yet",
} as const;

export const PREFERENCE_LIMITS = {
  destinations: 12,
  destinationLength: 60,
  notes: 500,
  favorites: 1000,
  loyaltyRows: 10,
  loyaltyProgram: 60,
  loyaltyNumber: 40,
} as const;

export interface Option {
  /** What a person reads. */
  label: string;
  /** What the column stores. Not always the same word — see "Honeymoon" → `romantic`. */
  value: string;
}

/** The eight the prototype offers. Free entry adds to the same array; see `parseDestinations`. */
export const DESTINATION_SUGGESTIONS: readonly string[] = [
  "Caribbean",
  "Bahamas",
  "Greece",
  "Mexico",
  "Costa Rica",
  "Italy",
  "Iceland",
  "Japan",
];

export const TRAVEL_STYLE_OPTIONS: readonly Option[] = [
  { label: "Resort", value: "resort" },
  { label: "Cruise", value: "cruise" },
  { label: "Adventure", value: "adventure" },
  { label: "Family", value: "family" },
  // The one place the label and the value genuinely differ.
  { label: "Honeymoon", value: "romantic" },
  { label: "Group", value: "group" },
];

export const DIETARY_OPTIONS: readonly Option[] = [
  { label: "No restrictions", value: "none" },
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Pescatarian", value: "pescatarian" },
  { label: "Gluten-free", value: "gluten_free" },
  { label: "Halal", value: "halal" },
];

export const ACCESSIBILITY_OPTIONS: readonly Option[] = [
  { label: "None", value: "none" },
  { label: "Mobility-friendly", value: "mobility" },
  { label: "Quiet rooms", value: "quiet_room" },
  { label: "Service animal", value: "service_animal" },
];

/**
 * The four bands, and the dollar figures are labels rather than data.
 *
 * `travel_preference.budget_band` stores only the slug, so these ranges can be re-cut when
 * Gyasi says where his trips actually sit — a copy change, not a migration. They were read
 * off the prototype's $1k–$10k+ slider, which is a demo control and not a commercial
 * decision anybody has made.
 *
 * "Not sure yet" is not decoration: a radio group cannot return to unselected, so without
 * an explicit way to say nothing the first tap would be irreversible.
 */
export const BUDGET_OPTIONS: readonly Option[] = [
  { label: "Up to $2,500", value: "budget" },
  { label: "$2,500 – $5,000", value: "mid" },
  { label: "$5,000 – $10,000", value: "premium" },
  { label: "$10,000+", value: "luxury" },
];

export const BUDGET_UNSURE_LABEL = "Not sure yet";

/** The sentinel meaning "asked and answered: nothing to worry about". */
export const NONE = "none";

export interface LoyaltyRow {
  program: string;
  number: string;
}

export interface PreferencesInput {
  destinations: string[];
  destinationOther: string;
  travelStyles: string[];
  dietary: string[];
  dietaryNotes: string;
  accessibility: string[];
  accessibilityNotes: string;
  loyalty: LoyaltyRow[];
  budgetBand: string;
  favoritePastTrips: string;
}

export type PreferencesField =
  | "destinations"
  | "travelStyles"
  | "dietary"
  | "dietaryNotes"
  | "accessibility"
  | "accessibilityNotes"
  | "loyalty"
  | "budgetBand"
  | "favoritePastTrips";

export interface PreferencesPayload {
  destinations: string[];
  travelStyles: string[];
  dietary: string[];
  dietaryNotes: string | null;
  accessibility: string[];
  accessibilityNotes: string | null;
  loyalty: LoyaltyRow[];
  budgetBand: string | null;
  favoritePastTrips: string | null;
}

export type PreferencesResult =
  | { ok: true; payload: PreferencesPayload }
  | { ok: false; fieldErrors: Partial<Record<PreferencesField, string[]>> };

/**
 * Validate what the form posted and build the Edge Function's body.
 *
 * Every key is always sent. The function reads an absent key as "leave it alone", so a
 * group somebody cleared has to arrive as an empty array rather than not arrive at all.
 */
export function parsePreferences(input: PreferencesInput): PreferencesResult {
  const fieldErrors: Partial<Record<PreferencesField, string[]>> = {};
  const fail = (field: PreferencesField, message: string) => {
    (fieldErrors[field] ??= []).push(message);
  };

  const destinations = parseDestinations(input, fail);
  const travelStyles = closed(
    input.travelStyles,
    TRAVEL_STYLE_OPTIONS,
    "travelStyles",
    fail,
  );
  const dietary = sentinel(
    closed(input.dietary, DIETARY_OPTIONS, "dietary", fail),
    "dietary",
    PREFERENCES_MESSAGES.dietaryNoneAlone,
    fail,
  );
  const accessibility = sentinel(
    closed(input.accessibility, ACCESSIBILITY_OPTIONS, "accessibility", fail),
    "accessibility",
    PREFERENCES_MESSAGES.accessibilityNoneAlone,
    fail,
  );
  const dietaryNotes = notes(
    input.dietaryNotes,
    "dietaryNotes",
    PREFERENCE_LIMITS.notes,
    fail,
  );
  const accessibilityNotes = notes(
    input.accessibilityNotes,
    "accessibilityNotes",
    PREFERENCE_LIMITS.notes,
    fail,
  );
  // The sentinel cannot sit beside a NOTE either, and this is the likelier of the two
  // contradictions it forbids: the vocabulary has no slug for an allergy, so a real one
  // lands in the note. "No restrictions" plus "severe shellfish allergy" is what somebody
  // produces by ticking the reassuring chip and then typing the truth underneath.
  if (dietary.includes(NONE) && dietaryNotes !== null) {
    fail("dietary", PREFERENCES_MESSAGES.dietaryNoneWithNote);
  }
  if (accessibility.includes(NONE) && accessibilityNotes !== null) {
    fail("accessibility", PREFERENCES_MESSAGES.accessibilityNoneWithNote);
  }

  const favoritePastTrips = notes(
    input.favoritePastTrips,
    "favoritePastTrips",
    PREFERENCE_LIMITS.favorites,
    fail,
  );
  const loyalty = parseLoyalty(input.loyalty, fail);
  const budgetBand = parseBudget(input.budgetBand, fail);

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    payload: {
      destinations,
      travelStyles,
      dietary,
      dietaryNotes,
      accessibility,
      accessibilityNotes,
      loyalty,
      budgetBand,
      favoritePastTrips,
    },
  };
}

type Fail = (field: PreferencesField, message: string) => void;

/**
 * The eight chips plus whatever somebody typed, as one deduplicated list.
 *
 * Free entry is an ADDITION to the prototype. Eight fixed chips is a picker only if your
 * dream trip happens to be on the list, and Screen-Inventory §2.1.11 calls this a tag
 * picker. The column is already `text[]` and `lead.destinations` is likewise free-form
 * labels, so a P2 lead converts without translation.
 *
 * Commas split, because without JavaScript the "Add" button is just a text box.
 */
function parseDestinations(input: PreferencesInput, fail: Fail): string[] {
  const typed = input.destinationOther
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  const out: string[] = [];
  for (const entry of [...input.destinations, ...typed]) {
    const value = entry.trim();
    if (value === "") continue;
    if (value.length > PREFERENCE_LIMITS.destinationLength) {
      fail("destinations", PREFERENCES_MESSAGES.destinationTooLong);
      continue;
    }
    if (!NO_CONTROL_CHARS.test(value)) {
      fail("destinations", PREFERENCES_MESSAGES.invalidChars);
      continue;
    }
    // Case-insensitive, keeping the casing that arrived first: "caribbean" typed into the
    // box after ticking "Caribbean" is the same place, and a list showing both looks broken.
    if (!out.some((seen) => seen.toLowerCase() === value.toLowerCase()))
      out.push(value);
  }

  if (out.length > PREFERENCE_LIMITS.destinations) {
    fail("destinations", PREFERENCES_MESSAGES.destinationsTooMany);
    return out.slice(0, PREFERENCE_LIMITS.destinations);
  }
  return out;
}

/** Every value must be one the chips offer. Anything else was not clicked, it was crafted. */
function closed(
  values: string[],
  options: readonly Option[],
  field: PreferencesField,
  fail: Fail,
): string[] {
  const allowed = new Set(options.map((option) => option.value));
  const out: string[] = [];
  for (const value of values) {
    if (!allowed.has(value)) {
      fail(field, PREFERENCES_MESSAGES.unknownOption);
      continue;
    }
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/** `none` means "asked and answered", so it cannot sit beside a real answer. */
function sentinel(
  values: string[],
  field: PreferencesField,
  message: string,
  fail: Fail,
): string[] {
  if (values.includes(NONE) && values.length > 1) fail(field, message);
  return values;
}

function notes(
  value: string,
  field: PreferencesField,
  max: number,
  fail: Fail,
): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) {
    fail(
      field,
      max === PREFERENCE_LIMITS.favorites
        ? PREFERENCES_MESSAGES.favoritesTooLong
        : PREFERENCES_MESSAGES.notesTooLong,
    );
  }
  return trimmed;
}

/**
 * The repeater's rows, minus the blank ones.
 *
 * A row with neither field is the last empty line of the repeater, not a mistake. A number
 * with no program is a mistake worth naming: nobody can credit miles to "4ZE82Q".
 */
function parseLoyalty(rows: LoyaltyRow[], fail: Fail): LoyaltyRow[] {
  const out: LoyaltyRow[] = [];
  for (const row of rows) {
    const program = row.program.trim();
    const number = row.number.trim();
    if (program === "" && number === "") continue;
    if (program === "") {
      fail("loyalty", PREFERENCES_MESSAGES.loyaltyNeedsProgram);
      continue;
    }
    if (program.length > PREFERENCE_LIMITS.loyaltyProgram) {
      fail("loyalty", PREFERENCES_MESSAGES.loyaltyProgramTooLong);
      continue;
    }
    if (number !== "" && !LOYALTY_NUMBER.test(number)) {
      fail("loyalty", PREFERENCES_MESSAGES.loyaltyNumberShape);
      continue;
    }
    out.push({ program, number });
  }
  if (out.length > PREFERENCE_LIMITS.loyaltyRows) {
    fail("loyalty", PREFERENCES_MESSAGES.loyaltyTooMany);
    return out.slice(0, PREFERENCE_LIMITS.loyaltyRows);
  }
  return out;
}

/** Membership ids are alphanumeric; anything else is a paste accident. */
const LOYALTY_NUMBER = /^[A-Za-z0-9-]{1,40}$/;

function parseBudget(value: string, fail: Fail): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!BUDGET_OPTIONS.some((option) => option.value === trimmed)) {
    fail("budgetBand", PREFERENCES_MESSAGES.budgetUnknown);
    return null;
  }
  return trimmed;
}
