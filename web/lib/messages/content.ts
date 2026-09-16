/**
 * Copy for Screen Inventory §2.6 Messaging.
 *
 * Pinned against its Kotlin twin `MessagesMessages` in
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/messages/MessagesCopy.kt`
 * by `.github/scripts/check_copy_parity.py`. Change a string here and the same change is
 * required there, or CI fails.
 *
 * EVERY plain-string key below is in that map. Adding one here without adding it there is not
 * a failure — it is invisible, which is the silent gap the script's own header warns about.
 *
 * TWO STRINGS IN HERE ARE LOAD-BEARING BEYOND THEIR SCREEN:
 *
 *  · `replyWindow` is the settled authenticated-surface promise. The desktop artboard
 *    carries THREE different ones ("I usually reply in under 2h", "Online · reply in < 2h",
 *    "Typically replies within 2 hours during 9–6 ET"); §2.1 and §2.2 settled on this
 *    wording, and the competing "< 2h" lives in `web/content/public/proof.ts` as
 *    `avgReplyTime` with `verified: false`, fenced behind PUBLIC_CLAIMS_MODE=strict so it
 *    cannot ship unexamined. One string, the settled one, everywhere.
 *
 *  · `newSubtitle` must NOT promise a quote. BRD §6.5 (decided 2026-09-09) routes structured
 *    intake through `quote-request`, which creates a Trip in `inquiry`. 2.6.3 is prose that
 *    lands in the inbox. Wording it as "get a quote" would make it a second intake queue
 *    bypassing the pipeline that decision consolidated onto — which is departure 8 in the
 *    mobile artboard.
 */
export const MESSAGES = {
  title: "Messages",
  subtitle: "You and Gyasi, in one place.",

  /** The advisor, everywhere in this section. Initials, never a photograph. */
  advisorName: "Gyasi Story",
  advisorInitials: "GS",
  replyWindow: "Usually replies the same day",

  searchPlaceholder: "Search your messages",
  searchEmpty: "Nothing matched that.",

  /**
   * A thread with no trip and no subject — what 2.6.3 creates.
   *
   * Named for the person rather than described as "General", because that is what it is: the
   * one thread you have with your advisor that is not about a particular trip.
   */
  generalThreadTitle: "Gyasi Story",

  emptyTitle: "No messages yet",
  emptyBody:
    "When you or Gyasi start a conversation — about a trip or about anything else — it shows up here.",
  emptyCta: "Send Gyasi a message",

  newCta: "New message",

  /**
   * 2.6.2.
   *
   * "Open trip" is NOT here. It is `THREAD_MESSAGES.openTrip`, already pinned for 2.2.7, and
   * both screens render the identical string — a second copy would double the parity surface
   * for one word and give the two screens somewhere to disagree.
   */
  backToMessages: "Messages",

  /**
   * The empty thread, on a conversation with no trip.
   *
   * `THREAD_MESSAGES.emptyBody` says "you and Gyasi talk about THIS TRIP", which is right on
   * 2.2.7 and wrong on the one thread that has no trip at all. Caught in a browser, on the
   * general thread, reading a sentence about a trip that does not exist.
   *
   * IT IS REACHABLE, which is the reason it is worth a string rather than a shrug.
   * `trip-message` creates the conversation and inserts the message in two statements and is
   * explicitly NOT atomic — a failure between them leaves a conversation with no messages in
   * it, and this is what that looks like.
   */
  threadEmptyBody:
    "This is where you and Gyasi talk. Ask anything — the small questions are the ones worth asking.",

  /** 2.6.3. */
  newTitle: "New message",
  /**
   * The field's own label, which must NOT be `newTitle` — that is the page heading directly
   * above it, and a form whose only field is labelled the same as its page reads like a
   * rendering bug. The artboard labels it "Message".
   */
  newBodyLabel: "Message",
  newSubtitle:
    "Anything at all — an idea you can't shake, a date that might work, a question about somewhere you've been reading about. There is never a fee for asking.",
  newPlaceholder: "What's on your mind?",
  newSend: "Send to Gyasi",
  newSending: "Sending…",
  newFailed:
    "That didn't send — your words are still here. Try again in a moment.",
  /** See the artboard's departure 10: a trip-less thread has nothing it could attach. */
  attachDeferred: "Attaching files arrives with the document upload screen",
} as const;
