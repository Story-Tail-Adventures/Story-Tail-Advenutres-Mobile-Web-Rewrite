import Box from "@mui/material/Box";
import type { PriceBand } from "@/content/public/types";

const LABEL: Record<PriceBand, string> = {
  $: "budget-friendly",
  $$: "mid-range",
  $$$: "premium",
};

/**
 * Gyasi's rough $ / $$ / $$$ range chip (design: PriceRange / MPriceRange). It sits on a
 * photograph, so its colours are the on-photo set from styles/public.css (`--tag-dark-bg`
 * is navy at 85%, scheme-independent) rather than a palette role that would flip in dark.
 */
export function PriceRange({ band, size = "md", className }: { band: PriceBand; size?: "md" | "sm"; className?: string }) {
  const filled = band.length;
  const small = size === "sm";
  return (
    <Box
      component="span"
      className={className}
      role="img"
      aria-label={`Price range: ${LABEL[band]}`}
      sx={{
        display: "inline-flex",
        gap: "1px",
        px: small ? 0.875 : 1,
        py: small ? 0.25 : 0.375,
        borderRadius: 1,
        bgcolor: "var(--tag-dark-bg)",
        color: "common.white",
        fontFamily: "mono",
        fontWeight: 700,
        fontSize: small ? 9 : 10,
        lineHeight: 1,
        letterSpacing: 0.5,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Box component="span" key={i} aria-hidden="true" sx={i < filled ? undefined : { opacity: 0.3 }}>
          $
        </Box>
      ))}
    </Box>
  );
}
