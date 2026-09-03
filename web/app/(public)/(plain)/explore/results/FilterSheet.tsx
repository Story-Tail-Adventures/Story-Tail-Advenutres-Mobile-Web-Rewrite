"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

interface FilterSheetProps {
  /** Trigger chip text ("Filters" / "Filters · 2"). */
  label: string;
  /** Dialog heading. */
  title: string;
  closeLabel: string;
  /** The FilterRail form, rendered on the server and passed through. */
  children: ReactNode;
}

/** The mobile sticky bar's "Filter" link points here; with JS it opens the sheet, without it scrolls. */
export const FILTER_SHEET_ANCHOR = "filters";
const HASH = `#${FILTER_SHEET_ANCHOR}`;

/**
 * Below `web` the filter form lives in a native `<dialog>` (Screen Inventory §4.4 Pattern F:
 * filter drawer on tablet/mobile). `showModal()` gives the focus trap, Escape and the backdrop
 * for free; focus returns to the trigger on close. The only client code on 2.0.4.
 */
export function FilterSheet({ label, title, closeLabel, children }: FilterSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const titleId = useId();

  const show = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };
  const hide = () => dialogRef.current?.close();

  // Deep link: StickyCta's "Filter" is a plain `#filters` anchor, so without JS it scrolls to
  // this chip. With JS, a click on any such anchor opens the sheet in place instead (also
  // covers a second tap while the hash is already `#filters`, which fires no hashchange), and
  // arriving on the page with the hash set opens it straight away.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === HASH) show();
    };
    const openFromAnchor = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(`a[href="${HASH}"]`) : null;
      if (!target || event.defaultPrevented) return;
      event.preventDefault();
      show();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", openFromAnchor);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", openFromAnchor);
    };
  }, []);

  const handleClose = () => {
    if (window.location.hash === HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    triggerRef.current?.focus();
  };

  return (
    <div id={FILTER_SHEET_ANCHOR} className="shrink-0 scroll-mt-20">
      <button
        ref={triggerRef}
        type="button"
        className="chip chip-filter tap-44 h-8 px-3 text-on-surface"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={show}
      >
        <Icon name="filter" size={12} />
        {label}
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={titleId}
        onClose={handleClose}
        onClick={(event) => {
          // Only a click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) hide();
        }}
        className="m-0 mt-auto max-h-dvh w-full max-w-none flex-col rounded-t-xl border-0 bg-surface-1 p-0 text-on-surface shadow-3 backdrop:bg-black/50 open:flex md:m-auto md:w-100 md:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <h2 id={titleId} className="t-title-s text-on-surface">
            {title}
          </h2>
          <button type="button" className="btn-icon tap-44 size-8" aria-label={closeLabel} onClick={hide}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {/* The form's submit bubbles here; close the sheet as the results navigate. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4" onSubmit={hide}>
          {children}
        </div>
      </dialog>
    </div>
  );
}
