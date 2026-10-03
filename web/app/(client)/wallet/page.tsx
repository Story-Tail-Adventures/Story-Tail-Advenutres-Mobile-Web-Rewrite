import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  BODY,
  BODY_S,
  BTN_SM,
  CARD_PAD,
  HEADLINE,
  MAX_W_3XL,
  TITLE_S,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import { formatMoney } from "@/lib/public/money";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import {
  brandChip,
  brandPlate,
  cardExpiry,
  cardStatusLabel,
  formatDate,
  remainingLabel,
} from "@/lib/wallet/format";
import { activeAuthorizationsFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.title };

/**
 * The card-network plate: the artboard's C24_MuiNetworkBadge. Its background is the one
 * deliberate fixed colour on the page — a third-party mark, not a palette role — and it
 * comes from `brandPlate()` as an inline style, exactly as before.
 */
const PLATE_SX = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 24,
  flexShrink: 0,
  borderRadius: 1,
  color: "common.white",
  fontWeight: 800,
  fontSize: 9,
  lineHeight: 1,
} as const;

/** A `.btn-sm` link with the legacy tap area. */
const SMALL_LINK_SX = { ...BTN_SM, ...TAP_TARGET } as const;

/**
 * Screen 2.4.1 My Cards / Payment Methods — docs/Screen-Inventory.md §2.4.1, §4.4 (Pattern
 * **B**), and design/source-prototype/screens/client-payment.jsx (C241_MyCards) +
 * client-payment-mobile.jsx (M241_MyCards). P1.
 *
 * THE LIST IS A RECORD, NOT A SETTINGS PANE. A revoked card stays on it with the date it was
 * revoked, because the question this screen answers is "what has been able to charge me, and
 * when" — not "what can charge me now". That is why the status chip is load-bearing and why
 * revoked rows keep their place rather than disappearing.
 *
 * NO CARD ART. The artboard draws each card as a gradient plate with the number in 26px
 * monospace. On web there is room for it, and it is still dropped: the plate makes the
 * screen look like a wallet app whose job is spending, and this one's job is disclosure. The
 * brand chip carries the same identification in a tenth of the space, and what fills the
 * rest is the authorization — which trip, how much is left, when it lapses.
 *
 * **2.4.2 IS DEFERRED**, so "Add a card" renders disabled with its reason rather than being
 * hidden — the §2.5 rule, so the list does not grow controls under the reader's thumb when
 * §2.4.2 lands. It cannot be built at all until a Stripe account exists: both Stripe columns
 * on `payment_card` are NOT NULL, so there is no row without a real tokenization.
 *
 * EVERYTHING HERE COMES FROM AN EDGE FUNCTION. The payment tables hold no client-role
 * privilege — see `lib/wallet/queries.ts`.
 *
 * ON MUI (step 2 of the migration): the same column, cards and rows, drawn with MUI Card /
 * Paper / Button / Chip and plain sx, so this stays a Server Component. Only brand, last 4
 * and expiry ever reach the markup — the same three fields as before.
 */
