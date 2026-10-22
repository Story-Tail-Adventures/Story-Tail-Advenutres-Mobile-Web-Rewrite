import { describe, expect, it } from "vitest";

import {
  MILESTONE_KINDS,
  nextUnpaidMilestone,
  MILESTONE_STATUSES,
  centsToDollars,
  dollarsToCents,
  emptyMilestone,
  isMilestoneKind,
  isMilestoneStatus,
  milestoneFromFormData,
  validateMarkPaid,
  validateMilestone,
  validatePayLink,
} from "@/lib/agent/payments";
import { PAYMENTS_COPY } from "@/lib/agent/content";

/**
 * §3.4.15's vocabulary and money handling.
 *
 * These matter more than most form tests because of what sits downstream: `paid_cents` is
 * summed by a trigger into `trip.total_paid_cents`, the "paid so far" a traveler and the
 * advisor both read. A cent lost here is a cent wrong there, silently.
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

describe("nextUnpaidMilestone", () => {
  it("is the first row still owed, in the schedule's order; paid and waived are not owed", () => {
    const rows = [
      { milestoneId: "a", status: "paid" },
      { milestoneId: "b", status: "waived" },
      { milestoneId: "c", status: "overdue" },
      { milestoneId: "d", status: "scheduled" },
    ];
    expect(nextUnpaidMilestone(rows)?.milestoneId).toBe("c");
    expect(nextUnpaidMilestone(rows.slice(0, 2))).toBeNull();
  });
});

describe("§3.6 pay link and Mark paid checks (2026-10-16)", () => {
  it("takes an https link, removes on blank, and says why it refuses", () => {
    expect(validatePayLink("https://www.sandals.com/pay/1")).toEqual({ ok: true, url: "https://www.sandals.com/pay/1" });
    expect(validatePayLink("")).toEqual({ ok: true, url: null });
    expect(validatePayLink("http://sandals.com")).toEqual({ ok: false, error: PAYMENTS_COPY.linkNotHttps });
    expect(validatePayLink(`https://a.com/${"x".repeat(2100)}`)).toEqual({ ok: false, error: PAYMENTS_COPY.linkTooLong });
  });

  const ok = { amount: "4180.00", paidOn: "2026-05-14", reference: "SRB-220119-FINAL", note: "Sandals confirmed by email." };

  it("accepts a normal paid mark, and a blank amount means the whole amount", () => {
    expect(validateMarkPaid(ok, "2026-05-14")).toBeNull();
    expect(validateMarkPaid({ ...ok, amount: "" }, "2026-05-14")).toBeNull();
  });

  it("refuses a future date, a bad amount and over-long text", () => {
    const errors = validateMarkPaid(
      { amount: "abc", paidOn: "2026-05-15", reference: "r".repeat(101), note: "n".repeat(1001) },
      "2026-05-14",
    );
    expect(errors).toEqual({
      amount: PAYMENTS_COPY.paidAmountInvalid,
      paidOn: PAYMENTS_COPY.paidDateInvalid,
      reference: PAYMENTS_COPY.paidReferenceTooLong,
      note: PAYMENTS_COPY.paidNoteTooLong,
    });
  });

  it("refuses a card-shaped number in the confirmation number or the note", () => {
    // Built at runtime: CI's PAN guard refuses any Luhn-valid literal in source.
    const body = `4${"1".repeat(14)}`;
    let pan = "";
    for (let c = 0; c <= 9 && !pan; c += 1) {
      const candidate = `${body}${c}`;
      const sum = [...candidate].reverse().reduce((acc, ch, i) => {
        let d = Number(ch);
        if (i % 2 === 1) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        return acc + d;
      }, 0);
      if (sum % 10 === 0) pan = candidate;
    }
    const errors = validateMarkPaid({ ...ok, reference: pan, note: `card ${pan}` }, "2026-05-14");
    expect(errors?.reference).toBe(PAYMENTS_COPY.paidCardLike);
    expect(errors?.note).toBe(PAYMENTS_COPY.paidCardLike);
  });
});
