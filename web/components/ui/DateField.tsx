"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import IconButton from "@mui/material/IconButton";
import NativeSelect from "@mui/material/NativeSelect";
import type { InputBaseComponentProps } from "@mui/material/InputBase";
import OutlinedInput from "@mui/material/OutlinedInput";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { addMonths, buildMonth, monthKey, moveFocus, WEEKDAY_LABELS } from "@/lib/public/calendar";
import { formatDayLong, parseIsoDate } from "@/lib/public/dates";
import { fieldInputSx, fieldLabelSx } from "./Field";

/**
 * A single-date field with the same calendar as the public search bar.
 *
 * WHY THIS IS NOT JUST `DateRangePicker` WITH ONE DATE. Two differences that matter more
 * than the shared chrome:
 *
 *   * A range picker on /explore disables everything before today, because you cannot book
 *     a stay in the past. This field is used for a DATE OF BIRTH and a PASSPORT EXPIRY —
 *     one is decades back and the other years forward — so the bound is an explicit
 *     min/max, not "today".
 *   * Paging month by month is fine for a trip eight weeks out and unusable for a birthday
 *     forty years back. So the header carries month and year SELECTS rather than only
 *     arrows: any date in the allowed span is two clicks away, and the keyboard still has
 *     PageUp/PageDown for months and Shift+PageUp/PageDown for years.
 *
 * THE PANEL IS AN MUI POPOVER (MUI everywhere, 2026-10-01), where DateRangePicker still uses
 * the native Popover API through useDatePopover. Popover brings what that hook hand-rolled:
 * anchoring under the trigger and clamping into the viewport, Escape and light-dismiss, a
 * focus trap, and focus RETURNED to the trigger on any close — including a programmatic one,
 * which is the case the native API got wrong. It renders in a portal on document.body, so
 * tests query it with `screen`, not `container`.
 *
 * THE TRIGGER IS AN OUTLINEDINPUT WHOSE INPUT IS A <button>. It sits beside real Field inputs
 * on the same form and has to look like one of them: same outline, hover, focus and error
 * states, same 44px box — and the only way to get exactly those is to BE one. InputBase
 * tolerates a button as its input component (no value, no dirty state), and `inputProps`
 * carries the disclosure wiring onto it.
 *
 * NO-JS IS THE BASELINE. Before hydration — and forever, with JavaScript off — this is a
 * native `<input type="date">` carrying the same `name`, so the form submits identically
 * either way and nothing depends on the calendar existing.
 */

export interface DateFieldProps {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  /** `YYYY-MM-DD` bounds. Both optional; the calendar disables outside them. */
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  describedBy?: string;
  /** Controlled use — the passport field on 2.1.11 watches its own value for the expiry warning. */
  value?: string;
  onChange?: (value: string) => void;
}

const CLEAR_LABEL = "Clear";
const PREV_LABEL = "Previous month";
const NEXT_LABEL = "Next month";
const KEYBOARD_HINT = "Arrow keys move by day. Enter chooses a date. Escape closes the calendar.";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 36px cells, as the search bar's calendar draws them. */
const CELL = 36;

/**
 * InputBase types its input slot for <input> and <textarea>; a <button> works at runtime (it
 * has `focus()` and an empty `value`, which is all InputBase asks of it). See the header.
 */
const BUTTON_INPUT = "button" as unknown as React.ElementType<InputBaseComponentProps>;

/** False on the server and during hydration, true once the client owns the tree. */
const noopSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function useHydrated(): boolean {
  return React.useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}

