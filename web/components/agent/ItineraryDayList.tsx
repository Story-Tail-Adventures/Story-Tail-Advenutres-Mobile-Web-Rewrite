import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  deleteActivityAction,
  moveActivityAction,
} from "@/app/(agent)/agent/trips/[tripId]/itinerary/actions";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { ITINERARY_COPY } from "@/lib/agent/content";
import type { TripItineraryDay } from "@/lib/agent/tripDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.4.14's day-by-day canvas — the grouping §3.4.4 deliberately does not have.
 *
 * THESE DAYS ARE REAL ROWS. `itinerary_day` is a table with a date and a label; the
 * builder's flat component list has no day in it, which is why the two screens are
 * separate and why §3.4.4's amendment says so. What ties them is
 * `itinerary_activity.component_id`, one-directional: an entry may point at a booking, a
 * booking does not know its entry.
 *
 * ARROWS, NOT A DRAG HANDLE. The prototype draws drag-to-reorder and a drag is pointer-only,
 * so the accessible path would be these buttons anyway — and they work with JavaScript off,
 * on the screen where an advisor does the most typing. Same call the builder made.
 *
 * A SERVER COMPONENT: three plain forms and two links, none of which needs state. On MUI
 * (step 2 of the migration): a Card per day, the artboard's outlined row card per entry,
 * its tertiary-container "Gyasi's Tip" callout, and the links as MUI Buttons over
 * `NextLink`.
 */

/** The legacy .btn-sm box (32px, 16px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The legacy `.kbd` tag (11px mono on surface-3, 4px corners) on MUI's Chip. */
const KBD_CHIP = {
  height: 20,
  borderRadius: 1,
  fontFamily: "mono",
  fontSize: 11,
  fontWeight: 500,
  bgcolor: "surface.3",
  color: "text.secondary",
  "& .MuiChip-label": { px: 0.75 },
} as const;

