import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Inline busy indicator for buttons. Decorative — the button's label carries meaning, so the
 * whole thing is `aria-hidden` (CircularProgress alone would announce a progressbar).
 *
 * CircularProgress writes its `size` as an inline style, which no className could beat. So
 * the size lives on a wrapper span (16px, the legacy `size-4`) and the progress fills it;
 * callers that pass `size-5` get 20px exactly as before. `color="inherit"` keeps the legacy
 * currentColor behaviour inside a contained button.
 *
 * No "use client": Server Components render this inside submit buttons.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Box
      component="span"
      className={className}
      aria-hidden="true"
      sx={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0 }}
    >
      <CircularProgress color="inherit" size="100%" />
    </Box>
  );
}
