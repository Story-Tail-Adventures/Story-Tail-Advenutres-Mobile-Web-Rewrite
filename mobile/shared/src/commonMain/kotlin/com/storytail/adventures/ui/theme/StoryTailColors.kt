package com.storytail.adventures.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Story-Tail Adventures color tokens.
 *
 * Two distinct schemes (NOT a tint of each other):
 *   - Light: burgundy + orange (book/fox logo)
 *   - Dark:  ocean blue + sunset gold (tropical palm/sun logo)
 *
 * Mirrors design/source-prototype/styles/tokens.css. Any change here must
 * propagate to that file and vice versa.
 */
object StoryTailBrand {
    // Source brand colors — feed every theme variant.
    val Burgundy     = Color(0xFF7A1A1F)
    val BurgundyDark = Color(0xFF5C0F13)
    val Orange       = Color(0xFFE87722)
    val OrangeLight  = Color(0xFFF59E4E)
    val Sunset       = Color(0xFFF5A623)  // Sunset Gold
    val Ocean        = Color(0xFF1565C0)
    val Navy         = Color(0xFF0D2137)
    val Cream        = Color(0xFFFBF6EE)
    val Sand         = Color(0xFFF1E7D5)
}

/**
 * Story-Tail status colors for trip and lead chips.
 * Provided as a CompositionLocal so screens can read them
 * without hardcoding hex values.
 */
@Immutable
data class StoryTailStatusColors(
    val proposalBg: Color,
    val proposalFg: Color,
    val bookedBg:   Color,
    val bookedFg:   Color,
    val dueBg:      Color,
    val dueFg:      Color,
    val travelingBg: Color,
    val travelingFg: Color,
    val pastBg:     Color,
    val pastFg:     Color,
    val leadBg:     Color,
    val leadFg:     Color,
    val inquiryBg:  Color,
    val inquiryFg:  Color,
)

val LightStoryTailStatusColors = StoryTailStatusColors(
    proposalBg  = Color(0xFFFFE3B7), proposalFg  = Color(0xFF6B3F00),
    bookedBg    = Color(0xFFC7E9D4), bookedFg    = Color(0xFF0A4A26),
    dueBg       = Color(0xFFFCD3D0), dueFg       = Color(0xFF6E1313),
    travelingBg = Color(0xFFC9DDF8), travelingFg = Color(0xFF0A3669),
    pastBg      = Color(0xFFE2DBD2), pastFg      = Color(0xFF4A3F38),
    leadBg      = Color(0xFFF4D9F6), leadFg      = Color(0xFF4E124E),
    inquiryBg   = Color(0xFFE1D7F4), inquiryFg   = Color(0xFF2C1761),
)

val DarkStoryTailStatusColors = StoryTailStatusColors(
    proposalBg  = Color(0xFF6B4400), proposalFg  = Color(0xFFFFE3B7),
    bookedBg    = Color(0xFF0D5A2F), bookedFg    = Color(0xFFC7E9D4),
    dueBg       = Color(0xFF6E1313), dueFg       = Color(0xFFFCD3D0),
    travelingBg = Color(0xFF0E4A85), travelingFg = Color(0xFFC9DDF8),
    pastBg      = Color(0xFF1F3450), pastFg      = Color(0xFFC3D3E6),
    leadBg      = Color(0xFF4E124E), leadFg      = Color(0xFFF4D9F6),
    inquiryBg   = Color(0xFF2A1559), inquiryFg   = Color(0xFFE1D7F4),
)

val LocalStoryTailStatusColors = compositionLocalOf { LightStoryTailStatusColors }

/**
 * Story-Tail extension colors that don't fit Material 3's standard scheme
 * (success, warning, plus the M3 5-tier surface containers we use).
 */
@Immutable
data class StoryTailExtendedColors(
    val success:           Color,
    val successContainer:  Color,
    val warning:           Color,
    val warningContainer:  Color,
    val surface1:          Color,  // containerLowest
    val surface2:          Color,  // containerLow
    val surface3:          Color,  // container
    val surface4:          Color,  // containerHigh
    val surface5:          Color,  // containerHighest
    val tropicalGradientStart: Color,
    val tropicalGradientMid:   Color,
    val tropicalGradientEnd:   Color,
)

val LightStoryTailExtended = StoryTailExtendedColors(
    success           = Color(0xFF1B6E3F),
    successContainer  = Color(0xFFB6F2C8),
    warning           = Color(0xFFB7691C),
    warningContainer  = Color(0xFFFFDDB4),
    surface1          = Color(0xFFFFFFFF),
    surface2          = Color(0xFFF6F1EA),
    surface3          = Color(0xFFF0EAE2),
    surface4          = Color(0xFFEAE4DB),
    surface5          = Color(0xFFE4DDD4),
    tropicalGradientStart = StoryTailBrand.Sunset,
    tropicalGradientMid   = StoryTailBrand.Ocean,
    tropicalGradientEnd   = StoryTailBrand.Navy,
)

