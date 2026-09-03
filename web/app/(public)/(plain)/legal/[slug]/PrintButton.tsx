"use client";

import { Button } from "@/components/ui/Button";
import { LEGAL_PAGE } from "./content";

/**
 * "Print this page" (Screen Inventory 2.0.7 "printable view"; the design's "Printable view" /
 * "Download PDF" pair becomes this one action — there is no PDF pipeline). The only client
 * island on the legal pages: it exists to call window.print(). `.no-print` keeps it out of the
 * printout itself.
 */
export function PrintButton() {
  return (
    <Button variant="text" size="sm" className="no-print" onClick={() => window.print()}>
      {LEGAL_PAGE.print}
    </Button>
  );
}
