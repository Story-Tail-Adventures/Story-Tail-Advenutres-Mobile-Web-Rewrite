import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { JOIN_FIELDS, JOIN_MESSAGES, NAME_MAX, flattenJoinIssues, joinSchema } from "./schema";

const VALID = {
  firstName: "Jordan",
  lastName: "Hayes",
  email: "jordan@example.com",
  password: "GreenPastures1",
  terms: "on",
};

function errorFor(field: string, input: Record<string, unknown>): string | null {
  const result = joinSchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues.find((i) => i.path[0] === field)?.message ?? null;
}

describe("joinSchema — names", () => {
  it("accepts and trims ordinary names", () => {
    const result = joinSchema.safeParse({ ...VALID, firstName: "  José-María ", lastName: " O'Neil " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("José-María");
      expect(result.data.lastName).toBe("O'Neil");
    }
  });

  // Control characters are written as escapes so nothing invisible lives in this file.
  const vectors: Array<[string, string | null]> = [
    ["", JOIN_MESSAGES.nameRequired],
    ["   ", JOIN_MESSAGES.nameRequired],
    // Whitespace-only input trims to nothing before any other rule runs.
    ["\n\t", JOIN_MESSAGES.nameRequired],
    ["a".repeat(NAME_MAX), null],
    ["a".repeat(NAME_MAX + 1), JOIN_MESSAGES.nameTooLong],
    ["Jor\ndan", JOIN_MESSAGES.nameInvalid],
    ["Jor\r\ndan", JOIN_MESSAGES.nameInvalid],
    ["Jor\tdan", JOIN_MESSAGES.nameInvalid],
    ["Jordan\u0000", JOIN_MESSAGES.nameInvalid],
    ["\u001bJordan", JOIN_MESSAGES.nameInvalid],
    ["Jor\u0085dan", JOIN_MESSAGES.nameInvalid], // C1 control (NEL), not just C0
    ["Zoë 👋", null],
  ];

  it.each(vectors)("firstName %j", (input, expected) => {
    expect(errorFor("firstName", { ...VALID, firstName: input })).toBe(expected);
  });

  it.each(vectors)("lastName %j", (input, expected) => {
    expect(errorFor("lastName", { ...VALID, lastName: input })).toBe(expected);
  });

  it("caps length after trimming, not before", () => {
    const padded = `  ${"a".repeat(NAME_MAX)}  `;
    expect(errorFor("firstName", { ...VALID, firstName: padded })).toBeNull();
  });
});

describe("joinSchema — terms", () => {
  it.each([undefined, null, "", "off", "true", "yes", "ON"])("rejects %j", (value) => {
    expect(errorFor("terms", { ...VALID, terms: value })).toBe(JOIN_MESSAGES.termsRequired);
  });

  it("accepts the literal checkbox value", () => {
    expect(errorFor("terms", VALID)).toBeNull();
  });
});

describe("joinSchema — reuses the shared email and new-password rules", () => {
  it("delegates email to emailSchema", () => {
    expect(errorFor("email", { ...VALID, email: "" })).toBe(AUTH_MESSAGES.emailRequired);
    expect(errorFor("email", { ...VALID, email: "jordan@example" })).toBe(AUTH_MESSAGES.emailInvalid);
    expect(errorFor("email", { ...VALID, email: "  jordan@example.com " })).toBeNull();
  });

  it("delegates password to the 12-character registration policy", () => {
    expect(errorFor("password", { ...VALID, password: "Short1" })).toBe(AUTH_MESSAGES.passwordTooShort);
    expect(errorFor("password", { ...VALID, password: "alllowercase" })).toBe(AUTH_MESSAGES.passwordNeedsDigit);
    expect(errorFor("password", { ...VALID, password: "alllowercase1" })).toBe(
      AUTH_MESSAGES.passwordNeedsUppercase,
    );
    expect(errorFor("password", { ...VALID, password: "PASSWORD12345" })).toBe(
      AUTH_MESSAGES.passwordNeedsLowercase,
    );
    expect(errorFor("password", { ...VALID, password: "still-waters-99X" })).toBeNull();
  });

  it("does not trim the password", () => {
    const result = joinSchema.safeParse({ ...VALID, password: " GreenPastures1 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.password).toBe(" GreenPastures1 ");
  });
});

describe("flattenJoinIssues", () => {
  it("groups messages by field and ignores paths outside the form", () => {
    const result = joinSchema.safeParse({
      firstName: "",
      lastName: "Ha\nyes",
      email: "x",
      password: "",
      terms: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const flat = flattenJoinIssues(result.error);
    expect(flat.firstName).toEqual([JOIN_MESSAGES.nameRequired]);
    expect(flat.lastName).toEqual([JOIN_MESSAGES.nameInvalid]);
    expect(flat.email).toEqual([AUTH_MESSAGES.emailInvalid]);
    expect(flat.password?.[0]).toBe(AUTH_MESSAGES.passwordTooShort);
    expect(flat.terms).toEqual([JOIN_MESSAGES.termsRequired]);

    const stray = flattenJoinIssues({ issues: [{ path: ["agent_id"], message: "nope" }] });
    expect(stray).toEqual({});
  });

  it("JOIN_FIELDS lists every schema key exactly once", () => {
    expect([...JOIN_FIELDS].sort()).toEqual(Object.keys(joinSchema.shape).sort());
  });
});
