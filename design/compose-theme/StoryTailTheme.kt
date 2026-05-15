package com.storytail.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * Top-level Story-Tail Adventures theme.
 *
 * Wrap every screen in this composable. It provides:
 *   - The Material 3 ColorScheme (light or dark) wired to brand tokens.
 *   - StoryTailTypography (Poppins-based) as Material's Typography.
 *   - StoryTailShapes (6, 10, 14, 20, 28, 999dp) as Material's Shapes.
 *   - StoryTailStatusColors via CompositionLocal — for chip statuses.
 *   - StoryTailExtendedColors via CompositionLocal — for surface tiers,
 *     success/warning, tropical gradient stops.
 *   - StoryTailBrandTypography via CompositionLocal — for the wordmark.
 *
 * Usage:
 *
 *   StoryTailTheme {
 *       App()
 *   }
 *
 * The theme follows the OS dark/light setting by default. To force a
 * scheme regardless of the OS, pass `useDarkTheme = true|false` explicitly.
 */
@Composable
fun StoryTailTheme(
    useDarkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (useDarkTheme) DarkStoryTailColorScheme else LightStoryTailColorScheme
    val statusColors = if (useDarkTheme) DarkStoryTailStatusColors else LightStoryTailStatusColors
    val extendedColors = if (useDarkTheme) DarkStoryTailExtended else LightStoryTailExtended

    CompositionLocalProvider(
        LocalStoryTailStatusColors    provides statusColors,
        LocalStoryTailExtended        provides extendedColors,
        LocalStoryTailBrandTypography provides DefaultStoryTailBrandTypography,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography  = StoryTailTypography,
            shapes      = StoryTailShapes,
            content     = content,
        )
    }
}

/**
 * Canonical access pattern for Story-Tail design tokens inside @Composable
 * functions. The CompositionLocals are populated by StoryTailTheme above.
 *
 *   @Composable fun BookedChip() {
 *       val s = LocalStoryTailStatusColors.current
 *       Chip(background = s.bookedBg, foreground = s.bookedFg, text = "Booked")
 *   }
 *
 *   @Composable fun HeroCard() {
 *       val x = LocalStoryTailExtended.current
 *       Box(modifier = Modifier.background(x.surface3)) { ... }
 *   }
 *
 *   @Composable fun BrandWordmark() {
 *       val brand = LocalStoryTailBrandTypography.current
 *       Text("Story-Tail", style = brand.script)
 *   }
 *
 * Standard Material 3 tokens (primary, surface, etc.) come from
 * MaterialTheme.colorScheme and MaterialTheme.typography as usual.
 */
