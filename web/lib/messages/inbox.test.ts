import { describe, expect, it } from "vitest";

import { filterRows, formatInboxTime, inboxRows, type InboxRow } from "./inbox";
import type { InboxConversation } from "./queries";

/**
 * `now` is fixed in every test. A relative-time formatter tested against the real clock
 * passes at 3pm and fails at midnight, which is the worst kind of flake: it lands in CI on
 * somebody else's branch.
 */
const NOW = new Date("2026-03-15T02:00:00.000Z");

function conversation(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id: "0195a2c0-1a00-7000-8000-00000000abcd",
    subject: null,
    tripId: null,
    tripTitle: null,
    lastMessageAt: "2026-03-15T01:30:00.000Z",
    lastMessagePreview: "Locked. Final balance authorization is in your dashboard.",
    unreadCount: 0,
    ...overrides,
  };
}

describe("formatInboxTime", () => {
  it("shows a clock time for today and a date for older days", () => {
    expect(formatInboxTime("2026-03-15T01:30:00.000Z", "UTC", NOW)).toBe("1:30a");
    expect(formatInboxTime("2026-03-14T23:00:00.000Z", "UTC", NOW)).toBe("Yesterday");
    expect(formatInboxTime("2026-03-01T12:00:00.000Z", "UTC", NOW)).toBe("Mar 1");
  });

  it("decides 'today' in the traveler's zone, not the server's", () => {
    // 23:00Z on Mar 14 is 7:00p on Mar 14 in New York, where `now` is also still Mar 14 —
    // so it is TODAY there and YESTERDAY in UTC. This is the whole reason the zone is an
    // argument: rendered on a UTC host, the ambient-zone version tells a traveler in New
    // York that the message they are reading arrived yesterday.
    const iso = "2026-03-14T23:00:00.000Z";
    expect(formatInboxTime(iso, "America/New_York", NOW)).toBe("7:00p");
    expect(formatInboxTime(iso, "UTC", NOW)).toBe("Yesterday");
  });

  it("returns an empty string rather than throwing on an unusable timestamp", () => {
    expect(formatInboxTime("not a date", "UTC", NOW)).toBe("");
  });

  it("falls back to UTC on a garbage zone instead of blanking the row", () => {
    // `platform_user.time_zone` is free text that onboarding wrote. One bad row should cost
    // a wrong hour, not a thrown render that takes the inbox down with it.
    expect(formatInboxTime("2026-03-15T01:30:00.000Z", "Mars/Olympus_Mons", NOW)).toBe("1:30a");
  });
});

describe("inboxRows", () => {
  it("prefers the live trip title, then the subject, then the advisor's name", () => {
    const rows = inboxRows(
      [
        conversation({ id: "a", tripTitle: "Sandals · Aug", subject: "Stale old subject" }),
        conversation({ id: "b", subject: "New family cruise idea" }),
        conversation({ id: "c" }),
      ],
      "UTC",
      NOW,
    );

    // The trip can be renamed after the thread was created, so the header follows the trip.
    expect(rows[0].title).toBe("Sandals · Aug");
    expect(rows[1].title).toBe("New family cruise idea");
    // The general thread is named for the person, not described as "General".
    expect(rows[2].title).toBe("Gyasi Story");
  });

  it("renders a row whose preview column is null", () => {
    // `last_message_preview` is nullable and a conversation exists for a moment before its
    // first message lands. A thread that vanishes because one column is null is worse than
    // a thread with a quiet line under it.
    const [row] = inboxRows([conversation({ lastMessagePreview: null })], "UTC", NOW);
    expect(row.preview).toBe("");
    expect(row.href).toBe("/messages/0195a2c0-1a00-7000-8000-00000000abcd");
  });

  it("carries the unread count through untouched", () => {
    const [row] = inboxRows([conversation({ unreadCount: 3 })], "UTC", NOW);
    expect(row.unreadCount).toBe(3);
  });
});

describe("filterRows", () => {
  const rows: InboxRow[] = inboxRows(
    [
      conversation({ id: "a", tripTitle: "Sandals · Aug", lastMessagePreview: "Bungalow held" }),
      conversation({ id: "b", subject: "Aruba honeymoon", lastMessagePreview: "Mid-October?" }),
    ],
    "UTC",
    NOW,
  );

  it("returns everything for an empty or whitespace query", () => {
    expect(filterRows(rows, "")).toHaveLength(2);
    expect(filterRows(rows, "   ")).toHaveLength(2);
  });

  it("matches the title and the preview, ignoring case", () => {
    expect(filterRows(rows, "SANDALS").map((r) => r.title)).toEqual(["Sandals · Aug"]);
    expect(filterRows(rows, "bungalow").map((r) => r.title)).toEqual(["Sandals · Aug"]);
    expect(filterRows(rows, "aruba").map((r) => r.title)).toEqual(["Aruba honeymoon"]);
  });

  it("matches nothing rather than everything when nothing matches", () => {
    // The screen renders `searchEmpty` off this. Returning the unfiltered list on a miss
    // would read as "search is broken" rather than "no results".
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});
