"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { signDocument } from "@/lib/trips/actions";
import { documentBadge, formatFileSize, uploadedByLabel } from "@/lib/trips/documents";
import type { TripDocument } from "@/lib/trips/queries";

/**
 * One row of the 2.2.6 library, with the open action.
 *
 * A CLIENT COMPONENT ONLY FOR THE OPEN BUTTON. The list itself is server-rendered; this
 * wraps a single row because opening a document is a two-step the server cannot do alone:
 * ask for a signature, then hand the URL to the browser.
 *
 * WHY NOT AN `<a href>` WITH A PRE-SIGNED URL: see the note on `signDocument`. The short
 * version is that signing writes an audit row, so pre-signing the page would record five
 * accesses for a traveler who opened nothing, and the URLs would expire before most clicks.
 *
 * THE TAB IS CLAIMED SYNCHRONOUSLY, before the await. `window.open` on the far side of a
 * promise is the classic popup-blocker casualty: the user gesture has been spent by the time
 * the signature arrives, and the browser refuses. Opening `about:blank` while the click is
 * still on the stack gets a real handle, and the URL is assigned to it once the signature
 * lands. Confirmed necessary — the in-place fallback fired every time before this.
 *
 * Both failure paths are handled rather than left to strand a blank tab: a signing failure
 * closes it and shows the error inline, and a browser that refuses even the synchronous open
 * falls back to navigating in place, which always works.
 */
export function DocumentRow({ document: doc, first }: { document: TripDocument; first: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = documentBadge(doc.mimeType);

  function open() {
    setError(null);
    // Claimed now, while the gesture is still live. `noopener` keeps the new tab from
    // holding a reference back into the app.
    const tab = window.open("", "_blank", "noopener,noreferrer");

    startTransition(async () => {
      const result = await signDocument(doc.id);

      if (!result.ok) {
        tab?.close();
        setError(result.message);
        return;
      }

      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    });
  }

  return (
    // The divider belongs to the mobile card, where rows share one edge. From `md` up each
    // row is its own card in the Pattern B grid and the line would draw inside it.
    <div className={first ? "" : "border-t border-outline-variant md:border-t-0"}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          aria-hidden="true"
          className={`t-label inline-flex h-[46px] w-[38px] shrink-0 items-center justify-center rounded text-[9px] font-extrabold text-white ${
            badge === "PDF" ? "bg-brand-burgundy" : "bg-brand-orange"
          }`}
        >
          {badge}
        </span>

        <div className="min-w-0 flex-1">
          <p className="t-title-s truncate text-[13px]">{doc.filename}</p>
          <p className="t-body-s mt-0.5 text-on-surface-variant">
            {[formatFileSize(doc.sizeBytes), uploadedByLabel(doc.mine)].join(" · ")}
          </p>
        </div>

        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="btn btn-outlined btn-sm tap-44 shrink-0"
          aria-label={`Open ${doc.filename}`}
        >
          {pending ? <Icon name="clock" size={13} /> : <Icon name="external" size={13} />}
          <span className="hidden md:inline">Open</span>
        </button>
      </div>

      {error && (
        <p role="status" className="t-body-s px-3.5 pb-3 text-error">
          {error}
        </p>
      )}
    </div>
  );
}
