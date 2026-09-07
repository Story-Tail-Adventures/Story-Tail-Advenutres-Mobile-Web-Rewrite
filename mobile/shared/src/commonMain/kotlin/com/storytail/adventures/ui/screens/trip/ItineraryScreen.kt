package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.ItineraryActivity
import com.storytail.adventures.api.ItineraryDay
import com.storytail.adventures.api.ItineraryView
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.StatusChipPill
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.components.client.formatTripDates
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.2.4 Itinerary Viewer — see docs/Screen-Inventory.md §2.2.4 and §4.4 (Pattern I:
 * "single column reading width, generous line height, large readable type (17pt body); day
 * navigator as a horizontal scrollable chip strip") and
 * design/source-prototype/screens/client-trip-mobile.jsx (M224_ItineraryViewer). P1.
 *
 * Also Screen 2.2.8 Empty Trip Component States, which §4.4 places "inline within Itinerary
 * Viewer".
 *
 * ONE DAY AT A TIME here, unlike the web twin which renders every day as one scrollable
 * document. The difference is deliberate and it is the day navigator: §4.4 asks for a chip
 * STRIP on mobile, and a strip is a control that selects — anchors into a very long scroll
 * would leave the strip and the content disagreeing about where you are. On web the strip is
 * a sticky sidebar next to a reading column, where anchors are exactly right.
 */
@Composable
fun ItineraryScreen(
    state: Loadable<ItineraryView>,
    selectedDay: Int,
    onSelectDay: (Int) -> Unit,
    onOpenDay: (dayNumber: Int) -> Unit,
    onBack: () -> Unit,
    onAskGyasi: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SkeletonBlock(Modifier.fillMaxWidth().height(80.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(120.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(120.dp))
            }

            is Loadable.Failed, is Loadable.Empty, is Loadable.Unauthorized ->
                Box(Modifier.padding(16.dp)) {
                    ClientEmptyState(
                        title = ItineraryMessages.NOT_PUBLISHED_TITLE,
                        body = ItineraryMessages.NOT_PUBLISHED_BODY,
                        mark = StoryTailMark.PASSPORT,
                    )
                }

            is Loadable.Ready -> Body(
                itinerary = state.value,
                selectedDay = selectedDay,
                onSelectDay = onSelectDay,
                onOpenDay = onOpenDay,
                onBack = onBack,
                onAskGyasi = onAskGyasi,
            )
        }
    }
}

@Composable
private fun Body(
    itinerary: ItineraryView,
    selectedDay: Int,
    onSelectDay: (Int) -> Unit,
    onOpenDay: (Int) -> Unit,
    onBack: () -> Unit,
    onAskGyasi: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val trip = itinerary.trip

    Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(
            Modifier.clickable(onClick = onBack),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StoryTailGlyph(StoryTailMark.ARROW_LEFT, 14.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.width(6.dp))
            Text(
                ItineraryMessages.BACK,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(8.dp))
        StatusChipPill(trip.chip, trip.statusLabel)
        Spacer(Modifier.height(8.dp))
        Text(trip.title, style = MaterialTheme.typography.headlineSmall, color = scheme.onSurface)
        Text(
            listOfNotNull(
                formatTripDates(trip.startDate, trip.endDate),
                "${trip.travelerCount} travelers",
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
    }

    HorizontalDivider(color = scheme.outlineVariant)

    if (itinerary.days.size > 1) {
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (day in itinerary.days) {
                val on = day.dayNumber == selectedDay
                Text(
                    ItineraryMessages.dayShort(day.dayNumber),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (on) scheme.onPrimary else scheme.onSurface,
                    modifier = Modifier
                        .background(
                            if (on) scheme.primary else scheme.surfaceContainerHigh,
                            PillShape,
                        )
                        .clickable { onSelectDay(day.dayNumber) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
        HorizontalDivider(color = scheme.outlineVariant)
    }

    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Design-System §2.4: "the intro note Gyasi writes per trip is the place to let the
        // voice come through". 17sp per §4.4's reading guidance.
        itinerary.introNote?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyLarge,
                color = scheme.onSurfaceVariant,
            )
        }

        val day = itinerary.days.firstOrNull { it.dayNumber == selectedDay }
            ?: itinerary.days.firstOrNull()

        if (day == null) {
            EmptyComponentCard(
                mark = StoryTailMark.PASSPORT,
                title = ItineraryMessages.EMPTY_ITINERARY_TITLE,
                body = ItineraryMessages.EMPTY_ITINERARY_BODY,
            )
        } else {
            DaySection(day = day, onOpenDay = { onOpenDay(day.dayNumber) })
        }

        EmptyComponentStates(itinerary = itinerary, onAskGyasi = onAskGyasi)

        itinerary.closingNote?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                it,
                style = LocalStoryTailBrandTypography.current.script,
                color = StoryTailBrand.Burgundy,
            )
        }

        // The PDF export is not built — it needs a renderer and a signed download. Disabled
        // and saying so beats a button that produces nothing.
        Spacer(Modifier.height(8.dp))
        Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
            Text(ItineraryMessages.DOWNLOAD_PDF)
        }
        Text(
            ItineraryMessages.SHARE_NOTE,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )

        ImportantInfo(itinerary)
    }
}

