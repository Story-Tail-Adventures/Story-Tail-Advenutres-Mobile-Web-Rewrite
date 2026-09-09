package com.storytail.adventures.domain.validation

/**
 * The password policy, expressed as something a meter can render — Screen Inventory 2.1.2
 * and 2.1.5 both call for one.
 *
 * PARALLEL IMPLEMENTATION — web/lib/validation/password-strength.ts is the twin.
 *
 * The rules ARE [AuthValidation.validateNewPassword]'s rules, and PasswordStrengthTest
 * asserts that against it directly. A meter that says "strong" about a password GoTrue
 * will reject is worse than no meter: it teaches people the indicator is decorative.
 *
 * There is deliberately no entropy estimate or dictionary check. GoTrue applies
 * `password_requirements` and its own weak-password rule; a second opinion in the app
 * would only teach people to trust a number with no authority over whether their sign-up
 * succeeds.
 */
object PasswordStrength {

    /** Byte-identical to PASSWORD_RULE_LABELS in web/lib/validation/password-strength.ts. */
    object Labels {
        const val LENGTH = "at least 12 characters"
        const val UPPERCASE = "a capital letter"
        const val LOWERCASE = "a lowercase letter"
        const val DIGIT = "a number"
    }

    /** Byte-identical to STRENGTH_MESSAGES in the same web module. */
    object Messages {
        const val STRONG = "Strong — 12+ characters, upper and lower case, and a number."
        const val STILL_NEEDS_PREFIX = "Still needs "
    }

    private val RULES: List<Pair<String, (String) -> Boolean>> = listOf(
        Labels.LENGTH to { v: String -> v.length >= 12 },
        Labels.UPPERCASE to { v: String -> v.any(Char::isUpperCase) },
        Labels.LOWERCASE to { v: String -> v.any(Char::isLowerCase) },
        Labels.DIGIT to { v: String -> v.any(Char::isDigit) },
    )

    data class Result(val score: Int, val missing: List<String>) {
        val meets: Boolean get() = missing.isEmpty()
    }

    /** How many rules there are, for a meter that draws one segment each. */
    val RULE_COUNT: Int get() = RULES.size

    fun of(value: String): Result {
        val missing = RULES.filterNot { (_, met) -> met(value) }.map { it.first }
        return Result(score = RULES.size - missing.size, missing = missing)
    }

    /** "a and b" / "a, b and c" — the reader is being helped, not given a bullet list. */
    fun joinReadably(parts: List<String>): String = when (parts.size) {
        0 -> ""
        1 -> parts[0]
        2 -> "${parts[0]} and ${parts[1]}"
        else -> "${parts.dropLast(1).joinToString(", ")} and ${parts.last()}"
    }

    /**
     * The line under the bar. Empty for an empty field: somebody who has not typed
     * anything is not failing at anything, and listing what they are missing before they
     * start is nagging.
     */
    fun message(value: String): String {
        if (value.isEmpty()) return ""
        val result = of(value)
        return if (result.meets) Messages.STRONG
        else "${Messages.STILL_NEEDS_PREFIX}${joinReadably(result.missing)}."
    }
}
