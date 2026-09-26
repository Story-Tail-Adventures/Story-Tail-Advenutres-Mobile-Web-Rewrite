package com.storytail.adventures.domain.validation

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The Kotlin twin of `web/lib/validation/preferences-form.test.ts`.
 *
 * [readLoyalty] is shared by Screen 2.1.11 (the wizard) and Screen 2.5.3 (the account
 * screen), and it was hand-copied on the web side before it was extracted — losing, on that
 * copy, the one edge it was written for. That is what these pin.
 */
class LoyaltyProgramsTest {

    private fun parse(json: String) = readLoyalty(Json.parseToJsonElement(json))

    @Test
    fun `keeps a program whose member number is null`() {
        // THE REGRESSION. `onboarding-preferences` persists a blank number as null, so this
        // is exactly what "typed a program, left the number blank" is stored as. A reader
        // that demands two strings drops the row — and because the form replaces
        // `loyalty_programs` wholesale, the next save deletes the program from the record.
        assertEquals(
            listOf(LoyaltyRow("AAdvantage", "")),
            parse("""[{"program": "AAdvantage", "number": null, "tier": null}]"""),
        )
    }

    @Test
    fun `keeps a number whose program is missing rather than dropping it`() {
        assertEquals(
            listOf(LoyaltyRow("", "92214")),
            parse("""[{"number": "92214"}]"""),
        )
    }

    @Test
    fun `drops a row only when both halves are empty`() {
        assertEquals(emptyList(), parse("""[{"program": "", "number": ""}]"""))
        assertEquals(emptyList(), parse("""[{"program": null, "number": null}]"""))
    }

    @Test
    fun `coerces a non-string rather than discarding the row around it`() {
        // The column has no CHECK, so it eventually holds something else. Losing the number
        // is recoverable; losing the program silently is not.
        assertEquals(
            listOf(LoyaltyRow("IHG Rewards", "")),
            parse("""[{"program": "IHG Rewards", "number": 92214}]"""),
        )
    }

    @Test
    fun `the JSON literal null is not the four-letter word null`() {
        // `JsonPrimitive.content` on the literal null is "null". Without the isString check
        // that string lands in a member-number box.
        assertEquals(
            listOf(LoyaltyRow("Hyatt", "")),
            parse("""[{"program": "Hyatt", "number": null}]"""),
        )
    }

    @Test
    fun `a nested object in a half is dropped, not stringified`() {
        assertEquals(
            listOf(LoyaltyRow("Hilton Honors", "")),
            parse("""[{"program": "Hilton Honors", "number": {"n": "1"}}]"""),
        )
    }

    @Test
    fun `anything that is not an array of objects reads as no rows`() {
        assertEquals(emptyList(), readLoyalty(null))
        assertEquals(emptyList(), readLoyalty(JsonPrimitive("AAdvantage")))
        assertEquals(emptyList(), parse("""{"program": "AAdvantage"}"""))
        assertEquals(emptyList(), parse("""["AAdvantage"]"""))
        assertEquals(emptyList(), parse("[]"))
    }

    @Test
    fun `order is preserved`() {
        assertEquals(
            listOf(LoyaltyRow("Delta SkyMiles", "1"), LoyaltyRow("Marriott Bonvoy", "2")),
            parse(
                """[{"program": "Delta SkyMiles", "number": "1"}, """ +
                    """{"program": "Marriott Bonvoy", "number": "2"}]""",
            ),
        )
    }
}
