import { callTripFunction } from "@/lib/trips/api";

/**
 * Screen Inventory §2.4's reads.
 *
 * THE ONLY §2.x READ THAT DOES NOT GO THROUGH POSTGREST, and the reason is worth stating
 * once here rather than being rediscovered at each screen.
 *
 * `payment_card`, `card_authorization` and `card_use_event` hold no client-role privilege at
 * all — `20260917090000_payment_domain_lockdown.sql` revoked it and deliberately added no
 * policy. A browser `.select()` against them does not return an empty list; it raises 42501.
 * That is the intended state: `payment_card.stripe_payment_method_id` and
 * `.stripe_customer_id` are server-only (Data-Model §21.2, CLAUDE.md rule 4), a row policy
 * cannot withhold a column, and the `rls-policy` skill already classified these tables
 * service-role-only.
 *
 * So the wallet comes from the `payment-wallet` Edge Function, which projects a hand-written
 * column list on the service role. Neither Stripe column is in that projection — not dropped
 * afterwards, never selected.
 */

export type WalletCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  nickname: string | null;
  status: "active" | "revoked" | "expired" | "failed";
  consentRecordedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};

export type WalletAuthorization = {
  id: string;
  cardId: string;
  tripId: string;
  /** Null when the trip is unreadable, which the function answers rather than disclosing. */
  tripTitle: string | null;
  spendingLimitCents: number;
  amountUsedCents: number;
  expiresAt: string;
  status: "active" | "revoked" | "expired" | "exhausted";
  revokedAt: string | null;
  createdAt: string;
};

export type WalletUseEvent = {
  id: string;
  authorizationId: string;
  cardId: string;
  tripId: string;
  tripTitle: string | null;
  /**
   * `supplier_name_snapshot`, never a join. A supplier renamed later must not rewrite a
   * traveler's history, and a portal booking names a merchant with no `supplier` row at all.
   */
  supplierName: string;
  amountCents: number;
  currency: string;
  referenceNumber: string | null;
  createdAt: string;
};

export type Wallet = {
  cards: WalletCard[];
  authorizations: WalletAuthorization[];
  events: WalletUseEvent[];
};

/**
 * Everything §2.4 renders, in one call.
 *
 * ONE ROUND TRIP RATHER THAN THREE, because every screen in this section needs at least two
 * of the three lists: 2.4.1 shows a card and what it is authorized for, 2.4.5 shows an event
 * and which card took it, 2.4.7 shows an authorization and how much of it is left. Splitting
 * them would mean each screen assembling the same join from separate responses.
 *
 * Returns null on failure so callers can render §5's error state. An empty wallet is
 * `{cards: [], …}`, which is a different thing and gets the empty state — the distinction
 * §2.2 established and §2.6 repeated.
 */
export async function loadWallet(
  filter: { tripId?: string; cardId?: string } = {},
): Promise<Wallet | null> {
  const query: Record<string, string> = {};
  if (filter.tripId) query.tripId = filter.tripId;
  if (filter.cardId) query.cardId = filter.cardId;

  const result = await callTripFunction("payment-wallet", { method: "GET", query });

  if (!result.ok) {
    // `unavailable` covers local dev with auth checks off, where there is no session to
    // forward. Logged without a body: nothing here is a secret, but the habit is the point.
    console.warn("[wallet] read failed", { kind: result.kind });
    return null;
  }

  const data = result.data as Partial<Wallet>;
  return {
    cards: data.cards ?? [],
    authorizations: data.authorizations ?? [],
    events: data.events ?? [],
  };
}

/** The card a row hangs off, for the screens that show "VISA •••• 4242" beside an event. */
export function cardFor(wallet: Wallet, cardId: string): WalletCard | null {
  return wallet.cards.find((card) => card.id === cardId) ?? null;
}

export function authorizationFor(wallet: Wallet, id: string): WalletAuthorization | null {
  return wallet.authorizations.find((auth) => auth.id === id) ?? null;
}

export function eventFor(wallet: Wallet, id: string): WalletUseEvent | null {
  return wallet.events.find((event) => event.id === id) ?? null;
}

/**
 * The live authorizations for one card, which is what 2.4.1 summarises under each row.
 *
 * `active` only. A revoked or expired authorization is history and belongs on the activity
 * screen; showing it here would read as "this card is still authorized for four trips" when
 * three of them ended.
 */
export function activeAuthorizationsFor(wallet: Wallet, cardId: string): WalletAuthorization[] {
  return wallet.authorizations.filter(
    (auth) => auth.cardId === cardId && auth.status === "active",
  );
}