export default async function WalletPage() {
  const [wallet, me] = await Promise.all([loadWallet(), currentPlatformUser()]);

  // Null is a failed read, which is §5's error state. An empty wallet is a different thing.
  if (!wallet) return <RetryState />;

  return (
    <Box sx={pageSx(MAX_W_3XL)}>
      <Typography component="h1" variant="h5" sx={HEADLINE}>
        {WALLET.title}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 0.5, color: "text.secondary" }}>
        {WALLET.subtitle}
      </Typography>

      {/* BRD §10.5 is a hard product constraint, not a reassurance: Story-Tail is
          contractually prohibited from charging clients a fee, which is why no invoice
          entity and no charge endpoint exist anywhere in the schema. */}
      <Paper
        elevation={0}
        sx={{
          mt: 2,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 2,
          bgcolor: "secondary.container",
          color: "secondary.onContainer",
        }}
      >
        <Icon name="shield" size={18} />
        <Typography component="p" variant="body2" sx={BODY_S}>
          <b>{WALLET.feeAssurance}</b> {WALLET.feeAssuranceBody}
        </Typography>
      </Paper>

      {wallet.cards.length === 0 ? (
        <EmptyState icon="card" title={WALLET.emptyTitle} body={WALLET.emptyBody} />
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: "none", m: 0, p: 0, mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          {wallet.cards.map((card) => {
            const live = activeAuthorizationsFor(wallet, card.id);
            const active = card.status === "active";
            return (
              <li key={card.id}>
                <Card>
                  <CardContent sx={CARD_PAD}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        component="span"
                        aria-hidden="true"
                        sx={PLATE_SX}
                        style={{ background: brandPlate(card.brand) }}
                      >
                        {brandChip(card.brand)}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          component="p"
                          variant="subtitle1"
                          sx={{ ...TITLE_S, fontFamily: "mono" }}
                        >
                          •••• {card.last4}
                        </Typography>
                        <Typography
                          component="p"
                          variant="body2"
                          sx={{ ...BODY_S, color: "text.secondary" }}
                        >
                          {card.nickname ? `${card.nickname} · ` : ""}exp {cardExpiry(card)}
                        </Typography>
                      </Box>
                      <StatusChip
                        kind={active ? "booked" : "past"}
                        label={cardStatusLabel(card.status)}
                      />
                    </Box>

                    {active && live.length > 0 && (
                      <Box
                        component="ul"
                        sx={{
                          listStyle: "none",
                          m: 0,
                          p: 0,
                          mt: 1.5,
                          pt: 1.5,
                          borderTop: 1,
                          borderColor: "divider",
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        {live.map((auth) => (
                          <Box
                            component="li"
                            key={auth.id}
                            sx={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: 1.5,
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography component="p" variant="body2" noWrap sx={BODY_S}>
                                {auth.tripTitle ?? WALLET.confirmedTrip}
                              </Typography>
                              <Typography
                                component="p"
                                variant="body2"
                                sx={{ ...BODY_S, color: "text.secondary" }}
                              >
                                {remainingLabel(auth)} · {WALLET.expiresLabel.toLowerCase()}{" "}
                                {formatDate(auth.expiresAt, me.timeZone)}
                              </Typography>
                            </Box>
                            <MuiButton
                              component={NextLink}
                              href={`/wallet/authorizations/${auth.id}/remove`}
                              variant="outlined"
                              size="small"
                              sx={{ ...SMALL_LINK_SX, flexShrink: 0 }}
                            >
                              {WALLET.removeAuthorization}
                            </MuiButton>
                          </Box>
                        ))}
                      </Box>
                    )}

                    {!active && card.revokedAt && (
                      <Typography
                        component="p"
                        variant="body2"
                        sx={{
                          ...BODY_S,
                          mt: 1.5,
                          pt: 1.5,
                          borderTop: 1,
                          borderColor: "divider",
                          color: "text.secondary",
                        }}
                      >
                        {WALLET.statusRevoked} {formatDate(card.revokedAt, me.timeZone)}
                      </Typography>
                    )}

                    <Box sx={{ mt: 1.5, display: "flex", gap: 1 }}>
                      <MuiButton
                        component={NextLink}
                        href={`/wallet/activity?card=${card.id}`}
                        variant="outlined"
                        color="secondary"
                        size="small"
                        sx={SMALL_LINK_SX}
                      >
                        {WALLET.viewActivity}
                      </MuiButton>
                    </Box>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </Box>
      )}

      {/* Deferred, shown, and explained — never hidden. The action is a real button, disabled,
          with its reason as the tooltip (components/ui/Button shows a disabled button's
          `title`) AND as visible text beneath it, because a tooltip alone is unreachable on a
          touch screen. */}
      {/* `card`, not `plus`: the artboards draw a plus, but `components/ui/icon-paths.ts`
          has no such glyph — the prototype's own icon set is wider than the one ported into
          the app. Adding a path here to match a disabled control would be the wrong order. */}
      <Paper
        variant="outlined"
        sx={{
          mt: 1.5,
          p: 2.5,
          textAlign: "center",
          borderStyle: "dashed",
          borderColor: "outline.main",
          bgcolor: "surface.2",
          color: "text.secondary",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Icon name="card" size={22} />
        </Box>
        <Box sx={{ mt: 1 }}>
          <Button
            variant="tonal"
            size="sm"
            disabled
            aria-disabled="true"
            title={WALLET.addCardDeferred}
          >
            {WALLET.addCard}
          </Button>
        </Box>
        <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 1 }}>
          {WALLET.addCardDeferred}
        </Typography>
      </Paper>

      {wallet.events.length > 0 && (
        <MuiButton
          component={NextLink}
          href="/wallet/activity"
          variant="text"
          size="small"
          endIcon={<Icon name="arrow_right" size={14} />}
          sx={{ ...SMALL_LINK_SX, mt: 2 }}
        >
          {WALLET.activityTitle}
        </MuiButton>
      )}

      {/* The total across every live authorization. Not in the artboard, and added because
          the question a traveler actually has on this screen is "how much can be charged to
          me right now", which no single row answers. */}
      {wallet.authorizations.some((a) => a.status === "active") && (
        <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 2, color: "text.secondary" }}>
          {formatMoney({
            amountCents: wallet.authorizations
              .filter((a) => a.status === "active")
              .reduce((sum, a) => sum + Math.max(0, a.spendingLimitCents - a.amountUsedCents), 0),
            currency: "USD",
          })}{" "}
          authorized across your trips right now.
        </Typography>
      )}
    </Box>
  );
}
