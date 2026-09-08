"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { saveReflection, type ReflectionState } from "@/lib/trips/actions";
import type { PastTripView } from "@/lib/trips/queries";
import { MEMORIES } from "./content";

const IDLE: ReflectionState = { status: "idle" };

/**
 * The 2.2.11 reflection card: a prompt, a box, save-for-later and send.
 *
 * OPENS CLOSED. §2.2.11 lists testimonial submission among its primary elements but this
 * screen exists to be looked at, not filled in — a textarea sitting open under a photo
 * gallery turns a memory into a form. So it is a button until somebody taps it, and it opens
 * already-expanded when they have a draft in progress, which is the one case where they came
 * back specifically to finish it.
 *
 * TWO SUBMIT BUTTONS, one form, distinguished by a hidden `intent` field rather than by two
 * actions: "save for later" and "send it to Gyasi" post the same words to the same endpoint
 * and differ only in whether the row leaves `draft`. `formAction` on a button would work too
 * but would need the whole action duplicated to change one boolean.
 *
 * The value is derived rather than synced, same as the thread's composer — see the note
 * there for why `react-hooks/set-state-in-effect` rules out the obvious version.
 */
export function ReflectionForm({
  tripId,
  reflection,
}: {
  tripId: string;
  reflection: PastTripView["reflection"];
}) {
  const save = saveReflection.bind(null, tripId);
  const [state, action, pending] = useActionState(save, IDLE);
  const [open, setOpen] = useState(reflection?.editable === true && reflection.body.length > 0);
  const [typed, setTyped] = useState<string | null>(null);

  // Once the server says it is submitted, this render is authoritative over the row the page
  // was built from — the traveler has not navigated yet.
  const submitted = state.status === "submitted" || reflection?.editable === false;

  if (submitted) {
    return (
      <section className="card border-0 bg-secondary-container p-4 text-on-secondary-container">
        <h2 className="t-title-s">{MEMORIES.reflectionSubmittedHeading}</h2>
        <p className="t-body-s mt-1 opacity-90">{MEMORIES.reflectionSubmittedBody}</p>
        {reflection?.body && (
          <blockquote className="t-body mt-3 border-l-2 border-current/30 pl-3 opacity-90">
            {reflection.body}
          </blockquote>
        )}
      </section>
    );
  }

  const draft = typed ?? (state.status === "error" ? state.draft : (reflection?.body ?? ""));
  const empty = draft.trim().length === 0;

  return (
    <section className="card p-4">
      <h2 className="t-title-s">{MEMORIES.reflectionHeading}</h2>
      <p className="t-body-s mt-1 text-on-surface-variant">{MEMORIES.reflectionBody}</p>

      {state.status === "saved" && (
        <p role="status" className="t-body-s mt-2 text-secondary">
          {MEMORIES.reflectionSaved}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="t-body-s mt-2 text-error">
          {state.message}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-tonal mt-3 w-full"
        >
          {reflection?.body ? MEMORIES.reflectionEditCta : MEMORIES.reflectionCta}
        </button>
      ) : (
        <form action={action} className="mt-3" onSubmit={() => setTyped(null)}>
          {reflection?.id && <input type="hidden" name="testimonialId" value={reflection.id} />}
          <textarea
            name="body"
            rows={5}
            value={draft}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={MEMORIES.reflectionPlaceholder}
            aria-label={MEMORIES.reflectionHeading}
            className="t-body w-full resize-y rounded-xl border border-outline-variant bg-bg px-3.5 py-2.5 text-on-surface placeholder:text-on-surface-variant"
          />
          <div className="mt-2.5 flex flex-col gap-2 md:flex-row">
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={pending || empty}
              className="btn btn-outlined flex-1"
            >
              {MEMORIES.reflectionSave}
            </button>
            <button
              type="submit"
              name="intent"
              value="submit"
              disabled={pending || empty}
              className="btn btn-filled flex-1"
            >
              <Icon name="send" size={13} /> {MEMORIES.reflectionSubmit}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
