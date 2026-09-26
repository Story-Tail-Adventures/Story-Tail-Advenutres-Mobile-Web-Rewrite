"use client";

import { useActionState, useSyncExternalStore } from "react";

import { bulkTagClientsAction, type BulkTagState } from "@/app/(agent)/agent/clients/actions";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * Screen 3.3.1's bulk-select column and the action behind it.
 *
 * THE SELECTION IS NOT REACT STATE. Every ticked row posts its own `clientId` with the form,
 * so the browser holds the selection and the roster stays a server component — the same
 * trade the filters and the paginator already make on this page. Two things fall out of it:
 * the bar works before hydration and with JavaScript off, and there is no selection to go
 * stale when the roster refetches after a save.
 *
 * SO THE BAR IS REVEALED BY CSS, not by a count in state. `.bulk-form:has(:checked)` in
 * agent.css does it. That is also why nothing here says "3 selected": a number rendered by
 * React would be absent before hydration and wrong after a revalidation, and the result
 * sentence already says exactly how many clients moved.
 *
 * REACT RESETS THE WHOLE FORM WHEN THE ACTION RETURNS, and that is why the tag field is
 * `required`. React 19 calls `form.reset()` itself after a `<form action={fn}>` submission
 * — so the ticks AND the typed tag go, whatever the action answered. After a real save that
 * is what you want; after a refusal it means a typo costs you twenty-five ticks.
 *
 * So the two refusals are kept out of the server's hands instead. `required` makes the
 * browser block an empty tag before anything submits (and it works with JavaScript off,
 * which a hydrated check would not), and the bar is only on screen when a row is ticked, so
 * an empty selection cannot be sent from here either. `bulkNoSelection` and `bulkNoTag` stay
 * in the action because the action is a public surface, not because this UI reaches them.
 *
 * This cost a round trip to find: the first version answered "Type a tag first." correctly
 * and cleared seven ticks doing it.
 *
 * THE MESSAGE LIVES OUTSIDE THE BAR. If it were inside, clearing the selection would take
 * the receipt with it.
 *
 * NO BULK MESSAGE BUTTON. §3.10 is unbuilt and a disabled control beside two working ones
 * reads as broken rather than forthcoming — §6.4's rule, the same one that cut this column
 * from the roster until there was something behind it.
 */

const SELECT_ALL_ID = "roster-select-all";

/**
 * True once hydrated, false in the server render.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the effect version schedules a
 * second render from inside an effect, which `react-hooks/set-state-in-effect` rejects and
 * the compiler has to work around. This is the sanctioned shape — the third argument IS the
 * server snapshot, which is the whole question being asked.
 */
const NEVER_CHANGES = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
}

/**
 * "Select every client on this page."
 *
 * RENDERS NOTHING UNTIL HYDRATED, which is the honest version of a control that cannot work
 * without JavaScript. Ticking twenty-five boxes is a real fallback; a checkbox that silently
 * does nothing is not. The `<th>` keeps its width either way so the columns do not shift.
 */
export function SelectAllClients() {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return (
    <input
      id={SELECT_ALL_ID}
      type="checkbox"
      aria-label={CLIENT_COPY.bulkSelectAll}
      className="size-4 cursor-pointer accent-[var(--md-primary)]"
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const on = event.currentTarget.checked;
        for (const box of form.querySelectorAll<HTMLInputElement>('input[name="clientId"]')) {
          box.checked = on;
        }
        event.currentTarget.indeterminate = false;
      }}
    />
  );
}

export function ClientBulkTagForm({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<BulkTagState, FormData>(
    bulkTagClientsAction,
    {},
  );

  /**
   * Keeps the header checkbox truthful. Pure DOM — `indeterminate` has no HTML attribute and
   * can only be set this way, and nothing here is React state, so nothing here can be stale.
   */
  function syncSelectAll(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const all = form.querySelector<HTMLInputElement>(`#${SELECT_ALL_ID}`);
    if (!all) return;
    const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name="clientId"]')];
    const ticked = boxes.filter((b) => b.checked).length;
    all.checked = ticked > 0 && ticked === boxes.length;
    all.indeterminate = ticked > 0 && ticked < boxes.length;
  }

  return (
    <form action={formAction} onChange={syncSelectAll} className="bulk-form">
      {(state.message || state.error) && (
        <p
          role="status"
          className={`t-body-s mb-2 rounded-xl px-3 py-2 ${
            state.error
              ? "bg-[var(--md-error-container)] text-[var(--md-on-error-container)]"
              : "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]"
          }`}
        >
          {state.error ?? state.message}
        </p>
      )}

      {children}

      <div className="bulk-bar mt-2 flex-wrap items-center gap-2 rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-2)] px-3 py-2">
        <span className="t-body-s font-semibold">{CLIENT_COPY.bulkLegend}</span>
        <label className="sr-only" htmlFor="bulk-tag">
          {CLIENT_COPY.bulkTagLabel}
        </label>
        <input
          id="bulk-tag"
          name="tag"
          required
          maxLength={40}
          placeholder={CLIENT_COPY.bulkTagPlaceholder}
          className="input h-8 min-w-0 flex-1 rounded-full px-3 text-[12.5px]"
        />
        <button
          type="submit"
          name="direction"
          value="add"
          disabled={pending}
          className="btn btn-orange btn-sm shrink-0"
        >
          {pending ? CLIENT_COPY.bulkWorking : CLIENT_COPY.bulkAdd}
        </button>
        <button
          type="submit"
          name="direction"
          value="remove"
          disabled={pending}
          className="btn btn-tonal btn-sm shrink-0"
        >
          {CLIENT_COPY.bulkRemove}
        </button>
      </div>
    </form>
  );
}
