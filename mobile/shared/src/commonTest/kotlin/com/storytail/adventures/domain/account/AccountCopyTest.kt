package com.storytail.adventures.domain.account

import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.domain.auth.INITIALS_FALLBACK
import com.storytail.adventures.domain.auth.OAUTH_PROVIDERS
import com.storytail.adventures.domain.auth.OAuthProvider
import com.storytail.adventures.domain.auth.PROVIDER_LABEL
import com.storytail.adventures.domain.auth.columnValue
import com.storytail.adventures.domain.auth.initialsFor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The §2.5 derivations that are not covered by copy parity.
 *
 * `check_copy_parity.py` compares the plain strings; the functions and lists beside them are
 * skipped on both sides because a function is not comparable across platforms. These are what
 * covers those.
 */
class AccountCopyTest {

    @Test
    fun `initials drop the placeholders handle_new_user writes`() {
        // `New Traveler` is what the trigger stores for a sign-up that carried no name — an
        // Apple authorization after the first, for instance. "NT" looks like a real person's
        // monogram and is nobody's.
        assertEquals("", initialsFor("New", "Traveler"))
        assertEquals(INITIALS_FALLBACK, "ST")
    }

    @Test
    fun `the placeholders are filtered per field, not as a pair`() {
        // A real first name beside the placeholder surname is a real person, half named.
        assertEquals("J", initialsFor("Jordan", "Traveler"))
        assertEquals("H", initialsFor("New", "Hayes"))
    }

    @Test
    fun `initials are two letters, uppercased, trimmed`() {
        assertEquals("JH", initialsFor("jordan", "hayes"))
        assertEquals("JH", initialsFor("  Jordan ", " Hayes"))
        assertEquals("", initialsFor(null, null))
        assertEquals("", initialsFor("   ", ""))
    }

    @Test
    fun `member-since is UTC and reads the month by number`() {
        // `created_at` is a timestamptz. Rendering it in the device's zone would move
        // somebody who signed up late on the 31st into the previous month on one stack and
        // not the other — the web twin passes timeZone: "UTC" for the same reason.
        assertEquals("March 2024", monthAndYear("2024-03-01T00:00:00+00:00"))
        assertEquals("December 2026", monthAndYear("2026-12-31T23:59:59.999Z"))
        assertEquals("January 2025", monthAndYear("2025-01-15"))
    }

    @Test
    fun `a member-since that cannot be read is absent rather than wrong`() {
        assertEquals(null, monthAndYear(null))
        assertEquals(null, monthAndYear(""))
        assertEquals(null, monthAndYear("not a date"))
        assertEquals(null, monthAndYear("2026-13-01T00:00:00Z"))
        assertEquals(null, monthAndYear("2026-00-01T00:00:00Z"))
    }

    @Test
    fun `the member-since sentence is built from the formatted month`() {
        assertEquals("Traveling with Gyasi since March 2024", memberSince("March 2024"))
    }

    @Test
    fun `the document count is singular at one`() {
        // The hub and 2.5.4 render the same list, so this string and that list must agree.
        assertEquals("1 file", documentsSub(1))
        assertEquals("2 files", documentsSub(2))
        assertEquals("0 files", documentsSub(0))
    }

    @Test
    fun `the no-password sentence names the two providers we have`() {
        assertTrue(noPasswordBody("google").startsWith("You sign in with Google,"))
        assertTrue(noPasswordBody("apple").startsWith("You sign in with Apple,"))
        // Anything else is echoed rather than guessed at — `auth_provider` is an enum, so
        // this can only be reached if the enum grows before this function does.
        assertTrue(noPasswordBody("okta").startsWith("You sign in with okta,"))
    }

    @Test
    fun `the closure consequences never promise a deadline`() {
        // Data-Model §18.5 describes a 30-day anonymization window and NOTHING implements
        // it — no migration, no pg_cron entry, no function. A dated retention promise on a
        // legal screen is the class of claim PUBLIC_CLAIMS_MODE=strict exists to stop.
        val claims = CLOSE_WHAT_HAPPENS + listOf(
            PrivacyMessages.CLOSE_BODY,
            CloseMessages.HEADING,
            CloseMessages.RECONSIDER_BODY,
        )
        val deadline = Regex("""\b\d+\s*days?\b""")
        claims.forEach { line -> assertTrue(!deadline.containsMatchIn(line), line) }
        assertEquals(4, CLOSE_WHAT_HAPPENS.size)
        // Card revocation is stated as a CONSEQUENCE, which is true whether or not §2.4
        // shipped — it is not an action this screen offers.
        assertTrue(CLOSE_WHAT_HAPPENS.any { it.contains("card", ignoreCase = true) })
    }

    @Test
    fun `the legal links cover every published document`() {
        assertEquals(LegalSlug.entries.toSet(), HELP_LEGAL.map { it.first }.toSet())
    }

    @Test
    fun `the providers are exactly the two the enum allows`() {
        // `auth_provider` is ENUM ('email','google','apple'). 2.5.8 derives its rows from
        // this list rather than typing them out, so a third provider is a schema change.
        assertEquals(listOf(OAuthProvider.GOOGLE, OAuthProvider.APPLE), OAUTH_PROVIDERS)
        assertEquals("google", OAuthProvider.GOOGLE.columnValue)
        assertEquals("apple", OAuthProvider.APPLE.columnValue)
        assertEquals(OAUTH_PROVIDERS.toSet(), PROVIDER_LABEL.keys)
    }
}
