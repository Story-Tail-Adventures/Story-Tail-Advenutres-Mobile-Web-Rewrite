package com.storytail.adventures.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The app's glyph set, drawn rather than imported.
 *
 * `androidx.compose.material.icons` is not on this module's classpath and a handful of
 * glyphs does not justify an artifact that ships every Material icon — the reasoning
 * [CheckMark] and §2.0's `FeatureGlyph` already recorded. This promotes that private set to
 * a shared one: PLANE, CARD and MESSAGE were drawn inside LandingScreen.kt, and §2.2's
 * bottom bar needs MESSAGE too, so leaving them there meant two copies of the same paths
 * with no reason to stay in step.
 *
 * Each is the prototype's icon (design/source-prototype/shared/icons.jsx) cut down to what
 * still reads at 16–20dp, expressed in a 0..1 viewport so it scales with [size].
 */
enum class StoryTailMark { PLANE, CARD, MESSAGE, HOME, SEARCH, USER }

@Composable
fun StoryTailGlyph(
    mark: StoryTailMark,
    size: Dp = 18.dp,
    color: Color = Color.Unspecified,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val outline = Stroke(
            width = w * 0.11f,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round,
        )

        when (mark) {
            // A paper plane: nose top-right, one wing, the crease, the tail.
            StoryTailMark.PLANE -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.94f, h * 0.08f)
                    lineTo(w * 0.06f, h * 0.46f)
                    lineTo(w * 0.42f, h * 0.58f)
                    lineTo(w * 0.56f, h * 0.94f)
                    close()
                },
                color = color,
            )

            StoryTailMark.CARD -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.06f, h * 0.18f),
                    size = Size(w * 0.88f, h * 0.64f),
                    cornerRadius = CornerRadius(w * 0.14f),
                    style = outline,
                )
                // The magnetic stripe, which is what separates a card from a rectangle.
                drawLine(
                    color = color,
                    start = Offset(w * 0.06f, h * 0.40f),
                    end = Offset(w * 0.94f, h * 0.40f),
                    strokeWidth = w * 0.11f,
                )
            }

            StoryTailMark.MESSAGE -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.08f, h * 0.12f),
                    size = Size(w * 0.84f, h * 0.58f),
                    cornerRadius = CornerRadius(w * 0.18f),
                    style = outline,
                )
                // The tail, which is what separates a bubble from a box.
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.30f, h * 0.66f)
                        lineTo(w * 0.30f, h * 0.94f)
                        lineTo(w * 0.54f, h * 0.66f)
                        close()
                    },
                    color = color,
                )
            }

            // A roof over a doorway. The prototype's `home` is a filled house; at 19dp a
            // filled shape reads as a blob, so this is the outline with the door left open.
            StoryTailMark.HOME -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.06f, h * 0.46f)
                        lineTo(w * 0.50f, h * 0.08f)
                        lineTo(w * 0.94f, h * 0.46f)
                    },
                    color = color,
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.18f, h * 0.42f)
                        lineTo(w * 0.18f, h * 0.92f)
                        lineTo(w * 0.82f, h * 0.92f)
                        lineTo(w * 0.82f, h * 0.42f)
                    },
                    color = color,
                    style = outline,
                )
            }

            // A lens and a handle.
            StoryTailMark.SEARCH -> {
                drawCircle(
                    color = color,
                    radius = w * 0.28f,
                    center = Offset(w * 0.44f, h * 0.44f),
                    style = outline,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.66f, h * 0.66f),
                    end = Offset(w * 0.92f, h * 0.92f),
                    strokeWidth = w * 0.11f,
                    cap = StrokeCap.Round,
                )
            }

            // A head and shoulders.
            StoryTailMark.USER -> {
                drawCircle(
                    color = color,
                    radius = w * 0.21f,
                    center = Offset(w * 0.50f, h * 0.30f),
                    style = outline,
                )
                drawArc(
                    color = color,
                    startAngle = 180f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w * 0.14f, h * 0.58f),
                    size = Size(w * 0.72f, h * 0.60f),
                    style = outline,
                )
            }
        }
    }
}
