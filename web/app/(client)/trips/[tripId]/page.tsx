import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDay, formatTripDates } from "@/lib/trips/format";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { loadTripDetail, type PaymentMilestoneView, type TripDetail } from "@/lib/trips/queries";
import { TRIP_DETAIL } from "./content";
import {
  BACK_LINK,
  BTN,
  BTN_SM,
  CARD_PAD,
  CARD_PAD_SM,
  HERO_SCRIM,
  HERO_TITLE,
  ICON_TILE,
  OVERLINE,
  TITLE_S,
} from "./sx";

export const metadata: Metadata = { title: "Your trip" };

/** `mx-auto w-full max-w-5xl` — the overview's column, wider than the reading screens. */
const WIDE_COL = { mx: "auto", width: "100%", maxWidth: 1024 } as const;

/**
 * The back pill over the hero photograph: brand navy at 55% behind white text, blurred. A
 * scrim behind the label, not just white text — see TripHero.
 */
const BACK_PILL = {
  ...BACK_LINK,
  px: 1.25,
  py: 0.5,
  borderRadius: 999,
  color: "common.white",
  bgcolor: "color-mix(in srgb, var(--mui-palette-brandSource-navy) 55%, transparent)",
  backdropFilter: "blur(4px)",
} as const;

/** A quick-access tile's clickable face: the legacy `flex items-center gap-2.5 p-3`. */
const TILE_SX = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 1.25,
  p: 1.5,
} as const;

/**
 * Screen 2.2.3 Trip Detail / Overview — see docs/Screen-Inventory.md §2.2.3 and §4.4
 * (Pattern C: full-screen detail on mobile with collapsible sub-sections; a right rail on
 * web) and design/source-prototype/screens/client-trip.jsx (C223_TripDetail) +
 * client-trip-mobile.jsx (M223_TripDetail). P1.
 *
 * Also Screen 2.2.10 Trip Cancellation View, which §4.4 calls a "Pattern C variant" — the
 * same screen with a cancellation summary in place of the tiles, not a route of its own.
 *
 * A COMPLETED trip redirects to 2.2.11 instead, because that one genuinely is a different
 * screen: §4.4 gives it "Pattern I + photo gallery" and it opens on a note rather than on
 * things to do. Branching a third body in here would have made one component hold three
 * layouts that share only a hero.
 *
 * TWO THINGS THE ARTBOARD SHOWS THAT ARE NOT HERE:
 *   * "Card on file · VISA •••• 4242" is dropped from At a glance. That lives on
 *     `payment_card`, which belongs to §2.4 — and the wallet is where a client should manage
 *     it, not a read-only echo on a trip page.
 *   * The "Payments" tile opens §2.4.3 for this trip, which is the entry point the Screen
 *     Inventory names for that screen. It was disabled while §2.4 was unbuilt.
 *
 * ON MUI (migration step 2, PR 5): Server Component throughout — plain sx objects, palette
 * paths, and `component={NextLink}` for every link. The layout (hero height, the 1fr/300px
 * grid from `web`, the 2×2 tiles below it) is the one it had; only the visual layer moved.
 */
export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const detail = await loadTripDetail(tripId);

  // RLS makes "not yours" and "does not exist" the same answer, and that is deliberate —
  // see the NotFound response in contracts/openapi.yaml.
  if (!detail) {
    return (
      <Box sx={{ ...WIDE_COL, p: { xs: 2, md: 3 } }}>
        <EmptyState
          icon="warning"
          title={TRIP_DETAIL.notFoundTitle}
          body={TRIP_DETAIL.notFoundBody}
          action={{ label: TRIP_DETAIL.back, href: "/trips" }}
        />
      </Box>
    );
  }

  if (detail.trip.status === "completed") redirect(`/trips/${tripId}/memories`);

  const { trip } = detail;
  const cancelled = trip.status === "cancelled";

  return (
    <Box sx={{ pb: 5 }}>
      <TripHero detail={detail} />

      <Box
        sx={{
          ...WIDE_COL,
          display: "grid",
          gap: 2,
          p: { xs: 2, md: 3 },
          gridTemplateColumns: { web: "minmax(0, 1fr) 300px" },
        }}
      >
        <Box>
          {cancelled ? <CancellationSummary detail={detail} /> : <QuickTiles detail={detail} />}
          <Glance detail={detail} />
          {!cancelled && <AgentNote detail={detail} />}
        </Box>

        <Box component="aside" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <AdvisorCard tripId={trip.id} />
          {cancelled ? <ReadyAgain /> : <PaymentTimeline milestones={detail.milestones} />}
        </Box>
      </Box>
    </Box>
  );
}

