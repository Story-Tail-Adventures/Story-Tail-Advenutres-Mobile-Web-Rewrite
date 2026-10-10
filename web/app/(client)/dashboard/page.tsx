import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { formatDay, formatTripDates } from "@/lib/trips/format";
import { loadDashboard, type DashboardTrip } from "@/lib/trips/queries";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD, isLeisure } from "./content";

export const metadata: Metadata = { title: "Your trips" };

/** The page column: 1024px wide, 16px sides (24 from md), a 40px tail below md. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1024,
  p: { xs: 2, md: 3 },
  pb: { xs: 5, md: 3 },
} as const;

/** `.t-headline` on `variant="h5"`: stock size, the weight is the legacy one. */
const HEADLINE_SX = { fontWeight: 700 } as const;

/** The legacy .t-label-s overline on MUI's overline, at the 1.3 line-height it had. */
const OVERLINE_SX = { display: "block", fontWeight: 600, lineHeight: 1.3 } as const;

/** The legacy .t-title-s (15/600) on subtitle1. */
const TITLE_S_SX = { fontWeight: 600, lineHeight: 1.3 } as const;

/** The legacy .btn and .btn-sm boxes on MUI's Button, so nothing reflows. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** A Card that IS the link (the legacy `<Link className="card">`). */
const LINK_CARD_SX = { display: "block", color: "inherit", textDecoration: "none" } as const;

/** MUI's CardContent at the legacy 14px / 12px paddings, bottom included. */
const CARD_PAD_14 = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;
const CARD_PAD_12 = { p: 1.5, "&:last-child": { pb: 1.5 } } as const;

/**
 * The hero scrim: brand burgundy at 82% into brand navy at 70%, read from the theme's own
 * brand-source variables rather than two hex literals (the same call the welcome page makes).
 * Scheme-independent on purpose: white copy on a photo stays white in both schemes, and the
 * source colours live on `:root` only.
 */
const SCRIM_SX = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(150deg, color-mix(in srgb, var(--mui-palette-brandSource-burgundy) 82%, transparent), color-mix(in srgb, var(--mui-palette-brandSource-navy) 70%, transparent))",
} as const;

