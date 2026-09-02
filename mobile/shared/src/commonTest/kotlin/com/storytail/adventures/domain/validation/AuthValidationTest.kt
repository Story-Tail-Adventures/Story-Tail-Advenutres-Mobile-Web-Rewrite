package com.storytail.adventures.domain.validation

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Cross-platform parity vectors.
 *
 * The SAME table is asserted in web/lib/validation/auth.test.ts. If you add a case
 * here, add it there. The two validators are separate implementations by design
 * (see AuthValidation's header) — these vectors are the only thing keeping them
 * from drifting apart.
 */
class AuthValidationTest {

    @Test
    fun `email vectors match the shared table`() {
        val cases = listOf(
            "" to AuthValidation.Messages.EMAIL_REQUIRED,
            "   " to AuthValidation.Messages.EMAIL_REQUIRED,
            "jordan" to AuthValidation.Messages.EMAIL_INVALID,
            "jordan@" to AuthValidation.Messages.EMAIL_INVALID,
            "jordan@example" to AuthValidation.Messages.EMAIL_INVALID,
            "jordan@example.c" to AuthValidation.Messages.EMAIL_INVALID,
            "jordan hayes@example.com" to AuthValidation.Messages.EMAIL_INVALID,
            "jordan@example.com" to null,
            "  jordan@example.com  " to null,
            "JORDAN@EXAMPLE.COM" to null,
            "jordan.hayes+trips@example.co.uk" to null,
        )

        for ((input, expected) in cases) {
            assertEquals(
                expected,
                AuthValidation.validateEmail(input).errorMessage,
                "validateEmail(\"$input\")",
            )
        }
    }

    @Test
    fun `login password requires presence only`() {
        assertEquals(
            AuthValidation.Messages.PASSWORD_REQUIRED,
            AuthValidation.validateLoginPassword("").errorMessage,
        )
        // A short password is NOT a login-time error — the policy applies at
        // registration, and rejecting it here would leak the policy and lock out
        // anyone whose password predates it.
        assertEquals(null, AuthValidation.validateLoginPassword("short").errorMessage)
        assertEquals(null, AuthValidation.validateLoginPassword(" ").errorMessage)
    }

    @Test
    fun `new password enforces the 12 char policy`() {
        val cases = listOf(
            "" to AuthValidation.Messages.PASSWORD_TOO_SHORT,
            "Short1" to AuthValidation.Messages.PASSWORD_TOO_SHORT,
            "alllowercase" to AuthValidation.Messages.PASSWORD_NEEDS_DIGIT,
            "alllowercase1" to AuthValidation.Messages.PASSWORD_NEEDS_UPPERCASE,
            "GreenPastures1" to null,
            "still-waters-99X" to null,
        )

        for ((input, expected) in cases) {
            assertEquals(
                expected,
                AuthValidation.validateNewPassword(input).errorMessage,
                "validateNewPassword(\"$input\")",
            )
        }
    }
}
