import { describe, expect, it } from "vitest";
import { MFA_MESSAGES, mfaFormSchema, normalizeMfaCode } from "./mfa";

function issue(code: string): string | null {
  const result = mfaFormSchema.safeParse({ code });
  if (result.success) return null;
  return result.error.issues[0]?.message ?? null;
}

describe("normalizeMfaCode", () => {
  it.each([
    ["483921", "483921"],
    // Authenticator apps display the code with a space in the middle, and it comes along
    // on paste. Rejecting it would be rejecting the app's own formatting.
    ["483 921", "483921"],
    ["483-921", "483921"],
    ["  483921  ", "483921"],
    ["4 8 3 9 2 1", "483921"],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeMfaCode(raw)).toBe(expected);
  });
});

describe("mfaFormSchema", () => {
  it("accepts a six-digit code, however it was spaced", () => {
    const result = mfaFormSchema.safeParse({ code: "483 921" });
    expect(result.success && result.data.code).toBe("483921");
  });

  it("asks for a code when the field is empty", () => {
    expect(issue("")).toBe(MFA_MESSAGES.codeRequired);
    expect(issue("   ")).toBe(MFA_MESSAGES.codeRequired);
  });

  it.each(["12345", "1234567", "12345a"])("rejects %j as the wrong shape", (code) => {
    expect(issue(code)).toBe(MFA_MESSAGES.codeShape);
  });

  it("rejects a code made entirely of letters as missing, not malformed", () => {
    // Nothing survives normalisation, so there is no code — "that code is six digits"
    // would be answering a question they did not ask.
    expect(issue("abcdef")).toBe(MFA_MESSAGES.codeRequired);
  });
});
