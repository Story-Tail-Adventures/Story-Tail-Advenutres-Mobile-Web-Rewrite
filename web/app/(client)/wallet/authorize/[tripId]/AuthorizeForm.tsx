"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/public/money";
import type { AuthorizeState } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";
import { cardExpiry, cardLabel } from "@/lib/wallet/format";
import type { WalletCard } from "@/lib/wallet/queries";

const IDLE: AuthorizeState = { status: "idle" };

/**
 * Screen 2.4.3's form.
 *
 * THE LIMIT IS HELD IN CENTS AND SHOWN IN DOLLARS, and the conversion happens here rather
 * than in the action, because this is the only place the traveler can see the number it
 * produced. A dollars-to-cents conversion buried server-side is how a limit ends up a
 * hundredfold out with nobody able to point at where — and the Edge Function's $250,000
 * ceiling exists precisely because that mistake is easy to make.
 *
 * THE CONSENT BOX GATES THE SUBMIT BUTTON *AND* IS RE-CHECKED SERVER-SIDE. Disabling the
 * button is a courtesy; the server check is what makes `card_authorization.consent_payload`
 * mean anything, because a mandate recorded for somebody who never ticked the box is worse
 * than no record at all.
 *
 * The action is bound to its trip by the server component — the same action-as-prop shape
 * §2.5's ProfileForm and §2.6's Composer use. A server action is serialisable; a plain
 * function passed the same way typechecks, passes unit tests, and throws in a browser.
 */
export function AuthorizeForm({
  action,
  cards,
  presets,
  defaultExpiryIso,
  defaultExpiryLabel,
}: {
  action: (previous: AuthorizeState, formData: FormData) => Promise<AuthorizeState>;
  cards: WalletCard[];
  presets: { label: string; cents: number }[];
  defaultExpiryIso: string;
  defaultExpiryLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, IDLE);
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [cents, setCents] = useState(presets[1]?.cents ?? presets[0]?.cents ?? 0);
  const [consented, setConsented] = useState(false);

  const custom = !presets.some((preset) => preset.cents === cents);

  return (
    <form action={submit} className="mt-4">
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="spendingLimitCents" value={cents} />
      <input type="hidden" name="expiresAt" value={defaultExpiryIso} />

      <h2 className="t-title-s">{WALLET.authorizeCardHeading}</h2>
      <div className="mt-2 flex flex-col gap-2">
        {cards.map((card) => {
          const selected = card.id === cardId;
          return (
            <label
              key={card.id}
              className={`tap-44 flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                selected
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline-variant bg-surface"
              }`}
            >
              <input
                type="radio"
                name="cardChoice"
                checked={selected}
                onChange={() => setCardId(card.id)}
                className="h-4 w-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="t-title-s block font-mono">{cardLabel(card)}</span>
                <span className="t-body-s block opacity-80">
                  {card.nickname ? `${card.nickname} · ` : ""}exp {cardExpiry(card)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {/* 2.4.2 is deferred, so there is no "Add new card" branch — it would dead-end. */}
      <p className="t-body-s mt-2 text-on-surface-variant">{WALLET.authorizeNoNewCard}</p>

      <h2 className="t-title-s mt-5">{WALLET.limitHeading}</h2>
      <p className="t-body-s text-on-surface-variant">{WALLET.limitBody}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {presets.map((preset) => {
          const selected = !custom && preset.cents === cents;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => setCents(preset.cents)}
              className={`tap-44 rounded-xl border p-3 text-left ${
                selected
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline-variant bg-surface"
              }`}
            >
              <span className="t-label block">{preset.label}</span>
              <span className="t-title-s mt-1 block">
                {formatMoney({ amountCents: preset.cents, currency: "USD" })}
              </span>
            </button>
          );
        })}
      </div>

      <label htmlFor="custom-limit" className="field-label mt-3 block">
        {WALLET.limitCustom}
      </label>
      <div className="flex items-center gap-2">
        <span className="t-body text-on-surface-variant">$</span>
        <input
          id="custom-limit"
          type="number"
          min={1}
          step="0.01"
          value={(cents / 100).toFixed(2)}
          onChange={(event) => {
            // Round at the boundary, not in the action: `Math.round` here means the value in
            // the box and the value posted are the same number, and the server's
            // safe-integer check can never be the first place a traveler hears about it.
            const dollars = Number(event.target.value);
            setCents(Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0);
          }}
          className="t-body h-11 w-40 rounded-xl border border-outline-variant bg-bg px-3 text-on-surface"
        />
      </div>

      <p className="t-body-s mt-3 text-on-surface-variant">
        {WALLET.expiresLabel}: {defaultExpiryLabel}. {WALLET.expiresHint}
      </p>

      <label className="tap-44 mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3">
        <input
          type="checkbox"
          name="consent"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="t-body-s">{WALLET.consentMandate}</span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="t-body-s mt-2 text-error">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !consented || cents <= 0 || !cardId}
        className="btn btn-filled tap-44 mt-4 h-11 w-full"
      >
        <Icon name={pending ? "clock" : "check"} size={14} />
        {WALLET.authorizeCta} {formatMoney({ amountCents: cents, currency: "USD" })}
      </button>
    </form>
  );
}
