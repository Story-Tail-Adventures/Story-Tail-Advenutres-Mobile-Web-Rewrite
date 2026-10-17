import { describe, expect, it } from "vitest";

import { avatarSrc } from "./avatarUrl";
import {
  autoReplyProblem,
  DEFAULT_SIGNATURE,
  DEFAULT_WEEKLY_SCHEDULE,
  returnDateLabel,
  signatureLines,
  signatureProblem,
  HALF_HOURS,
  dateRangeLabel,
  normalizeSocialLink,
  phoneProblem,
  scheduleProblem,
  SettingsRuleError,
  timeLabel,
  timeOffPhase,
  timeOffProblem,
  type SocialNetwork,
} from "./settingsRules";

// The SAME vectors as supabase/functions/_shared/agentSettings_test.ts. Change one, change both.
const LINK_VECTORS: Array<[SocialNetwork, string, string | null]> = [
  ["instagram", "@story.tail", "https://instagram.com/story.tail"],
  ["instagram", "story_tail", "https://instagram.com/story_tail"],
  ["instagram", "instagram.com/story.tail", "https://instagram.com/story.tail"],
  ["instagram", "https://www.instagram.com/story.tail/", "https://www.instagram.com/story.tail/"],
  ["facebook", "@storytail", "https://facebook.com/storytail"],
  ["linkedin", "linkedin.com/in/gyasistory", "https://linkedin.com/in/gyasistory"],
  ["website", "story-tail.com", "https://story-tail.com"],
  ["website", "HTTPS://story-tail.com/about", "https://story-tail.com/about"],
  ["website", "  ", null],
];
const BAD_LINKS: Array<[SocialNetwork, string]> = [
  ["website", "http://story-tail.com"],
  ["website", "javascript:alert(1)"],
  ["website", "https://story tail.com"],
  ["website", "https://user:pw@story-tail.com"],
  ["website", "localhost"],
  ["instagram", "https://evil.example.com/story"],
  ["linkedin", "gyasistory"],
  ["facebook", "https://facebook.com.evil.example/x"],
  ["instagram", "instagram.com"],
  ["instagram", "https://www.instagram.com/"],
];

describe("normalizeSocialLink (the server's vectors)", () => {
  it.each(LINK_VECTORS)("%s %j becomes %j", (network, input, want) => {
    expect(normalizeSocialLink(network, input)).toBe(want);
  });
  it.each(BAD_LINKS)("%s %j is refused", (network, input) => {
    expect(() => normalizeSocialLink(network, input)).toThrow(SettingsRuleError);
  });
});

