"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveAsTemplateAction } from "@/app/(agent)/agent/templates/actions";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATE_COPY } from "@/lib/agent/content";

/**
 * §3.4.13's "create from existing trip", reached from the trip that is being saved.
 *
 * TWO DOORS, ONE DIALOG. The builder's rail is where an advisor is looking at the bookings
 * they just assembled, and the trip detail header is where `duplicateTripDeferred` has been
 * pointing since §3.4.4 repointed it here. Both open this.
 *
 * WHAT IT REPLACES ON THE TRIP DETAIL. "Duplicate" was disabled with the reason
 * *"Duplicating a trip arrives with §3.4.13, alongside the template library it shares the
 * mechanism with."* That deferral is now honoured rather than deleted: duplicating IS save
 * a pattern, then New trip → start from a template. Two steps, each of which is a real
 * screen, rather than a third verb that would need its own client picker and date logic.
 *
 * THE BODY SAYS WHAT DOES NOT COME ACROSS, which matters more than what does. An advisor
 * who assumes a confirmation number came with the pattern will read one to a client.
 */
export function SaveAsTemplateDialog({
  tripId,
  tripTitle,
  suggestedName,
  label,
  className = "btn btn-outlined btn-sm",
}: {
  tripId: string;
  tripTitle: string;
  /** The trip's own title, so the commonest case is one keystroke: confirm. */
  suggestedName?: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(suggestedName ?? tripTitle);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open() {
    setError(null);
    setReceipt(null);
    setName(suggestedName ?? tripTitle);
    setDescription("");
    ref.current?.showModal();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveAsTemplateAction({
        tripId,
        name: name.trim(),
        description,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // THE RECEIPT STAYS ON SCREEN rather than the dialog closing on success. It says how
      // many bookings and days were captured, and that count is the only way an advisor
      // can tell a pattern saved from a trip with no day-by-day from one that lost it.
      setReceipt(result.message ?? null);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
        <span className="sr-only"> — {tripTitle}</span>
      </button>

      <dialog
        ref={ref}
        className="card m-auto w-[min(520px,calc(100vw-2rem))] p-5 backdrop:bg-black/45"
        aria-label={TEMPLATE_COPY.saveTitle}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
            {/* `star`, not `bookmark` — icon-paths.ts has no bookmark glyph, and adding one for a
                dialog header is a design-system change for no gain. */}
            <Icon name="star" size={18} />
          </span>
          <div className="min-w-0">
            <span className="t-label-s block text-[var(--md-on-surface-variant)]">
              {TEMPLATE_COPY.saveEyebrow}
            </span>
            <h2 className="t-title-l m-0 break-words">{TEMPLATE_COPY.saveTitle}</h2>
          </div>
        </div>

        <p className="t-body mt-2 text-[var(--md-on-surface-variant)]">
          {TEMPLATE_COPY.saveBody}
        </p>
        <p className="t-body-s mt-1.5 text-[var(--md-on-surface-variant)]">
          {TEMPLATE_COPY.saveExcludes}
        </p>

        {receipt ? (
          <>
            <p className="t-body mt-3 text-[var(--md-on-surface)]" role="status">
              {receipt}
            </p>
            <div className="mt-3.5 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-tonal btn-sm ml-auto"
                onClick={() => ref.current?.close()}
              >
                {TEMPLATE_COPY.done}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3">
              <label htmlFor="template-name" className="field-label">
                {TEMPLATE_COPY.saveNameLabel}
              </label>
              <input
                id="template-name"
                className="input"
                placeholder={TEMPLATE_COPY.saveNamePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="mt-3">
              <label htmlFor="template-description" className="field-label">
                {TEMPLATE_COPY.saveDescriptionLabel}
              </label>
              <input
                id="template-description"
                className="input"
                placeholder={TEMPLATE_COPY.saveDescriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
              />
            </div>

            {/* A courtesy, not the enforcement: the Edge Function and the RPC both refuse a
                blank name, and one rule in three places is one rule that drifts. */}
            {name.trim() === "" && (
              <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
                {TEMPLATE_COPY.saveNameRequired}
              </p>
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
                {TEMPLATE_COPY.cancel}
              </button>
              <button
                type="button"
                className="btn btn-tonal btn-sm ml-auto"
                disabled={pending || name.trim() === ""}
                onClick={submit}
              >
                {pending ? TEMPLATE_COPY.saving : TEMPLATE_COPY.saveConfirm}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
