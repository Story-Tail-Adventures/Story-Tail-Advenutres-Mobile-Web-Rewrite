package com.storytail.adventures.domain.validation

/**
 * Auth field validation, shared by Android and iOS.
 *
 * PARALLEL IMPLEMENTATION — web/lib/validation/auth.ts is a zod twin of this file.
 * They are deliberately not one shared artifact: CLAUDE.md makes the stack
 * directories a hard boundary and this module does not run on web.
 *
 * The two are kept honest by one table of test vectors asserted on both sides:
 *   mobile/shared/src/commonTest/.../AuthValidationTest.kt
 *   web/lib/validation/auth.test.ts
 * Change a rule or a message here and you must change it there, plus both tests.
 */
object AuthValidation {

    /** User-facing copy. Byte-identical to AUTH_MESSAGES in web/lib/validation/auth.ts. */
    object Messages {
        const val EMAIL_REQUIRED = "Don't forget your email"
        const val EMAIL_INVALID = "That doesn't look like an email address"
        const val PASSWORD_REQUIRED = "Don't forget your password"
        const val PASSWORD_TOO_SHORT = "Use at least 12 characters"
        const val PASSWORD_NEEDS_DIGIT = "Add at least one number"
        const val PASSWORD_NEEDS_UPPERCASE = "Add at least one capital letter"
    }

    private val EMAIL_REGEX = Regex("""^[^\s@]+@[^\s@]+\.[^\s@]{2,}$""")

    fun validateEmail(raw: String): ValidationResult {
        val trimmed = raw.trim()
        return when {
            trimmed.isEmpty() -> ValidationResult.Invalid(Messages.EMAIL_REQUIRED)
            !EMAIL_REGEX.matches(trimmed) -> ValidationResult.Invalid(Messages.EMAIL_INVALID)
            else -> ValidationResult.Valid
        }
    }

    /**
     * SIGN-IN password rule: presence only.
     *
     * Deliberately NOT the 12-character policy. That rule governs registration and
     * reset (Screen Inventory 2.1.2 / 2.1.5). Enforcing it at sign-in would lock out
     * anyone whose password predates the policy, and it leaks the policy to an
     * unauthenticated caller. Let the auth server decide whether the password is right.
     */
    fun validateLoginPassword(raw: String): ValidationResult =
        if (raw.isEmpty()) ValidationResult.Invalid(Messages.PASSWORD_REQUIRED)
        else ValidationResult.Valid

    /** REGISTRATION / RESET password rule — Screen Inventory 2.1.2 and 2.1.5. */
    fun validateNewPassword(raw: String): ValidationResult = when {
        raw.length < 12 -> ValidationResult.Invalid(Messages.PASSWORD_TOO_SHORT)
        raw.none { it.isDigit() } -> ValidationResult.Invalid(Messages.PASSWORD_NEEDS_DIGIT)
        raw.none { it.isUpperCase() } -> ValidationResult.Invalid(Messages.PASSWORD_NEEDS_UPPERCASE)
        else -> ValidationResult.Valid
    }
}

sealed interface ValidationResult {
    data object Valid : ValidationResult
    data class Invalid(val message: String) : ValidationResult

    val errorMessage: String?
        get() = (this as? Invalid)?.message

    val isValid: Boolean
        get() = this is Valid
}
