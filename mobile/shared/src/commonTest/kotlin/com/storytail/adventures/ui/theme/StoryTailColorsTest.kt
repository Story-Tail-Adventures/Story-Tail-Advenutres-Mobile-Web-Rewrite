package com.storytail.adventures.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The M3 container ladder, locked in both schemes.
 *
 * Found by §3.2's on-device dark-mode pass, not by any test that existed: the dark
 * ladder sat one step low, so `surfaceContainerLowest` was byte-equal to `background`.
 * Fifteen call sites paint a card with that role — the worklist's five sections, the
 * client dashboard's advisor block, TonalCard, both bottom bars — and in dark every one
 * of them rendered as the same fill as the page behind it. The cards were still there,
 * still padded, still rounded; they just had no edge. Light could never show it, because
 * there `lowest` is white on cream.
 *
 * Nothing in a unit test or a screenshot diff would have caught it, so the invariant
 * goes here instead: the five container roles are the five `surfaceN` values, in order,
 * and none of them is the page colour.
 */
class StoryTailColorsTest {

    private fun ladder(scheme: ColorScheme) = listOf(
        "surfaceContainerLowest" to scheme.surfaceContainerLowest,
        "surfaceContainerLow" to scheme.surfaceContainerLow,
        "surfaceContainer" to scheme.surfaceContainer,
        "surfaceContainerHigh" to scheme.surfaceContainerHigh,
        "surfaceContainerHighest" to scheme.surfaceContainerHighest,
    )

    private fun surfaces(ext: StoryTailExtendedColors) =
        listOf(ext.surface1, ext.surface2, ext.surface3, ext.surface4, ext.surface5)

    @Test
    fun `light container ladder is surface1 through surface5`() {
        ladder(LightStoryTailColorScheme).zip(surfaces(LightStoryTailExtended))
            .forEach { (role, surface) -> assertEquals(surface, role.second, role.first) }
    }

    @Test
    fun `dark container ladder is surface1 through surface5`() {
        ladder(DarkStoryTailColorScheme).zip(surfaces(DarkStoryTailExtended))
            .forEach { (role, surface) -> assertEquals(surface, role.second, role.first) }
    }

    /**
     * The regression itself. A card role equal to the page colour is an invisible card,
     * and the compiler, the tests and the light scheme all stay quiet about it.
     */
    @Test
    fun `no container role is the page background`() {
        listOf(
            "light" to LightStoryTailColorScheme,
            "dark" to DarkStoryTailColorScheme,
        ).forEach { (name, scheme) ->
            ladder(scheme).forEach { (role, value) ->
                assertNotEquals(scheme.background, value, "$name $role == background")
            }
        }
    }

    @Test
    fun `container roles are distinct within each scheme`() {
        listOf(
            "light" to LightStoryTailColorScheme,
            "dark" to DarkStoryTailColorScheme,
        ).forEach { (name, scheme) ->
            val values = ladder(scheme).map { it.second }
            assertEquals(values.size, values.toSet().size, "$name ladder has a duplicate")
        }
    }

    /**
     * Direction, not just distinctness: light steps down from white, dark steps up from
     * near-black. A scheme authored by inverting the other one fails here.
     */
    @Test
    fun `ladders move away from the page in the right direction`() {
        fun luminance(c: Color) = 0.2126f * c.red + 0.7152f * c.green + 0.0722f * c.blue

        val light = surfaces(LightStoryTailExtended).map(::luminance)
        assertTrue(light.zipWithNext().all { (a, b) -> a > b }, "light ladder should darken")

        val dark = surfaces(DarkStoryTailExtended).map(::luminance)
        assertTrue(dark.zipWithNext().all { (a, b) -> a < b }, "dark ladder should lighten")

        assertTrue(
            luminance(DarkStoryTailExtended.surface1) > luminance(DarkStoryTailColorScheme.background),
            "dark surface1 must sit above the page, or every card loses its edge",
        )
    }
}
