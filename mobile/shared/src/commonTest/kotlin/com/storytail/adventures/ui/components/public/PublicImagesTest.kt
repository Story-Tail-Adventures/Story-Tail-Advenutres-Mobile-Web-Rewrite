package com.storytail.adventures.ui.components.public

import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.content.public.Topic
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The photograph mapping is a hand-written `when` over generated keys, which is exactly the
 * shape that rots silently: the catalog is regenerated from web, a new imageKey arrives, and
 * the screen that uses it quietly draws a gradient instead of a photo. Nothing fails, so
 * nobody looks.
 *
 * These assert the join between the two. They cannot check that a photograph shows what it
 * claims — only a person looking at it can, and doing exactly that is what turned up the Taj
 * Mahal filed under `jamaica`.
 */
class PublicImagesTest {

    /**
     * Every key in the registry has a photograph. No exceptions list any more: as of the
     * 2026-09-06 id fixes all sixteen photographs are bundled, so a null here means a new key
     * arrived from web without one — go and look at it, then bundle it.
     */
    @Test
    fun everyRegistryKeyHasABundledPhotograph() {
        val missing = PublicCatalog.IMAGES
            .map { it.key }
            .filter { drawableForImageKey(it) == null }

        assertEquals(
            emptyList(), missing,
            "Registry key(s) $missing have no bundled photograph. Open the id in " +
                "web/lib/images.ts, check it shows what the alt text says, then add the file " +
                "to composeResources/drawable/ and map it in PublicImages.kt.",
        )
    }

    /** And nothing is mapped that the registry does not define. */
    @Test
    fun everyBundledPhotographIsARegistryKey() {
        val registryKeys = PublicCatalog.IMAGES.map { it.key }.toSet()
        assertTrue(registryKeys.isNotEmpty(), "The generated registry is empty")

        val bundled = registryKeys.filter { drawableForImageKey(it) != null }
        assertEquals(
            registryKeys.size, bundled.size,
            "Bundled ${bundled.size} of ${registryKeys.size} registry keys",
        )
    }

    /**
     * The registry points two pairs of keys at one id, so they must resolve to one file —
     * and `stlucia`/`bvi`, which USED to share one, must no longer. A Piton and a catamaran
     * are not the same photograph, and the shared id was part of why the old set was wrong.
     */
    @Test
    fun keysSharingAnIdShareAFileAndOthersDoNot() {
        assertEquals(drawableForImageKey("turks"), drawableForImageKey("palmTree"))
        assertEquals(drawableForImageKey("cruiseShip"), drawableForImageKey("cruiseAerial"))

        assertTrue(
            drawableForImageKey("stlucia") != drawableForImageKey("bvi"),
            "stlucia and bvi are back to sharing one photograph",
        )
    }

    /**
     * Every trip on a topic grid can draw itself. Narrower than the checks above on purpose:
     * it is the path a visitor actually walks, so it names the topic when it breaks.
     */
    @Test
    fun everyTopicGridTripCanDrawItself() {
        Topic.entries.forEach { topic ->
            val trips = PublicContent.tripsFor(topic)
            assertTrue(trips.isNotEmpty(), "No trips placed on $topic")
            trips.forEach { trip ->
                assertNotNull(
                    drawableForImageKey(trip.imageKey),
                    "${trip.slug} on $topic has no bundled photograph (${trip.imageKey})",
                )
                trip.heroImageKey?.let {
                    assertNotNull(drawableForImageKey(it), "${trip.slug} hero photo $it missing")
                }
            }
        }
    }

    /** The island strip and the inspiration grid draw from the registry too. */
    @Test
    fun everyIslandAndInspirationTileCanDrawItself() {
        PublicCatalog.ISLANDS.forEach {
            assertNotNull(drawableForImageKey(it.imageKey), "Island ${it.slug}: ${it.imageKey}")
        }
        PublicCatalog.INSPIRATION_TILES.forEach {
            assertNotNull(drawableForImageKey(it.imageKey), "Tile ${it.slug}: ${it.imageKey}")
        }
    }
}
