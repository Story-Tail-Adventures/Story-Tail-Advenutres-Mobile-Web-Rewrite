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

    /** For tests and for the back-handler's enabled flag. */
    fun snapshot(): List<AppRoute> = stack.toList()
}

@Composable
fun rememberNavigator(initial: AppRoute = AppRoute.Resolving): Navigator =
    remember { Navigator(initial) }
