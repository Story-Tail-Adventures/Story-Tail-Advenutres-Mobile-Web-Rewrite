package com.storytail.adventures.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The six-cell code entry from `M217_MFAChallenge`.
 *
 * ONE REAL FIELD BEHIND SIX DRAWN BOXES, rather than six separate inputs. Six fields is the
 * obvious reading of the artboard and the wrong build: focus has to be shuffled between them
 * on every keystroke and every backspace, paste puts all six digits in the first one, and
 * the platform's own "from Messages" code autofill — which needs a single field with a
 * content type — stops working. The boxes are decoration over an invisible field that owns
 * the whole value.
 */
@Composable
fun CodeInput(
    value: String,
    onValueChange: (String) -> Unit,
    length: Int,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
    onSubmit: () -> Unit = {},
) {
    Box(modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(length) { index ->
            val filled = index < value.length
            val isNext = index == value.length
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .width(44.dp)
                    .height(56.dp)
                    .background(
                        MaterialTheme.colorScheme.surface,
                        RoundedCornerShape(10.dp),
                    )
                    .border(
                        width = if (isNext) 2.dp else 1.dp,
                        color = when {
                            isError -> MaterialTheme.colorScheme.error
                            isNext -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.outline
                        },
                        shape = RoundedCornerShape(10.dp),
                    ),
            ) {
                Text(
                    text = if (filled) value[index].toString() else "",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        }

        // ON TOP of the cells, transparent and the full size of them, so a tap anywhere in
        // the row lands on the real field. Behind them it would be untappable, and the only
        // way to focus a code entry would be the keyboard already being open.
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            cursorBrush = SolidColor(Color.Transparent),
            textStyle = TextStyle(color = Color.Transparent),
            modifier = Modifier
                .matchParentSize()
                // The platform's "from Messages" one-time-code fill needs a single field
                // with this content type — six separate inputs would lose it.
                .semantics { contentType = ContentType.SmsOtpCode },
        )
    }
}
