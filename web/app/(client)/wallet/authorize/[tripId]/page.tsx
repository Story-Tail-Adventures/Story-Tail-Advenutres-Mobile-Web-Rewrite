import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import { Card } from "@/components/ui/Card";
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
    <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-6 md:py-7">
      <Link href={`/trips/${tripId}`} className="btn btn-text btn-sm tap-44 -ml-1 mb-1 inline-flex">
        <Icon name="arrow_left" size={14} />
        {trip.trip.title}
      </Link>

      <h1 className="t-headline">{WALLET.authorizeTitle}</h1>

      <Card className="mt-3 p-4">
        <span className="chip-status booked">{trip.trip.statusLabel}</span>
        <p className="t-title-s mt-2">{trip.trip.title}</p>
        <p className="t-body-s text-on-surface-variant">
          {trip.trip.destinations.join(", ")}
          {trip.trip.travelerCount ? ` · ${trip.trip.travelerCount} travelers` : ""}
        </p>
        <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
          <span className="t-body-s text-on-surface-variant">Balance due</span>
          <span className="t-title-s font-mono">
            {formatMoney({ amountCents: balanceDueCents, currency: "USD" })}
          </span>
        </div>
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
    </div>
  );
}
