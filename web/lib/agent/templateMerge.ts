import { formatTripDates } from "@/lib/trips/format";
import { formatTripMoney } from "@/lib/trips/money";

/**
 * §3.10 Stage 2's merge fields (Data-Model §12.4), and the one place a template's `{{tokens}}`
 * turn into words.
 *
 * THE SAME LIST LIVES IN TWO OTHER PLACES: the migration's `message_template_fields()` and the
 * Edge Functions' `_shared/messageTemplate.ts`. `templateMerge.test.ts` reads both files and
 * fails if any of the three drift.
 *
 * A FIELD WITH NO VALUE IS NEVER FILLED WITH BLANK SPACE (Gyasi, 2026-10-14). `renderTemplate`
 * leaves its raw token in place and reports it as missing, so the picker can turn "Insert
 * as-is" off and the reply box can refuse to send. A client never reads "your trip on .".
 */

export const MERGE_FIELDS = [
  "client.firstName",
  "trip.name",
  "trip.destination",
  "trip.dates",
  "agent.firstName",
  "payment.label",
  "payment.amount",
  "payment.dueDate",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const TEMPLATE_CATEGORIES = [
  "lead_response",
  "proposal",
  "booking_confirmation",
  "pre_trip",
  "post_trip",
  "payment_reminder",
  "other",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const MAX_TEMPLATE_NAME = 80;
export const MAX_TEMPLATE_BODY = 8000;
export const MAX_TAGS = 10;
export const MAX_TAG = 30;

/** Values for the fields that have one. A field absent here is missing, not empty. */
export type MergeValues = Partial<Record<MergeField, string>>;

// `{{`, anything but braces, `}}`: the shape the SQL and the Edge Function match.
const TOKEN = /\{\{([^{}]*)\}\}/g;

function isField(name: string): name is MergeField {
  return (MERGE_FIELDS as readonly string[]).includes(name);
}

/** Every `{{ … }}` whose inside is not a merge field, in order, once each. */
export function unknownTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(TOKEN)) {
    const inner = match[1].trim();
    if (!isField(inner)) seen.add(inner);
  }
  return [...seen];
}

/** Every merge field still in a body as a raw token, in order, once each. */
export function unfilledFields(body: string): MergeField[] {
  const seen = new Set<MergeField>();
  for (const match of body.matchAll(TOKEN)) {
    const inner = match[1].trim();
    if (isField(inner)) seen.add(inner);
  }
  return [...seen];
}

export type Rendered = {
  /** The body with every field that has a value filled in; the rest left as raw tokens. */
  text: string;
  /** The fields that had no value, in the order they first appear. */
  missing: MergeField[];
};

/** Fill a template. Unknown tokens are left exactly as written; the editor refuses them. */
export function renderTemplate(body: string, values: MergeValues): Rendered {
  const missing = new Set<MergeField>();
  const text = body.replace(TOKEN, (whole, raw: string) => {
    const inner = raw.trim();
    if (!isField(inner)) return whole;
    const value = values[inner];
    if (value === undefined || value.trim() === "") {
      missing.add(inner);
      return whole;
    }
    return value;
  });
  return { text, missing: [...missing] };
}

/** "Bahamas", "Bahamas and St. Maarten", "Aruba, Curaçao and Bonaire". */
export function joinDestinations(destinations: readonly string[]): string {
  const list = destinations.map((d) => d.trim()).filter(Boolean);
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The raw merge data `agent_message_merge_context` answers, as the web reads it. */
export type MergeContext = {
  clientFirstName: string | null;
  agentFirstName: string | null;
  tripTitle: string | null;
  tripDestinations: string[] | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  paymentLabel: string | null;
  /** What is still owed, as a digit string. */
  paymentOwedCents: string | null;
  paymentCurrency: string | null;
  paymentDueDate: string | null;
};

/**
 * The words each field becomes. A field is left out whenever its source is missing, so it
 * reads as missing rather than as an empty string: a trip with no start date has no
 * `trip.dates` (never "Dates to come" inside a client's message).
 */
export function mergeValues(ctx: MergeContext): MergeValues {
  const values: MergeValues = {};
  const set = (field: MergeField, value: string | null | undefined) => {
    if (value && value.trim()) values[field] = value.trim();
  };
  set("client.firstName", ctx.clientFirstName);
  set("agent.firstName", ctx.agentFirstName);
  set("trip.name", ctx.tripTitle);
  set("trip.destination", joinDestinations(ctx.tripDestinations ?? []));
  if (ctx.tripStartDate) set("trip.dates", formatTripDates(ctx.tripStartDate, ctx.tripEndDate));
  set("payment.label", ctx.paymentLabel);
  if (ctx.paymentOwedCents !== null && /^\d+$/.test(ctx.paymentOwedCents)) {
    set("payment.amount", formatTripMoney(Number(ctx.paymentOwedCents), ctx.paymentCurrency ?? "USD"));
  }
  if (ctx.paymentDueDate) set("payment.dueDate", formatTripDates(ctx.paymentDueDate, null));
  return values;
}

/**
 * The editor's preview data (Screen Inventory §3.10.5): a fixed sample, never a real client,
 * because writing copy is no reason to put a real traveler's name on screen. The artboard's.
 */
export const SAMPLE_CONTEXT: MergeContext = {
  clientFirstName: "Jordan",
  agentFirstName: "Gyasi",
  tripTitle: "Honeymoon in Nassau",
  tripDestinations: ["Nassau, Bahamas"],
  tripStartDate: "2026-08-12",
  tripEndDate: "2026-08-19",
  paymentLabel: "Final balance",
  paymentOwedCents: "120000",
  paymentCurrency: "USD",
  paymentDueDate: "2026-06-12",
};

/** Insert `text` at the cursor, never replacing a draft (§3.10.3). Returns the new caret too. */
export function insertAtCursor(
  draft: string,
  text: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { value: string; caret: number } {
  if (draft.trim() === "") return { value: text, caret: text.length };
  const start = selectionStart ?? draft.length;
  // A selection is kept too: inserting never replaces what was typed.
  const at = Math.max(start, selectionEnd ?? start);
  return { value: draft.slice(0, at) + text + draft.slice(at), caret: at + text.length };
}
