package com.storytail.adventures.ui.nav

import com.storytail.adventures.domain.onboarding.WizardStep

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

    // ── Screen Inventory §2.0, the public (pre-auth) surface ─────────────────────
    //
    // None of these require a session, and that is the point: before this section the app
    // opened on a login wall, which gave somebody who had just installed it nothing to look
    // at and nothing to decide. 2.0.1 is now the front door, and Login is one tap from it.

    /** Screen 2.0.1, the app's front door for anyone not signed in. */
    data object PublicLanding : AppRoute

    /** Screen 2.0.2. */
    data object PublicHowItWorks : AppRoute

    /** Screen 2.0.3. */
    data object PublicExplore : AppRoute

    /** Screen 2.0.4. [dest] is the destination text the visitor searched, if any. */
    data class PublicResults(val dest: String? = null) : AppRoute

    /** Screen 2.0.5, by catalog slug. */
    data class PublicTripDetail(val slug: String) : AppRoute

    /**
     * Screen 2.0.6, the sign-up gate.
     *
     * A screen rather than a jump straight to [Register], because the gate's job is to say
     * WHY an account is suddenly needed — "create an account to send Gyasi your trip
     * details" reads very differently from a registration form appearing unannounced.
     * [intent] and [tripSlug] are what let it say that, and they carry through to Register.
     */
    data class PublicJoin(val intent: String, val tripSlug: String? = null) : AppRoute

    /**
     * Screens 2.0.8-2.0.10, the topic landing pages.
     *
     * One route carrying the topic for the same reason [Onboarding] carries its step: the
     * three pages are one screen with three faces — same hero, same inquire band, same
     * curated grid — and the differences live in the content, not the layout.
     */
    data class PublicTopic(val topic: com.storytail.adventures.content.public.Topic) : AppRoute

    /** Screen 2.0.11. */
    data object PublicAbout : AppRoute

    /** Screen 2.0.7, the legal pages. Reachable signed in or out. */
    data class PublicLegal(
        val slug: com.storytail.adventures.content.public.LegalSlug,
    ) : AppRoute

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

    /**
     * Screens 2.1.9-2.1.14, the client onboarding wizard.
     *
     * One route carrying the step rather than six routes, because the wizard IS one screen
     * with six faces: the chrome is shared, the exits are the same shape, and the order
     * lives in [com.storytail.adventures.domain.onboarding.WizardStep] where the cursor and
     * the progress bars can both read it.
     */
    data class Onboarding(val step: WizardStep) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    // ── Screen Inventory §2.2, the authenticated trip surface ───────────────────
    //
    // These are the four tabs' roots plus the trip stack. TAB SEMANTICS, decided here
    // because Navigator has push/replace/resetTo/pop and nothing that means "go to a tab":
    //
    //   * Selecting a tab REPLACES the stack root — `resetTo`, not `push`. A bottom bar is
    //     a set of roots, not a history, and pushing would make Back walk backwards through
    //     tabs instead of leaving the app.
    //   * Tapping the ALREADY-ACTIVE tab pops that tab back to its root, which is the
    //     platform convention on both iOS and Android.
    //   * System Back from a tab root exits, because there is nowhere above a root. Back
    //     from a pushed screen inside a tab pops to that tab's root.

    /** Screen 2.2.1, and the root of the Trips tab. */
    data object Dashboard : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /** Screen 2.2.2. */
    data object AllTrips : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /** Screen 2.2.3. */
    data class TripDetail(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /** Screen 2.2.4. */
    data class Itinerary(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /**
     * Screen 2.2.5. [dayNumber] rather than a day id, because that is what the URL-shaped
     * twin uses and what a "Day 3" deep link would carry.
     */
    data class ItineraryDay(val tripId: String, val dayNumber: Int) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /** Screen 2.2.6. */
    data class TripDocuments(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /** Screen 2.2.7. */
    data class TripThread(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /**
     * Screen 2.2.11. A route of its own rather than a branch inside [TripDetail].
     *
     * The workflow that planned this section left 2.2.10 and 2.2.11 as "the detail route
     * when the trip is cancelled/past", and that was the one under-specified thing in it:
     * every other screen had an exact path. A past trip is a different screen — a gallery
     * and a note, not tiles and a payment timeline — so it gets its own route, and
     * [TripDetail] redirects to it rather than growing a second body.
     *
     * 2.2.10 WENT THE OTHER WAY, and there was a `CancelledTrip` route here for a while
     * before it was removed unused. A cancelled trip genuinely IS the overview with a
     * different summary card: same hero, same identity, a cancellation summary where the
     * tiles were. §4.4 calls it a "Pattern C variant" and that is how both stacks build it.
     * The plan's consistency argument — that every screen should be pinned to a path — is
     * still satisfied, because `/trips/[id]` for a cancelled trip IS that path and a
     * notification can link straight to it.
     */
    data class PastTrip(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }

    /**
     * Screen 2.2.9, the notification landing.
     *
     * A ROUTE and not a sheet, which is where this departs from both artboards — they draw
     * it over a dimmed dashboard. §2.2.9's entry points are "push or email notification", so
     * the case that has to work is arriving COLD, from a tap, with the app not running, and a
     * sheet has nothing to arrive at. The sheet presentation belongs to §2.6's notification
     * centre.
     */
    data class TripUpdate(val tripId: String) : AppRoute {
        override val requiresSession: Boolean get() = true
    }
}
