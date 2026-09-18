package com.storytail.adventures.domain.validation

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * One row of the loyalty repeater — Screens 2.1.11 and 2.5.3.
 *
 * A repeater rather than the artboard's single text input, because splitting
 * "Marriott Bonvoy 123" on the last space credits somebody's miles to a program called
 * Marriott. `travel_preference.loyalty_programs` is `jsonb` holding `{program, number}`.
 */
data class LoyaltyRow(val program: String = "", val number: String = "")

/**
 * Read `travel_preference.loyalty_programs` back into rows. The Kotlin twin of
 * `readLoyalty` in `web/lib/validation/preferences-form.ts`.
 *
 * A ROW SURVIVES ON EITHER HALF, and that is the whole reason this is a shared function
 * rather than three lines inlined at the read.
 *
 * `onboarding-preferences` persists a row whose member number is blank as
 * `{"program": "Delta SkyMiles", "number": null}` — the number is nullable and blank is
 * normalised to null. A reader that required both halves to be strings would drop that row
 * on the way in, and the form REPLACES `loyalty_programs` wholesale on save, so the next
 * save would delete a program the traveler never touched. Silent data loss, one screen
 * removed from the same hazard 2.5.2's passport read exists to prevent.
 *
 * A row with neither half is dropped: it is a repeater slot nobody filled in, and it is what
 * the writer already refuses to persist.
 */
fun readLoyalty(value: JsonElement?): List<LoyaltyRow> {
    val array = value as? JsonArray ?: return emptyList()
    return array.mapNotNull { entry ->
        val row = entry as? JsonObject ?: return@mapNotNull null
        val program = row.stringOrEmpty("program")
        val number = row.stringOrEmpty("number")
        if (program.isEmpty() && number.isEmpty()) null else LoyaltyRow(program, number)
    }
}

/**
 * A JSON string, or "" for anything else — a null, a number, a nested object.
 *
 * `isString` matters: `JsonPrimitive.content` on the literal `null` is the four characters
 * "null", which would put the word into a member-number box.
 */
private fun JsonObject.stringOrEmpty(key: String): String {
    val primitive = this[key] as? JsonPrimitive ?: return ""
    return if (primitive.isString) primitive.content else ""
}
