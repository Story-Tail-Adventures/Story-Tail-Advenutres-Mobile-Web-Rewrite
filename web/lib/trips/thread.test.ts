import { describe, expect, it } from "vitest";

import {
  formatDaySeparator,
  formatMessageTime,
  groupMessagesByDay,
  QUICK_REPLIES,
  THREAD_MESSAGES,
} from "./thread";

/**
 * THE FIXTURES ARE UTC INSTANTS AND THE ZONE IS EXPLICIT, which is the contract these
 * functions now have. An earlier version built them with the local-time `Date` constructor,
 * which made every expectation depend on the machine running the test — and hid the actual
 * bug, because the code under test was also reading the ambient zone. Passing the zone in
 * is what makes both the test and production deterministic.
 */
const utc = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min)).toISOString();

/** Two zones on opposite sides of the UTC date line at the same instant. */
const KINGSTON = "America/Jamaica"; // UTC-5, no DST
const TOKYO = "Asia/Tokyo"; // UTC+9

describe("formatMessageTime", () => {
  it("prints the artboards' compact 12-hour format in the traveler's zone", () => {
    // 16:14 UTC is 11:14am in Kingston.
    expect(formatMessageTime(utc(2026, 8, 12, 16, 14), KINGSTON)).toBe("11:14a");
    expect(formatMessageTime(utc(2026, 8, 12, 19, 14), KINGSTON)).toBe("2:14p");
  });

  it("gives two travelers in different zones different clock times", () => {
    // The bug this whole design exists to prevent: one instant, and whichever zone the
    // formatter happens to pick up decides what a traveler reads.
    const instant = utc(2026, 8, 12, 16, 14);
    expect(formatMessageTime(instant, KINGSTON)).toBe("11:14a");
    expect(formatMessageTime(instant, TOKYO)).toBe("1:14a");
  });

  it("calls midnight and noon 12, not 0", () => {
    expect(formatMessageTime(utc(2026, 8, 12, 5, 5), KINGSTON)).toBe("12:05a");
    expect(formatMessageTime(utc(2026, 8, 12, 17, 0), KINGSTON)).toBe("12:00p");
  });

  it("pads the minutes, so 9:05 does not read as 9:5", () => {
    expect(formatMessageTime(utc(2026, 8, 12, 14, 5), KINGSTON)).toBe("9:05a");
  });

  it("falls back to UTC rather than throwing on an unusable zone string", () => {
    // `platform_user.time_zone` is free text an onboarding form wrote. One bad row should
    // cost a wrong hour, not the whole thread.
    expect(formatMessageTime(utc(2026, 8, 12, 16, 14), "Not/AZone")).toBe("4:14p");
  });

  it("returns nothing rather than 'Invalid Date' for a value it cannot read", () => {
    expect(formatMessageTime("not a timestamp", KINGSTON)).toBe("");
  });
});

describe("formatDaySeparator", () => {
  // 01:17 UTC on the 8th — which is still the EVENING OF THE 7TH in Kingston. This is the
  // exact clock position that made the native twin label every separator a day out, and the
  // reason these assertions use it.
  const now = new Date(Date.UTC(2026, 8, 8, 1, 17));

  it("says Today and Yesterday against the traveler's calendar, not UTC's", () => {
    // 22:48 UTC on the 7th is 5:48pm on the 7th in Kingston — today.
    expect(formatDaySeparator(utc(2026, 9, 7, 22, 48), KINGSTON, now)).toBe(
      THREAD_MESSAGES.today,
    );
    // 19:48 UTC on the 6th is 2:48pm on the 6th in Kingston — yesterday.
    expect(formatDaySeparator(utc(2026, 9, 6, 19, 48), KINGSTON, now)).toBe(
      THREAD_MESSAGES.yesterday,
    );
  });

  it("would have called both of those something else in UTC", () => {
    // Kept as a record of the bug: in UTC the same two instants land on the 7th and the 6th
    // while UTC's today is the 8th, so they read "Yesterday" and "Sep 6" — off by one, which
    // is what shipped on the emulator before this was fixed.
    expect(formatDaySeparator(utc(2026, 9, 7, 22, 48), "UTC", now)).toBe(
      THREAD_MESSAGES.yesterday,
    );
    expect(formatDaySeparator(utc(2026, 9, 6, 19, 48), "UTC", now)).toBe("Sep 6");
  });

  it("falls back to a short date further out", () => {
    expect(formatDaySeparator(utc(2026, 3, 14, 16, 0), KINGSTON, now)).toBe("Mar 14");
  });

  it("crosses a month boundary correctly", () => {
    const firstOfOctober = new Date(Date.UTC(2026, 9, 1, 15, 0));
    expect(formatDaySeparator(utc(2026, 9, 30, 16, 0), KINGSTON, firstOfOctober)).toBe(
      THREAD_MESSAGES.yesterday,
    );
  });

  it("returns nothing for an unparseable value", () => {
    expect(formatDaySeparator("nonsense", KINGSTON, now)).toBe("");
  });
});