@Composable
private fun DaySection(day: ItineraryDay, onOpenDay: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.Bottom) {
        Text(
            ItineraryMessages.dayLabel(day.dayNumber),
            style = LocalStoryTailBrandTypography.current.script,
            color = StoryTailBrand.Burgundy,
        )
        Spacer(Modifier.width(10.dp))
        Text(
            day.label ?: formatTripDates(day.date, null),
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            ItineraryMessages.OPEN_DAY,
            style = MaterialTheme.typography.labelLarge,
            color = scheme.primary,
            modifier = Modifier.clickable(onClick = onOpenDay),
        )
    }
    day.summary?.let {
        Spacer(Modifier.height(4.dp))
        Text(it, style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant)
    }
    Spacer(Modifier.height(10.dp))
    if (day.activities.isEmpty()) {
        EmptyComponentCard(
            mark = StoryTailMark.PLANE,
            title = ItineraryMessages.emptyDayTitle(day.dayNumber),
            body = ItineraryMessages.EMPTY_DAY_BODY,
        )
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (activity in day.activities) ActivityCard(activity)
        }
    }
}

@Composable
fun ActivityCard(activity: ItineraryActivity, showDetail: Boolean = false, onCall: ((String) -> Unit)? = null, onMap: ((String) -> Unit)? = null) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Row {
            // 68dp, not 52: "AFTERNOON" at labelXS wrapped to "AFTERN / OON" in the 52dp
            // column this first shipped with. maxLines pins it so a longer label added later
            // truncates rather than silently re-wrapping.
            Column(Modifier.width(68.dp)) {
                activity.startTime?.let {
                    Text(
                        it.take(5),
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                        maxLines = 1,
                    )
                }
                Text(
                    blockLabel(activity.block),
                    style = LocalStoryTailBrandTypography.current.labelXS,
                    color = StoryTailBrand.Orange,
                    maxLines = 1,
                )
            }
            Box(
                Modifier.size(36.dp).background(scheme.secondaryContainer, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(activityMark(activity), 18.dp, scheme.onSecondaryContainer)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(activity.title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                activity.body?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
                activity.confirmationNumber?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${ItineraryMessages.CONFIRMATION} $it",
                        style = LocalStoryTailBrandTypography.current.mono,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
        }

        // Design-System §2.4 names the tip as the voice-forward moment inside a day, and
        // Screen-Inventory §2.2.4 lists it as a primary element. The DESKTOP artboard omits
        // it; M224 draws it, and this follows M224.
        activity.gyasisTip?.let {
            Spacer(Modifier.height(12.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.tertiaryContainer, RoundedCornerShape(StoryTailRadius.md))
                    .padding(12.dp),
            ) {
                Text(
                    ItineraryMessages.TIP,
                    style = LocalStoryTailBrandTypography.current.labelXS,
                    color = scheme.onTertiaryContainer.copy(alpha = 0.8f),
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    it,
                    style = LocalStoryTailBrandTypography.current.script,
                    color = scheme.onTertiaryContainer,
                )
            }
        }

        if (showDetail) {
            activity.address?.let { address ->
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.sm))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        address,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
                onMap?.let { open ->
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { open(address) }, modifier = Modifier.fillMaxWidth()) {
                        Text(ItineraryMessages.OPEN_IN_MAPS)
                    }
                }
            }
            activity.phone?.let { phone ->
                onCall?.let { call ->
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { call(phone) }, modifier = Modifier.fillMaxWidth()) {
                        Text(ItineraryMessages.CALL)
                    }
                }
            }
        }
    }
}

