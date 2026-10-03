import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import type { DayWeather, ItineraryActivity, ItineraryView } from "@/lib/trips/queries";
import { BTN, BTN_SM, CARD_PAD_SM, ICON_TILE, OVERLINE, TITLE_S } from "../sx";
import { BLOCK_LABEL, ITINERARY } from "./content";

/**
 * The pieces 2.2.4 and 2.2.5 share, plus 2.2.8's empty states — which §4.4 places "inline
 * within Itinerary Viewer" rather than on a route of their own.
 *
 * ON MUI (migration step 2, PR 5): no "use client" — every caller is a Server Component, so
 * these take only plain sx objects and `component={NextLink}`.
 */

/**
 * Which glyph an activity gets, inferred from what it says about itself.
 *
 * MATCHES THE TITLE, NOT THE BODY. Matching both put a utensils glyph on "Catamaran to Booby
 * Cay", because its body reads "Snorkel gear and lunch included" — the meal is a detail, not
 * the nature of the activity. Only the title says what the thing IS.
 *
 * Vessels are tested before meals for the same reason: a boat trip that feeds you is a boat
 * trip. The Kotlin twin is `activityMark` in ui/screens/trip/ItineraryScreen.kt.
 */
export function activityIcon(activity: ItineraryActivity): IconName {
  const title = activity.title.toLowerCase();
  if (/flight|→|airport|\baa \d|depart/.test(title)) return "plane";
  if (/transfer|taxi|shuttle|driver/.test(title)) return "trip";
  if (/catamaran|snorkel|boat|cruise|sail|\bcay\b|ferry/.test(title)) return "ship";
  if (/check ?in|resort|hotel|suite|villa/.test(title)) return "building";
  if (/dinner|lunch|breakfast|restaurant|hibachi|table/.test(title)) return "utensils";
  if (/yoga|spa|massage/.test(title)) return "heart";
  return "sparkle";
}

/**
 * The legacy `.kbd` — a confirmation number or a time range in the mono face. The artboard's
 * C22_MuiKbd: a small outlined Chip, 20px tall.
 */
function Kbd({ children, sx }: { children: string; sx?: object }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      label={children}
      sx={{ fontFamily: "mono", fontSize: 11, height: 20, flexShrink: 0, color: "text.secondary", ...sx }}
    />
  );
}

