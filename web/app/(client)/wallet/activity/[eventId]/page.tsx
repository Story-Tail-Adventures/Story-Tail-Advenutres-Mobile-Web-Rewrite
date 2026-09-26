import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RetryState } from "@/components/client/RetryState";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { cardLabel, formatAmount, formatDate } from "@/lib/wallet/format";
import { cardFor, eventFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.useDetailTitle };

/**
 * Screen 2.4.6 Card Use Detail — docs/Screen-Inventory.md §2.4.6, §4.4 (Pattern **C**), and
 * design/source-prototype/screens/client-payment.jsx (C246_CardUseDetail) +
 * client-payment-mobile.jsx (M246_UseDetail). P1.
 *
 * THE SENTENCE THAT MATTERS ON THIS SCREEN is "the supplier charged your card directly.
 * Story-Tail never handled the money." Story-Tail is not the merchant of record — it is
 * contractually prohibited from being one for its own services (BRD §10.5) — and a detail
 * screen that reads like a receipt from Story-Tail describes a relationship the business
 * does not have. The success card says who took the money, not that a payment succeeded.
 *
 * **"FLAG AS UNFAMILIAR" IS DISABLED**, and the blocker is a contradiction in the Data Model
 * rather than missing code. §9.4 says `card_use_event` is "Append-only: no UPDATE, no
 * DELETE", and in the same table defines `client_flag_status` with three values —
 * `not_flagged`, `flagged`, `resolved` — that only a sequence of UPDATEs can produce. The
 * DDL comment and the `rls-policy` skill both repeat the append-only rule. Either a separate
 * append-only `card_use_flag` table or an explicit narrowing of the claim; that is a ruling,
 * not a screen decision, and it is recorded at Data-Model §9.4.
 *
 * **THE RECEIPT IS ABSENT BY AN EXISTING DECISION**, not an omission.
 * `card_use_event.receipt_document_id` FKs into `document`, but `document_self_select`'s kind
 * allowlist excludes `receipt` on purpose (20260907031255): a supplier receipt shows what the
 * agency actually paid, immediately after `cost_cents` and `total_commission_cents` were
 * withheld to prevent exactly that. Reversing it is a margin decision for the business.
 *
 * **THE AGENT'S NOTE IS ABSENT TOO.** The artboard shows "Note from Gyasi" — that is
 * `card_use_event.justification`, which Data-Model §9.4 classifies Internal and which the
 * wallet function therefore never selects. It is the reason the agent wrote for the audit
 * trail, not a line of prose composed for the traveler. "Ask Gyasi about this" goes to §2.6
 * instead, where a real answer can be given.
 */
export default async function CardUseDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [wallet, me] = await Promise.all([loadWallet(), currentPlatformUser()]);

  if (!wallet) return <RetryState />;

  const event = eventFor(wallet, eventId);
  // The wallet only ever contains this traveler's own rows, so "not in the wallet" already
  // means "not yours or not there" — one answer, the same convention every §2.x read uses.
  if (!event) notFound();

  const card = cardFor(wallet, event.cardId);
  const rows: { label: string; value: string; mono?: boolean }[] = [
    {
      label: WALLET.detailAmount,
      value: formatAmount(event.amountCents, event.currency),
      mono: true,
    },
    { label: WALLET.detailCard, value: card ? cardLabel(card) : "—" },
    { label: WALLET.detailSupplier, value: event.supplierName },
    { label: WALLET.detailTrip, value: event.tripTitle ?? "—" },
    { label: WALLET.detailWhen, value: formatDate(event.createdAt, me.timeZone) },
    ...(event.referenceNumber
      ? [{ label: WALLET.detailReference, value: event.referenceNumber, mono: true }]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-6 md:py-7">
      <Link href="/wallet/activity" className="btn btn-text btn-sm tap-44 -ml-1 mb-1 inline-flex">
        <Icon name="arrow_left" size={14} />
        {WALLET.activityTitle}
      </Link>

      <h1 className="t-headline font-mono">
        {formatAmount(event.amountCents, event.currency)}
      </h1>
      <p className="t-body mt-1 text-on-surface-variant">
        {event.supplierName} · {formatDate(event.createdAt, me.timeZone)}
      </p>

      <Card className="mt-4 border-0 bg-success-container p-4 text-success">
        <p className="t-title-s flex items-center gap-2">
          <Icon name="check" size={16} strokeWidth={2.5} />
          {WALLET.chargedBySupplier}
        </p>
        <p className="t-body-s mt-1 opacity-90">{WALLET.chargedBySupplierBody}</p>
      </Card>

      <Card className="mt-3 p-4">
        <dl>
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={`flex items-baseline justify-between gap-4 py-2 ${
                index === 0 ? "" : "border-t border-outline-variant"
              }`}
            >
              <dt className="t-body-s shrink-0 text-on-surface-variant">{row.label}</dt>
              <dd className={`t-body-s text-right ${row.mono ? "font-mono" : ""}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-4 flex flex-col gap-2">
        <div>
          <button
            type="button"
            className="btn btn-outlined btn-sm tap-44 w-full"
            disabled
            aria-disabled="true"
          >
            <Icon name="warning" size={13} /> {WALLET.flagUnfamiliar}
          </button>
          <p className="t-body-s mt-1 text-on-surface-variant">{WALLET.flagDeferred}</p>
        </div>

        {/* Goes to §2.6, which is built — the one action on this screen that is fully real. */}
        <Link href="/messages/new" className="btn btn-tonal btn-sm tap-44 w-full">
          <Icon name="message" size={13} /> {WALLET.askGyasi}
        </Link>
      </div>
    </div>
  );
}
