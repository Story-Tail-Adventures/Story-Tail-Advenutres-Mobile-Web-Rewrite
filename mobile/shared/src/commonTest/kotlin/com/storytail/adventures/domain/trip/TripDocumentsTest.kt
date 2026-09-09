package com.storytail.adventures.domain.trip

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The Kotlin half of the 2.2.6 spine.
 *
 * The fixtures are the SAME four byte counts as `web/lib/trips/documents.test.ts`, on purpose:
 * `check_copy_parity.py` compares the copy tables but nothing compares the arithmetic, and
 * a size that reads "320 KB" on a phone and "328 KB" in a browser for the same file is
 * exactly the kind of drift this section is trying to avoid.
 */
class TripDocumentsTest {

    @Test
    fun `prints the artboards own numbers`() {
        assertEquals("320 KB", formatFileSize(327_680))
        assertEquals("620 KB", formatFileSize(634_880))
        assertEquals("1.1 MB", formatFileSize(1_153_434))
        assertEquals("2.3 MB", formatFileSize(2_411_724))
    }

    @Test
    fun `drops the decimal past ten megabytes where a tenth is noise`() {
        assertEquals("48 MB", formatFileSize(48L * 1024 * 1024))
    }

    @Test
    fun `shows bytes below a kilobyte rather than rounding to zero`() {
        assertEquals("512 B", formatFileSize(512))
        assertEquals("0 B", formatFileSize(0))
    }

    @Test
    fun `refuses to invent a size for a negative value`() {
        assertEquals("—", formatFileSize(-1))
    }

    @Test
    fun `badges off the mime type not the filename`() {
        // The case an extension check gets wrong: a JPEG named .pdf would paint a burgundy
        // PDF tile over a photograph, and `filename` is the one field a client controls.
        assertEquals(DocumentBadge.IMG, documentBadge("image/jpeg"))
        assertEquals(DocumentBadge.PDF, documentBadge("application/pdf"))
    }

    @Test
    fun `files passports and visas in one drawer`() {
        assertEquals(DocumentGroup.IDENTITY, documentGroupFor("passport"))
        assertEquals(DocumentGroup.IDENTITY, documentGroupFor("visa"))
    }

    @Test
    fun `every readable kind has a home outside the catch-all`() {
        for (kind in READABLE_DOCUMENT_KINDS) {
            assertNotEquals(
                DocumentGroup.OTHER,
                documentGroupFor(kind),
                "$kind fell through to the catch-all",
            )
        }
    }

    @Test
    fun `routes an unknown kind to the catch-all rather than throwing`() {
        assertEquals(DocumentGroup.OTHER, documentGroupFor("receipt"))
        assertEquals(DocumentGroup.OTHER, documentGroupFor("something_new"))
    }

    @Test
    fun `uploadable kinds are a strict subset of readable ones`() {
        // A kind a client may upload but not read would produce a document they cannot open.
        for (kind in UPLOADABLE_DOCUMENT_KINDS) {
            assertTrue(kind in READABLE_DOCUMENT_KINDS, "$kind is uploadable but not readable")
        }
        assertTrue(UPLOADABLE_DOCUMENT_KINDS.size < READABLE_DOCUMENT_KINDS.size)
    }

    private data class Doc(val kind: String, val createdAt: String)

    private fun group(vararg docs: Doc) =
        groupDocuments(docs.toList(), kindOf = { it.kind }, createdAtOf = { it.createdAt })

    @Test
    fun `orders groups by the fixed list not by first appearance`() {
        // Filed insurance-first, which is the order that would put Insurance at the top if
        // the grouping followed the data.
        val groups = group(
            Doc("insurance_cert", "2026-03-28"),
            Doc("supplier_confirmation", "2026-03-14"),
            Doc("photo", "2026-04-02"),
        )
        assertEquals(
            listOf(DocumentGroup.CONFIRMATIONS, DocumentGroup.INSURANCE, DocumentGroup.PHOTOS),
            groups.map { it.first },
        )
    }

    @Test
    fun `puts the newest document first inside a group`() {
        val groups = group(
            Doc("passport", "2026-03-20T10:00:00Z"),
            Doc("visa", "2026-05-01T10:00:00Z"),
        )
        assertEquals(1, groups.size)
        assertEquals(listOf("visa", "passport"), groups[0].second.map { it.kind })
    }

    @Test
    fun `drops empty groups rather than rendering a bare heading`() {
        val groups = group(Doc("photo", "2026-04-02"))
        assertEquals(listOf(DocumentMessages.GROUP_PHOTOS), groups.map { it.first.label })
    }

    @Test
    fun `returns nothing for an empty library so the caller shows the empty state`() {
        assertEquals(emptyList(), group())
    }

    @Test
    fun `names the traveler and the advisor never a role word`() {
        assertEquals("added by you", uploadedByLabel(true))
        assertEquals("added by Gyasi", uploadedByLabel(false))
    }
}
