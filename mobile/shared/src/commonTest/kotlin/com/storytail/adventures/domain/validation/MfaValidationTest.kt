package com.storytail.adventures.domain.validation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Cross-platform parity vectors. The same cases are in web/lib/validation/mfa.test.ts.
 */
class MfaValidationTest {

    @Test
    fun `normalisation keeps the digits and nothing else`() {
        val cases = listOf(
            "483921" to "483921",
            // Authenticator apps display the code with a space in the middle, and it comes
            // along on paste. Rejecting it would be rejecting the app's own formatting.
            "483 921" to "483921",
            "483-921" to "483921",
            "  483921  " to "483921",
            "4 8 3 9 2 1" to "483921",
        )

        for ((input, expected) in cases) {
            assertEquals(expected, MfaValidation.normalize(input), "normalize(\"$input\")")
        }
    }

    @Test
    fun `code vectors match the shared table`() {
        val cases = listOf(
            "483921" to null,
            "483 921" to null,
            "" to MfaValidation.Messages.CODE_REQUIRED,
            "   " to MfaValidation.Messages.CODE_REQUIRED,
            // Nothing survives normalisation, so there is no code — "six digits" would be
            // answering a question they did not ask.
            "abcdef" to MfaValidation.Messages.CODE_REQUIRED,
            "12345" to MfaValidation.Messages.CODE_SHAPE,
            "1234567" to MfaValidation.Messages.CODE_SHAPE,
            "12345a" to MfaValidation.Messages.CODE_SHAPE,
        )

        for ((input, expected) in cases) {
            assertEquals(
                expected,
                MfaValidation.validateCode(input).errorMessage,
                "validateCode(\"$input\")",
            )
        }
    }

    @Test
    fun `a valid code has no error`() {
        assertNull(MfaValidation.validateCode("000000").errorMessage)
    }
}
