import type { BudgetBand, Money } from "@/content/public/types";

/**
 * Money on the public surface is display-only, but it still follows CLAUDE.md rule 5:
 * integer cents plus a currency code, formatted at the edge.
 */
export function formatMoney(money: Money, opts: { whole?: boolean } = {}): string {
  if (!Number.isInteger(money.amountCents) || money.amountCents < 0) {
    throw new Error(`formatMoney: amountCents must be a non-negative integer, got ${money.amountCents}`);
  }
  const hasCents = money.amountCents % 100 !== 0;
  const digits = opts.whole || !hasCents ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(money.amountCents / 100);
}

/** Budget-band thresholds are per person, in cents. */
export const BUDGET_BAND_MAX_CENTS: Record<Exclude<BudgetBand, "4k-plus">, number> = {
  "under-2k": 200_000,
  "2k-4k": 400_000,
};

export function bandFromCents(amountCents: number): BudgetBand {
  if (amountCents < BUDGET_BAND_MAX_CENTS["under-2k"]) return "under-2k";
  if (amountCents < BUDGET_BAND_MAX_CENTS["2k-4k"]) return "2k-4k";
  return "4k-plus";
}

export const BUDGET_BAND_LABELS: Record<BudgetBand, string> = {
  "under-2k": "Under $2k pp",
  "2k-4k": "$2–4k pp",
  "4k-plus": "$4k+ pp",
};
