import { describe, expect, it } from "vitest";

import {
  DUE_SOON_DAYS,
  TRIP_STATUS_MESSAGES,
  TRIP_STATUSES,
  daysBetween,
  daysUntilDeparture,
  tripStatusPresentation,
  type TripStatus,
} from "./status";

/**
 * The Kotlin twin of these cases is
 * `mobile/shared/src/commonTest/.../domain/trip/TripStatusTest.kt`. They are kept in step by
 * hand — check_copy_parity.py compares the label strings, not the behaviour — so a case
 * added here should be added there.
 */

const TODAY = "2026-09-07";

describe("tripStatusPresentation", () => {
  it("maps each of the six stored statuses to a chip and a label", () => {
    const cases: Array<[TripStatus, string, string]> = [
      ["inquiry", "inquiry", "Inquiry"],
      ["proposal", "proposal", "Proposal ready"],
      ["booked", "booked", "Booked"],
      ["in_progress", "traveling", "Traveling now"],
      ["completed", "past", "Past trip"],
      ["cancelled", "cancelled", "Cancelled"],
    ];
    for (const [status, chip, label] of cases) {
      expect(tripStatusPresentation({ status, today: TODAY })).toEqual({ chip, label });
    }
  });

  it("covers every value of the enum, so a new status cannot be forgotten", () => {
    for (const status of TRIP_STATUSES) {
      const out = tripStatusPresentation({ status, today: TODAY });
      expect(out.chip).toBeTruthy();
      expect(out.label).toBeTruthy();
    }
  });

  it("never produces the `lead` chip — that belongs to the Phase 2 Lead entity", () => {
    const chips = TRIP_STATUSES.map((status) => tripStatusPresentation({ status, today: TODAY }).chip);
    expect(chips).not.toContain("lead");
  });

  describe("the derived `Final payment due` label", () => {
    it("overrides Booked when an unpaid milestone is inside the window", () => {
      expect(
        tripStatusPresentation({
          status: "booked",
          today: TODAY,
          nextUnpaidDueDate: "2026-09-14", // 7 days out
        }),
      ).toEqual({ chip: "due", label: "Final payment due" });
    });

    it("applies exactly at the boundary", () => {
      // DUE_SOON_DAYS is inclusive: 14 days out is due, 15 is not.
      expect(
        tripStatusPresentation({ status: "booked", today: TODAY, nextUnpaidDueDate: "2026-09-21" }).chip,
      ).toBe("due");
      expect(
        tripStatusPresentation({ status: "booked", today: TODAY, nextUnpaidDueDate: "2026-09-22" }).chip,
      ).toBe("booked");
      expect(daysBetween(TODAY, "2026-09-21")).toBe(DUE_SOON_DAYS);
    });

    it("treats an overdue milestone as due, not as less urgent", () => {
      expect(
        tripStatusPresentation({ status: "booked", today: TODAY, nextUnpaidDueDate: "2026-08-01" }).chip,
      ).toBe("due");
    });

    it("does not fire without a milestone, or with one that has no due date", () => {
      expect(tripStatusPresentation({ status: "booked", today: TODAY }).chip).toBe("booked");
      expect(
        tripStatusPresentation({ status: "booked", today: TODAY, nextUnpaidDueDate: null }).chip,
      ).toBe("booked");
    });

    it("does not override a cancelled trip that still has money outstanding", () => {
      // The refund line on Screen 2.2.10 speaks to the money; the chip says cancelled.
      expect(
        tripStatusPresentation({ status: "cancelled", today: TODAY, nextUnpaidDueDate: "2026-09-08" }),
      ).toEqual({ chip: "cancelled", label: "Cancelled" });
    });

    it("does not override a completed or in-progress trip either", () => {
      expect(
        tripStatusPresentation({ status: "completed", today: TODAY, nextUnpaidDueDate: "2026-09-08" }).chip,
      ).toBe("past");
      expect(
        tripStatusPresentation({ status: "in_progress", today: TODAY, nextUnpaidDueDate: "2026-09-08" }).chip,
      ).toBe("traveling");
    });
  });
});

describe("daysUntilDeparture", () => {
  it("counts whole days to departure", () => {
    expect(daysUntilDeparture("2026-12-16", TODAY)).toBe(100);
    expect(daysUntilDeparture("2026-09-08", TODAY)).toBe(1);
  });

  it("is null for a trip with no dates — an inquiry has nothing to count down to", () => {
    expect(daysUntilDeparture(null, TODAY)).toBeNull();
    expect(daysUntilDeparture(undefined, TODAY)).toBeNull();
  });

  it("is null once departure has passed, rather than counting up", () => {
    expect(daysUntilDeparture("2026-09-06", TODAY)).toBeNull();
  });

  it("is zero, not null, on the day of departure", () => {
    expect(daysUntilDeparture(TODAY, TODAY)).toBe(0);
  });
});

describe("daysBetween", () => {
  it("is NaN for an unparseable date rather than a wrong number", () => {
    expect(Number.isNaN(daysBetween(TODAY, "not-a-date"))).toBe(true);
  });

  it("is unaffected by local timezone, because it parses as UTC midnight", () => {
    // A naive `new Date("2026-09-07")` vs `new Date("2026-09-07T00:00")` differ by the
    // host offset, which is how countdowns end up one day out for half the world.
    expect(daysBetween("2026-03-07", "2026-03-08")).toBe(1);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1); // across a DST boundary
  });
});

describe("TRIP_STATUS_MESSAGES", () => {
  it("is a flat table of strings, which is what check_copy_parity.py can read", () => {
    for (const value of Object.values(TRIP_STATUS_MESSAGES)) {
      expect(typeof value).toBe("string");
    }
  });
});
