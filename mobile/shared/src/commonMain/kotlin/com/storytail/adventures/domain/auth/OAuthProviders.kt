package com.storytail.adventures.domain.auth

/**
 * The OAuth providers the app offers. The Kotlin twin of `web/lib/auth/providers.ts`.
 *
 * GOOGLE AND APPLE, and nothing else. `auth_provider` is
 * `ENUM ('email', 'google', 'apple')` (20260514120000_initial.sql:28), so a third provider
 * is a schema change rather than a config one.
 *
 * Screen 2.5.8 derives its rows from [OAUTH_PROVIDERS] rather than typing them out, exactly
 * as the web screen does. The desktop artboard adds a Facebook row marked
 * "Not connected · available" — a provider we do not have, described as one click away.
 * That is departure 3 in `client-account-mobile.jsx`.
 */
enum class OAuthProvider { GOOGLE, APPLE }

val OAUTH_PROVIDERS: List<OAuthProvider> = listOf(OAuthProvider.GOOGLE, OAuthProvider.APPLE)

val PROVIDER_LABEL: Map<OAuthProvider, String> = mapOf(
    OAuthProvider.GOOGLE to "Google",
    OAuthProvider.APPLE to "Apple",
)

/** The `account.auth_provider` value this provider corresponds to. */
val OAuthProvider.columnValue: String
    get() = when (this) {
        OAuthProvider.GOOGLE -> "google"
        OAuthProvider.APPLE -> "apple"
    }
