package com.storytail.adventures.domain.validation

/**
 * The six-digit code from an authenticator app — Screen Inventory 2.1.6 and 2.1.7.
 *
 * PARALLEL IMPLEMENTATION — web/lib/validation/mfa.ts is a zod twin.
 * .github/scripts/check_copy_parity.py compares the messages on each build.
 */
object MfaValidation {

    /** Byte-identical to MFA_MESSAGES in web/lib/validation/mfa.ts. */
    object Messages {
        const val CODE_REQUIRED = "Enter the code from your authenticator app"
        const val CODE_SHAPE = "That code is six digits"
    }

    const val CODE_LENGTH = 6

    /**
     * Strips everything that is not a digit.
     *
     * Authenticator apps display the code as "483 921", and that space comes along when
     * somebody copies it. Rejecting it would be rejecting the app's own formatting.
     */
    fun normalize(raw: String): String = raw.filter { it.isDigit() }

    fun validateCode(raw: String): ValidationResult {
        val code = normalize(raw)
        return when {
            code.isEmpty() -> ValidationResult.Invalid(Messages.CODE_REQUIRED)
            code.length != CODE_LENGTH -> ValidationResult.Invalid(Messages.CODE_SHAPE)
            else -> ValidationResult.Valid
        }
    }
}
