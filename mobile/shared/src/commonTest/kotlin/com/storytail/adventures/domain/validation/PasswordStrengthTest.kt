package com.storytail.adventures.domain.validation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Cross-platform parity vectors. The same cases are in
 * web/lib/validation/password-strength.test.ts.
 */
class PasswordStrengthTest {

    /**
     * The one that actually matters: the meter and the rule must agree.
     *
     * A meter that says "strong" about a password GoTrue will reject teaches people the
     * indicator is decorative.
     */
    @Test
    fun `the meter agrees with validateNewPassword`() {
        val vectors = listOf(
            "",
            "short",
            "alllowercaseletters",
            "ALLUPPERCASELETTERS",
            "NoDigitsInHere",
            "nouppercase123456",
            "NOLOWERCASE123456",
            "GreenPastures1",
            "Sh0rt",
            "12345678901234567890",
            "Restful Waters 23",
        )

        for (value in vectors) {
            assertEquals(
                AuthValidation.validateNewPassword(value).isValid,
                PasswordStrength.of(value).meets,
                "strength and rule disagree about \"$value\"",
            )
        }
    }

    @Test
    fun `an empty field scores nothing and says nothing`() {
        val result = PasswordStrength.of("")
        assertEquals(0, result.score)
        assertEquals(4, result.missing.size)
        assertEquals("", PasswordStrength.message(""))
    }

    @Test
    fun `only the unmet rules are named`() {
        assertEquals(
            listOf(PasswordStrength.Labels.DIGIT),
            PasswordStrength.of("GreenPasturesAll").missing,
        )
        assertEquals(
            listOf(PasswordStrength.Labels.UPPERCASE),
            PasswordStrength.of("greenpastures1").missing,
        )
        assertEquals(
            listOf(PasswordStrength.Labels.LENGTH),
            PasswordStrength.of("Green1").missing,
        )
        assertTrue(PasswordStrength.of("GreenPastures1").missing.isEmpty())
    }

    @Test
    fun `messages match the shared table`() {
        assertEquals(PasswordStrength.Messages.STRONG, PasswordStrength.message("GreenPastures1"))
        assertEquals(
            "Still needs a capital letter and a number.",
            PasswordStrength.message("greenpastures"),
        )
        assertEquals(
            "Still needs at least 12 characters, a capital letter and a number.",
            PasswordStrength.message("green"),
        )
    }

    @Test
    fun `lists read the way a person would say them`() {
        assertEquals("", PasswordStrength.joinReadably(emptyList()))
        assertEquals("a", PasswordStrength.joinReadably(listOf("a")))
        assertEquals("a and b", PasswordStrength.joinReadably(listOf("a", "b")))
        assertEquals("a, b and c", PasswordStrength.joinReadably(listOf("a", "b", "c")))
        assertEquals("a, b, c and d", PasswordStrength.joinReadably(listOf("a", "b", "c", "d")))
    }
}
