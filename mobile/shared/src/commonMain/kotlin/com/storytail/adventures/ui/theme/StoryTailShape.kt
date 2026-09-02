package com.storytail.adventures.ui.theme

import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.unit.dp

/**
 * Story-Tail Adventures shape scale.
 * Mirrors design/source-prototype/styles/tokens.css :root --r-* variables.
 */

object StoryTailRadius {
    val xs   = 6.dp
    val sm   = 10.dp
    val md   = 14.dp
    val lg   = 20.dp
    val xl   = 28.dp
    val full = 999.dp
}

/**
 * Material 3 Shapes mapped to Story-Tail's scale.
 *
 * Material's "extraSmall → extraLarge" ramp is roughly:
 *   extraSmall = inputs       → xs
 *   small      = chips        → sm
 *   medium     = FABs         → md
 *   large      = cards        → lg
 *   extraLarge = hero / modal → xl
 */
val StoryTailShapes = Shapes(
    extraSmall = RoundedCornerShape(StoryTailRadius.xs),
    small      = RoundedCornerShape(StoryTailRadius.sm),
    medium     = RoundedCornerShape(StoryTailRadius.md),
    large      = RoundedCornerShape(StoryTailRadius.lg),
    extraLarge = RoundedCornerShape(StoryTailRadius.xl),
)

/**
 * Pill shape (used for buttons, chips, avatars). Exposed separately
 * because Material 3's Shapes API only ships 5 tiers and we use 6.
 */
val PillShape = RoundedCornerShape(StoryTailRadius.full)

/**
 * Story-Tail elevation tokens (M3 tiers 1–4).
 * Compose exposes elevation via Modifier.shadow(elevation = ..., shape = ...)
 * rather than a Color, so these are dp values to feed into Modifier.shadow.
 * The actual shadow color differs by theme — see StoryTailColors for the
 * scrim equivalent.
 */
object StoryTailElevation {
    val level0 = 0.dp
    val level1 = 1.dp
    val level2 = 3.dp
    val level3 = 6.dp
    val level4 = 12.dp
}
