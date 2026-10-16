import { describe, expect, it } from "vitest";

import {
  checkPayUrl,
  isOpenMilestone,
  looksLikeCardNumber,
  paidNoteBody,
  payButtonLabel,
  paySiteName,
} from "./payLink";

/**
 * A Luhn-valid 16-digit number built at runtime. CI's PAN guard (scan_pan.py) refuses any
 * Luhn-valid literal in source, tests included, so the test has to make its own.
 */
function luhnValid(prefix: string, length: number): string {
  for (let check = 0; check <= 9; check += 1) {
    const candidate = prefix.padEnd(length - 1, "0") + String(check);
    let sum = 0;
    let double = false;
    for (let i = candidate.length - 1; i >= 0; i -= 1) {
      let d = Number(candidate[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error("unreachable");
}

describe("paySiteName", () => {
  it("is the host, lower-cased, with a leading www. removed", () => {
    expect(paySiteName("https://www.sandals.com/pay/SRB-220119")).toBe("sandals.com");
    expect(paySiteName("https://WWW.RoyalCaribbean.COM/checkout?x=1")).toBe("royalcaribbean.com");
    expect(paySiteName("https://pay.travefy.com/invoice/st-4471")).toBe("pay.travefy.com");
  });

  it("only strips www. at the start", () => {
    expect(paySiteName("https://shop.www.example.com/")).toBe("shop.www.example.com");
    expect(paySiteName("https://wwwsandals.com/")).toBe("wwwsandals.com");
  });

  it("shows a look-alike internationalised host in punycode, so it cannot pass as the real one", () => {
    // "sаndals.com" with a Cyrillic а (U+0430), built from its code point so the source
    // itself carries no look-alike text.
    const lookAlike = `https://www.s${String.fromCodePoint(0x430)}ndals.com/pay`;
    const name = paySiteName(lookAlike);
    expect(name).not.toBe("sandals.com");
    expect(name).toMatch(/^xn--/);
    expect(name).toMatch(/\.com$/);
  });

  it("is null for anything that is not an https link", () => {
    expect(paySiteName(null)).toBeNull();
    expect(paySiteName("")).toBeNull();
    expect(paySiteName("not a url")).toBeNull();
    expect(paySiteName("http://sandals.com/pay")).toBeNull();
    expect(paySiteName("javascript:alert(1)")).toBeNull();
  });
});

describe("payButtonLabel and paidNoteBody", () => {
  it("names the button from the milestone label, first letter lower-cased", () => {
    expect(payButtonLabel("Deposit")).toBe("Pay deposit");
    expect(payButtonLabel("Final balance")).toBe("Pay final balance");
    expect(payButtonLabel("Tour · Rose Island")).toBe("Pay tour · Rose Island");
  });

  it("writes the I've paid message with the label lower-cased", () => {
    expect(paidNoteBody("Final balance", "$4,180")).toBe("I've paid the final balance ($4,180).");
  });

  it("treats scheduled and overdue as open, paid and waived as closed", () => {
    expect(isOpenMilestone("scheduled")).toBe(true);
    expect(isOpenMilestone("overdue")).toBe(true);
    expect(isOpenMilestone("paid")).toBe(false);
    expect(isOpenMilestone("waived")).toBe(false);
  });
});

describe("checkPayUrl", () => {
  it("takes an https link and returns the parsed href", () => {
    expect(checkPayUrl("  https://www.sandals.com/pay/SRB-220119  ")).toEqual({
      ok: true,
      url: "https://www.sandals.com/pay/SRB-220119",
    });
    expect(checkPayUrl("https://Sandals.com")).toEqual({ ok: true, url: "https://sandals.com/" });
  });

  it("reads an empty value as removing the link", () => {
    expect(checkPayUrl("")).toEqual({ ok: true, url: null });
    expect(checkPayUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("refuses anything but https, a user:password part, and spaces", () => {
    expect(checkPayUrl("http://sandals.com/pay")).toEqual({ ok: false, reason: "https" });
    expect(checkPayUrl("sandals.com/pay")).toEqual({ ok: false, reason: "https" });
    expect(checkPayUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "https" });
    expect(checkPayUrl("https://user:pw@sandals.com/")).toEqual({ ok: false, reason: "https" });
    expect(checkPayUrl("https://sandals.com/a b")).toEqual({ ok: false, reason: "https" });
  });

  it("refuses a link longer than 2,048 characters", () => {
    expect(checkPayUrl(`https://sandals.com/${"a".repeat(2048)}`)).toEqual({ ok: false, reason: "length" });
  });

  it("refuses a link that carries a card-shaped, Luhn-valid number", () => {
    const pan = luhnValid("4", 16);
    expect(checkPayUrl(`https://sandals.com/pay?card=${pan}`)).toEqual({ ok: false, reason: "card" });
    const spaced = pan.replace(/(\d{4})(?=\d)/g, "$1 ");
    expect(looksLikeCardNumber(`card ${spaced}`)).toBe(true);
  });

  it("lets a long reference through when it fails the Luhn check", () => {
    const pan = luhnValid("4", 16);
    const notLuhn = pan.slice(0, -1) + String((Number(pan.at(-1)) + 1) % 10);
    expect(looksLikeCardNumber(notLuhn)).toBe(false);
    expect(checkPayUrl(`https://sandals.com/pay/${notLuhn}`).ok).toBe(true);
  });
});
