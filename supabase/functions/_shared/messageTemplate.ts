/**
 * §3.10 Stage 2's request checks for message templates, server-free so they are tested on their
 * own (`messageTemplate_test.ts`). The SQL functions check all of this again; these answer in
 * English first, so a refused save is a 400 with a sentence rather than a 500 off a RAISE.
 */
import { badRequest } from "./problem.ts";
import { MAX_MESSAGE_BODY } from "./message.ts";

/**
 * The merge fields (Data-Model §12.4). The SQL `message_template_fields()` and the web's
 * `lib/agent/templateMerge.ts` carry the same list; `templateMerge.test.ts` on the web side reads
 * the migration and this file to prove all three agree (Deno's tests run without file access).
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
  // Added 2026-10-16 (§3.6): the milestone's pay_url. Unfilled, and flagged, when it has none.
  "payment.link",
] as const;

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
export const MAX_TAGS = 10;
export const MAX_TAG = 30;

// The same shape the SQL matches: `{{`, anything but braces, `}}`.
const TOKEN = /\{\{([^{}]*)\}\}/g;

/** Every `{{ … }}` whose inside is not a merge field, in order, once each. */
export function unknownTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(TOKEN)) {
    const inner = match[1].trim();
    if (!(MERGE_FIELDS as readonly string[]).includes(inner)) seen.add(inner);
  }
  return [...seen];
}

/** Every merge field still sitting in a body as a raw `{{token}}`, in order, once each. */
export function unfilledFields(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(TOKEN)) {
    const inner = match[1].trim();
    if ((MERGE_FIELDS as readonly string[]).includes(inner)) seen.add(inner);
  }
  return [...seen];
}

/**
 * Refuse a message that still carries a merge field (Screen Inventory §3.10.3): "Insert & edit"
 * leaves the raw token in the box, and a client must never read `{{trip.dates}}`. Only the
 * known fields count, so a client's own `{{` in a quoted message is not caught by mistake.
 */
export function refuseUnfilledFields(body: string): void {
  const left = unfilledFields(body);
  if (left.length === 0) return;
  throw badRequest(
    `Fill in ${left.map((f) => `{{${f}}}`).join(", ")} before sending. It came from the template and has no value here.`,
  );
}

export function readCategory(value: unknown): TemplateCategory {
  if (typeof value !== "string" || !(TEMPLATE_CATEGORIES as readonly string[]).includes(value)) {
    throw badRequest("Pick a category for this template.");
  }
  return value as TemplateCategory;
}

export function readTemplateName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw badRequest("A template needs a name.");
  if (name.length > MAX_TEMPLATE_NAME) {
    throw badRequest(`Keep the name to ${MAX_TEMPLATE_NAME} characters.`);
  }
  return name;
}

/** The body as written (not trimmed: a template's blank lines are its shape), checked. */
export function readTemplateBody(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest("A template needs something in it.");
  }
  if (value.length > MAX_MESSAGE_BODY) {
    throw badRequest(`Keep it under ${MAX_MESSAGE_BODY.toLocaleString("en-US")} characters, one message's worth.`);
  }
  const unknown = unknownTokens(value);
  if (unknown.length > 0) {
    throw badRequest(
      `${unknown.map((t) => `{{${t}}}`).join(", ")} ${unknown.length === 1 ? "isn't a merge field" : "aren't merge fields"}. Pick from the list under the message.`,
    );
  }
  return value;
}

/** Tags trimmed, blanks and repeats dropped (ignoring case, first spelling kept), then checked. */
export function readTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((t) => typeof t !== "string")) {
    throw badRequest("Tags must be a list of words.");
  }
  const kept = new Map<string, string>();
  for (const raw of value as string[]) {
    const tag = raw.trim();
    if (tag && !kept.has(tag.toLowerCase())) kept.set(tag.toLowerCase(), tag);
  }
  const tags = [...kept.values()];
  if (tags.length > MAX_TAGS) throw badRequest(`Up to ${MAX_TAGS} tags.`);
  if (tags.some((t) => t.length > MAX_TAG)) throw badRequest(`Keep each tag to ${MAX_TAG} characters.`);
  return tags;
}
