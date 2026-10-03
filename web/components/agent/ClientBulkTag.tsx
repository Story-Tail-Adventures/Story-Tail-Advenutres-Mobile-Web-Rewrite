"use client";

import * as React from "react";
import { useActionState, useSyncExternalStore } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { bulkTagClientsAction, type BulkTagState } from "@/app/(agent)/agent/clients/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CLIENT_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.3.1's bulk-select column and the action behind it.
 *
 * THE SELECTION IS REACT STATE SINCE THE MUI MIGRATION (step 2, PR 6), where it used to be
 * the browser's own checkbox state revealed by `.bulk-form:has(.bulk-pick:checked)` in
 * agent.css. The ruling that the roster's checkboxes are MUI Checkboxes forced the move: an
 * MUI Checkbox paints its tick from React state, not from the input's `checked` property,
 * so the old select-all — which wrote `box.checked = on` into twenty-five DOM inputs — would
 * have ticked the hidden inputs and left every icon dark. The selection has to live in one
 * place both can read. So: a context the form provides, a `ClientRowCheckbox` per row that
 * registers its id and reads whether it is picked, and a select-all that reads the two
 * counts. The bar renders only while something is picked, which is the same moment the CSS
 * used to show it; what is given up is the bar appearing with JavaScript off, accepted in
 * that ruling. Still md and up, as the CSS rule was: the checkbox column is table-only and
 * the phone gets the card list.
 *
 * THE SAME SHAPE AS §3.4.1's `TripBulkStatus.tsx`, on purpose — one selection mechanism for
 * both rosters. The one difference is the value each row posts: a plain `clientId` here,
 * because adding a tag cannot clobber anything, where a trip carries `tripId:fromStatus`.
 *
 * WHAT DID NOT MOVE. Every ticked row still posts its own `clientId` with the form, the two
 * submit buttons still share the name `direction`, and the action still reads
 * `form.getAll("clientId")` — the FormData the server sees is the same it always was.
 *
 * THE ROWS REGISTER THEMSELVES. The form never sees the roster's rows (they are server
 * children), so each checkbox adds its id on mount and removes it on unmount. That gives
 * the select-all its denominator, and it is what prunes a stale selection: a filter or a
 * page change swaps the rows out from under the ticks, and an id that is no longer on
 * screen is dropped — so the bar hides over a table with nothing ticked in it, exactly as
 * the CSS rule used to.
 *
 * `required` ON THE TAG FIELD IS LOAD-BEARING. React 19 calls `form.reset()` after a
 * `<form action>` submission whatever the action answered, so a refusal would cost the
 * advisor the typed tag; the browser blocks an empty tag before anything submits, and the
 * bar is only on screen when a row is ticked, so neither refusal the action can answer
 * (`bulkNoSelection`, `bulkNoTag`) is reachable from here. The selection itself is cleared
 * when the action answers, which is what `form.reset()` did to the native checkboxes.
 *
 * THE MESSAGE LIVES OUTSIDE THE BAR. If it were inside, clearing the selection would take
 * the receipt with it.
 *
 * NO BULK MESSAGE BUTTON. §3.10 is unbuilt and a disabled control beside two working ones
 * reads as broken rather than forthcoming — §6.4's rule.
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

const EMPTY: ReadonlySet<string> = new Set();

/** The stable half of the context: functions that never change identity, so a row's
 *  register/unregister effect runs once per id rather than on every tick. */
interface SelectionActions {
  register: (id: string) => void;
  unregister: (id: string) => void;
  setOne: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
}

interface Selection {
  /** Every row checkbox currently mounted inside the form, by client id. */
  all: ReadonlySet<string>;
  /** The ones ticked. Always a subset of `all`. */
  selected: ReadonlySet<string>;
  actions: SelectionActions;
}

const SelectionContext = React.createContext<Selection | null>(null);

function without(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  if (!set.has(value)) return set;
  const next = new Set(set);
  next.delete(value);
  return next;
}

function withValue(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  if (set.has(value)) return set;
  const next = new Set(set);
  next.add(value);
  return next;
}

/**
 * One row's checkbox: a real `<input type="checkbox" name="clientId" value="…">` inside
 * MUI's Checkbox, named after the client it selects — twenty-five boxes labelled "Select"
 * are twenty-five identical announcements. Controlled by the form's selection when rendered
 * inside `ClientBulkTagForm`; an ordinary uncontrolled checkbox anywhere else (the roster
 * table renders on its own in tests), so the posted FormData is the same either way.
 */
