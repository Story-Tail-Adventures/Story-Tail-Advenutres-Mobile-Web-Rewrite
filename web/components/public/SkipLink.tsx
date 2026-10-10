import MuiButton from "@mui/material/Button";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Visually hidden until focused — the sr-only / focus:not-sr-only pair, written out in sx.
 * `1px` strings, not `1`: MUI's sizing props read a bare `1` as 100%.
 */
const SKIP_LINK = {
  ...VISUALLY_HIDDEN,
  "&:focus": {
    top: 8,
    left: 8,
    zIndex: 50,
    width: "auto",
    height: "auto",
    minHeight: 32,
    px: 2,
    m: 0,
    overflow: "visible",
    clip: "auto",
  },
} as const;

/** First focusable element on every public page; visible only while focused. */
export function SkipLink() {
  return (
    <MuiButton component="a" href="#main" variant="contained" size="small" sx={SKIP_LINK}>
      Skip to content
    </MuiButton>
  );
}