/**
 * 2.2.8's empty component states.
 *
 * `componentKinds` is what makes these honest: "your flights aren't booked yet" is only true
 * when the trip has no flight component, and saying it about a trip that has one would be
 * worse than saying nothing.
 */
@Composable
fun EmptyComponentStates(itinerary: ItineraryView, onAskGyasi: () -> Unit) {
    if ("flight" !in itinerary.componentKinds) {
        EmptyComponentCard(
            mark = StoryTailMark.PLANE,
            title = ItineraryMessages.EMPTY_FLIGHTS_TITLE,
            body = ItineraryMessages.EMPTY_FLIGHTS_BODY,
            actionLabel = ItineraryMessages.ASK_GYASI,
            onAction = onAskGyasi,
        )
    }
    if ("excursion" !in itinerary.componentKinds && "custom" !in itinerary.componentKinds) {
        EmptyComponentCard(
            mark = StoryTailMark.MESSAGE,
            title = ItineraryMessages.EMPTY_DINING_TITLE,
            body = ItineraryMessages.EMPTY_DINING_BODY,
        )
    }
}

@Composable
fun EmptyComponentCard(
    mark: StoryTailMark,
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).background(scheme.surfaceContainerHigh, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(mark, 16.dp, scheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(12.dp))
            Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
        }
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(10.dp))
            Button(onClick = onAction, modifier = Modifier.fillMaxWidth()) { Text(actionLabel) }
        }
    }
}

