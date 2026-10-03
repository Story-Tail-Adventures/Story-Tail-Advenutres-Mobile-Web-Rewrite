"use client";

import * as React from "react";
import { useActionState, useSyncExternalStore } from "react";
import MuiAlert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  bulkSetTripStatusAction,
  type BulkStatusState,
} from "@/app/(agent)/agent/trips/actions";
import { Button } from "@/components/ui/Button";
import { TRIP_COPY } from "@/lib/agent/content";
import { TRIP_STATUS_FILTERS } from "@/lib/agent/tripStatuses";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.4.1's bulk-select column and the stage change behind it.
 *
 * BUILT ON §3.3.1's BAR, with one thing genuinely different. There the selection was a list
 * of ids; here each checkbox posts `tripId:fromStatus`, because setting a stage OVERWRITES
 * where adding a tag cannot. The stage a row was showing travels with the row, and a trip
 * somebody else moved meanwhile is skipped rather than clobbered.
 *
 * Packed into ONE field value rather than two parallel ones: `getAll("trip")` and
 * `getAll("fromStatus")` would have to stay zipped by position, and nothing in the markup
 * would enforce it.
 *
 * THE SELECTION IS REACT STATE SINCE 2026-10-02 (MUI everywhere, step 2 PR 6). It used to
 * be the browser's own checkbox state, with the bar revealed by `:has(:checked)` in CSS so
 * it worked before hydration. An MUI Checkbox draws its tick from React state, not from the
 * input's `checked` property, so select-all flipping `.checked` on the DOM would leave every
 * row drawn unticked while the form posted them — the selection has to live in one place
 * both can read. So: a context the form provides, a `TripPickCheckbox` per row that
 * registers its value and reads whether it is picked, and a select-all that reads the two
 * counts. The bar renders only while something is picked, which is the same moment the CSS
 * used to show it; what is given up is the bar appearing with JavaScript off, accepted in
 * that ruling. Still md and up, as the CSS rule was.
 *
 * Everything else is §3.3.1's, for §3.3.1's reasons — the receipt lives outside the bar so
 * clearing the selection does not take it away, and the stage select is `required` so
 * React 19's post-action `form.reset()` cannot eat a selection over a validation slip. The
 * selection itself is cleared after each action settles, which is what `form.reset()` did
 * to the native checkboxes before.
 *
 * NO CANCEL OPTION. §3.4.16 is a whole screen for cancelling one trip — impact list,
 * mandatory reason — and it is refused in the action, the Edge Function and the SQL besides.
 */

const SELECT_ALL_ID = "trip-select-all";

const NEVER_CHANGES = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
}

const EMPTY: ReadonlySet<string> = new Set();

/** The stable half of the context: functions that never change identity, so a row's
 *  register/unregister effect runs once per value rather than on every tick. */
interface SelectionActions {
  register: (value: string) => void;
  unregister: (value: string) => void;
  setOne: (value: string, on: boolean) => void;
  setAll: (on: boolean) => void;
}

interface Selection {
  /** Every row checkbox currently mounted inside the form, by its `tripId:fromStatus`. */
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
 * One row's checkbox. A real `<input type="checkbox" name="trip" value="…">` inside MUI's
 * Checkbox, so the form posts exactly what it did. Controlled by the form's selection when
 * rendered inside `TripBulkStatusForm`; an ordinary uncontrolled checkbox anywhere else.
 */
export function TripPickCheckbox({ value, label }: { value: string; label: string }) {
  const ctx = React.useContext(SelectionContext);
  const actions = ctx?.actions;

  React.useEffect(() => {
    if (!actions) return;
    actions.register(value);
    return () => actions.unregister(value);
  }, [actions, value]);

  if (!ctx) {
    return (
      <Checkbox name="trip" value={value} size="small" slotProps={{ input: { "aria-label": label } }} />
    );
  }

  return (
    <Checkbox
      name="trip"
      value={value}
      size="small"
      checked={ctx.selected.has(value)}
      onChange={(event) => ctx.actions.setOne(value, event.target.checked)}
      slotProps={{ input: { "aria-label": label } }}
    />
  );
}

export function SelectAllTrips() {
  const hydrated = useHydrated();
  const ctx = React.useContext(SelectionContext);
  if (!hydrated || !ctx) return null;

  const total = ctx.all.size;
  const ticked = ctx.selected.size;

  return (
    <Checkbox
      id={SELECT_ALL_ID}
      size="small"
      checked={total > 0 && ticked === total}
      indeterminate={ticked > 0 && ticked < total}
      onChange={(event) => ctx.actions.setAll(event.target.checked)}
      slotProps={{ input: { "aria-label": TRIP_COPY.bulkSelectAll } }}
    />
  );
}

export function TripBulkStatusForm({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<BulkStatusState, FormData>(
    bulkSetTripStatusAction,
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
      register: (value) => setAllRows((prev) => withValue(prev, value)),
      unregister: (value) => {
        setAllRows((prev) => without(prev, value));
        setSelected((prev) => without(prev, value));
      },
      setOne: (value, on) =>
        setSelected((prev) => (on ? withValue(prev, value) : without(prev, value))),
      setAll: (on) => setSelected(on ? new Set(allRef.current) : EMPTY),
    }),
    [],
  );

  // What `form.reset()` did to the native checkboxes: every action result, success or
  // failure, starts the next selection from nothing. The rows re-render with their new
  // stages anyway, so a stale `tripId:fromStatus` would not match what is on screen.
  // Done during render ("adjusting state when a prop changes"), not in an effect, so the
  // cleared selection lands in the same render as the result instead of one after it.
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
          <MuiAlert
            severity={state.error ? "error" : "success"}
            icon={false}
            role="status"
            sx={{ mb: 1, px: "14px", py: "4px" }}
          >
            {state.error ?? state.message}
          </MuiAlert>
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
              {TRIP_COPY.bulkLegend}
            </Typography>
            <Box component="label" htmlFor="bulk-status" sx={VISUALLY_HIDDEN}>
              {TRIP_COPY.colStage}
            </Box>
            <NativeSelect
              id="bulk-status"
              name="toStatus"
              required
              defaultValue=""
              input={<OutlinedInput size="small" />}
              sx={{ minWidth: 0 }}
            >
              <option value="" disabled>
                {TRIP_COPY.colStage}…
              </option>
              {TRIP_STATUS_FILTERS.filter((f) => f.value !== "cancelled").map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="orange" size="sm" disabled={pending}>
              {pending ? TRIP_COPY.bulkWorking : TRIP_COPY.bulkApply}
            </Button>
          </Paper>
        )}
      </form>
    </SelectionContext.Provider>
  );
}
