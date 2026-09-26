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
 * Card-network plate colors for §2.4's brand chips.
 *
 * NOT STORY-TAIL'S PALETTE and not a theme role — these are third-party marks, so they are
 * scheme-invariant for the same reason [StoryTailBrand] is: a Visa plate that turned gold in
 * dark mode would be a worse lie than a slightly low-contrast navy one.
 *
 * They live here rather than inline in the wallet screen because an inline
 * `if (brand == "visa") navy else red` was exactly the shape that shipped a MASTERCARD-red
 * plate behind an AMEX chip — the same one-brand-and-everything-else mistake that produced
 * "MAST" from `brand.take(4)`. Keyed like `BRAND_CHIPS` in `domain/wallet/WalletCopy.kt`, on
 * Stripe's lowercase brand token.
 */
object CardNetworkPlate {
    private val COLORS = mapOf(
        "visa" to Color(0xFF1A1F71),
        "mastercard" to Color(0xFFEB001B),
        "amex" to Color(0xFF006FCF),
        "discover" to Color(0xFFFF6000),
        "diners" to Color(0xFF0079BE),
        "jcb" to Color(0xFF0B4EA2),
        "unionpay" to Color(0xFFE21836),
    )

    /** Falls back to Story-Tail's own navy — neutral, and never another network's colour. */
    fun of(brand: String): Color = COLORS[brand.lowercase()] ?: StoryTailBrand.Navy
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
    // `cancelled` is the eighth, added with §2.2. Design-System §4.3 shipped seven and
    // C2210_Cancelled hardcoded this pair inline because there was no token. Mapping it
    // onto `past` would make the two indistinguishable in a list whose filter tabs
    // separate them.
    val cancelledBg: Color,
    val cancelledFg: Color,
)

val LightStoryTailStatusColors = StoryTailStatusColors(
    proposalBg  = Color(0xFFFFE3B7), proposalFg  = Color(0xFF6B3F00),
    bookedBg    = Color(0xFFC7E9D4), bookedFg    = Color(0xFF0A4A26),
    dueBg       = Color(0xFFFCD3D0), dueFg       = Color(0xFF6E1313),
    travelingBg = Color(0xFFC9DDF8), travelingFg = Color(0xFF0A3669),
    pastBg      = Color(0xFFE2DBD2), pastFg      = Color(0xFF4A3F38),
    leadBg      = Color(0xFFF4D9F6), leadFg      = Color(0xFF4E124E),
    inquiryBg   = Color(0xFFE1D7F4), inquiryFg   = Color(0xFF2C1761),
    cancelledBg = Color(0xFFD7DFE6), cancelledFg = Color(0xFF3D352E),
)

val DarkStoryTailStatusColors = StoryTailStatusColors(
    proposalBg  = Color(0xFF6B4400), proposalFg  = Color(0xFFFFE3B7),
    bookedBg    = Color(0xFF0D5A2F), bookedFg    = Color(0xFFC7E9D4),
    dueBg       = Color(0xFF6E1313), dueFg       = Color(0xFFFCD3D0),
    travelingBg = Color(0xFF0E4A85), travelingFg = Color(0xFFC9DDF8),
    pastBg      = Color(0xFF1F3450), pastFg      = Color(0xFFC3D3E6),
    leadBg      = Color(0xFF4E124E), leadFg      = Color(0xFFF4D9F6),
    inquiryBg   = Color(0xFF2A1559), inquiryFg   = Color(0xFFE1D7F4),
    cancelledBg = Color(0xFF2A3340), cancelledFg = Color(0xFFC9D2DC),
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
    // #E3DCD2 until the dark ladder was corrected; surface5 is #E4DDD4 and the
    // extended scheme declares these two the same role. Sub-perceptual either way,
    // but the contract is only testable if it holds exactly.
    surfaceContainerHighest = Color(0xFFE4DDD4),
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
    //
    // These five must be surface1..surface5, exactly as the light scheme's five are and
    // exactly as design/source-prototype/styles/tokens.css labels them — that file gets
    // this right in both schemes (`--md-surface-1: #0A1828` over `--md-bg: #050D1A`);
    // only the transcription into darkColorScheme() came out one step low, with
    // lowest..highest landing on background + surface1..surface4.
    //
    // So `surfaceContainerLowest` was byte-equal to `background`, and the fifteen call
    // sites that paint a card with it — the worklist's five sections, the client
    // dashboard's advisor block, TonalCard, both bottom bars — had no edge at all in
    // dark: the same fill as the page behind them. Light could not show it, because
    // there `lowest` is white on cream. Locked by StoryTailColorsTest.
    surfaceContainerLowest = Color(0xFF0A1828),
    surfaceContainerLow    = Color(0xFF0F2034),
    surfaceContainer       = Color(0xFF142A41),
    surfaceContainerHigh   = Color(0xFF1A314D),
    surfaceContainerHighest = Color(0xFF21395A),
    surfaceBright        = Color(0xFF1A314D),
    surfaceDim           = Color(0xFF050D1A),
    surfaceTint          = Color(0xFF5BB6FF),
    inverseSurface       = Color(0xFFE8F0FC),
    inverseOnSurface     = Color(0xFF07111F),
    inversePrimary       = Color(0xFF00639B),
)
