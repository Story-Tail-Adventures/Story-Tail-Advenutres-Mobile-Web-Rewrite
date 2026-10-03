"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase, { type InputBaseComponentProps } from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  addMonths,
  buildMonth,
  isBetween,
  monthKey,
  moveFocus,
  WEEKDAY_LABELS,
} from "@/lib/public/calendar";
import { addDays, formatDayLong, formatRange, nightsBetween, todayIso } from "@/lib/public/dates";
import { TAP_TARGET } from "@/lib/mui/sx";
import { MAX_BOOKING_DAYS_AHEAD, MAX_STAY_NIGHTS } from "@/lib/public/search";

export interface DateRangePickerProps {
  /** Unique per instance — the pill and the stacked card are both in the DOM (see SearchBar). */
  idPrefix: string;
  label: string;
  placeholder: string;
  /**
   * The server's idea of today, `YYYY-MM-DD`. Used for the pre-hydration native inputs only —
   * see `today` inside the component for why it is not trusted after mount.
   */
  today: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  /**
   * `pill` sits in a hero cell (label above, value below); `compact` is the same control in
   * a single-line row, for the results header; `stacked` is the mobile card row and is the
   * one variant that stays on native date inputs.
   */
  variant: "pill" | "compact" | "stacked";
  copy: DateRangePickerCopy;
}

export interface DateRangePickerCopy {
  open: string;
  close: string;
  prevMonth: string;
  nextMonth: string;
  clear: string;
  done: string;
  pickCheckIn: string;
  pickCheckOut: string;
  keyboardHint: string;
  checkInLabel: string;
  checkOutLabel: string;
  /**
   * Singular and plural as plain strings, NOT a formatter function. This whole object
   * crosses the server/client boundary as a prop, and a function cannot be serialised —
   * React rejects it at render with "Functions cannot be passed directly to Client
   * Components". Unit tests never catch it, because they render the component in-process.
   */
  night: string;
  nights: string;
}

/** 36px cells, the same grid DateField draws. */
const CELL = 36;

/**
 * InputBase types its input slot for <input> and <textarea>; a <button> works at runtime (it
 * has `focus()` and an empty `value`, which is all InputBase asks of it). Same trick as
 * DateField, so the trigger is a real MUI input slot and not a bare <button>.
 */
const BUTTON_INPUT = "button" as unknown as React.ElementType<InputBaseComponentProps>;

/** Off-screen but read aloud — the box MUI's visuallyHidden draws. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** The brand-orange glyph beside a value, as every search cell draws it. */
const GLYPH = { display: "inline-flex", flexShrink: 0, color: "brand.main" } as const;

/** The native date inputs: borderless, 44px tall, in the cell's own type. */
const NATIVE_INPUT = {
  flex: 1,
  minWidth: 0,
  typography: "subtitle2",
  "& .MuiInputBase-input": { height: "auto", minHeight: 44, py: 0, boxSizing: "border-box" },
} as const;

/** False on the server and during hydration, true once the client owns the tree. */
const noopSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function useHydrated(): boolean {
  return React.useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}

/**
 * The Dates control on 2.0.3 (design: the C203 pill cell and the M203 stacked row).
 *
 * NO-JS IS THE BASELINE, NOT A COURTESY. The search form is a plain GET `next/form` that
 * works with scripting off, so this renders a pair of native `<input type="date">` first and
 * only swaps in the calendar once hydrated. That is why `mounted` exists rather than the
 * usual "render the fancy thing and hope": a server-rendered trigger would ship a control
 * nobody could operate until hydration, on the one page that is meant to be reachable by
 * anything.
 *
 * The value always lives on inputs named `in` and `out` — native ones before mount, hidden
 * ones after — so `parseSearchParams` reads the same two params either way.
 *
 * THE PANEL IS AN MUI POPOVER (MUI everywhere, 2026-10-01), the same as DateField. It used
 * to be the native `popover="auto"` API through useDatePopover, chosen because `HeroBleed`
 * puts `overflow: hidden` on a 280px hero and two month grids are taller than that. Popover
 * renders in a portal on document.body, which no ancestor overflow, z-index or transform
 * can clip, and it brings what the hook hand-rolled: anchoring under the trigger and
 * clamping into the viewport, Escape and light-dismiss, a focus trap, and focus RETURNED to
 * the trigger on any close — including the programmatic one after the second date, which
 * the native API got wrong. Tests query it with `screen`, not `container`.
 *
 * THE TRIGGER IS AN INPUTBASE WHOSE INPUT IS A <button>. DateField does the same with an
 * OutlinedInput because it sits beside outlined Field inputs; here the neighbours are the
 * borderless Destination and Travelers cells of the pill, so the trigger is the borderless
 * InputBase and reads as one more cell. The mechanics are identical.
 *
 * ONLY THE PILL (AND THE COMPACT ROW) GET THE CALENDAR. Two months side by side is ~600px;
 * the stacked card is what renders below 768px. So the stacked variant keeps the two native
 * `<input type="date">` permanently — the OS picker beats anything hand-rolled at 360px, the
 * value is ISO whatever the locale displays, and it is the same code path as the no-JS
 * baseline, so there is one thing to get right rather than two.
 */
