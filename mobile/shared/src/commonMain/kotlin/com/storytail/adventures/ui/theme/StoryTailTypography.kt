package com.storytail.adventures.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.em
import org.jetbrains.compose.resources.Font
import com.storytail.adventures.shared.resources.Res
import com.storytail.adventures.shared.resources.caveat_variable
import com.storytail.adventures.shared.resources.jetbrains_mono_variable
import com.storytail.adventures.shared.resources.poppins_bold
import com.storytail.adventures.shared.resources.poppins_extrabold
import com.storytail.adventures.shared.resources.poppins_italic
import com.storytail.adventures.shared.resources.poppins_medium
import com.storytail.adventures.shared.resources.poppins_regular
import com.storytail.adventures.shared.resources.poppins_semibold

/**
 * Story-Tail Adventures typography.
 *
 * Three families, bundled rather than fetched:
 *   - Poppins (primary sans) — six static faces
 *   - Caveat  (script — the "Story-Tail" wordmark and the hero script clauses)
 *   - JetBrains Mono (confirmation numbers, kbd hints)
 *
 * All three are SIL Open Font License; the licences ship with the app in
 * composeResources/files/licenses/. Bundled, not loaded from the Google Fonts CDN, per
 * CLAUDE.md and Design-System.md §12.3 — a traveler reading an itinerary at a resort with
 * no signal still gets the right typeface, and a cold start makes no third-party request.
 *
 * WHY THE FAMILIES ARE COMPOSABLE. `org.jetbrains.compose.resources.Font` is a @Composable
 * function: it resolves the resource through the current composition. So the families
 * cannot be top-level `val`s the way they were while this file pointed at
 * FontFamily.Default — they are built once per theme and handed down. StoryTailTheme does
 * that; nothing else should need to.
 *
 * WEIGHTS. Only the weights the app actually renders are bundled — 400, 500, 600, 700, 800
 * plus one italic. Poppins Light (300) is deliberately absent: nothing uses it, and it is
 * 162KB. Ask for FontWeight.Light and Compose falls back to Regular; add the file if a
 * screen ever genuinely needs it.
 */

/** The three bundled families, resolved once per theme. */
@Immutable
data class StoryTailFontFamilies(
    val poppins: FontFamily,
    val caveat: FontFamily,
    val mono: FontFamily,
)

/**
 * Poppins ships as static instances, so each weight is its own file and renders exactly as
 * drawn — no synthesis.
 *
 * Caveat and JetBrains Mono ship from Google Fonts as VARIABLE fonts only (there are no
 * static instances in google/fonts for either). Each is registered at the weights this app
 * asks for; the wght axis is what the renderer interpolates. Both are used at a single
 * weight today — Caveat at Bold for the wordmark, Mono at Regular — so this is a one-line
 * change if that ever stops being true.
 */
@Composable
fun rememberStoryTailFontFamilies(): StoryTailFontFamilies = StoryTailFontFamilies(
    poppins = FontFamily(
        Font(Res.font.poppins_regular, FontWeight.Normal, FontStyle.Normal),
        Font(Res.font.poppins_italic, FontWeight.Normal, FontStyle.Italic),
        Font(Res.font.poppins_medium, FontWeight.Medium, FontStyle.Normal),
        Font(Res.font.poppins_semibold, FontWeight.SemiBold, FontStyle.Normal),
        Font(Res.font.poppins_bold, FontWeight.Bold, FontStyle.Normal),
        Font(Res.font.poppins_extrabold, FontWeight.ExtraBold, FontStyle.Normal),
    ),
    caveat = FontFamily(
        Font(Res.font.caveat_variable, FontWeight.Normal, FontStyle.Normal),
        Font(Res.font.caveat_variable, FontWeight.Bold, FontStyle.Normal),
    ),
    mono = FontFamily(
        Font(Res.font.jetbrains_mono_variable, FontWeight.Normal, FontStyle.Normal),
    ),
)

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

/**
 * The wordmark styles, built on the bundled families.
 *
 * A plain function rather than a value: it needs the families, and those only exist inside
 * a composition. [DefaultStoryTailBrandTypography] below is the system-font stand-in the
 * CompositionLocal falls back to outside StoryTailTheme.
 */
fun storyTailBrandTypography(families: StoryTailFontFamilies) = StoryTailBrandTypography(
    script = TextStyle(
        fontFamily = families.caveat,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 32.sp,
    ),
    mono = TextStyle(
        fontFamily = families.mono,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = (12 * 1.4f).sp,
    ),
    labelXS = TextStyle(
        fontFamily = families.poppins,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = (11 * 1.3f).sp,
        letterSpacing = 0.6.sp,
    ),
)

/**
 * System-font fallback, used only as the CompositionLocal's default — i.e. when something
 * reads the wordmark style outside StoryTailTheme. Inside the theme the bundled faces win.
 */
val DefaultStoryTailBrandTypography = StoryTailBrandTypography(
    script = TextStyle(
        fontFamily = FontFamily.Cursive,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 32.sp,
    ),
    mono = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = (12 * 1.4f).sp,
    ),
    labelXS = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = (11 * 1.3f).sp,
        letterSpacing = 0.6.sp,
    ),
)

val LocalStoryTailBrandTypography = compositionLocalOf { DefaultStoryTailBrandTypography }

/**
 * Material 3 Typography mapped to Story-Tail's Poppins ramp.
 * Mirrors the type scale in docs/Design-System.md §5.1.
 *
 * A function of the families for the same reason as the brand styles: the faces are
 * resources, and resources are resolved in composition. StoryTailTheme builds this once and
 * remembers it.
 */
fun storyTailTypography(families: StoryTailFontFamilies) = Typography(
    // Display
    displayLarge  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.ExtraBold,
        fontSize = 57.sp, lineHeight = (57 * 1.05f).sp, letterSpacing = (-1.5).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.ExtraBold,
        fontSize = 45.sp, lineHeight = (45 * 1.08f).sp, letterSpacing = (-1.0).sp,
    ),
    displaySmall  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Bold,
        fontSize = 36.sp, lineHeight = (36 * 1.10f).sp, letterSpacing = (-0.6).sp,
    ),

    // Headline
    headlineLarge  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Bold,
        fontSize = 32.sp, lineHeight = (32 * 1.15f).sp, letterSpacing = (-0.4).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Bold,
        fontSize = 28.sp, lineHeight = (28 * 1.15f).sp, letterSpacing = (-0.4).sp,
    ),
    headlineSmall  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Bold,
        fontSize = 24.sp, lineHeight = (24 * 1.18f).sp, letterSpacing = (-0.3).sp,
    ),

    // Title
    titleLarge  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp, lineHeight = (22 * 1.20f).sp, letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp, lineHeight = (18 * 1.25f).sp, letterSpacing = (-0.1).sp,
    ),
    titleSmall  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = (15 * 1.30f).sp,
    ),

    // Body
    bodyLarge  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Normal,
        fontSize = 16.sp, lineHeight = (16 * 1.50f).sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = (14 * 1.50f).sp,
    ),
    bodySmall  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Normal,
        fontSize = 13.sp, lineHeight = (13 * 1.45f).sp,
    ),

    // Label
    labelLarge  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Medium,
        fontSize = 14.sp, lineHeight = (14 * 1.30f).sp, letterSpacing = 0.1.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.Medium,
        fontSize = 12.sp, lineHeight = (12 * 1.30f).sp, letterSpacing = 0.4.sp,
    ),
    labelSmall  = TextStyle(
        fontFamily = families.poppins, fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp, lineHeight = (11 * 1.30f).sp, letterSpacing = 0.6.sp,
    ),
)
