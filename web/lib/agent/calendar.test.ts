import { describe, expect, it } from "vitest";

import {
  buildMonth,
  daysInMonth,
  firstWeekday,
  navMonth,
  shiftMonth,
  validMonth,
  type CalendarEvent,
} from "./calendar";

/**
 * The module that replaces the prototype's `Array.from({length: 35}, (_, i) => i - 3)`.
 *
 * Every assertion here is a way that expression is wrong: a fixed three-day offset, a fixed
 * 35 cells, and one event per day.
 */

const ev = (date: string, id: string, kind: CalendarEvent["kind"] = "departure"): CalendarEvent => ({
  id,
  kind,
  date,
  label: id,
  detail: null,
  href: null,
});

describe("month arithmetic", () => {
  it("knows how long every month is, leap years included", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29); // leap
    expect(daysInMonth(2100, 2)).toBe(28); // century, not a leap year
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("shifts across a year boundary in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 4)).toBe("2027-01");
  });
});

// ── The `?month=` guard, which used to be page-local and untested ─────────────

describe("validMonth", () => {
  it("rejects a month number no month has", () => {
    // These three all match /^\d{4}-\d{2}$/, which is why shape alone is not enough.
    // "2026-99" built a February 2034 grid; "2026-13" made every cell key "2026-13-07",
    // which no event date can equal, so the agenda came back empty as if the book were
    // clear. FAILS IF: `month1 > 12` in calendar.ts loses a character and becomes
    // `month1 > 2`, or the `<`/`>` in either bound flips.
    expect(validMonth("2026-00", "2026-09")).toBe("2026-09");
    expect(validMonth("2026-13", "2026-09")).toBe("2026-09");
    expect(validMonth("2026-99", "2026-09")).toBe("2026-09");
  });

  it("rejects a year outside the window", () => {
    // "0000-01" is the one that emitted a "-1-00" previous-month link. FAILS IF: the `&&`
    // joining the two year bounds in `inWindow` becomes `||`.
    expect(validMonth("0000-01", "2026-09")).toBe("2026-09");
    expect(validMonth("1999-12", "2026-09")).toBe("2026-09");
    expect(validMonth("2101-01", "2026-09")).toBe("2026-09");
  });

  it("rejects anything that is not the shape at all, including absent", () => {
    expect(validMonth(undefined, "2026-09")).toBe("2026-09");
    expect(validMonth("", "2026-09")).toBe("2026-09");
    expect(validMonth("2026-9", "2026-09")).toBe("2026-09");
    expect(validMonth("2026-09-01", "2026-09")).toBe("2026-09");
    expect(validMonth("not-a-month", "2026-09")).toBe("2026-09");
  });

  it("round-trips a valid value untouched, including both window edges", () => {
    // The guard must not silently rewrite a good value — the heading and the link text are
    // both derived from what comes back. FAILS IF: the `? raw :` in validMonth becomes
    // `? fallback :`.
    expect(validMonth("2026-09", "2026-01")).toBe("2026-09");
    expect(validMonth("2000-01", "2026-01")).toBe("2000-01");
    expect(validMonth("2100-12", "2026-01")).toBe("2100-12");
  });
});

describe("navMonth agrees with validMonth", () => {
  it("holds the step inside the window at the window's own edges", () => {
    // The claim this replaces: "shiftMonth can only ever emit in-range months". It cannot —
    // from the edges it emits exactly the two values the guard rejects, and the rendered
    // "2101-01 →" link landed on today's month under a heading that did not match it.
    // FAILS IF: navMonth's `return inWindow(stepped) ? stepped : month` loses the guard and
    // becomes `return stepped`.
    expect(shiftMonth("2100-12", 1)).toBe("2101-01");
    expect(navMonth("2100-12", 1)).toBe("2100-12");
    expect(shiftMonth("2000-01", -1)).toBe("1999-12");
    expect(navMonth("2000-01", -1)).toBe("2000-01");
  });

  it("steps normally everywhere inside the window", () => {
    expect(navMonth("2026-12", 1)).toBe("2027-01");
    expect(navMonth("2026-01", -1)).toBe("2025-12");
    expect(navMonth("2100-11", 1)).toBe("2100-12");
    expect(navMonth("2000-02", -1)).toBe("2000-01");
  });

  it("leaves a month outside the window to step on its own", () => {
    // buildMonth stays pure for anything the guard would never have let through.
    expect(navMonth("1850-03", 1)).toBe("1850-04");
  });

  it("every nav link buildMonth renders is a value the guard accepts", () => {
    // The invariant the whole pairing exists for, swept across the window's edges and a
    // year in the middle. FAILS IF: buildMonth's `prevMonth: navMonth(month, -1)` reverts
    // to `shiftMonth(month, -1)` — one word, and the two edge months break.
    for (const month of ["2000-01", "2000-02", "2026-06", "2100-11", "2100-12"]) {
      const grid = buildMonth(month, "2026-01-01", []);
      expect(validMonth(grid.prevMonth, "FALLBACK"), `${month} prev`).toBe(grid.prevMonth);
      expect(validMonth(grid.nextMonth, "FALLBACK"), `${month} next`).toBe(grid.nextMonth);
    }
  });

  it("still spills into the REAL neighbouring month at the window edge", () => {
    // Holding the nav link must not bend the grid: December 2100's trailing cells belong to
    // January 2101 even though no link may point there. FAILS IF: buildMonth's spill math
    // reads `nextMonth` (the held value) instead of `gridNext`.
    const grid = buildMonth("2100-12", "2026-01-01", []);
    const spill = grid.weeks.flat().filter((d) => !d.inMonth && d.date > "2100-12");
    // December 2100 starts on a Wednesday and runs 31 days, so the grid has exactly one
    // trailing cell. Asserted so the `every` below cannot pass on an empty list.
    expect(spill.map((d) => d.date)).toEqual(["2101-01-01"]);
    expect(grid.nextMonth).toBe("2100-12");
  });
});

