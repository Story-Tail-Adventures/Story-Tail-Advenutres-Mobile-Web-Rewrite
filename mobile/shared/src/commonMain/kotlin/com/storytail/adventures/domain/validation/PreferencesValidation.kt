package com.storytail.adventures.domain.validation

/**
 * Screen 2.1m.11 Travel Preferences — the vocabularies and the rules.
 *
 * PARALLEL IMPLEMENTATION of web/lib/validation/preferences.ts, and the vocabularies are
 * closed on both sides because a CHECK constraint closes them in the database
 * (20260904124903_travel_preference_vocabulary.sql). Agent-side filtering will group on
 * these, so a stray label makes one answer look like three.
 *
 * THE LABEL IS NOT THE VALUE. "Honeymoon" is what a person calls their trip; `romantic` is
 * what the Data Model, the Screen Inventory and the constraint all call it. Only the
 * prototype says Honeymoon, so a straight transcription stores a value nothing recognises.
 */
object PreferencesValidation {

    object Messages {
        const val DESTINATIONS_TOO_MANY =
            "That's more than Gyasi can hold in his head — pick up to 12"
        const val DESTINATION_TOO_LONG = "Keep a place name to 60 characters or fewer"
        const val INVALID_CHARS = "Some of those characters won't work here"
        const val DIETARY_NONE_ALONE =
            "\"No restrictions\" doesn't go with the others — pick one or the other"
        const val DIETARY_NONE_WITH_NOTE =
            "You've said no restrictions, but written one below — untick \"No restrictions\" " +
                "and we'll pass the note on"
        const val ACCESSIBILITY_NONE_ALONE =
            "\"None\" doesn't go with the others — pick one or the other"
        const val ACCESSIBILITY_NONE_WITH_NOTE =
            "You've said none, but written one below — untick \"None\" and we'll pass the " +
                "note on"
        const val NOTES_TOO_LONG = "Keep this to 500 characters or fewer"
        const val FAVOURITES_TOO_LONG = "Keep this to 1000 characters or fewer"
        const val LOYALTY_NEEDS_PROGRAM = "Which program is that number for?"
        const val LOYALTY_NUMBER_SHAPE = "A membership number is letters, digits and hyphens"
        const val LOYALTY_PROGRAM_TOO_LONG = "Keep a program name to 60 characters or fewer"
        const val LOYALTY_TOO_MANY = "That's as many programs as we can hold — up to 10"
        const val UNKNOWN_OPTION = "That isn't one of the options"
        const val BUDGET_UNKNOWN = "Pick one of the ranges, or say you're not sure yet"
    }

    object Limits {
        const val DESTINATIONS = 12
        const val DESTINATION_LENGTH = 60
        const val NOTES = 500
        const val FAVOURITES = 1000
        const val LOYALTY_ROWS = 10
        const val LOYALTY_PROGRAM = 60
        const val LOYALTY_NUMBER = 40
    }

    /** The sentinel meaning "asked and answered: nothing to worry about". */
    const val NONE = "none"

    /** What a person reads, and what the column stores. */
    data class Option(val label: String, val value: String)

    val DESTINATION_SUGGESTIONS = listOf(
        "Caribbean", "Bahamas", "Greece", "Mexico", "Costa Rica", "Italy", "Iceland", "Japan",
    )

    val TRAVEL_STYLES = listOf(
        Option("Resort", "resort"),
        Option("Cruise", "cruise"),
        Option("Adventure", "adventure"),
        Option("Family", "family"),
        // The one place the label and the value genuinely differ.
        Option("Honeymoon", "romantic"),
        Option("Group", "group"),
    )

    val DIETARY = listOf(
        Option("No restrictions", NONE),
        Option("Vegetarian", "vegetarian"),
        Option("Pescatarian", "pescatarian"),
        Option("Gluten-free", "gluten_free"),
        Option("Halal", "halal"),
    )

    val ACCESSIBILITY = listOf(
        Option("None", NONE),
        Option("Mobility-friendly", "mobility"),
        Option("Quiet rooms", "quiet_room"),
        Option("Service animal", "service_animal"),
    )

    /**
     * The four bands, and the dollar figures are LABELS rather than data.
     *
     * `travel_preference.budget_band` stores only the slug, so these ranges can be re-cut
     * when Gyasi says where his trips actually sit — a copy change, not a migration. They
     * were read off the prototype's demo slider and nobody has ratified them.
     */
    val BUDGET_BANDS = listOf(
        Option("Up to \$2,500", "budget"),
        Option("\$2,500 – \$5,000", "mid"),
        Option("\$5,000 – \$10,000", "premium"),
        Option("\$10,000+", "luxury"),
    )

