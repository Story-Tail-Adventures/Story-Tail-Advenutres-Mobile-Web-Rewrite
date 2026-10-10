import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { formatTripDates } from "@/lib/trips/format";
import { formatTripMoney } from "@/lib/trips/money";
import { loadStatusChange } from "@/lib/trips/queries";
import { BACK_LINK, BTN, CARD_PAD, HEADLINE, OVERLINE, TITLE_S } from "../sx";
import { STATUS_CHANGE } from "./content";

export const metadata: Metadata = { title: "Trip update" };

/**
 * Screen 2.2.9 Trip Status Change Notification View — docs/Screen-Inventory.md §2.2.9, and
 * design/source-prototype/screens/client-trip.jsx (C229_StatusChange) +
 * client-trip-mobile.jsx (M229_StatusChange). P1.
 *
 * A ROUTE, NOT A SHEET, and that is the one place this departs from both artboards. They draw
 * it as a bottom sheet over a dimmed dashboard, which is right for the case where a status
 * changes while somebody is already looking at the app. But §2.2.9's own entry points are
 * "push or email notification" — which means the first thing that has to work is a URL
 * arriving cold, from a mail client, on a device where the app was not open. A sheet has no
 * URL. So this is a page, and the sheet presentation is the §2.6 notification-centre concern
 * it actually belongs to.
 *
 * WHAT IT CAN HONESTLY SAY is the real design work here — see the long note in content.ts.
 * The short version: nothing records a status DIFF, so the narrative comes from the status it
 * landed on, and every supporting fact is a real row rendered only when it exists.
 */
export default async function TripUpdatePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const update = await loadStatusChange(tripId);

  if (!update) notFound();

  const { trip } = update;
  const narrative = STATUS_CHANGE.narrativeFor(trip.status, trip.title);
  const steps = STATUS_CHANGE.nextSteps(trip.status);

  // Only facts with a row behind them. An empty list hides the card rather than printing a
  // heading over nothing.
  const facts: string[] = [];
  if (update.proposal) {
    facts.push(
      STATUS_CHANGE.proposalLine(update.proposal.versionNumber, update.proposal.coverTitle),
    );
  }
  if (update.itineraryReady) facts.push(STATUS_CHANGE.itineraryLine);
  if (update.nextPayment) {
    const money = formatTripMoney(
      update.nextPayment.amountCents,
      update.nextPayment.currency,
    );
    facts.push(
      STATUS_CHANGE.paymentLine(
        update.nextPayment.label,
        money,
        update.nextPayment.dueDate ? formatTripDates(update.nextPayment.dueDate, null) : null,
      ),
    );
  }

  const primary = primaryAction(trip.status, tripId, update.itineraryReady, Boolean(update.proposal));

  return (
    // `max-w-2xl`, 16px sides with 40px below on a phone, 24px all round from `md`.
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 }, pb: { xs: 5, md: 3 } }}>
      <MuiLink component={NextLink} href={`/trips/${tripId}`} underline="hover" sx={BACK_LINK}>
        <Icon name="arrow_left" size={14} /> {STATUS_CHANGE.back}
      </MuiLink>

      <Box component="header" sx={{ mt: 2 }}>
        {/* The sparkle badge C229 opens with, on the secondary container. */}
        <Avatar sx={{ width: 54, height: 54, bgcolor: "secondary.container", color: "secondary.onContainer" }}>
          <Icon name="sparkle" size={26} />
        </Avatar>
        <Typography component="p" variant="overline" sx={{ ...OVERLINE, mt: 1.5, color: "text.secondary" }}>
          {narrative.overline} ·{" "}
          {/* An ABSOLUTE date, not "2 min ago". The artboard says "STATUS UPDATED · 2 MIN
              AGO", which is true at the instant the notification fires and a confident lie
              by the time somebody opens the email the next morning. A date cannot go
              stale. */}
          {update.changedAt
            ? formatTripDates(update.changedAt.slice(0, 10), null)
            : STATUS_CHANGE.changedUnknown}
        </Typography>
        <Typography component="h1" variant="h5" sx={{ ...HEADLINE, mt: 0.5 }}>
          {narrative.heading}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 1, maxWidth: "65ch", color: "text.secondary" }}>
          {narrative.body}
        </Typography>
      </Box>

      <Box sx={{ mt: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {facts.length > 0 && (
          <Card component="section">
            <CardContent sx={CARD_PAD}>
              <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
                {STATUS_CHANGE.whatChanged}
              </Typography>
              <Typography
                component="ul"
                variant="body2"
                sx={{
                  m: 0,
                  p: 0,
                  mt: 0.75,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  color: "text.secondary",
                }}
              >
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </Typography>
            </CardContent>
          </Card>
        )}

        <Card component="section">
          <CardContent sx={CARD_PAD}>
            <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
              {STATUS_CHANGE.whatsNext}
            </Typography>
            <Typography
              component="ol"
              variant="body2"
              sx={{ m: 0, mt: 0.75, pl: 2.5, listStyle: "decimal", lineHeight: 1.5, color: "text.secondary" }}
            >
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </Typography>
          </CardContent>
        </Card>

        <MuiButton component={NextLink} href={primary.href} variant="contained" fullWidth sx={BTN}>
          {primary.label} <Icon name="arrow_right" size={13} />
        </MuiButton>

        {/* The payment CTA the artboard shows, live now that §2.4.3 exists. It rendered
            disabled under the plan's "build them visually, disabled" decision; the point of
            that decision was that the button keeps its place until the screen arrives. */}
        {update.nextPayment && (
          <MuiButton component={NextLink} href={`/wallet/authorize/${tripId}`} variant="outlined" fullWidth sx={BTN}>
            <Icon name="card" size={14} /> {STATUS_CHANGE.authorizeCard}
          </MuiButton>
        )}
      </Box>
    </Box>
  );
}

/**
 * The single CTA §2.2.9 asks for: "CTA to view the relevant section".
 *
 * Relevant means "the thing that just changed", and it falls back to the trip overview
 * rather than to a screen that would be empty — a proposal CTA with no sent proposal behind
 * it is the exact kind of dead end this screen is supposed to resolve.
 */
function primaryAction(
  status: string,
  tripId: string,
  itineraryReady: boolean,
  hasProposal: boolean,
): { href: string; label: string } {
  if (status === "proposal" && hasProposal) {
    // §2.2.12 Proposal Viewer is not built, so this lands on the overview, which is where
    // the proposal's own facts are already shown.
    return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewProposal };
  }
  if (status === "completed") {
    return { href: `/trips/${tripId}/memories`, label: STATUS_CHANGE.viewMemories };
  }
  if (status === "cancelled") {
    return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewSummary };
  }
  if (itineraryReady) {
    return { href: `/trips/${tripId}/itinerary`, label: STATUS_CHANGE.viewItinerary };
  }
  return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewTrip };
}
