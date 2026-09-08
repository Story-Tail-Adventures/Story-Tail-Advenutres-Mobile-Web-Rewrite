"use server";

import { refresh, revalidatePath } from "next/cache";

import { DOCUMENT_MESSAGES } from "./documents";
import { THREAD_MESSAGES } from "./thread";
import { absoluteStorageUrl, callTripFunction } from "./api";

/**
 * Server actions for screens 2.2.6 and 2.2.7.
 *
 * Both return a value rather than throwing, because both callers are form components that
 * have to turn failure into something a traveler can read. `detail` is only ever surfaced
 * from a 4xx problem+json body — messages we wrote ourselves. A 5xx detail carries whatever
 * Postgres said, which belongs in the function log and not on screen.
 */

export type SignedDocument = { ok: true; url: string } | { ok: false; message: string };

/**
 * Sign a read URL for one document, for 2.2.6's view/download action.
 *
 * ON DELIBERATELY NOT PRE-SIGNING THE WHOLE LIST: the TTL is five minutes and every
 * signature writes an `audit_event`. Signing all five documents to render the page would put
 * five access records on the trail for a traveler who opened none of them, and four of the
 * URLs would be dead by the time anybody clicked. Signing on demand keeps the audit trail
 * honest about what was actually opened, which is the trail's whole purpose (Data-Model
 * §18.3).
 */
export async function signDocument(documentId: string): Promise<SignedDocument> {
  const result = await callTripFunction("trip-document-url", {
    method: "GET",
    query: { documentId },
  });

  if (!result.ok) {
    return { ok: false, message: DOCUMENT_MESSAGES.openFailed };
  }

  const path = result.data.path;
  if (typeof path !== "string") {
    return { ok: false, message: DOCUMENT_MESSAGES.openFailed };
  }

  return { ok: true, url: absoluteStorageUrl(path) };
}

export type SendMessageState = { status: "idle" | "sent" } | { status: "error"; message: string; draft: string };

/**
 * Send a message on a trip thread, for 2.2.7's compose bar.
 *
 * The message id is minted here rather than in the browser. `message.id` has no default and
 * the function validates that the UUID v7 timestamp is recent (Data-Model §21.6) — a client
 * clock that is days off would have every send rejected as stale, and a traveler cannot fix
 * their system clock from a compose bar. Offline-first id generation is a §3 concern, where
 * a queued write genuinely needs an id before it reaches a server.
 *
 * ON FAILURE THE DRAFT COMES BACK in the returned state. Losing a paragraph somebody typed
 * because a request timed out is the kind of small betrayal that stops people using a
 * thread at all.
 */
export async function sendTripMessage(
  tripId: string,
  _previous: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const raw = formData.get("body");
  const body = typeof raw === "string" ? raw.trim() : "";

  // Nothing to send is not an error worth a message — the button is disabled for this case
  // and this is the keyboard-submit path reaching the same conclusion.
  if (body.length === 0) return { status: "idle" };

  const result = await callTripFunction("trip-message", {
    method: "POST",
    body: { messageId: uuidV7(), tripId, body },
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.kind === "rejected" && result.detail ? result.detail : THREAD_MESSAGES.sendFailed,
      draft: body,
    };
  }

  // `refresh()`, not `revalidatePath`, for the thread the traveler is looking at. These
  // reads run through RLS on the caller's own cookies, so they are dynamic renders with
  // nothing in the data cache to invalidate — what actually needs to happen is the client
  // router re-rendering the server component, which is exactly what refresh() does.
  refresh();

  // The dashboard is a different route and holds `conversation.last_message_preview`, which
  // this send just changed. Without this it shows the previous message until its router
  // cache entry expires. The trip detail screen needs nothing: it reads
  // `client_unread_count`, and a message the CLIENT sent bumps the agent's count, not
  // theirs.
  revalidatePath("/dashboard");
  return { status: "sent" };
}

/**
 * UUID v7, time-ordered, per Data-Model §21.6.
 *
 * The 48-bit big-endian millisecond timestamp is what the functions validate for recency;
 * the rest is random. `crypto.getRandomValues` rather than `Math.random` because these ids
 * are primary keys and a collision is a lost message.
 */
function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = 0x70 | (bytes[6] & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f); // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
