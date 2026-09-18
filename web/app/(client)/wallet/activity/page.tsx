import type { Metadata } from "next";
import Link from "next/link";

import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
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
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
      <Link href="/wallet" className="btn btn-text btn-sm tap-44 -ml-1 mb-1 inline-flex">
        <Icon name="arrow_left" size={14} />
        {WALLET.title}
      </Link>

      <h1 className="t-headline">{WALLET.activityTitle}</h1>
      <p className="t-body mt-1 text-on-surface-variant">{WALLET.activitySubtitle}</p>

      {wallet.cards.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/wallet/activity"
            className={`chip tap-44 h-8 shrink-0 ${cardFilter ? "" : "chip-filter is-on"}`}
          >
            {WALLET.filterAllCards}
          </Link>
          {wallet.cards.map((card) => (
            <Link
              key={card.id}
              href={`/wallet/activity?card=${card.id}`}
              className={`chip tap-44 h-8 shrink-0 ${cardFilter === card.id ? "chip-filter is-on" : ""}`}
            >
              {cardLabel(card)}
            </Link>
          ))}
        </div>
      )}

      {wallet.events.length === 0 ? (
        <EmptyState
          icon="card"
          title={WALLET.activityEmptyTitle}
          body={WALLET.activityEmptyBody}
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {wallet.events.map((event) => {
            const card = cardFor(wallet, event.cardId);
            return (
              <li key={event.id}>
                <Link
                  href={`/wallet/activity/${event.id}`}
                  className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface p-3 hover:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container"
                  >
                    <Icon name="card" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-title-s truncate">{event.supplierName}</p>
                    <p className="t-body-s truncate text-on-surface-variant">
                      {formatDate(event.createdAt, me.timeZone)}
                      {event.tripTitle ? ` · ${event.tripTitle}` : ""}
                      {card ? ` · ${cardLabel(card)}` : ""}
                    </p>
                  </div>
                  <span className="t-title-s shrink-0 font-mono">
                    {formatAmount(event.amountCents, event.currency)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
