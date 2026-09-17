import type { Metadata } from "next";
import Link from "next/link";

import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/public/money";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { brandChip, cardExpiry, formatDate, remainingLabel } from "@/lib/wallet/format";
import { activeAuthorizationsFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.title };

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
 */
export default async function WalletPage() {
  const [wallet, me] = await Promise.all([loadWallet(), currentPlatformUser()]);

  // Null is a failed read, which is §5's error state. An empty wallet is a different thing.
  if (!wallet) return <RetryState />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
      <h1 className="t-headline">{WALLET.title}</h1>
      <p className="t-body mt-1 text-on-surface-variant">{WALLET.subtitle}</p>

      {/* BRD §10.5 is a hard product constraint, not a reassurance: Story-Tail is
          contractually prohibited from charging clients a fee, which is why no invoice
          entity and no charge endpoint exist anywhere in the schema. */}
      <Card className="mt-4 flex gap-3 border-0 bg-secondary-container p-4 text-on-secondary-container">
        <Icon name="shield" size={18} />
        <p className="t-body-s">
          <b>{WALLET.feeAssurance}</b> {WALLET.feeAssuranceBody}
        </p>
      </Card>

      {wallet.cards.length === 0 ? (
        <EmptyState icon="card" title={WALLET.emptyTitle} body={WALLET.emptyBody} />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {wallet.cards.map((card) => {
            const live = activeAuthorizationsFor(wallet, card.id);
            return (
              <li key={card.id}>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`t-label inline-flex h-6 w-10 shrink-0 items-center justify-center rounded text-[9px] font-extrabold text-white ${
                        card.brand.toLowerCase() === "visa"
                          ? "bg-[#1A1F71]"
                          : "bg-[#EB001B]"
                      }`}
                    >
                      {brandChip(card.brand)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-title-s font-mono">•••• {card.last4}</p>
                      <p className="t-body-s text-on-surface-variant">
                        {card.nickname ? `${card.nickname} · ` : ""}exp {cardExpiry(card)}
                      </p>
                    </div>
                    <span
                      className={`chip-status ${card.status === "active" ? "booked" : "past"}`}
                    >
                      {card.status === "active" ? WALLET.statusActive : WALLET.statusRevoked}
                    </span>
                  </div>

                  {card.status === "active" && live.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2 border-t border-outline-variant pt-3">
                      {live.map((auth) => (
                        <li key={auth.id} className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <p className="t-body-s truncate">{auth.tripTitle ?? WALLET.confirmedTrip}</p>
                            <p className="t-body-s text-on-surface-variant">
                              {remainingLabel(auth)} · {WALLET.expiresLabel.toLowerCase()}{" "}
                              {formatDate(auth.expiresAt, me.timeZone)}
                            </p>
                          </div>
                          <Link
                            href={`/wallet/authorizations/${auth.id}/remove`}
                            className="btn btn-outlined btn-sm tap-44 shrink-0"
                          >
                            {WALLET.removeAuthorization}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  {card.status !== "active" && card.revokedAt && (
                    <p className="t-body-s mt-3 border-t border-outline-variant pt-3 text-on-surface-variant">
                      {WALLET.statusRevoked} {formatDate(card.revokedAt, me.timeZone)}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/wallet/activity?card=${card.id}`}
                      className="btn btn-tonal btn-sm tap-44"
                    >
                      {WALLET.viewActivity}
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Deferred, shown, and explained — never hidden. */}
      {/* `card`, not `plus`: the artboards draw a plus, but `components/ui/icon-paths.ts`
          has no such glyph — the prototype's own icon set is wider than the one ported into
          the app. Adding a path here to match a disabled control would be the wrong order. */}
      <div className="mt-3 rounded-xl border border-dashed border-outline bg-surface-2 p-5 text-center opacity-60">
        <Icon name="card" size={22} />
        <p className="t-title-s mt-1">{WALLET.addCard}</p>
        <p className="t-body-s text-on-surface-variant">{WALLET.addCardDeferred}</p>
      </div>

      {wallet.events.length > 0 && (
        <Link href="/wallet/activity" className="btn btn-text btn-sm tap-44 mt-4 inline-flex">
          {WALLET.activityTitle}
          <Icon name="arrow_right" size={14} />
        </Link>
      )}

      {/* The total across every live authorization. Not in the artboard, and added because
          the question a traveler actually has on this screen is "how much can be charged to
          me right now", which no single row answers. */}
      {wallet.authorizations.some((a) => a.status === "active") && (
        <p className="t-body-s mt-4 text-on-surface-variant">
          {formatMoney({
            amountCents: wallet.authorizations
              .filter((a) => a.status === "active")
              .reduce((sum, a) => sum + Math.max(0, a.spendingLimitCents - a.amountUsedCents), 0),
            currency: "USD",
          })}{" "}
          authorized across your trips right now.
        </p>
      )}
    </div>
  );
}
