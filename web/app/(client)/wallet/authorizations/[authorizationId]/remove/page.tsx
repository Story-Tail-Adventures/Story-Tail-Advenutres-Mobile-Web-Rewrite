import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RetryState } from "@/components/client/RetryState";
import { Card } from "@/components/ui/Card";
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
    <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-6 md:py-7">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container"
        >
          <Icon name="warning" size={20} />
        </span>
        <div>
          <p className="t-label text-error">{WALLET.removeOverline}</p>
          <h1 className="t-title-l">
            Stop using this card for {auth.tripTitle ?? "this trip"}?
          </h1>
        </div>
      </div>

      <p className="t-body mt-4 text-on-surface-variant">
        {WALLET.removeBodyLead} <b>{WALLET.removeBodyPast}</b>
      </p>

      <Card className="mt-4 bg-surface-2 p-4">
        <p className="t-label text-on-surface-variant">{WALLET.removeThisAuthorization}</p>
        <p className="t-title-s mt-1">{auth.tripTitle ?? "—"}</p>
        <p className="t-body-s text-on-surface-variant">
          {card ? `${cardLabel(card)} · ` : ""}
          {remainingLabel(auth)} · {WALLET.expiresLabel.toLowerCase()}{" "}
          {formatDate(auth.expiresAt, me.timeZone)}
        </p>
      </Card>

      {/* Said plainly rather than left for somebody to discover after tapping. */}
      <p className="t-body-s mt-4 text-on-surface-variant">{WALLET.removeCardStays}</p>

      <RemoveForm action={removeAuthorization.bind(null, auth.id)} />
    </div>
  );
}
