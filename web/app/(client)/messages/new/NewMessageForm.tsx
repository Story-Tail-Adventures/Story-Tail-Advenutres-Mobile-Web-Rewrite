"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { startConversation } from "@/lib/messages/actions";
import { MESSAGES } from "@/lib/messages/content";
import { THREAD_MESSAGES, type SendMessageState } from "@/lib/trips/thread";

const IDLE: SendMessageState = { status: "idle" };

/**
 * Screen 2.6.3's form.
 *
 * NOT THE COMPOSE BAR. 2.6.2's composer is a one-line reply that grows; this is a page whose
 * whole purpose is one message, and the artboard draws it as a card with a 140px field. They
 * share an action shape and nothing else, so sharing the component would mean a prop for
 * every difference.
 *
 * THERE IS NO SUBJECT FIELD, which the desktop frame has. `trip-message` takes no subject —
 * it sets `conversation.subject` from the trip title, and a trip-less thread has none — so a
 * subject box would be a field that goes nowhere. The deeper reason it should not be wired up
 * either: a subject line is the first step towards a structured intake form, and BRD §6.5
 * (decided 2026-09-09) consolidated structured intake onto `quote-request`, which creates a
 * Trip in `inquiry`. A second intake queue is exactly what that decision removed. The thread
 * is named for the person instead — see `inboxTitle`.
 *
 * ON SUCCESS THE ACTION REDIRECTS into the new thread, so this component never renders a
 * "sent" state; what it renders is pending, and then the page is gone.
 *
 * The draft survives a failure the same way 2.6.2's does, and for the same reason: this is
 * likely the longest message anybody writes in the app, and losing it would be the worst
 * moment in the section to lose one.
 */
export function NewMessageForm() {
  const [state, action, pending] = useActionState(startConversation, IDLE);
  const [typed, setTyped] = useState<string | null>(null);

  const draft = typed ?? (state.status === "error" ? state.draft : "");
  const empty = draft.trim().length === 0;

  return (
    <form action={action} onSubmit={() => setTyped(null)} className="card p-5 md:p-6">
      {/* The advisor card the frame opens with, minus the presence dot and the "< 2h"
          promise — see the header of lib/messages/content.ts for why there is exactly one
          reply-time string in this codebase. */}
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-secondary-container p-3 text-on-secondary-container">
        <span
          aria-hidden="true"
          className="t-label inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-burgundy text-[12px] font-bold text-white"
        >
          {MESSAGES.advisorInitials}
        </span>
        <p className="t-body-s">
          <b>{MESSAGES.advisorName}</b> · {MESSAGES.replyWindow}
        </p>
      </div>

      <label htmlFor="body" className="field-label">
        {MESSAGES.newBodyLabel}
      </label>
      <textarea
        id="body"
        name="body"
        value={draft}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={MESSAGES.newPlaceholder}
        rows={7}
        className="t-body mt-1 w-full resize-none rounded-xl border border-outline-variant bg-bg px-3.5 py-3 text-on-surface placeholder:text-on-surface-variant"
      />

      {state.status === "error" && (
        <p role="alert" className="t-body-s mt-2 text-error">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {/* Departure 10: a thread with no trip has nothing it could attach. `trip-document`
            hard-requires a tripId and is the only insert into `document` in the repo, so the
            filter in `trip-message` would drop anything sent from here. It turns on with the
            account-scoped upload endpoint recorded against §2.5.4. */}
        {/* The button keeps the artboard's own label and the REASON sits beside it as visible
            text, rather than the reason becoming the label. A sentence-long button reads as a
            rendering fault, and a `title` tooltip alone is unreachable on a touch screen —
            which is most of this app. Same shape §2.5's disabled settings rows use. */}
        <button
          type="button"
          className="btn btn-tonal btn-sm tap-44"
          disabled
          aria-disabled="true"
        >
          <Icon name="attach" size={13} />
          {THREAD_MESSAGES.attachLabel}
        </button>
        <span className="t-body-s hidden text-on-surface-variant md:inline">
          {MESSAGES.attachDeferred}
        </span>

        <button
          type="submit"
          disabled={pending || empty}
          className="btn btn-filled tap-44 ml-auto h-11"
        >
          <Icon name={pending ? "clock" : "send"} size={14} />
          {pending ? MESSAGES.newSending : MESSAGES.newSend}
        </button>
      </div>
    </form>
  );
}
