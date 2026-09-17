import { describe, expect, it } from "vitest";

import {
  brandChip,
  brandName,
  cardExpiry,
  cardLabel,
  defaultExpiry,
  formatDate,
  limitPresets,
  remainingCents,
  remainingLabel,
} from "./format";

describe("brandChip", () => {
  it("uses the mark people recognise, not the first four letters", () => {
    // `slice(0, 4)` renders "mastercard" as MAST. That shipped to a browser once and a
    // screenshot caught it.
    expect(brandChip("mastercard")).toBe("MC");
    expect(brandChip("visa")).toBe("VISA");
    expect(brandChip("amex")).toBe("AMEX");
  });

  it("falls back rather than throwing on a brand Stripe added later", () => {
    expect(brandChip("cartes_bancaires")).toBe("CART");
  });
});

describe("brandName", () => {
  it("reads as a word in a sentence, not as Stripe's token", () => {
    // "Your visa is ready" shipped to a browser once. It reads as a typo.
    expect(brandName("visa")).toBe("Visa");
    expect(brandName("mastercard")).toBe("Mastercard");
    expect(brandName("jcb")).toBe("JCB");
  });

  it("title-cases an unknown brand rather than leaving it lowercase", () => {
    expect(brandName("elo")).toBe("Elo");
  });
});

describe("cardLabel", () => {
  it("uppercases the brand, which arrives as Stripe's lowercase token", () => {
    expect(cardLabel({ brand: "visa", last4: "4242" })).toBe("VISA •••• 4242");
    expect(cardLabel({ brand: "mastercard", last4: "4444" })).toBe("MASTERCARD •••• 4444");
  });
});

describe("cardExpiry", () => {
  it("pads the month and takes the last two of the year", () => {
    expect(cardExpiry({ expMonth: 2, expYear: 2027 })).toBe("02/27");
    expect(cardExpiry({ expMonth: 11, expYear: 2029 })).toBe("11/29");
  });
});

describe("remainingCents", () => {
  it("is the limit less what has been used", () => {
    expect(remainingCents({ spendingLimitCents: 900_000, amountUsedCents: 784_500 })).toBe(115_500);
  });

  it("CLAMPS AT ZERO when usage has overrun the limit", () => {
    // A supplier charge landing after the limit was lowered, or a final charge rounding past
    // it, makes amount_used exceed the limit. Without the clamp this renders a negative
    // balance, which reads as though Story-Tail owes the traveler money.
    expect(remainingCents({ spendingLimitCents: 100_000, amountUsedCents: 130_000 })).toBe(0);
  });
});

describe("remainingLabel", () => {
  it("reads as a sentence about what is left", () => {
    expect(remainingLabel({ spendingLimitCents: 900_000, amountUsedCents: 784_500 })).toBe(
      "$1,155 of $9,000 left",
    );
  });

  it("says nothing is left rather than showing a negative", () => {
    expect(remainingLabel({ spendingLimitCents: 100_000, amountUsedCents: 130_000 })).toBe(
      "$0 of $1,000 left",
    );
  });
});

describe("limitPresets", () => {
  it("offers exact, +10% and +20%", () => {
    const presets = limitPresets(784_500);
    expect(presets.map((p) => p.label)).toEqual(["Exact", "+10%", "+20%"]);
    expect(presets[0].cents).toBe(784_500);
    expect(presets[1].cents).toBe(862_950);
    expect(presets[2].cents).toBe(941_400);
  });

  it("ALWAYS returns whole cents, and rounds up", () => {
    // 10% of 784_445 is 862_889.5. A fractional cent reaching the Edge Function is a 400 —
    // spendingLimitCents must be a safe integer. Rounding UP rather than to nearest, because
    // a limit landing a cent under the supplier's charge fails a real payment.
    for (const preset of limitPresets(784_445)) {
      expect(Number.isSafeInteger(preset.cents)).toBe(true);
    }
    expect(limitPresets(784_445)[1].cents).toBe(862_890);
  });

  it("does not go negative on a trip that is somehow overpaid", () => {
    expect(limitPresets(-500).every((p) => p.cents >= 0)).toBe(true);
  });
});

describe("defaultExpiry", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("is seven days after the trip ends", () => {
    // Suppliers settle late. An authorization ending with the trip would already be expired
    // when the resort charges the final balance on the checkout date.
    const expiry = defaultExpiry("2026-11-22", now);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-11-29");
  });

  it("falls back to ninety days out when the trip has no end date", () => {
    // An inquiry or a proposal can be authorized before the dates are fixed; refusing to
    // compute a default would block the screen rather than the write.
    const expiry = defaultExpiry(null, now);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-12-16");
  });

  it("falls back rather than producing an Invalid Date on a malformed value", () => {
    expect(Number.isNaN(defaultExpiry("not-a-date", now).getTime())).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats in the zone it is given", () => {
    expect(formatDate("2026-11-29T12:00:00.000Z", "UTC")).toBe("Nov 29, 2026");
  });

  it("returns an empty string rather than throwing on an unusable timestamp", () => {
    expect(formatDate("not a date", "UTC")).toBe("");
  });

  it("falls back to UTC on a garbage zone instead of blanking the screen", () => {
    // platform_user.time_zone is free text that onboarding wrote. One bad row should cost a
    // wrong hour, not a thrown render.
    expect(formatDate("2026-11-29T12:00:00.000Z", "Mars/Olympus_Mons")).toBe("Nov 29, 2026");
  });
});
