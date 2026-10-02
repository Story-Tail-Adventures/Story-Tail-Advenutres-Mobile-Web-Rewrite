import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BODY,
  BODY_S,
  BTN_44,
  BTN_SM,
  CARD_PAD,
  HEADLINE,
  LABEL,
  MAX_W_2XL,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import { formatMoney } from "@/lib/public/money";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { brandName, cardLabel, formatDate, remainingLabel } from "@/lib/wallet/format";
import { authorizationFor, cardFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.confirmedTitle };

/** The 44px CTA pair, with the legacy tap area. */
const CTA_SX = { ...BTN_44, ...TAP_TARGET } as const;

/**
 * Screen 2.4.4 Card Authorization Confirmation — docs/Screen-Inventory.md §2.4.4, §4.4
 * (Pattern **H**), and design/source-prototype/screens/client-payment.jsx
 * (C244_AuthConfirmation) + client-payment-mobile.jsx (M244_Confirmation). P1.
 *
 * A ROUTE, NOT A FLASH OF STATE on 2.4.3. The authorization has an id the moment it exists,
 * so it has an address; and this is a page a traveler may want to come back to — "what did I
 * agree to, and until when" is a question that outlives the tap that answered it. `?new=1`
 * only decides whether the success chrome shows, so the same URL is a plain detail view
 * afterwards.
 *
 * **IT DOES NOT PROMISE A NOTIFICATION.** The artboard's summary carries a fifth row,
 * "Notifications · Email + push on every use", and its prose ends "you'll be notified". No
 * dispatcher exists on either stack — no transactional email, no push, and
 * `notification_preference` is read and written by nothing. On this screen that would merely
 * be a false line; the same clause in 2.4.3's mandate would be *persisted* into
 * `consent_payload`, so it is cut in both places at once and returns as consent version 2.
 *
 * **IT NAMES THE SUPPLIER, NOT "THE INVOICE".** The desktop says "Gyasi can settle the May 28
 * invoice", which reads as a Story-Tail invoice on a platform contractually prohibited from
 * client-facing billing (BRD §10.5). What is true is that the advisor can now pay a supplier
 * from this card, up to the limit the traveler set.
 */
export default async function AuthorizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ authorizationId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ authorizationId }, { new: isNew }, wallet, me] = await Promise.all([
    params,
    searchParams,
    loadWallet(),
    currentPlatformUser(),
  ]);

  if (!wallet) return <RetryState />;

  const auth = authorizationFor(wallet, authorizationId);
  // The wallet holds only this traveler's rows, so absent already means "not yours or not
  // there" — one answer, as everywhere else in §2.x.
  if (!auth) notFound();

  const card = cardFor(wallet, auth.cardId);
  const justAuthorized = isNew === "1" && auth.status === "active";

  const rows = [
    { label: WALLET.confirmedTrip, value: auth.tripTitle ?? "—" },
    { label: WALLET.confirmedCard, value: card ? cardLabel(card) : "—" },
    {
      label: WALLET.confirmedLimit,
      value: formatMoney({ amountCents: auth.spendingLimitCents, currency: "USD" }),
    },
    { label: WALLET.confirmedExpires, value: formatDate(auth.expiresAt, me.timeZone) },
  ];

  return (
    <Box sx={{ ...pageSx(MAX_W_2XL, 4.5), textAlign: "center" }}>
      {justAuthorized && (
        <Avatar
          aria-hidden="true"
          sx={{
            width: 80,
            height: 80,
            mx: "auto",
            mb: 1.5,
            bgcolor: "success.container",
            color: "success.main",
            boxShadow: 2,
          }}
        >
          <Icon name="check" size={40} strokeWidth={2.5} />
        </Avatar>
      )}

      <Typography component="p" variant="caption" sx={{ ...LABEL, color: "brand.main" }}>
        {WALLET.confirmedOverline}
      </Typography>
      <Typography component="h1" variant="h5" sx={{ ...HEADLINE, mt: 0.5 }}>
        {card ? `Your ${brandName(card.brand)} is ready` : "Your card is ready"}
        {auth.tripTitle ? ` for ${auth.tripTitle}.` : "."}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 0.5, color: "text.secondary" }}>
        Gyasi can now pay suppliers for this trip from this card, up to the limit you set.
      </Typography>

      <Card sx={{ mt: 2.5, textAlign: "left" }}>
        <CardContent sx={CARD_PAD}>
          <Typography component="p" variant="caption" sx={{ ...LABEL, color: "text.secondary" }}>
            {WALLET.confirmedSummary}
          </Typography>
          <Box component="dl" sx={{ m: 0 }}>
            {rows.map((row) => (
              <Box
                key={row.label}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 2,
                  py: 1,
                  borderTop: 1,
                  borderColor: "divider",
                }}
              >
                <Typography component="dt" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
                  {row.label}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ ...BODY_S, m: 0, textAlign: "right" }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
          {auth.status === "active" && (
            <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 1, color: "text.secondary" }}>
              {remainingLabel(auth)}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ mt: 2.5, justifyContent: { sm: "center" } }}
      >
        <MuiButton component={NextLink} href="/wallet/activity" variant="outlined" sx={CTA_SX}>
          {WALLET.activityTitle}
        </MuiButton>
        <MuiButton component={NextLink} href={`/trips/${auth.tripId}`} variant="contained" sx={CTA_SX}>
          {WALLET.confirmedBackToTrip}
        </MuiButton>
      </Stack>

      {auth.status === "active" && (
        <MuiButton
          component={NextLink}
          href={`/wallet/authorizations/${auth.id}/remove`}
          variant="text"
          size="small"
          sx={{ ...BTN_SM, ...TAP_TARGET, mt: 1.5 }}
        >
          {WALLET.removeAuthorization}
        </MuiButton>
      )}
    </Box>
  );
}
