"use client";

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { addMonths, buildMonth, monthKey, moveFocus, WEEKDAY_LABELS } from "@/lib/public/calendar";
import { formatDayLong, parseIsoDate } from "@/lib/public/dates";
import { useDatePopover, usePopoverSupported } from "./useDatePopover";

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
 * The popover mechanics are shared (`useDatePopover`) precisely because that is the part
 * that would otherwise drift between the two.
 *
 * NO-JS IS THE BASELINE. Before hydration — and forever, where the Popover API is missing —
 * this is a native `<input type="date">` carrying the same `name`, so the form submits
 * identically either way and nothing depends on the calendar existing.
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

export function DateField(props: DateFieldProps) {
  const { id, name, label, min, max, hint, error, required, autoComplete, describedBy } = props;

  const supported = usePopoverSupported();
  const { open, triggerRef, panelRef, close } = useDatePopover(supported);

  const controlled = props.value !== undefined;
  const [internal, setInternal] = React.useState(props.defaultValue ?? "");
  const value = controlled ? (props.value ?? "") : internal;

  const setValue = React.useCallback((next: string) => {
    if (!controlled) setInternal(next);
    props.onChange?.(next);
  }, [controlled, props]);

  const [cursor, setCursor] = React.useState(() => monthKey(value || max || todayish()));
  const [focusDay, setFocusDay] = React.useState(value || max || todayish());
  const gridRef = React.useRef<HTMLTableElement>(null);

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const panelId = `${id}-panel`;
  const described = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Move DOM focus to the roving cell, but only while the grid already owns focus —
  // otherwise opening the panel would steal it from the trigger.
  React.useEffect(() => {
    if (!open) return;
    const grid = gridRef.current;
    if (!grid || !grid.contains(document.activeElement)) return;
    grid.querySelector<HTMLElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [focusDay, open, cursor]);

  const disabled = React.useCallback(
    (iso: string) => Boolean((min && iso < min) || (max && iso > max)),
    [min, max],
  );

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
  if (!supported) {
    return (
      <div>
        <label className="field-label" htmlFor={id}>{label}</label>
        <input
          id={id}
          name={name}
          type="date"
          className={cn("input", error && "border-error")}
          defaultValue={controlled ? undefined : props.defaultValue}
          value={controlled ? props.value : undefined}
          onChange={controlled ? (e) => props.onChange?.(e.target.value) : undefined}
          min={min}
          max={max}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
        />
        {hint && <p id={hintId} className="t-body-s mt-1.5 text-on-surface-variant">{hint}</p>}
        {error && <p id={errorId} className="t-body-s mt-1.5 text-error">{error}</p>}
      </div>
    );
  }

  const month = buildMonth(cursor);
  const years = yearRange(min, max);

  return (
    <div className="relative">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={value} />

      <button
        ref={triggerRef}
        type="button"
        id={id}
        popoverTarget={panelId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        // No `aria-invalid`: it is not supported on a button. The error reaches a screen
        // reader through `aria-describedby` below, which points at the error paragraph.
        aria-describedby={described}
        onClick={() => {
          const anchor = value || max || todayish();
          setCursor(monthKey(anchor));
          setFocusDay(anchor);
        }}
        className={cn("input flex items-center gap-2 text-left", error && "border-error")}
      >
        <Icon name="calendar" size={14} className="shrink-0 text-brand-orange" />
        <span className={cn("truncate", value ? "text-on-surface" : "text-on-surface-variant")}>
          {value ? formatDayLong(value) : label}
        </span>
      </button>

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="card fixed z-50 m-0 w-max max-w-[calc(100vw-1rem)] p-3 shadow-3"
      >
        <p className="sr-only">{KEYBOARD_HINT}</p>

        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, -1))}
            aria-label={PREV_LABEL}
            className="btn-icon tap-44 size-8 shrink-0 rounded-full text-on-surface"
          >
            <Icon name="chevron_left" size={16} />
          </button>

          {/* Selects, not just arrows — see the header comment. */}
          <label className="sr-only" htmlFor={`${id}-month`}>Month</label>
          <select
            id={`${id}-month`}
            value={month.month}
            onChange={(e) => setCursor(`${month.year}-${String(Number(e.target.value)).padStart(2, "0")}`)}
            className="input t-filter h-9 min-w-0 flex-1 px-2"
          >
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>

          <label className="sr-only" htmlFor={`${id}-year`}>Year</label>
          <select
            id={`${id}-year`}
            value={month.year}
            onChange={(e) => setCursor(`${e.target.value}-${String(month.month).padStart(2, "0")}`)}
            className="input t-filter h-9 w-22 px-2"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label={NEXT_LABEL}
            className="btn-icon tap-44 size-8 shrink-0 rounded-full text-on-surface"
          >
            <Icon name="chevron_right" size={16} />
          </button>
        </div>

        <table
          ref={gridRef}
          role="grid"
          aria-label={month.label}
          onKeyDown={onGridKeyDown}
          className="border-separate border-spacing-0.5"
        >
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((d) => (
                <th key={d} scope="col" className="t-label size-9 font-medium text-on-surface-variant">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {month.weeks.map((week, w) => (
              <tr key={w}>
                {week.map((day) => {
                  if (!day.inMonth) return <td key={day.iso} className="size-9" />;
                  const off = disabled(day.iso);
                  const selected = day.iso === value;
                  return (
                    <td
                      key={day.iso}
                      role="gridcell"
                      data-iso={day.iso}
                      tabIndex={day.iso === focusDay ? 0 : -1}
                      aria-selected={selected}
                      aria-disabled={off || undefined}
                      aria-label={formatDayLong(day.iso)}
                      onClick={() => pick(day.iso)}
                      onFocus={() => setFocusDay(day.iso)}
                      className={cn(
                        "t-body-s size-9 cursor-pointer rounded-full text-center align-middle text-on-surface",
                        off && "cursor-not-allowed text-on-surface-variant opacity-35",
                        !off && "hover:bg-surface-3",
                        selected && "bg-primary text-on-primary",
                      )}
                    >
                      {day.day}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-outline-variant pt-2">
          <button
            type="button"
            onClick={() => { setValue(""); close(); }}
            className="btn btn-text btn-sm"
          >
            {CLEAR_LABEL}
          </button>
        </div>
      </div>

      {hint && <p id={hintId} className="t-body-s mt-1.5 text-on-surface-variant">{hint}</p>}
      {error && <p id={errorId} className="t-body-s mt-1.5 text-error">{error}</p>}
    </div>
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
