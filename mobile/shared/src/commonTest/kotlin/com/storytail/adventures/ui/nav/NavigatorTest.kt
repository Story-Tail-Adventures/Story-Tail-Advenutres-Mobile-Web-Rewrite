package com.storytail.adventures.ui.nav

import androidx.compose.runtime.saveable.SaverScope
import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.content.public.Topic
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The back stack.
 *
 * Small enough that most of it is obvious, except the two rules that are not: a change of
 * session RESETS rather than pushes, and a signed-out state only resets when the screen on
 * top actually needed a session.
 */
class NavigatorTest {

    @Test
    fun `starts on the route it was given, with nowhere to go back to`() {
        val nav = Navigator(AppRoute.Login)
        assertEquals(AppRoute.Login, nav.current)
        assertFalse(nav.canGoBack)
        assertFalse(nav.pop(), "popping the root should report that there is nowhere to go")
    }

    @Test
    fun `push and pop`() {
        val nav = Navigator(AppRoute.Login)
        nav.push(AppRoute.Register)

        assertEquals(AppRoute.Register, nav.current)
        assertTrue(nav.canGoBack)
        assertTrue(nav.pop())
        assertEquals(AppRoute.Login, nav.current)
    }

    @Test
    fun `pushing where we already are does nothing`() {
        // Otherwise a double tap leaves two identical entries and back appears to hang.
        val nav = Navigator(AppRoute.Login)
        nav.push(AppRoute.Login)
        assertEquals(listOf(AppRoute.Login), nav.snapshot())
    }

    @Test
    fun `replace leaves nothing behind`() {
        // 2.1.5 replaces rather than pushes: going back to a reset form whose recovery
        // session is spent offers a form that cannot work.
        val nav = Navigator(AppRoute.Login)
        nav.push(AppRoute.ResetPassword)
        nav.replace(AppRoute.Dashboard)

        assertEquals(AppRoute.Dashboard, nav.current)
        assertEquals(listOf(AppRoute.Login, AppRoute.Dashboard), nav.snapshot())
    }

    @Test
    fun `signing in must not leave the sign-in form one gesture away`() {
        val nav = Navigator(AppRoute.Login)
        nav.push(AppRoute.Register)
        nav.resetTo(AppRoute.Dashboard)

        assertEquals(listOf(AppRoute.Dashboard), nav.snapshot())
        assertFalse(nav.canGoBack)
    }

    @Test
    fun `signing out drops a screen that needed the session`() {
        val nav = Navigator(AppRoute.Dashboard)
        nav.onSignedOut()
        assertEquals(listOf(AppRoute.Login), nav.snapshot())
    }

    @Test
    fun `signing out leaves a screen that never needed one alone`() {
        // Somebody halfway through the registration form has no session and never did.
        // Yanking them to Login because of that loses what they typed.
        val nav = Navigator(AppRoute.Login)
        nav.push(AppRoute.Register)
        nav.onSignedOut()

        assertEquals(AppRoute.Register, nav.current)
        assertEquals(listOf(AppRoute.Login, AppRoute.Register), nav.snapshot())
    }

    @Test
    fun `the splash resolves to sign-in rather than sitting there`() {
        val nav = Navigator(AppRoute.Resolving)
        nav.onSignedOut()
        assertEquals(listOf(AppRoute.Login), nav.snapshot())
    }

    @Test
    fun `routes agree about which of them need a session`() {
        val needs = listOf(AppRoute.Dashboard, AppRoute.MfaSetup, AppRoute.MfaChallenge)
        val doesNot = listOf(
            AppRoute.Resolving,
            AppRoute.Login,
            AppRoute.Register,
            AppRoute.VerifyEmail(),
            AppRoute.ForgotPassword,
            AppRoute.ResetPassword,
        )

        for (route in needs) assertTrue(route.requiresSession, "$route should require a session")
        for (route in doesNot) assertFalse(route.requiresSession, "$route should not")
    }

    @Test
    fun `the verify-email route carries the address sign-up knew`() {
        // Straight after registering there is no session to read it from — GoTrue withholds
        // one until the address is confirmed.
        assertEquals("jordan@example.com", AppRoute.VerifyEmail("jordan@example.com").email)
        assertEquals(null, AppRoute.VerifyEmail().email)
    }

    // ── §2.2 bottom-bar tabs ────────────────────────────────────────────────────
    //
    // Navigator had push/replace/resetTo/pop and nothing that meant "go to a tab", so
    // these pin the two conventions selectTab encodes. Both are things a user notices
    // immediately when they are wrong.

