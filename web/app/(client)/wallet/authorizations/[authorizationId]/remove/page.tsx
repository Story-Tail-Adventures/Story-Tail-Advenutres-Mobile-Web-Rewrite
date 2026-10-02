import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BODY,
  BODY_S,
  LABEL,
  MAX_W_2XL,
  TITLE_L,
  TITLE_S,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import { Icon } from "@/components/ui/Icon";
import { currentPlatformUser } from "@/lib/trips/queries";
import { removeAuthorization } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";
import { cardLabel, formatDate, remainingLabel } from "@/lib/wallet/format";
import { authorizationFor, cardFor, loadWallet } from "@/lib/wallet/queries";
import { RemoveForm } from "./RemoveForm";

export const metadata: Metadata = { title: WALLET.removeTitle };

/**
 * Screen 2.4.7 Revoke Card Authorization Confirmation — docs/Screen-Inventory.md §2.4.7,
 * §4.4 (Pattern **J**), and design/source-prototype/screens/client-payment.jsx
 * (C247_RevokeConfirm) + client-payment-mobile.jsx (M247_RevokeConfirm). P1.
 *
 * **IT REMOVES AN AUTHORIZATION, NOT A CARD**, and that is the whole shape of this screen
 * rather than a caveat on it. Revoking a `card_authorization` is a local row and a local
 * truth: the agent may no longer charge that card for that trip, and setting
 * `status = 'revoked'` makes it so. Revoking a `payment_card` is not local — with no Stripe
 * integration, setting `payment_card.status` in Postgres leaves the PaymentMethod live in
 * Stripe's vault while this screen tells the traveler the card is gone. Data-Model §18.5
 * expects the Stripe Customer deleted on erasure; the local half alone is a broken promise
 * about a stored card, which is worse than an absent button. So the heading names the trip,
 * and the screen says plainly that the card stays on file.
 *
 * **A FULL PAGE, NOT A MODAL** — the desktop frame draws it over a dimmed screen. §2.5.10
 * made the same call for the same reason: a destructive confirmation deserves its own
 * address and its own Back, and a sheet's grabber means "swipe this away", which is exactly
 * the wrong affordance.
 *
 * **NO AGENT-NOTIFICATION PREVIEW.** The artboard shows a "WE'LL NOTIFY" panel previewing an
 * alert to Gyasi. Nothing sends it. The revoke does write its `audit_event`, so the record
 * exists for the agent surface to read in §3.x — the record, not the message. (That panel is
 * also where the prototype misgenders Gyasi, "She may request a different card"; his
 * pronouns are he/him, and §2.2's artboard records catching the same error once already.)
 */
export default async function RemoveAuthorizationPage({
  params,
}: {
  params: Promise<{ authorizationId: string }>;
}) {
  const { authorizationId } = await params;
  const [wallet, me] = await Promise.all([loadWallet(), currentPlatformUser()]);

  if (!wallet) return <RetryState />;

  const auth = authorizationFor(wallet, authorizationId);
  if (!auth) notFound();

  // Already revoked: there is nothing to confirm, and a confirmation screen for a thing that
  // has already happened invites a second tap that does nothing. The detail page tells the
  // truth about its current state instead.
  if (auth.status !== "active") redirect(`/wallet/authorizations/${auth.id}`);

  const card = cardFor(wallet, auth.cardId);

  return (
    <Box sx={pageSx(MAX_W_2XL)}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Avatar
          aria-hidden="true"
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            bgcolor: "error.container",
            color: "error.onContainer",
          }}
        >
          <Icon name="warning" size={20} />
        </Avatar>
        <Box>
          <Typography component="p" variant="caption" sx={{ ...LABEL, color: "error.main" }}>
            {WALLET.removeOverline}
          </Typography>
          <Typography component="h1" variant="h5" sx={TITLE_L}>
            Stop using this card for {auth.tripTitle ?? "this trip"}?
          </Typography>
        </Box>
      </Stack>

      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 2, color: "text.secondary" }}>
        {WALLET.removeBodyLead} <b>{WALLET.removeBodyPast}</b>
      </Typography>

      <Paper elevation={0} sx={{ mt: 2, p: 2, bgcolor: "surface.2" }}>
        <Typography component="p" variant="caption" sx={{ ...LABEL, color: "text.secondary" }}>
          {WALLET.removeThisAuthorization}
        </Typography>
        <Typography component="p" variant="subtitle1" sx={{ ...TITLE_S, mt: 0.5 }}>
          {auth.tripTitle ?? "—"}
        </Typography>
        <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
          {card ? `${cardLabel(card)} · ` : ""}
          {remainingLabel(auth)} · {WALLET.expiresLabel.toLowerCase()}{" "}
          {formatDate(auth.expiresAt, me.timeZone)}
        </Typography>
      </Paper>

      {/* Said plainly rather than left for somebody to discover after tapping. */}
      <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 2, color: "text.secondary" }}>
        {WALLET.removeCardStays}
      </Typography>

      <RemoveForm action={removeAuthorization.bind(null, auth.id)} />
    </Box>
  );
}