export function ActivityCard({
  activity,
  showDetail = false,
}: {
  activity: ItineraryActivity;
  /** 2.2.5 shows the address, the phone and the actions; 2.2.4 keeps the row compact. */
  showDetail?: boolean;
}) {
  const time = formatTime(activity.startTime, activity.endTime);
  return (
    <Card>
      <CardContent sx={CARD_PAD_SM}>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Box sx={{ minWidth: 52 }}>
            {activity.startTime && (
              <Typography component="div" variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1 }}>
                {shortTime(activity.startTime)}
              </Typography>
            )}
            <Typography component="div" variant="overline" sx={{ ...OVERLINE, mt: 0.5, color: "brand.main" }}>
              {BLOCK_LABEL[activity.block]}
            </Typography>
          </Box>

          <Box sx={{ ...ICON_TILE, bgcolor: "secondary.container", color: "secondary.onContainer" }}>
            <Icon name={activityIcon(activity)} size={18} />
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="div" variant="subtitle1" sx={TITLE_S}>
              {activity.title}
            </Typography>
            {activity.body && (
              <Typography component="div" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
                {activity.body}
              </Typography>
            )}
            {activity.confirmationNumber && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  component="span"
                  variant="overline"
                  sx={{ lineHeight: 1.3, color: "text.secondary" }}
                >
                  {ITINERARY.confirmation}{" "}
                </Typography>
                <Kbd>{activity.confirmationNumber}</Kbd>
              </Box>
            )}
            {/* The full range, which the 52px column to the left cannot show — it prints
                the START only. Gated on `endTime` rather than on `time`, because
                `formatTime` returns null without a start: the old condition was
                `time && !activity.startTime`, which those two facts make UNREACHABLE, so
                an activity's end time never rendered anywhere on 2.2.5. */}
            {showDetail && activity.endTime && time && <Kbd sx={{ mt: 1 }}>{time}</Kbd>}
          </Box>
        </Box>

        {/* Design-System §2.4 names the tip as the voice-forward moment inside a day, and
            Screen-Inventory §2.2.4 lists it as a primary element. The desktop artboard omits
            it entirely; M224 draws it, and this follows M224. */}
        {activity.gyasisTip && (
          <Paper elevation={0} sx={{ mt: 1.5, p: 1.5, bgcolor: "tertiary.container", color: "tertiary.onContainer" }}>
            <Typography component="div" variant="overline" sx={{ ...OVERLINE, opacity: 0.8 }}>
              {ITINERARY.tip}
            </Typography>
            <Typography component="p" variant="script" sx={{ display: "block", mt: 0.25, fontSize: 19, lineHeight: 1.25 }}>
              {activity.gyasisTip}
            </Typography>
          </Paper>
        )}

        {showDetail && activity.address && (
          <Paper
            elevation={0}
            sx={{ mt: 1.25, p: 1.25, display: "flex", alignItems: "center", gap: 1, bgcolor: "surface.2", color: "text.secondary" }}
          >
            <Icon name="pin" size={13} />
            <Typography component="span" variant="caption" sx={{ minWidth: 0, flex: 1, fontWeight: 500 }}>
              {activity.address}
            </Typography>
            {/* A maps hand-off, which needs no integration: a geo/maps URL is a link. */}
            <MuiButton
              component="a"
              href={`https://maps.google.com/?q=${encodeURIComponent(activity.address)}`}
              target="_blank"
              rel="noreferrer"
              variant="text"
              size="small"
              sx={{ ...BTN_SM, flexShrink: 0 }}
            >
              {ITINERARY.openInMaps} <Icon name="external" size={12} />
            </MuiButton>
          </Paper>
        )}

        {showDetail && activity.phone && (
          <MuiButton
            component="a"
            href={`tel:${activity.phone}`}
            variant="outlined"
            size="small"
            sx={{ ...BTN_SM, mt: 1 }}
          >
            <Icon name="phone" size={13} /> {ITINERARY.call}
          </MuiButton>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 2.2.8's empty component states.
 *
 * `componentKinds` is what makes these honest: "your flights aren't booked yet" is only
 * true when the trip has no flight component, and saying it about a trip that has one would
 * be worse than saying nothing.
 */
export function EmptyComponentStates({ itinerary }: { itinerary: ItineraryView }) {
  const has = (kind: string) => itinerary.componentKinds.includes(kind);
  const states: Array<{ icon: IconName; title: string; body: string; big?: boolean }> = [];

  if (!has("flight")) {
    states.push({
      icon: "plane",
      title: ITINERARY.emptyFlightsTitle,
      body: ITINERARY.emptyFlightsBody,
      big: true,
    });
  }
  if (!has("excursion") && !has("custom")) {
    states.push({
      icon: "utensils",
      title: ITINERARY.emptyDiningTitle,
      body: ITINERARY.emptyDiningBody,
    });
  }

  if (states.length === 0) return null;

  return (
    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      {states.map((state) => (
        <EmptyComponentCard key={state.title} {...state} tripId={itinerary.tripId} />
      ))}
    </Box>
  );
}

export function EmptyComponentCard({
  icon,
  title,
  body,
  big = false,
  tripId,
}: {
  icon: IconName;
  title: string;
  body: string;
  big?: boolean;
  tripId?: string;
}) {
  return (
    // The artboard's C228: a dashed outlined Paper on surface.2, centred when it is the
    // headline state and a row when it sits among the days.
    <Paper
      variant="outlined"
      sx={{
        bgcolor: "surface.2",
        borderStyle: "dashed",
        ...(big ? { p: 3, textAlign: "center" } : { display: "flex", alignItems: "flex-start", gap: 1.5, p: 2 }),
      }}
    >
      <Avatar
        variant={big ? "circular" : "rounded"}
        sx={{
          bgcolor: "surface.3",
          color: "text.secondary",
          ...(big ? { width: 52, height: 52, mx: "auto", mb: 1.25 } : { width: 36, height: 36, flexShrink: 0 }),
        }}
      >
        <Icon name={icon} size={big ? 26 : 16} />
      </Avatar>
      <Box>
        <Typography component="div" variant={big ? "h5" : "subtitle1"} sx={big ? undefined : TITLE_S}>
          {title}
        </Typography>
        {/* A paragraph for the headline state (body2), a meta line beside a small tile (caption). */}
        <Typography
          component="p"
          variant={big ? "body2" : "caption"}
          sx={{ color: "text.secondary", ...(big ? { mx: "auto", mt: 0.75, maxWidth: 384 } : { display: "block", mt: 0.5 }) }}
        >
          {body}
        </Typography>
        {big && tripId && (
          <MuiButton
            component={NextLink}
            href={`/trips/${tripId}/messages`}
            variant="outlined"
            color="secondary"
            sx={{ ...BTN, mt: 1.75 }}
          >
            <Icon name="message" size={14} /> {ITINERARY.askGyasi}
          </MuiButton>
        )}
      </Box>
    </Paper>
  );
}

/** The weather panel. Agent-authored — see the DayWeather note in queries.ts. */
export function WeatherCard({ weather }: { weather: DayWeather }) {
  return (
    <Card>
      <CardContent sx={CARD_PAD_SM}>
        <Typography component="div" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
          {ITINERARY.weather}
        </Typography>
        <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
          {/* The sun in the brand sunset — a source colour, scheme-independent like the
              artboard's `brandSource.sunset`. */}
          <Box sx={{ display: "inline-flex", flexShrink: 0, color: "brandSource.sunset" }}>
            <Icon name="sun" size={32} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {weather.highF !== undefined && (
              <Typography component="div" variant="h3">
                {weather.highF}°F
              </Typography>
            )}
            <Typography component="div" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
              {[
                weather.summary,
                weather.windMph !== undefined
                  ? `${weather.windMph} mph${weather.windDir ? ` ${weather.windDir}` : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
        </Box>
        {weather.uvIndex !== undefined && weather.uvIndex >= 8 && (
          <Paper elevation={0} sx={{ mt: 1.25, p: 1.25, bgcolor: "warning.container", color: "text.primary" }}>
            <Typography component="p" variant="caption" sx={{ display: "block", fontWeight: 500 }}>
              {ITINERARY.uvWarning(weather.uvIndex)}
            </Typography>
          </Paper>
        )}
      </CardContent>
    </Card>
  );
}

/** The rows of Important info share a top rule and the card's 14px padding. */
const INFO_ROW = { p: 1.75, borderTop: 1, borderColor: "divider" } as const;

/** What the trip itself can answer. Nothing is asserted that no column holds. */
export function ImportantInfo({ itinerary }: { itinerary: ItineraryView }) {
  const rows: Array<{ icon: IconName; label: string; value: string }> = [];
  if (itinerary.insuranceReference) {
    rows.push({ icon: "shield", label: ITINERARY.insurance, value: itinerary.insuranceReference });
  }
  if (itinerary.emergencyContact?.phone) {
    rows.push({
      icon: "phone",
      label: ITINERARY.emergency,
      value: [itinerary.emergencyContact.name, itinerary.emergencyContact.phone]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return (
    <Card>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.75 }}>
        <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
          <Icon name="info" size={16} />
        </Box>
        <Typography component="h2" variant="subtitle1" sx={{ ...TITLE_S, flex: 1 }}>
          {ITINERARY.importantInfo}
        </Typography>
      </Box>
      {rows.length === 0 ? (
        <Typography component="p" variant="body2" sx={{ ...INFO_ROW, color: "text.secondary" }}>
          {ITINERARY.noImportantInfo}
        </Typography>
      ) : (
        <List disablePadding>
          {rows.map((row) => (
            <ListItem key={row.label} disableGutters sx={{ ...INFO_ROW, gap: 1.25 }}>
              <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
                <Icon name={row.icon} size={14} />
              </Box>
              <Typography component="span" variant="caption" sx={{ minWidth: 0, flex: 1, fontWeight: 500 }}>
                <Box component="span" sx={{ color: "text.secondary" }}>
                  {row.label}:{" "}
                </Box>
                {row.value}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
      {/* Nothing in the schema records a visa requirement, and a wrong answer here is
          somebody turned away at a gate. So it asks rather than asserts. */}
      <Box sx={INFO_ROW}>
        <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
          {ITINERARY.visaUnknown}
        </Typography>
      </Box>
    </Card>
  );
}

/** "06:40" from a Postgres `time` value, which arrives as "06:40:00". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function formatTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${shortTime(start)} – ${shortTime(end)}` : shortTime(start);
}
