package com.storytail.adventures.domain

import kotlinx.datetime.Clock
import kotlin.random.Random

/**
 * UUID v7 — time-ordered, generated client-side. Data-Model §21.6.
 *
 * WHY THE CLIENT MINTS THESE AT ALL, since a server default would be simpler: §21.6 chose
 * client-side generation for offline support, so a write queued on a plane already has its
 * primary key and does not need a round trip to learn it. The tables that take these ids
 * (`message`, `document`) have no default on `id` as a result, and the Edge Functions
 * validate that the embedded timestamp is RECENT — a replayed or hand-crafted id is
 * rejected rather than trusted.
 *
 * That recency check is why this reads the clock rather than counting: an id built from a
 * device clock that is days out of date will be refused by the function, which is the
 * correct outcome (the alternative is silently accepting a row that sorts into last week).
 *
 * LAYOUT, big-endian, per RFC 9562 §5.7:
 *   bytes 0..5   48-bit Unix millisecond timestamp — this is what makes the id sort by time
 *   byte  6      high nibble = version 7, low nibble random
 *   byte  8      top two bits = variant 0b10, rest random
 *   everything else random
 *
 * `Random.Default` rather than a seeded instance: these are primary keys and a collision is
 * a lost message. It is not a CSPRNG, and does not need to be — the ids are not secrets and
 * nothing authorises off them; every function re-checks ownership against the caller's own
 * session.
 *
 * The web twin is `uuidV7` in web/lib/trips/actions.ts.
 */
fun uuidV7(): String {
    val bytes = Random.nextBytes(16)
    val ms = Clock.System.now().toEpochMilliseconds()

    for (i in 0..5) {
        // Byte 0 holds the most significant octet, so shift down by the remaining bytes.
        bytes[i] = ((ms shr (8 * (5 - i))) and 0xFF).toByte()
    }

    bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()

    val hex = StringBuilder(32)
    for (byte in bytes) {
        val value = byte.toInt() and 0xFF
        hex.append(HEX[value shr 4]).append(HEX[value and 0x0F])
    }

    return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-" +
        "${hex.substring(16, 20)}-${hex.substring(20, 32)}"
}

private const val HEX = "0123456789abcdef"
