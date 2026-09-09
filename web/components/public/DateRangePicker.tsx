"use client";

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  addMonths,
  buildMonth,
  isBetween,
  monthKey,
  moveFocus,
  WEEKDAY_LABELS,
} from "@/lib/public/calendar";
import { addDays, formatDayLong, formatRange, nightsBetween, todayIso } from "@/lib/public/dates";
import { MAX_STAY_NIGHTS } from "@/lib/public/search";

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

/**
 * Client capability as an external store, so React reads it through useSyncExternalStore
 * with an explicit server snapshot rather than flipping state in an effect. Same reasoning
 * as DismissibleBanner: the server snapshot is the honest "we cannot know yet" value, and
 * the enhanced calendar is strictly an upgrade over the native inputs it replaces.
 *
 * It never changes after load, so `subscribe` has nothing to listen to.
 */
const noopSubscribe = () => () => {};
const clientSnapshot = () => typeof HTMLElement.prototype.showPopover === "function";
const serverSnapshot = () => false;

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

/**
 * The Dates control on 2.0.3 (design: the C203 pill cell and the M203 stacked row).
 *
 * NO-JS IS THE BASELINE, NOT A COURTESY. The search form is a plain GET `next/form` that
 * works with scripting off, so this renders a pair of native `<input type="date">` first and
 * only swaps in the calendar once mounted. That is why `mounted` exists rather than the
 * usual "render the fancy thing and hope": a server-rendered popover would ship a control
 * nobody could operate until hydration, on the one page that is meant to be reachable by
 * anything.
 *
 * The value always lives on inputs named `in` and `out` — native ones before mount, hidden
 * ones after — so `parseSearchParams` reads the same two params either way.
 *
 * WHY `popover="auto"` AND NOT AN ABSOLUTELY-POSITIONED DIV. `HeroBleed` puts
 * `overflow-hidden` on the hero section and `.hero-compact` is 280px tall from md, while two
 * month grids are ~340px. An absolutely-positioned panel anchored under the pill is therefore
 * CLIPPED BY ITS OWN HERO — not a risk, the default outcome. The popover API promotes the
 * element to the top layer, which no ancestor `overflow`, `z-index` or transform can reach,
 * and it brings Escape, light-dismiss and focus-return for free. It also means we never have
 * to reason about the z-index inventory (top bar 40, sticky CTA 40, sort menu 20).
 *
 * ONLY THE PILL GETS THE CALENDAR. Two months side by side is ~600px; the stacked card is
 * what renders below 768px. So the stacked variant keeps the two native `<input type="date">`
 * permanently — the OS picker beats anything hand-rolled at 360px, the value is ISO whatever
 * the locale displays, and it is the same code path as the no-JS baseline, so there is one
 * thing to get right rather than two.
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
  const popoverSupported = React.useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  // `stacked` is the mobile card, where two months (~600px) do not fit and the OS picker is
  // better anyway — it keeps the native inputs, which are also the no-JS baseline.
  const mounted = popoverSupported && variant !== "stacked";
  /**
   * `serverToday` is baked in at BUILD time — /explore is statically prerendered, so the
   * value in the HTML is the day the deploy happened and is stale by the next morning. It is
   * fine as the pre-hydration `min` (a soft guard on a native input), but the calendar must
   * not disable real days or offer past ones, so once mounted we take the browser's day.
   */
  const today = popoverSupported ? todayIso(Intl.DateTimeFormat().resolvedOptions().timeZone) : serverToday;
  const [open, setOpen] = React.useState(false);
  const [checkIn, setCheckIn] = React.useState(defaultCheckIn);
  const [checkOut, setCheckOut] = React.useState(defaultCheckOut);
  /** Set once check-in is picked and check-out is not — drives the hover/next-click phase. */
  const [pendingStart, setPendingStart] = React.useState<string | undefined>(undefined);
  const [focusDay, setFocusDay] = React.useState(defaultCheckIn ?? today);
  const [cursor, setCursor] = React.useState(() => monthKey(defaultCheckIn ?? today));

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  // Anchor under the trigger, clamped into the viewport. At 768px the gutters leave 704px and
  // the panel is ~600px, so a cell starting mid-row would otherwise overflow to the right.
  const position = React.useCallback(() => {
    const trigger = triggerRef.current;
    const panel = popoverRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    panel.style.left = `${left}px`;
    // Flip above the trigger when there is not room below it.
    const below = window.innerHeight - rect.bottom;
    const height = panel.offsetHeight;
    panel.style.top = below < height + 16 && rect.top > height + 16
      ? `${rect.top - height - 8}px`
      : `${rect.bottom + 8}px`;
  }, []);

  // The popover API owns dismissal — Escape and outside-click are built in, and it restores
  // focus to the invoker itself. All we do is mirror its state so `aria-expanded` is honest,
  // and position it, since anchor positioning is not portable yet.
  React.useEffect(() => {
    const panel = popoverRef.current;
    if (!panel) return;
    const onToggle = (event: Event) => {
      const next = (event as ToggleEvent).newState === "open";
      setOpen(next);
      if (next) position();
    };
    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, [mounted, position]);

  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => popoverRef.current?.hidePopover();
    window.addEventListener("resize", position);
    // Capture, because the scroller is an ancestor rather than the window on some layouts.
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, position]);

  // Move DOM focus to the day the roving tabindex points at, but only while the grid already
  // owns focus — otherwise opening the popover would steal it from the trigger.
  React.useEffect(() => {
    if (!open) return;
    const grid = gridRef.current;
    if (!grid || !grid.contains(document.activeElement)) return;
    grid.querySelector<HTMLElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [focusDay, open, cursor]);

  const maxDate = React.useMemo(() => addDays(today, 550) ?? undefined, [today]);

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

  /**
   * The popover API returns focus to the invoker on light-dismiss and Escape, but not on a
   * programmatic `hidePopover()` — that would leave focus on a now-hidden node, which for a
   * keyboard user means focus falls back to <body> and their place in the form is lost.
   */
  function closePanel() {
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
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
    // cell, so these carry sr-only labels naming the individual controls — which is the
    // honest model anyway: the group is "Dates", the controls are check-in and check-out.
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <label htmlFor={inputId} className="sr-only">
          {copy.checkInLabel}
        </label>
        <input
          id={inputId}
          type="date"
          name="in"
          defaultValue={defaultCheckIn}
          min={today}
          max={maxDate}
          className="t-title-s min-h-11 min-w-0 flex-1 bg-transparent text-on-surface"
        />
        <span aria-hidden="true" className="t-body-s text-on-surface-variant">
          –
        </span>
        <label htmlFor={`${idPrefix}-dates-out`} className="sr-only">
          {copy.checkOutLabel}
        </label>
        <input
          id={`${idPrefix}-dates-out`}
          type="date"
          name="out"
          defaultValue={defaultCheckOut}
          min={defaultCheckIn ? (addDays(defaultCheckIn, 1) ?? today) : today}
          max={maxDate}
          className="t-title-s min-h-11 min-w-0 flex-1 bg-transparent text-on-surface"
        />
      </div>
    );
  }

  // Reached only when `mounted`, which implies variant === "pill".
  return (
    <div className="relative min-w-0">
      {/* Always present, empty when no range is picked — the same contract as the Destination
          input, which also submits empty. `parseStay` drops an empty or half pair, so an
          undated search is expressed by empty values rather than by absent params. */}
      <input type="hidden" name="in" value={checkIn ?? ""} />
      <input type="hidden" name="out" value={checkOut ?? ""} />

      <button
        ref={triggerRef}
        type="button"
        id={inputId}
        popoverTarget={panelId}
        onClick={() => {
          setCursor(monthKey(checkIn ?? today));
          setFocusDay(checkIn ?? today);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={rangeText ? `${label}: ${rangeText}` : `${label}: ${copy.pickCheckIn}`}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-sm bg-transparent text-left",
          variant === "pill" && "mt-0.5",
        )}
      >
        <Icon
          name="calendar"
          size={variant === "compact" ? 12 : 13}
          className="shrink-0 text-brand-orange"
        />
        <span
          className={cn(
            "truncate",
            variant === "compact" ? "t-label-l" : "t-title-s",
            rangeText ? "text-on-surface" : "text-on-surface-variant",
          )}
        >
          {rangeText || placeholder}
        </span>
      </button>

      {/* Always in the DOM, shown by the popover API. Conditionally RENDERING it would
          unmount the grid on every close and lose the roving-focus position. */}
      <div
        ref={popoverRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="card fixed z-50 m-0 w-max max-w-[calc(100vw-1rem)] p-3 shadow-3"
      >
        <p className="sr-only">{copy.keyboardHint}</p>
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, -1))}
              disabled={cursor <= monthKey(today)}
              aria-label={copy.prevMonth}
              className="btn-icon tap-44 size-8 rounded-full text-on-surface disabled:opacity-40"
            >
              <Icon name="chevron_left" size={16} />
            </button>
            <p aria-live="polite" className="t-label-l flex-1 text-center text-on-surface">
              {checkIn && checkOut
                ? `${rangeText} · ${nights} ${nights === 1 ? copy.night : copy.nights}`
                : pendingStart
                  ? copy.pickCheckOut
                  : copy.pickCheckIn}
            </p>
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label={copy.nextMonth}
              className="btn-icon tap-44 size-8 rounded-full text-on-surface"
            >
              <Icon name="chevron_right" size={16} />
            </button>
          </div>

          <div ref={gridRef} onKeyDown={onGridKeyDown} className="flex gap-4 max-md:flex-col">
            {months.map((month, index) => (
              <table
                key={month.key}
                role="grid"
                aria-label={month.label}
                // The second month is decorative on mobile, where only one fits.
                className={cn("border-separate border-spacing-0.5", index === 1 && "hidden md:table")}
              >
                <caption className="t-title-s pb-1 text-on-surface">{month.label}</caption>
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
                        const disabled = day.iso < today || (maxDate ? day.iso > maxDate : false);
                        const isStart = day.iso === checkIn;
                        const isEnd = day.iso === checkOut;
                        const inRange = isBetween(day.iso, checkIn, checkOut);
                        return (
                          // A gridcell, not a nested button: `aria-selected` is only valid
                          // on a gridcell, and the roving tabindex makes the whole month one
                          // tab stop. public.css's focus rule already covers `[tabindex]`,
                          // so the brand focus ring comes for free.
                          <td
                            key={day.iso}
                            role="gridcell"
                            data-iso={day.iso}
                            tabIndex={day.iso === focusDay ? 0 : -1}
                            aria-selected={isStart || isEnd}
                            aria-disabled={disabled || undefined}
                            aria-current={day.iso === today ? "date" : undefined}
                            aria-label={formatDayLong(day.iso)}
                            onClick={() => !disabled && selectDay(day.iso)}
                            onFocus={() => setFocusDay(day.iso)}
                            className={cn(
                              "t-body-s size-9 cursor-pointer rounded-full text-center align-middle text-on-surface",
                              disabled && "cursor-not-allowed text-on-surface-variant opacity-35",
                              !disabled && "hover:bg-surface-3",
                              inRange && "bg-secondary-container text-on-secondary-container",
                              (isStart || isEnd) && "bg-primary text-on-primary",
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
            ))}
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-outline-variant pt-2">
            <button type="button" onClick={clear} className="btn btn-text btn-sm">
              {copy.clear}
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="btn btn-tonal btn-sm"
            >
              {copy.done}
            </button>
          </div>
        </>
      </div>
    </div>
  );
}
