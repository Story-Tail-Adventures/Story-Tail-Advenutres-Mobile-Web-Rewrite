package com.storytail.adventures.domain.wallet

import com.storytail.adventures.ui.components.client.formatMoney
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * §2.4's presentation helpers.
 *
 * `formatMoney` is REUSED from `ui/components/client/TripParts.kt` rather than reimplemented.
 * A second money formatter is exactly the shape of the loyalty-reader bug §2.5 shipped twice
 * — one copy per stack, then one per section, each subtly different. The web twin makes the
 * same call about `lib/public/money.ts`.
 */

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/**
 * "$1,155 of $9,000 left" — the line 2.4.1 and 2.4.7 both show under a live authorization.
 *
 * Takes the already-clamped remaining value rather than computing it, because the clamp
 * belongs to the model: `WalletAuthorizationView.remainingCents` coerces at zero so a
 * usage overrun never renders as a negative, which would read as though Story-Tail owed the
 * traveler money.
 */
fun remainingLabel(remainingCents: Long, limitCents: Long): String =
    "${formatMoney(remainingCents, "USD")} of ${formatMoney(limitCents, "USD")} left"

/**
 * The four spending-limit presets 2.4.3 offers.
 *
 * MULTIPLY BEFORE DIVIDING, and never by a decimal. The web twin shipped `exact * 1.1`, which
 * in IEEE 754 turns 784500 into 862950.0000000001 — so rounding up gave a cent MORE than ten
 * percent, on a number the traveler is agreeing to. Integer arithmetic has no such problem,
 * and Kotlin's Long division truncates, so the `+ 9` is what rounds up.
 *
 * UP rather than to nearest, for the same reason as the web side: a limit landing a cent
 * under the supplier's charge fails a real payment.
 */
fun limitPresets(balanceDueCents: Long): List<Pair<String, Long>> {
    val exact = balanceDueCents.coerceAtLeast(0)
    return listOf(
        "Exact" to exact,
        "+10%" to (exact * 11 + 9) / 10,
        "+20%" to (exact * 12 + 9) / 10,
    )
}

/**
 * Seven days after the trip ends, per Screen Inventory §2.4.3's stated default.
 *
 * Suppliers settle late: a resort charging the final balance on the checkout date would find
 * an authorization that ended with the trip already expired, and the traveler would get a
 * failed payment for a trip they had already taken.
 *
 * Falls back to 90 days out when the trip has no end date — an inquiry or a proposal can be
 * authorized before the dates are fixed, and refusing to compute a default would block the
 * screen rather than the write.
 */
fun defaultExpiryIso(tripEndDate: String?, today: LocalDate): String {
    val base = tripEndDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val day = if (base != null) base.plusDaysSafe(7) else today.plusDaysSafe(90)
    // Midday UTC rather than midnight: a midnight boundary in a western zone lands on the
    // previous day, and an expiry that reads a day early on the confirmation screen is the
    // kind of thing nobody notices until a payment fails.
    return "${day}T12:00:00Z"
}

private fun LocalDate.plusDaysSafe(days: Int): LocalDate =
    LocalDate.fromEpochDays(this.toEpochDays() + days)

/** "Nov 29, 2026", in the device's zone — a phone knows where it is. */
fun formatDay(iso: String): String {
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val date = instant.toLocalDateTime(TimeZone.currentSystemDefault()).date
    return "${MONTHS[date.monthNumber - 1]} ${date.dayOfMonth}, ${date.year}"
}

/**
 * A card-use amount, in whatever currency the supplier charged.
 *
 * `card_use_event.currency` is `char(3)` with a default, not a constrained enum, and a
 * supplier charging in another currency happens to travel bookings. `formatMoney` already
 * handles that — it prefixes the code rather than a dollar sign for anything but USD — so
 * this exists only to name the intent at the call sites.
 */
fun formatAmount(amountCents: Long, currency: String): String = formatMoney(amountCents, currency)