val DarkStoryTailExtended = StoryTailExtendedColors(
    success           = Color(0xFF8DDCA4),
    successContainer  = Color(0xFF00522A),
    warning           = Color(0xFFFFD09C),
    warningContainer  = Color(0xFF6D4400),
    surface1          = Color(0xFF0A1828),
    surface2          = Color(0xFF0F2034),
    surface3          = Color(0xFF142A41),
    surface4          = Color(0xFF1A314D),
    surface5          = Color(0xFF21395A),
    tropicalGradientStart = StoryTailBrand.Sunset,
    tropicalGradientMid   = StoryTailBrand.Ocean,
    tropicalGradientEnd   = StoryTailBrand.Navy,
)

val LocalStoryTailExtended = compositionLocalOf { LightStoryTailExtended }

/**
 * Material 3 color schemes for Story-Tail.
 * Drop these into MaterialTheme(colorScheme = ...) at the app root.
 */
val LightStoryTailColorScheme: ColorScheme = lightColorScheme(
    primary              = StoryTailBrand.Burgundy,
    onPrimary            = Color.White,
    primaryContainer     = Color(0xFFFFDAD5),
    onPrimaryContainer   = Color(0xFF410005),
    secondary            = Color(0xFFC75A14),
    onSecondary          = Color.White,
    secondaryContainer   = Color(0xFFFFDCC1),
    onSecondaryContainer = Color(0xFF321200),
    tertiary             = StoryTailBrand.Ocean,
    onTertiary           = Color.White,
    tertiaryContainer    = Color(0xFFD5E3FF),
    onTertiaryContainer  = Color(0xFF001A41),
    error                = Color(0xFFBA1A1A),
    onError              = Color.White,
    errorContainer       = Color(0xFFFFDAD6),
    onErrorContainer     = Color(0xFF410002),
    background           = StoryTailBrand.Cream,
    onBackground         = Color(0xFF1C1B1A),
    surface              = Color(0xFFFBF8F3),
    onSurface            = Color(0xFF1C1B1A),
    surfaceVariant       = Color(0xFFEAE4DB),
    onSurfaceVariant     = Color(0xFF524540),
    outline              = Color(0xFF847370),
    outlineVariant       = Color(0xFFD7C2BD),
    scrim                = Color(0x66000000),
    // THE CONTAINER FAMILY IS NOT OPTIONAL. Every role left out of `lightColorScheme`
    // keeps Material's own baseline value, and that baseline is purple — so a single
    // `surfaceContainerLow` in a composable painted the sticky footer lilac on a cream
    // page. The same three values the extended scheme carries as surface1/2/3, which is
    // what design/source-prototype/styles/tokens.css calls --md-surface-1/2/3 and labels
    // with these exact Material names.
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow    = Color(0xFFF6F1EA),
    surfaceContainer       = Color(0xFFF0EAE2),
    surfaceContainerHigh   = Color(0xFFEAE4DB),
    surfaceContainerHighest = Color(0xFFE3DCD2),
    surfaceBright        = Color(0xFFFBF8F3),
    surfaceDim           = Color(0xFFE0D9CF),
    surfaceTint          = StoryTailBrand.Burgundy,
    inverseSurface       = Color(0xFF322F2C),
    inverseOnSurface     = Color(0xFFF6EFE7),
    inversePrimary       = Color(0xFFFFB3AC),
)

val DarkStoryTailColorScheme: ColorScheme = darkColorScheme(
    primary              = Color(0xFF5BB6FF),
    onPrimary            = Color(0xFF00264D),
    primaryContainer     = Color(0xFF003E78),
    onPrimaryContainer   = Color(0xFFC5E0FF),
    secondary            = Color(0xFFFFC83F),
    onSecondary          = Color(0xFF4A2C00),
    secondaryContainer   = Color(0xFF6F4400),
    onSecondaryContainer = Color(0xFFFFE3B5),
    tertiary             = Color(0xFF6CD279),
    onTertiary           = Color(0xFF003915),
    tertiaryContainer    = Color(0xFF105228),
    onTertiaryContainer  = Color(0xFFB6F2C8),
    error                = Color(0xFFFFB4AB),
    onError              = Color(0xFF690005),
    errorContainer       = Color(0xFF93000A),
    onErrorContainer     = Color(0xFFFFDAD6),
    background           = Color(0xFF050D1A),
    onBackground         = Color(0xFFE8F0FC),
    surface              = Color(0xFF07111F),
    onSurface            = Color(0xFFE8F0FC),
    surfaceVariant       = Color(0xFF1A314D),
    onSurfaceVariant     = Color(0xFFC3D3E6),
    outline              = Color(0xFF6A8AAE),
    outlineVariant       = Color(0xFF2A4566),
    scrim                = Color(0xA6000000),
    // Same reason as the light scheme, and the dark one would fail louder: an unset
    // container role here is a LIGHT purple, on navy.
    surfaceContainerLowest = Color(0xFF050D1A),
    surfaceContainerLow    = Color(0xFF0A1828),
    surfaceContainer       = Color(0xFF0F2034),
    surfaceContainerHigh   = Color(0xFF142A41),
    surfaceContainerHighest = Color(0xFF1A314D),
    surfaceBright        = Color(0xFF1A314D),
    surfaceDim           = Color(0xFF050D1A),
    surfaceTint          = Color(0xFF5BB6FF),
    inverseSurface       = Color(0xFFE8F0FC),
    inverseOnSurface     = Color(0xFF07111F),
    inversePrimary       = Color(0xFF00639B),
)
