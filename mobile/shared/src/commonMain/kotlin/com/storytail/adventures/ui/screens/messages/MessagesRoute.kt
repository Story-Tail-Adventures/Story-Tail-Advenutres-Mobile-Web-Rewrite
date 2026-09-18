package com.storytail.adventures.ui.screens.messages

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.trip.localToday
import com.storytail.adventures.ui.components.client.ThreadScreen
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator

/**
 * The §2.6 section host.
 *
 * Same contract as `TripRoute` and the §2.5 host: App.kt hands over a route and gets a screen.
 *
 * 2.6.2 MOUNTS THE SHARED THREAD SCREEN — the one 2.2.7 mounts, not a copy of it. That is a
 * requirement from the artboard rather than a convenience: "both builds mount one component
 * instead of copying it. If the two drift visually, the extraction never happens."
 */
@Composable
fun MessagesRoute(
    route: AppRoute,
    nav: Navigator,
    trips: TripRepository,
) {
    val onSelectTab: (String) -> Unit = { id ->
        when (id) {
            "trips" -> nav.selectTab(AppRoute.Dashboard)
            "messages" -> nav.selectTab(AppRoute.Messages)
            "account" -> nav.selectTab(AppRoute.Account)
            // Discover is §2.3/P2 and renders dimmed and unpressable in the bar, so it cannot
            // arrive here. A no-op rather than a throw: a bar that crashes the app when a
            // future tab is half-wired is worse than one that does nothing.
            else -> Unit
        }
    }

    when (route) {
        is AppRoute.ConversationThread -> {
            // Keyed on the CONVERSATION, so opening a second thread builds a second view model
            // rather than showing the first one's messages under the new title — and so the
            // draft that comes back is the draft for this thread.
            val viewModel = viewModel(key = "conversation-${route.conversationId}") {
                ConversationThreadViewModel(trips, route.conversationId)
            }
            val state by viewModel.state.collectAsState()
            val tripId by viewModel.tripId.collectAsState()
            val draft by viewModel.draft.collectAsState()
            val sending by viewModel.sending.collectAsState()
            val sendError by viewModel.sendError.collectAsState()

            ThreadScreen(
                state = state,
                draft = draft,
                sending = sending,
                sendError = sendError,
                // `localToday()`, not App.kt's UTC-derived `today`: the separators are grouped
                // against timestamps rendered in the device zone, and mixing the two puts every
                // separator a day out after 8pm Eastern.
                today = localToday(),
                onDraftChange = viewModel::changeDraft,
                onSend = viewModel::send,
                onBack = { nav.pop() },
                // Null on the general thread, which hides the control. `replace` rather than
                // `push` for the same reason 2.2.7 does it: the trip should be where Back goes,
                // not a second thing on the stack behind a thread already read.
                onOpenTrip = tripId?.let { id -> { nav.replace(AppRoute.TripDetail(id)) } },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.NewConversation -> {
            val viewModel = viewModel { NewConversationViewModel(trips) }
            val draft by viewModel.draft.collectAsState()
            val sending by viewModel.sending.collectAsState()
            val sendError by viewModel.sendError.collectAsState()
            val started by viewModel.started.collectAsState()

            // Once the message is away this screen has nothing left to show, so it is REPLACED
            // by the thread the message landed in — Back then returns to the inbox rather than
            // to a compose form whose message has already been sent.
            //
            // An empty id means sent with no id in the response. The message is gone either
            // way, so the inbox is the honest destination and it is where the message is.
            LaunchedEffect(started) {
                val id = started ?: return@LaunchedEffect
                if (id.isEmpty()) {
                    nav.replace(AppRoute.Messages)
                } else {
                    nav.replace(AppRoute.ConversationThread(id))
                }
            }

            NewMessageScreen(
                draft = draft,
                sending = sending,
                sendError = sendError,
                onDraftChange = viewModel::changeDraft,
                onSend = viewModel::send,
                onBack = { nav.pop() },
            )
        }

        // 2.6.1, and the fallback. Every §2.6 route is listed above; anything else App.kt sends
        // here lands on the tab root rather than throwing.
        else -> {
            val viewModel = viewModel { InboxViewModel(trips) }
            val state by viewModel.state.collectAsState()
            val query by viewModel.query.collectAsState()

            // RE-READ ON ENTRY, because the view model outlives this screen and would
            // otherwise still be holding the list from the last time the tab was open. A send
            // from 2.6.3 creates a conversation and a send from 2.6.2 changes a preview; both
            // happen on a screen pushed on top of this one, and neither reaches it. The web
            // twin calls `revalidatePath("/messages")` for this; native has nothing like it.
            //
            // `Unit` rather than a key: the effect should run when the screen is entered,
            // which is every time this branch re-composes after the thread above it is popped
            // or the tab is re-selected. `refresh` keeps the current rows visible while it
            // re-reads, so this is not a spinner on every return.
            LaunchedEffect(Unit) { viewModel.refresh() }

            InboxScreen(
                state = state,
                query = query,
                onQueryChange = viewModel::changeQuery,
                onOpenThread = { id -> nav.push(AppRoute.ConversationThread(id)) },
                onNewMessage = { nav.push(AppRoute.NewConversation) },
                onSelectTab = onSelectTab,
                onRetry = viewModel::load,
            )
        }
    }
}
