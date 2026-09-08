import { describe, expect, it } from "vitest";

import {
  formatDaySeparator,
  formatMessageTime,
  groupMessagesByDay,
  QUICK_REPLIES,
  THREAD_MESSAGES,
} from "./thread";

/**
 * Local time is the point of these, so the fixtures are built with the local-time
 * constructor rather than ISO-with-Z strings. A `Z` literal would make the expectations
 * depend on the machine's zone and this file would pass in UTC and fail in Kingston.
 */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("formatMessageTime", () => {
  it("prints the artboards' compact 12-hour format", () => {
    expect(formatMessageTime(at(2026, 8, 12, 11, 14))).toBe("11:14a");
    expect(formatMessageTime(at(2026, 8, 12, 14, 14))).toBe("2:14p");
  });

  it("calls midnight and noon 12, not 0", () => {
    expect(formatMessageTime(at(2026, 8, 12, 0, 5))).toBe("12:05a");
    expect(formatMessageTime(at(2026, 8, 12, 12, 0))).toBe("12:00p");
  });

  it("pads the minutes, so 9:05 does not read as 9:5", () => {
    expect(formatMessageTime(at(2026, 8, 12, 9, 5))).toBe("9:05a");
  });

  it("returns nothing rather than 'Invalid Date' for a value it cannot read", () => {
    expect(formatMessageTime("not a timestamp")).toBe("");
  });
});

describe("formatDaySeparator", () => {
  const now = new Date(2026, 8, 7, 15, 0);

  it("says Today and Yesterday before it says a date", () => {
    expect(formatDaySeparator(at(2026, 9, 7, 9, 0), now)).toBe(THREAD_MESSAGES.today);
    expect(formatDaySeparator(at(2026, 9, 6, 23, 30), now)).toBe(THREAD_MESSAGES.yesterday);
  });

  it("falls back to a short date further out", () => {
    expect(formatDaySeparator(at(2026, 3, 14, 9, 0), now)).toBe("Mar 14");
  });

  it("treats a late-evening message as its own local day, not the next UTC one", () => {
    // 11:30pm local is the same calendar day to the person who sent it. Keying on the UTC
    // date would push it into tomorrow for anybody west of Greenwich and split a single
    // evening across two separators.
    expect(formatDaySeparator(at(2026, 9, 7, 23, 30), now)).toBe(THREAD_MESSAGES.today);
  });

  it("crosses a month boundary correctly", () => {
    const firstOfMonth = new Date(2026, 9, 1, 10, 0);
    expect(formatDaySeparator(at(2026, 9, 30, 12, 0), firstOfMonth)).toBe(
      THREAD_MESSAGES.yesterday,
    );
  });
});

describe("groupMessagesByDay", () => {
  const now = new Date(2026, 8, 7, 15, 0);

  it("keeps the thread oldest-first and buckets consecutive days", () => {
    const days = groupMessagesByDay(
      [
        { createdAt: at(2026, 9, 6, 11, 14) },
        { createdAt: at(2026, 9, 6, 11, 32) },
        { createdAt: at(2026, 9, 7, 14, 14) },
      ],
      now,
    );

    expect(days.map((d) => d.label)).toEqual([
      THREAD_MESSAGES.yesterday,
      THREAD_MESSAGES.today,
    ]);
    expect(days.map((d) => d.messages.length)).toEqual([2, 1]);
  });

  it("gives each day a stable key, so React does not remount the thread", () => {
    const days = groupMessagesByDay([{ createdAt: at(2026, 9, 6, 11, 14) }], now);
    expect(days[0].key).toBe("2026-09-06");
  });

  it("opens a new bucket when a day repeats after a gap", () => {
    // Not a real thread ordering, but the reducer must not merge non-adjacent same-day
    // runs into one bucket — that would reorder somebody's messages.
    const days = groupMessagesByDay(
      [
        { createdAt: at(2026, 9, 5, 9, 0) },
        { createdAt: at(2026, 9, 6, 9, 0) },
        { createdAt: at(2026, 9, 5, 10, 0) },
      ],
      now,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-09-05", "2026-09-06", "2026-09-05"]);
  });

  it("skips an unparseable timestamp instead of dropping the thread", () => {
    const days = groupMessagesByDay(
      [{ createdAt: "nonsense" }, { createdAt: at(2026, 9, 7, 9, 0) }],
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].messages).toHaveLength(1);
  });

  it("returns nothing for an empty thread, so the caller shows the empty state", () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
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
