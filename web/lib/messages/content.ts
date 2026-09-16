/**
 * Copy for Screen Inventory §2.6 Messaging.
 *
 * NOT YET PINNED. Its Kotlin twin `MessagesMessages` in
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/messages/MessagesCopy.kt`
 * lands with this section's mobile build, and the `MESSAGE_TABLES` row in
 * `.github/scripts/check_copy_parity.py` is added at the same time. Until that row exists
 * parity does not look at this module at all — the script's own header says it plainly: a
 * message added on one side and left out of the map is a SILENT gap, not a failure. So this
 * comment is the only thing holding the two sides together right now.
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

  /** 2.6.2. */
  backToMessages: "Messages",
  openTrip: "Open trip",

  /** 2.6.3. */
  newTitle: "New message",
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
