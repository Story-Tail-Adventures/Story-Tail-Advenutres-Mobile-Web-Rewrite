package com.storytail.adventures.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember

/**
 * The app's back stack.
 *
 * Small on purpose — see [AppRoute] for why this is not a navigation library. The whole
 * contract is: something is always on top, back pops unless there is nothing to pop to,
 * and a change of session resets rather than pushes.
 */
@Stable
class Navigator(initial: AppRoute) {

    private val stack = mutableStateListOf(initial)

    val current: AppRoute get() = stack.last()

    val canGoBack: Boolean get() = stack.size > 1

    /** Go somewhere new, keeping a way back. */
    fun push(route: AppRoute) {
        if (route != current) stack.add(route)
    }

    /**
     * Go somewhere new INSTEAD of here.
     *
     * For steps that should not be returnable — after verifying a password reset, going
     * back to the reset form would offer a form whose recovery session is spent.
     */
    fun replace(route: AppRoute) {
        // DEDUPE AGAINST THE ENTRY BENEATH. Without this, replacing with the route the user
        // came FROM leaves two identical adjacent entries and the first back gesture appears
        // to do nothing.
        //
        // It is the common case, not a corner: §2.2 reaches the thread from a trip detail
        // and then offers "Open trip", which replaces with that same TripDetail — chosen
        // over `push` precisely to avoid a duplicate, and creating a different one. Same for
        // 2.2.9's CTAs, which replace with a trip the notification may have been opened from.
        //
        // Dropping the top instead is what the caller means: going back to something already
        // on the stack is a return, not a new destination.
        if (stack.size >= 2 && stack[stack.lastIndex - 1] == route) {
            stack.removeAt(stack.lastIndex)
            return
        }
        stack[stack.lastIndex] = route
    }

    /**
     * Throw the stack away and start again.
     *
     * What a change of session does. Signing out must not leave the dashboard one back
     * gesture away, and signing in must not leave the sign-in form there either.
     */
    fun resetTo(route: AppRoute) {
        stack.clear()
        stack.add(route)
    }

    /** @return false when there was nothing to go back to, so the caller can exit the app. */
    fun pop(): Boolean {
        if (!canGoBack) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    /**
     * Called when the session goes away.
     *
     * Only resets if the screen on top actually needs a session. Somebody halfway through
     * the registration form has no session and never did; yanking them to Login because of
     * that would lose what they had typed.
     */
    fun onSignedOut(destination: AppRoute = AppRoute.Login) {
        if (current.requiresSession || current == AppRoute.Resolving) resetTo(destination)
    }

    /**
     * Select a bottom-bar tab.
     *
     * §2.2 added a four-tab bar and none of the verbs above meant "go to a tab". The two
     * rules this encodes are the platform conventions on both iOS and Android:
     *
     *  * Selecting a DIFFERENT tab resets the stack to that tab's root. A bottom bar is a
     *    set of roots, not a history — [push] would make Back walk backwards through tabs
     *    instead of leaving the app, and a user who tapped four tabs would need four Backs
     *    to get out.
     *  * Tapping the ALREADY-ACTIVE tab pops that tab back to its root. This is the "scroll
     *    to top / go home" gesture people expect, and it is why this cannot simply be
     *    [resetTo]: the no-op case has to do something useful.
     *
     * Not preserving a per-tab stack is a deliberate simplification. Only one of the four
     * tabs is built (§2.2), and a per-tab stack means four stacks to restore on process
     * death for a benefit nobody can currently reach. Revisit when the second tab ships.
     */
    fun selectTab(root: AppRoute) {
        resetTo(root)
    }

    /** For tests and for the back-handler's enabled flag. */
    fun snapshot(): List<AppRoute> = stack.toList()
}

@Composable
fun rememberNavigator(initial: AppRoute = AppRoute.Resolving): Navigator =
    remember { Navigator(initial) }
