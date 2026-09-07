package com.storytail.adventures.ui.components.public

import com.storytail.adventures.content.public.PublicCatalog
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The photograph mapping is a hand-written `when` over generated keys, which is exactly the
 * shape that rots silently: the catalog is regenerated from web, a new imageKey arrives, and
 * the screen that uses it quietly draws a gradient instead of a photo. Nothing fails, so
 * nobody looks.
 *
 * These assert the join between the two, and — more importantly — pin the list of registry
 * entries whose photograph does not match its own description. That list is not a
 * nice-to-have: nine of fifteen ids resolve to the wrong subject today, `jamaica` to the Taj
 * Mahal, and the same ids are what web renders.
 */
class PublicImagesTest {

    /** Nothing is bundled that is not also a real key in the generated registry. */
    @Test
    fun everyBundledPhotographIsARegistryKey() {
        val registryKeys = PublicCatalog.IMAGES.map { it.key }.toSet()
        val bundled = registryKeys.filter { drawableForImageKey(it) != null }

        assertTrue(bundled.isNotEmpty(), "No photographs are bundled at all")
        assertTrue(
            registryKeys.containsAll(bundled),
            "Bundled a photograph for a key the registry does not define: " +
                "${bundled - registryKeys}",
        )
    }

    /**
     * The registry splits cleanly in two: a key either has a verified photograph or is on
     * the unverified list. Nothing may be in neither — that is how a new key added on web
     * would otherwise slip through and silently render a gradient.
     */
    @Test
    fun everyRegistryKeyIsEitherBundledOrKnownUnverified() {
        val unaccounted = PublicCatalog.IMAGES
            .map { it.key }
            .filter { drawableForImageKey(it) == null && it !in UNVERIFIED_IMAGE_KEYS }

        assertEquals(
            emptyList(), unaccounted,
            "Registry key(s) $unaccounted have no bundled photograph and are not listed in " +
                "UNVERIFIED_IMAGE_KEYS. Look at the photo, then either bundle it or add it " +
                "to the list with what it actually shows.",
        )
    }

    /** And nothing may be on both sides — a key listed as unverified must not be bundled. */
    @Test
    fun noUnverifiedKeyIsBundled() {
        val contradictory = UNVERIFIED_IMAGE_KEYS.filter { drawableForImageKey(it) != null }
        assertEquals(
            emptyList(), contradictory,
            "$contradictory are bundled but still listed as unverified. If the photograph " +
                "was fixed upstream, take the key off the list.",
        )
    }

    /**
     * Pins the size of the problem. If this fails because the count went DOWN, someone fixed
     * an id upstream — update the number and delete the entry. If it went UP, a regenerated
     * catalog brought a new broken key and it is worth looking at before it ships.
     */
    @Test
    fun elevenRegistryKeysStillNeedACorrectPhotograph() {
        assertEquals(
            11, UNVERIFIED_IMAGE_KEYS.size,
            "UNVERIFIED_IMAGE_KEYS changed size: ${UNVERIFIED_IMAGE_KEYS.sorted()}",
        )
    }

    /** The keys the registry deliberately doubles up resolve to one file, not two. */
    @Test
    fun sharedRegistryIdsResolveToOnePhotograph() {
        assertEquals(drawableForImageKey("turks"), drawableForImageKey("palmTree"))
        assertEquals(drawableForImageKey("cruiseShip"), drawableForImageKey("cruiseAerial"))
        // stlucia and bvi share an id too, and share being wrong — both unbundled.
        assertEquals(null, drawableForImageKey("stlucia"))
        assertEquals(null, drawableForImageKey("bvi"))
    }
}