    /** Not decoration: a radio group cannot return to unselected. */
    const val BUDGET_UNSURE = "Not sure yet"

    private val LOYALTY_NUMBER = Regex("""^[A-Za-z0-9-]{1,40}$""")
    private val NO_CONTROL_CHARS = Regex("""^[^\p{Cc}]*$""")

    /**
     * The eight chips plus whatever somebody typed, deduplicated case-insensitively.
     *
     * Free entry is an ADDITION to the prototype: eight fixed chips is a picker only if your
     * dream trip happens to be on the list, and Screen-Inventory §2.1.11 calls this a tag
     * picker. Commas split, so it works without a separate "Add" interaction.
     */
    fun mergeDestinations(chosen: List<String>, typed: String): List<String> {
        val out = mutableListOf<String>()
        for (entry in chosen + typed.split(",")) {
            val value = entry.trim()
            if (value.isEmpty()) continue
            if (out.none { it.equals(value, ignoreCase = true) }) out.add(value)
        }
        return out
    }

    fun validateDestinations(values: List<String>): ValidationResult = when {
        values.size > Limits.DESTINATIONS ->
            ValidationResult.Invalid(Messages.DESTINATIONS_TOO_MANY)
        values.any { it.length > Limits.DESTINATION_LENGTH } ->
            ValidationResult.Invalid(Messages.DESTINATION_TOO_LONG)
        values.any { !NO_CONTROL_CHARS.matches(it) } ->
            ValidationResult.Invalid(Messages.INVALID_CHARS)
        else -> ValidationResult.Valid
    }

    /**
     * `none` cannot travel with a real answer, and cannot travel with a NOTE either.
     *
     * The second is the likelier contradiction: the vocabulary has no slug for an allergy, so
     * a real one arrives in the note. Ticking the reassuring chip and then typing the truth
     * underneath is the ordinary way somebody produces a row that tells a resort kitchen two
     * opposite things.
     */
    fun validateSentinelGroup(
        values: List<String>,
        note: String,
        aloneMessage: String,
        withNoteMessage: String,
    ): ValidationResult = when {
        values.contains(NONE) && values.size > 1 -> ValidationResult.Invalid(aloneMessage)
        values.contains(NONE) && note.isNotBlank() -> ValidationResult.Invalid(withNoteMessage)
        else -> ValidationResult.Valid
    }

    fun validateNotes(value: String, max: Int, message: String): ValidationResult =
        if (value.trim().length > max) ValidationResult.Invalid(message)
        else ValidationResult.Valid

    /** A row with neither half is the repeater's last blank line, not a mistake. */
    fun validateLoyalty(program: String, number: String): ValidationResult = when {
        program.isBlank() && number.isBlank() -> ValidationResult.Valid
        program.isBlank() -> ValidationResult.Invalid(Messages.LOYALTY_NEEDS_PROGRAM)
        program.trim().length > Limits.LOYALTY_PROGRAM ->
            ValidationResult.Invalid(Messages.LOYALTY_PROGRAM_TOO_LONG)
        number.isNotBlank() && !LOYALTY_NUMBER.matches(number.trim()) ->
            ValidationResult.Invalid(Messages.LOYALTY_NUMBER_SHAPE)
        else -> ValidationResult.Valid
    }

    /** More rows than the column will hold. The UI hides the add button; this is the rule. */
    fun validateLoyaltyCount(rows: Int): ValidationResult =
        if (rows > Limits.LOYALTY_ROWS) ValidationResult.Invalid(Messages.LOYALTY_TOO_MANY)
        else ValidationResult.Valid

    /**
     * Every value is one the CHECK constraint will accept.
     *
     * Today's chip UI cannot produce anything else, which is exactly why this is here rather
     * than only in the screen: the vocabularies are closed in the database
     * (20260904124903_travel_preference_vocabulary.sql), the web twin enforces them because
     * a form posts arbitrary strings, and the next thing to write to this table — an import,
     * a deep link, a restored draft — will not be a chip. A rule that lives only in the
     * widget is a rule that holds only as long as the widget is the only writer.
     */
    fun validateClosed(values: List<String>, options: List<Option>): ValidationResult {
        val allowed = options.map { it.value }.toSet() + NONE
        return if (values.all { it in allowed }) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.UNKNOWN_OPTION)
    }

    /** Blank is a legitimate answer — this step is skippable. A wrong slug is not. */
    fun validateBudget(value: String): ValidationResult = when {
        value.isBlank() -> ValidationResult.Valid
        BUDGET_BANDS.any { it.value == value } -> ValidationResult.Valid
        else -> ValidationResult.Invalid(Messages.BUDGET_UNKNOWN)
    }
}
