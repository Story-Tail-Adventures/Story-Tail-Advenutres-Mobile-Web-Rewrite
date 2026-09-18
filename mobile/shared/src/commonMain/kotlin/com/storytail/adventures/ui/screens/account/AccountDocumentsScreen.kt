package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.TripDocumentView
import com.storytail.adventures.domain.account.DocumentLibraryMessages
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.groupDocuments
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.DocumentRow
import com.storytail.adventures.ui.components.client.SectionHeading
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.5.4 Travel Documents, the ACCOUNT-WIDE library — docs/Screen-Inventory.md §2.5.4,
 * §4.4 Pattern B, and design/source-prototype/screens/client-account-mobile.jsx
 * `M254_TravelDocs`. P1. Per-trip documents are §2.2.6, at [AppRoute.TripDocuments].
 *
 * READ-ONLY. The read works; none of the three mutating actions has a door.
 *
 *  · UPLOAD IS DISABLED, and this is the section's biggest gap. `trip-document` is the ONLY
 *    insert into `document` anywhere in the repo and it hard-requires a `tripId`, keying the
 *    object under `trips/<tripId>/`. The MODEL is ready — `document.trip_id` is nullable and
 *    both read paths already handle a trip-less row — but the WRITE door is trip-only, so a
 *    passport that belongs to a person rather than to one trip cannot be created from
 *    anywhere. A trip picker is NOT the fix: the just-onboarded traveler this screen serves
 *    may have no trip to pick, and filing their passport under an arbitrary trip drops it
 *    into that trip's §2.2.6 library too.
 *  · "Send to Gyasi" is deferred with it — `trip-message` already filters
 *    `attachmentDocumentIds` to documents the caller owns, so the path exists, but the
 *    control belongs with the upload work.
 *  · "Delete" is an ARCHIVE (`document.archived_at`) and has no function either. Rows are
 *    never removed: `card_use_event.receipt_document_id` and `commission_import.document_id`
 *    reference them.
 *
 * NO THUMBNAIL GRID, against the artboard, and for a stronger reason on mobile than on web:
 * Storage is addressed by key, `storage_key` is withheld, and `trip-document-url` signs ON
 * DEMAND precisely so a five-minute URL for a file nobody opened is not a false entry on the
 * access trail. A grid would sign every document and write an access record per document per
 * screen load. §4.4's Pattern B asks for a list here anyway.
 */
@Composable
fun AccountDocumentsScreen(
    state: Loadable<List<TripDocumentView>>,
    signing: String?,
    openError: String?,
    onBack: () -> Unit,
    onOpen: (TripDocumentView) -> Unit,
    onOpenTrips: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = DocumentLibraryMessages.TITLE, onBack = onBack) },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(12.dp))
            Text(
                DocumentLibraryMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(14.dp))

            when (state) {
                is Loadable.Loading -> DocumentsSkeleton()

                // FAILS CLOSED, unlike the rest of §2.5. An empty list here would tell a
                // traveler they have no passport on file, which is a lie that looks like
                // data loss — §2.2.6's rule, and this screen reads the same table.
                is Loadable.Failed -> ClientErrorState(
                    title = "We could not open your documents",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )

                // Listed rather than folded into an `else`: a sixth Loadable state should
                // fail to compile here. Neither is reachable — the loader produces only
                // Loading, Ready and Failed — and both render as the empty state, which is
                // the honest reading of "no rows came back".
                is Loadable.Empty, is Loadable.Unauthorized -> DocumentsEmpty(onOpenTrips)

                is Loadable.Ready ->
                    if (state.value.isEmpty()) {
                        DocumentsEmpty(onOpenTrips)
                    } else {
                        DocumentsList(
                            documents = state.value,
                            signing = signing,
                            openError = openError,
                            onOpen = onOpen,
                        )
                    }
            }

            Spacer(Modifier.height(14.dp))
            // Disabled with the reason, per the §2.2 phase-leak rule. See the header: there
            // is no account-scoped upload door, only a trip-scoped one.
            // 48dp like every other CTA in §2.5: Material3's default button is 40dp, under
            // §4.2's 44pt floor, and a disabled control still has to hold its place in the
            // layout at the size it will be when it works.
            Button(
                onClick = {},
                enabled = false,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                StoryTailGlyph(StoryTailMark.UPLOAD, 15.dp, MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.width(8.dp))
                Text(DocumentLibraryMessages.UPLOAD_CTA)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                DocumentLibraryMessages.UPLOAD_DEFERRED,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun DocumentsList(
    documents: List<TripDocumentView>,
    signing: String?,
    openError: String?,
    onOpen: (TripDocumentView) -> Unit,
) {
    val groups = groupDocuments(
        documents = documents,
        kindOf = { it.kind },
        createdAtOf = { it.createdAt },
    )

    if (openError != null) {
        Text(
            text = openError,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(10.dp))
    }

    for ((group, rows) in groups) {
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
            rows.forEachIndexed { index, document ->
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

    Row(
        Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceContainerLow,
                RoundedCornerShape(StoryTailRadius.md),
            )
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StoryTailGlyph(StoryTailMark.LOCK, 17.dp, MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            DocumentLibraryMessages.PRIVACY_NOTE,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DocumentsEmpty(onOpenTrips: () -> Unit) {
    ClientEmptyState(
        title = DocumentLibraryMessages.EMPTY_TITLE,
        body = DocumentLibraryMessages.EMPTY_BODY,
        mark = StoryTailMark.PASSPORT,
    )
    Spacer(Modifier.height(6.dp))
    TextButton(onClick = onOpenTrips, modifier = Modifier.fillMaxWidth()) {
        Text(DocumentLibraryMessages.EMPTY_CTA)
    }
}

/** §5's skeleton, shaped like the list rather than a spinner on blank. */
@Composable
private fun DocumentsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(2) {
            SkeletonBlock(Modifier.width(140.dp).height(14.dp))
            SkeletonBlock(Modifier.fillMaxWidth().height(70.dp))
            Spacer(Modifier.height(6.dp))
        }
    }
}
