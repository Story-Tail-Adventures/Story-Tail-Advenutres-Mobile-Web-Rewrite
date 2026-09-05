package com.storytail.adventures.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A check mark, drawn rather than imported.
 *
 * `androidx.compose.material.icons` is not on this module's classpath, and one glyph does
 * not justify the artifact — it ships every Material icon and this is the only one any
 * screen has wanted so far. Two line segments in a viewport-relative path cost nothing and
 * work identically on both platforms.
 *
 * Proportions follow the prototype's `Icon name="check"`: the short arm meets the long one
 * a little below centre, and the stroke is round-capped so it reads as drawn rather than
 * cut.
 */
@Composable
fun CheckMark(
    size: Dp,
    color: Color,
    modifier: Modifier = Modifier,
    strokeWidth: Dp = size / 6,
) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val path = Path().apply {
            moveTo(w * 0.22f, h * 0.53f)
            lineTo(w * 0.42f, h * 0.72f)
            lineTo(w * 0.78f, h * 0.30f)
        }
        drawPath(
            path = path,
            color = color,
            style = Stroke(
                width = strokeWidth.toPx(),
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    }
}
