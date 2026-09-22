package com.storytail.adventures

import com.storytail.adventures.api.OnboardingStatus
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.ui.nav.AppRoute
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Where an authenticated traveler belongs.
 *
 * The twin of web/lib/onboarding/status.test.ts, and it exists for the same reason: this is
 * the rule that decides whether somebody reaches their own dashboard, and it should be
 * assertable without a Supabase client.
 */
class OnboardingGateTest {

    private fun status(
        role: String? = "client",
        completed: Boolean = false,
        step: String? = null,
    ) = OnboardingStatus(role = role, completed = completed, step = step)

    @Test
    fun sends_a_client_who_has_never_started_to_the_cover_page() {
        assertEquals(AppRoute.Onboarding(WizardStep.WELCOME), destinationFor(status()))
    }

    @Test
    fun resumes_where_they_stopped() {
        for (step in WizardStep.entries.filter { it.slug != null }) {
            assertEquals(
                AppRoute.Onboarding(step),
                destinationFor(status(step = step.slug)),
                step.name,
            )
        }
    }

    @Test
    fun lets_a_finished_wizard_through() {
        assertEquals(AppRoute.Dashboard, destinationFor(status(completed = true)))
    }

    @Test
    fun lets_a_finished_wizard_through_even_if_a_step_slug_survived() {
        // The database forbids the combination, but the gate must not depend on that: being
        // held in a wizard you already finished is the worst failure this function has.
        assertEquals(
            AppRoute.Dashboard,
            destinationFor(status(completed = true, step = "profile")),
        )
    }

    @Test
    fun sends_an_agent_to_the_worklist() {
        // This assertion used to read `Dashboard`, and changing it is the single line in the
        // §3.2 diff that proves launch behaviour moved. Before it, an agent landed on the
        // client dashboard, every §2.2 read returned zero rows because their
        // platform_user.client_id is NULL, and the screen rendered a friendly "no trips
        // yet" — which reads as data loss rather than a wrong turn.
        assertEquals(AppRoute.Worklist, destinationFor(status(role = "agent")))
    }

    @Test
    fun never_routes_an_agent_into_the_client_wizard() {
        // Even carrying a stray step slug. An agent has no wizard at all.
        assertEquals(AppRoute.Worklist, destinationFor(status(role = "agent", step = "profile")))
    }

    @Test
    fun falls_open_TO_THE_CLIENT_SHELL_when_the_status_could_not_be_read() {
        // The direction is the security property, not the falling open. A bookkeeping read
        // going wrong must not lock somebody out of their own dashboard — but with two
        // shells, rendering the WORKLIST on a failed read would put an unknown visitor in
        // front of somebody else's book.
        assertEquals(AppRoute.Dashboard, destinationFor(null))
    }

    @Test
    fun an_admin_does_not_reach_the_worklist() {
        // platform_user's CHECK permits an admin with neither a client_id nor an agent_id,
        // so current_agent_id() refuses them and every §3.x read returns nothing. The client
        // dashboard is the same dead end, but it is the one with an unauthorized state.
        assertEquals(AppRoute.Dashboard, destinationFor(status(role = "admin")))
    }

    @Test
    fun an_unrecognised_role_does_not_reach_the_worklist() {
        // A fourth `user_role` value added to the database ahead of the app must fall to the
        // least privileged shell, not the most.
        assertEquals(AppRoute.Dashboard, destinationFor(status(role = "auditor")))
        assertEquals(AppRoute.Dashboard, destinationFor(status(role = null)))
    }

    @Test
    fun falls_back_to_the_cover_page_for_a_slug_it_does_not_recognise() {
        // A slug added to the database ahead of the app would otherwise have nowhere to go.
        assertEquals(
            AppRoute.Onboarding(WizardStep.WELCOME),
            destinationFor(status(step = "some-future-step")),
        )
    }
}
