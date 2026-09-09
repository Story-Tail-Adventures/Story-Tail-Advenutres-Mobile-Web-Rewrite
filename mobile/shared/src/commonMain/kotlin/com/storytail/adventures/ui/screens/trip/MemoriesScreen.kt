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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.api.PastTripSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.MemoriesMessages
import com.storytail.adventures.domain.trip.nightsLabel
import com.storytail.adventures.domain.trip.photosHeading
import com.storytail.adventures.domain.trip.travelersLabel
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SectionHeading
import com.storytail.adventures.ui.components.client.StatusChipPill
import com.storytail.adventures.ui.components.client.TripHeroPhoto
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.components.client.formatTripDates
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.2.11 Past Trip Detail / Memory View — docs/Screen-Inventory.md §2.2.11, §4.4
 * (Pattern I plus a gallery, "photo grid is 1-col on mobile"), and
 * design/source-prototype/screens/client-trip-mobile.jsx (M2211_PastTrip). P1.
 *
 * THE NOTE FROM GYASI LEADS. The mobile artboard puts it first and says why, and the web
 * twin follows the mobile artboard rather than the desktop one here: a phone shows one
 * column, this screen exists for the feeling, and the emotional beat should not be the last
 * thing somebody scrolls past.
 *
 * THE PHOTOGRAPHS ARE NOT RENDERED FROM STORAGE, on either stack. Showing them would mean
 * signing a URL per photograph on every load — a five-minute URL and an `audit_event` each,
 * for images nobody may open. 2.2.6 is where a photograph gets opened and it signs on
 * demand, so each tile is the filename over the trip's own hero image and taps through to
 * the library. That is honest about being a placeholder rather than pretending to be the
 * photo.
 */
@Composable
fun MemoriesScreen(
    state: Loadable<PastTripSnapshot>,
    draft: String,
    saving: Boolean,
    notice: ReflectionNotice?,
    onDraftChange: (String) -> Unit,
    onSave: (Boolean) -> Unit,
    onBack: () -> Unit,
    onOpenDocuments: () -> Unit,
    onOpenItinerary: () -> Unit,
    onMessageGyasi: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> Box(
                Modifier.fillMaxWidth().padding(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "…",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            is Loadable.Failed -> Column(Modifier.padding(horizontal = 16.dp)) {
                ClientErrorState(
                    title = "We could not open this trip",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )
            }

            // Listed rather than folded into an `else` — see the note in DocumentsScreen.
            is Loadable.Unauthorized, is Loadable.Empty -> Column(
                Modifier.padding(16.dp),
            ) {
                ClientEmptyState(
                    title = "We could not find that trip",
                    body = "It may have been archived, or the link may belong to someone else.",
                    mark = StoryTailMark.USER,
                )
            }

            is Loadable.Ready -> MemoriesBody(
                snapshot = state.value,
                draft = draft,
                saving = saving,
                notice = notice,
                onDraftChange = onDraftChange,
                onSave = onSave,
                onBack = onBack,
                onOpenDocuments = onOpenDocuments,
                onOpenItinerary = onOpenItinerary,
                onMessageGyasi = onMessageGyasi,
            )
        }
    }
}

