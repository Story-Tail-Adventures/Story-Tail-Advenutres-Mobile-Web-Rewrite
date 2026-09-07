import { formatMoney } from "@/lib/public/money";
import type { Currency, Money } from "@/content/public/types";

/**
 * Formatting money that came out of Postgres.
 *
 * `formatMoney` in lib/public/money.ts is the formatter and this does not duplicate it —
 * this only handles the type boundary. The public `Money.currency` is narrowed to the
 * `Currency` union the catalog actually uses, while `trip.currency` and
 * `payment_milestone.currency` are `char(3)` and could hold anything an agent typed.
 *
 * So the code is CHECKED rather than cast. An unrecognised one falls back to USD and says
 * so in the console: a trip priced in an unknown currency is a data problem for Gyasi to
 * fix, and rendering "NaN" or throwing inside a server component is a worse way to find out
 * than a number that is briefly the wrong symbol.
 */

const KNOWN: readonly string[] = ["USD"] satisfies readonly Currency[];

export function formatTripMoney(amountCents: number, currency: string, opts?: { whole?: boolean }): string {
  const money: Money = {
    amountCents,
    currency: (KNOWN.includes(currency) ? currency : "USD") as Currency,
  };
  if (!KNOWN.includes(currency)) {
    console.warn(`[trips] unrecognised currency ${currency}; formatting as USD`);
  }
  return formatMoney(money, opts);
}
