package com.storytail.adventures.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.ui.theme.PillShape

/**
 * The pieces BOTH thread screens draw: the traveler's (`client/ThreadScreen.kt`, 2.2.7 and
 * 2.6.2) and the advisor's (`agent/AgentThreadScreen.kt`, 3.10m.2).
 *
 * ONE COPY, because the artboards require it: `agent-messages-mobile.jsx` draws the advisor's
 * thread to the same shapes as M262, with the sides swapped, and says that if the two drift
 * visually the shared component never happens. These are the shapes; each screen decides only
 * which side is "mine".
 */

/** "Today" / "Yesterday" / "Oct 12", centred in a pill. */
@Composable
fun ChatDaySeparator(label: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, PillShape)
                .padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * One bubble. [mine] is the reader's own side: primary fill on the right, the tail corner on
 * that side. The other side is the outlined surface, tail on the left.
 */
@Composable
fun ChatBubble(body: String, mine: Boolean, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val shape = if (mine) {
        RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)
    } else {
        RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp)
    }
    Box(
        modifier
            .background(if (mine) scheme.primary else scheme.surfaceContainer, shape)
            .then(if (mine) Modifier else Modifier.border(1.dp, scheme.outlineVariant, shape))
            .padding(horizontal = 13.dp, vertical = 10.dp),
    ) {
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            fontSize = 14.sp,
            color = if (mine) scheme.onPrimary else scheme.onSurface,
        )
    }
}

/**
 * A dashed outline in [shape]: the internal note's mark (3.10m.2), on the sent note card and on
 * the box while a note is being written. Compose's `border` draws only solid strokes.
 */
fun Modifier.dashedBorder(
    color: androidx.compose.ui.graphics.Color,
    shape: androidx.compose.ui.graphics.Shape,
    width: androidx.compose.ui.unit.Dp = 1.5.dp,
): Modifier = this.drawWithContent {
    drawContent()
    val stroke = width.toPx()
    val outline = shape.createOutline(size, layoutDirection, this)
    val path = androidx.compose.ui.graphics.Path().apply { addOutline(outline) }
    drawPath(
        path = path,
        color = color,
        style = androidx.compose.ui.graphics.drawscope.Stroke(
            width = stroke,
            pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())),
        ),
    )
}