describe("buildMonth", () => {
  it("uses the real leading offset, not a hardcoded three", () => {
    // September 2026 starts on a Tuesday (weekday 2); the prototype would pad by 3.
    expect(firstWeekday(2026, 9)).toBe(2);
    const m = buildMonth("2026-09", "2026-09-22", []);
    const first = m.weeks[0];
    expect(first.slice(0, 2).every((d) => !d.inMonth)).toBe(true);
    expect(first[2].date).toBe("2026-09-01");
    expect(first[2].inMonth).toBe(true);
  });

  it("grows to six rows when the month needs them, and shrinks to four when it can", () => {
    // May 2026: 31 days starting Friday — 5 lead + 31 = 36 cells, so SIX rows. A fixed 35
    // (the prototype) loses the 31st.
    const six = buildMonth("2026-05", "2026-05-01", []);
    expect(six.weeks).toHaveLength(6);
    expect(six.weeks.flat()).toHaveLength(42);

    // Four rows needs a 28-day month starting on a Sunday, which is rarer than it sounds —
    // February 2027 starts on a Monday and correctly takes five. Found rather than assumed,
    // because guessing a weekday is how the first version of this test was wrong.
    let fourRowMonth: string | null = null;
    for (let y = 2026; y <= 2040 && !fourRowMonth; y++) {
      if (daysInMonth(y, 2) === 28 && firstWeekday(y, 2) === 0) fourRowMonth = `${y}-02`;
    }
    expect(fourRowMonth).not.toBeNull();
    const four = buildMonth(fourRowMonth!, "2026-01-01", []);
    expect(four.weeks).toHaveLength(4);
    expect(four.weeks.flat()).toHaveLength(28);
  });

  it("always uses exactly the rows the month needs — never a fixed count", () => {
    // The invariant the two cases above are instances of. Sweeping four years catches every
    // combination of month length and start weekday.
    for (let y = 2026; y <= 2029; y++) {
      for (let m = 1; m <= 12; m++) {
        const month = `${y}-${String(m).padStart(2, "0")}`;
        const expected = Math.ceil((firstWeekday(y, m) + daysInMonth(y, m)) / 7);
        expect(buildMonth(month, "2026-01-01", []).weeks, month).toHaveLength(expected);
      }
    }
  });

  it("never loses a day of the month it is showing", () => {
    for (const month of ["2026-01", "2026-02", "2026-05", "2026-08", "2028-02", "2026-11"]) {
      const m = buildMonth(month, "2026-01-01", []);
      const inMonth = m.weeks.flat().filter((d) => d.inMonth);
      const [y, mm] = month.split("-").map(Number);
      expect(inMonth, month).toHaveLength(daysInMonth(y, mm));
      expect(inMonth[0].dayOfMonth).toBe(1);
      expect(inMonth.at(-1)!.dayOfMonth).toBe(daysInMonth(y, mm));
    }
  });

  it("puts SEVERAL events on one day", () => {
    // The prototype's `events[dayNum]` holds one object. A departure and a payment on the
    // same date is routine — the seed has exactly that on 1 October.
    const m = buildMonth("2026-10", "2026-10-01", [
      ev("2026-10-01", "departs"),
      ev("2026-10-01", "deposit", "payment"),
      ev("2026-10-05", "returns", "return"),
    ]);
    const first = m.weeks.flat().find((d) => d.date === "2026-10-01")!;
    expect(first.events.map((e) => e.id)).toEqual(["departs", "deposit"]);
    expect(m.weeks.flat().find((d) => d.date === "2026-10-05")!.events).toHaveLength(1);
  });

  it("marks exactly one day as today, and none when today is elsewhere", () => {
    const m = buildMonth("2026-09", "2026-09-22", []);
    expect(m.weeks.flat().filter((d) => d.isToday)).toHaveLength(1);
    const other = buildMonth("2027-03", "2026-09-22", []);
    expect(other.weeks.flat().filter((d) => d.isToday)).toHaveLength(0);
  });

  it("does not mark a spill-over cell as today just because the number matches", () => {
    // The cell for 1 October appears in September's trailing spill. If `isToday` compared
    // day numbers rather than full dates, it would light up twice.
    const m = buildMonth("2026-09", "2026-10-01", []);
    const marked = m.weeks.flat().filter((d) => d.isToday);
    expect(marked).toHaveLength(1);
    expect(marked[0].inMonth).toBe(false);
  });

  it("the agenda holds only this month's events, in date order", () => {
    const m = buildMonth("2026-10", "2026-10-01", [
      ev("2026-11-02", "next month"),
      ev("2026-10-20", "later"),
      ev("2026-09-30", "last month"),
      ev("2026-10-03", "earlier"),
    ]);
    expect(m.agenda.map((e) => e.id)).toEqual(["earlier", "later"]);
  });

  it("labels the month and names its neighbours", () => {
    const m = buildMonth("2026-12", "2026-12-01", []);
    expect(m.monthLabel).toBe("December 2026");
    expect(m.prevMonth).toBe("2026-11");
    expect(m.nextMonth).toBe("2027-01");
  });
});