export function ClientRowCheckbox({ value, label }: { value: string; label: string }) {
  const ctx = React.useContext(SelectionContext);
  const actions = ctx?.actions;

  React.useEffect(() => {
    if (!actions) return;
    actions.register(value);
    return () => actions.unregister(value);
  }, [actions, value]);

  if (!ctx) {
    return (
      <Checkbox name="clientId" value={value} size="small" slotProps={{ input: { "aria-label": label } }} />
    );
  }

  return (
    <Checkbox
      name="clientId"
      value={value}
      size="small"
      checked={ctx.selected.has(value)}
      onChange={(event) => ctx.actions.setOne(value, event.target.checked)}
      slotProps={{ input: { "aria-label": label } }}
    />
  );
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
  const ctx = React.useContext(SelectionContext);
  if (!hydrated) return null;

  // Outside the form (the table on its own) there is no selection to drive, so this is an
  // uncontrolled box that posts nothing — the same markup, inert.
  if (!ctx) {
    return (
      <Checkbox
        id={SELECT_ALL_ID}
        size="small"
        slotProps={{ input: { "aria-label": CLIENT_COPY.bulkSelectAll } }}
      />
    );
  }

  const total = ctx.all.size;
  const ticked = ctx.selected.size;

  return (
    <Checkbox
      id={SELECT_ALL_ID}
      size="small"
      checked={total > 0 && ticked === total}
      indeterminate={ticked > 0 && ticked < total}
      onChange={(event) => ctx.actions.setAll(event.target.checked)}
      slotProps={{ input: { "aria-label": CLIENT_COPY.bulkSelectAll } }}
    />
  );
}

export function ClientBulkTagForm({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<BulkTagState, FormData>(
    bulkTagClientsAction,
    {},
  );

  const [all, setAllRows] = React.useState<ReadonlySet<string>>(EMPTY);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(EMPTY);

  // `setAll` reads the row set through a ref so the actions object can stay stable. The ref
  // is synced in an effect, not during render (React may render without committing).
  const allRef = React.useRef(all);
  React.useEffect(() => {
    allRef.current = all;
  }, [all]);

  const actions = React.useMemo<SelectionActions>(
    () => ({
      register: (id) => setAllRows((prev) => withValue(prev, id)),
      unregister: (id) => {
        setAllRows((prev) => without(prev, id));
        setSelected((prev) => without(prev, id));
      },
      setOne: (id, on) =>
        setSelected((prev) => (on ? withValue(prev, id) : without(prev, id))),
      setAll: (on) => setSelected(on ? new Set(allRef.current) : EMPTY),
    }),
    [],
  );

  // What `form.reset()` did to the native checkboxes: every action result, success or
  // failure, starts the next selection from nothing. Done during render ("adjusting state
  // when a prop changes"), not in an effect, so the cleared selection lands in the same
  // render as the result instead of one after it.
  const [seenState, setSeenState] = React.useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setSelected(EMPTY);
  }

  const selection = React.useMemo<Selection>(
    () => ({ all, selected, actions }),
    [all, selected, actions],
  );

  return (
    <SelectionContext.Provider value={selection}>
      <form action={formAction}>
        {(state.message || state.error) && (
          <Box sx={{ mb: 1 }}>
            <Alert tone={state.error ? "error" : "success"} role="status">
              {state.error ?? state.message}
            </Alert>
          </Box>
        )}

        {children}

        {selected.size > 0 && (
          <Paper
            variant="outlined"
            sx={{
              mt: 1,
              display: { xs: "none", md: "flex" },
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              bgcolor: "surface.2",
              px: 1.5,
              py: 1,
            }}
          >
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
              {CLIENT_COPY.bulkLegend}
            </Typography>
            <Box component="label" htmlFor="bulk-tag" sx={VISUALLY_HIDDEN}>
              {CLIENT_COPY.bulkTagLabel}
            </Box>
            <OutlinedInput
              id="bulk-tag"
              name="tag"
              required
              size="small"
              placeholder={CLIENT_COPY.bulkTagPlaceholder}
              inputProps={{ maxLength: 40 }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Button type="submit" name="direction" value="add" variant="orange" size="sm" disabled={pending}>
              {pending ? CLIENT_COPY.bulkWorking : CLIENT_COPY.bulkAdd}
            </Button>
            <Button type="submit" name="direction" value="remove" variant="tonal" size="sm" disabled={pending}>
              {CLIENT_COPY.bulkRemove}
            </Button>
          </Paper>
        )}
      </form>
    </SelectionContext.Provider>
  );
}
