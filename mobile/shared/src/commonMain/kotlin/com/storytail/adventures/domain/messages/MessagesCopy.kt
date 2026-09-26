package com.storytail.adventures.domain.messages

/**
 * Copy for Screen Inventory §2.6 Messaging.
 *
 * The twin of `web/lib/messages/content.ts`'s `MESSAGES`, compared key by key by
 * `.github/scripts/check_copy_parity.py`. Change a string here and the same change is
 * required there, or CI fails.
 *
 * FLAT `const val` ONLY, and nothing else inside the object. The parity script's Kotlin
 * parser terminates at the first line-leading `}`, so a nested function or a list declared in
 * here would silently truncate the map and take every key after it out of the gate. Anything
 * that is not a constant lives below the object.
 *
 * TWO STRINGS ARE LOAD-BEARING BEYOND THEIR SCREEN:
 *
 *  · [REPLY_WINDOW] is the settled authenticated-surface promise. The desktop artboards carry
 *    THREE different ones ("I usually reply in under 2h", "Online · reply in < 2h", "Typically
 *    replies within 2 hours during 9–6 ET"); §2.1 and §2.2 settled on this wording, and the
 *    competing "< 2h" lives in `web/content/public/proof.ts` as `avgReplyTime` with
 *    `verified: false`, fenced behind PUBLIC_CLAIMS_MODE=strict so it cannot ship unexamined.
 *    One string, the settled one, everywhere.
 *
 *  · [NEW_SUBTITLE] must NOT promise a quote. BRD §6.5 (decided 2026-09-09) routes structured
 *    intake through `quote-request`, which creates a Trip in `inquiry`. 2.6.3 is prose that
 *    lands in the inbox. Wording it as "get a quote" would make it a second intake queue
 *    bypassing the pipeline that decision consolidated onto — departure 8 in the mobile
 *    artboard.
 *
 * "Open trip" is deliberately absent: it is `ThreadMessages.OPEN_TRIP`, already pinned for
 * 2.2.7, and both screens render the identical string.
 */
object MessagesMessages {
    const val TITLE = "Messages"
    const val SUBTITLE = "You and Gyasi, in one place."

    /** The advisor, everywhere in this section. Initials, never a photograph. */
    const val ADVISOR_NAME = "Gyasi Story"
    const val ADVISOR_INITIALS = "GS"
    const val REPLY_WINDOW = "Usually replies the same day"

    const val SEARCH_PLACEHOLDER = "Search your messages"
    const val SEARCH_EMPTY = "Nothing matched that."

    /**
     * A thread with no trip and no subject — what 2.6.3 creates.
     *
     * Named for the person rather than described as "General", because that is what it is: the
     * one thread you have with your advisor that is not about a particular trip.
     */
    const val GENERAL_THREAD_TITLE = "Gyasi Story"

    const val EMPTY_TITLE = "No messages yet"
    const val EMPTY_BODY =
        "When you or Gyasi start a conversation — about a trip or about anything else — it shows up here."
    const val EMPTY_CTA = "Send Gyasi a message"

    const val NEW_CTA = "New message"

    /** 2.6.2. */
    const val BACK_TO_MESSAGES = "Messages"

    /**
     * The empty thread, on a conversation with no trip.
     *
     * `ThreadMessages.EMPTY_BODY` says "you and Gyasi talk about THIS TRIP", which is right on
     * 2.2.7 and wrong on the one thread that has no trip at all. It is reachable: `trip-message`
     * creates the conversation and inserts the message in two statements and is explicitly NOT
     * atomic, so a failure between them leaves a conversation with no messages in it.
     */
    const val THREAD_EMPTY_BODY =
        "This is where you and Gyasi talk. Ask anything — the small questions are the ones worth asking."

    /** 2.6.3. */
    const val NEW_TITLE = "New message"

    /**
     * The field's own label, which must NOT be [NEW_TITLE] — that is the heading directly above
     * it, and a form whose only field is labelled the same as its screen reads like a rendering
     * bug. The artboard labels it "Message".
     */
    const val NEW_BODY_LABEL = "Message"
    const val NEW_SUBTITLE =
        "Anything at all — an idea you can't shake, a date that might work, a question about somewhere you've been reading about. There is never a fee for asking."
    const val NEW_PLACEHOLDER = "What's on your mind?"
    const val NEW_SEND = "Send to Gyasi"
    const val NEW_SENDING = "Sending…"
    const val NEW_FAILED = "That didn't send — your words are still here. Try again in a moment."

    /** See the artboard's departure 10: a trip-less thread has nothing it could attach. */
    const val ATTACH_DEFERRED = "Attaching files arrives with the document upload screen"
}

/**
 * What to call a thread.
 *
 * `subject` is set to the trip title when `trip-message` creates a trip thread, so it is almost
 * always there. A GENERAL THREAD HAS NEITHER: 2.6.3 deliberately does not ask for a subject
 * line, because a subject field is the first step towards a structured intake form, and BRD
 * §6.5 consolidated intake onto `quote-request` precisely so there would not be a second queue.
 * So the fallback is a name for the conversation rather than a description of it — the person
 * you are talking to.
 *
 * The trip title is preferred over a stale subject when both exist, because a trip can be
 * renamed after the thread was created and the header should follow the trip.
 *
 * OUTSIDE the object on purpose — see the file header.
 */
fun inboxTitle(subject: String?, tripTitle: String?): String =
    tripTitle ?: subject ?: MessagesMessages.GENERAL_THREAD_TITLE
