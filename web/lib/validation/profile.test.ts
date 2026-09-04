import { describe, expect, it } from "vitest";
import { flattenIssues } from "./flatten";
import {
  PROFILE_FIELDS,
  PROFILE_MESSAGES,
  normalizePhone,
  profileSchema,
  toProfilePayload,
} from "./profile";

/**
 * Screen 2.1.10's rules.
 *
 * The three group rules are the reason this file exists. Each of them protects a NOT NULL
 * column or a promise made to the traveler, and each is easy to break by moving one field
 * out of a group — so they are asserted from the outside, through the same `safeParse` +
 * `flattenIssues` path the action uses.
 */

const BLANK = {
  phone: "",
  dateOfBirth: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressRegion: "",
  addressPostalCode: "",
  addressCountry: "US",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  passportExpiry: "",
  passportCountry: "",
};

function parse(over: Partial<typeof BLANK> = {}) {
  return profileSchema.safeParse({ ...BLANK, ...over });
}

function errors(over: Partial<typeof BLANK> = {}) {
  const result = parse(over);
  if (result.success) return {};
  return flattenIssues(result.error, PROFILE_FIELDS);
}

describe("normalizePhone", () => {
  it("treats an empty field as nothing rather than as a mistake", () => {
    expect(normalizePhone("   ")).toEqual({ ok: true, value: null });
  });

  it.each([
    ["+1 (305) 555-0184", "+13055550184"],
    ["(305) 555-0184", "+13055550184"],
    ["305.555.0184", "+13055550184"],
    ["1 305 555 0184", "+13055550184"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, value: expected });
  });

  it("asks for a country code rather than guessing at a foreign number", () => {
    // A London number typed the way a Londoner types it: eleven digits starting 0. It is
    // not a US number, and guessing +1 would store one that silently never rings.
    expect(normalizePhone("020 7946 0958")).toEqual({
      ok: false,
      message: PROFILE_MESSAGES.phoneNeedsCountryCode,
    });
  });

  it.each([["not a phone"], ["+"], ["+1234"], ["+1234567890123456"]])(
    "rejects %s",
    (input) => {
      expect(normalizePhone(input).ok).toBe(false);
    },
  );

  it.each([
    // Ten digits that cannot ring anywhere. A NANP area code and exchange code both begin
    // 2-9, so guessing +1 on these would store a well-formed number nobody could tell from
    // a real one — on, among other fields, an emergency contact.
    ["1234567890", "area code starting 1"],
    ["0234567890", "area code starting 0"],
    ["3050550184", "exchange code starting 0"],
    ["3051550184", "exchange code starting 1"],
    ["11234567890", "a leading 1 in front of an impossible area code"],
  ])("refuses %s (%s) rather than guessing +1 at it", (input) => {
    expect(normalizePhone(input)).toEqual({
      ok: false,
      message: PROFILE_MESSAGES.phoneInvalid,
    });
  });

  it("keeps accepting a real North American number", () => {
    expect(normalizePhone("13055550184")).toEqual({ ok: true, value: "+13055550184" });
  });

  it("takes an explicit country code at its word, NANP shape or not", () => {
    // We only guess for North America. A +1 somebody typed themselves is their claim to
    // make, and every other country has its own numbering plan we do not model.
    expect(normalizePhone("+11234567890")).toEqual({ ok: true, value: "+11234567890" });
  });

  it("never lets a control character through", () => {
    expect(normalizePhone("3055550184\u0007").ok).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts an entirely empty form — every field here is optional", () => {
    expect(parse().success).toBe(true);
  });

  it("does not treat the pre-selected country as somebody having typed an address", () => {
    // The picker starts on US. If that counted as intent, an untouched form would fail.
    expect(errors({ addressCountry: "US" }).address).toBeUndefined();
  });

  it("refuses a half-written address, on the group and not on one input", () => {
    const result = errors({ addressLine1: "1240 Brickell Bay Dr" });
    expect(result.address).toEqual([PROFILE_MESSAGES.addressIncomplete]);
    expect(result.addressCity).toBeUndefined();
  });

  it("accepts an address once street, city and country are all there", () => {
    expect(
      errors({
        addressLine1: "1240 Brickell Bay Dr",
        addressCity: "Miami",
        addressCountry: "US",
      }),
    ).toEqual({});
  });

  it("refuses an emergency contact with a name and no way to reach them", () => {
    expect(errors({ emergencyName: "Sam Hayes" }).emergencyContact).toEqual([
      PROFILE_MESSAGES.emergencyIncomplete,
    ]);
  });

  it("refuses a phone number with nobody attached to it", () => {
    expect(errors({ emergencyPhone: "3055550186" }).emergencyContact).toEqual([
      PROFILE_MESSAGES.emergencyIncomplete,
    ]);
  });

  it("lets the relationship stay empty", () => {
    expect(errors({ emergencyName: "Sam Hayes", emergencyPhone: "3055550186" })).toEqual({});
  });

  it("refuses a passport country with no expiry — the expiry is the whole point", () => {
    expect(errors({ passportCountry: "US" }).passport).toEqual([
      PROFILE_MESSAGES.passportIncomplete,
    ]);
  });

  it("accepts an expiry with no country of issue", () => {
    expect(errors({ passportExpiry: "2029-08-14" })).toEqual({});
  });

  it("accepts an expiry already in the past — that record is why reminders exist", () => {
    expect(errors({ passportExpiry: "2019-08-14" })).toEqual({});
  });

  it("refuses a date of birth in the future", () => {
    expect(errors({ dateOfBirth: "2999-01-01" }).dateOfBirth).toEqual([
      PROFILE_MESSAGES.dobInvalid,
    ]);
  });

  it("refuses a day that does not exist", () => {
    expect(errors({ dateOfBirth: "2026-02-30" }).dateOfBirth).toEqual([
      PROFILE_MESSAGES.dobInvalid,
    ]);
  });

  it("has no minimum age — households travel together and children have records", () => {
    const fourYearsAgo = new Date();
    fourYearsAgo.setUTCFullYear(fourYearsAgo.getUTCFullYear() - 4);
    expect(errors({ dateOfBirth: fourYearsAgo.toISOString().slice(0, 10) })).toEqual({});
  });

  it("refuses a country that is not an assigned alpha-2 code", () => {
    // 'USA' is what the prototype shows, and a char(2) column would take the first two
    // letters of it without complaint.
    expect(errors({ addressCountry: "USA" }).addressCountry).toEqual([
      PROFILE_MESSAGES.countryInvalid,
    ]);
  });

  it("uppercases a lowercase country code rather than refusing it", () => {
    const result = parse({
      addressLine1: "1240 Brickell Bay Dr",
      addressCity: "Miami",
      addressCountry: "us",
    });
    expect(result.success && result.data.addressCountry).toBe("US");
  });

  it("accepts postal codes that are not five digits", () => {
    for (const postal of ["33131", "K1A 0B1", "SW1A 1AA"]) {
      expect(
        errors({
          addressLine1: "1 Test St",
          addressCity: "Somewhere",
          addressPostalCode: postal,
        }),
      ).toEqual({});
    }
  });
});

