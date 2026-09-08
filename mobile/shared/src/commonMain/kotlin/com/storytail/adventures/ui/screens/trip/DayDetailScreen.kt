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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.DayWeather
import com.storytail.adventures.api.ItineraryView
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.components.client.formatLongDay
import com.storytail.adventures.ui.nav.rememberPlatformLinks
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.2.5 Itinerary Day Detail — see docs/Screen-Inventory.md §2.2.5 and §4.4
 * (Pattern I, "maps are full-screen on mobile") and
 * design/source-prototype/screens/client-trip-mobile.jsx (M225_DayDetail). P1.
 *
 * The weather card sits ABOVE the activities, not in a rail: it is the reason you open this
 * screen on the morning of, so it is the day's context rather than a sidebar afterthought.
 *
 * The desktop artboard's "OFFLINE-READY / Synced 2h ago" card is absent. Offline UI is Phase
 * 3 per BRD §13.3 even though the SqlDelight cache is Phase 1 — and until that cache is
 * actually wired to these reads, a "synced" badge would be decoration claiming a guarantee.
 *
 * "Mark as done" is PER-DEVICE and in-memory only here. On web it survives a reload through
 * localStorage; on mobile the equivalent is DataStore, which is a dependency and a migration
 * for a feature Screen-Inventory itself marks "(optional check-in feature)". So the tick
 * lasts as long as the screen does, and that is written down rather than discovered.
 */
@Composable
fun DayDetailScreen(
    state: Loadable<ItineraryView>,
    dayNumber: Int,
    onBack: () -> Unit,
    onOpenDay: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SkeletonBlock(Modifier.fillMaxWidth().height(120.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(160.dp))
            }

            is Loadable.Ready -> {
                val day = state.value.days.firstOrNull { it.dayNumber == dayNumber }
                if (day == null) {
                    Box(Modifier.padding(16.dp)) {
                        ClientEmptyState(
                            title = ItineraryMessages.EMPTY_ITINERARY_TITLE,
                            body = ItineraryMessages.EMPTY_ITINERARY_BODY,
                            mark = StoryTailMark.PASSPORT,
                        )
                    }
                } else {
                    val scheme = MaterialTheme.colorScheme
                    val links = rememberPlatformLinks()
                    val days = state.value.days
                    val index = days.indexOfFirst { it.dayNumber == dayNumber }

                    Column(Modifier.padding(16.dp)) {
                        Row(
                            Modifier.clickable(onClick = onBack),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            StoryTailGlyph(StoryTailMark.ARROW_LEFT, 14.dp, scheme.onSurfaceVariant)
                            Spacer(Modifier.width(6.dp))
                            Text(
                                ItineraryMessages.HEADING,
                                style = MaterialTheme.typography.bodySmall,
                                color = scheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                ItineraryMessages.dayLabel(day.dayNumber),
                                style = LocalStoryTailBrandTypography.current.script,
                                color = StoryTailBrand.Burgundy,
                            )
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    day.label ?: day.date?.let(::formatLongDay) ?: "",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = scheme.onSurface,
                                )
                                day.date?.let {
                                    Text(
                                        formatLongDay(it),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = scheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(14.dp))
                        day.weather?.let {
                            WeatherCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        day.summary?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodyLarge,
                                color = scheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                        }

                        if (day.activities.isEmpty()) {
                            EmptyComponentCard(
                                mark = StoryTailMark.PLANE,
                                title = ItineraryMessages.emptyDayTitle(day.dayNumber),
                                body = ItineraryMessages.EMPTY_DAY_BODY,
                            )
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                for (activity in day.activities) {
                                    // Keyed so per-item state belongs to the activity
                                    // rather than to the position it happens to occupy.
                                    key(activity.id) {
                                        Column {
                                            ActivityCard(
                                                activity = activity,
                                                showDetail = true,
                                                onCall = links::dial,
                                                onMap = links::openMap,
                                            )
                                            Spacer(Modifier.height(6.dp))
                                            MarkDoneButton(activity.id)
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(Modifier.height(18.dp))
                        Row(Modifier.fillMaxWidth()) {
                            if (index > 0) {
                                OutlinedButton(onClick = { onOpenDay(days[index - 1].dayNumber) }) {
                                    Text(ItineraryMessages.dayShort(days[index - 1].dayNumber))
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            if (index in 0 until days.lastIndex) {
                                OutlinedButton(onClick = { onOpenDay(days[index + 1].dayNumber) }) {
                                    Text(ItineraryMessages.dayShort(days[index + 1].dayNumber))
                                }
                            }
                        }

                        Spacer(Modifier.height(18.dp))
                        ImportantInfo(state.value)
                    }
                }
            }

            else -> Box(Modifier.padding(16.dp)) {
                ClientEmptyState(
                    title = ItineraryMessages.NOT_PUBLISHED_TITLE,
                    body = ItineraryMessages.NOT_PUBLISHED_BODY,
                    mark = StoryTailMark.PASSPORT,
                )
            }
        }
    }
}

/**
 * Per-activity check-in, held in `rememberSaveable` so it survives a rotation and a process
 * death but not a fresh launch. See the screen's note for why it goes no further.
 *
 * KEYED ON THE ACTIVITY ID, and it has to be. `TripRoute` moves between days with
 * `nav.replace`, which overwrites the top stack entry rather than pushing a new one, so the
 * `ItineraryDay` branch — and everything under it — recomposes IN PLACE instead of being
 * disposed. A bare `rememberSaveable` is positional, so the third activity of day 2
 * inherited whatever the third activity of day 1 was left at: tick two things on Monday,
 * swipe to Tuesday, and two unrelated activities are ticked. Passing the id as an INPUT
 * resets the state whenever the activity behind the slot changes.
 */
@Composable
private fun MarkDoneButton(activityId: String) {
    var done by rememberSaveable(activityId) { mutableStateOf(false) }
    if (done) {
        Button(onClick = { done = false }) { Text(ItineraryMessages.MARKED_DONE) }
    } else {
        OutlinedButton(onClick = { done = true }) { Text(ItineraryMessages.MARK_DONE) }
    }
}

/** Agent-authored weather — see the DayWeather note in TripRepository. */
@Composable
fun WeatherCard(weather: DayWeather) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            ItineraryMessages.WEATHER,
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryTailGlyph(StoryTailMark.SUN, 30.dp, StoryTailBrand.Sunset)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                weather.highF?.let {
                    Text(
                        "$it°F",
                        style = MaterialTheme.typography.headlineSmall,
                        color = scheme.onSurface,
                    )
                }
                Text(
                    listOfNotNull(
                        weather.summary,
                        weather.windMph?.let { w ->
                            "$w mph" + (weather.windDir?.let { " $it" } ?: "")
                        },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }
        }
        weather.uvIndex?.takeIf { it >= 8 }?.let { uv ->
            Spacer(Modifier.height(10.dp))
            Text(
                ItineraryMessages.uvWarning(uv),
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurface,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(scheme.tertiaryContainer, RoundedCornerShape(StoryTailRadius.sm))
                    .padding(10.dp),
            )
        }
    }
}
