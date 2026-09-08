package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.api.TripDocumentView
import com.storytail.adventures.api.TripDocumentsSnapshot
import com.storytail.adventures.domain.trip.DocumentBadge
import com.storytail.adventures.domain.trip.DocumentMessages
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.documentBadge
import com.storytail.adventures.domain.trip.formatFileSize
import com.storytail.adventures.domain.trip.groupDocuments
import com.storytail.adventures.domain.trip.uploadedByLabel
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SectionHeading
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.2.6 Trip Document Library — docs/Screen-Inventory.md §2.2.6, §4.4 Pattern B
 * ("web is a grid, mobile is a LIST"), and
 * design/source-prototype/screens/client-trip-mobile.jsx (M226_TripDocuments). P1.
 *
 * A LIST, not the web twin's grid, and that is Pattern B rather than a shortcut: a 38×46
 * badge, a filename that must not truncate to nothing, and a size-and-attribution line do
 * not survive being put two-up on a 375pt screen. The artboard draws one card per group with
 * hairline dividers between rows, which is what this is.
 *
 * TWO NAMED PRIMARY ELEMENTS ARE NOT BUILT, matching the web twin:
 *
 *  * The upload CTA renders disabled. `trip-document` signs a PUT, but the file picker
 *    (which needs an `expect`/`actual` per platform), the progress state and the confirm
 *    step that replaces the placeholder `checksum_sha256` are the separate Document Upload
 *    screen §2.2.6 names among its related screens.
 *  * Per-document share is gone rather than disabled — the plan settled the share question
 *    as PDF-only with the secure link deferred to §2.8, so there is nothing to offer, and a
 *    dimmed control implies otherwise.
 *
 * The artboard's trailing `more_vert` button is also absent: it opened a menu whose only two
 * items were the two things above. The whole row is the tap target instead, which is a
 * bigger one.
 *
 * OPENING A FILE goes through `signDocumentUrl` and then the platform browser. There is no
 * other way: `document.storage_key` is outside the client column grant and the bucket has no
 * authenticated policies, so the Edge Function is the only door — and unlike web, there is
 * no server here to proxy it.
 */
@Composable
fun DocumentsScreen(
    state: Loadable<TripDocumentsSnapshot>,
    signing: String?,
    openError: String?,
    onBack: () -> Unit,
    onOpen: (TripDocumentView) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> DocumentsSkeleton(onBack)

            is Loadable.Failed -> Column(Modifier.padding(horizontal = 16.dp)) {
                DocumentsHeader(subtitle = null, onBack = onBack)
                ClientErrorState(
                    title = "We could not open your documents",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )
            }

            // Listed rather than folded into an `else`, matching the discipline App.kt uses
            // for routes: a sixth Loadable state should fail to compile here rather than
            // silently inherit whichever branch happened to be last.
            is Loadable.Unauthorized, is Loadable.Empty -> Column(
                Modifier.padding(horizontal = 16.dp),
            ) {
                DocumentsHeader(subtitle = null, onBack = onBack)
                ClientEmptyState(
                    title = DocumentMessages.EMPTY_TITLE,
                    body = DocumentMessages.EMPTY_BODY,
                    mark = StoryTailMark.PASSPORT,
                )
            }

            is Loadable.Ready -> DocumentsBody(
                snapshot = state.value,
                signing = signing,
                openError = openError,
                onBack = onBack,
                onOpen = onOpen,
            )
        }
    }
}

@Composable
private fun DocumentsHeader(subtitle: String?, onBack: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Spacer(Modifier.height(12.dp))
    Row(
        Modifier.clickable(onClick = onBack),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StoryTailGlyph(StoryTailMark.ARROW_LEFT, 14.dp, scheme.onSurfaceVariant)
        Spacer(Modifier.width(6.dp))
        Text(
            "Back to trip",
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
    }
    Spacer(Modifier.height(8.dp))
    Text("Documents", style = MaterialTheme.typography.headlineSmall, color = scheme.onSurface)
    if (subtitle != null) {
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    }
    Spacer(Modifier.height(14.dp))
}

@Composable
private fun DocumentsBody(
    snapshot: TripDocumentsSnapshot,
    signing: String?,
    openError: String?,
    onBack: () -> Unit,
    onOpen: (TripDocumentView) -> Unit,
) {
    val groups = groupDocuments(
        documents = snapshot.documents,
        kindOf = { it.kind },
        createdAtOf = { it.createdAt },
    )

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        DocumentsHeader(
            // The artboard's subtitle was "Everything for this trip, all in one place.
            // Auto-encrypted, share via secure link." Two of those clauses had to go:
            // "auto-encrypted" is jargon and a security claim on a surface that is not the
            // place to make one, and "share via secure link" advertised a §2.8 feature
            // nobody could tap. What is left is the true half, in Gyasi's register.
            subtitle = "Everything for ${snapshot.tripTitle}, in one place.",
            onBack = onBack,
        )

        if (openError != null) {
            Text(
                text = openError,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.height(10.dp))
        }

        if (groups.isEmpty()) {
            ClientEmptyState(
                title = DocumentMessages.EMPTY_TITLE,
                body = DocumentMessages.EMPTY_BODY,
                mark = StoryTailMark.PASSPORT,
            )
        } else {
            for ((group, documents) in groups) {
                SectionHeading(group.label)
                Spacer(Modifier.height(8.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceContainer,
                            RoundedCornerShape(StoryTailRadius.md),
                        ),
                ) {
                    documents.forEachIndexed { index, document ->
                        if (index > 0) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                        DocumentRow(
                            document = document,
                            signing = signing == document.id,
                            onOpen = { onOpen(document) },
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
            }
        }

        Spacer(Modifier.height(6.dp))

        // Disabled, with the reason. See the header note — a button that silently does
        // nothing is worse than one that says why not yet.
        Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
            Text(DocumentMessages.UPLOAD_CTA)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Adding documents from your phone arrives with the upload screen.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun DocumentRow(
    document: TripDocumentView,
    signing: Boolean,
    onOpen: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = !signing, onClick = onOpen)
            // The 46dp badge already clears §4.2's 44pt minimum; the vertical padding keeps
            // a one-line filename from shrinking the row below it.
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DocumentTile(documentBadge(document.mimeType))
        Spacer(Modifier.width(12.dp))

        Column(Modifier.weight(1f)) {
            Text(
                text = document.filename,
                style = MaterialTheme.typography.titleSmall,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "${formatFileSize(document.sizeBytes)} · ${uploadedByLabel(document.mine)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // The signing round trip is short but not instant — a network call plus an audit
        // write — and without a pending state the row looks inert on a slow connection and
        // gets tapped twice, which signs twice and puts two access records on the trail.
        if (signing) {
            Spacer(Modifier.width(8.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/** The artboards' 38×46 badge: burgundy for a PDF, orange for an image. */
@Composable
private fun DocumentTile(badge: DocumentBadge) {
    Box(
        Modifier
            .width(38.dp)
            .height(46.dp)
            .background(
                if (badge == DocumentBadge.PDF) StoryTailBrand.Burgundy else StoryTailBrand.Orange,
                RoundedCornerShape(4.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = badge.name,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

/** §5's skeleton, shaped like the list rather than a spinner on blank. */
@Composable
private fun DocumentsSkeleton(onBack: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        DocumentsHeader(subtitle = null, onBack = onBack)
        repeat(2) {
            SkeletonBlock(Modifier.width(140.dp).height(14.dp))
            SkeletonBlock(Modifier.fillMaxWidth().height(70.dp))
            Spacer(Modifier.height(6.dp))
        }
    }
}
