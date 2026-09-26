package com.storytail.adventures.ui.nav

import com.storytail.adventures.domain.onboarding.WizardStep
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The rule that decides whether a session emission moves the back stack.
 *
 * Every case here is a SEQUENCE. None of them is visible in a single call, which is why
 * the first version of this gate shipped a lockout that compiled, passed every existing
 * test, and worked perfectly for anyone without a second factor.
 */
class SessionGateTest {

    @Test
    fun `a cold start goes where the gate says`() {
        assertEquals(
            AppRoute.Worklist,
            SessionGate.onAuthenticated(lastKey = null, destination = AppRoute.Worklist),
        )
        assertTrue(SessionGate.showsSplash(null), "a cold start should see the splash")
    }

    @Test
    fun `the same session arriving again leaves the stack alone`() {
        // A rotation, or dark mode from the system shade. The user's real stack has just
        // been restored underneath; resetting would throw it away, which is the bug the
        // whole change exists to fix.
        val last = SessionGate.key(AppRoute.Worklist)
        assertNull(SessionGate.onAuthenticated(last, AppRoute.Worklist))
        assertFalse(SessionGate.showsSplash(last), "no splash over a restored screen")
    }

    @Test
    fun `verifying MFA moves on, even though both emissions are Authenticated`() {
        // THE REGRESSION. MfaChallengeScreen navigates nowhere on success by design — the
        // gate is what moves the stack. A gate keyed on "am I authenticated" sees no change
        // between the challenge and the dashboard, skips the reset, and strands the user on
        // the code entry screen with no way forward. Every account with a second factor.
        val onTheChallenge = SessionGate.key(AppRoute.MfaChallenge)
        assertEquals(
            AppRoute.Dashboard,
            SessionGate.onAuthenticated(onTheChallenge, AppRoute.Dashboard),
        )
    }

    @Test
    fun `a token refresh does not yank the user to the dashboard`() {
        // The mirror image, and a bug that predated this gate: every `Authenticated`
        // emission used to reset, and a background refresh is one. Three screens deep, the
        // token rotates, and you are on the dashboard.
        val last = SessionGate.key(AppRoute.Dashboard)
        assertNull(SessionGate.onAuthenticated(last, AppRoute.Dashboard))
    }

    @Test
    fun `signing in after signing out still resets`() {
        assertEquals(
            AppRoute.Worklist,
            SessionGate.onAuthenticated(SessionGate.SIGNED_OUT, AppRoute.Worklist),
        )
    }

    @Test
    fun `being signed out does not put the splash back`() {
        // The sentinel exists for this: null would mean "cold start" and re-show the splash
        // if the flow ever re-emitted Initializing after a sign-out.
        assertFalse(SessionGate.showsSplash(SessionGate.SIGNED_OUT))
    }

    @Test
    fun `a wizard step advancing is a real move`() {
        // Arguments are part of the key, or the onboarding wizard would stop advancing the
        // moment it relied on the gate.
        val atWelcome = SessionGate.key(AppRoute.Onboarding(WizardStep.WELCOME))
        val next = AppRoute.Onboarding(WizardStep.entries[1])
        assertEquals(next, SessionGate.onAuthenticated(atWelcome, next))
        assertNull(SessionGate.onAuthenticated(atWelcome, AppRoute.Onboarding(WizardStep.WELCOME)))
    }

    @Test
    fun `keys tell routes apart, including ones differing only by argument`() {
        assertTrue(SessionGate.key(AppRoute.Worklist) != SessionGate.key(AppRoute.Dashboard))
        assertTrue(
            SessionGate.key(AppRoute.AgentClientDetail("a")) !=
                SessionGate.key(AppRoute.AgentClientDetail("b")),
        )
        // And no route may collide with the sentinel.
        assertTrue(SessionGate.key(AppRoute.Worklist) != SessionGate.SIGNED_OUT)
        assertTrue(SessionGate.key(AppRoute.PublicLanding) != SessionGate.SIGNED_OUT)
    }
}
