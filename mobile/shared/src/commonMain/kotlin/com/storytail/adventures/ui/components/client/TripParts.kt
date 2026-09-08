package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.TripSummary
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.domain.trip.imageKeyForTrip
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.public.PublicPhoto
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.LocalStoryTailStatusColors
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.datetime.number

/**
 * The pieces every §2.2 screen shares.
 *
 * These started as private functions inside DashboardScreen and moved here the moment 2.2.2
 * needed the same status chip and the same trip card — the same reason §2.0's FeatureGlyph
 * became StoryTailGlyph. Eight more screens follow; a second copy of the chip mapping is how
 * one of them ends up a shade off.
 */

/** The status chip. Maps [StatusChip] onto the eight token pairs in StoryTailStatusColors. */
@Composable
fun StatusChipPill(chip: StatusChip, label: String, modifier: Modifier = Modifier) {
    val colors = LocalStoryTailStatusColors.current
    val (bg, fg) = when (chip) {
        StatusChip.PROPOSAL -> colors.proposalBg to colors.proposalFg
        StatusChip.BOOKED -> colors.bookedBg to colors.bookedFg
        StatusChip.DUE -> colors.dueBg to colors.dueFg
        StatusChip.TRAVELING -> colors.travelingBg to colors.travelingFg
        StatusChip.PAST -> colors.pastBg to colors.pastFg
        StatusChip.INQUIRY -> colors.inquiryBg to colors.inquiryFg
        StatusChip.CANCELLED -> colors.cancelledBg to colors.cancelledFg
    }
    Text(
        text = label.uppercase(),
        style = LocalStoryTailBrandTypography.current.labelXS,
        color = fg,
        modifier = modifier.background(bg, PillShape).padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

/**
 * A trip's photograph with the navy scrim that makes white text legible over it.
 *
 * [grayscale] is 2.2.10's treatment for a cancelled trip. It is a colour wash rather than a
 * real desaturation because Compose has no per-node saturation filter without a RenderEffect,
 * and a heavier navy over the photo reads the same at this size.
 */
@Composable
fun TripHeroPhoto(
    trip: TripSummary,
    height: Int,
    grayscale: Boolean = false,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = height.dp)
            .clip(RoundedCornerShape(StoryTailRadius.xl)),
    ) {
        PublicPhoto(
            imageKey = imageKeyForTrip(trip.id, trip.tripType, trip.destinations),
            modifier = Modifier.fillMaxWidth().heightIn(min = height.dp),
            contentDescription = null,
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = height.dp)
                    .background(
                        if (grayscale) {
                            Brush.linearGradient(
                                listOf(
                                    StoryTailBrand.Navy.copy(alpha = 0.72f),
                                    StoryTailBrand.Navy.copy(alpha = 0.86f),
                                ),
                            )
                        } else {
                            Brush.linearGradient(
                                listOf(
                                    StoryTailBrand.Burgundy.copy(alpha = 0.82f),
                                    StoryTailBrand.Navy.copy(alpha = 0.70f),
                                ),
                            )
                        },
                    ),
            )
        }
        Box(Modifier.padding(16.dp)) { content() }
    }
}

/** The image-top trip card 2.2.1 and 2.2.2 both use. */
@Composable
fun TripCard(
    trip: TripSummary,
    onClick: () -> Unit,
    /** 2.2.2 shows the trip value; 2.2.1's compact cards do not. */
    valueLine: String? = null,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(StoryTailRadius.lg))
            .background(scheme.surfaceContainerLowest)
            .clickable(onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().height(132.dp)) {
            PublicPhoto(
                imageKey = imageKeyForTrip(trip.id, trip.tripType, trip.destinations),
                modifier = Modifier.fillMaxWidth().height(132.dp),
                contentDescription = null,
            )
            Box(Modifier.padding(10.dp)) { StatusChipPill(trip.chip, trip.statusLabel) }
        }
        Column(Modifier.padding(12.dp)) {
            Text(trip.title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Text(
                listOfNotNull(
                    formatTripDates(trip.startDate, trip.endDate),
                    trip.destinations.firstOrNull(),
                    "${trip.travelerCount} travelers",
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
            valueLine?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
        }
    }
}

/** A section heading with a rule and an optional trailing action. */
@Composable
fun SectionHeading(
    heading: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            heading,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
    HorizontalDivider(color = scheme.outlineVariant)
}

/**
 * The two-column key/value grid the desktop artboards draw at three columns.
 *
 * [wide] rows span both columns, for a value too long to sit beside another.
 */
@Composable
fun KeyGrid(rows: List<Triple<String, String, Boolean>>) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        var index = 0
        while (index < rows.size) {
            val row = rows[index]
            if (row.third) {
                KeyValue(row.first, row.second, Modifier.fillMaxWidth())
                index += 1
            } else {
                val next = rows.getOrNull(index + 1)?.takeIf { !it.third }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    KeyValue(row.first, row.second, Modifier.weight(1f))
                    if (next != null) {
                        KeyValue(next.first, next.second, Modifier.weight(1f))
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                }
                index += if (next != null) 2 else 1
            }
        }
    }
}