describe("groupMessagesByDay", () => {
  const now = new Date(Date.UTC(2026, 8, 8, 1, 17));

  it("keeps the thread oldest-first and buckets by the traveler's calendar day", () => {
    const days = groupMessagesByDay(
      [
        { createdAt: utc(2026, 9, 6, 19, 48) },
        { createdAt: utc(2026, 9, 6, 20, 48) },
        { createdAt: utc(2026, 9, 7, 22, 48) },
      ],
      KINGSTON,
      now,
    );

    expect(days.map((d) => d.label)).toEqual([
      THREAD_MESSAGES.yesterday,
      THREAD_MESSAGES.today,
    ]);
    expect(days.map((d) => d.messages.length)).toEqual([2, 1]);
  });

  it("splits one UTC day into two where the traveler's zone does", () => {
    // 03:00 and 23:00 UTC on the 7th are the 6th at 10pm and the 7th at 6pm in Kingston —
    // two calendar days for the traveler, one for the server.
    const days = groupMessagesByDay(
      [{ createdAt: utc(2026, 9, 7, 3, 0) }, { createdAt: utc(2026, 9, 7, 23, 0) }],
      KINGSTON,
      now,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-09-06", "2026-09-07"]);
  });

  it("gives each day a stable key, so React does not remount the thread", () => {
    const days = groupMessagesByDay([{ createdAt: utc(2026, 9, 6, 19, 48) }], KINGSTON, now);
    expect(days[0].key).toBe("2026-09-06");
  });

  it("opens a new bucket when a day repeats after a gap", () => {
    // Not a real thread ordering, but the reducer must not merge non-adjacent same-day runs
    // into one bucket — that would reorder somebody's messages.
    const days = groupMessagesByDay(
      [
        { createdAt: utc(2026, 9, 5, 15, 0) },
        { createdAt: utc(2026, 9, 6, 15, 0) },
        { createdAt: utc(2026, 9, 5, 16, 0) },
      ],
      KINGSTON,
      now,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-09-05", "2026-09-06", "2026-09-05"]);
  });

  it("skips an unparseable timestamp instead of dropping the thread", () => {
    const days = groupMessagesByDay(
      [{ createdAt: "nonsense" }, { createdAt: utc(2026, 9, 7, 22, 48) }],
      KINGSTON,
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].messages).toHaveLength(1);
  });

  it("returns nothing for an empty thread, so the caller shows the empty state", () => {
    expect(groupMessagesByDay([], KINGSTON, now)).toEqual([]);
  });
});

describe("QUICK_REPLIES", () => {
  it("offers four distinct chips, all drawn from the shared copy table", () => {
    expect(QUICK_REPLIES).toHaveLength(4);
    expect(new Set(QUICK_REPLIES).size).toBe(4);
    for (const reply of QUICK_REPLIES) {
      expect(Object.values(THREAD_MESSAGES)).toContain(reply);
    }
  });
});
