import { describe, expect, it } from "vitest";
import { bandFromCents, formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats whole dollars without cents", () => {
    expect(formatMoney({ amountCents: 329_000, currency: "USD" })).toBe("$3,290");
  });

  it("keeps cents when present unless asked for whole dollars", () => {
    expect(formatMoney({ amountCents: 185_050, currency: "USD" })).toBe("$1,850.50");
    expect(formatMoney({ amountCents: 185_050, currency: "USD" }, { whole: true })).toBe("$1,851");
  });

  it("rejects non-integer or negative cents (CLAUDE.md rule 5)", () => {
    expect(() => formatMoney({ amountCents: 12.5, currency: "USD" })).toThrow();
    expect(() => formatMoney({ amountCents: -1, currency: "USD" })).toThrow();
  });
});

describe("bandFromCents", () => {
  it("uses 2k and 4k per-person boundaries", () => {
    expect(bandFromCents(199_999)).toBe("under-2k");
    expect(bandFromCents(200_000)).toBe("2k-4k");
    expect(bandFromCents(399_999)).toBe("2k-4k");
    expect(bandFromCents(400_000)).toBe("4k-plus");
  });
});