@Composable
private fun KeyValue(label: String, value: String, modifier: Modifier) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier) {
        Text(
            label.uppercase(),
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(2.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
    }
}

/**
 * A card in a container colour, for the several tonal blocks §2.2 draws.
 *
 * The foreground is the caller's to apply. An earlier version threaded it in through a
 * wrapper class so callers could not forget it, which bought one saved argument at the cost
 * of a type nobody would guess at — Compose's own convention is an explicit colour.
 */
@Composable
fun TonalCard(
    background: Color,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(StoryTailRadius.lg))
            .padding(16.dp),
        content = content,
    )
}

/** §5's empty state: a glyph, a title, a line of body. */
@Composable
fun ClientEmptyState(
    title: String,
    body: String,
    mark: StoryTailMark = StoryTailMark.PLANE,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StoryTailGlyph(mark, 26.dp, scheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, color = scheme.onSurface)
        Spacer(Modifier.height(6.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** §5's error state: plain language, a retry, and never a stack trace. */
@Composable
fun ClientErrorState(title: String, body: String, retryLabel: String, onRetry: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = scheme.error)
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
        Spacer(Modifier.height(14.dp))
        TextButton(onClick = onRetry) { Text(retryLabel) }
    }
}

/** A layout-shaped skeleton block. §5 rules out spinner-on-blank. */
@Composable
fun SkeletonBlock(modifier: Modifier) {
    Box(
        modifier.background(
            MaterialTheme.colorScheme.surfaceContainerHigh,
            RoundedCornerShape(StoryTailRadius.sm),
        ),
    )
}

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/**
 * "Nov 13 – 20, 2026", collapsing the month when a trip does not cross one. The TypeScript
 * twin is `formatTripDates` in web/lib/trips/format.ts.
 */
fun formatTripDates(start: LocalDate?, end: LocalDate?): String {
    if (start == null) return "Dates to come"
    val s = "${MONTHS[start.month.number - 1]} ${start.day}"
    if (end == null) return "$s, ${start.year}"
    return if (start.year == end.year && start.month == end.month) {
        "$s – ${end.day}, ${end.year}"
    } else {
        "$s – ${MONTHS[end.month.number - 1]} ${end.day}, ${end.year}"
    }
}

/** "Sep 21", for a due date beside an amount. */
fun formatDay(date: LocalDate): String = "${MONTHS[date.month.number - 1]} ${date.day}"

/**
 * "Friday 14 August", for a day-detail heading.
 *
 * `LONG_MONTHS`, not [MONTHS] — that list is the short one, shared with the compact date
 * formatters, so this produced "Friday 14 Aug" while the web twin produced "Friday, August
 * 14" and both doc comments claimed a third thing. A day heading is the largest piece of
 * text on 2.2.5, which makes it the worst place for the stacks to disagree.
 */
fun formatLongDay(date: LocalDate): String {
    val weekday = date.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }
    return "$weekday ${date.day} ${LONG_MONTHS[date.month.number - 1]}"
}

/** Spelled-out month names. [MONTHS] stays short for the compact formatters. */
private val LONG_MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

/**
 * Money without `java.text` — this is commonMain and has to work on iOS.
 *
 * Integer arithmetic throughout (CLAUDE.md rule 5): the cents never become a Double, so
 * nothing rounds. Whole units when the cents are zero.
 */
fun formatMoney(amountCents: Long, currency: String): String {
    val symbol = if (currency == "USD") "$" else "$currency "
    val whole = amountCents / 100
    val cents = (amountCents % 100).toInt()
    val grouped = whole.toString().reversed().chunked(3).joinToString(",").reversed()
    return if (cents == 0) "$symbol$grouped" else "$symbol$grouped.${cents.toString().padStart(2, '0')}"
}

/** `all_inclusive` → "All-inclusive". The enum is not copy. */
fun humaniseTripType(tripType: String): String = when (tripType) {
    "cruise" -> "Cruise"
    "all_inclusive" -> "All-inclusive"
    "multi_destination" -> "Multi-destination"
    "group" -> "Group trip"
    "custom" -> "Custom"
    else -> tripType.replace('_', ' ')
}

/** Nights between two dates, or null when either is missing or the range is degenerate. */
fun nightsBetween(start: LocalDate?, end: LocalDate?): Int? {
    if (start == null || end == null) return null
    return start.daysUntil(end).takeIf { it > 0 }
}
