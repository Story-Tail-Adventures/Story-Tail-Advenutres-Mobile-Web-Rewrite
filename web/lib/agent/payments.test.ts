import { describe, expect, it } from "vitest";

import {
  MILESTONE_KINDS,
  MILESTONE_STATUSES,
  centsToDollars,
  dollarsToCents,
  emptyMilestone,
  isMilestoneKind,
  isMilestoneStatus,
  milestoneFromFormData,
  validateMilestone,
} from "@/lib/agent/payments";

/**
 * §3.4.15's vocabulary and money handling.
 *
 * These matter more than most form tests because of what sits downstream: `paid_cents` is
 * summed by a trigger into `trip.total_paid_cents`, and `wallet/authorize/[tripId]`
 * subtracts that from the trip's value to show a traveler the balance they are authorizing
 * a card against. A cent lost here is a cent wrong there, silently.
 */

describe("the enums match the schema", () => {
  it("has the three kinds", () => {
    expect(MILESTONE_KINDS.map((k) => k.value)).toEqual(["deposit", "interim", "final"]);
  });

  it("has all four statuses, waived included", () => {
    // A "paid Y/N" checkbox would make two of these unreachable, and `waived` is the one
    // §9.5 exists to distinguish: a forgiven milestone is not a paid one.
    expect(MILESTONE_STATUSES.map((s) => s.value).sort()).toEqual([
      "overdue",
      "paid",
      "scheduled",
      "waived",
    ]);
  });

  it("gives every status a hint, because two of them are not obvious", () => {
    for (const s of MILESTONE_STATUSES) expect(s.hint.length).toBeGreaterThan(0);
  });

  it("rejects a value that is not in the enum", () => {
    expect(isMilestoneKind("balance")).toBe(false);
    expect(isMilestoneKind("deposit")).toBe(true);
    expect(isMilestoneStatus("cancelled")).toBe(false);
    expect(isMilestoneStatus("waived")).toBe(true);
  });
});

describe("dollarsToCents", () => {
  it("reads an amount and strips what gets pasted with it", () => {
    expect(dollarsToCents("1000")).toBe(100000);
    expect(dollarsToCents("1000.00")).toBe(100000);
    expect(dollarsToCents("$1,000.00")).toBe(100000);
    expect(dollarsToCents("")).toBe(0);
  });

  it("rounds rather than letting a float through", () => {
    // 1000.1 * 100 is 100010.00000000001 in IEEE 754.
    expect(dollarsToCents("1000.10")).toBe(100010);
    expect(dollarsToCents("0.07")).toBe(7);
    expect(dollarsToCents("2.67")).toBe(267);
  });

  it("refuses what is not an amount", () => {
    expect(dollarsToCents("1000.005")).toBeNull();
    expect(dollarsToCents("half")).toBeNull();
    expect(dollarsToCents("-50")).toBeNull();
  });

  it("round-trips through centsToDollars", () => {
    for (const cents of ["0", "7", "100000", "100010", "784500"]) {
      expect(dollarsToCents(centsToDollars(cents))).toBe(Number(cents));
    }
  });
});

describe("validateMilestone", () => {
  const base = { ...emptyMilestone(), label: "Deposit", amount: "1000.00" };

  it("passes a filled-in milestone", () => {
    expect(validateMilestone(base)).toBeNull();
  });

  it("requires a label", () => {
    expect(validateMilestone({ ...base, label: "" })?.label).toHaveLength(1);
  });

  it("refuses a zero amount, which the database would take", () => {
    // A row saying the supplier expects nothing on a date is not a schedule entry; it is a
    // row an advisor will later read as a mistake and cannot tell from one.
    expect(validateMilestone({ ...base, amount: "0" })?.amount).toHaveLength(1);
    expect(validateMilestone({ ...base, amount: "" })?.amount).toHaveLength(1);
  });

  it("refuses an amount that is not one", () => {
    expect(validateMilestone({ ...base, amount: "some" })?.amount).toHaveLength(1);
  });
});

describe("milestoneFromFormData", () => {
  function form(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  }

  it("never carries paid_cents or status", () => {
    // THE WHOLE POINT OF THE SPLIT. This form changes what the supplier expects; the row's
    // own control changes whether the money moved. If a paid amount could ride along here,
    // a label edit could move `trip.total_paid_cents`.
    const values = milestoneFromFormData(
      form({ kind: "final", label: "Final balance", amount: "7845.00", paidAmount: "9999", status: "paid" }),
    );
    expect(Object.keys(values).sort()).toEqual([
      "amount",
      "dueDate",
      "kind",
      "label",
      "milestoneId",
    ]);
  });

  it("falls back to deposit for a kind it does not know", () => {
    expect(milestoneFromFormData(form({ kind: "balance" })).kind).toBe("deposit");
  });

  it("trims every field", () => {
    const values = milestoneFromFormData(form({ kind: "deposit", label: "  Deposit  " }));
    expect(values.label).toBe("Deposit");
  });
});
