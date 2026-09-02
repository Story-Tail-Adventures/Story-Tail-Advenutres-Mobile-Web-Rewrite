import { describe, it, expect } from "vitest";
import { AUTH_MESSAGES, emailSchema, loginSchema, newPasswordSchema } from "./auth";

/**
 * Cross-platform parity vectors.
 *
 * The SAME table is asserted in
 * mobile/shared/src/commonTest/kotlin/com/storytail/adventures/domain/validation/AuthValidationTest.kt
 *
 * If you add a case here, add it there. The two validators are separate
 * implementations by design (the KMP shared module does not run on web) — these
 * vectors are the only thing keeping them from drifting apart.
 */

function emailError(input: string): string | null {
  const result = emailSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

function loginPasswordError(input: string): string | null {
  const result = loginSchema.safeParse({ email: "a@b.co", password: input });
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path[0] === "password");
  return issue?.message ?? null;
}

function newPasswordError(input: string): string | null {
  const result = newPasswordSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

describe("email vectors match the shared table", () => {
  const cases: Array<[string, string | null]> = [
    ["", AUTH_MESSAGES.emailRequired],
    ["   ", AUTH_MESSAGES.emailRequired],
    ["jordan", AUTH_MESSAGES.emailInvalid],
    ["jordan@", AUTH_MESSAGES.emailInvalid],
    ["jordan@example", AUTH_MESSAGES.emailInvalid],
    ["jordan@example.c", AUTH_MESSAGES.emailInvalid],
    ["jordan hayes@example.com", AUTH_MESSAGES.emailInvalid],
    ["jordan@example.com", null],
    ["  jordan@example.com  ", null],
    ["JORDAN@EXAMPLE.COM", null],
    ["jordan.hayes+trips@example.co.uk", null],
  ];

  it.each(cases)("emailSchema(%j)", (input, expected) => {
    expect(emailError(input)).toBe(expected);
  });
});

describe("login password requires presence only", () => {
  it("rejects an empty password", () => {
    expect(loginPasswordError("")).toBe(AUTH_MESSAGES.passwordRequired);
  });

  // A short password is NOT a login-time error — the policy applies at registration,
  // and rejecting it here would leak the policy and lock out anyone whose password
  // predates it.
  it("accepts a short password", () => {
    expect(loginPasswordError("short")).toBeNull();
    expect(loginPasswordError(" ")).toBeNull();
  });
});

describe("new password enforces the 12 char policy", () => {
  const cases: Array<[string, string | null]> = [
    ["", AUTH_MESSAGES.passwordTooShort],
    ["Short1", AUTH_MESSAGES.passwordTooShort],
    ["alllowercase", AUTH_MESSAGES.passwordNeedsDigit],
    ["alllowercase1", AUTH_MESSAGES.passwordNeedsUppercase],
    // Uppercase + digits but no lowercase. supabase/config.toml requires all three, so
    // a client rule without this hands the user a weak_password rejection from GoTrue
    // after telling them the password was fine.
    ["PASSWORD12345", AUTH_MESSAGES.passwordNeedsLowercase],
    ["GreenPastures1", null],
    ["still-waters-99X", null],
  ];

  it.each(cases)("newPasswordSchema(%j)", (input, expected) => {
    expect(newPasswordError(input)).toBe(expected);
  });
});
