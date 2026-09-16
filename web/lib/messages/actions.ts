"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callTripFunction } from "@/lib/trips/api";
import type { SendMessageState } from "@/lib/trips/thread";
import { uuidV7 } from "@/lib/uuid";

/**
 * Server actions for Screens 2.6.2 and 2.6.3.
 *
 * BOTH GO THROUGH `trip-message`, which is now three endpoints wearing one name: address a
 * thread by `tripId` (2.2.7), by `conversationId` (2.6.2), or by neither for the general
 * thread (2.6.3). A second function would have duplicated the ownership check, the
 * attachment filter and the conversation denormalization — the three things most worth
 * having in one place.
 *
 * The name is now half wrong and that is recorded in the function's own header rather than
 * fixed here: renaming a deployed function moves config.toml, the CI check, the OpenAPI
 * contract and both clients together.
 */

/**
 * The state shape is `SendMessageState` from `@/lib/trips/thread`, imported above and NOT
 * re-exported — same reasoning as the note in `lib/trips/actions.ts`. It is shared because
 * 2.6.2's compose bar IS 2.2.7's, handed a different action.
 */

/**
 * Post into an existing thread, for 2.6.2's compose bar.
 *
 * Addressed by CONVERSATION, not trip. A general thread has `trip_id IS NULL` and no trip to
 * key on, so `sendTripMessage` cannot serve this screen at all.
 */
export async function sendConversationMessage(
  conversationId: string,
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
    body: { messageId: uuidV7(), conversationId, body },
  });

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.kind === "rejected" && result.detail ? result.detail : MESSAGES_SEND_FAILED,
      draft: body,
    };
  }

  // `refresh()` for the thread being looked at — these reads run through RLS on the caller's
  // own cookies, so they are dynamic renders with nothing in the data cache to invalidate.
  refresh();

  // THREE OTHER ROUTES HOLD `last_message_preview`, and this send just changed it. The
  // §2.2.7 trip thread does not (it reads messages directly), but the inbox, the dashboard
  // and the trip detail tile all render the denormalized preview and would show the previous
  // message until their router cache entries expired.
  revalidatePath("/messages");
  revalidatePath("/dashboard");
  return { status: "sent" };
}

/**
 * Start — or continue — the general thread, for 2.6.3.
 *
 * SENDS NEITHER ID. That is what tells `trip-message` to find-or-create against
 * `trip_id IS NULL`, so a traveler who writes twice lands in one thread rather than two.
 * The find is `.is()` rather than `.eq()`: PostgREST renders `.eq("trip_id", null)` as
 * `trip_id=eq.null` and Postgres rejects it as an invalid uuid, so the naive version 500s on
 * every send rather than merely failing to match.
 *
 * REDIRECTS INTO THE THREAD it just created or appended to, because the screen it is leaving
 * has nothing left to show — the message is sent and 2.6.2 is where the reply will arrive.
 */
export async function startConversation(
  _previous: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const raw = formData.get("body");
  const body = typeof raw === "string" ? raw.trim() : "";
  if (body.length === 0) return { status: "idle" };

  const result = await callTripFunction("trip-message", {
    method: "POST",
    body: { messageId: uuidV7(), body },
  });

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.kind === "rejected" && result.detail ? result.detail : MESSAGES_SEND_FAILED,
      draft: body,
    };
  }

  const conversationId = result.data.conversationId;
  revalidatePath("/messages");
  revalidatePath("/dashboard");

  // `redirect` throws, so it must be the last thing and outside any try. A response with no
  // conversation id should not strand the traveler on a screen whose message has already
  // been sent — the inbox is the honest fallback, and their message is in it.
  redirect(typeof conversationId === "string" ? `/messages/${conversationId}` : "/messages");
}

/**
 * Duplicated from `MESSAGES.newFailed` rather than imported.
 *
 * A "use server" module's imports all land in the server bundle, and this file is imported
 * by client components for its action references — pulling the content module in here to
 * reach one string would drag the section's whole copy table along with it. The same reason
 * `web/lib/trips/actions.ts` duplicates its reflection failure string.
 */
const MESSAGES_SEND_FAILED =
  "That didn't send — your words are still here. Try again in a moment.";
