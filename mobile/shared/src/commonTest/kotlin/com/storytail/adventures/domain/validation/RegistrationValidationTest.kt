package com.storytail.adventures.domain.validation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Cross-platform parity vectors.
 *
 * The SAME cases are asserted in web/lib/validation/registration.test.ts. If you add one
 * here, add it there — the two validators are separate implementations by design and these
 * vectors are what keeps them from drifting apart. The messages themselves are compared by
 * .github/scripts/check_copy_parity.py on every build.
 */
class RegistrationValidationTest {

    @Test
    fun `name vectors match the shared table`() {
        val cases = listOf(
            "Jordan" to null,
            "  Jose-Maria  " to null,
            "O'Neil" to null,
            "" to RegistrationValidation.Messages.NAME_REQUIRED,
            "   " to RegistrationValidation.Messages.NAME_REQUIRED,
            "x".repeat(RegistrationValidation.NAME_MAX) to null,
            "x".repeat(RegistrationValidation.NAME_MAX + 1) to
                RegistrationValidation.Messages.NAME_TOO_LONG,
            // Control characters, written as escapes so nothing invisible lives in this file.
            "Jordan\u0007Hayes" to RegistrationValidation.Messages.NAME_INVALID,
            "Jordan\nHayes" to RegistrationValidation.Messages.NAME_INVALID,
        )

        for ((input, expected) in cases) {
            assertEquals(
                expected,
                RegistrationValidation.validateName(input).errorMessage,
                "validateName(\"$input\")",
            )
        }
    }

    @Test
    fun `the terms checkbox is required`() {
        assertEquals(
            RegistrationValidation.Messages.TERMS_REQUIRED,
            RegistrationValidation.validateTermsAccepted(false).errorMessage,
        )
        assertNull(RegistrationValidation.validateTermsAccepted(true).errorMessage)
    }

    @Test
    fun `confirmation is reported on the confirmation, not on the password`() {
        val password = "GreenPastures1"

        assertNull(
            RegistrationValidation.validateConfirmPassword(password, password).errorMessage,
        )
        assertEquals(
            RegistrationValidation.Messages.CONFIRM_REQUIRED,
            RegistrationValidation.validateConfirmPassword(password, "").errorMessage,
        )
        assertEquals(
            RegistrationValidation.Messages.CONFIRM_MISMATCH,
            RegistrationValidation.validateConfirmPassword(password, "GreenPastures2").errorMessage,
        )
    }

    @Test
    fun `a weak password and a mismatch are both reported, not one and then the other`() {
        // Somebody who typed a short password AND mistyped the repeat should see both
        // problems on the first submit, which is why these two rules are independent.
        val short = "short"
        assertEquals(
            AuthValidation.Messages.PASSWORD_TOO_SHORT,
            AuthValidation.validateNewPassword(short).errorMessage,
        )
        assertEquals(
            RegistrationValidation.Messages.CONFIRM_MISMATCH,
            RegistrationValidation.validateConfirmPassword(short, "shore").errorMessage,
        )
    }
}
