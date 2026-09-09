"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/ui/Icon";
import { QUOTE } from "./content";
import { sendQuoteRequest, type QuoteRequestTarget, type QuoteState } from "./actions";

/**
 * The note field and the send button (Screen 2.3.8), plus 2.3.9's confirmation rendered in
 * place rather than as a route — the traveler has not gone anywhere, and a redirect would
 * lose the "what happens next" line at exactly the moment they want it.
 *
 * `target` is bound server-side via `.bind`, so the form posts only the note. The identity
 * of what is being quoted never round-trips through a hidden input where a client could
 * change it after the page was rendered.
 */
export function QuoteForm({ target }: { target: QuoteRequestTarget }) {
  const action = sendQuoteRequest.bind(null, target);
  const [state, formAction, pending] = useActionState<QuoteState, FormData>(action, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <section aria-live="polite" className="card p-6 text-center">
        <Icon name="check" size={28} strokeWidth={2.5} className="mx-auto text-success" />
        <h2 className="t-title-l mt-2 text-on-surface">{QUOTE.sent.title}</h2>
        <p className="t-body mx-auto mt-1.5 max-w-110 text-on-surface-variant">{QUOTE.sent.body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href={state.tripId ? `/trips/${state.tripId}` : "/trips"} className="btn btn-filled">
            {QUOTE.sent.viewTrip}
          </Link>
          <Link href="/explore" className="btn btn-text">
            {QUOTE.sent.keepLooking}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction}>
      <label htmlFor="quote-note" className="t-title-s block text-on-surface">
        {QUOTE.notes.label}{" "}
        <span className="t-label font-normal text-on-surface-variant">{QUOTE.notes.optional}</span>
      </label>
      <textarea
        id="quote-note"
        name="note"
        rows={4}
        maxLength={2000}
        defaultValue={state.draft}
        placeholder={QUOTE.notes.placeholder}
        className="input mt-1.5 min-h-28 w-full p-3 text-on-surface"
      />

      {state.status === "error" && state.message && (
        <p role="alert" className="t-body-s mt-2 text-error">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-filled disabled:opacity-60">
          {pending ? QUOTE.submitting : QUOTE.submit}
        </button>
        <Link href="/explore" className="btn btn-text">
          {QUOTE.cancel}
        </Link>
      </div>
    </form>
  );
}
