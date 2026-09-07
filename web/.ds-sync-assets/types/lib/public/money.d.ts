import type { BudgetBand, Money } from "../../content/public/types";
/**
 * Money on the public surface is display-only, but it still follows CLAUDE.md rule 5:
 * integer cents plus a currency code, formatted at the edge.
 */
export declare function formatMoney(money: Money, opts?: {
    whole?: boolean;
}): string;
/** Budget-band thresholds are per person, in cents. */
export declare const BUDGET_BAND_MAX_CENTS: Record<Exclude<BudgetBand, "4k-plus">, number>;
export declare function bandFromCents(amountCents: number): BudgetBand;
export declare const BUDGET_BAND_LABELS: Record<BudgetBand, string>;
