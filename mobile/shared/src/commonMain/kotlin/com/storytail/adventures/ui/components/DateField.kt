package com.storytail.adventures.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.datetime.LocalDate

/**
 * A date field that opens the platform picker, and still accepts typing.
 *
 * BOTH, deliberately. A picker is the right control for "when is your passport up?" — nobody
 * should be spelling out a hyphenated format on a phone keyboard — but a picker alone is a
 * long scroll for a date of birth forty years back, and it is unusable with a screen reader
 * on some platforms. So the text field is real and editable, and tapping the button beside it
 * opens the calendar. Whichever route is taken, the value stored is ISO `YYYY-MM-DD`, which
 * is what the `date` columns want and what the Edge Function validates.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    supportingText: String? = null,
    enabled: Boolean = true,
    pickerTitle: String = label,
) {
    var showPicker by remember { mutableStateOf(false) }

    Box(modifier) {
        AuthTextField(
            label = label,
            value = value,
            onValueChange = onValueChange,
            error = error,
            supportingText = supportingText,
            enabled = enabled,
            keyboardType = KeyboardType.Number,
            modifier = Modifier.fillMaxWidth(),
            labelAction = {
                // A TextButton rather than a clickable Text: the bare version announced
                // itself to TalkBack as a label, not a button, and its tap target was the
                // height of the two words. `AuthTapTarget` is the same minimum CountryField
                // gives its own opener.
                TextButton(
                    onClick = { showPicker = true },
                    enabled = enabled,
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    modifier = Modifier.heightIn(min = AuthTapTarget),
                ) {
                    Text(
                        text = PICK,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            },
        )
    }

    if (showPicker) {
        val state = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.selectedDateMillis?.let { onValueChange(isoDate(it)) }
                        showPicker = false
                    },
                ) { Text(CONFIRM) }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text(CANCEL) }
            },
        ) {
            DatePicker(state = state, title = { Text(pickerTitle) })
        }
    }
}

private const val PICK = "Pick a date"
private const val CONFIRM = "Use this date"
private const val CANCEL = "Cancel"

/**
 * Epoch milliseconds to `YYYY-MM-DD`, in UTC.
 *
 * UTC because the picker returns a UTC midnight and these are date-only columns: converting
 * through a westward local zone would store yesterday.
 *
 * THIS WAS HAND-ROLLED ARITHMETIC AND IT WAS WRONG BELOW 1970. The loop that walked years
 * forward from the epoch broke on its first iteration whenever the day count was negative,
 * so every date before 1970-01-01 came out as a January 1970 day with a negative number in
 * it. On a date-of-birth field that is not an edge case — it is everybody over about
 * fifty-six, and `ProfileValidation` deliberately accepts birth dates back to 1900.
 *
 * `LocalDate.fromEpochDays` is proleptic-Gregorian and correct in both directions.
 * kotlinx-datetime is already a dependency and `todayIsoUtc()` already reads civil dates
 * out of it; the arithmetic was never buying anything.
 */
internal fun isoDate(millis: Long): String {
    // Floor division: -1ms is the day BEFORE the epoch, and truncating toward zero would
    // call it the epoch day itself.
    val days = floorDiv(millis, MILLIS_PER_DAY)
    val date = LocalDate.fromEpochDays(days.toInt())
    return "${date.year}-${date.monthNumber.pad()}-${date.dayOfMonth.pad()}"
}

private const val MILLIS_PER_DAY = 86_400_000L

private fun floorDiv(value: Long, divisor: Long): Long {
    val quotient = value / divisor
    return if (value % divisor != 0L && (value xor divisor) < 0) quotient - 1 else quotient
}

private fun Int.pad(): String = toString().padStart(2, '0')