describe("phoneProblem", () => {
  it("accepts a number as typed and an empty box", () => {
    expect(phoneProblem("+1 (305) 555-0184")).toBeNull();
    expect(phoneProblem("")).toBeNull();
  });
  it("refuses words and too few digits", () => {
    expect(phoneProblem("call me")).toMatch(/doesn't look right/);
    expect(phoneProblem("12345")).toMatch(/doesn't look right/);
  });
});

describe("scheduleProblem (the database's rules)", () => {
  it("passes the default and a full day", () => {
    expect(scheduleProblem(DEFAULT_WEEKLY_SCHEDULE)).toBeNull();
    expect(scheduleProblem({ ...DEFAULT_WEEKLY_SCHEDULE, mon: { start: "00:00", end: "24:00" } })).toBeNull();
  });
  it.each([
    [{}],
    [{ ...DEFAULT_WEEKLY_SCHEDULE, mon: {} }],
    [{ ...DEFAULT_WEEKLY_SCHEDULE, mon: { start: "09:15", end: "17:00" } }],
    [{ ...DEFAULT_WEEKLY_SCHEDULE, mon: { start: "17:00", end: "09:00" } }],
    [{ ...DEFAULT_WEEKLY_SCHEDULE, mon: { start: "24:00", end: "24:00" } }],
    [{ ...DEFAULT_WEEKLY_SCHEDULE, extra: null }],
  ])("refuses %j", (bad) => {
    expect(scheduleProblem(bad)).not.toBeNull();
  });
  it("names the day whose hours are backwards", () => {
    expect(scheduleProblem({ ...DEFAULT_WEEKLY_SCHEDULE, fri: { start: "17:00", end: "09:00" } }))
      .toBe("Friday's hours have to end after they start.");
  });
});

describe("time helpers", () => {
  it("lists every half hour from midnight to midnight", () => {
    expect(HALF_HOURS[0]).toBe("00:00");
    expect(HALF_HOURS.at(-1)).toBe("24:00");
    expect(HALF_HOURS).toHaveLength(49);
  });
  it("labels times the way people say them", () => {
    expect(timeLabel("07:00")).toBe("7am");
    expect(timeLabel("21:30")).toBe("9:30pm");
    expect(timeLabel("12:00")).toBe("noon");
    expect(timeLabel("24:00")).toBe("midnight");
  });
});

describe("out of office", () => {
  const today = "2026-10-17";
  it("checks dates the way the server does, plus not before today", () => {
    expect(timeOffProblem("2026-11-26", "2026-11-29", today)).toBeNull();
    expect(timeOffProblem("2026-10-17", "2026-10-17", today)).toBeNull();
    expect(timeOffProblem("2026-10-16", "2026-10-18", today)).toBe("Time away can start today or later.");
    expect(timeOffProblem("2026-11-29", "2026-11-26", today)).toBe("The last day away can't be before the first.");
    expect(timeOffProblem("2026-02-30", "2026-03-01", today)).toBe("Pick the first day away.");
    expect(timeOffProblem("2026-11-01", "2027-12-01", today)).toMatch(/up to a year/);
  });
  it("labels a range, with the year only when it leaves this one", () => {
    expect(dateRangeLabel("2026-07-04", "2026-07-07", "2026-06-01")).toBe("Jul 4 – Jul 7");
    expect(dateRangeLabel("2026-07-04", "2026-07-04", "2026-06-01")).toBe("Jul 4");
    expect(dateRangeLabel("2026-12-24", "2027-01-02", today)).toBe("Dec 24 – Jan 2, 2027");
  });
  it("knows upcoming, running and past in the advisor's days", () => {
    expect(timeOffPhase("2026-10-18", "2026-10-20", today)).toBe("upcoming");
    expect(timeOffPhase("2026-10-17", "2026-10-20", today)).toBe("running");
    expect(timeOffPhase("2026-10-10", "2026-10-16", today)).toBe("past");
  });
});


describe("avatarSrc", () => {
  it("puts a stored path on the browser's Supabase origin", () => {
    expect(avatarSrc("/storage/v1/object/public/agent-avatars/a/b.jpg", "http://127.0.0.1:56321"))
      .toBe("http://127.0.0.1:56321/storage/v1/object/public/agent-avatars/a/b.jpg");
  });
  it("draws nothing for anything that is not our bucket's path", () => {
    expect(avatarSrc("http://kong:8000/storage/v1/object/public/agent-avatars/a/b.jpg", "https://x.supabase.co")).toBeNull();
    expect(avatarSrc("//evil.example/x.jpg", "https://x.supabase.co")).toBeNull();
    expect(avatarSrc(null, "https://x.supabase.co")).toBeNull();
  });
});

describe("signature (3.12.4, the server's renderSignature)", () => {
  const me = { name: "Gyasi Story", phone: "+1 (305) 555-0184", email: "gyasi@story-tail.com" };
  it("fills the fields and ends with the locked line", () => {
    expect(signatureLines(DEFAULT_SIGNATURE, me)).toEqual([
      "Gyasi Story, Travel Advisor",
      "+1 (305) 555-0184 · gyasi@story-tail.com",
      "adventures.story-tail.com",
      "",
      "Making travel an adventure",
      "",
      "Story-Tail Adventures · Hosted by Inteletravel",
    ]);
  });
  it("tidies the separator a missing phone leaves", () => {
    expect(signatureLines(DEFAULT_SIGNATURE, { ...me, phone: "" })[1]).toBe("gyasi@story-tail.com");
  });
  it("checks length, lines and fields", () => {
    expect(signatureProblem(DEFAULT_SIGNATURE)).toBeNull();
    expect(signatureProblem("x\n".repeat(8) + "ninth")).toMatch(/8 lines/);
    expect(signatureProblem("x".repeat(501))).toMatch(/500 characters/);
    expect(signatureProblem("{{client.firstName}}")).toMatch(/We don't have a/);
  });
});

describe("auto-reply (Q21)", () => {
  it("needs words when on, and fills only {{return_date}}", () => {
    expect(autoReplyProblem(false, "")).toBeNull();
    expect(autoReplyProblem(true, "  ")).toMatch(/Add the words/);
    expect(autoReplyProblem(true, "Back {{agent.name}}")).toMatch(/We don't have a/);
    expect(autoReplyProblem(true, "Back {{return_date}}")).toBeNull();
  });
  it("names the day after the last day away", () => {
    expect(returnDateLabel("2026-07-07")).toBe("Wednesday, July 8");
  });
});
