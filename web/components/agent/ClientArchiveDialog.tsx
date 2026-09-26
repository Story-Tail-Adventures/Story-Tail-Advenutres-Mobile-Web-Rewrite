"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setClientArchivedAction } from "@/app/(agent)/agent/clients/actions";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * Screen 3.3.12 — Archive, and its other half.
 *
 * §4.4 Pattern J, built on the native `<dialog>` with `showModal()` — the same one-off
 * `FilterSheet` uses, and the only modal primitive this codebase has. The browser gives
 * focus trapping, Escape-to-dismiss and inert background for free; a hand-rolled overlay
 * gives none of them and has to be told about all three.
 *
 * RESTORE IS NOT DRAWN ANYWHERE IN THE PROTOTYPE. `A3312_Archive` is the archive
 * confirmation only, and the sole hint that the other direction exists is the roster's
 * "Archived" filter chip. It is the same dialog with the eyebrow, the body and the verb
 * flipped, and no reason field — a restore has nothing to explain, where an archive is a
 * decision somebody may need to account for later.
 *
 * THE REASON IS STORED IN THE AUDIT ROW, not on the client. `client` has no column for it.
 * That is where "why was this record archived" belongs anyway, and without a home there the
 * sentence the advisor just typed would be discarded the moment the dialog closed.
 *
 * NOT `btn-danger`. The prototype uses a tonal button and it is right: archiving is
 * reversible, keeps every trip and every audit row, and the dialog says so. Red is for
 * things that do not come back.
 */
export function ClientArchiveDialog({
  clientId,
  displayName,
  version,
  archived,
}: {
  clientId: string;
  displayName: string;
  version: number;
  archived: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const restoring = archived;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setClientArchivedAction({
        clientId,
        expectedVersion: version,
        archived: !archived,
        reason: restoring ? undefined : reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      ref.current?.close();
      // `revalidatePath` refreshes the server data; this repaints the page that is already
      // on screen so the header's own state follows the write without a reload.
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outlined btn-sm"
        onClick={() => {
          setError(null);
          setReason("");
          ref.current?.showModal();
        }}
      >
        {restoring ? CLIENT_COPY.restoreTitle : CLIENT_COPY.archiveTitle}
        <span className="sr-only"> {displayName}</span>
      </button>

      <dialog
        ref={ref}
        className="card m-auto w-[min(520px,calc(100vw-2rem))] p-5 backdrop:bg-black/45"
        aria-label={restoring ? CLIENT_COPY.restoreTitle : CLIENT_COPY.archiveTitle}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-warning-container)] text-[var(--md-on-surface)]">
            <Icon name={restoring ? "check" : "inbox"} size={18} />
          </span>
          <div className="min-w-0">
            <span className="t-label-s block text-[var(--md-warning)]">
              {restoring ? CLIENT_COPY.restoreEyebrow : CLIENT_COPY.archiveEyebrow}
            </span>
            <h2 className="t-title-l m-0">
              {restoring ? CLIENT_COPY.restoreTitle : CLIENT_COPY.archiveTitle} {displayName}?
            </h2>
          </div>
        </div>

        <p className="t-body mt-2 text-[var(--md-on-surface-variant)]">
          {restoring ? CLIENT_COPY.restoreBody : CLIENT_COPY.archiveBody}
        </p>

        {!restoring && (
          <div className="mt-3">
            <label htmlFor="archive-reason" className="field-label">
              {CLIENT_COPY.archiveReasonLabel}
            </label>
            <textarea
              id="archive-reason"
              className="input h-16 resize-none p-3"
              placeholder={CLIENT_COPY.archiveReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </div>
        )}

        {error && (
          <p className="t-body-s mt-2 text-[var(--md-error)]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outlined btn-sm"
            disabled={pending}
            onClick={() => ref.current?.close()}
          >
            {CLIENT_COPY.formCancel}
          </button>
          <button
            type="button"
            className="btn btn-tonal btn-sm ml-auto"
            disabled={pending}
            onClick={submit}
          >
            {pending
              ? CLIENT_COPY.formSaving
              : restoring
                ? CLIENT_COPY.restoreConfirm
                : CLIENT_COPY.archiveConfirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
