import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Inline busy indicator for buttons. Decorative — the button's label carries meaning, so the
 * whole thing is `aria-hidden` (CircularProgress alone would announce a progressbar).
 *
 * CircularProgress writes its `size` as an inline style, which no className could beat. So
 * the size lives on a wrapper span and the progress fills it: 16px by default (the legacy
 * `size-4`), `size={20}` for the larger submit buttons (the legacy `size-5`).
 * `color="inherit"` keeps the legacy currentColor behaviour inside a contained button.
 *
 * No "use client": Server Components render this inside submit buttons.
 */
export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <Box
      component="span"
      className={className}
      aria-hidden="true"
      sx={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}
    >
      <CircularProgress color="inherit" size="100%" />
    </Box>
  );
}
