import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BACK_LINK_SX,
  BODY,
  BODY_S,
  FILTER_CHIP_SX,
  HEADLINE,
  MAX_W_3XL,
  TITLE_S,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { cardLabel, formatAmount, formatDate } from "@/lib/wallet/format";
import { cardFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.activityTitle };

/**
 * Screen 2.4.5 Card Use History — docs/Screen-Inventory.md §2.4.5, §4.4 (Pattern **I**), and
 * design/source-prototype/screens/client-payment.jsx (C245_CardUseHistory) +
 * client-payment-mobile.jsx (M245_Activity). P1.
 *
 * NEWEST FIRST. This is a statement, and a statement reads backwards from the most recent
 * charge. §2.2.7's thread is ordered the opposite way for the opposite reason: a conversation
 * reads forwards.
 *
 * **NO CSV EXPORT**, and it is cut rather than rendered disabled — the one §2.4 deferral that
 * is not drawn. It would be the only surface in this section that persists the data outside
 * the platform, where no revocation reaches it and no audit follows it, and the naive
 * implementation joins to `payment_card` and carries both Stripe tokens into a file on a
 * device. There is no export precedent anywhere in this repo to copy safely. If it is ever
 * built it is a server-side function with a hand-written column allowlist, audited as a bulk
 * export per Data-Model §18.3 — a feature with its own design, not a button here.
 *
 * THE SUPPLIER NAME IS THE SNAPSHOT, never a join. A supplier renamed later must not rewrite
 * a traveler's history, and a portal booking names a merchant that has no `supplier` row at
 * all — the seeded "NEGRIL TRANSFERS LTD" is exactly that case, and it is in the fixtures so
 * this stays true when somebody refactors.
 *
 * NOTHING WRITES `card_use_event` YET. The producing surface is the agent's reveal-and-record
 * flow in §3.6, unbuilt. The screen is real and reads real rows; today those rows come from
 * `seed.sql`. That is the §2.5 precedent — say plainly what is not live rather than withhold
 * the screen.
 */
export default async function CardActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; trip?: string }>;
}) {
  const { card: cardFilter, trip: tripFilter } = await searchParams;

  const [wallet, me] = await Promise.all([
    // The filter is applied by the Edge Function rather than here, so a traveler with a long
    // history does not ship every row to the server just to drop most of them.
    loadWallet({ cardId: cardFilter, tripId: tripFilter }),
    currentPlatformUser(),
  ]);

  if (!wallet) return <RetryState />;

  return (
    <Box sx={pageSx(MAX_W_3XL)}>
      <MuiButton
        component={NextLink}
        href="/wallet"
        variant="text"
        size="small"
        startIcon={<Icon name="arrow_left" size={14} />}
        sx={BACK_LINK_SX}
      >
        {WALLET.title}
      </MuiButton>

      <Typography component="h1" variant="h5" sx={HEADLINE}>
        {WALLET.activityTitle}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 0.5, color: "text.secondary" }}>
        {WALLET.activitySubtitle}
      </Typography>

      {/* The filter strip: the chosen card is the filled secondary chip (the §8 chip
          mapping), the rest outlined. Each chip is a link, so the filter is a URL. */}
      {wallet.cards.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, pb: 0.5, overflowX: "auto" }}>
          <Chip
            component={NextLink}
            href="/wallet/activity"
            clickable
            label={WALLET.filterAllCards}
            // The colour is not the only sign of the chosen filter.
            aria-current={cardFilter ? undefined : "true"}
            variant={cardFilter ? "outlined" : "filled"}
            color={cardFilter ? "default" : "secondary"}
            sx={FILTER_CHIP_SX}
          />
          {wallet.cards.map((card) => {
            const on = cardFilter === card.id;
            return (
              <Chip
                key={card.id}
                component={NextLink}
                href={`/wallet/activity?card=${card.id}`}
                clickable
                label={cardLabel(card)}
                aria-current={on ? "true" : undefined}
                variant={on ? "filled" : "outlined"}
                color={on ? "secondary" : "default"}
                sx={FILTER_CHIP_SX}
              />
            );
          })}
        </Stack>
      )}

      {wallet.events.length === 0 ? (
        <EmptyState
          icon="card"
          title={WALLET.activityEmptyTitle}
          body={WALLET.activityEmptyBody}
        />
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: "none", m: 0, p: 0, mt: 2, display: "flex", flexDirection: "column", gap: 1 }}
        >
          {wallet.events.map((event) => {
            const card = cardFor(wallet, event.cardId);
            return (
              <li key={event.id}>
                <Card variant="outlined">
                  <CardActionArea
                    component={NextLink}
                    href={`/wallet/activity/${event.id}`}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 1.5,
                      p: 1.5,
                      textAlign: "left",
                    }}
                  >
                    <Avatar
                      variant="rounded"
                      aria-hidden="true"
                      sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        bgcolor: "primary.container",
                        color: "primary.onContainer",
                      }}
                    >
                      <Icon name="card" size={16} />
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography component="p" variant="subtitle1" noWrap sx={TITLE_S}>
                        {event.supplierName}
                      </Typography>
                      <Typography
                        component="p"
                        variant="body2"
                        noWrap
                        sx={{ ...BODY_S, color: "text.secondary" }}
                      >
                        {formatDate(event.createdAt, me.timeZone)}
                        {event.tripTitle ? ` · ${event.tripTitle}` : ""}
                        {card ? ` · ${cardLabel(card)}` : ""}
                      </Typography>
                    </Box>
                    <Typography
                      component="span"
                      variant="subtitle1"
                      sx={{ ...TITLE_S, flexShrink: 0, fontFamily: "mono" }}
                    >
                      {formatAmount(event.amountCents, event.currency)}
                    </Typography>
                  </CardActionArea>
                </Card>
              </li>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
