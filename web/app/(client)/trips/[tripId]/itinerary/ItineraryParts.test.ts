import { describe, expect, it } from "vitest";
import type { ItineraryActivity } from "@/lib/trips/queries";
import { activityIcon, formatTime, shortTime } from "./ItineraryParts";

const activity = (over: Partial<ItineraryActivity>): ItineraryActivity => ({
  id: "a",
  block: "morning",
  startTime: null,
  endTime: null,
  title: "",
  body: null,
  location: null,
  address: null,
  phone: null,
  confirmationNumber: null,
  gyasisTip: null,
  ...over,
});

describe("activityIcon", () => {
  it("reads the TITLE, not the body", () => {
    // The bug this pins: "Catamaran to Booby Cay" has the body "Snorkel gear and lunch
    // included", and matching both put a utensils glyph on a boat trip. The meal is a
    // detail; only the title says what the thing is.
    expect(
      activityIcon(
        activity({
          title: "Catamaran to Booby Cay",
          body: "Snorkel gear and lunch included. Six hours.",
        }),
      ),
    ).toBe("ship");
  });

  it("puts a vessel before a meal — a boat trip that feeds you is a boat trip", () => {
    expect(activityIcon(activity({ title: "Sunset sail with dinner" }))).toBe("ship");
    expect(activityIcon(activity({ title: "Hibachi night — Kimonos" }))).toBe("utensils");
  });

  it("recognises the shapes the seed and the artboards actually use", () => {
    const cases: Array<[string, string]> = [
      ["AA 1413 · MIA → MBJ", "plane"],
      ["Private transfer to Negril", "trip"],
      ["Check in · ocean-view suite", "building"],
      ["Welcome dinner · Bayside", "utensils"],
      ["Beach yoga (optional)", "heart"],
    ];
    for (const [title, expected] of cases) {
      expect(activityIcon(activity({ title })), title).toBe(expected);
    }
  });

  it("falls back rather than guessing wrong", () => {
    expect(activityIcon(activity({ title: "An afternoon with nothing in it" }))).toBe("sparkle");
  });

  it("does not match a substring inside another word", () => {
    // `\bcay\b` rather than `cay`, or "Cayman Brac shopping" becomes a boat.
    expect(activityIcon(activity({ title: "Biscayne shopping trip" }))).not.toBe("ship");
  });
});

describe("time formatting", () => {
  it("drops the seconds Postgres sends on a `time` column", () => {
    expect(shortTime("06:40:00")).toBe("06:40");
    expect(formatTime("09:00:00", "15:00:00")).toBe("09:00 – 15:00");
    expect(formatTime("20:30:00", null)).toBe("20:30");
    expect(formatTime(null, "15:00:00")).toBeNull();
  });
});
