package com.storytail.adventures.ui.nav

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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
}