export function ItineraryDayList({
  tripId,
  days,
  editingActivityId,
  editingDayId,
}: {
  tripId: string;
  days: TripItineraryDay[];
  editingActivityId: string | null;
  editingDayId: string | null;
}) {
  if (days.length === 0) {
    return (
      <Card sx={{ textAlign: "center" }}>
        <CardContent sx={{ px: 2, py: 4, "&:last-child": { pb: 4 } }}>
          <Typography component="p" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {ITINERARY_COPY.emptyTitle}
          </Typography>
          <Typography
            component="p"
            variant="body2"
            sx={{ mx: "auto", mt: 0.5, maxWidth: "46ch", color: "text.secondary" }}
          >
            {ITINERARY_COPY.emptyBody}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5}>
      {days.map((day) => (
        <Card
          component="section"
          key={day.dayId}
          // The open day is marked in place, not only by the URL. An inset outline rather
          // than a border, so the card keeps its box whether or not it is the one open.
          sx={{
            ...(day.dayId === editingDayId && {
              bgcolor: "primary.container",
              outline: "1px solid",
              outlineColor: "primary.main",
              outlineOffset: "-1px",
            }),
          }}
        >
          <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                columnGap: 1.5,
                rowGap: 0.5,
              }}
            >
              {/* The script face on the day number, which is how the prototype draws it and
                  the one place Caveat earns its place on an agent screen. */}
              <Typography
                component="p"
                variant="script"
                sx={{ fontSize: 26, lineHeight: 1, color: "primary.main" }}
              >
                Day {day.dayNumber}
              </Typography>
              {day.dateLabel && (
                <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                  {day.dateLabel}
                </Typography>
              )}
              {day.label && (
                <Typography component="p" variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {day.label}
                </Typography>
              )}
              <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
                <MuiButton
                  component={NextLink}
                  href={`/agent/trips/${tripId}/itinerary?day=${day.dayId}`}
                  variant="text"
                  size="small"
                  sx={BTN_SM}
                >
                  {ITINERARY_COPY.edit}
                  <Box component="span" sx={VISUALLY_HIDDEN}> Day {day.dayNumber}</Box>
                </MuiButton>
                <MuiButton
                  component={NextLink}
                  href={`/agent/trips/${tripId}/itinerary?addTo=${day.dayId}`}
                  variant="outlined"
                  color="secondary"
                  size="small"
                  sx={BTN_SM}
                >
                  {ITINERARY_COPY.addToDay}
                  <Box component="span" sx={VISUALLY_HIDDEN}> — Day {day.dayNumber}</Box>
                </MuiButton>
              </Box>
            </Box>

            {day.summary && (
              <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
                {day.summary}
              </Typography>
            )}

            {day.activities.length === 0 ? (
              <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
                {ITINERARY_COPY.dayEmpty}
              </Typography>
            ) : (
              <Stack component="ol" spacing={0.75} sx={{ listStyle: "none", m: 0, p: 0, mt: 1.25 }}>
                {day.activities.map((a, i) => (
                  <Card
                    component="li"
                    variant="outlined"
                    key={a.activityId}
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      columnGap: 1.25,
                      rowGap: 0.75,
                      px: 1.5,
                      py: 1,
                      ...(a.activityId === editingActivityId && {
                        borderColor: "primary.main",
                        bgcolor: "surface.2",
                      }),
                    }}
                    aria-current={a.activityId === editingActivityId ? "true" : undefined}
                  >
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      <MoveButton
                        tripId={tripId}
                        dayId={day.dayId}
                        activityId={a.activityId}
                        direction="up"
                        label={ITINERARY_COPY.moveUp}
                        title={a.title}
                        disabled={i === 0}
                      />
                      <MoveButton
                        tripId={tripId}
                        dayId={day.dayId}
                        activityId={a.activityId}
                        direction="down"
                        label={ITINERARY_COPY.moveDown}
                        title={a.title}
                        disabled={i === day.activities.length - 1}
                      />
                    </Box>

                    <Box
                      sx={{
                        minWidth: 0,
                        flexGrow: 1,
                        flexShrink: 1,
                        flexBasis: { xs: "100%", sm: "auto" },
                      }}
                    >
                      <Typography component="p" variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {a.title}
                      </Typography>
                      <Typography
                        component="p"
                        variant="caption"
                        sx={{ display: "block", color: "text.secondary" }}
                      >
                        {[a.timeLabel, a.block, a.location].filter(Boolean).join(" · ") || "—"}
                      </Typography>
                      {a.body && (
                        <Typography component="p" variant="body2" sx={{ mt: 0.5 }}>
                          {a.body}
                        </Typography>
                      )}
                      {a.gyasisTip && (
                        /* The named callout, styled as one. Design-System §2 makes
                           "Gyasi's Tip" a thing rather than a generic note. */
                        <Paper
                          elevation={0}
                          sx={{
                            mt: 0.75,
                            px: 1.25,
                            py: 0.75,
                            bgcolor: "tertiary.container",
                            color: "tertiary.onContainer",
                          }}
                        >
                          <Typography component="p" variant="body2">
                            <Typography component="span" variant="overline" sx={{ lineHeight: 1.3 }}>
                              {ITINERARY_COPY.tipLabel}
                            </Typography>{" "}
                            {a.gyasisTip}
                          </Typography>
                        </Paper>
                      )}
                    </Box>

                    <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.75 }}>
                      {a.componentId && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={ITINERARY_COPY.fromBooking}
                          title={ITINERARY_COPY.fromBookingHint}
                          sx={KBD_CHIP}
                        />
                      )}
                      <MuiButton
                        component={NextLink}
                        href={`/agent/trips/${tripId}/itinerary?activity=${a.activityId}`}
                        variant="text"
                        size="small"
                        sx={BTN_SM}
                      >
                        {ITINERARY_COPY.edit}
                        <Box component="span" sx={VISUALLY_HIDDEN}> {a.title}</Box>
                      </MuiButton>
                      <form action={deleteActivityAction}>
                        <input type="hidden" name="tripId" value={tripId} />
                        <input type="hidden" name="activityId" value={a.activityId} />
                        <IconButton
                          type="submit"
                          size="small"
                          title={ITINERARY_COPY.removeHint}
                          sx={{ width: 28, height: 28, p: 0 }}
                        >
                          <Icon name="trash" size={13} />
                          <Box component="span" sx={VISUALLY_HIDDEN}>
                            {ITINERARY_COPY.remove} {a.title} — {ITINERARY_COPY.removeHint}
                          </Box>
                        </IconButton>
                      </form>
                    </Box>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function MoveButton({
  tripId,
  dayId,
  activityId,
  direction,
  label,
  title,
  disabled,
}: {
  tripId: string;
  dayId: string;
  activityId: string;
  direction: "up" | "down";
  label: string;
  title: string;
  disabled: boolean;
}) {
  return (
    <form action={moveActivityAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="direction" value={direction} />
      <IconButton
        type="submit"
        size="small"
        disabled={disabled}
        title={label}
        sx={{ width: 20, height: 20, p: 0, "&.Mui-disabled": { opacity: 0.25 } }}
      >
        <Icon name={direction === "up" ? "chevron_up" : "chevron_down"} size={11} />
        <Box component="span" sx={VISUALLY_HIDDEN}>
          {label} — {title}
        </Box>
      </IconButton>
    </form>
  );
}
