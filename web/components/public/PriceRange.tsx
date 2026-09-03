import type { PriceBand } from "@/content/public/types";
import { cn } from "@/lib/cn";

const LABEL: Record<PriceBand, string> = {
  $: "budget-friendly",
  $$: "mid-range",
  $$$: "premium",
};

/** Gyasi's rough $ / $$ / $$$ range chip (design: PriceRange / MPriceRange). */
export function PriceRange({ band, size = "md", className }: { band: PriceBand; size?: "md" | "sm"; className?: string }) {
  const filled = band.length;
  return (
    <span
      className={cn("t-price-range", size === "sm" && "t-price-range-sm", className)}
      role="img"
      aria-label={`Price range: ${LABEL[band]}`}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" className={i < filled ? undefined : "opacity-30"}>
          $
        </span>
      ))}
    </span>
  );
}
