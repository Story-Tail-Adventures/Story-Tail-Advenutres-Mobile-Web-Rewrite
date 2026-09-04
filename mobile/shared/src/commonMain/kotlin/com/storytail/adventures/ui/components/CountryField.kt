package com.storytail.adventures.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.Countries

/**
 * A country picker that stores the alpha-2 code and shows the name.
 *
 * `address.country` and `travel_document.issuing_country` are `char(2)`, so 'US' is what is
 * stored and "United States" is what is read — the prototype's 'USA' would not fit the
 * column. The whole ISO list rather than a curated one: a client living in Toronto or issued
 * a British passport is an ordinary case, and a short list is a promise somebody eventually
 * falls outside of.
 */
@Composable
fun CountryField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    enabled: Boolean = true,
    placeholder: String = "Pick a country",
) {
    var expanded by remember { mutableStateOf(false) }
    val name = Countries.nameOf(value)

    Column(modifier) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().heightIn(min = AuthTapTarget),
        ) {
            Text(name ?: placeholder, modifier = Modifier.fillMaxWidth())
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            // Capped, or the menu is 249 rows tall and covers the form it belongs to.
            modifier = Modifier.heightIn(max = 320.dp),
        ) {
            Countries.ALL.forEach { country ->
                DropdownMenuItem(
                    text = { Text(country.name) },
                    onClick = {
                        onValueChange(country.code)
                        expanded = false
                    },
                )
            }
        }
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