describe("toProfilePayload", () => {
  function payload(over: Partial<typeof BLANK> = {}) {
    const result = parse(over);
    if (!result.success) throw new Error("expected the form to parse");
    return toProfilePayload(result.data);
  }

  it("sends every key, so an emptied field clears rather than being ignored", () => {
    // The Edge Function reads an ABSENT key as "leave it alone", so a form that only sent
    // the fields somebody filled in could never remove an emergency contact.
    expect(payload()).toEqual({
      phone: null,
      dateOfBirth: null,
      address: null,
      emergencyContact: null,
      passport: null,
    });
  });

  it("sends a phone number in E.164, not as it was typed", () => {
    expect(payload({ phone: "(305) 555-0184" }).phone).toBe("+13055550184");
  });

  it("sends the address as the structured object the `address` table needs", () => {
    expect(
      payload({
        addressLine1: "1240 Brickell Bay Dr",
        addressLine2: "Apt 4B",
        addressCity: "Miami",
        addressRegion: "FL",
        addressPostalCode: "33131",
        addressCountry: "US",
      }).address,
    ).toEqual({
      line1: "1240 Brickell Bay Dr",
      line2: "Apt 4B",
      city: "Miami",
      region: "FL",
      postalCode: "33131",
      country: "US",
    });
  });

  it("normalises the emergency contact's phone too", () => {
    expect(
      payload({ emergencyName: "Sam Hayes", emergencyPhone: "(305) 555-0186" })
        .emergencyContact,
    ).toEqual({ name: "Sam Hayes", phone: "+13055550186", relationship: null });
  });

  it("never sends a passport number — there is no field and no key for one", () => {
    const sent = payload({ passportExpiry: "2029-08-14", passportCountry: "US" });
    expect(sent.passport).toEqual({ expiresOn: "2029-08-14", issuingCountry: "US" });
    expect(JSON.stringify(sent)).not.toContain("number");
  });
});
