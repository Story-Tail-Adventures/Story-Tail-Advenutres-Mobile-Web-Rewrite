package com.storytail.adventures.ui.nav

/**
 * Whether a session emission should move the back stack.
 *
 * Extracted from App.kt's `LaunchedEffect(sessionStatus)` so the decision has a seam a test
 * can reach. The effect itself has none — it needs a composition, a repository and a flow —
 * and the bug this exists to prevent is a SEQUENCE bug, invisible in any single call.
 *
 * ── WHY THIS IS NOT A BOOLEAN ──────────────────────────────────────────────────
 *
 * The gate's first version tracked which SIDE it was last on: authenticated or signed out.
 * That is enough to tell a genuine sign-in from the same session being re-delivered after
 * an Activity recreation, which is what the config-change fix needed.
 *
 * It is NOT enough, and the case it breaks is a lockout. `MfaChallengeScreen` navigates
 * nowhere on success — by design, documented at its call site — because verifying raises
 * assurance and the gate is what moves the stack. Both emissions are `Authenticated`, so a
 * boolean sees no change, skips the reset, and leaves the user on the code entry screen
 * with no way forward.
 *
 * Keying on the resolved DESTINATION gets both: a recreation resolves to the same place and
 * is ignored, while MfaChallenge → Dashboard is a real move and is not.
 *
 * It also fixes something nobody had reported. The original code reset on EVERY
 * `Authenticated` emission, and a background token refresh is one — so a refresh landing
 * while the user was three screens deep threw them back to the dashboard.
 */
internal object SessionGate {

    /** Saved in place of a destination, so a later `Initializing` does not re-show the splash. */
    const val SIGNED_OUT = "signed-out"

    /**
     * The serialized form, which is the same text the back stack is saved as — so the gate
     * and the saver agree on what makes two routes the same, by construction rather than by
     * two implementations happening to.
     *
     * It carries arguments, so `Onboarding(step=WELCOME)` is distinct from the next step —
     * which matters the day the wizard leans on this gate. Across an app update a renamed
     * route stops matching, which resets: the safe direction.
     *
     * See [routeKey] for why it must not be an inferred `encodeToString`.
     */
    fun key(route: AppRoute): String = routeKey(route)

    /**
     * @return the route to reset to, or null to leave the stack alone.
     */
    fun onAuthenticated(lastKey: String?, destination: AppRoute): AppRoute? =
        if (lastKey == key(destination)) null else destination

    /**
     * The splash belongs to a cold start only. After a recreation the flow re-emits
     * `Initializing` before the session comes back, and resolving to the splash over a
     * restored screen would be a flash of nothing on every rotation.
     */
    fun showsSplash(lastKey: String?): Boolean = lastKey == null
}
