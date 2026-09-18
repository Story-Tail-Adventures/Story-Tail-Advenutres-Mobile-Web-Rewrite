package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.Countries
import com.storytail.adventures.domain.validation.ProfileValidation
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.CountryField
import com.storytail.adventures.ui.components.DateField
import com.storytail.adventures.ui.components.FormWarningCard

/**
 * THE PROTOTYPE'S SINGLE "Mailing address" INPUT IS SIX STRUCTURED FIELDS.
 *
 * There is no free-text address column anywhere: `client.mailing_address_id` is a FK to
 * `address`, whose `line1`, `city` and `country` are NOT NULL and whose country is `char(2)`.
 * Persisting one string means parsing it, and an address parser fails the first time somebody
 * types an apartment number.
 *
 * There is also no passport-number field — see ProfileViewModel — and the emergency
 * contact's relationship is its own value rather than a parenthetical crammed into the name,
 * which is what the artboard's "Sam Hayes (spouse)" would store forever.
 */
internal object ProfileCopy {
    const val TITLE = "A few quick details"
    const val SUB =
        "So I can plan with all the right info on hand. You can edit any of this later."
    const val OPTIONAL = "Nothing here is required — fill in what you know and skip the rest."
    const val PHONE = "Phone"
    const val PHONE_HINT =
        "So I can reach you if a flight moves. US numbers unless you add a country code."
    const val DOB = "Date of birth"
    const val DOB_HINT =
        "Airlines and resorts ask for this at booking — having it saves us an email later."
    const val ADDRESS = "Mailing address"
    const val LINE1 = "Street address"
    const val LINE2 = "Apt, suite, etc."
    const val CITY = "City"
    const val REGION_US = "State"
    const val REGION = "Region"
    const val POSTAL_US = "ZIP code"
    const val POSTAL = "Postal code"
    const val COUNTRY = "Country"
    const val EMERGENCY = "Emergency contact"
    const val EMERGENCY_HINT =
        "One person we'd call if something happened while you're away. It goes on your " +
            "itinerary and nowhere else."
    const val EMERGENCY_NAME = "Name"
    const val EMERGENCY_PHONE = "Phone"
    const val EMERGENCY_RELATIONSHIP = "Relationship"
    const val PASSPORT = "Passport"
    const val PASSPORT_OPTIONAL =
        "Optional, but worth adding if there's any chance of international travel"
    const val PASSPORT_HINT =
        "I use the expiry date to warn you long before it's a problem. The number itself " +
            "isn't collected here yet."
    const val EXPIRES = "Expires"
    const val PASSPORT_EXPIRED =
        "That passport has expired. It's saved either way — worth starting the renewal " +
            "before we book anything international."
    const val ISSUING = "Country of issue"
    const val PRIMARY = "Save & continue"
    const val PENDING = "Saving…"
    const val SKIP = "Skip for now"
}

/**
 * The thirteen inputs, without any chrome around them.
 *
 * SHARED BY 2.1.10 AND 2.5.2, which is why it is a function rather than the body of a screen:
 * the Screen Inventory note at 2.5.2 asks for 2.1.10's form rather than a second one, and the
 * web twin obeys it by importing the same `ProfileForm` component into both routes. The two
 * differ only in their chrome — a wizard step with Skip, or an account screen with Save and
 * Cancel — and in whether the save carries `advance`.
 *
 * EMITS SIBLINGS, with no wrapper Column. The caller owns the spacing, because the wizard's
 * scaffold already sets it and a Column here would nest one rhythm inside another.
 */
