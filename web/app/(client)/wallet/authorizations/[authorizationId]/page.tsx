import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RetryState } from "@/components/client/RetryState";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/public/money";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { brandName, cardLabel, formatDate, remainingLabel } from "@/lib/wallet/format";
import { authorizationFor, cardFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.authorizeTitle };

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
    <div className="mx-auto w-full max-w-2xl px-4 py-5 text-center md:px-6 md:py-9">
      {justAuthorized && (
        <span
          aria-hidden="true"
          className="mx-auto mb-3 inline-flex h-20 w-20 items-center justify-center rounded-full bg-success-container text-success"
        >
          <Icon name="check" size={40} strokeWidth={2.5} />
        </span>
      )}

      <p className="t-label text-brand-orange">{WALLET.confirmedOverline}</p>
      <h1 className="t-headline mt-1">
        {card ? `Your ${brandName(card.brand)} is ready` : "Your card is ready"}
        {auth.tripTitle ? ` for ${auth.tripTitle}.` : "."}
      </h1>
      <p className="t-body mt-1 text-on-surface-variant">
        Gyasi can now pay suppliers for this trip from this card, up to the limit you set.
      </p>

      <Card className="mt-5 p-4 text-left">
        <p className="t-label text-on-surface-variant">{WALLET.confirmedSummary}</p>
        <dl>
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-t border-outline-variant py-2"
            >
              <dt className="t-body-s text-on-surface-variant">{row.label}</dt>
              <dd className="t-body-s text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
        {auth.status === "active" && (
          <p className="t-body-s mt-2 text-on-surface-variant">{remainingLabel(auth)}</p>
        )}
      </Card>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/wallet/activity" className="btn btn-outlined tap-44 h-11">
          {WALLET.activityTitle}
        </Link>
        <Link href={`/trips/${auth.tripId}`} className="btn btn-filled tap-44 h-11">
          {WALLET.confirmedBackToTrip}
        </Link>
      </div>

      {auth.status === "active" && (
        <Link
          href={`/wallet/authorizations/${auth.id}/remove`}
          className="btn btn-text btn-sm tap-44 mt-3 inline-flex"
        >
          {WALLET.removeAuthorization}
        </Link>
      )}
    </div>
  );
}
