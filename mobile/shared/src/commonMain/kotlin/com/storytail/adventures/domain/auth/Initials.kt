package com.storytail.adventures.domain.auth

/**
 * The initials shown in an avatar. The Kotlin twin of `web/lib/auth/initials.ts`.
 *
 * Screen 2.5.1's avatar is INITIALS, never a photograph: `web/lib/images.ts` has no avatar
 * entries at all, so every `staImg('avatar*')` in the artboards is a stock portrait of a
 * stranger. `platform_user.avatar_url` exists for the day a traveler uploads one.
 */

/**
 * Shown when the name columns yield nothing. Applied by the CALLER rather than returned from
 * [initialsFor], because a traveler whose profile carries no name yet is a real state — the
 * onboarding gate only requires the wizard to be *finished*, and a skipped name step leaves
 * both columns at their placeholders.
 */
const val INITIALS_FALLBACK = "ST"

/**
 * What `handle_new_user()` writes when it provisions a row from an email or an OIDC identity
 * with no usable name (20260903190707_onboarding_schema.sql:203-204 and
 * 20260903221802_oauth_names.sql:72-84). They are placeholders, not names, so they must not
 * become initials — `NT` looks like a real person's monogram and is nobody's.
 *
 * Filtered PER FIELD, not as the pair: `("Jordan", "Traveler")` is a real first name with a
 * placeholder surname and should still give `J`.
 */
private const val PLACEHOLDER_FIRST = "New"
private const val PLACEHOLDER_LAST = "Traveler"

private fun firstLetter(value: String?, placeholder: String): String {
    val trimmed = value?.trim()
    if (trimmed.isNullOrEmpty() || trimmed == placeholder) return ""
    return trimmed.substring(0, 1)
}

/**
 * Two letters, or one, or none.
 *
 * Callers pass `preferred_name ?: first_name` as [first], so somebody who goes by Peggy gets
 * `P` rather than the `M` on their passport.
 */
fun initialsFor(first: String?, last: String?): String =
    (firstLetter(first, PLACEHOLDER_FIRST) + firstLetter(last, PLACEHOLDER_LAST)).uppercase()
