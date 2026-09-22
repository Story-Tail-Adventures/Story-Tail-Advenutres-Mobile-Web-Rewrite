/**
 * Month arithmetic for Screen 3.2.3.
 *
 * ITS OWN MODULE BECAUSE THE PROTOTYPE'S GRID IS FAKE.
 * `agent-dashboard.jsx` builds the month as
 * `Array.from({ length: 35 }, (_, i) => i - 3)` — a hardcoded three-day leading offset and
 * exactly 35 cells — and maps `events[dayNum]` to ONE event per day. Real months need the
 * right offset for the month in question, 28 to 31 days, six rows when a 31-day month starts
 * on a Friday or Saturday, and several events on one date: a departure and a payment falling
 * together is routine, not an edge case.
 *
 * Pure and date-injected. A screen whose output depends on an ambient clock cannot be tested,
 * which is the rule §2.2 set for `greeting()` and the same one that applies here — `today`
 * comes from `agent_kpis().as_of_date`, already computed in the agent's own time zone.
 *
 * All dates are ISO `YYYY-MM-DD` strings, never `Date` objects: these cross into a server
 * component's output and everything there must be plain data.
 */

export type CalendarEventKind = "departure" | "return" | "payment" | "availability";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  date: string;
  label: string;
  detail: string | null;
  /** Null while the destination is unbuilt. Never a link to a 404. */
  href: string | null;
};

export type CalendarDay = {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
};

export type CalendarMonth = {
  /** `YYYY-MM`. */
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  weeks: CalendarDay[][];
  /** Every event in the month, flat and sorted. Powers the agenda view. */
  agenda: CalendarEvent[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a month, leap years included. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** 0 = Sunday. The weekday the 1st falls on. */
export function firstWeekday(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
}

function iso(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/**
 * Build the grid.
 *
 * Six rows only when the month needs them — a 31-day month starting on Friday or Saturday,
 * or a 30-day month starting on Saturday. Padding to a fixed 35 (the prototype) silently
 * drops the last days of those months; padding always to 42 leaves an empty trailing row on
 * most months.
 */
export function buildMonth(
  month: string,
  today: string,
  events: CalendarEvent[],
): CalendarMonth {
  const [year, month1] = month.split("-").map(Number);
  const total = daysInMonth(year, month1);
  const lead = firstWeekday(year, month1);
  const cells = Math.ceil((lead + total) / 7) * 7;

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const [py, pm] = prevMonth.split("-").map(Number);
  const prevTotal = daysInMonth(py, pm);

  const days: CalendarDay[] = [];
  for (let i = 0; i < cells; i++) {
    const offset = i - lead;
    let date: string;
    let dayOfMonth: number;
    let inMonth = true;

    if (offset < 0) {
      dayOfMonth = prevTotal + offset + 1;
      date = iso(py, pm, dayOfMonth);
      inMonth = false;
    } else if (offset >= total) {
      const [ny, nm] = nextMonth.split("-").map(Number);
      dayOfMonth = offset - total + 1;
      date = iso(ny, nm, dayOfMonth);
      inMonth = false;
    } else {
      dayOfMonth = offset + 1;
      date = iso(year, month1, dayOfMonth);
    }

    days.push({
      date,
      dayOfMonth,
      inMonth,
      isToday: date === today,
      events: byDate.get(date) ?? [],
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const agenda = events
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : a.date.localeCompare(b.date)));

  return {
    month,
    monthLabel: `${MONTH_NAMES[month1 - 1]} ${year}`,
    prevMonth,
    nextMonth,
    weeks,
    agenda,
  };
}
