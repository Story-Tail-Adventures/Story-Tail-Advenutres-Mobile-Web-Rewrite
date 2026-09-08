package com.storytail.adventures.domain

import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The ids these produce are validated for RECENCY by the Edge Functions (Data-Model §21.6),
 * so a generator that got the timestamp field wrong would not fail here — it would fail at
 * the server as "stale id", on a screen, with no way for a traveler to fix it. Hence the
 * layout assertions.
 */
class UuidV7Test {

    @Test
    fun `is a canonical uuid string`() {
        val id = uuidV7()
        assertEquals(36, id.length)
        assertTrue(
            Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").matches(id),
            "not canonical: $id",
        )
    }

    @Test
    fun `carries version 7 and the RFC variant`() {
        // Version is the first nibble of the third group; variant is the top two bits of the
        // fourth. Both are what a server-side parser reads to decide this is a v7 at all.
        repeat(20) {
            val id = uuidV7()
            assertEquals('7', id[14], "version nibble wrong in $id")
            assertTrue(id[19] in "89ab", "variant nibble wrong in $id")
        }
    }

    @Test
    fun `sorts by time across milliseconds, which is the whole reason for v7`() {
        // The first 48 bits are a big-endian millisecond timestamp, so lexicographic order on
        // the hex string IS chronological order. That is what makes these usable as primary
        // keys on an append-heavy table without an index scan for ordering.
        //
        // ACROSS MILLISECONDS, and only that. Plain RFC 9562 v7 says nothing about two ids
        // minted inside the same millisecond: their timestamps are identical and the
        // comparison falls through to the random tail, so a tight loop produces ids that do
        // NOT sort. RFC 9562 §6.2 offers optional monotonic sub-millisecond counters for
        // callers that need more; we deliberately do not implement one, because nothing here
        // mints ids in a loop — one per message a person sends — and the thread is ordered by
        // `created_at` regardless. Asserting the stronger property would be asserting
        // something this generator does not promise and does not need to.
        //
        // The wait spins on the clock rather than sleeping: commonTest has no blocking sleep,
        // and a millisecond of spinning is cheaper than pulling in a coroutine test harness.
        val ids = (1..12).map {
            val start = Clock.System.now().toEpochMilliseconds()
            while (Clock.System.now().toEpochMilliseconds() == start) { /* next millisecond */ }
            uuidV7()
        }
        assertEquals(ids, ids.sorted(), "ids minted in separate milliseconds are not ordered")
    }

    @Test
    fun `does not repeat itself`() {
        // A collision is a lost message, so the random tail has to actually be random.
        val ids = (1..500).map { uuidV7() }
        assertEquals(500, ids.toSet().size)
    }

    @Test
    fun `puts a plausible current timestamp in the first six bytes`() {
        // Decoded back out and checked against a range no fixed clock could satisfy by
        // accident: after this section was written, and before a century from now. A
        // generator that shifted the bytes the wrong way lands far outside it.
        val ms = uuidV7().replace("-", "").substring(0, 12).toLong(16)
        assertTrue(ms > 1_757_000_000_000, "timestamp is before this code was written: $ms")
        assertTrue(ms < 4_800_000_000_000, "timestamp is implausibly far in the future: $ms")
    }
}
