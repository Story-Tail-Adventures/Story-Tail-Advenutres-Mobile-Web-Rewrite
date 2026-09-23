package com.storytail.adventures.ui.screens.agent

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.storytail.adventures.api.AgentRepository
import com.storytail.adventures.api.WorklistRead
import com.storytail.adventures.domain.agent.partOfDay
import com.storytail.adventures.domain.trip.Loadable
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
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
 * ONE SCREEN IN THIS SLICE. §6.6 keeps Pipeline and Calendar web-only at MVP, and Clients,
 * Messages and More are dimmed tabs rather than routes. When the second screen lands this
 * grows a `when (route)` like the others.
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
                // Only Worklist is built; the other three tabs are dimmed and unpressable,
                // so this can only ever be called with its own id. Kept rather than dropped
                // because the second §3.x screen needs it and a no-op today is clearer than
                // a signature that changes later.
                onSelectTab = { if (it != "worklist") nav.selectTab(AppRoute.Worklist) },
                onSignOut = onSignOut,
                modifier = modifier,
            )
        }

        else -> Unit
    }
}
