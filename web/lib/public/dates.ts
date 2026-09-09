/**
 * Calendar dates for the public search surface (Screen Inventory 2.0.3 / 2.0.4). P2.
 *
 * Everything here is a plain `YYYY-MM-DD` string, never a `Date`. A stay is a pair of
 * calendar days — "12 August to 19 August" means the same thing to a traveler in Orlando and
 * to one in Auckland — so the moment a `Date` enters the model it brings a timezone that has
 * to be argued away again at every boundary. Strings in, strings out; `Date` appears only
 * inside the arithmetic helpers, pinned to UTC noon so a DST transition cannot move a day.
 *
 * TIMEZONE IS ALWAYS EXPLICIT. Web formats on the SERVER, so `Intl` with default options uses
 * the server's zone rather than the reader's, and a day boundary computed that way is a day
 * out for half the world. Every formatter here takes a `timeZone` and passes it through. See
 * web/lib/trips/thread.ts, which learned this the hard way.
 */

/** `YYYY-MM-DD`. Shape only — `isValidIsoDate` also checks the calendar. */
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Local midday in UTC: far enough from either boundary that no offset can shift the date. */
function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/**
 * True when `value` is a real calendar date in `YYYY-MM-DD`.
 *
 * The round-trip is the point: `2026-02-30` and `2026-13-01` both parse happily into a Date
 * that rolls over into the next month, so shape-checking alone accepts days that do not
 * exist. Re-deriving the parts and comparing catches it.
 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_SHAPE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = utcNoon(y, m, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `YYYY-MM-DD` → Date at UTC noon, or null when it is not a real date. */
export function parseIsoDate(value: unknown): Date | null {
  if (!isValidIsoDate(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return utcNoon(y, m, d);
}

/** Date → `YYYY-MM-DD`, reading the UTC parts (which is where `utcNoon` put them). */
export function toIsoDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today in `timeZone`, as `YYYY-MM-DD`. `en-CA` formats as ISO, which is why it is used. */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `iso` shifted by `days`, as `YYYY-MM-DD`. Returns null when `iso` is not a real date. */
export function addDays(iso: string, days: number): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Whole nights between two dates. Negative when they are the wrong way round. */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  const a = parseIsoDate(checkIn);
  const b = parseIsoDate(checkOut);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * "Aug 12 – 19" when the range sits in one month, "Aug 30 – Sep 5" when it does not,
 * and the year appended when the range is not in the current one.
 *
 * Matches the placeholder the artboards use (C203's Dates cell reads "Aug 12 – 19"), so a
 * filled field and an empty one have the same shape.
 */
export function formatRange(
  checkIn: string,
  checkOut: string,
  timeZone: string,
  today: string = todayIso(timeZone),
): string {
  const a = parseIsoDate(checkIn);
  const b = parseIsoDate(checkOut);
  if (!a || !b) return "";

  const sameMonth = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  const thisYear = today.slice(0, 4) === checkIn.slice(0, 4) && checkIn.slice(0, 4) === checkOut.slice(0, 4);

  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(d);

  const head = `${month(a)} ${a.getUTCDate()}`;
  const tail = sameMonth ? String(b.getUTCDate()) : `${month(b)} ${b.getUTCDate()}`;
  return thisYear ? `${head} – ${tail}` : `${head} – ${tail}, ${b.getUTCFullYear()}`;
}

/** A single day, for the picker's `aria-label`s: "Wednesday, August 12, 2026". */
export function formatDayLong(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
