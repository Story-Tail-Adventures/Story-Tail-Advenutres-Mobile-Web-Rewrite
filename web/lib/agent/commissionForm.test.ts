import { describe, expect, it } from "vitest";

import {
  CREATE_STATUS_OPTIONS,
  editStatusOptions,
  lineValuesFromForm,
  parseLagDays,
  parseRate,
  prefillBySupplier,
  previewExpectedCents,
  previewGapCents,
  validateLine,
  validatePayment,
  type LineValues,
} from "./commissionForm";

/**
 * §3.7.3 / §3.7.4's form rules.
 *
 * THE INVARIANT THAT MATTERS MOST: the line form and the payment form cannot reach each
 * other's statuses. A new line is expected or invoiced; the edit offers expected, invoiced
 * and lost (plus a paid status only to KEEP it); received and disputed come only from Mark
 * received. The SQL refuses the rest too — this is so the form never offers it.
 */

const VALID: LineValues = {
  supplierId: "s1",
  gross: "6,480.00",
  rate: "15",
  paymentTerms: "after_travel",
  paymentLagDays: "60",
  status: "expected",
  inteletravelReference: "",
  notes: "",
};

describe("status options", () => {
  it("a new line starts expected or invoiced, never paid", () => {
    expect(CREATE_STATUS_OPTIONS.map((o) => o.value)).toEqual(["expected", "invoiced"]);
  });

  it("the edit offers expected, invoiced and lost — and a paid status only to keep it", () => {
    expect(editStatusOptions("expected").map((o) => o.value)).toEqual(["expected", "invoiced", "lost"]);
    expect(editStatusOptions("received").map((o) => o.value)).toEqual([
      "expected", "invoiced", "lost", "received",
    ]);
    expect(editStatusOptions("disputed").map((o) => o.value)).not.toContain("received");
  });
});

describe("validateLine", () => {
  it("accepts a well-formed line, commas and all", () => {
    expect(validateLine(VALID)).toBeNull();
  });

  it("names each bad field", () => {
    expect(validateLine({ ...VALID, supplierId: "", gross: "6.4.8", rate: "101", paymentLagDays: "1.5" }))
      .toEqual({
        supplierId: "Pick a supplier.",
        gross: "Enter an amount like 6480.00.",
        rate: "Enter a rate from 0 to 100.",
        paymentLagDays: "Enter whole days, 0 to 365.",
      });
  });

  it("refuses a lag over a year and a rate with three decimals", () => {
    expect(parseLagDays("366")).toBeNull();
    expect(parseLagDays("365")).toBe(365);
    expect(parseRate("12.505")).toBeNull();
    expect(parseRate("12.5%")).toBe(12.5);
  });

  it("reads the form's fields, trimming what should be trimmed", () => {
    const form = new FormData();
    form.set("supplierId", "s1");
    form.set("gross", " 100.00 ");
    form.set("rate", " 12 ");
    form.set("paymentTerms", "at_booking");
    form.set("paymentLagDays", " 30 ");
    form.set("status", "invoiced");
    form.set("inteletravelReference", " ITV-1 ");
    form.set("notes", "  keep my spacing  ");
    expect(lineValuesFromForm(form)).toEqual({
      supplierId: "s1",
      gross: "100.00",
      rate: "12",
      paymentTerms: "at_booking",
      paymentLagDays: "30",
      status: "invoiced",
      inteletravelReference: "ITV-1",
      // Notes are trimmed by the server, not here: what was typed is echoed back as typed.
      notes: "  keep my spacing  ",
    });
  });
});

describe("previewExpectedCents", () => {
  it("is gross × rate in cents", () => {
    expect(previewExpectedCents("6480.00", "15")).toBe(97200);
    expect(previewExpectedCents("1234.56", "12.5")).toBe(15432);
  });

  it("is null while either side is not a number — a dash, not $0", () => {
    expect(previewExpectedCents("abc", "15")).toBeNull();
    expect(previewExpectedCents("100", "")).toBeNull();
  });
});

describe("prefillBySupplier", () => {
  it("sums a supplier's components and weights the rate by cost", () => {
    const out = prefillBySupplier([
      { supplierId: "sandals", costCents: 100000, commissionPct: 12 },
      { supplierId: "sandals", costCents: 300000, commissionPct: 16 },
      { supplierId: "allianz", costCents: 20000, commissionPct: null },
    ]);
    expect(out.sandals).toEqual({ grossCents: 400000, rate: 15 });
    // Cost known, rate not: gross fills, the rate is left to the supplier default.
    expect(out.allianz).toEqual({ grossCents: 20000, rate: null });
  });

  it("ignores components that name no supplier, rather than guessing", () => {
    expect(prefillBySupplier([{ supplierId: null, costCents: 500000, commissionPct: 12 }])).toEqual({});
  });
});

describe("the payment form", () => {
  const OK = { status: "received", received: "970.00", fee: "0", receivedAt: "2026-10-01" };

  it("refuses a date after the advisor's today", () => {
    expect(validatePayment({ ...OK, receivedAt: "2026-10-12" }, "2026-10-11"))
      .toEqual({ receivedAt: "Use today or an earlier date." });
    expect(validatePayment({ ...OK, receivedAt: "2026-10-11" }, "2026-10-11")).toBeNull();
  });

  it("shows the gap the reconciliation will see: expected − fee − received", () => {
    expect(previewGapCents(97000, "950.00", "20.00")).toBe(0);
    expect(previewGapCents(97000, "900.00", "0")).toBe(7000);
    expect(previewGapCents(97000, "x", "0")).toBeNull();
  });
});
