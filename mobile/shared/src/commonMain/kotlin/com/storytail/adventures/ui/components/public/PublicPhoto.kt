package com.storytail.adventures.ui.components.public

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.storytail.adventures.ui.theme.StoryTailBrand
import org.jetbrains.compose.resources.painterResource

/**
 * A §2.0 photograph.
 *
 * The photographs are the design's own — the same Unsplash images the web pages render,
 * from the registry in web/lib/images.ts — downloaded at 800px and bundled in
 * composeResources/drawable/. Bundled rather than streamed for the same reasons as the
 * typefaces: no image-loading dependency to add and get a security review for, no network
 * needed to draw a hero, and no first-paint gap on a phone with one bar of signal at a
 * resort.
 *
 * THEY ARE STILL PLACEHOLDERS. web/lib/images.ts marks every one `licensed: false`, and
 * that flag is carried into the Kotlin catalog untouched. The Unsplash License does permit
 * commercial use, but it grants no model or property release, so a photo with an
 * identifiable person or building in it is not automatically clear. PlaceholderBanner says
 * so on every screen, and nothing here flips that flag — replacing these with Gyasi's own
 * photography is dropping files in this directory and setting `licensed: true` at the
 * source.
 *
 * A key with no bundled file falls back to the brand gradient rather than a blank, which is
 * also what sits under every photograph while it decodes.
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
    // a grid of tiles does not read as one flat block while the photographs decode.
    val tint = placeholderTintFor(imageKey)
    val photo = drawableForImageKey(imageKey)

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
    ) {
        if (photo != null) {
            Image(
                painter = painterResource(photo),
                // Described on the Box above when it carries meaning, so the Image itself
                // is always decorative — announcing the same alt twice is noise.
                contentDescription = null,
                modifier = Modifier.matchParentSize(),
                contentScale = ContentScale.Crop,
            )
        }
        content()
    }
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
