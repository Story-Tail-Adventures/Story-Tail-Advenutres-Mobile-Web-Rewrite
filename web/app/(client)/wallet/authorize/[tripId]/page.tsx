import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import {
  BACK_LINK_SX,
  BODY_S,
  CARD_PAD,
  HEADLINE,
  MAX_W_2XL,
  TITLE_S,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/public/money";
import { currentPlatformUser, loadTripDetail } from "@/lib/trips/queries";
import { authorizeCard } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";
import { defaultExpiry, formatDate, limitPresets } from "@/lib/wallet/format";
import { loadWallet } from "@/lib/wallet/queries";
import { AuthorizeForm } from "./AuthorizeForm";

export const metadata: Metadata = { title: WALLET.authorizeTitle };

/**
 * Screen 2.4.3 Card Authorization for Trip — docs/Screen-Inventory.md §2.4.3, §4.4 (Pattern
 * **A**), and design/source-prototype/screens/client-payment.jsx (C243_AuthorizeForTrip) +
 * client-payment-mobile.jsx (M243_Authorize). P1.
 *
 * TRIP-SCOPED BY ROUTE, because an authorization without a trip is not a thing the schema
 * can hold: `card_authorization.trip_id` is NOT NULL and a partial unique index allows one
 * active authorization per card per trip. The URL says which trip so the screen cannot be
 * reached in a state where that question is open.
 *
 * THE TRIP CARD SITS ABOVE THE FORM, where the desktop puts it in a right rail. On a phone
 * the traveler needs to know which trip they are authorizing before they pick a card, not
 * after; on web the same order costs nothing and keeps one component.
 *
 * **THE EMAILED-LINK ENTRY POINT IS NOT BUILT.** §2.4.3 lists "link in agent-sent email"
 * among its entry points. `authorization_request` exists with a `token_hash`, an
 * `expires_at` and a `status` — the whole shape of a single-use link — and nothing writes a
 * row to it, because the requesting side is the agent's (§3.x) and no transactional email
 * exists in the stack. That token is also why this section's first migration was a revoke:
 * `token_hash` was readable by `anon`, which for a bearer secret is an authorization-bypass
 * primitive rather than a disclosure.
 */
export default async function AuthorizePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const [wallet, trip, me] = await Promise.all([
    loadWallet(),
    loadTripDetail(tripId),
    currentPlatformUser(),
  ]);

  if (!wallet) return <RetryState />;
  // Null is "not yours" and "no such trip" at once — RLS makes them the same answer.
  if (!trip) notFound();

  const usable = wallet.cards.filter((card) => card.status === "active");
  const balanceDueCents = Math.max(
    0,
    trip.trip.totalValueCents - trip.trip.totalPaidCents,
  );
  const expiry = defaultExpiry(trip.trip.endDate, new Date());

  return (
    <Box sx={pageSx(MAX_W_2XL)}>
      <MuiButton
        component={NextLink}
        href={`/trips/${tripId}`}
        variant="text"
        size="small"
        startIcon={<Icon name="arrow_left" size={14} />}
        sx={BACK_LINK_SX}
      >
        {trip.trip.title}
      </MuiButton>

      <Typography component="h1" variant="h5" sx={HEADLINE}>
        {WALLET.authorizeTitle}
      </Typography>

      <Card sx={{ mt: 1.5 }}>
        <CardContent sx={CARD_PAD}>
          <StatusChip kind="booked" label={trip.trip.statusLabel} />
          <Typography component="p" variant="subtitle1" sx={{ ...TITLE_S, mt: 1 }}>
            {trip.trip.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
            {trip.trip.destinations.join(", ")}
            {trip.trip.travelerCount ? ` · ${trip.trip.travelerCount} travelers` : ""}
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              pt: 1.5,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <Typography component="span" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
              Balance due
            </Typography>
            <Typography component="span" variant="subtitle1" sx={{ ...TITLE_S, fontFamily: "mono" }}>
              {formatMoney({ amountCents: balanceDueCents, currency: "USD" })}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {usable.length === 0 ? (
        // No usable card and no way to add one while 2.4.2 is deferred. Saying so beats a
        // form whose only control is inert.
        <EmptyState
          icon="card"
          title={WALLET.emptyTitle}
          body={`${WALLET.emptyBody} ${WALLET.addCardDeferred}.`}
        />
      ) : (
        <AuthorizeForm
          // Bound here rather than inside the form, so the client component never needs the
          // trip id for anything but display — and cannot send a different one.
          action={authorizeCard.bind(null, tripId)}
          cards={usable}
          presets={limitPresets(balanceDueCents)}
          defaultExpiryIso={expiry.toISOString()}
          defaultExpiryLabel={formatDate(expiry.toISOString(), me.timeZone)}
        />
      )}
    </Box>
  );
}
