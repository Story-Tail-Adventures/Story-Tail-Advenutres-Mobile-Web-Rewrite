package com.storytail.adventures.ui.screens.agent

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.storytail.adventures.api.AgentRepository
import com.storytail.adventures.api.ClientDetailRead
import com.storytail.adventures.api.ClientRosterRead
import com.storytail.adventures.api.ClientRosterSnapshot
import com.storytail.adventures.api.WorklistRead
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.agent.partOfDay
import com.storytail.adventures.domain.trip.Loadable
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator

/**
 * §3.2's section host.
 *
 * A SIBLING of TripRoute, AccountRoute and MessagesRoute, not a wrapper around them — which
 * is what keeps the two shells apart. `App.kt` hands over a route and gets a screen back,
 * and nothing in this package imports `ClientScaffold`. A client route reaching here is
 * unrepresentable: App.kt's `when` is exhaustive and never routes one this way.
 *
 * TWO SCREENS NOW. §6.6 keeps Pipeline and Calendar web-only at MVP; Messages (§3.10) and
 * More (§3.12) are still dimmed tabs rather than routes. Clients joined on 2026-09-26, which
 * is what turned [tabRoute] from a no-op guard into a real mapping.
 */
@Composable
fun AgentRoute(
    route: AppRoute,
    nav: Navigator,
    agent: AgentRepository,
    displayName: String,
    /** `platform_user.time_zone`. The greeting is derived from it, never from the handset. */
    timeZone: String,
    /**
     * Ends the session. Handed down from `App.kt` the same way the client shell's is, rather
     * than reached for here — this package holds no repository but [AgentRepository].
     *
     * Worklist is the whole agent shell in this slice, so this is the ONLY way out of it:
     * `nav.resetTo` cleared the stack, the other three tabs are unbuilt, and iOS has no
     * system back at all. See `AgentTopBar`.
     */
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (route) {
        AppRoute.Worklist -> {
            var state by remember { mutableStateOf<Loadable<WorklistUiState>>(Loadable.Loading) }

            LaunchedEffect(agent, timeZone) {
                state = when (val read = agent.worklist()) {
                    // Three answers preserved all the way to the screen. `Unauthorized` is
                    // consumed by thirteen §2.2 screens and produced by none of them,
                    // because TripRepository collapses "threw" and "decoded nothing" into
                    // one null. New code should not inherit that.
                    is WorklistRead.Ok -> Loadable.Ready(
                        worklistUiState(
                            snapshot = read.snapshot,
                            displayName = displayName,
                            // The hour in the AGENT's zone. `Intl`'s equivalent on the web
                            // side; an unrecognised IANA name falls back to UTC rather than
                            // throwing inside a composition.
                            partOfDay = partOfDay(
                                Clock.System.now()
                                    .toLocalDateTime(
                                        runCatching { TimeZone.of(timeZone) }
                                            .getOrDefault(TimeZone.UTC),
                                    )
                                    .hour,
                            ),
                            // The agent's own date, off the accessor — never the handset's.
                            today = read.snapshot.asOfDate,
                        ),
                    )
                    WorklistRead.Forbidden -> Loadable.Unauthorized
                    WorklistRead.Failed -> Loadable.Failed()
                }
            }

            WorklistScreen(
                state = state,
                onSelectTab = { tabRoute(it)?.let(nav::selectTab) },
                onSignOut = onSignOut,
                modifier = modifier,
            )
        }

        AppRoute.AgentClients -> {
            var status by remember { mutableStateOf("active") }
            var search by remember { mutableStateOf("") }
            // The window, not a page number: §6.6 makes this screen APPEND rather than
            // paginate, so "load more" widens the same read instead of moving it.
            var limit by remember { mutableStateOf(PAGE) }
            var state by remember { mutableStateOf<Loadable<ClientRosterUiState>>(Loadable.Loading) }

            // Re-reads on every keystroke's settled value, on a status change, and on a
            // widened window. `search` is a key rather than a debounce because the accessor
            // is one indexed round trip and a debounce here would need a scope of its own.
            LaunchedEffect(agent, status, search, limit) {
                state = when (val read = agent.clientRoster(status, search, limit, 0)) {
                    is ClientRosterRead.Ok -> Loadable.Ready(
                        clientRosterUiState(read.snapshot) { cents, currency ->
                            formatMoney(cents, currency)
                        },
                    )
                    ClientRosterRead.Forbidden -> Loadable.Unauthorized
                    ClientRosterRead.Failed -> Loadable.Failed()
                }
            }

            ClientRosterScreen(
                state = state,
                onOpenClient = { nav.push(AppRoute.AgentClientDetail(it)) },
                search = search,
                onSearchChange = {
                    search = it
                    // A new search is a new result set; keeping a widened window would ask
                    // for rows 1..75 of a list with four in it and read as a stuck spinner
                    // on the slowest connection this screen is designed for.
                    limit = PAGE
                },
                status = status,
                onStatusChange = {
                    status = it
                    limit = PAGE
                },
                onLoadMore = { limit += PAGE },
                onSelectTab = { tabRoute(it)?.let(nav::selectTab) },
                onSignOut = onSignOut,
                modifier = modifier,
            )
        }

        is AppRoute.AgentClientDetail -> {
            var tab by remember(route.clientId) { mutableStateOf("overview") }
            var state by remember(route.clientId) {
                mutableStateOf<Loadable<ClientDetailUiState>>(Loadable.Loading)
            }

            // Keyed on the client id alone — NOT on `tab`. All seven reads land in one pass
            // and the strip switches over what is already held, so re-running this on a tab
            // change would re-fetch the whole detail to show data the screen already has.
            LaunchedEffect(agent, route.clientId) {
                state = when (val read = agent.clientDetail(route.clientId)) {
                    is ClientDetailRead.Ok -> Loadable.Ready(
                        clientDetailUiState(read.snapshot) { cents, currency ->
                            formatMoney(cents, currency)
                        },
                    )
                    ClientDetailRead.NotFound -> Loadable.Empty(
                        title = ClientCopy.NOT_FOUND_TITLE,
                        body = ClientCopy.NOT_FOUND_BODY,
                    )
                    ClientDetailRead.Forbidden -> Loadable.Unauthorized
                    ClientDetailRead.Failed -> Loadable.Failed()
                }
            }

            ClientDetailScreen(
                state = state,
                activeTab = tab,
                onSelectTab = { tab = it },
                onBack = { if (!nav.pop()) nav.selectTab(AppRoute.AgentClients) },
                onSelectBarTab = { tabRoute(it)?.let(nav::selectTab) },
                onSignOut = onSignOut,
                modifier = modifier,
            )
        }

        else -> Unit
    }
}

/** Matches `agent_client_roster`'s own default, so the two windows cannot drift. */
private const val PAGE = 25

/**
 * A tab id to its route, or null for one that is not built.
 *
 * Null rather than a fallback to Worklist: [AgentTab] already draws an unbuilt tab dimmed
 * and unpressable, so this is only ever reached for a built one — and a silent redirect
 * would turn a future wiring mistake into a tab that mysteriously goes home.
 */
private fun tabRoute(id: String): AppRoute? = when (id) {
    "worklist" -> AppRoute.Worklist
    "clients" -> AppRoute.AgentClients
    else -> null
}
