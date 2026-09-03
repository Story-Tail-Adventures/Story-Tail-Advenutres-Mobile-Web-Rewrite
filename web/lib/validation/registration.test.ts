import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES } from "./auth";
import {
  NAME_MAX,
  REGISTRATION_MESSAGES,
  passwordPairSchema,
  registrationSchema,
  registrationWithConfirmSchema,
} from "./registration";

const VALID = {
  firstName: "Jordan",
  lastName: "Hayes",
  email: "jordan@example.com",
  password: "GreenPastures1",
  terms: "on",
};

type Parsed = {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
};

function issueFor(field: string, result: Parsed): string | null {
  if (result.success) return null;
  return result.error?.issues.find((i) => i.path[0] === field)?.message ?? null;
}

describe("registrationSchema — the rules /join and /register share", () => {
  it("trims names", () => {
    const result = registrationSchema.safeParse({ ...VALID, firstName: "  Jose-Maria " });
    expect(result.success && result.data.firstName).toBe("Jose-Maria");
  });

  it("requires a name", () => {
    expect(
      issueFor("firstName", registrationSchema.safeParse({ ...VALID, firstName: "  " })),
    ).toBe(REGISTRATION_MESSAGES.nameRequired);
  });

  it("caps a name at NAME_MAX", () => {
    expect(
      issueFor(
        "lastName",
        registrationSchema.safeParse({ ...VALID, lastName: "x".repeat(NAME_MAX + 1) }),
      ),
    ).toBe(REGISTRATION_MESSAGES.nameTooLong);
    expect(
      registrationSchema.safeParse({ ...VALID, lastName: "x".repeat(NAME_MAX) }).success,
    ).toBe(true);
  });

  it("rejects control characters in a name", () => {
    // Built from a char code so nothing invisible lives in this file.
    const withControlChar = `Jor${String.fromCharCode(7)}dan`;
    expect(
      issueFor(
        "firstName",
        registrationSchema.safeParse({ ...VALID, firstName: withControlChar }),
      ),
    ).toBe(REGISTRATION_MESSAGES.nameInvalid);
  });

  it("requires the terms checkbox, which posts the literal 'on'", () => {
    expect(issueFor("terms", registrationSchema.safeParse({ ...VALID, terms: undefined }))).toBe(
      REGISTRATION_MESSAGES.termsRequired,
    );
    expect(issueFor("terms", registrationSchema.safeParse({ ...VALID, terms: "true" }))).toBe(
      REGISTRATION_MESSAGES.termsRequired,
    );
  });

  it("applies the shared password policy", () => {
    expect(
      issueFor("password", registrationSchema.safeParse({ ...VALID, password: "short1A" })),
    ).toBe(AUTH_MESSAGES.passwordTooShort);
  });
});

describe("the confirm-password rule, shared by 2.1.2 and 2.1.5", () => {
  const PAIR = { password: "GreenPastures1", confirmPassword: "GreenPastures1" };

  it("accepts a matching pair", () => {
    expect(passwordPairSchema.safeParse(PAIR).success).toBe(true);
  });

  it("reports a mismatch on the confirmation field, never on the first one", () => {
    const result = passwordPairSchema.safeParse({ ...PAIR, confirmPassword: "GreenPastures2" });
    expect(issueFor("confirmPassword", result)).toBe(REGISTRATION_MESSAGES.confirmMismatch);
    expect(issueFor("password", result)).toBeNull();
  });

  it("requires the confirmation to be filled in", () => {
    expect(
      issueFor("confirmPassword", passwordPairSchema.safeParse({ ...PAIR, confirmPassword: "" })),
    ).toBe(REGISTRATION_MESSAGES.confirmRequired);
  });

  it("reports a weak password AND a mismatch together, not one then the other", () => {
    // The reason for superRefine over refine: someone who typed a short password and
    // mistyped the repeat should see both problems on the first submit.
    const result = passwordPairSchema.safeParse({ password: "short", confirmPassword: "shore" });
    expect(issueFor("password", result)).toBe(AUTH_MESSAGES.passwordTooShort);
    expect(issueFor("confirmPassword", result)).toBe(REGISTRATION_MESSAGES.confirmMismatch);
  });

  it("is the same rule on the registration schema", () => {
    const result = registrationWithConfirmSchema.safeParse({
      ...VALID,
      confirmPassword: "GreenPastures2",
    });
    expect(issueFor("confirmPassword", result)).toBe(REGISTRATION_MESSAGES.confirmMismatch);
  });
});
