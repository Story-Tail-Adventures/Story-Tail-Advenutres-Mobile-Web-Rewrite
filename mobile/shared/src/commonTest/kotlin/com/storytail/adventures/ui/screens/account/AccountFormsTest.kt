package com.storytail.adventures.ui.screens.account

import com.storytail.adventures.api.AccountPreferences
import com.storytail.adventures.api.AccountProfile
import com.storytail.adventures.domain.validation.LoyaltyRow
import com.storytail.adventures.ui.screens.onboarding.PreferencesForm
import com.storytail.adventures.ui.screens.onboarding.PreferencesSubmission
import com.storytail.adventures.ui.screens.onboarding.ProfileForm
import com.storytail.adventures.ui.screens.onboarding.ProfileSubmission
import com.storytail.adventures.ui.screens.onboarding.validatePreferencesForm
import com.storytail.adventures.ui.screens.onboarding.validateProfileForm
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * What Screens 2.5.2 and 2.5.3 must not get wrong.
 *
 * These are not tests of the rules — `ProfileValidationTest` and `PreferencesValidationTest`
 * cover those. They pin the two hazards that only exist BECAUSE the account screens reuse the
 * wizard's write path: a prefill that loses a column, and a save that moves the onboarding
 * cursor.
 */
class AccountFormsTest {

    private val today = "2026-09-10"

    private fun bodyOf(form: ProfileForm): JsonObject {
        val result = validateProfileForm(form, today)
        assertIs<ProfileSubmission.Valid>(result)
        return result.body
    }

    @Test
    fun `an empty passport clears the record, which is why 2_5_2 must prefill it`() {
        // THE HAZARD, stated as a test. `onboarding-profile` reads `passport: null` as
        // "archive the travel_document row", and this body always carries the key. So a
        // screen that opened with the expiry and country blank would destroy a traveler's
        // passport on a save that only changed their phone number.
        val body = bodyOf(ProfileForm(phone = "3055550184"))
        assertEquals(JsonNull, body["passport"])
    }

    @Test
    fun `a prefilled passport round-trips through the body unchanged`() {
        // The other half of the same hazard: the prefill has to reach the payload, or the
        // read was decoration. `AccountProfileViewModel` builds this form from
        // `AccountRepository.profile()`, so this is the shape that must survive.
        val saved = AccountProfile(passportExpiry = "2031-04-22", passportCountry = "us")
        val body = bodyOf(
            ProfileForm(
                passportExpiry = saved.passportExpiry,
                passportCountry = saved.passportCountry,
            ),
        )
        val passport = body.getValue("passport").jsonObject
        assertEquals("2031-04-22", passport.getValue("expiresOn").jsonPrimitive.content)
        // Upper-cased on the way out: `travel_document.issuing_country` is char(2).
        assertEquals("US", passport.getValue("issuingCountry").jsonPrimitive.content)
    }

    @Test
    fun `an expiry with no country still writes a passport row`() {
        // The expiry alone is what drives the renewal reminder, which is the part travelers
        // feel. Requiring both would silently drop it.
        val body = bodyOf(ProfileForm(passportExpiry = "2031-04-22"))
        val passport = body.getValue("passport").jsonObject
        assertEquals(JsonNull, passport["issuingCountry"])
    }

    @Test
    fun `no submission ever carries the advance flag`() {
        // `advance` is what moves the onboarding cursor. The wizard's base view model adds
        // it at save time; these bodies must not, or editing a phone number from the account
        // screen would put the wizard back in front of somebody who finished it.
        assertTrue("advance" !in bodyOf(ProfileForm(phone = "3055550184")))

        val prefs = validatePreferencesForm(PreferencesForm(budgetBand = ""))
        assertIs<PreferencesSubmission.Valid>(prefs)
        assertTrue("advance" !in prefs.body)
    }

    @Test
    fun `the profile body always carries every key`() {
        // The function reads an ABSENT key as "leave it alone" and an explicit null as
        // "clear it". Both screens show all of these at once, so a field left empty is
        // somebody saying they do not have one.
        val body = bodyOf(ProfileForm())
        assertEquals(
            setOf("phone", "dateOfBirth", "address", "emergencyContact", "passport"),
            body.keys,
        )
    }

    @Test
    fun `a saved loyalty row survives the prefill and the save`() {
        // A blank member number persists as null and reads back as "". If the round trip
        // dropped the row, the next save would delete the program — the column is replaced
        // wholesale.
        val saved = AccountPreferences(loyalty = listOf(LoyaltyRow("AAdvantage", "")))
        val result = validatePreferencesForm(PreferencesForm(loyalty = saved.loyalty))
        assertIs<PreferencesSubmission.Valid>(result)

        val loyalty = result.body.getValue("loyalty")
        assertEquals(1, (loyalty as kotlinx.serialization.json.JsonArray).size)
        assertEquals(
            "AAdvantage",
            loyalty[0].jsonObject.getValue("program").jsonPrimitive.content,
        )
    }

    @Test
    fun `an untouched repeater slot is not written`() {
        // The default form carries two empty rows so "add another" is not the first step.
        // Neither may reach the payload.
        val result = validatePreferencesForm(PreferencesForm())
        assertIs<PreferencesSubmission.Valid>(result)
        assertEquals(
            0,
            (result.body.getValue("loyalty") as kotlinx.serialization.json.JsonArray).size,
        )
    }

    @Test
    fun `the help FAQ answers the fee question exactly once and hides section 2_4`() {
        val faqs = helpFaqs()
        val fee = faqs.count { it.q.contains("planning fee", ignoreCase = true) }
        assertEquals(1, fee, faqs.joinToString("\n") { it.q })

        // An FAQ that explains an unreachable screen is worse than no FAQ. The filter reads
        // the ANSWER too: two entries mention card authorization only there.
        val cards = Regex("""\bcards?\b|authoriz""", RegexOption.IGNORE_CASE)
        faqs.forEach { item ->
            assertTrue(!cards.containsMatchIn("${item.q} ${item.a}"), item.q)
        }
        assertTrue(faqs.isNotEmpty())
    }
}
