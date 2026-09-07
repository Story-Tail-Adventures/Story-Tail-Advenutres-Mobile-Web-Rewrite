import type { PriceBand } from "../../content/public/types";
/** Gyasi's rough $ / $$ / $$$ range chip (design: PriceRange / MPriceRange). */
export declare function PriceRange({ band, size, className }: {
    band: PriceBand;
    size?: "md" | "sm";
    className?: string;
}): import("react").JSX.Element;
