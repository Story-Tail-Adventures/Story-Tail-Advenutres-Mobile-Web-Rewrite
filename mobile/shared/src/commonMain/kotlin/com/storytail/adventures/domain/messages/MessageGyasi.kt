package com.storytail.adventures.domain.messages

import com.storytail.adventures.api.LeadAbout
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.content.public.Topic

/**
 * Screen 2.0.12 "Message Gyasi" on the phone (BRD §6.5, 2026-10-21): the copy, word for word
 * the web's `MESSAGE_TEXT` (`web/app/(public)/(plain)/message/state.ts`), held there by
 * `.github/scripts/check_copy_parity.py`. Strings only in this object: the parity reader stops
 * at the first line-leading `}`, so the functions live below it.
 */
object MessageGyasiCopy {
    const val OVERLINE = "NO ACCOUNT NEEDED"
    const val TITLE = "Send Gyasi a note"
    const val BODY = "Tell him a little about the trip you're dreaming of. He reads every message himself and usually replies the same day."
    const val ABOUT_PREFIX = "About: "
    const val FIRST_NAME = "First name"
    const val LAST_NAME = "Last name (optional)"
    const val EMAIL = "Email"
    const val PHONE = "Phone (optional)"
    const val MESSAGE = "Your note"
    const val MESSAGE_HINT = "Where you'd love to go, roughly when, who's coming, and what kind of rest you're after."
    const val PRIVACY_BEFORE = "Gyasi will only use this to get back to you and see where people find us. "
    const val PRIVACY_LINK = "Privacy policy"
    const val SUBMIT = "Send to Gyasi"
    const val PENDING = "Sending…"
    const val SENT_TITLE = "Thank you. Your note is on its way."
    const val SENT_BODY = "Gyasi usually replies the same day, to the email you gave. Until then, rest easy."
    const val KEEP_EXPLORING = "Keep exploring"
    const val THROTTLED = "A few notes have come from this connection in the last hour. Please try again a little later."
    const val UNAVAILABLE = "Your note didn't send just now. What you wrote is still here, so please try again in a moment."
}

/** Topic names as the form shows them, the web's `TOPIC_LABEL` (`web/lib/public/inquiry.ts`). */
fun topicLabel(topic: Topic): String = when (topic) {
    Topic.CARIBBEAN -> "a Caribbean week"
    Topic.CRUISES -> "a cruise"
    Topic.HONEYMOONS -> "a honeymoon"
}

/**
 * What the visitor was viewing, rebuilt from the catalog: a trip slug that is not in it is
 * dropped, so nothing a route carried reaches Gyasi unchecked. A trip wins over a topic.
 */
fun leadAbout(tripSlug: String?, topic: Topic?): LeadAbout? {
    val trip = tripSlug?.let { PublicContent.tripBySlug(it) }
    if (trip != null) return LeadAbout(kind = "trip", slug = trip.slug, label = trip.name)
    if (topic != null) return LeadAbout(kind = "topic", slug = topic.name.lowercase(), label = topicLabel(topic))
    return null
}

/** The form's own first check, before a round trip: the three required fields. */
fun messageFormReady(firstName: String, email: String, message: String): Boolean =
    firstName.isNotBlank() && email.contains('@') && message.isNotBlank() && message.length <= 2000