export function DateRangePicker({
  idPrefix,
  label,
  placeholder,
  today: serverToday,
  defaultCheckIn,
  defaultCheckOut,
  variant,
  copy,
}: DateRangePickerProps) {
  const hydrated = useHydrated();
  // `stacked` is the mobile card, where two months (~600px) do not fit and the OS picker is
  // better anyway — it keeps the native inputs, which are also the no-JS baseline.
  const mounted = hydrated && variant !== "stacked";
  /**
   * `serverToday` is baked in at BUILD time — /explore is statically prerendered, so the
   * value in the HTML is the day the deploy happened and is stale by the next morning. It is
   * fine as the pre-hydration `min` (a soft guard on a native input), but the calendar must
   * not disable real days or offer past ones, so once hydrated we take the browser's day.
   */
  const today = hydrated ? todayIso(Intl.DateTimeFormat().resolvedOptions().timeZone) : serverToday;
  const [checkIn, setCheckIn] = React.useState(defaultCheckIn);
  const [checkOut, setCheckOut] = React.useState(defaultCheckOut);
  /** Set once check-in is picked and check-out is not — drives the hover/next-click phase. */
  const [pendingStart, setPendingStart] = React.useState<string | undefined>(undefined);
  const [focusDay, setFocusDay] = React.useState(defaultCheckIn ?? today);
  const [cursor, setCursor] = React.useState(() => monthKey(defaultCheckIn ?? today));

  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // The grid node as STATE, not a ref: it mounts inside the Popover's portal a render after
  // `open` flips, and an effect has to re-run when it appears.
  const [grid, setGrid] = React.useState<HTMLDivElement | null>(null);

  // Put DOM focus on the roving day. On open, Popover's focus trap has just focused the
  // dialog paper itself; moving on to the day is what makes the arrow keys work at once. As
  // the day moves (arrows) focus follows it, but only while the grid or the paper owns
  // focus, so a month change from the arrows does not yank focus off the arrow button.
  React.useEffect(() => {
    if (!open || !grid) return;
    const active = document.activeElement;
    const paper = grid.closest('[role="dialog"]');
    const parked = !active || active === document.body || active === paper;
    if (!parked && !grid.contains(active)) return;
    grid.querySelector<HTMLElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [grid, open, focusDay, cursor]);

  // Same constant `parseStay` validates against. It was a hardcoded 550 here against a 500
  // there, so the calendar offered 50 days the form would then silently drop.
  const maxDate = React.useMemo(
    () => addDays(today, MAX_BOOKING_DAYS_AHEAD) ?? undefined,
    [today],
  );

  const closePanel = React.useCallback(() => setOpen(false), []);

  function selectDay(iso: string) {
    if (iso < today || (maxDate && iso > maxDate)) return;

    // First click, or a restart: begin a new range. A click on or before the pending start
    // is a restart rather than a backwards range — less surprising than silently swapping.
    if (!pendingStart || iso <= pendingStart) {
      setPendingStart(iso);
      setCheckIn(iso);
      setCheckOut(undefined);
      return;
    }
    const nights = nightsBetween(pendingStart, iso) ?? 0;
    if (nights > MAX_STAY_NIGHTS) {
      // Too long to price. Treat it as the start of a new range rather than refusing the
      // click with no feedback.
      setPendingStart(iso);
      setCheckIn(iso);
      setCheckOut(undefined);
      return;
    }
    setCheckOut(iso);
    setPendingStart(undefined);
    closePanel();
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDay(focusDay);
      return;
    }
    const next = moveFocus(focusDay, event.key);
    if (!next) return;
    event.preventDefault();
    if (next < today) return;
    setFocusDay(next);
    setCursor((current) => {
      const key = monthKey(next);
      // Keep the focused day visible: the popover shows `cursor` and the month after it.
      if (key === current || key === addMonths(current, 1)) return current;
      return key < current ? key : addMonths(key, -1);
    });
  }

  function clear() {
    setCheckIn(undefined);
    setCheckOut(undefined);
    setPendingStart(undefined);
  }

  const rangeText = checkIn && checkOut ? formatRange(checkIn, checkOut, "UTC", today) : "";
  const nights = checkIn && checkOut ? (nightsBetween(checkIn, checkOut) ?? 0) : 0;
  const months = [buildMonth(cursor), buildMonth(addMonths(cursor, 1))];
  const inputId = `${idPrefix}-dates`;
  const panelId = `${idPrefix}-dates-panel`;

  // Pre-hydration (and no-JS forever): two native date inputs, which are accessible,
  // keyboard-operable and understood by every browser.
  if (!mounted) {
    // Two native date inputs. SearchBar already renders the visible "Dates" label for the
    // cell, so these carry visually hidden labels naming the individual controls — which is
    // the honest model anyway: the group is "Dates", the controls are check-in and check-out.
    return (
      // Keyed so React UNMOUNTS this branch on enhancement instead of reconciling it into
      // the one below. Both branches are a Box with inputs, so without a key React reuses
      // the DOM node and an uncontrolled `defaultValue` input becomes a controlled `value`
      // one — which it warns about in the console on every load of /explore.
      <Box key="native" sx={{ display: "flex", minWidth: 0, flex: 1, alignItems: "center", gap: 0.5 }}>
        <Typography component="label" htmlFor={inputId} sx={VISUALLY_HIDDEN}>
          {copy.checkInLabel}
        </Typography>
        <InputBase
          id={inputId}
          type="date"
          name="in"
          defaultValue={defaultCheckIn}
          inputProps={{ min: today, max: maxDate }}
          sx={NATIVE_INPUT}
        />
        <Typography component="span" aria-hidden="true" variant="caption" sx={{ color: "text.secondary" }}>
          –
        </Typography>
        <Typography component="label" htmlFor={`${idPrefix}-dates-out`} sx={VISUALLY_HIDDEN}>
          {copy.checkOutLabel}
        </Typography>
        <InputBase
          id={`${idPrefix}-dates-out`}
          type="date"
          name="out"
          defaultValue={defaultCheckOut}
          inputProps={{
            min: defaultCheckIn ? (addDays(defaultCheckIn, 1) ?? today) : today,
            max: maxDate,
          }}
          sx={NATIVE_INPUT}
        />
      </Box>
    );
  }

  const compact = variant === "compact";

  // Reached only when `mounted`, which implies `pill` or `compact`.
  return (
    <Box key="enhanced" sx={{ position: "relative", minWidth: 0 }}>
      {/* Always present, empty when no range is picked — the same contract as the Destination
          input, which also submits empty. `parseStay` drops an empty or half pair, so an
          undated search is expressed by empty values rather than by absent params. */}
      <input type="hidden" name="in" value={checkIn ?? ""} />
      <input type="hidden" name="out" value={checkOut ?? ""} />

      <InputBase
        id={inputId}
        type="button"
        inputComponent={BUTTON_INPUT}
        inputRef={triggerRef}
        fullWidth
        sx={{
          mt: variant === "pill" ? 0.25 : 0,
          cursor: "pointer",
          lineHeight: 1.2,
          ...(compact
            ? { typography: "body2", fontSize: 13, fontWeight: 500 }
            : { typography: "subtitle2" }),
        }}
        inputProps={{
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": open ? panelId : undefined,
          "aria-label": rangeText ? `${label}: ${rangeText}` : `${label}: ${copy.pickCheckIn}`,
          onClick: () => {
            setCursor(monthKey(checkIn ?? today));
            setFocusDay(checkIn ?? today);
            setOpen(true);
          },
          sx: {
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            height: "auto",
            p: 0,
            textAlign: "left",
            cursor: "pointer",
            font: "inherit",
          },
          children: (
            <>
              <Box component="span" sx={GLYPH}>
                <Icon name="calendar" size={compact ? 12 : 13} />
              </Box>
              <Box
                component="span"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: rangeText ? "text.primary" : "text.secondary",
                }}
              >
                {rangeText || placeholder}
              </Box>
            </>
          ),
        }}
      />

      <Popover
        open={open}
        anchorEl={() => triggerRef.current}
        onClose={closePanel}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            id: panelId,
            role: "dialog",
            "aria-label": label,
            sx: { mt: 1, p: 1.5, maxWidth: "calc(100vw - 16px)" },
          },
        }}
      >
        <Typography component="p" sx={VISUALLY_HIDDEN}>
          {copy.keyboardHint}
        </Typography>

        <Box sx={{ mb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => setCursor(addMonths(cursor, -1))}
            disabled={cursor <= monthKey(today)}
            aria-label={copy.prevMonth}
            sx={TAP_TARGET}
          >
            <Icon name="chevron_left" size={16} />
          </IconButton>
          <Typography
            component="p"
            variant="body2"
            aria-live="polite"
            sx={{ flex: 1, textAlign: "center", fontWeight: 500, color: "text.primary" }}
          >
            {checkIn && checkOut
              ? `${rangeText} · ${nights} ${nights === 1 ? copy.night : copy.nights}`
              : pendingStart
                ? copy.pickCheckOut
                : copy.pickCheckIn}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label={copy.nextMonth}
            sx={TAP_TARGET}
          >
            <Icon name="chevron_right" size={16} />
          </IconButton>
        </Box>

        <Box
          ref={setGrid}
          onKeyDown={onGridKeyDown}
          sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}
        >
          {months.map((month, index) => (
            <Box
              component="table"
              key={month.key}
              role="grid"
              aria-label={month.label}
              sx={{
                borderCollapse: "separate",
                borderSpacing: "2px",
                // The second month is decorative on mobile, where only one fits.
                ...(index === 1 && { display: { xs: "none", md: "table" } }),
              }}
            >
              <Typography
                component="caption"
                variant="subtitle2"
                sx={{ captionSide: "top", textAlign: "left", pb: 0.5, color: "text.primary" }}
              >
                {month.label}
              </Typography>
              <thead>
                <tr>
                  {WEEKDAY_LABELS.map((d) => (
                    <Typography
                      key={d}
                      component="th"
                      scope="col"
                      variant="caption"
                      sx={{ width: CELL, height: CELL, fontWeight: 500, color: "text.secondary" }}
                    >
                      {d}
                    </Typography>
                  ))}
                </tr>
              </thead>
              <tbody>
                {month.weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((day) => {
                      if (!day.inMonth) {
                        return <Box component="td" key={day.iso} sx={{ width: CELL, height: CELL }} />;
                      }
                      const disabled = day.iso < today || (maxDate ? day.iso > maxDate : false);
                      const isStart = day.iso === checkIn;
                      const isEnd = day.iso === checkOut;
                      const selected = isStart || isEnd;
                      const inRange = isBetween(day.iso, checkIn, checkOut);
                      return (
                        // A gridcell, not a nested button: `aria-selected` is only valid on a
                        // gridcell, and the roving tabindex makes the whole month one tab stop.
                        <Box
                          component="td"
                          key={day.iso}
                          role="gridcell"
                          data-iso={day.iso}
                          tabIndex={day.iso === focusDay ? 0 : -1}
                          aria-selected={selected}
                          aria-disabled={disabled || undefined}
                          aria-current={day.iso === today ? "date" : undefined}
                          aria-label={formatDayLong(day.iso)}
                          onClick={() => !disabled && selectDay(day.iso)}
                          onFocus={() => setFocusDay(day.iso)}
                          sx={{
                            width: CELL,
                            height: CELL,
                            borderRadius: "50%",
                            textAlign: "center",
                            verticalAlign: "middle",
                            typography: "body2",
                            cursor: disabled ? "not-allowed" : "pointer",
                            color: disabled ? "text.disabled" : "text.primary",
                            ...(inRange && { bgcolor: "secondary.container", color: "secondary.onContainer" }),
                            ...(selected && { bgcolor: "primary.main", color: "primary.contrastText" }),
                            ...(!disabled && !selected && !inRange && { "&:hover": { bgcolor: "action.hover" } }),
                            "&:focus-visible": {
                              outline: "2px solid",
                              outlineColor: "primary.main",
                              outlineOffset: "2px",
                            },
                          }}
                        >
                          {day.day}
                        </Box>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            mt: 1,
            pt: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 1,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Button variant="text" size="sm" onClick={clear}>
            {copy.clear}
          </Button>
          <Button variant="tonal" size="sm" onClick={closePanel}>
            {copy.done}
          </Button>
        </Box>
      </Popover>
    </Box>
  );
}
