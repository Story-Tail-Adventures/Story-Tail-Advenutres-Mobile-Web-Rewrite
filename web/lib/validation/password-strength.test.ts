import { describe, expect, it } from "vitest";
import { newPasswordSchema } from "./auth";
import {
  PASSWORD_RULES,
  joinReadably,
  passwordStrength,
  strengthMessage,
} from "./password-strength";

/**
 * The meter and the schema have to agree.
 *
 * A meter that says "strong" about a password GoTrue will reject is worse than no meter:
 * it teaches people the indicator is decorative. The first block is the one that matters;
 * everything below it is presentation.
 */

const VECTORS = [
  "",
  "short",
  "alllowercaseletters",
  "ALLUPPERCASELETTERS",
  "NoDigitsInHere",
  "nouppercase123456",
  "NOLOWERCASE123456",
  "GreenPastures1",
  "Sh0rt",
  "12345678901234567890",
  "Restful Waters 23",
];

describe("passwordStrength agrees with newPasswordSchema", () => {
  it.each(VECTORS)("%j", (value) => {
    expect(passwordStrength(value).meets).toBe(newPasswordSchema.safeParse(value).success);
  });
});

describe("passwordStrength", () => {
  it("scores nothing for an empty field", () => {
    expect(passwordStrength("")).toEqual({
      score: 0,
      missing: PASSWORD_RULES.map((r) => r.label),
      meets: false,
    });
  });

  it("scores every rule for a password that satisfies the policy", () => {
    expect(passwordStrength("GreenPastures1")).toEqual({ score: 4, missing: [], meets: true });
  });

  it("names only the rules that are actually unmet", () => {
    expect(passwordStrength("GreenPasturesAll").missing).toEqual(["a number"]);
    expect(passwordStrength("greenpastures1").missing).toEqual(["a capital letter"]);
    expect(passwordStrength("Green1").missing).toEqual(["at least 12 characters"]);
  });
});

describe("strengthMessage", () => {
  it("says nothing at all before anything is typed", () => {
    expect(strengthMessage("")).toBe("");
  });

  it("congratulates a password that passes", () => {
    expect(strengthMessage("GreenPastures1")).toBe(
      "Strong — 12+ characters, upper and lower case, and a number.",
    );
  });

  it("asks for what is missing, warmly and in one sentence", () => {
    expect(strengthMessage("greenpastures")).toBe("Still needs a capital letter and a number.");
    expect(strengthMessage("green")).toBe(
      "Still needs at least 12 characters, a capital letter and a number.",
    );
  });
});

describe("joinReadably", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a and b"],
    [["a", "b", "c"], "a, b and c"],
    [["a", "b", "c", "d"], "a, b, c and d"],
  ])("%j -> %j", (parts, expected) => {
    expect(joinReadably(parts)).toBe(expected);
  });
});