/**
 * Screen 2.2.1 Client Dashboard / Home — see docs/Screen-Inventory.md §2.2.1 and §4.4
 * (Pattern D: mobile stacks and the hero countdown goes full-width; the tablet/web weather
 * widget beside it is explicitly a larger-viewport affordance) and
 * design/source-prototype/screens/client-trip.jsx (C221_Dashboard) +
 * client-trip-mobile.jsx (M221_Dashboard). P1.
 *
 * This is the screen that proves the rest of §2.2 works: it reads five tables through the
 * policies added in 20260907031255, derives its status labels through the one shared module
 * both stacks use, and renders inside the shell from Stage 4. If any of those three were
 * wrong, this page is where it would show.
 *
 * DEPARTURES FROM THE ARTBOARD, each recorded rather than silently applied:
 *   * No "Saved searches" tab. `SavedSearch` is a Phase 2 entity, so the tab had nothing
 *     to count. The artboard's third tab is gone rather than rendered empty.
 *   * "New idea" / "Explore trips" repoint at the trip thread. §2.3 is Phase 2 and the CTA
 *     had no destination; asking Gyasi is how a trip actually starts at MVP.
 *   * "Authorize a card" opens §2.4.3 for the upcoming trip. It rendered disabled with a
 *     reason while §2.4 was unbuilt — which was the right call then and the wrong state to
 *     leave behind: a CTA still disabled after its screen ships is exactly the failure the
 *     disabled-with-a-reason convention exists to make visible.
 *   * The countdown shows days only, not days/hours/minutes. The artboard's HR and MIN
 *     tiles need a ticking client component, and a server-rendered "14 HR" is wrong the
 *     moment it is sent. Days is the unit that survives a cache.
 *
 * ON MUI (step 2 of the migration): the look is the C221 artboard's — an elevation-4 hero
 * Card with a scrim and a frosted countdown Paper, an error-container action Card, an
 * Avatar advisor Card, and image-led trip Cards — on the layout this page already had (the
 * `2.1fr 1fr` grid from `web`, stacked below; headed sections, not tabs). Every element is a
 * plain-sx MUI component, so this stays a Server Component.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("client")
    .select("first_name, preferred_name")
    .maybeSingle();

  // `"New"` is filtered because that is what `handle_new_user()` writes into
  // `client.first_name` when it provisions a row from an email with no name attached —
  // greeting somebody "Hey New" is worse than not using a name at all. The native twin
  // does this in `NameRow.greetable()`; web did not, so the same account was greeted
  // differently on the two stacks.
  const rawName = client?.preferred_name?.trim() || client?.first_name?.trim();
  const name = rawName && rawName !== "New" ? rawName : "there";
  const data = await loadDashboard();

  if (!data) {
    return (
      <Box sx={{ mx: "auto", width: "100%", maxWidth: 1024, p: { xs: 2, md: 3 } }}>
        {/* §5's ERROR state, not the empty one. A failed read used to render EmptyState
            here, which has neither the retry CTA nor the "Message Gyasi" escalation §5
            requires — and told a traveler with trips that they had none. The reads fail
            closed (null, not a throw), so this cannot be left to a route-level boundary. */}
        <RetryState
          title="We couldn’t load your trips"
          body="Something went wrong on our side, not yours. Trying again usually sorts it."
        />
      </Box>
    );
  }

  const { upcoming, inPlanning, past, nextPayment, itineraryReady, latestMessage } = data;
  const traveling = upcoming?.status === "in_progress";
  const leisure = upcoming ? isLeisure(upcoming.tripType) : false;
  const days = upcoming?.daysUntil ?? null;

  const greeting = !upcoming
    ? DASHBOARD.greetingNoTrip(name)
    : traveling
      ? DASHBOARD.greetingTraveling(name)
      : days === null
        ? DASHBOARD.greetingNoTrip(name)
        : leisure
          ? DASHBOARD.greetingRest(name, days)
          : DASHBOARD.greetingNeutral(name, days);

  return (
    <Box sx={PAGE_SX}>
      <Box component="header">
        <Typography component="p" variant="overline" sx={{ ...OVERLINE_SX, color: "secondary.main" }}>
          {leisure && !traveling ? DASHBOARD.overlineRest : DASHBOARD.overlineNeutral}
        </Typography>
        <Typography component="h1" variant="h5" sx={{ ...HEADLINE_SX, mt: 0.75 }}>
          {greeting}
        </Typography>
        {traveling && (
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
            {DASHBOARD.subtitleTraveling}
          </Typography>
        )}
        {!upcoming && (
          <Typography component="p" variant="body2" sx={{ mt: 1, maxWidth: "65ch", color: "text.secondary" }}>
            {DASHBOARD.subtitleNoTrip}
          </Typography>
        )}
      </Box>

      {upcoming ? (
        <Box
          sx={{
            mt: 2,
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "minmax(0, 1fr)", web: "minmax(0, 2.1fr) minmax(0, 1fr)" },
          }}
        >
          <HeroCountdown trip={upcoming} days={days} itineraryReady={itineraryReady} />
          <Stack spacing={1.25}>
            {nextPayment && <ActionNeeded payment={nextPayment} tripId={upcoming.id} />}
            {/* Only the advisor's own words are quoted here. When the traveler spoke last
                the card drops the quote and keeps the reply-window line, which is exactly
                what somebody waiting for an answer wants to see. */}
            <AdvisorCard
              preview={latestMessage?.fromAgent ? latestMessage.body : undefined}
              tripId={upcoming.id}
            />
          </Stack>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <EmptyState
            icon="palm"
            title="No trip booked yet"
            body="When there is one, it lives right here with a countdown on it."
            // 2.6.3, now that it exists. This was a `mailto:` because with no trip there is
            // no trip-scoped thread to open and §2.6's inbox was not built — and before
            // that it pointed at "/dashboard", the page it renders on, so the only route to
            // Gyasi in this state went nowhere at all.
            //
            // 2.6.3 is the screen written for exactly this person: no trip yet, something to
            // say. It lands in the inbox rather than in an email client, which means the
            // reply arrives somewhere they can find it again.
            action={{ label: DASHBOARD.startSomethingNew, href: "/messages/new" }}
          />
        </Box>
      )}

      <TripSections inPlanning={inPlanning} past={past} />
    </Box>
  );
}

/**
 * The hallmark card, per Design-System §9.4: "the single highest-value moment on the client
 * side". Full-width below `web:` per §4.4.
 */