@Composable
fun ProfileFields(
    form: ProfileForm,
    onChange: ((ProfileForm) -> ProfileForm) -> Unit,
    busy: Boolean,
    /** Today in UTC, hoisted so the expired-passport warning is testable. */
    today: String,
) {
    val usLabels = Countries.usesUsAddressLabels(form.addressCountry)

    Text(
        text = ProfileCopy.OPTIONAL,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    AuthTextField(
        label = ProfileCopy.PHONE,
        value = form.phone,
        onValueChange = { v -> onChange { it.copy(phone = v) } },
        error = form.phoneError,
        supportingText = ProfileCopy.PHONE_HINT,
        enabled = !busy,
        keyboardType = KeyboardType.Phone,
    )
    DateField(
        label = ProfileCopy.DOB,
        value = form.dateOfBirth,
        onValueChange = { v -> onChange { it.copy(dateOfBirth = v) } },
        error = form.dateOfBirthError,
        supportingText = ProfileCopy.DOB_HINT,
        enabled = !busy,
    )

    ProfileFieldGroup(ProfileCopy.ADDRESS, error = form.addressError) {
        AuthTextField(
            label = ProfileCopy.LINE1,
            value = form.addressLine1,
            onValueChange = { v -> onChange { it.copy(addressLine1 = v) } },
            enabled = !busy,
        )
        AuthTextField(
            label = ProfileCopy.LINE2,
            value = form.addressLine2,
            onValueChange = { v -> onChange { it.copy(addressLine2 = v) } },
            enabled = !busy,
        )
        AuthTextField(
            label = ProfileCopy.CITY,
            value = form.addressCity,
            onValueChange = { v -> onChange { it.copy(addressCity = v) } },
            enabled = !busy,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AuthTextField(
                // The label follows the country: a Canadian typing their postal code
                // into a box labelled ZIP is being told the form was not built for them.
                label = if (usLabels) ProfileCopy.REGION_US else ProfileCopy.REGION,
                value = form.addressRegion,
                onValueChange = { v -> onChange { it.copy(addressRegion = v) } },
                enabled = !busy,
                modifier = Modifier.weight(1f),
            )
            AuthTextField(
                label = if (usLabels) ProfileCopy.POSTAL_US else ProfileCopy.POSTAL,
                value = form.addressPostalCode,
                onValueChange = { v -> onChange { it.copy(addressPostalCode = v) } },
                error = form.addressPostalCodeError,
                enabled = !busy,
                modifier = Modifier.weight(1f),
            )
        }
        CountryField(
            label = ProfileCopy.COUNTRY,
            value = form.addressCountry,
            onValueChange = { v -> onChange { it.copy(addressCountry = v) } },
            error = form.addressCountryError,
            enabled = !busy,
        )
    }

    ProfileFieldGroup(
        ProfileCopy.EMERGENCY,
        hint = ProfileCopy.EMERGENCY_HINT,
        error = form.emergencyError,
    ) {
        AuthTextField(
            label = ProfileCopy.EMERGENCY_NAME,
            value = form.emergencyName,
            onValueChange = { v -> onChange { it.copy(emergencyName = v) } },
            enabled = !busy,
        )
        AuthTextField(
            label = ProfileCopy.EMERGENCY_PHONE,
            value = form.emergencyPhone,
            onValueChange = { v -> onChange { it.copy(emergencyPhone = v) } },
            error = form.emergencyPhoneError,
            enabled = !busy,
            keyboardType = KeyboardType.Phone,
        )
        AuthTextField(
            label = ProfileCopy.EMERGENCY_RELATIONSHIP,
            value = form.emergencyRelationship,
            onValueChange = { v -> onChange { it.copy(emergencyRelationship = v) } },
            enabled = !busy,
        )
    }

    ProfileFieldGroup(
        ProfileCopy.PASSPORT,
        note = ProfileCopy.PASSPORT_OPTIONAL,
        hint = ProfileCopy.PASSPORT_HINT,
        error = form.passportError,
    ) {
        // Live, because the useful moment for this is while somebody is looking at the
        // date they just typed. It never blocks the save — an expired passport is
        // exactly the record we want on file, since it is what makes the renewal
        // reminder fire.
        if (ProfileValidation.hasExpired(form.passportExpiry, today)) {
            FormWarningCard(message = ProfileCopy.PASSPORT_EXPIRED)
        }
        DateField(
            label = ProfileCopy.EXPIRES,
            value = form.passportExpiry,
            onValueChange = { v -> onChange { it.copy(passportExpiry = v) } },
            error = form.passportExpiryError,
            enabled = !busy,
        )
        CountryField(
            label = ProfileCopy.ISSUING,
            value = form.passportCountry,
            onValueChange = { v -> onChange { it.copy(passportCountry = v) } },
            error = form.passportCountryError,
            enabled = !busy,
        )
    }
}

/**
 * One of the three groups.
 *
 * The group error sits under the heading rather than on an input, because it is about the
 * SET: marking the city box red when the real problem is "this address has no country"
 * points at the wrong thing.
 */
@Composable
private fun ProfileFieldGroup(
    legend: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    hint: String? = null,
    error: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = legend,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            // Web's Group carries the same two slots for the same reason: "optional" is a
            // statement about the group, and the hint is about how the field gets used.
            // Collapsing them loses the permission to skip it.
            if (note != null) {
                Text(
                    text = note,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (hint != null) {
                Text(
                    text = hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (error != null) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        content()
    }
}
