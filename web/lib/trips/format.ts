/**
 * Date formatting for the §2.2 screens. The Kotlin twin is `formatDates` in
 * ui/screens/dashboard/DashboardScreen.kt.
 *
 * Everything parses as UTC midnight, for the reason status.ts documents: a naive
 * `new Date("2026-09-07")` and a local-time sibling differ by the host offset, which is how
 * a trip that starts on the 13th renders as the 12th for half the world.
 */

const OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };

function at(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fmt(d: Date, withYear: boolean): string {
  return d.toLocaleDateString("en-US", withYear ? { ...OPTS, year: "numeric" } : OPTS);
}

/** "Nov 13 – 20, 2026", collapsing the month when the trip does not cross one. */
export function formatTripDates(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "Dates to come";
  const start = at(startIso);
  if (!endIso) return fmt(start, true);
  const end = at(endIso);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  return sameMonth
    ? `${fmt(start, false)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`
    : `${fmt(start, false)} – ${fmt(end, true)}`;
}

/** "Sep 21", for a due date sitting next to an amount. */
export function formatDay(iso: string): string {
  return fmt(at(iso), false);
}

/** "Friday 14 August", for a day-detail heading. */
export function formatLongDay(iso: string): string {
  return at(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
