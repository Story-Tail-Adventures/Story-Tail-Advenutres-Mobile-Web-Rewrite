package com.storytail.adventures.ui.components.public

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * Where a §2.0 photograph goes.
 *
 * THE APP SHIPS NO PHOTOGRAPHY YET, AND THAT IS DELIBERATE. Every image the design calls
 * for is an unlicensed Unsplash placeholder — web/lib/images.ts marks all of them
 * `licensed: false`, and the web build has a strict production gate that refuses to ship
 * while that is true. Referencing an unlicensed photo from a web page somebody can take
 * down in a minute is one risk; baking it into a binary that goes through App Store review
 * and sits on people's phones is a different one. So this renders the brand gradient the
 * design already scrims those photos with, and nothing is bundled.
 *
 * It is one composable on purpose: when owned photography lands, this is the only file that
 * changes. Two ways to finish it, both a decision for Gyasi rather than a default:
 *
 *  - Bundle the owned images under `composeResources/drawable/` and paint them here. No new
 *    dependency, works offline, grows the binary.
 *  - Add a KMP image loader (Coil 3 supports Compose Multiplatform) and stream them. Smaller
 *    binary, needs network on first paint, and CLAUDE.md requires a security review before a
 *    new third-party SDK lands.
 *
 * [imageKey] is carried through from the generated catalog so the call sites are already
 * correct — they name the photo they want, and only this file does not yet know how to draw
 * it.
 */
@Composable
fun PublicPhoto(
    imageKey: String,
    modifier: Modifier = Modifier,
    /** Descriptive alt when the photo carries meaning; null for decorative use. */
    contentDescription: String? = null,
    content: @Composable BoxScope.() -> Unit = {},
) {
    // Deterministic per key, so the same trip is the same colour everywhere it appears and
    // a grid of tiles does not read as one flat block.
    val tint = placeholderTintFor(imageKey)

    Box(
        modifier
            .background(
                Brush.linearGradient(
                    listOf(
                        tint.copy(alpha = 0.55f),
                        StoryTailBrand.Navy.copy(alpha = 0.85f),
                    ),
                ),
            )
            .then(
                if (contentDescription != null) {
                    Modifier.semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier
                },
            ),
        content = content,
    )
}

/** Fills the parent — the common case for a hero or a tile background. */
@Composable
fun PublicPhotoFill(
    imageKey: String,
    contentDescription: String? = null,
    content: @Composable BoxScope.() -> Unit = {},
) = PublicPhoto(imageKey, Modifier.fillMaxSize(), contentDescription, content)

/**
 * A stable brand colour per photo key.
 *
 * Not random: a hash of the key, so the tile for "turks" is the same shade on the Caribbean
 * page and on its detail screen. Drawn only from brand tokens, so both schemes stay on
 * palette.
 */
private fun placeholderTintFor(imageKey: String): Color {
    val palette = listOf(
        StoryTailBrand.Ocean,
        StoryTailBrand.Sunset,
        StoryTailBrand.Burgundy,
        StoryTailBrand.Orange,
    )
    val hash = imageKey.fold(0) { acc, ch -> (acc * 31 + ch.code) and 0x7FFFFFFF }
    return palette[hash % palette.size]
}
