package com.storytail.adventures.ui.screens.public

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.ui.components.public.PublicMenuSheet
import com.storytail.adventures.ui.nav.AppRoute

/**
 * The host for Screen Inventory §2.0, the public (pre-auth) surface.
 *
 * One entry point for nine screens, the same shape [OnboardingRoute] uses for the wizard,
 * and for the same reason: they share a menu, a set of exits and one back stack, and
 * spreading that across nine branches of App.kt's `when` would put the shared parts in nine
 * places. App.kt hands over a route and gets a screen.
 *
 * Everything here is reachable WITHOUT a session — that is the point of the section. The
 * two exits that need one ([onSignIn], [onCreateAccount]) hand back to App.kt rather than
 * being resolved here, because what happens after authentication is the session's business,
 * not this surface's.
 */
@Composable
fun PublicRoute(
    route: AppRoute,
    onNavigate: (AppRoute) -> Unit,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val openMenu = { menuOpen = true }

    // The gate is where every account-gated action on this surface lands. Guest "message"
    // goes here too: the Lead entity is P2 (Data-Model §11) and no inquiry address is
    // configured for the app, so routing to a dead mailto would be worse than asking. Web
    // makes the same fallback when NEXT_PUBLIC_INQUIRY_EMAIL is unset.
    val gate = { intent: String, slug: String? ->
        onNavigate(AppRoute.PublicJoin(intent = intent, tripSlug = slug))
    }

    when (route) {
        AppRoute.PublicLanding -> LandingScreen(
            onCreateAccount = onCreateAccount,
            onSignIn = onSignIn,
            onTakeTour = { onNavigate(AppRoute.PublicHowItWorks) },
            onBrowseTrips = { onNavigate(AppRoute.PublicExplore) },
            onMenu = openMenu,
        )

        AppRoute.PublicHowItWorks -> HowItWorksScreen(
            onCreateAccount = onCreateAccount,
            onMessageGyasi = { gate("message", null) },
            onMenu = openMenu,
            onBack = onBack,
        )

        AppRoute.PublicExplore -> ExploreScreen(
            // Blank means "everywhere", not a failed search — ResultsScreen reads a null
            // dest as the whole catalog.
            onSearch = { dest -> onNavigate(AppRoute.PublicResults(dest.ifBlank { null })) },
            onOpenTile = { slug ->
                // Inspiration tiles carry a query, not a trip. Resolve the tile to its
                // destination text so the results screen filters the way the tile promised.
                val tile = PublicCatalog.INSPIRATION_TILES.firstOrNull { it.slug == slug }
                onNavigate(AppRoute.PublicResults(tile?.query?.dest))
            },
            onSignIn = onSignIn,
            onMenu = openMenu,
            onBack = onBack,
        )

        is AppRoute.PublicResults -> ResultsScreen(
            dest = route.dest,
            onOpenTrip = { onNavigate(AppRoute.PublicTripDetail(it)) },
            onRequestQuote = { gate("quote", it) },
            onCreateAccount = onCreateAccount,
            onMenu = openMenu,
            onBack = onBack,
        )

        is AppRoute.PublicTripDetail -> {
            val trip = PublicContent.tripBySlug(route.slug)
            // An unknown slug has no screen. Going back is the honest answer — the web twin
            // 404s, and the app has nowhere equivalent to send somebody.
            if (trip == null) {
                onBack()
            } else {
                TripDetailScreen(
                    trip = trip,
                    onRequestQuote = { gate("quote", trip.slug) },
                    onSave = { gate("save", trip.slug) },
                    onMessageGyasi = { gate("message", trip.slug) },
                    onMenu = openMenu,
                    onBack = onBack,
                )
            }
        }

        is AppRoute.PublicJoin -> JoinGateScreen(
            intent = route.intent,
            // Resolved from the catalog, never from the route string: it is printed in the
            // headline, and a slug is not a name.
            tripName = route.tripSlug?.let { PublicContent.tripBySlug(it)?.name },
            onCreateAccount = onCreateAccount,
            onSignIn = onSignIn,
            // Phase 1 has no lead capture, so "continue as guest" cannot promise a saved
            // trip or an account. It closes the gate and leaves them where they were.
            onContinueAsGuest = onBack,
            onDismiss = onBack,
        )

        is AppRoute.PublicTopic -> TopicScreen(
            topic = route.topic,
            onOpenTrip = { onNavigate(AppRoute.PublicTripDetail(it)) },
            onRequestQuote = { gate("quote", it) },
            onSeeAll = { onNavigate(AppRoute.PublicResults()) },
            onMessageGyasi = { gate("message", null) },
            onMenu = openMenu,
            onBack = onBack,
        )

        AppRoute.PublicAbout -> AboutGyasiScreen(
            onRequestQuote = { gate("quote", null) },
            onMessageGyasi = { gate("message", null) },
            onMenu = openMenu,
            onBack = onBack,
        )

        is AppRoute.PublicLegal -> {
            val doc = PublicContent.legalBySlug(route.slug)
            if (doc == null) {
                onBack()
            } else {
                LegalScreen(
                    doc = doc,
                    onSelectDoc = { onNavigate(AppRoute.PublicLegal(it)) },
                    onMenu = openMenu,
                    onBack = onBack,
                )
            }
        }

        // PublicRoute is only ever handed a §2.0 route; App.kt owns the rest.
        else -> Unit
    }

    if (menuOpen) {
        PublicMenuSheet(
            onDismiss = { menuOpen = false },
            onNavigate = {
                menuOpen = false
                onNavigate(it)
            },
            onSignIn = {
                menuOpen = false
                onSignIn()
            },
            onCreateAccount = {
                menuOpen = false
                onCreateAccount()
            },
        )
    }
}
