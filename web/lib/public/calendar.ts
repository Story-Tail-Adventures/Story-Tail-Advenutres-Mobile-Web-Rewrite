/**
 * Month-grid arithmetic for the date-range picker. Pure, so the keyboard model and the
 * month layout are unit-testable without rendering anything.
 *
 * Weeks start on Sunday, matching the US convention the rest of the public surface uses.
 */
import { addDays, parseIsoDate, toIsoDate } from "./dates";

export interface CalendarDay {
  iso: string;
  day: number;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
}

export interface CalendarMonth {
  /** `YYYY-MM`, the key a caller pages through. */
  key: string;
  label: string;
  year: number;
  /** 1–12. */
  month: number;
  /** Whole weeks, Sunday first — always 6 rows, so the popover does not resize as you page. */
  weeks: CalendarDay[][];
}

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** `YYYY-MM` for the month an ISO date falls in. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** `YYYY-MM` shifted by `delta` months, clamped to a real month. */
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function buildMonth(key: string): CalendarMonth {
  const [year, month] = key.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const leading = first.getUTCDay();

  const cells: CalendarDay[] = [];
  // Six rows of seven, always: a month starting on Saturday with 31 days needs 6, and a
  // grid that changes height as you page makes the popover jump under the cursor.
  for (let i = 0; i < 42; i += 1) {
    const offset = i - leading;
    const date = new Date(first.getTime());
    date.setUTCDate(1 + offset);
    const iso = toIsoDate(date);
    cells.push({ iso, day: date.getUTCDate(), inMonth: offset >= 0 && offset < daysInMonth });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    key,
    label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(first),
    year,
    month,
    weeks,
  };
}

/** Where a keypress moves the focused day. Returns the new ISO date, or null for no-op. */
export function moveFocus(iso: string, key: string): string | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(iso, -1);
    case "ArrowRight":
      return addDays(iso, 1);
    case "ArrowUp":
      return addDays(iso, -7);
    case "ArrowDown":
      return addDays(iso, 7);
    case "Home": {
      const date = parseIsoDate(iso);
      return date ? addDays(iso, -date.getUTCDay()) : null;
    }
    case "End": {
      const date = parseIsoDate(iso);
      return date ? addDays(iso, 6 - date.getUTCDay()) : null;
    }
    case "PageUp":
      return shiftMonth(iso, -1);
    case "PageDown":
      return shiftMonth(iso, 1);
    default:
      return null;
  }
}

/**
 * Same day-of-month one month away, clamped to the last day when it does not exist.
 * PageDown from 31 January lands on 28 February rather than rolling into March.
 */
function shiftMonth(iso: string, delta: number): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(target);
}

/** True when `iso` sits strictly inside the selected range (for the connecting highlight). */
export function isBetween(iso: string, start?: string, end?: string): boolean {
  return Boolean(start && end && iso > start && iso < end);
}
