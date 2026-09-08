package com.storytail.adventures.domain.trip

/**
 * The authenticated client destinations, mirroring `web/lib/client/nav.ts`.
 *
 * WHY THIS IS A UNION AND NOT ONE LIST WITH A PROJECTION.
 *
 * Four different sets are mandated by four different sources, and none is a subset of
 * another:
 *
 *   prototype ScreenNavRail   Trips · Discover · Messages · Wallet · Documents · Account
 *   prototype StaMobileTabs   Trips · Discover · Messages · Account
 *   Screen-Inventory §6.1     Trips · Search · Messages · Profile        (a TOP nav)
 *   Screen-Inventory §6.3     Home · Trips · Search · Messages · Profile (+ a Help FAB)
 *
 * The rail has no "Home"; §6.3's bar has one and treats it as distinct from Trips. The rail
 * has Wallet and Documents; the bar has neither. So "one list plus a filter" cannot express
 * it — there are several concepts, each appearing on some surfaces.
 *
 * Gyasi settled this on 2026-09-06: the PROTOTYPE wins. Four tabs on mobile, no Help FAB.
 * Screen-Inventory §6.3 and Design-System §9.3 are being amended to match.
 *
 * WHY [built] IS SEPARATE FROM [phase]. Filtering on phase removes exactly one destination
 * (Discover, §2.3, Phase 2). Messages, Wallet, Documents and Account are all Phase ONE and
 * still have no screen, so a phase filter would leave dead tabs. [built] is what the bar
 * renders against; [phase] only says why something is not built yet.
 */
data class ClientDestination(
    val id: String,
    val label: String,
    /** False while the destination has no screen. Rendered dimmed and unpressable. */
    val built: Boolean,
    /** Null once built. */
    val phase: String?,
    /** The Screen Inventory section that will build it, for the disabled state and for grep. */
    val section: String,
)

/**
 * The mobile bar's four, in order. The web rail's six live in the TypeScript twin; the two
 * files agree on the four they share, and the extra two are rail-only by decision, not by
 * omission.
 */
val CLIENT_BAR_DESTINATIONS: List<ClientDestination> = listOf(
    ClientDestination("trips", "Trips", built = true, phase = null, section = "§2.2"),
    ClientDestination("discover", "Discover", built = false, phase = "P2", section = "§2.3"),
    ClientDestination("messages", "Messages", built = false, phase = "P1", section = "§2.6"),
    ClientDestination("account", "Account", built = false, phase = "P1", section = "§2.5.1"),
)

object ClientNavMessages {
    const val NOT_YET_LABEL = "Coming with the next release"
    const val NOT_YET_ARIA = "not available yet"
}
