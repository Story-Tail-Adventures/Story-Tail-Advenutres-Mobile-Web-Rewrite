import { formatMoney } from "@/lib/public/money";
import type { WalletAuthorization, WalletCard } from "@/lib/wallet/queries";

/**
 * §2.4's presentation helpers, extracted so the six screens cannot disagree about how a card
 * or a limit reads — and so the arithmetic below is testable away from a React tree.
 *
 * `formatMoney` is REUSED from `lib/public/money.ts` rather than reimplemented. A second
 * money formatter is exactly the shape of the loyalty-reader bug §2.5 shipped twice: one
 * copy per stack, then one copy per section, each subtly different. There is one, it is
 * tested, and it throws on a negative or fractional input rather than rounding silently.
 */

/**
 * A card-use amount, in whatever currency the supplier charged.
 *
 * `formatMoney` takes `Currency`, which is the literal `"USD"` — the whole app is USD-only
 * and every price in `content/public` says so. But `card_use_event.currency` is `char(3)`
 * with a default, not a constrained enum, and a supplier charging in another currency is a
 * thing that happens to travel bookings. Casting to `"USD"` to satisfy the type would print
 * a dollar sign on a euro charge, which is worse than either alternative.
 *
 * So: the shared formatter for the case it was built for, and `Intl` directly for the case
 * it was not. Unknown or malformed codes fall back to the bare amount plus the code rather
 * than throwing — `Intl.NumberFormat` raises RangeError on a non-ISO code, and one bad row
 * should not take the activity screen down.
 */
export function formatAmount(amountCents: number, currency: string): string {
  if (currency === "USD") return formatMoney({ amountCents, currency: "USD" });
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amountCents / 100,
    );
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * The two-to-four characters that fit on a brand plate.
 *
 * `payment_card.brand` holds Stripe's lowercase token — `visa`, `mastercard`, `amex`,
 * `discover`, `diners`, `jcb`, `unionpay`. A naive `slice(0, 4)` renders "mastercard" as
 * **MAST**, which is what the first version of 2.4.1 shipped to the browser and what the
 * screenshot caught. The artboards use the marks people recognise, so this maps them.
 *
 * An unknown brand falls back to four characters rather than throwing: Stripe adds tokens,
 * and a card whose plate reads oddly is better than a wallet that will not render.
 */
const BRAND_CHIPS: Record<string, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
  diners: "DINE",
  jcb: "JCB",
  unionpay: "UP",
};

/**
 * The brand as a word in a sentence — "Your Visa is ready", not "Your visa is ready".
 *
 * `payment_card.brand` is Stripe's lowercase token, and dropping it straight into prose
 * reads as a typo. 2.4.4 shipped that to a browser once. `MC` and `AMEX` stay uppercase
 * because they are initialisms; the rest are title-cased.
 */
const BRAND_WORDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

export function brandName(brand: string): string {
  const key = brand.toLowerCase();
  return BRAND_WORDS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function brandChip(brand: string): string {
  return BRAND_CHIPS[brand.toLowerCase()] ?? brand.slice(0, 4).toUpperCase();
}

/** "VISA •••• 4242". Uppercased because `payment_card.brand` is Stripe's lowercase token. */
export function cardLabel(card: Pick<WalletCard, "brand" | "last4">): string {
  return `${card.brand.toUpperCase()} •••• ${card.last4}`;
}

/** "11/29" — the two-digit month and year a card face shows. */
export function cardExpiry(card: Pick<WalletCard, "expMonth" | "expYear">): string {
  const month = String(card.expMonth).padStart(2, "0");
  return `${month}/${String(card.expYear).slice(-2)}`;
}

/**
 * What is left on an authorization.
 *
 * CLAMPED AT ZERO, and not because the database would allow otherwise by accident: a
 * supplier charge that lands after the limit was lowered, or a final charge that rounds
 * past it, would make `amount_used_cents` exceed the limit and this would render a negative
 * remaining balance — which reads as though Story-Tail owes the traveler money. The honest
 * answer at that point is "nothing left", and the exhausted status carries the rest.
 */
export function remainingCents(auth: Pick<WalletAuthorization, "spendingLimitCents" | "amountUsedCents">): number {
  return Math.max(0, auth.spendingLimitCents - auth.amountUsedCents);
}

/** "$1,155 of $9,000 left" — the line 2.4.1 and 2.4.7 both show under a live authorization. */
export function remainingLabel(auth: Pick<WalletAuthorization, "spendingLimitCents" | "amountUsedCents">): string {
  const left = formatMoney({ amountCents: remainingCents(auth), currency: "USD" });
  const limit = formatMoney({ amountCents: auth.spendingLimitCents, currency: "USD" });
  return `${left} of ${limit} left`;
}

/**
 * The four spending-limit presets 2.4.3 offers, derived from the balance due.
 *
 * WHOLE CENTS, ALWAYS. A percentage of a cents value is fractional more often than not —
 * 10% of $7,845.00 is 784_500 cents exactly, but 10% of $7,844.45 is not — and a fractional
 * cent reaching the Edge Function is a 400, because `spendingLimitCents` must be a safe
 * integer. Rounding UP rather than to nearest: a limit that lands a cent under the supplier's
 * charge fails the payment for the sake of a rounding rule nobody would defend.
 *
 * MULTIPLY BEFORE DIVIDING, and never by a decimal. `784500 * 1.1` is 862950.0000000001 in
 * IEEE 754, so `Math.ceil` of it is 862951 — a cent more than ten percent, on a number the
 * traveler is agreeing to. `784500 * 11` is exact (integers are exact to 2^53) and `/ 10`
 * lands on 862950. The test caught this; the first implementation used `* 1.1`.
 */
export function limitPresets(balanceDueCents: number): { label: string; cents: number }[] {
  const exact = Math.max(0, Math.round(balanceDueCents));
  return [
    { label: "Exact", cents: exact },
    { label: "+10%", cents: Math.ceil((exact * 11) / 10) },
    { label: "+20%", cents: Math.ceil((exact * 12) / 10) },
  ];
}

/**
 * Seven days after the trip ends, per Screen Inventory §2.4.3's stated default.
 *
 * WHY THE PADDING EXISTS: suppliers settle late. A resort that charges the final balance on
 * the checkout date would find the authorization already expired if it ended with the trip,
 * and the traveler would get a failed payment for a trip they have already taken.
 *
 * Falls back to 90 days from today when the trip has no end date — an inquiry or a proposal
 * can be authorized before the dates are fixed, and refusing to compute a default would
 * block the screen rather than the write.
 */
export function defaultExpiry(tripEndDate: string | null, now: Date = new Date()): Date {
  const base = tripEndDate ? new Date(`${tripEndDate}T12:00:00Z`) : null;
  if (base && !Number.isNaN(base.getTime())) {
    return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
}

/** "Nov 29, 2026", in the traveler's own zone. Same reasoning as `lib/trips/thread.ts`. */
export function formatDate(iso: string, timeZone = "UTC"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
}