    @Test
    fun `selecting a tab resets the stack rather than pushing onto it`() {
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.TripDetail("t1"))
        nav.push(AppRoute.Itinerary("t1"))
        assertTrue(nav.canGoBack)

        nav.selectTab(AppRoute.Dashboard)

        // A bottom bar is a set of roots, not a history. Pushing would mean Back walks
        // backwards through tabs, so somebody who tapped four tabs needs four Backs to
        // leave the app.
        assertEquals(AppRoute.Dashboard, nav.current)
        assertFalse(nav.canGoBack)
        assertEquals(listOf(AppRoute.Dashboard), nav.snapshot())
    }

    @Test
    fun `tapping the already-active tab pops back to its root`() {
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.TripDetail("t1"))
        nav.push(AppRoute.TripDocuments("t1"))

        nav.selectTab(AppRoute.Dashboard)

        // The "go home" gesture. This is why selectTab cannot be a no-op when the tab is
        // already current — the useful case IS the no-op case.
        assertEquals(AppRoute.Dashboard, nav.current)
        assertFalse(nav.canGoBack)
    }

    @Test
    fun `back from a tab root reports nothing to pop, so the caller can exit`() {
        val nav = Navigator(AppRoute.Dashboard)
        assertFalse(nav.pop())
    }

    @Test
    fun `back from a pushed trip screen returns to the tab root`() {
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.TripDetail("t1"))
        nav.push(AppRoute.ItineraryDay("t1", dayNumber = 3))

        assertTrue(nav.pop())
        assertEquals(AppRoute.TripDetail("t1"), nav.current)
        assertTrue(nav.pop())
        assertEquals(AppRoute.Dashboard, nav.current)
        assertFalse(nav.pop())
    }

    @Test
    fun `every §2_2 route requires a session`() {
        // Losing a session while reading an itinerary must land on the public front door,
        // not leave the trip on screen with no data behind it.
        val routes = listOf(
            AppRoute.Dashboard,
            AppRoute.AllTrips,
            AppRoute.TripDetail("t1"),
            AppRoute.Itinerary("t1"),
            AppRoute.ItineraryDay("t1", 1),
            AppRoute.TripDocuments("t1"),
            AppRoute.TripThread("t1"),
            AppRoute.PastTrip("t1"),
            AppRoute.TripUpdate("t1"),
        )
        for (route in routes) {
            assertTrue(route.requiresSession, "$route should require a session")
        }
    }

    @Test
    fun `replace does not leave two identical adjacent entries`() {
        // The §2.2 case: reach the thread from a trip detail, then use "Open trip", which
        // replaces with the TripDetail the user came from. Before the dedupe this left
        // [Dashboard, TripDetail, TripDetail] and the first back gesture appeared to do
        // nothing.
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.TripDetail("t1"))
        nav.push(AppRoute.TripThread("t1"))
        nav.replace(AppRoute.TripDetail("t1"))

        assertEquals(AppRoute.TripDetail("t1"), nav.current)
        nav.pop()
        assertEquals(
            AppRoute.Dashboard,
            nav.current,
            "one back gesture should leave the trip detail, not land on a duplicate of it",
        )
    }

    @Test
    fun `replace still substitutes when the entry beneath is different`() {
        // The dedupe must not turn every replace into a pop — that would break the
        // password-reset case replace exists for.
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.TripDetail("t1"))
        nav.replace(AppRoute.Itinerary("t1"))

        assertEquals(AppRoute.Itinerary("t1"), nav.current)
        nav.pop()
        assertEquals(AppRoute.Dashboard, nav.current)
    }

    @Test
    fun `losing the session on a trip screen resets to the public landing`() {
        val nav = Navigator(AppRoute.Dashboard)
        nav.push(AppRoute.Itinerary("t1"))

        nav.onSignedOut(AppRoute.PublicLanding)

        assertEquals(AppRoute.PublicLanding, nav.current)
        assertFalse(nav.canGoBack)
    }

    @Test
    fun `trip routes carry their id, and day detail carries the day number`() {
        assertEquals("t1", AppRoute.TripDetail("t1").tripId)
        assertEquals(3, AppRoute.ItineraryDay("t1", 3).dayNumber)
        // Data classes, so two routes to the same trip are the same destination — which is
        // what makes push()'s `route != current` guard work.
        assertEquals(AppRoute.TripDetail("t1"), AppRoute.TripDetail("t1"))
    }

    // ── Surviving an Activity recreation ──────────────────────────────────

    /**
     * Rotation, a dark-mode flip from the system shade, process death. Until 2026-09-26 the
     * navigator held its stack in a plain `remember`, so every one of those threw the whole
     * thing away and dropped the app on its default route — rotating anywhere sent you back
     * to the Worklist.
     *
     * These test the SAVER. The other half of the fix lives in App.kt's session gate, which
     * used to `resetTo` on every re-emission of the same status and so wiped a restored
     * stack on the way back up; that half has no unit-testable seam here.
     */
    private fun roundTrip(nav: Navigator): Navigator? {
        // `Saver.save` is a MEMBER-EXTENSION — `fun SaverScope.save(value: Original)` — so it
        // needs the saver as the dispatch receiver and a SaverScope as the extension one.
        // `NavigatorSaver.save(nav)` does not compile, and the error it gives
        // ("Unresolved reference 'save'") does not hint at why.
        val scope = SaverScope { true }
        val saved: String? = with(NavigatorSaver) { with(scope) { save(nav) } }
        return saved?.let { encoded -> NavigatorSaver.restore(encoded) }
    }

    @Test
    fun `a saved stack comes back whole, not just its top`() {
        val nav = Navigator(AppRoute.Worklist)
        nav.push(AppRoute.AgentClients)
        nav.push(AppRoute.AgentClientDetail("0195a2c0-1a00-7000-8000-000000000101"))

        val restored = roundTrip(nav)
        assertEquals(nav.snapshot(), restored?.snapshot())
        // Depth is the point: restoring only `current` would leave Back exiting the app
        // from a screen two levels down.
        assertTrue(restored!!.canGoBack)
        assertEquals(AppRoute.AgentClients, restored.snapshot()[1])
    }

    @Test
    fun `every shape of route survives, arguments and all`() {
        // One of each KIND the sealed interface has, because these are what break
        // separately: a bare object, a String argument, an Int, a nullable with a default,
        // a Boolean with a default, and two different enums. A route carrying a type
        // kotlinx cannot write would fail here rather than on somebody's phone.
        val every = listOf(
            AppRoute.Resolving,
            AppRoute.PublicResults(),                      // nullable arg left at its default
            AppRoute.PublicResults("Maldives"),            // ... and supplied
            AppRoute.PublicTripDetail("overwater-villas"),
            AppRoute.PublicJoin(intent = "quote", tripSlug = null),
            AppRoute.PublicTopic(Topic.HONEYMOONS),
            AppRoute.PublicLegal(LegalSlug.PRIVACY),
            AppRoute.VerifyEmail("someone@example.com"),
            AppRoute.Onboarding(WizardStep.WELCOME),
            AppRoute.ItineraryDay(tripId = "t-1", dayNumber = 3),
            AppRoute.WalletAuthorization(authorizationId = "a-1", justAuthorized = true),
            AppRoute.WalletActivity(cardId = null),
            AppRoute.AgentClientDetail("c-1"),
        )
        val nav = Navigator(every.first())
        every.drop(1).forEach(nav::push)

        assertEquals(every, roundTrip(nav)?.snapshot())
    }

    @Test
    fun `unreadable saved state restores as nothing rather than throwing`() {
        // The real case is process death across an app update, where the saved JSON names a
        // route the new binary no longer has. `null` is how a Saver says "nothing usable",
        // and rememberSaveable then falls back to the initial route. The alternative is
        // crashing on launch, permanently, until the user clears app data.
        assertNull(NavigatorSaver.restore("not json"))
        assertNull(NavigatorSaver.restore("[{\"type\":\"com.storytail.adventures.ui.nav.AppRoute.Deleted\"}]"))
        assertNull(NavigatorSaver.restore(""))
    }

    @Test
    fun `an empty saved stack is refused rather than restored broken`() {
        // `current` is `stack.last()`, so an empty Navigator is a crash waiting for its
        // first composition. The saver turns that into "nothing saved".
        assertNull(NavigatorSaver.restore("[]"))
    }

    @Test
    fun `a restored navigator is a working one, not a frozen snapshot`() {
        val nav = Navigator(AppRoute.Worklist)
        nav.push(AppRoute.AgentClients)
        val restored = roundTrip(nav)!!

        restored.push(AppRoute.AgentClientDetail("c-9"))
        assertEquals(AppRoute.AgentClientDetail("c-9"), restored.current)
        assertTrue(restored.pop())
        assertEquals(AppRoute.AgentClients, restored.current)
        assertTrue(restored.pop())
        assertEquals(AppRoute.Worklist, restored.current)
        assertFalse(restored.canGoBack)
    }
}
