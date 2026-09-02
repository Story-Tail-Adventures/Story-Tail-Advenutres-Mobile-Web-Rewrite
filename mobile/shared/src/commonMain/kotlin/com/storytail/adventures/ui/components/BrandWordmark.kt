package com.storytail.adventures.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * "Story-Tail" in Caveat over "ADVENTURES" in Poppins.
 *
 * From design/source-prototype/shared/components.jsx. The glyph itself is a
 * multi-path SVG in the prototype; it lands here as a Compose vector once the brand
 * assets are exported. Until then this is the wordmark alone, which is what the
 * split-pane and mobile auth headers actually lead with.
 */
@Composable
fun BrandWordmark(
    size: Dp = 32.dp,
    onDark: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val brandType = LocalStoryTailBrandTypography.current
    val scriptColor = when {
        onDark -> Color.White
        MaterialTheme.colorScheme.background.luminanceIsDark() -> StoryTailBrand.Sunset
        else -> StoryTailBrand.Burgundy
    }
    val taglineColor = if (onDark) StoryTailBrand.Sunset else StoryTailBrand.Orange

    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "Story-Tail",
                style = brandType.script.copy(fontSize = size.value.times(0.72f).sp),
                color = scriptColor,
            )
            Text(
                text = "ADVENTURES",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = size.value.times(0.25f).coerceAtLeast(8f).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp,
                ),
                color = taglineColor,
            )
        }
    }
}

/** Cheap perceptual-luminance check, so the wordmark stays legible on either scheme. */
private fun Color.luminanceIsDark(): Boolean =
    (0.299f * red + 0.587f * green + 0.114f * blue) < 0.5f
