import { describe, expect, it } from "vitest";

import { parseWeight, weightedCents, weightsFromForm } from "./forecastWeights";

describe("parseWeight", () => {
  it("takes a whole number from 0 to 100, with or without a %", () => {
    expect(parseWeight("50")).toBe(50);
    expect(parseWeight(" 80% ")).toBe(80);
    expect(parseWeight("0")).toBe(0);
    expect(parseWeight("100")).toBe(100);
  });

  it("refuses anything else rather than guessing", () => {
    for (const bad of ["", "101", "50.5", "-5", "abc", "1e2"]) expect(parseWeight(bad)).toBeNull();
  });
});

describe("weightedCents", () => {
  it("rounds half away from zero, as Postgres rounds numeric", () => {
    expect(weightedCents(345120, 50)).toBe(172560);
    expect(weightedCents(345120, 80)).toBe(276096);
    // 1 cent at 50% is half a cent: up, not to even.
    expect(weightedCents(1, 50)).toBe(1);
  });
});

describe("weightsFromForm", () => {
  function form(weights: Record<string, string>, expected: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(weights)) f.set(`weight-${k}`, v);
    for (const [k, v] of Object.entries(expected)) f.set(`expected-${k}`, v);
    return f;
  }
  const cur = { inquiry: "20", proposal: "50", booked: "100", in_progress: "100" };

  it("reads the four stages and what the screen showed", () => {
    expect(weightsFromForm(form({ ...cur, proposal: "80" }, cur))).toEqual({
      ok: true,
      weights: { inquiry: 20, proposal: 80, booked: 100, in_progress: 100 },
      expected: { inquiry: 20, proposal: 50, booked: 100, in_progress: 100 },
    });
  });

  it("refuses a bad or missing weight", () => {
    expect(weightsFromForm(form({ ...cur, proposal: "150" }, cur)).ok).toBe(false);
    const { in_progress: _drop, ...three } = cur;
    expect(weightsFromForm(form(three, cur)).ok).toBe(false);
  });
});