@Composable
private fun MemoriesBody(
    snapshot: PastTripSnapshot,
    draft: String,
    saving: Boolean,
    notice: ReflectionNotice?,
    onDraftChange: (String) -> Unit,
    onSave: (Boolean) -> Unit,
    onBack: () -> Unit,
    onOpenDocuments: () -> Unit,
    onOpenItinerary: () -> Unit,
    onMessageGyasi: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = LocalStoryTailBrandTypography.current
    val trip = snapshot.trip

    TripHeroPhoto(trip = trip, height = 230) {
        Column {
            // The back control carries its own scrim, same as 2.2.3's: the photo registry is
            // half bright sand and pale rock, where white at 85% disappears.
            Row(
                Modifier
                    .background(Color(0x8C0D2137), PillShape)
                    .clickable(onClick = onBack)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StoryTailGlyph(StoryTailMark.ARROW_LEFT, 13.dp, Color.White)
                Spacer(Modifier.width(6.dp))
                Text(
                    "Back to my trips",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White,
                )
            }
            Spacer(Modifier.height(10.dp))
            StatusChipPill(trip.chip, trip.statusLabel)
            Spacer(Modifier.height(8.dp))
            Text(trip.title, style = MaterialTheme.typography.titleLarge, color = Color.White)
            Text(
                listOfNotNull(
                    formatTripDates(trip.startDate, trip.endDate),
                    trip.destinations.joinToString(", ").ifEmpty { null },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(14.dp))

        snapshot.noteFromGyasi?.let { note ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.secondaryContainer, RoundedCornerShape(StoryTailRadius.lg))
                    .padding(18.dp),
            ) {
                Text(
                    MemoriesMessages.NOTE_OVERLINE.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSecondaryContainer.copy(alpha = 0.75f),
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    MemoriesMessages.NOTE_SCRIPT,
                    style = brand.script,
                    fontSize = 27.sp,
                    color = scheme.onSecondaryContainer,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    note,
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSecondaryContainer.copy(alpha = 0.9f),
                )
            }
            Spacer(Modifier.height(16.dp))
        }

        SectionHeading(photosHeading(snapshot.photos.size))
        Spacer(Modifier.height(10.dp))

        if (snapshot.photos.isEmpty()) {
            ClientEmptyState(
                title = MemoriesMessages.PHOTOS_EMPTY_TITLE,
                body = MemoriesMessages.PHOTOS_EMPTY_BODY,
                mark = StoryTailMark.SUN,
            )
        } else {
            // §4.4: one column on mobile. Full width, stacked, as the artboard draws it.
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                for (photo in snapshot.photos) {
                    Box(Modifier.fillMaxWidth().clickable(onClick = onOpenDocuments)) {
                        TripHeroPhoto(trip = trip, height = 200) {
                            Row(
                                Modifier
                                    .background(
                                        Color.Black.copy(alpha = 0.45f),
                                        RoundedCornerShape(8.dp),
                                    )
                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    photo.filename,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = {},
            enabled = false,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(MemoriesMessages.ADD_PHOTOS)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            MemoriesMessages.ADD_PHOTOS_DEFERRED,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(18.dp))
        ReflectionCard(
            snapshot = snapshot,
            draft = draft,
            saving = saving,
            notice = notice,
            onDraftChange = onDraftChange,
            onSave = onSave,
        )

        val snapshotLine = listOfNotNull(
            snapshot.nights?.let(::nightsLabel),
            travelersLabel(trip.travelerCount),
            trip.totalValueCents?.let { formatMoney(it, trip.currency) }?.let { "$it all-in" },
        ).joinToString(" · ")

        if (snapshotLine.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
                    .padding(16.dp),
            ) {
                Text(
                    MemoriesMessages.SNAPSHOT_HEADING.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Text(snapshotLine, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
            }
        }

        Spacer(Modifier.height(12.dp))

        // Only offered when there is a READABLE itinerary. An unpublished one is invisible
        // to this session, so the link would land on "not published yet" for a trip that
        // finished two years ago — which reads as broken rather than absent.
        if (snapshot.itineraryReady) {
            Button(onClick = onOpenItinerary, modifier = Modifier.fillMaxWidth()) {
                Text(MemoriesMessages.ITINERARY_CTA)
            }
            Spacer(Modifier.height(8.dp))
        }
        if (snapshot.documentCount > 0) {
            OutlinedButton(onClick = onOpenDocuments, modifier = Modifier.fillMaxWidth()) {
                Text(MemoriesMessages.DOCUMENTS_CTA)
            }
        }

        Spacer(Modifier.height(12.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(scheme.primaryContainer, RoundedCornerShape(StoryTailRadius.md))
                .padding(16.dp),
        ) {
            Text(
                MemoriesMessages.AGAIN_HEADING,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                MemoriesMessages.AGAIN_BODY,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onPrimaryContainer.copy(alpha = 0.9f),
            )
            Spacer(Modifier.height(10.dp))
            Button(onClick = onMessageGyasi, modifier = Modifier.fillMaxWidth()) {
                Text(MemoriesMessages.AGAIN_CTA)
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

/**
 * The reflection card.
 *
 * OPENS CLOSED, matching the web twin: §2.2.11 lists testimonial submission among its primary
 * elements, but this screen exists to be looked at rather than filled in, and a text field
 * sitting open under a photo gallery turns a memory into a form. The editor appears when
 * somebody taps, or immediately when they have a draft in progress — the one case where they
 * came back specifically to finish it.
 */
@Composable
private fun ReflectionCard(
    snapshot: PastTripSnapshot,
    draft: String,
    saving: Boolean,
    notice: ReflectionNotice?,
    onDraftChange: (String) -> Unit,
    onSave: (Boolean) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val reflection = snapshot.reflection
    val frozen = reflection != null && !reflection.editable

    // The comment above says this opens closed; it did not — there was no state at all, so
    // the editor was always expanded and native contradicted both the web twin and its own
    // docblock. Opens expanded only when there is a draft in progress, which is the one
    // case where somebody came back specifically to finish it. `rememberSaveable` so a
    // rotation mid-sentence does not collapse it.
    var open by rememberSaveable(reflection?.id) {
        mutableStateOf(reflection?.editable == true && reflection.body.isNotBlank())
    }

    if (frozen || notice is ReflectionNotice.Submitted) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(scheme.secondaryContainer, RoundedCornerShape(StoryTailRadius.md))
                .padding(16.dp),
        ) {
            Text(
                MemoriesMessages.REFLECTION_SUBMITTED_HEADING,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSecondaryContainer,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                MemoriesMessages.REFLECTION_SUBMITTED_BODY,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSecondaryContainer.copy(alpha = 0.9f),
            )
            reflection?.body?.let { body ->
                Spacer(Modifier.height(12.dp))
                Text(
                    body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSecondaryContainer.copy(alpha = 0.9f),
                )
            }
        }
        return
    }

    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
            .padding(16.dp),
    ) {
        Text(
            MemoriesMessages.REFLECTION_HEADING,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(5.dp))
        Text(
            MemoriesMessages.REFLECTION_BODY,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )

        when (notice) {
            is ReflectionNotice.Saved -> {
                Spacer(Modifier.height(8.dp))
                Text(
                    MemoriesMessages.REFLECTION_SAVED,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.secondary,
                )
            }

            is ReflectionNotice.Failed -> {
                Spacer(Modifier.height(8.dp))
                Text(
                    notice.detail ?: MemoriesMessages.REFLECTION_FAILED,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.error,
                )
            }

            else -> Unit
        }

        if (!open) {
            Spacer(Modifier.height(10.dp))
            Button(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (draft.isNotBlank()) MemoriesMessages.REFLECTION_EDIT_CTA
                    else MemoriesMessages.REFLECTION_CTA,
                )
            }
            return@Column
        }

        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = draft,
            onValueChange = onDraftChange,
            placeholder = {
                Text(
                    MemoriesMessages.REFLECTION_PLACEHOLDER,
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            minLines = 4,
            maxLines = 8,
            shape = RoundedCornerShape(StoryTailRadius.sm),
            // The field is the last thing on a long scroll, so the keyboard would otherwise
            // cover it entirely.
            modifier = Modifier.fillMaxWidth().imePadding(),
        )

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(
                onClick = { onSave(false) },
                enabled = !saving && draft.isNotBlank(),
                modifier = Modifier.weight(1f),
            ) {
                Text(MemoriesMessages.REFLECTION_SAVE)
            }
            Button(
                onClick = { onSave(true) },
                enabled = !saving && draft.isNotBlank(),
                modifier = Modifier.weight(1f),
            ) {
                Spacer(Modifier.width(0.dp))
                Text(MemoriesMessages.REFLECTION_SUBMIT)
            }
        }
    }
}
