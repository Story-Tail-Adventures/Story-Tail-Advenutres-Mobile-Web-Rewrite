package com.storytail.adventures.domain.validation

/**
 * The rules every screen that creates an account shares — Screen Inventory 2.1.2
 * Registration, and 2.1.5 Reset Password for the confirm-password half.
 *
 * PARALLEL IMPLEMENTATION — web/lib/validation/registration.ts is a zod twin of this file,
 * for the reason given in AuthValidation's header: CLAUDE.md makes the stack directories a
 * hard boundary and this module does not run on web.
 *
 * Email and password rules are not repeated here; they live in [AuthValidation] on this
 * side and in web/lib/validation/auth.ts on the other, and both screens use them.
 *
 * .github/scripts/check_copy_parity.py compares every message below against its web
 * counterpart on each build.
 */
object RegistrationValidation {

    /** Byte-identical to REGISTRATION_MESSAGES in web/lib/validation/registration.ts. */
    object Messages {
        const val NAME_REQUIRED = "Tell us your name"
        const val NAME_TOO_LONG = "Keep it to 80 characters or fewer"
        const val NAME_INVALID = "Some of those characters won't work here"
        const val TERMS_REQUIRED = "Check the box to agree to our terms"
        const val CONFIRM_REQUIRED = "Type your password once more"
        const val CONFIRM_MISMATCH = "Those two don't match yet"
    }

    const val NAME_MAX = 80

    fun validateName(raw: String): ValidationResult {
        val trimmed = raw.trim()
        return when {
            trimmed.isEmpty() -> ValidationResult.Invalid(Messages.NAME_REQUIRED)
            trimmed.length > NAME_MAX -> ValidationResult.Invalid(Messages.NAME_TOO_LONG)
            // C0/C1 control characters anywhere in a name: newlines, NUL, escape. Category
            // Cc is the same set the web regex matches with \p{Cc}.
            trimmed.any { it.isISOControl() } -> ValidationResult.Invalid(Messages.NAME_INVALID)
            else -> ValidationResult.Valid
        }
    }

    /**
     * The terms checkbox. Screen Inventory 2.1.2 makes acceptance required, and the
     * submit path is reachable without the checkbox on either platform, so the rule lives
     * here rather than only in the UI.
     */
    fun validateTermsAccepted(accepted: Boolean): ValidationResult =
        if (accepted) ValidationResult.Valid
        else ValidationResult.Invalid(Messages.TERMS_REQUIRED)

    /**
     * Reported against the CONFIRMATION field, never the first password field: the field
     * somebody is looking at is the one they just typed, and marking the first one red
     * suggests the first one is wrong.
     *
     * Independent of [AuthValidation.validateNewPassword] on purpose — somebody whose
     * password is both too short AND mistyped should see both problems at once, not one
     * and then the other.
     */
    fun validateConfirmPassword(password: String, confirmation: String): ValidationResult = when {
        confirmation.isEmpty() -> ValidationResult.Invalid(Messages.CONFIRM_REQUIRED)
        confirmation != password -> ValidationResult.Invalid(Messages.CONFIRM_MISMATCH)
        else -> ValidationResult.Valid
    }
}