function HeroCountdown({
  trip,
  days,
  itineraryReady,
}: {
  trip: DashboardTrip;
  days: number | null;
  itineraryReady: boolean;
}) {
  const where = trip.destinations[0] ?? "";
  return (
    <Card elevation={4} sx={{ position: "relative", minHeight: 260, overflow: "hidden", color: "common.white" }}>
      <Photo
        image={imageKeyForTrip(trip)}
        alt=""
        fill
        sizes="(min-width: 1200px) 640px, 100vw"
      />
      <Box aria-hidden="true" sx={SCRIM_SX} />
      <Box sx={{ position: "relative", display: "flex", minHeight: 260, flexDirection: "column", p: 2.5 }}>
        <Box sx={{ alignSelf: "flex-start" }}>
          <StatusChip kind={trip.chip} label={trip.statusLabel} />
        </Box>
        <Typography component="h2" variant="h5" sx={{ mt: 1.25, color: "common.white" }}>
          {trip.title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ fontWeight: 500, opacity: 0.9 }}>
          {[formatTripDates(trip.startDate, trip.endDate), where, `${trip.travelerCount} travelers`]
            .filter(Boolean)
            .join(" · ")}
        </Typography>

        <Box sx={{ mt: "auto", display: "flex", alignItems: "flex-end", gap: 1, pt: 2 }}>
          {days !== null && (
            // The frosted countdown tile. Its white tints are mixed from the card's own
            // `currentColor` (white) rather than written as literals, like the auth panel's.
            <Paper
              elevation={0}
              sx={{
                px: 2,
                py: 1,
                textAlign: "center",
                color: "inherit",
                bgcolor: "color-mix(in srgb, currentColor 15%, transparent)",
                border: "1px solid color-mix(in srgb, currentColor 20%, transparent)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Typography component="div" variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
                {days}
              </Typography>
              <Typography
                component="div"
                variant="overline"
                sx={{ display: "block", mt: 0.5, fontSize: 9, fontWeight: 600, lineHeight: 1, letterSpacing: "1.2px", opacity: 0.85 }}
              >
                {DASHBOARD.countdownUnits.days}
              </Typography>
            </Paper>
          )}
          {itineraryReady ? (
            <MuiButton
              component={NextLink}
              href={`/trips/${trip.id}/itinerary`}
              variant="contained"
              color="brand"
              size="small"
              sx={{ ...BTN_SM, ml: "auto" }}
            >
              {DASHBOARD.viewItinerary} <Icon name="arrow_right" size={12} />
            </MuiButton>
          ) : (
            <Typography component="span" variant="caption" sx={{ ml: "auto", fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
              {DASHBOARD.itineraryNotReady}
            </Typography>
          )}
        </Box>
      </Box>
    </Card>
  );
}

function ActionNeeded({
  payment,
  tripId,
}: {
  payment: NonNullable<Awaited<ReturnType<typeof loadDashboard>>>["nextPayment"];
  tripId: string;
}) {
  if (!payment) return null;
  const due = payment.daysUntilDue;
  return (
    <Card sx={{ bgcolor: "error.container", color: "error.onContainer" }}>
      <CardContent sx={CARD_PAD_14}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Icon name="card" size={15} />
          <Typography component="span" variant="overline" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {DASHBOARD.actionNeededLabel}
            {due !== null && due >= 0 ? ` · ${due} DAYS` : ""}
          </Typography>
        </Box>
        <Typography component="div" variant="subtitle1" sx={{ ...TITLE_S_SX, mt: 0.75 }}>
          {payment.label}
        </Typography>
        <Typography component="div" variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.85 }}>
          {formatTripMoney(payment.amountCents, payment.currency)}
          {payment.dueDate ? ` due ${formatDay(payment.dueDate)}` : ""}
        </Typography>
        {/* §2.4.3, scoped to the trip this milestone belongs to. `card_authorization.trip_id`
            is NOT NULL, so the trip travels in the route rather than being asked for on the
            far side — the milestone already knows which trip it is due on.
            A contained error button, as the C221 artboard draws it: MUI's error pair reads
            against the error-container card in both schemes. */}
        <MuiButton
          component={NextLink}
          href={`/wallet/authorize/${tripId}`}
          variant="contained"
          color="error"
          fullWidth
          sx={{ ...BTN, mt: 1.25 }}
        >
          {DASHBOARD.authorizeCard}
        </MuiButton>
      </CardContent>
    </Card>
  );
}

function AdvisorCard({ preview, tripId }: { preview?: string; tripId: string }) {
  return (
    <Card>
      <CardContent sx={CARD_PAD_14}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          {/* The legacy `.avatar.sm`: 24px, 10px initials, the tertiary-container pair. */}
          <Avatar
            aria-hidden="true"
            sx={{
              width: 24,
              height: 24,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: "tertiary.container",
              color: "tertiary.onContainer",
            }}
          >
            GS
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="div" variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {DASHBOARD.advisorName} · {DASHBOARD.advisorRole}
            </Typography>
            <Typography component="div" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {DASHBOARD.advisorReplyTime}
            </Typography>
          </Box>
        </Box>
        {preview && (
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            “{preview}”
          </Typography>
        )}
        <MuiButton
          component={NextLink}
          href={`/trips/${tripId}/messages`}
          variant="outlined"
          color="secondary"
          size="small"
          fullWidth
          sx={{ ...BTN_SM, mt: 1.25 }}
        >
          <Icon name="message" size={14} /> {DASHBOARD.messageAgent}
        </MuiButton>
      </CardContent>
    </Card>
  );
}

/**
 * Two tabs, not the artboard's three. The third was "Saved searches · 3" and SavedSearch is
 * a Phase 2 entity, so it had nothing to count.
 *
 * Rendered as headed sections rather than interactive tabs: a tab strip needs client state,
 * and with two short lists there is nothing to hide — §4.4 Pattern D asks for stacked
 * sections with a "See all" per section on mobile, which is what this is.
 */
function TripSections({ inPlanning, past }: { inPlanning: DashboardTrip[]; past: DashboardTrip[] }) {
  return (
    <>
      <TripSection
        heading={DASHBOARD.tabInPlanning(inPlanning.length)}
        trips={inPlanning}
        emptyTitle={DASHBOARD.emptyPlanningTitle}
        emptyBody={DASHBOARD.emptyPlanningBody}
      />
      <TripSection
        heading={DASHBOARD.tabPast(past.length)}
        trips={past}
        emptyTitle={DASHBOARD.emptyPastTitle}
        emptyBody={DASHBOARD.emptyPastBody}
      />
    </>
  );
}

function TripSection({
  heading,
  trips,
  emptyTitle,
  emptyBody,
}: {
  heading: string;
  trips: DashboardTrip[];
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <Box component="section" sx={{ mt: 3.5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, borderBottom: 1, borderColor: "divider", pb: 1 }}>
        <Typography component="h2" variant="subtitle1" sx={{ ...TITLE_S_SX, flex: 1 }}>
          {heading}
        </Typography>
        {trips.length > 0 && (
          <MuiButton component={NextLink} href="/trips" variant="text" size="small" sx={BTN_SM}>
            {DASHBOARD.seeAllTrips}
          </MuiButton>
        )}
      </Box>
      {trips.length === 0 ? (
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 1.5, color: "text.secondary" }}>
          <Typography component="span" variant="subtitle1" sx={{ ...TITLE_S_SX, display: "block", color: "text.primary" }}>
            {emptyTitle}
          </Typography>
          {emptyBody}
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{
            m: 0,
            p: 0,
            mt: 1.5,
            listStyle: "none",
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "repeat(2, minmax(0, 1fr))",
              web: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {trips.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </Box>
      )}
    </Box>
  );
}

function TripCard({ trip }: { trip: DashboardTrip }) {
  return (
    <Card component={NextLink} href={`/trips/${trip.id}`} sx={LINK_CARD_SX}>
      <Box sx={{ position: "relative", height: 120 }}>
        <Photo
          image={imageKeyForTrip(trip)}
          alt=""
          fill
          sizes="(min-width: 1200px) 300px, (min-width: 768px) 50vw, 100vw"
        />
        <Box sx={{ position: "absolute", top: 10, left: 10 }}>
          <StatusChip kind={trip.chip} label={trip.statusLabel} />
        </Box>
      </Box>
      <CardContent sx={CARD_PAD_12}>
        <Typography component="div" variant="subtitle1" sx={TITLE_S_SX}>
          {trip.title}
        </Typography>
        <Typography component="div" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {/* The destination is the middle field, matching native's TripCard. Web omitted it,
              so the same card read differently on the two stacks — and the photograph above
              is chosen from a generic registry, so the place name is doing real work here. */}
          {[
            formatTripDates(trip.startDate, trip.endDate),
            trip.destinations[0],
            `${trip.travelerCount} travelers`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      </CardContent>
    </Card>
  );
}
