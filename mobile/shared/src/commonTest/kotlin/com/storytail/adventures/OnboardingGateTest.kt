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
        isClient: Boolean = true,
        completed: Boolean = false,
        step: String? = null,
    ) = OnboardingStatus(isClient = isClient, completed = completed, step = step)

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
    fun never_routes_an_agent_into_the_client_wizard() {
        assertEquals(AppRoute.Dashboard, destinationFor(status(isClient = false)))
    }

    @Test
    fun falls_open_when_the_status_could_not_be_read() {
        // A bookkeeping read going wrong must not lock somebody out of their own dashboard.
        assertEquals(AppRoute.Dashboard, destinationFor(null))
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
