package com.storytail.adventures.domain.agent

/**
 * Screen 3.3.1's strings on the phone, paired with `web/lib/agent/content.ts`'s `CLIENT_COPY`.
 *
 * ONLY WHAT BOTH SURFACES RENDER LIVES HERE. `.github/scripts/check_copy_parity.py` compares
 * this object against the web const key by key, and the script only compares what its map
 * tells it about — a string added on one side and left out of the map is a SILENT gap, not a
 * failure. So the web const is the larger of the two: it also carries the data table's column
 * headers and the paginator's labels, and the phone has neither. Those have no twin here on
 * purpose, and the parity table's `keys` map names exactly the set that does.
 *
 * SAME REGISTER AS [AgentCopy]: terse, numerate, Gyasi's own shorthand. Design-System §2.4
 * lists nine places the rest-and-creation worldview shows up and every one is client-facing;
 * §2.5 says outright it is "not displayed on every screen". This is the transactional side.
 */
object ClientCopy {
    const val TITLE = "Clients"

    /**
     * The header's three counts, assembled rather than stored whole — all three are live.
     * "Leads" survives in COPY while the field stays `inquiryCount`: Gyasi says lead out
     * loud, the schema must not (BRD §6.5, Data-Model §11).
     */
    const val SUBTITLE_ACTIVE = "active"
    const val SUBTITLE_IN_MOTION = "in motion"
    const val SUBTITLE_TO_QUALIFY = "leads to qualify"

    const val SEARCH_LABEL = "Search clients"
    const val SEARCH_PLACEHOLDER = "Search by name, email, trip…"

    const val FILTER_ACTIVE = "Active"
    const val FILTER_ARCHIVED = "Archived"

    const val NO_EMAIL = "No email on file"
    const val NO_TRIP = "—"
    const val NO_LIFETIME = "—"
    const val TRAVELLING_NOW = "Now"

    const val CURRENCY_NOTE_ONE =
        "One client banks in more than one currency. Their lifetime figure covers their most-used one."

    const val EMPTY_TITLE = "No clients yet"
    const val EMPTY_BODY = "The first one arrives when you add them, or when a quote request comes in."
    const val EMPTY_FILTERED_TITLE = "Nothing matches"
    const val EMPTY_FILTERED_BODY = "Try a different search, or clear the filters."
    const val EMPTY_ARCHIVED_TITLE = "Nothing archived"
    const val EMPTY_ARCHIVED_BODY =
        "Archived clients keep their trips and their history. None are here yet."

    /**
     * Phone-only, and deliberately not a paginator.
     *
     * §6.6 keeps the agent's phone "designed for on-the-go tasks rather than deep work": the
     * job here is to find ONE client and reach them, which is what search is for. Paging
     * through a book of business with Previous/Next is the desk half of §4.4 Pattern B, and
     * the web build has it. This has no twin in CLIENT_COPY and is not in the parity map.
     */
    const val LOAD_MORE = "Load more"
}

/** "27 active · 5 in motion · 1 lead to qualify." Assembled, because all three are live. */
fun rosterSubtitle(active: Int, inMotion: Int, toQualify: Int): String {
    val parts = mutableListOf(
        "$active ${ClientCopy.SUBTITLE_ACTIVE}",
        "$inMotion ${ClientCopy.SUBTITLE_IN_MOTION}",
    )
    if (toQualify > 0) {
        parts += if (toQualify == 1) "1 lead to qualify" else "$toQualify ${ClientCopy.SUBTITLE_TO_QUALIFY}"
    }
    return parts.joinToString(" · ") + "."
}

/**
 * The note §3.2's currency rule requires wherever one figure stands for several currencies.
 * Null when no row left one out — a note that fires on nothing trains the eye to skip it.
 */
fun rosterCurrencyNote(rowsExcludingACurrency: Int): String? = when {
    rowsExcludingACurrency <= 0 -> null
    rowsExcludingACurrency == 1 -> ClientCopy.CURRENCY_NOTE_ONE
    else ->
        "$rowsExcludingACurrency clients bank in more than one currency. " +
            "Each lifetime figure covers that client's most-used one."
}
