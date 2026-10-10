import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { formatLongDay } from "@/lib/trips/format";
import { loadItinerary } from "@/lib/trips/queries";
import { BACK_LINK, BTN_SM, HEADER_BAND, HEADLINE, PAD, PROSE_COL } from "../../sx";
import { ITINERARY } from "../content";
import {
  ActivityCard,
  EmptyComponentCard,
  ImportantInfo,
  WeatherCard,
} from "../ItineraryParts";
import { MarkDoneList } from "./MarkDoneList";

export const metadata: Metadata = { title: "Day" };

/**
 * Screen 2.2.5 Itinerary Day Detail — see docs/Screen-Inventory.md §2.2.5 and §4.4
 * (Pattern I, and "maps are full-screen on mobile, inline on tablet/web") and
 * design/source-prototype/screens/client-trip.jsx (C225_DayDetail) + client-trip-mobile.jsx
 * (M225_DayDetail). P1.
 *
 * The weather card sits ABOVE the activities rather than in a right rail, because it is the
 * reason you would open this screen on the morning of — it is the day's context, not a
 * sidebar afterthought. M225 draws it that way.
 *
 * TWO THINGS THE DESKTOP ARTBOARD SHOWS THAT ARE NOT HERE:
 *   * The "OFFLINE-READY / Synced 2h ago" card. Offline UI is Phase 3 per BRD §13.3 and
 *     Screen-Inventory:714, even though the SqlDelight cache is Phase 1 — a "synced" badge
 *     on the web, which has no cache at all, would be a straight lie.
 *   * A live weather lookup. `itinerary_day.weather_forecast` is agent-authored and cached
 *     with a TTL; BRD §9 names no weather integration and this column is why none is needed.
 *
 * "Mark as done" ships as PER-DEVICE state — see MarkDoneList for why, and for what that
 * costs.
 */
export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ tripId: string; day: string }>;
}) {
  const { tripId, day: dayParam } = await params;
  const dayNumber = Number.parseInt(dayParam, 10);
  if (!Number.isInteger(dayNumber)) notFound();

  const itinerary = await loadItinerary(tripId);
  const day = itinerary?.days.find((d) => d.dayNumber === dayNumber);
  if (!itinerary || !day) notFound();

  const index = itinerary.days.findIndex((d) => d.dayNumber === dayNumber);
  const prev = index > 0 ? itinerary.days[index - 1] : null;
  const next = index < itinerary.days.length - 1 ? itinerary.days[index + 1] : null;

  return (
    <Box sx={{ pb: 5 }}>
      <Box component="header" sx={HEADER_BAND}>
        <Box sx={PROSE_COL}>
          <MuiLink component={NextLink} href={`/trips/${tripId}/itinerary`} underline="hover" sx={BACK_LINK}>
            <Icon name="arrow_left" size={14} /> {ITINERARY.heading}
          </MuiLink>
          <Box sx={{ mt: 0.75, display: "flex", alignItems: "baseline", gap: 1.5 }}>
            <Typography component="span" variant="script" sx={{ fontSize: 36, color: "primary.main" }}>
              {ITINERARY.dayLabel(day.dayNumber)}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" variant="h5" sx={HEADLINE}>
                {day.label ?? formatLongDay(day.date)}
              </Typography>
              <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                {formatLongDay(day.date)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...PROSE_COL, ...PAD }}>
        {day.weather && (
          <Box sx={{ mb: 2 }}>
            <WeatherCard weather={day.weather} />
          </Box>
        )}

        {day.summary && (
          <Typography component="p" variant="body1" sx={{ mb: 2, maxWidth: "65ch", color: "text.secondary" }}>
            {day.summary}
          </Typography>
        )}

        {day.activities.length === 0 ? (
          <EmptyComponentCard
            icon="sparkle"
            title={ITINERARY.emptyDayTitle(day.dayNumber)}
            body={ITINERARY.emptyDayBody}
          />
        ) : (
          <MarkDoneList tripId={tripId} dayNumber={day.dayNumber}>
            {day.activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} showDetail />
            ))}
          </MarkDoneList>
        )}

        <Box component="nav" sx={{ mt: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
          {prev ? (
            <MuiButton
              component={NextLink}
              href={`/trips/${tripId}/itinerary/${prev.dayNumber}`}
              variant="outlined"
              size="small"
              sx={BTN_SM}
            >
              <Icon name="arrow_left" size={13} /> {ITINERARY.dayShort(prev.dayNumber)}
            </MuiButton>
          ) : (
            <span />
          )}
          {next && (
            <MuiButton
              component={NextLink}
              href={`/trips/${tripId}/itinerary/${next.dayNumber}`}
              variant="outlined"
              size="small"
              sx={BTN_SM}
            >
              {ITINERARY.dayShort(next.dayNumber)} <Icon name="arrow_right" size={13} />
            </MuiButton>
          )}
        </Box>

        <Box sx={{ mt: 3 }}>
          <ImportantInfo itinerary={itinerary} />
        </Box>
      </Box>
    </Box>
  );
}
