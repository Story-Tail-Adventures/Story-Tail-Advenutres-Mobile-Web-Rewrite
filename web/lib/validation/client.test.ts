import { describe, expect, it } from "vitest";

import { CLIENT_MESSAGES, clientSchema, toClientPayload } from "./client";
import {
  clientFormFromFormData,
  EMPTY_CLIENT_FORM,
} from "@/lib/agent/clientFormState";

/**
 * §3.3.9 and §3.3.10's form rules.
 *
 * THE EDGE FUNCTION APPLIES THE SAME RULES AND THAT DUPLICATION IS DELIBERATE — the browser
 * copy exists so a mistake is caught before a round trip, the server copy because the
 * browser's can be skipped entirely. What is pinned here is the shape both must agree on.
 */

const VALID = {
  ...EMPTY_CLIENT_FORM,
  firstName: "Imani",
  lastName: "Osei",
  email: "imani.osei@example.com",
};

describe("clientSchema", () => {
  it("needs a name and an email, and says which is missing", () => {
    const r = clientSchema.safeParse({ ...EMPTY_CLIENT_FORM });
    expect(r.success).toBe(false);
    if (r.success) return;
    const messages = r.error.issues.map((i) => i.message);
    expect(messages).toContain(CLIENT_MESSAGES.firstNameRequired);
    expect(messages).toContain(CLIENT_MESSAGES.lastNameRequired);
    expect(messages).toContain(CLIENT_MESSAGES.emailRequired);
  });

  it("refuses a name that is only whitespace", () => {
    expect(clientSchema.safeParse({ ...VALID, firstName: "   " }).success).toBe(false);
  });

  it("is LOOSE about email on purpose", () => {
    // The authoritative test is whether mail reaches them. A stricter pattern rejects
    // addresses that are legal and real, and this field is typed by the advisor about
    // somebody they have already spoken to.
    for (const email of [
      "a@b.co",
      "first+tag@sub.domain.travel",
      "x@localhost",
      "someone@ünïcode.example",
    ]) {
      expect(clientSchema.safeParse({ ...VALID, email }).success, email).toBe(true);
    }
  });

  it("still refuses the shapes that are obviously not addresses", () => {
    for (const email of ["nope", "@example.com", "who@", "two words@example.com"]) {
      expect(clientSchema.safeParse({ ...VALID, email }).success, email).toBe(false);
    }
  });

  it("accepts a phone it can dial and refuses one it cannot", () => {
    expect(clientSchema.safeParse({ ...VALID, phone: "305-555-0199" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...VALID, phone: "+44 20 7946 0958" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...VALID, phone: "not a phone" }).success).toBe(false);
    // Blank is not an error — the field is optional.
    expect(clientSchema.safeParse({ ...VALID, phone: "" }).success).toBe(true);
  });

  it("refuses a date of birth in the future", () => {
    // A future birth date is a typo every time, and it would drive a birthday reminder that
    // never fires.
    expect(clientSchema.safeParse({ ...VALID, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...VALID, dateOfBirth: "1991-02-08" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...VALID, dateOfBirth: "not-a-date" }).success).toBe(false);
  });

  it("requires a label AND a date on every important date", () => {
    expect(clientSchema.safeParse({
      ...VALID,
      importantDates: [{ label: "Anniversary", date: "2020-06-12", recurring: true }],
    }).success).toBe(true);

    expect(clientSchema.safeParse({
      ...VALID,
      importantDates: [{ label: "", date: "2020-06-12", recurring: false }],
    }).success).toBe(false);

    expect(clientSchema.safeParse({
      ...VALID,
      importantDates: [{ label: "Anniversary", date: "", recurring: false }],
    }).success).toBe(false);
  });

  it("caps the tag list and the tag length", () => {
    expect(clientSchema.safeParse({
      ...VALID, tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
    }).success).toBe(false);
    expect(clientSchema.safeParse({ ...VALID, tags: ["x".repeat(41)] }).success).toBe(false);
  });

  it("refuses a country that is not on the list", () => {
    expect(clientSchema.safeParse({ ...VALID, addressCountry: "US" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...VALID, addressCountry: "" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...VALID, addressCountry: "ZZ" }).success).toBe(false);
  });
});

describe("toClientPayload", () => {
  it("normalises the phone to E.164, so two records do not differ by punctuation", () => {
    const parsed = clientSchema.parse({ ...VALID, phone: "(305) 555-0199" });
    expect(toClientPayload(parsed).phone).toBe("+13055550199");
  });

  it("sends null, never an empty string, for every optional field", () => {
    const payload = toClientPayload(clientSchema.parse(VALID));
    expect(payload.phone).toBeNull();
    expect(payload.preferredName).toBeNull();
    expect(payload.dateOfBirth).toBeNull();
    expect(payload.notes).toBeNull();
    // An address of all nulls is what CLEARS the link, rather than storing a row of blanks.
    expect(payload.address).toEqual({
      line1: null, line2: null, city: null, region: null, postalCode: null, country: null,
    });
  });

  it("drops a tag that is only whitespace", () => {
    const parsed = clientSchema.parse({ ...VALID, tags: ["vip", "   ", "repeat"] });
    expect(toClientPayload(parsed).tags).toEqual(["vip", "repeat"]);
  });
});

describe("clientFormFromFormData", () => {
  function formOf(entries: [string, string][]): FormData {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  }

  it("zips the repeated date inputs by position", () => {
    const form = formOf([
      ["dateLabel", "Anniversary"], ["dateValue", "2020-06-12"],
      ["dateLabel", "Passport"], ["dateValue", "2027-02-14"],
      // Only CHECKED boxes post, and the value is the row's render index — which is what
      // makes "the second row recurs, the first does not" survive the round trip.
      ["dateRecurring", "0"],
    ]);
    expect(clientFormFromFormData(form).importantDates).toEqual([
      { label: "Anniversary", date: "2020-06-12", recurring: true },
      { label: "Passport", date: "2027-02-14", recurring: false },
    ]);
  });

  it("drops a row where BOTH the label and the date are blank", () => {
    // Somebody who added a row and changed their mind is not an error.
    const form = formOf([
      ["dateLabel", "Anniversary"], ["dateValue", "2020-06-12"],
      ["dateLabel", ""], ["dateValue", ""],
    ]);
    expect(clientFormFromFormData(form).importantDates).toHaveLength(1);
  });

  it("keeps a HALF-filled row so validation can complain about it", () => {
    const form = formOf([["dateLabel", "Anniversary"], ["dateValue", ""]]);
    const values = clientFormFromFormData(form);
    expect(values.importantDates).toHaveLength(1);
    expect(clientSchema.safeParse(values).success).toBe(false);
  });

  it("lower-cases and drops blank tags", () => {
    const form = formOf([["tag", "VIP"], ["tag", "  "], ["tag", "Honeymoon"]]);
    expect(clientFormFromFormData(form).tags).toEqual(["vip", "honeymoon"]);
  });

  it("reads an empty form as the empty shape rather than throwing", () => {
    expect(clientFormFromFormData(new FormData())).toEqual(EMPTY_CLIENT_FORM);
  });
});