function TripHero({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const cancelled = trip.status === "cancelled";
  return (
    <Box
      sx={{
        position: "relative",
        height: 220,
        overflow: "hidden",
        // 2.2.10 desaturates and dims the photograph (the artboard's C2210 filter).
        ...(cancelled && { "& img": { filter: "grayscale(0.55) brightness(0.6)" } }),
      }}
    >
      <Photo image={imageKeyForTrip(trip)} alt="" fill sizes="100vw" />
      <Box aria-hidden="true" sx={HERO_SCRIM} />
      <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <Box
          sx={{
            ...WIDE_COL,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 1.5,
            p: { xs: 2, md: 3 },
            color: "common.white",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {/* A scrim behind the label, not just white text: the hero photograph is
                arbitrary and half the registry is bright sand or pale rock, where white on
                85% opacity disappears. The prototype's MTripTopBar makes the same call for
                its over-photo controls. */}
            <MuiLink component={NextLink} href="/trips" underline="hover" sx={BACK_PILL}>
              <Icon name="arrow_left" size={14} /> {TRIP_DETAIL.back}
            </MuiLink>
            <Box sx={{ mt: 0.75 }}>
              <StatusChip kind={trip.chip} label={trip.statusLabel} />
            </Box>
            <Typography component="h1" variant="h3" sx={{ ...HERO_TITLE, mt: 0.75, color: "common.white" }}>
              {trip.title}
            </Typography>
            <Typography component="p" variant="body2" sx={{ color: "common.white", opacity: 0.9 }}>
              {[
                formatTripDates(trip.startDate, trip.endDate),
                trip.destinations[0],
                trip.daysUntil !== null && !cancelled ? `${trip.daysUntil} days to go` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
          {detail.itineraryReady && (
            <MuiButton
              component={NextLink}
              href={`/trips/${trip.id}/itinerary`}
              variant="contained"
              color="brand"
              sx={{ ...BTN, display: { xs: "none", md: "inline-flex" }, flexShrink: 0 }}
            >
              <Icon name="download" size={14} /> {TRIP_DETAIL.downloadPdf}
            </MuiButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** The artboard's four quick-access tiles: 2×2 below `web`, a row of four from it. */
function QuickTiles({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const tiles: Array<{
    icon: IconName;
    label: string;
    sub: string;
    href: string | null;
    tone: "primary" | "error" | "secondary" | "tertiary";
  }> = [
    {
      icon: "plane",
      label: TRIP_DETAIL.tileItinerary,
      sub: detail.itineraryReady
        ? TRIP_DETAIL.tileItinerarySub(detail.dayCount)
        : TRIP_DETAIL.tileItineraryPending,
      href: detail.itineraryReady ? `/trips/${trip.id}/itinerary` : null,
      tone: "primary",
    },
    {
      icon: "card",
      label: TRIP_DETAIL.tilePayments,
      sub: nextDueLabel(detail.milestones),
      // §2.4.3. The Screen Inventory names Trip Detail "Authorize a card" as this screen's
      // entry point, and this tile is the only card affordance on it. A fully-paid trip
      // still lands somewhere real: the form's presets come out at $0 and the submit stays
      // disabled until a custom limit is typed, which is a readable state rather than a
      // dead tile.
      href: `/wallet/authorize/${trip.id}`,
      tone: "error",
    },
    {
      icon: "passport",
      label: TRIP_DETAIL.tileDocuments,
      sub: TRIP_DETAIL.tileDocumentsSub(detail.documentCount),
      href: `/trips/${trip.id}/documents`,
      tone: "secondary",
    },
    {
      icon: "message",
      label: TRIP_DETAIL.tileMessages,
      sub: TRIP_DETAIL.tileMessagesSub(detail.unreadCount),
      href: `/trips/${trip.id}/messages`,
      tone: "tertiary",
    },
  ];

  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: "none",
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", web: "repeat(4, minmax(0, 1fr))" },
      }}
    >
      {tiles.map((tile) => {
        const body = (
          <>
            {/* The artboard's C22_MuiIconTile: the tone's container pair. */}
            <Box sx={{ ...ICON_TILE, bgcolor: `${tile.tone}.container`, color: `${tile.tone}.onContainer` }}>
              <Icon name={tile.icon} size={16} />
            </Box>
            <Box component="span" sx={{ minWidth: 0 }}>
              <Typography component="span" variant="subtitle1" sx={{ ...TITLE_S, display: "block" }}>
                {tile.label}
              </Typography>
              <Typography
                component="span"
                variant="caption"
                noWrap
                sx={{ display: "block", color: "text.secondary" }}
              >
                {tile.sub}
              </Typography>
            </Box>
          </>
        );
        return (
          <Box component="li" key={tile.label}>
            {tile.href ? (
              <Card>
                <CardActionArea component={NextLink} href={tile.href} sx={TILE_SX}>
                  {body}
                </CardActionArea>
              </Card>
            ) : (
              <Card aria-disabled="true" sx={{ opacity: 0.6 }}>
                <Box sx={TILE_SX}>{body}</Box>
              </Card>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** Label over value — the artboard's C22_MuiKV. */
function KeyValue({ label, value, sx }: { label: string; value: string; sx?: object }) {
  return (
    <Box sx={sx}>
      <Typography component="dt" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25 }}>
        {value}
      </Typography>
    </Box>
  );
}

function Glance({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const rows: Array<[string, string]> = [
    [TRIP_DETAIL.glanceTripType, humaniseTripType(trip.tripType)],
    ...(nights !== null ? ([[TRIP_DETAIL.glanceNights, `${nights} nights`]] as Array<[string, string]>) : []),
    [TRIP_DETAIL.glanceDestination, trip.destinations.join(", ") || "To be decided"],
    [TRIP_DETAIL.glanceTravelers, `${trip.travelerCount} travelers`],
    [
      TRIP_DETAIL.glanceTotal,
      formatTripMoney(trip.totalValueCents, trip.currency) + " all-in",
    ],
    [TRIP_DETAIL.glanceComponents, `${detail.componentCount} booked`],
  ];

  return (
    <Card sx={{ mt: 1.5 }}>
      <CardContent sx={CARD_PAD}>
        <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
          {TRIP_DETAIL.glance}
        </Typography>
        <Box
          component="dl"
          sx={{
            m: 0,
            mt: 1.5,
            display: "grid",
            gap: 1.75,
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", web: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {rows.map(([label, value]) => (
            <KeyValue key={label} label={label} value={value} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function AgentNote({ detail }: { detail: TripDetail }) {
  return (
    <Card sx={{ mt: 1.5 }}>
      <CardContent sx={CARD_PAD}>
        <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
          {TRIP_DETAIL.noteHeading}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
          {detail.introNote ?? TRIP_DETAIL.notePending}
        </Typography>
      </CardContent>
    </Card>
  );
}

function CancellationSummary({ detail }: { detail: TripDetail }) {
  return (
    <Card>
      <CardContent sx={CARD_PAD}>
        <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
          {TRIP_DETAIL.cancelledHeading}
        </Typography>
        <Box
          component="dl"
          sx={{ m: 0, mt: 1.5, display: "grid", gap: 1.75, gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))" } }}
        >
          <KeyValue
            label={TRIP_DETAIL.cancelledReason}
            value={detail.cancellationReason ?? TRIP_DETAIL.cancelledNoReason}
            sx={{ gridColumn: { md: "span 2" } }}
          />
          {detail.refundStatus && (
            <KeyValue
              label={TRIP_DETAIL.cancelledRefund}
              value={detail.refundStatus}
              sx={{ gridColumn: { md: "span 2" } }}
            />
          )}
        </Box>
        {detail.itineraryReady && (
          <MuiButton
            component={NextLink}
            href={`/trips/${detail.trip.id}/itinerary`}
            variant="outlined"
            color="secondary"
            sx={{ ...BTN, mt: 2 }}
          >
            <Icon name="passport" size={14} /> {TRIP_DETAIL.archivedItinerary}
          </MuiButton>
        )}
      </CardContent>
    </Card>
  );
}

function ReadyAgain() {
  return (
    <Card sx={{ bgcolor: "secondary.container", color: "secondary.onContainer" }}>
      <CardContent sx={CARD_PAD}>
        <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
          {TRIP_DETAIL.cancelledAgainHeading}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.9 }}>
          {TRIP_DETAIL.cancelledAgainBody}
        </Typography>
      </CardContent>
    </Card>
  );
}

function AdvisorCard({ tripId }: { tripId: string }) {
  return (
    <Card>
      <CardContent sx={CARD_PAD_SM}>
        <Typography component="div" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
          {TRIP_DETAIL.advisorLabel}
        </Typography>
        <Box sx={{ mt: 0.75, display: "flex", alignItems: "center", gap: 1.25 }}>
          {/* Initials on primary, as the top bar draws them. A photograph would be the real
              thing, but the only asset behind the artboard's is a stock portrait. */}
          <Avatar
            aria-hidden="true"
            sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 600, bgcolor: "primary.main", color: "primary.contrastText" }}
          >
            GS
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="div" variant="subtitle1" sx={TITLE_S}>
              {TRIP_DETAIL.advisorName}
            </Typography>
            <Typography component="div" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {TRIP_DETAIL.advisorReplyTime}
            </Typography>
          </Box>
        </Box>
        <MuiButton
          component={NextLink}
          href={`/trips/${tripId}/messages`}
          variant="outlined"
          color="secondary"
          size="small"
          fullWidth
          sx={{ ...BTN_SM, mt: 1.25 }}
        >
          <Icon name="message" size={14} /> {TRIP_DETAIL.message}
        </MuiButton>
      </CardContent>
    </Card>
  );
}

/**
 * `payment_milestone`, which exists because of this card. It is a supplier payment schedule
 * the client is being kept informed about — never an invoice, and there is deliberately no
 * action on it beyond §2.4's card authorization.
 */
function PaymentTimeline({ milestones }: { milestones: PaymentMilestoneView[] }) {
  if (milestones.length === 0) {
    return (
      <Card>
        <CardContent sx={CARD_PAD_SM}>
          <Typography component="div" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
            {TRIP_DETAIL.paymentTimeline}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
            {TRIP_DETAIL.noSchedule}
          </Typography>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent sx={CARD_PAD_SM}>
        <Typography component="div" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
          {TRIP_DETAIL.paymentTimeline}
        </Typography>
        <Box
          component="ul"
          sx={{ m: 0, p: 0, mt: 1, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75 }}
        >
          {milestones.map((m) => {
            const paid = m.status === "paid";
            const waived = m.status === "waived";
            const overdue = m.status === "overdue";
            const dot = paid ? "success.main" : overdue ? "error.main" : "outline.main";
            return (
              <Typography
                component="li"
                key={m.id}
                variant="caption"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  fontWeight: 500,
                  ...(overdue && { color: "error.main" }),
                }}
              >
                {/* The legacy `.dot` — the artboard's C22_MuiDot. */}
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: dot }} />
                <span>
                  {m.label} ·{" "}
                  {waived
                    ? TRIP_DETAIL.waived
                    : paid
                      ? `${TRIP_DETAIL.paid} ${formatTripMoney(m.paidCents, m.currency)}`
                      : `${formatTripMoney(m.amountCents, m.currency)} ${
                          overdue ? TRIP_DETAIL.overdue : TRIP_DETAIL.due
                        }${m.dueDate ? ` ${formatDay(m.dueDate)}` : ""}`}
                </span>
              </Typography>
            );
          })}
        </Box>
        <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
          {TRIP_DETAIL.paymentTimelineNote}
        </Typography>
      </CardContent>
    </Card>
  );
}

function nextDueLabel(milestones: PaymentMilestoneView[]): string {
  const next = milestones.find((m) => m.status !== "paid" && m.status !== "waived");
  if (!next) return milestones.length > 0 ? "All paid" : "Nothing scheduled";
  return `${formatTripMoney(next.amountCents, next.currency)} ${TRIP_DETAIL.due}${
    next.dueDate ? ` ${formatDay(next.dueDate)}` : ""
  }`;
}

function nightsBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const nights = Math.round((b - a) / 86_400_000);
  return nights > 0 ? nights : null;
}

/** `all_inclusive` → "All-inclusive". The enum is not copy. */
function humaniseTripType(tripType: string): string {
  const map: Record<string, string> = {
    cruise: "Cruise",
    all_inclusive: "All-inclusive",
    multi_destination: "Multi-destination",
    group: "Group trip",
    custom: "Custom",
  };
  return map[tripType] ?? tripType.replace(/_/g, " ");
}
