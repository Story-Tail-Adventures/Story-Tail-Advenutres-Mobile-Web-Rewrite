package com.storytail.adventures.domain.agent

/**
 * The agent's bottom bar, mirroring `web/lib/agent/nav.ts`.
 *
 * FOUR TABS, AND THREE OF THEM ARE DIMMED. Screen-Inventory §6.6: "The mobile experience for
 * agents at MVP is intentionally narrower than web — designed for on-the-go tasks rather
 * than deep work. Bottom tab bar: Worklist, Clients, Messages, More. The full pipeline,
 * reporting, and template management features remain web-only at MVP."
 *
 * So this is NOT the web rail minus items. The rail has seven and includes Trips, Leads,
 * Commission and Reports; the bar has four and includes More, which is a sheet rather than a
 * rail destination. Same shape as [com.storytail.adventures.domain.trip.ClientDestination]
 * for the same reason: one registry, so a destination cannot exist on one surface and be
 * forgotten on the other.
 *
 * WHY THIS KEEPS THE CLIENT REGISTRY'S TWO STATES RATHER THAN THE WEB'S THREE. The web
 * registry needs a `deferred` state for Leads, which is on its rail and will never be built
 * (BRD §6.5). Leads is not on this bar at all, so every unbuilt tab here is genuinely "not
 * yet" and [section] says which one builds it. If the bar ever grows a deferred-by-decision
 * destination, this gains the third state and [AgentNavMessages] gains its sentence.
 */
data class AgentDestination(
    val id: String,
    val label: String,
    /** False while the destination has no screen. Rendered dimmed and unpressable. */
    val built: Boolean,
    /** Null once built. */
    val phase: String?,
    /** The Screen Inventory section that will build it, for the disabled state and for grep. */
    val section: String,
)

/** §6.6's four, in order. */
val AGENT_BAR_DESTINATIONS: List<AgentDestination> = listOf(
    AgentDestination("worklist", "Worklist", built = true, phase = null, section = "§3.2"),
    AgentDestination("clients", "Clients", built = false, phase = "P1", section = "§3.3"),
    AgentDestination("messages", "Messages", built = false, phase = "P1", section = "§3.10"),
    // Not a rail destination on web. It is the eventual home of sign-out; until §3.12
    // builds it, sign-out rides the worklist's top bar (see `AgentTopBar`) rather than
    // waiting here, because Worklist is the whole agent shell and nothing else can reach it.
    AgentDestination("more", "More", built = false, phase = "P1", section = "§3.12"),
)

object AgentNavMessages {
    const val NOT_YET_LABEL = "Coming with the next release"
    const val NOT_YET_ARIA = "not available yet"
}
