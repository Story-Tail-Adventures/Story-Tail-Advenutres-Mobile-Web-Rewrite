package com.storytail.adventures.api

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.logging.LogLevel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Flipping mobile to the Go service has to be config only (docs/GO-MIGRATION.md §5.8), and
 * until then the setting has to change nothing. These resolve URLs through supabase-kt's own
 * `resolveUrl`, the function every `functions.invoke` call goes through, rather than through a
 * copy of its rules, so a library change to how `customUrl` is joined fails here.
 */
class FunctionsUrlTest {

    @Test
    fun `the default leaves the plugin's own url alone`() {
        assertNull(functionsCustomUrl("https://abcd.supabase.co", "https://abcd.supabase.co"))
    }

    @Test
    fun `the default resolves to the supabase functions url`() {
        for (base in listOf("http://10.0.2.2:54321", "https://abcd.supabase.co")) {
            assertEquals("$base/functions/v1/trip-message", resolve(base, base, "trip-message"))
        }
    }

    @Test
    fun `a go url keeps the functions path`() {
        val supabase = "https://abcd.supabase.co"
        assertEquals(
            "https://api.example.com/functions/v1/trip-message",
            resolve(supabase, "https://api.example.com", "trip-message"),
        )
        assertEquals(
            "https://api.example.com/functions/v1/trip-message",
            resolve(supabase, "https://api.example.com/", "trip-message"),
        )
    }

    @Test
    fun `a custom url on the same host builds the same bytes as the default`() {
        // The trailing slash makes the two strings differ, so this takes the customUrl path;
        // the result has to match the default path's string exactly.
        val base = "https://abcd.supabase.co"
        assertEquals(resolve(base, base, "agent-settings"), resolve(base, "$base/", "agent-settings"))
    }

    /** Mirrors `install(Functions)` in [SupabaseClientProvider]. */
    private fun resolve(supabaseUrl: String, functionsUrl: String, name: String): String =
        createSupabaseClient(supabaseUrl, "anon-key") {
            defaultLogLevel = LogLevel.NONE
            install(Functions) { customUrl = functionsCustomUrl(supabaseUrl, functionsUrl) }
        }.functions.resolveUrl(name)
}
