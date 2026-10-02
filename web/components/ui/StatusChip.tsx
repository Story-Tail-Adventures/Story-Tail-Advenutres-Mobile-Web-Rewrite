import Chip from "@mui/material/Chip";

/**
 * The trip-status chip (Design-System §4.3) on MUI's Chip — the port of the design kit's
 * `MuiStaStatus` (design/source-prototype/shared/mui-kit.jsx).
 *
 * `kind` is the presentational variant `lib/trips/status.ts` derives (`booked`, `due`,
 * `past`, …); the colours are the theme's `status.<kind>.bg` / `.fg` pair, which switch
 * with the scheme. The box is the legacy `.chip-status` one: 22px tall, 9px sides, 10.5px
 * uppercase label, so a chip sits where it did in every header.
 *
 * Typed as `string` because the query views (`lib/trips/queries.ts`) carry the chip kind as
 * a plain string; an unknown kind resolves to no colour rather than throwing.
 *
 * No "use client": the trip pages that render this are Server Components.
 */
export function StatusChip({
  kind,
  label,
  className,
}: {
  kind: string;
  label: string;
  className?: string;
}) {
  return (
    <Chip
      size="small"
      label={label}
      className={className}
      sx={{
        bgcolor: `status.${kind}.bg`,
        color: `status.${kind}.fg`,
        fontWeight: 600,
        fontSize: 10.5,
        letterSpacing: "0.3px",
        textTransform: "uppercase",
        height: 22,
        "& .MuiChip-label": { px: 1.125 },
      }}
    />
  );
}
