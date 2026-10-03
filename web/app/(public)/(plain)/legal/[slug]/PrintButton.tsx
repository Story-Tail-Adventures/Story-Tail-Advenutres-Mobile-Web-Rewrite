"use client";

import MuiButton from "@mui/material/Button";
import { LEGAL_PAGE } from "./content";
import { TAP_TARGET } from "@/lib/mui/sx";

/** The legacy .btn-sm box (32px, 16px sides) on MUI's small text button; 44px tall on touch screens. */
// 32px box like the legacy btn-sm; `tap-44` grew only the tap area on touch screens.
const PRINT = { minHeight: 32, px: 2, ...TAP_TARGET } as const;

/**
 * "Print this page" (Screen Inventory 2.0.7 "printable view"; the design's "Printable view" /
 * "Download PDF" pair becomes this one action — there is no PDF pipeline). The only client
 * island on the legal pages: it exists to call window.print(). `.no-print` keeps it out of the
 * printout itself.
 */
export function PrintButton() {
  return (
    <MuiButton
      variant="text"
      color="primary"
      size="small"
      className="no-print"
      sx={PRINT}
      onClick={() => window.print()}
    >
      {LEGAL_PAGE.print}
    </MuiButton>
  );
}
