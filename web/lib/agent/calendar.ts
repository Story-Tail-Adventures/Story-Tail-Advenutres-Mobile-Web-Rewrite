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
 * The navigable window: 2000-01 through 2100-12.
 *
 * Wide enough that no real booking is refused, narrow enough that a garbage year cannot
 * produce a nav link no date library will parse back.
 */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** `YYYY-MM`, a real month number, and a year inside the window. */
function inWindow(month: string): boolean {
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parts) return false;
  const month1 = Number(parts[2]);
  if (month1 < 1 || month1 > 12) return false;
  const year = Number(parts[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * `?month=` validated for RANGE, not only for shape.
 *
 * `/^\d{4}-\d{2}$/` accepts "2026-00", "2026-13" and "2026-99". `buildMonth` then indexes
 * `MONTH_NAMES[month1 - 1]` unchecked, so the heading reads "undefined 2026", `Date.UTC`
 * silently rolls the month over — "2026-99" builds a February 2034 grid — and every
 * in-month cell gets an impossible key like "2026-13-07", which `isToday` can never match
 * and no event's date can equal, so the agenda comes back empty as though the book were
 * clear. The year is guarded too: "0000-01" emitted a "-1-00" previous-month link.
 *
 * An out-of-range value FALLS BACK to the month the agent is in, which is what the guard
 * always claimed to do. Clamping was the other option and it is worse: "2026-99" has no
 * nearest sensible month, and a silent clamp to December would look like real data.
 *
 * LIVES HERE, NOT IN THE PAGE. It was page-local and unexported, so the one piece of §3.2.3
 * logic that decides whether a URL is trusted had no test while its three siblings above did.
 */
export function validMonth(raw: string | undefined, fallback: string): string {
  return raw !== undefined && inWindow(raw) ? raw : fallback;
}

/**
 * `shiftMonth`, held inside the window `validMonth` accepts. What a NAV LINK may point at.
 *
 * The §3.2.3 handoff claimed "shiftMonth can only ever emit in-range months, so every
 * in-app link stays valid". That is false at the window's own edges: from "2100-12"
 * `shiftMonth` emits "2101-01" and from "2000-01" it emits "1999-12", both of which
 * `validMonth` rejects — so the rendered "2101-01 →" link landed on today's month under a
 * heading that did not match the link text. No bounded set is closed under ±1 month, so the
 * guard cannot be widened into agreement; the step is held instead. At the two extreme
 * months the arrow points at the month you are already on, which is a dead end rather than
 * a silent jump.
 *
 * A month OUTSIDE the window steps normally — `buildMonth` stays pure for anything the
 * guard would never have let through in the first place.
 */
export function navMonth(month: string, delta: number): string {
  const stepped = shiftMonth(month, delta);
  if (!inWindow(month)) return stepped;
  return inWindow(stepped) ? stepped : month;
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

  // THE GRID'S ARITHMETIC IS UNBOUNDED AND THE NAV LINKS ARE NOT. The spill cells have to
  // carry the real neighbouring months whatever they are — a December grid's trailing cells
  // belong to the following January even when that January is outside the navigable window.
  // Only `prevMonth`/`nextMonth`, which the page renders as hrefs, are held inside it.
  const gridPrev = shiftMonth(month, -1);
  const gridNext = shiftMonth(month, 1);
  const [py, pm] = gridPrev.split("-").map(Number);
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
      const [ny, nm] = gridNext.split("-").map(Number);
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
    prevMonth: navMonth(month, -1),
    nextMonth: navMonth(month, 1),
    weeks,
    agenda,
  };
}
