"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  archiveTemplateAction,
  renameTemplateAction,
} from "@/app/(agent)/agent/templates/actions";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY, TEMPLATE_COPY } from "@/lib/agent/content";
import type { TemplateCard } from "@/lib/agent/templates";

/**
 * §3.4.13's grid.
 *
 * WHAT THE PROTOTYPE DRAWS THAT IS NOT HERE. Each of its cards carries a 110px photograph
 * from `staImg(...)`, and `trip_template` has no image column — nor should it: a pattern is
 * a set of bookings, and the picture on the prototype's card is of the resort, which lives
 * on the supplier. Dropping it rather than inventing a column is the same call §3.4.2 made
 * about the invented "surprise flag".
 *
 * Its "Use" button is also NOT here. Applying a pattern needs a TRIP to apply it to, and
 * this screen has none — the two real entry points are §3.4.3's "start from a template",
 * where the trip is about to exist, and the builder, where it already does. A button that
 * cannot know its own object is the control §6.4's amendment argues against.
 *
 * What is here instead is rename and retire, which are this screen's own verbs.
 */
export function TemplateGrid({ rows }: { rows: TemplateCard[] }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <TemplateTile key={row.templateId} row={row} />
      ))}
    </div>
  );
}

function TemplateTile({ row }: { row: TemplateCard }) {
  const renameRef = useRef<HTMLDialogElement>(null);
  const archiveRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, dialog: HTMLDialogElement | null) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? AGENT_COPY.cancelFailed);
        return;
      }
      dialog?.close();
      router.refresh();
    });
  }

  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="t-title-s m-0 break-words">{row.name}</h2>
          <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
            {row.tripTypeLabel} · {row.shapeLabel}
          </p>
        </div>
        {row.valueLabel && (
          <span className="chip h-[22px] shrink-0 font-mono text-[11px]">{row.valueLabel}</span>
        )}
      </div>

      {row.description && (
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">{row.description}</p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-3">
        {/* Only when something has used it. A "0× used" chip on every new template is a
            number that means nothing, and it is derived from trip.template_id rather than
            counted, so it cannot drift from the trips. */}
        {row.usageLabel && (
          <span className="chip h-[22px] text-[11px]">{row.usageLabel}</span>
        )}
        <button
          type="button"
          className="btn btn-text btn-sm ml-auto"
          onClick={() => {
            setError(null);
            setName(row.name);
            setDescription(row.description ?? "");
            renameRef.current?.showModal();
          }}
        >
          {TEMPLATE_COPY.renameLabel}
          <span className="sr-only"> {row.name}</span>
        </button>
        <button
          type="button"
          className="btn btn-outlined btn-sm"
          onClick={() => {
            setError(null);
            archiveRef.current?.showModal();
          }}
        >
          {TEMPLATE_COPY.archiveLabel}
          <span className="sr-only"> {row.name}</span>
        </button>
      </div>

      <dialog
        ref={renameRef}
        className="card m-auto w-[min(480px,calc(100vw-2rem))] p-5 backdrop:bg-black/45"
        aria-label={`${TEMPLATE_COPY.renameLabel} ${row.name}`}
      >
        <h2 className="t-title-l m-0">{TEMPLATE_COPY.renameLabel}</h2>
        {/* Said here, where somebody is looking at an edit form and might reasonably expect
            the bookings to be editable too. They are not, and the reason is in the RPC. */}
        <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
          {TEMPLATE_COPY.payloadFixedNote}
        </p>

        <div className="mt-3">
          <label htmlFor={`name-${row.templateId}`} className="field-label">
            {TEMPLATE_COPY.saveNameLabel}
          </label>
          <input
            id={`name-${row.templateId}`}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="mt-3">
          <label htmlFor={`desc-${row.templateId}`} className="field-label">
            {TEMPLATE_COPY.saveDescriptionLabel}
          </label>
          <input
            id={`desc-${row.templateId}`}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
        </div>

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
            onClick={() => renameRef.current?.close()}
          >
            {TEMPLATE_COPY.cancel}
          </button>
          <button
            type="button"
            className="btn btn-tonal btn-sm ml-auto"
            disabled={pending || name.trim() === ""}
            onClick={() =>
              run(
                () =>
                  renameTemplateAction({
                    templateId: row.templateId,
                    name: name.trim(),
                    description,
                  }),
                renameRef.current,
              )
            }
          >
            {pending ? AGENT_COPY.cancelSaving : TEMPLATE_COPY.saveConfirm}
          </button>
        </div>
      </dialog>

      <dialog
        ref={archiveRef}
        className="card m-auto w-[min(480px,calc(100vw-2rem))] p-5 backdrop:bg-black/45"
        aria-label={`${TEMPLATE_COPY.archiveLabel} ${row.name}`}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-warning-container)] text-[var(--md-on-surface)]">
            <Icon name="inbox" size={18} />
          </span>
          <div className="min-w-0">
            <span className="t-label-s block text-[var(--md-warning)]">
              {TEMPLATE_COPY.archiveLabel.toUpperCase()}
            </span>
            <h2 className="t-title-l m-0 break-words">{row.name}</h2>
          </div>
        </div>
        {/* Not `btn-danger`, and the body says why: this is reversible in every way that
            matters. Trips built from it keep their history and keep pointing at it, because
            a hard delete would fail outright on the foreign key. */}
        <p className="t-body mt-2 text-[var(--md-on-surface-variant)]">
          {TEMPLATE_COPY.archiveConfirmBody}
        </p>

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
            onClick={() => archiveRef.current?.close()}
          >
            {TEMPLATE_COPY.cancel}
          </button>
          <button
            type="button"
            className="btn btn-tonal btn-sm ml-auto"
            disabled={pending}
            onClick={() =>
              run(
                () => archiveTemplateAction({ templateId: row.templateId }),
                archiveRef.current,
              )
            }
          >
            {pending ? AGENT_COPY.cancelSaving : TEMPLATE_COPY.archiveLabel}
          </button>
        </div>
      </dialog>
    </article>
  );
}
