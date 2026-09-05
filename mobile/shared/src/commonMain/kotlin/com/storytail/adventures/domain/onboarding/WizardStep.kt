package com.storytail.adventures.domain.onboarding

/**
 * The six screens of the client onboarding wizard, in order.
 *
 * PARALLEL IMPLEMENTATION of web/lib/onboarding/steps.ts. Three things have to agree about
 * this list and they live in three places: the progress pill on this screen, the
 * `platform_user.onboarding_step` cursor that decides where an abandoned wizard resumes, and
 * `ONBOARDING_STEPS` in supabase/functions/_shared/onboarding.ts. The CHECK constraint in
 * 20260903230000_onboarding_step.sql is what refuses a typo.
 *
 * The cursor has five values and the wizard has six screens, which is not an off-by-one:
 * 2.1.9 Welcome is the cover page, so reaching it is the ABSENCE of progress and its slug is
 * null — the same null the column holds before anybody starts.
 */
enum class WizardStep(
    /** The `platform_user.onboarding_step` value, or null for the cover page. */
    val slug: String?,
    /** The short label the mobile pill shows; the desktop rail uses a longer one. */
    val pillLabel: String,
) {
    WELCOME(null, "Welcome"),
    PROFILE("profile", "Profile"),
    PREFERENCES("preferences", "Preferences"),
    COMPANIONS("companions", "Companions"),
    CONNECT("connect", "Existing trips"),
    COMPLETE("complete", "All set"),
    ;

    /** The step after this one, or null at the end. */
    val next: WizardStep? get() = entries.getOrNull(ordinal + 1)

    /** `STEP 02 OF 06` — zero-padded and 1-based, matching both artboards. */
    val overline: String
        get() = "STEP ${(ordinal + 1).pad()} OF ${entries.size.pad()}"

    companion object {
        fun ofSlug(slug: String?): WizardStep? = entries.firstOrNull { it.slug == slug }
    }
}

private fun Int.pad(): String = toString().padStart(2, '0')
