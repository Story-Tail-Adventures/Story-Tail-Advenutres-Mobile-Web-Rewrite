package com.storytail.adventures.ui.nav

/**
 * Every destination the app can be on.
 *
 * A sealed interface and a [Navigator] rather than Compose Multiplatform's navigation
 * artifact. That was the plan recorded in App.kt when there were two destinations ("swap it
 * in at the third"), and it is being revisited here at the ninth — deliberately kept.
 * Fourteen screens with no deep links and no nested graphs do not need a route-string
 * parser, and this project has already been bitten once by an alpha dependency whose ABI
 * broke only the iOS targets (see the `supabase` pin in mobile/gradle/libs.versions.toml).
 * Revisit when deep links arrive — Screen Inventory 2.1.1 lists one as an entry point.
 *
 * [requiresSession] is what stops a signed-out state from yanking somebody off the screen
 * they are on. Losing a session while reading the dashboard must land on Login; losing one
 * while filling in the registration form must not.
 */
sealed interface AppRoute {

    /** True when being signed out makes this screen meaningless. */
    val requiresSession: Boolean get() = false

    /** Session restore has not finished. Distinct from Login so it does not flash. */
    data object Resolving : AppRoute

    data object Login : AppRoute

    /** Screen 2.1.2. */
    data object Register : AppRoute

    /**
     * Screen 2.1.3. Carries the address when sign-up knows it — straight after registering
     * there is no session to read it from, because GoTrue withholds one until the address
     * is confirmed.
     */
    data class VerifyEmail(val email: String? = null) : AppRoute

    /** Screen 2.1.4. */
    data object ForgotPassword : AppRoute

    /** Screen 2.1.5, on the recovery session the emailed link produces. */
    data object ResetPassword : AppRoute

    /** Screen 2.1.6. */
    data object MfaSetup : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /**
     * Screen 2.1.7. Requires a session — a half-assured one. It is the only screen reached
     * BECAUSE the session is incomplete rather than despite it.
     */
    data object MfaChallenge : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    data object Dashboard : AppRoute {
        override val requiresSession: Boolean get() = true
    }
}
