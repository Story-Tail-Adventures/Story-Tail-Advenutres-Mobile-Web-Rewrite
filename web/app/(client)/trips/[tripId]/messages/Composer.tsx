"use client";

import { useActionState, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { sendTripMessage, type SendMessageState } from "@/lib/trips/actions";
import { QUICK_REPLIES, THREAD_MESSAGES } from "@/lib/trips/thread";
import { THREAD } from "./content";

const IDLE: SendMessageState = { status: "idle" };

/**
 * The 2.2.7 compose bar: quick-reply chips, a growing textarea, attach and send.
 *
 * THE TEXTAREA IS CONTROLLED, which a plain server-action form would not need. It is
 * controlled because three other things write to it: a quick-reply chip fills it, a failed
 * send restores the draft, and a successful send clears it. Letting the form own the value
 * would mean the chips could not prefill and a network failure would silently eat what
 * somebody typed.
 *
 * ITS VALUE IS DERIVED RATHER THAN SYNCED, and that is worth explaining because the obvious
 * implementation is an effect that copies the action result into state — which
 * `react-hooks/set-state-in-effect` rejects, and rightly: it renders twice and can flicker
 * the old text back. Instead `typed` is null until somebody types, and the fallback comes
 * straight off the action state. Submitting sets it back to null, so the box clears
 * immediately while the request is in flight and then either stays empty (sent) or fills
 * with the draft the server handed back (error). No effect, one render, and a second
 * consecutive failure restores correctly because the reset happens on submit rather than on
 * a state comparison.
 *
 * ENTER SENDS, SHIFT+ENTER ADDS A LINE. That is the convention every messaging surface a
 * traveler already uses follows, and getting it backwards is the kind of thing that makes
 * people write one-line messages forever. The form still submits normally without
 * JavaScript, because it is a real form with a real action.
 */
export function Composer({ tripId }: { tripId: string }) {
  const send = sendTripMessage.bind(null, tripId);
  const [state, action, pending] = useActionState(send, IDLE);
  const [typed, setTyped] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const draft = typed ?? (state.status === "error" ? state.draft : "");
  const empty = draft.trim().length === 0;

  return (
    <div className="border-t border-outline-variant bg-surface">
      {state.status === "error" && (
        <p role="alert" className="t-body-s px-4 pt-2.5 text-error md:px-6">
          {state.message}
        </p>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 py-2.5 md:px-6">
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              // Fills the box rather than sending, so nothing leaves for Gyasi that the
              // traveler has not seen sitting in their own compose bar first.
              onClick={() => {
                setTyped(reply);
                textarea.current?.focus();
              }}
              className="chip tap-44 h-[30px] shrink-0"
            >
              {reply}
            </button>
          ))}
        </div>

        <form
          action={action}
          // Hand the box back to the derived fallback, so it empties the moment the request
          // starts and the error path can refill it.
          onSubmit={() => setTyped(null)}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            className="btn-icon tap-44 shrink-0"
            disabled
            aria-disabled="true"
            aria-label={THREAD_MESSAGES.attachLabel}
            title={THREAD.attachDeferred}
          >
            <Icon name="attach" size={18} />
          </button>

          <textarea
            ref={textarea}
            name="body"
            rows={1}
            value={draft}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!empty) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={THREAD_MESSAGES.composePlaceholder}
            aria-label={THREAD_MESSAGES.composePlaceholder}
            className="t-body max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-outline-variant bg-bg px-3.5 py-2.5 text-on-surface placeholder:text-on-surface-variant"
          />

          <button
            type="submit"
            disabled={pending || empty}
            className="btn btn-filled tap-44 h-11 shrink-0 rounded-full px-4"
          >
            <Icon name={pending ? "clock" : "send"} size={14} />
            <span className="hidden md:inline">{THREAD_MESSAGES.sendLabel}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