export function DateField(props: DateFieldProps) {
  const { id, name, label, min, max, hint, error, required, autoComplete, describedBy } = props;

  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const controlled = props.value !== undefined;
  const [internal, setInternal] = React.useState(props.defaultValue ?? "");
  const value = controlled ? (props.value ?? "") : internal;

  const onChangeProp = props.onChange;
  const setValue = React.useCallback((next: string) => {
    if (!controlled) setInternal(next);
    onChangeProp?.(next);
  }, [controlled, onChangeProp]);

  const [cursor, setCursor] = React.useState(() => monthKey(value || max || todayish()));
  const [focusDay, setFocusDay] = React.useState(value || max || todayish());
  // The grid node as STATE, not a ref: it mounts inside the Popover's portal a render after
  // `open` flips, and an effect has to re-run when it appears.
  const [grid, setGrid] = React.useState<HTMLTableElement | null>(null);

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const panelId = `${id}-panel`;
  const described = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Put DOM focus on the roving day. On open, Popover's focus trap has just focused the
  // dialog paper itself; moving on to the day is what makes the arrow keys work at once. As
  // the day moves (arrows, PageUp/Down) focus follows it — but only while the grid or the
  // paper owns focus, so a month change from the selects does not yank focus off the select.
  React.useEffect(() => {
    if (!open || !grid) return;
    const active = document.activeElement;
    const paper = grid.closest('[role="dialog"]');
    const parked = !active || active === document.body || active === paper;
    if (!parked && !grid.contains(active)) return;
    grid.querySelector<HTMLElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [grid, open, focusDay, cursor]);

  const disabled = React.useCallback(
    (iso: string) => Boolean((min && iso < min) || (max && iso > max)),
    [min, max],
  );

  const close = React.useCallback(() => setOpen(false), []);

  function pick(iso: string) {
    if (disabled(iso)) return;
    setValue(iso);
    close();
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(focusDay);
      return;
    }
    // Shift turns the month keys into year keys, which is what makes a birth year reachable
    // from the keyboard without forty PageUps.
    const next = event.shiftKey && (event.key === "PageUp" || event.key === "PageDown")
      ? shiftYear(focusDay, event.key === "PageUp" ? -1 : 1)
      : moveFocus(focusDay, event.key);
    if (!next) return;
    event.preventDefault();
    setFocusDay(next);
    setCursor(monthKey(next));
  }

  // Pre-hydration and no-JS: the native control, same name, same value.
  if (!hydrated) {
    return (
      <FormControl fullWidth error={Boolean(error)}>
        <FormLabel htmlFor={id} sx={fieldLabelSx}>{label}</FormLabel>
        <OutlinedInput
          id={id}
          name={name}
          type="date"
          size="small"
          sx={fieldInputSx}
          defaultValue={controlled ? undefined : props.defaultValue}
          value={controlled ? props.value : undefined}
          onChange={controlled ? (e) => props.onChange?.(e.target.value) : undefined}
          required={required}
          autoComplete={autoComplete}
          inputProps={{
            min,
            max,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": described,
          }}
        />
        {hint && <FormHelperText id={hintId}>{hint}</FormHelperText>}
        {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
      </FormControl>
    );
  }

  const month = buildMonth(cursor);
  const years = yearRange(min, max);

  return (
    <>
      <FormControl fullWidth error={Boolean(error)}>
        <FormLabel htmlFor={id} sx={fieldLabelSx}>{label}</FormLabel>
        <input type="hidden" name={name} value={value} />

        <OutlinedInput
          id={id}
          size="small"
          type="button"
          inputComponent={BUTTON_INPUT}
          inputRef={triggerRef}
          sx={fieldInputSx}
          inputProps={{
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            "aria-controls": open ? panelId : undefined,
            // No `aria-invalid`: it is not supported on a button, and InputBase would write
            // "false" otherwise. The error reaches a screen reader through `aria-describedby`,
            // which points at the error paragraph; the red outline comes from FormControl.
            "aria-invalid": undefined,
            "aria-describedby": described,
            onClick: () => {
              const anchor = value || max || todayish();
              setCursor(monthKey(anchor));
              setFocusDay(anchor);
              setOpen(true);
            },
            sx: { display: "flex", alignItems: "center", gap: 1, textAlign: "left", cursor: "pointer" },
            children: (
              <>
                <Box sx={{ display: "inline-flex", flexShrink: 0, color: "brand.main" }}>
                  <Icon name="calendar" size={14} />
                </Box>
                <Box
                  component="span"
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: value ? "text.primary" : "text.secondary",
                  }}
                >
                  {value ? formatDayLong(value) : label}
                </Box>
              </>
            ),
          }}
        />

        {hint && <FormHelperText id={hintId}>{hint}</FormHelperText>}
        {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
      </FormControl>

      {/* A sibling of the FormControl, not a child: FormControl context crosses portals, and it
          would mark the month/year selects as this field's inputs (error outline, focus state). */}
      <Popover
        open={open}
        anchorEl={() => triggerRef.current}
        onClose={close}
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
        <p className="sr-only">{KEYBOARD_HINT}</p>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
          <IconButton
            size="small"
            aria-label={PREV_LABEL}
            className="tap-44"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <Icon name="chevron_left" size={16} />
          </IconButton>

          {/* Selects, not just arrows — see the header comment. */}
          <NativeSelect
            value={month.month}
            onChange={(e) => setCursor(`${month.year}-${String(Number(e.target.value)).padStart(2, "0")}`)}
            input={<OutlinedInput size="small" />}
            inputProps={{ id: `${id}-month`, "aria-label": "Month" }}
            sx={{ flex: 1, minWidth: 0 }}
          >
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </NativeSelect>

          <NativeSelect
            value={month.year}
            onChange={(e) => setCursor(`${e.target.value}-${String(month.month).padStart(2, "0")}`)}
            input={<OutlinedInput size="small" />}
            inputProps={{ id: `${id}-year`, "aria-label": "Year" }}
            sx={{ width: 96 }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>

          <IconButton
            size="small"
            aria-label={NEXT_LABEL}
            className="tap-44"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <Icon name="chevron_right" size={16} />
          </IconButton>
        </Box>

        <Box
          component="table"
          ref={setGrid}
          role="grid"
          aria-label={month.label}
          onKeyDown={onGridKeyDown}
          sx={{ borderCollapse: "separate", borderSpacing: "2px" }}
        >
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
                  const off = disabled(day.iso);
                  const selected = day.iso === value;
                  return (
                    <Box
                      component="td"
                      key={day.iso}
                      role="gridcell"
                      data-iso={day.iso}
                      tabIndex={day.iso === focusDay ? 0 : -1}
                      aria-selected={selected}
                      aria-disabled={off || undefined}
                      aria-label={formatDayLong(day.iso)}
                      onClick={() => pick(day.iso)}
                      onFocus={() => setFocusDay(day.iso)}
                      sx={{
                        width: CELL,
                        height: CELL,
                        borderRadius: "50%",
                        textAlign: "center",
                        verticalAlign: "middle",
                        typography: "body2",
                        cursor: off ? "not-allowed" : "pointer",
                        color: off ? "text.disabled" : "text.primary",
                        ...(selected && { bgcolor: "primary.main", color: "primary.contrastText" }),
                        ...(!off && !selected && { "&:hover": { bgcolor: "action.hover" } }),
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

        <Box
          sx={{
            mt: 1,
            pt: 1,
            display: "flex",
            justifyContent: "flex-end",
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Button variant="text" size="small" onClick={() => { setValue(""); close(); }}>
            {CLEAR_LABEL}
          </Button>
        </Box>
      </Popover>
    </>
  );
}

/** A date to anchor on when there is no value and no max. Never used as a bound. */
function todayish(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftYear(iso: string, delta: number): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const year = date.getUTCFullYear() + delta;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The years the selector offers.
 *
 * Bounded by min/max when given. Without them it spans a lifetime back and a decade forward,
 * which covers both fields this component exists for without either one needing to say so.
 */
function yearRange(min?: string, max?: string): number[] {
  const now = new Date().getUTCFullYear();
  const first = min ? Number(min.slice(0, 4)) : now - 110;
  const last = max ? Number(max.slice(0, 4)) : now + 10;
  const out: number[] = [];
  for (let y = last; y >= first; y -= 1) out.push(y);
  return out;
}
