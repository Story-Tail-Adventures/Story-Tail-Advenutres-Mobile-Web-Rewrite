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
enum class StoryTailMark {
    PLANE, CARD, MESSAGE, HOME, SEARCH, USER, PASSPORT, ARROW_LEFT, SUN, SHIP,

    // §2.5's fifteen. Every one is the prototype glyph
    // (design/source-prototype/shared/icons.jsx) cut down to what still reads at 16-20dp,
    // and each is used by the web build's matching screen — the two sets must not drift.
    //
    // There is no Material icon artifact on this classpath and adding one to ship a
    // settings list would be the trade CheckMark and FeatureGlyph already declined. That
    // does mean §2.5 could not start until these existed, which is why they landed first.
    HEART, BELL, SHIELD, LINK, LOCK, QUESTION, CHEVRON_RIGHT, CHEVRON_DOWN,
    CLOSE, DOWNLOAD, UPLOAD, WARNING, INFO, MORE_VERT, BRIEFCASE,
}

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

            // A booklet with lines on it — the prototype's `passport`.
            StoryTailMark.PASSPORT -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.18f, h * 0.06f),
                    size = Size(w * 0.64f, h * 0.88f),
                    cornerRadius = CornerRadius(w * 0.08f),
                    style = outline,
                )
                for (y in listOf(0.34f, 0.50f, 0.66f)) {
                    drawLine(
                        color = color,
                        start = Offset(w * 0.32f, h * y),
                        end = Offset(w * (if (y == 0.66f) 0.56f else 0.68f), h * y),
                        strokeWidth = w * 0.09f,
                        cap = StrokeCap.Round,
                    )
                }
            }

            // A disc with rays — the prototype's `sun`.
            StoryTailMark.SUN -> {
                drawCircle(
                    color = color,
                    radius = w * 0.22f,
                    center = Offset(w * 0.50f, h * 0.50f),
                    style = outline,
                )
                val rays = listOf(
                    0.50f to 0.04f, 0.50f to 0.96f, 0.04f to 0.50f, 0.96f to 0.50f,
                    0.17f to 0.17f, 0.83f to 0.83f, 0.17f to 0.83f, 0.83f to 0.17f,
                )
                for ((rx, ry) in rays) {
                    val dx = rx - 0.50f
                    val dy = ry - 0.50f
                    drawLine(
                        color = color,
                        start = Offset(w * (0.50f + dx * 0.62f), h * (0.50f + dy * 0.62f)),
                        end = Offset(w * rx, h * ry),
                        strokeWidth = w * 0.10f,
                        cap = StrokeCap.Round,
                    )
                }
            }

            // A hull and a mast — the prototype's `ship`, cut down.
            StoryTailMark.SHIP -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.10f, h * 0.62f)
                        lineTo(w * 0.90f, h * 0.62f)
                        lineTo(w * 0.74f, h * 0.90f)
                        lineTo(w * 0.26f, h * 0.90f)
                        close()
                    },
                    color = color,
                    style = outline,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.50f, h * 0.10f),
                    end = Offset(w * 0.50f, h * 0.60f),
                    strokeWidth = w * 0.10f,
                    cap = StrokeCap.Round,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.54f, h * 0.14f)
                        lineTo(w * 0.82f, h * 0.44f)
                        lineTo(w * 0.54f, h * 0.44f)
                        close()
                    },
                    color = color,
                )
            }

            StoryTailMark.ARROW_LEFT -> {
                drawLine(
                    color = color,
                    start = Offset(w * 0.88f, h * 0.50f),
                    end = Offset(w * 0.16f, h * 0.50f),
                    strokeWidth = w * 0.11f,
                    cap = StrokeCap.Round,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.44f, h * 0.20f)
                        lineTo(w * 0.14f, h * 0.50f)
                        lineTo(w * 0.44f, h * 0.80f)
                    },
                    color = color,
                    style = outline,
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

            // A pair of lobes meeting at a point — the prototype's `heart`.
            StoryTailMark.HEART -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.50f, h * 0.88f)
                    cubicTo(w * 0.08f, h * 0.60f, w * 0.10f, h * 0.20f, w * 0.32f, h * 0.20f)
                    cubicTo(w * 0.44f, h * 0.20f, w * 0.50f, h * 0.32f, w * 0.50f, h * 0.36f)
                    cubicTo(w * 0.50f, h * 0.32f, w * 0.56f, h * 0.20f, w * 0.68f, h * 0.20f)
                    cubicTo(w * 0.90f, h * 0.20f, w * 0.92f, h * 0.60f, w * 0.50f, h * 0.88f)
                    close()
                },
                color = color,
                style = outline,
            )

            // A dome, a lip, and the clapper below it.
            StoryTailMark.BELL -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.20f, h * 0.68f)
                        lineTo(w * 0.20f, h * 0.44f)
                        cubicTo(w * 0.20f, h * 0.20f, w * 0.36f, h * 0.10f, w * 0.50f, h * 0.10f)
                        cubicTo(w * 0.64f, h * 0.10f, w * 0.80f, h * 0.20f, w * 0.80f, h * 0.44f)
                        lineTo(w * 0.80f, h * 0.68f)
                        close()
                    },
                    color = color,
                    style = outline,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.10f, h * 0.70f),
                    end = Offset(w * 0.90f, h * 0.70f),
                    strokeWidth = w * 0.10f,
                    cap = StrokeCap.Round,
                )
                drawArc(
                    color = color,
                    startAngle = 0f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w * 0.40f, h * 0.72f),
                    size = Size(w * 0.20f, h * 0.16f),
                    style = outline,
                )
            }

            // A crest: flat shoulders, tapering to a point.
            StoryTailMark.SHIELD -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.50f, h * 0.08f)
                    lineTo(w * 0.14f, h * 0.24f)
                    lineTo(w * 0.14f, h * 0.52f)
                    cubicTo(w * 0.14f, h * 0.76f, w * 0.32f, h * 0.88f, w * 0.50f, h * 0.94f)
                    cubicTo(w * 0.68f, h * 0.88f, w * 0.86f, h * 0.76f, w * 0.86f, h * 0.52f)
                    lineTo(w * 0.86f, h * 0.24f)
                    close()
                },
                color = color,
                style = outline,
            )

            // Two interlocking arcs — a chain link, on the diagonal.
            StoryTailMark.LINK -> {
                drawArc(
                    color = color,
                    startAngle = 135f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w * 0.06f, h * 0.06f),
                    size = Size(w * 0.56f, h * 0.56f),
                    style = outline,
                )
                drawArc(
                    color = color,
                    startAngle = -45f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w * 0.38f, h * 0.38f),
                    size = Size(w * 0.56f, h * 0.56f),
                    style = outline,
                )
            }

            // A padlock: shackle above, body below.
            StoryTailMark.LOCK -> {
                drawArc(
                    color = color,
                    startAngle = 180f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w * 0.28f, h * 0.10f),
                    size = Size(w * 0.44f, h * 0.44f),
                    style = outline,
                )
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.16f, h * 0.44f),
                    size = Size(w * 0.68f, h * 0.46f),
                    cornerRadius = CornerRadius(w * 0.10f),
                    style = outline,
                )
            }

            // A question mark: the hook, and the dot.
            StoryTailMark.QUESTION -> {
                drawArc(
                    color = color,
                    startAngle = 160f,
                    sweepAngle = 230f,
                    useCenter = false,
                    topLeft = Offset(w * 0.28f, h * 0.10f),
                    size = Size(w * 0.44f, h * 0.44f),
                    style = outline,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.50f, h * 0.52f),
                    end = Offset(w * 0.50f, h * 0.66f),
                    strokeWidth = w * 0.11f,
                    cap = StrokeCap.Round,
                )
                drawCircle(color = color, radius = w * 0.06f, center = Offset(w * 0.50f, h * 0.86f))
            }

            // The disclosure chevron every settings row ends in.
            StoryTailMark.CHEVRON_RIGHT -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.38f, h * 0.20f)
                    lineTo(w * 0.66f, h * 0.50f)
                    lineTo(w * 0.38f, h * 0.80f)
                },
                color = color,
                style = outline,
            )

            StoryTailMark.CHEVRON_DOWN -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.20f, h * 0.38f)
                    lineTo(w * 0.50f, h * 0.66f)
                    lineTo(w * 0.80f, h * 0.38f)
                },
                color = color,
                style = outline,
            )

            StoryTailMark.CLOSE -> {
                drawLine(
                    color = color,
                    start = Offset(w * 0.22f, h * 0.22f),
                    end = Offset(w * 0.78f, h * 0.78f),
                    strokeWidth = w * 0.11f,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.78f, h * 0.22f),
                    end = Offset(w * 0.22f, h * 0.78f),
                    strokeWidth = w * 0.11f,
                    cap = StrokeCap.Round,
                )
            }

            // A tray with an arrow into it.
            StoryTailMark.DOWNLOAD -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.50f, h * 0.10f)
                        lineTo(w * 0.50f, h * 0.62f)
                    },
                    color = color,
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.28f, h * 0.42f)
                        lineTo(w * 0.50f, h * 0.64f)
                        lineTo(w * 0.72f, h * 0.42f)
                    },
                    color = color,
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.14f, h * 0.78f)
                        lineTo(w * 0.14f, h * 0.90f)
                        lineTo(w * 0.86f, h * 0.90f)
                        lineTo(w * 0.86f, h * 0.78f)
                    },
                    color = color,
                    style = outline,
                )
            }

            // DOWNLOAD's arrow, reversed.
            StoryTailMark.UPLOAD -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.50f, h * 0.64f)
                        lineTo(w * 0.50f, h * 0.12f)
                    },
                    color = color,
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.28f, h * 0.32f)
                        lineTo(w * 0.50f, h * 0.10f)
                        lineTo(w * 0.72f, h * 0.32f)
                    },
                    color = color,
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.14f, h * 0.78f)
                        lineTo(w * 0.14f, h * 0.90f)
                        lineTo(w * 0.86f, h * 0.90f)
                        lineTo(w * 0.86f, h * 0.78f)
                    },
                    color = color,
                    style = outline,
                )
            }

            // A triangle with a bang in it.
            StoryTailMark.WARNING -> {
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.50f, h * 0.10f)
                        lineTo(w * 0.94f, h * 0.86f)
                        lineTo(w * 0.06f, h * 0.86f)
                        close()
                    },
                    color = color,
                    style = outline,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.50f, h * 0.42f),
                    end = Offset(w * 0.50f, h * 0.62f),
                    strokeWidth = w * 0.10f,
                    cap = StrokeCap.Round,
                )
                drawCircle(color = color, radius = w * 0.055f, center = Offset(w * 0.50f, h * 0.74f))
            }

            // WARNING's sibling, inverted: a ring with an i in it.
            StoryTailMark.INFO -> {
                drawCircle(
                    color = color,
                    radius = w * 0.40f,
                    center = Offset(w * 0.50f, h * 0.50f),
                    style = outline,
                )
                drawCircle(color = color, radius = w * 0.055f, center = Offset(w * 0.50f, h * 0.28f))
                drawLine(
                    color = color,
                    start = Offset(w * 0.50f, h * 0.44f),
                    end = Offset(w * 0.50f, h * 0.72f),
                    strokeWidth = w * 0.10f,
                    cap = StrokeCap.Round,
                )
            }

            StoryTailMark.MORE_VERT -> {
                for (y in listOf(0.20f, 0.50f, 0.80f)) {
                    drawCircle(color = color, radius = w * 0.075f, center = Offset(w * 0.50f, h * y))
                }
            }

            // A case with a handle — 2.5.7's laptop-shaped session row.
            StoryTailMark.BRIEFCASE -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.08f, h * 0.32f),
                    size = Size(w * 0.84f, h * 0.54f),
                    cornerRadius = CornerRadius(w * 0.10f),
                    style = outline,
                )
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.34f, h * 0.32f)
                        lineTo(w * 0.34f, h * 0.16f)
                        lineTo(w * 0.66f, h * 0.16f)
                        lineTo(w * 0.66f, h * 0.32f)
                    },
                    color = color,
                    style = outline,
                )
            }
        }
    }
}
