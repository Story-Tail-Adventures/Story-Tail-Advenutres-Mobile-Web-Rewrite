"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET, UP_MD } from "@/lib/mui/sx";
import { FILTER_SHEET_ANCHOR } from "./sx";

interface FilterSheetProps {
  /** Trigger chip text ("Filters" / "Filters · 2"). */
  label: string;
  /** Dialog heading. */
  title: string;
  closeLabel: string;
  /** The FilterRail form, rendered on the server and passed through. */
  children: ReactNode;
}

/**
 * The mobile sticky bar's "Filter" link points here; with JS it opens the sheet, without it
 * scrolls. The value is defined in ./sx.ts and only re-exported here — a Server Component
 * importing a string from THIS file would get a client reference, not the string (see sx.ts).
 */
export { FILTER_SHEET_ANCHOR };
const HASH = `#${FILTER_SHEET_ANCHOR}`;

/**
 * Below `web` the filter form lives in an MUI Dialog (Screen Inventory §4.4 Pattern F: filter
 * drawer on tablet/mobile) — a bottom sheet on a phone, a 400px centred dialog from md, as
 * the native `<dialog>` it replaced was laid out. The Modal brings the focus trap, Escape,
 * the backdrop, and focus back to whatever opened it on close.
 *
 * `keepMounted` keeps the sheet's copy of the form in the DOM while closed, as the native
 * `<dialog>` was, so `aria-controls` always points at an element that exists. The Dialog
 * renders in a portal on document.body, so tests query it with `screen`, not `container`.
 */
export function FilterSheet({ label, title, closeLabel, children }: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const titleId = useId();

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  // Deep link: StickyCta's "Filter" is a plain `#filters` anchor, so without JS it scrolls to
  // this chip. With JS, a click on any such anchor opens the sheet in place instead (also
  // covers a second tap while the hash is already `#filters`, which fires no hashchange), and
  // arriving on the page with the hash set opens it straight away.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === HASH) setOpen(true);
    };
    const openFromAnchor = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(`a[href="${HASH}"]`) : null;
      if (!target || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(true);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", openFromAnchor);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", openFromAnchor);
    };
  }, []);

  // Escape, the backdrop and the close button all land here. Focus return is the Modal's.
  const handleClose = () => {
    hide();
    if (window.location.hash === HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  return (
    <Box id={FILTER_SHEET_ANCHOR} sx={{ flexShrink: 0, scrollMarginTop: "calc(var(--public-topbar-h) + 16px)" }}>
      <Chip
        component="button"
        clickable
        variant="outlined"
        icon={<Icon name="filter" size={12} />}
        label={label}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={open}
        onClick={show}
        sx={TAP_TARGET}
      />

      <Dialog
        open={open}
        onClose={handleClose}
        keepMounted
        maxWidth={false}
        aria-labelledby={titleId}
        // A bottom sheet on a phone: the container pins the paper to the bottom edge below md.
        sx={{ "& .MuiDialog-container": { alignItems: { xs: "flex-end", md: "center" } } }}
        slotProps={{
          paper: {
            id: dialogId,
            sx: {
              m: 0,
              width: "100%",
              // Edge to edge on a phone. Dialog's `maxWidth={false}` variant caps the paper
              // at calc(100% - 64px), which left a 32px gutter either side of the sheet.
              maxWidth: "100%",
              maxHeight: "100dvh",
              borderRadius: "var(--mui-shape-borderRadius) var(--mui-shape-borderRadius) 0 0",
              [UP_MD]: {
                m: 4,
                width: 400,
                maxWidth: "calc(100% - 64px)",
                maxHeight: "calc(100% - 64px)",
                borderRadius: 1,
              },
            },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: 1,
            borderColor: "divider",
            px: 2,
            py: 1.5,
          }}
        >
          <Typography id={titleId} component="h2" variant="subtitle1">
            {title}
          </Typography>
          <IconButton size="small" aria-label={closeLabel} onClick={handleClose} sx={{ ...TAP_TARGET, width: 32, height: 32 }}>
            <Icon name="close" size={16} />
          </IconButton>
        </Box>
        {/* The form's submit bubbles here; close the sheet as the results navigate. */}
        <DialogContent onSubmit={hide} sx={{ p: 2 }}>
          {children}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