/** What the trip itself can answer. Nothing is asserted that no column holds. */
@Composable
fun ImportantInfo(itinerary: ItineraryView) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            ItineraryMessages.IMPORTANT_INFO,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(8.dp))
        val rows = buildList {
            itinerary.insuranceReference?.let {
                add("${ItineraryMessages.INSURANCE}: $it")
            }
            itinerary.emergencyPhone?.let {
                add(
                    "${ItineraryMessages.EMERGENCY}: " +
                        listOfNotNull(itinerary.emergencyName, it).joinToString(" · "),
                )
            }
        }
        if (rows.isEmpty()) {
            Text(
                ItineraryMessages.NO_IMPORTANT_INFO,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (row in rows) {
                    Text(
                        row,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurface,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        // Nothing records a visa requirement, and a wrong answer is somebody turned away at
        // a gate. So it asks rather than asserts.
        Text(
            ItineraryMessages.VISA_UNKNOWN,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
    }
}

private fun blockLabel(block: String): String = when (block) {
    "morning" -> ItineraryMessages.BLOCK_MORNING
    "afternoon" -> ItineraryMessages.BLOCK_AFTERNOON
    "evening" -> ItineraryMessages.BLOCK_EVENING
    else -> ItineraryMessages.BLOCK_ALL_DAY
}

/**
 * Which glyph an activity gets, inferred from what it says about itself.
 *
 * MATCHES THE TITLE, NOT THE BODY. Matching both put a dining glyph on "Catamaran to Booby
 * Cay" because its body reads "Snorkel gear and lunch included" — the meal is a detail, not
 * the nature of the activity. Only the title says what the thing IS.
 *
 * Vessels are tested before meals for the same reason: a boat trip that feeds you is a boat
 * trip.
 */
internal fun activityMark(activity: ItineraryActivity): StoryTailMark {
    val title = activity.title.lowercase()
    return when {
        Regex("flight|airport|depart|→|\\baa \\d").containsMatchIn(title) -> StoryTailMark.PLANE
        Regex("transfer|taxi|shuttle|driver").containsMatchIn(title) -> StoryTailMark.CARD
        Regex("catamaran|snorkel|boat|cruise|sail|\\bcay\\b|ferry").containsMatchIn(title) ->
            StoryTailMark.SHIP
        Regex("check ?in|resort|hotel|suite|villa").containsMatchIn(title) -> StoryTailMark.HOME
        Regex("dinner|lunch|breakfast|restaurant|hibachi|table").containsMatchIn(title) ->
            StoryTailMark.MESSAGE
        else -> StoryTailMark.SUN
    }
}

/** Copy for 2.2.4, 2.2.5 and 2.2.8, mirroring the web content module. */
object ItineraryMessages {
    const val HEADING = "Itinerary"
    const val BACK = "Back to the trip"
    const val OPEN_DAY = "Open"
    const val DOWNLOAD_PDF = "Download the full itinerary (PDF)"
    const val SHARE_NOTE = "Forward the PDF to anyone travelling with you."
    const val NOT_PUBLISHED_TITLE = "Your itinerary isn’t ready yet"
    const val NOT_PUBLISHED_BODY =
        "Gyasi is still writing it. It appears here the moment he publishes, and you’ll get an email when it does."
    const val BLOCK_MORNING = "MORNING"
    const val BLOCK_AFTERNOON = "AFTERNOON"
    const val BLOCK_EVENING = "EVENING"
    const val BLOCK_ALL_DAY = "ALL DAY"
    const val CONFIRMATION = "CONFIRMATION"
    const val TIP = "GYASI’S TIP"
    const val OPEN_IN_MAPS = "Open in Maps"
    const val CALL = "Call"
    const val MARK_DONE = "Mark as done"
    const val MARKED_DONE = "Done"
    const val IMPORTANT_INFO = "Important info"
    const val INSURANCE = "Insurance"
    const val EMERGENCY = "Emergency contact"
    const val VISA_UNKNOWN = "Ask Gyasi about visas"
    const val NO_IMPORTANT_INFO = "Nothing filed for this trip yet."
    const val WEATHER = "WEATHER"
    const val EMPTY_FLIGHTS_TITLE = "Your flights aren’t booked yet"
    const val EMPTY_FLIGHTS_BODY =
        "Gyasi is still working on the best departure for you. They’ll appear here the moment they’re confirmed."
    const val EMPTY_DINING_TITLE = "No dining reserved yet"
    const val EMPTY_DINING_BODY = "Gyasi will add your reservations here once he has them."
    const val EMPTY_DAY_BODY =
        "Nothing planned — which is allowed. Tell Gyasi if you’d like a tour, or leave it for the pool."
    const val ASK_GYASI = "Ask Gyasi where things stand"
    const val EMPTY_ITINERARY_TITLE = "No days yet"
    const val EMPTY_ITINERARY_BODY =
        "Gyasi adds the days as the pieces of the trip are confirmed."

    fun dayLabel(n: Int): String = "Day ${n.toString().padStart(2, '0')}"
    fun dayShort(n: Int): String = "Day $n"
    fun emptyDayTitle(n: Int): String = "Day $n is open"
    fun uvWarning(uv: Int): String = "UV index $uv — pack the reef-safe sunscreen."
}
