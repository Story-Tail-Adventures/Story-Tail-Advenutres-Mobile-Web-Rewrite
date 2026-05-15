package com.storytail.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.em

/**
 * Story-Tail Adventures typography.
 *
 * Three families:
 *   - Poppins (primary sans, weights 300–800)
 *   - Caveat  (script — Story-Tail wordmark only)
 *   - JetBrains Mono (confirmation numbers, kbd)
 *
 * Font resources should be added to commonMain/composeResources/font/
 * before this file compiles. Replace `FontFamily.Default` below with the
 * actual `FontFamily(Font(resource = ...))` declarations when ready.
 */

// TODO: replace with actual composeResources-backed FontFamily when fonts are added.
val PoppinsFamily: FontFamily = FontFamily.Default
val CaveatFamily:  FontFamily = FontFamily.Default
val MonoFamily:    FontFamily = FontFamily.Monospace

/**
 * Story-Tail script TextStyle for the "Story-Tail" wordmark.
 * Not part of Material 3 Typography (it's only used by the brand mark),
 * but exposed here so the BrandMark component can pick it up.
 */
@Immutable
data class StoryTailBrandTypography(
    val script: TextStyle,  // Caveat 700 32sp
    val mono:   TextStyle,  // JetBrains Mono 400 12sp
    val labelXS: TextStyle, // Poppins 600 11sp 0.6 letter-spacing UPPERCASE
)

val DefaultStoryTailBrandTypography = StoryTailBrandTypography(
    script  = TextStyle(
        fontFamily = CaveatFamily,
        fontWeight = FontWeight.Bold,
        fontSize   = 32.sp,
        lineHeight = 32.sp,
    ),
    mono    = TextStyle(
        fontFamily = MonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize   = 12.sp,
        lineHeight = (12 * 1.4f).sp,
    ),
    labelXS = TextStyle(
        fontFamily = PoppinsFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize   = 11.sp,
        lineHeight = (11 * 1.3f).sp,
        letterSpacing = 0.6.sp,
    ),
)

val LocalStoryTailBrandTypography = compositionLocalOf { DefaultStoryTailBrandTypography }

/**
 * Material 3 Typography mapped to Story-Tail's Poppins ramp.
 * Mirrors the type scale in docs/Design-System.md §5.1.
 */
val StoryTailTypography = Typography(
    // Display
    displayLarge  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.ExtraBold,
        fontSize = 57.sp, lineHeight = (57 * 1.05f).sp, letterSpacing = (-1.5).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.ExtraBold,
        fontSize = 45.sp, lineHeight = (45 * 1.08f).sp, letterSpacing = (-1.0).sp,
    ),
    displaySmall  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Bold,
        fontSize = 36.sp, lineHeight = (36 * 1.10f).sp, letterSpacing = (-0.6).sp,
    ),

    // Headline
    headlineLarge  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Bold,
        fontSize = 32.sp, lineHeight = (32 * 1.15f).sp, letterSpacing = (-0.4).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Bold,
        fontSize = 28.sp, lineHeight = (28 * 1.15f).sp, letterSpacing = (-0.4).sp,
    ),
    headlineSmall  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Bold,
        fontSize = 24.sp, lineHeight = (24 * 1.18f).sp, letterSpacing = (-0.3).sp,
    ),

    // Title
    titleLarge  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp, lineHeight = (22 * 1.20f).sp, letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp, lineHeight = (18 * 1.25f).sp, letterSpacing = (-0.1).sp,
    ),
    titleSmall  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = (15 * 1.30f).sp,
    ),

    // Body
    bodyLarge  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Normal,
        fontSize = 16.sp, lineHeight = (16 * 1.50f).sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = (14 * 1.50f).sp,
    ),
    bodySmall  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Normal,
        fontSize = 13.sp, lineHeight = (13 * 1.45f).sp,
    ),

    // Label
    labelLarge  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Medium,
        fontSize = 14.sp, lineHeight = (14 * 1.30f).sp, letterSpacing = 0.1.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.Medium,
        fontSize = 12.sp, lineHeight = (12 * 1.30f).sp, letterSpacing = 0.4.sp,
    ),
    labelSmall  = TextStyle(
        fontFamily = PoppinsFamily, fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp, lineHeight = (11 * 1.30f).sp, letterSpacing = 0.6.sp,
    ),
)
