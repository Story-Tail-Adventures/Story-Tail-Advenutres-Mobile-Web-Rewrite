package com.storytail.adventures.domain.trip

/**
 * §2.2.3's pay block (amended 2026-10-16): a milestone the advisor gave a pay link shows a
 * button that opens the SUPPLIER's own payment page in the browser, the site's name, one calm
 * line, and a quiet "I've paid" that only posts a note in the trip thread. Story-Tail never
 * takes a payment and never holds a card (BRD §10.5, Data-Model §9.5).
 *
 * KOTLIN TWIN of the web pay-block copy, compared by `.github/scripts/check_copy_parity.py`.
 * Its Kotlin reader stops at the first LINE-LEADING `}`, so this object holds only `const val`
 * strings; everything that builds a sentence lives below its closing brace.
 *
 * "the supplier", not a supplier's name: `payment_milestone` has no supplier column, so the
 * artboard's "Paid directly to Sandals" cannot be said truthfully. Flagged in the PR.
 */
object PayLinkMessages {
    const val PAY_DIRECT = "Paid directly to the supplier on their secure site."
    const val I_HAVE_PAID = "I've paid"
    const val I_HAVE_PAID_THANKS = "Thanks. Gyasi will check and mark it paid."
    const val I_HAVE_PAID_FAILED = "That didn't send. Try again in a moment, or message Gyasi."
    const val EMPTY_SCHEDULE =
        "No payments scheduled yet. Gyasi will add them here once your trip is booked."
}

/** Only an OPEN milestone with a link gets a button; paid and waived rows never do. */
fun isPayable(status: String, payUrl: String?): Boolean =
    payUrl != null && (status == "scheduled" || status == "overdue")

/** "Pay deposit", "Pay final balance": the label with its first letter lower-cased. */
fun payActionLabel(label: String): String = "Pay ${lowerFirst(label.trim())}"

/**
 * The figure "I've paid" names: what is still open on the milestone (amount less paid), or
 * the full amount when nothing is open by that sum. Matches the web action.
 */
fun openAmountCents(amountCents: Long, paidCents: Long): Long {
    val open = amountCents - paidCents
    return if (open > 0) open else amountCents
}

/** The note "I've paid" posts in the trip thread: "I've paid the final balance ($4,180)." */
fun ivePaidMessage(label: String, amount: String): String =
    "I've paid the ${label.trim().lowercase()} ($amount)."

private fun lowerFirst(s: String): String =
    if (s.isEmpty()) s else s.substring(0, 1).lowercase() + s.substring(1)

/**
 * The site line under the pay button: the link's host, lower-cased, with a leading `www.`
 * removed, in its PUNYCODE form. Null when [url] is not an https URL with a host, and the
 * caller then shows no button at all (the database already refuses anything but https, so
 * null here means a row this build does not understand, and a button to it would be a guess).
 *
 * WHY PUNYCODE. A look-alike domain such as `sаndals.com` with a Cyrillic "а" renders
 * identically to the real one in Unicode. Shown as `xn--sndals-3nf.com` it is plainly not
 * Sandals. The browser decides where the tap goes; this line is the client's one chance to
 * see where that is before they tap, so it must not be fooled by what the browser would be.
 *
 * WHAT IT IS AND IS NOT. A pure-Kotlin parse (commonMain has no java.net.URI and Ktor's Url
 * does not convert IDNs): the authority ends at the first `/`, `?`, `#` or `\` (browsers
 * read `\` as `/` in https URLs, so `https://evil.com\@sandals.com` goes to evil.com and
 * must say so); userinfo before the LAST `@` and any `:port` are dropped; each non-ASCII
 * label is lower-cased and encoded with RFC 3492 Punycode as `xn--…`. It does NOT apply
 * full UTS #46 mapping (width folding, ß, and so on). That only makes an odd host look
 * odder, which is the safe direction for this line.
 */
fun paySiteName(url: String): String? {
    val trimmed = url.trim()
    if (!trimmed.startsWith("https://", ignoreCase = true)) return null
    val rest = trimmed.substring("https://".length)
    val authorityEnd = rest.indexOfFirst { it == '/' || it == '?' || it == '#' || it == '\\' }
    val authority = if (authorityEnd == -1) rest else rest.substring(0, authorityEnd)
    var host = authority.substringAfterLast('@')
    host = if (host.startsWith("[")) {
        // An IPv6 literal keeps its brackets and loses only the port.
        host.substringBefore(']') + "]"
    } else {
        host.substringBefore(':')
    }
    host = host.trimEnd('.').lowercase()
    if (host.isEmpty() || host == "[]") return null
    val labels = host.split('.')
    if (labels.any { it.isEmpty() }) return null
    val ascii = labels.joinToString(".") { label ->
        if (label.all { it.code < 0x80 }) label else "xn--" + punycodeEncode(label)
    }
    return ascii.removePrefix("www.").ifEmpty { null }
}

/** RFC 3492 §6.3, for one label. Operates on code points, so astral characters work too. */
internal fun punycodeEncode(input: String): String {
    val base = 36
    val tMin = 1
    val tMax = 26
    val codePoints = codePointsOf(input)
    val out = StringBuilder()
    for (c in codePoints) if (c < 0x80) out.append(c.toChar())
    val basicCount = out.length
    var handled = basicCount
    if (basicCount > 0) out.append('-')

    var n = 0x80
    var delta = 0L
    var bias = 72
    while (handled < codePoints.size) {
        val m = codePoints.filter { it >= n }.min()
        delta += (m - n).toLong() * (handled + 1)
        n = m
        for (c in codePoints) {
            if (c < n) delta++
            if (c == n) {
                var q = delta
                var k = base
                while (true) {
                    val t = when {
                        k <= bias -> tMin
                        k >= bias + tMax -> tMax
                        else -> k - bias
                    }
                    if (q < t) break
                    out.append(punyDigit((t + (q - t) % (base - t)).toInt()))
                    q = (q - t) / (base - t)
                    k += base
                }
                out.append(punyDigit(q.toInt()))
                bias = punyAdapt(delta, handled + 1, handled == basicCount)
                delta = 0
                handled++
            }
        }
        delta++
        n++
    }
    return out.toString()
}

private fun punyDigit(d: Int): Char = if (d < 26) 'a' + d else '0' + (d - 26)

private fun punyAdapt(deltaIn: Long, numPoints: Int, first: Boolean): Int {
    var delta = if (first) deltaIn / 700 else deltaIn / 2
    delta += delta / numPoints
    var k = 0
    while (delta > ((36 - 1) * 26) / 2) {
        delta /= (36 - 1)
        k += 36
    }
    return (k + (36 - 1 + 1) * delta / (delta + 38)).toInt()
}

private fun codePointsOf(s: String): List<Int> {
    val out = ArrayList<Int>(s.length)
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c.isHighSurrogate() && i + 1 < s.length && s[i + 1].isLowSurrogate()) {
            out.add(((c.code - 0xD800) shl 10) + (s[i + 1].code - 0xDC00) + 0x10000)
            i += 2
        } else {
            out.add(c.code)
            i++
        }
    }
    return out
}
