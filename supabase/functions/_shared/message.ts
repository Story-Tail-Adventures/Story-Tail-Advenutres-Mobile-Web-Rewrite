/**
 * §3.10's request checks for the advisor's messaging, server-free so they are tested on their
 * own (`message_test.ts`). The SQL functions check all of this again; these answer in English
 * first, so a malformed request is a 400 with a sentence rather than a 500 off a RAISE.
 */
import { badRequest } from "./problem.ts";
import { assertRecentUuidV7, isUuid } from "./uuid.ts";

/** The same ceiling `trip-message` puts on a client's message. */
export const MAX_MESSAGE_BODY = 8000;

/** How many threads one archive moves; `agent_set_conversations_archived` refuses more. */
export const MAX_ARCHIVE = 100;

/** A message body: trimmed, something in it, under the ceiling. */
export function readMessageBody(value: unknown): string {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) throw badRequest("A message needs something in it.");
  if (body.length > MAX_MESSAGE_BODY) {
    throw badRequest(`Keep it under ${MAX_MESSAGE_BODY.toLocaleString("en-US")} characters.`);
  }
  return body;
}

export type ThreadAddress =
  | { kind: "thread"; conversationId: string }
  | { kind: "client"; clientId: string; tripId: string | null };

/**
 * Where a message goes: an existing thread, OR a client (and, optionally, one of their trips).
 * Never both: a thread id from one client sent beside another client's id would put the
 * message somewhere the caller did not name.
 */
export function readThreadAddress(payload: Record<string, unknown>): ThreadAddress {
  const { conversationId, clientId, tripId } = payload;
  if (conversationId !== undefined && conversationId !== null) {
    if (!isUuid(conversationId)) throw badRequest("That is not a thread id.");
    if ((clientId ?? null) !== null || (tripId ?? null) !== null) {
      throw badRequest("Send a thread, or a client and trip, not both.");
    }
    return { kind: "thread", conversationId };
  }
  if (!isUuid(clientId)) throw badRequest("Say which thread or which client this is for.");
  if (tripId !== undefined && tripId !== null && !isUuid(tripId)) {
    throw badRequest("That is not a trip id.");
  }
  return { kind: "client", clientId, tripId: (tripId as string | null | undefined) ?? null };
}

/**
 * The id the caller minted for its message, REQUIRED as `trip-message` requires it: minting it
 * once per draft is what makes a double click or a retry land once, the repeat refused as
 * already sent. A recent v7 (Data-Model §21.6).
 */
export function readMessageId(value: unknown): string {
  if (typeof value !== "string") throw badRequest("Send the message with its id.");
  try {
    assertRecentUuidV7(value);
  } catch {
    throw badRequest("That message is out of date. Copy it and send it again.");
  }
  return value;
}

/**
 * Whether a send is an internal note. REQUIRED, never defaulted: a missing flag read as
 * "public" would send a private note to the client.
 */
export function readInternalNote(value: unknown): boolean {
  if (typeof value !== "boolean") throw badRequest("internalNote must be true or false.");
  return value;
}

// An ISO 8601 timestamp with a zone, as PostgREST writes timestamptz.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * The created_at of the newest message the caller had on screen: reading (or writing in) a
 * thread clears only what that covers. Passed through AS TEXT, never through `Date`, which keeps
 * milliseconds and would drop the microseconds Postgres compares on: the newest message would
 * then look newer than itself and stay unread.
 */
export function readSeenUpTo(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw badRequest("Say which message was the newest on screen.");
    return null;
  }
  if (typeof value !== "string" || !TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest("seenUpTo must be a timestamp.");
  }
  return value;
}

/** The threads one archive names: at least one, at most MAX_ARCHIVE, no repeats. */
export function readConversationIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("Pick at least one thread.");
  if (value.length > MAX_ARCHIVE) throw badRequest(`Archive up to ${MAX_ARCHIVE} at a time.`);
  const ids = new Set<string>();
  for (const id of value) {
    if (!isUuid(id)) throw badRequest("That is not a thread id.");
    ids.add(id.toLowerCase());
  }
  return [...ids];
}
