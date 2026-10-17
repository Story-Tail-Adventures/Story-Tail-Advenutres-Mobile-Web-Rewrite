import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  avatarKeyFromUrl,
  normalizeSocialLink,
  readAvatar,
  readDisplayName,
  readPhone,
  readResponseTime,
  readSocialLinks,
  readTimeOffDates,
  readTimeZone,
  readWeeklySchedule,
  sniffImage,
} from "./agentSettings.ts";

function detailOf(fn: () => unknown): string {
  return assertThrows(fn, HttpError).detail ?? "";
}

// The SAME vectors as web/lib/agent/settingsRules.test.ts. Change one, change both.
const LINK_VECTORS: Array<[Parameters<typeof normalizeSocialLink>[0], string, string | null]> = [
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
const BAD_LINKS: Array<[Parameters<typeof normalizeSocialLink>[0], string]> = [
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

Deno.test("normalizeSocialLink: handles and bare domains become full https links", () => {
  for (const [n, input, want] of LINK_VECTORS) assertEquals(normalizeSocialLink(n, input), want, `${n} ${input}`);
});

Deno.test("normalizeSocialLink: refuses http, other schemes, and the wrong site for a network", () => {
  for (const [n, input] of BAD_LINKS) assertThrows(() => normalizeSocialLink(n, input), HttpError, undefined, `${n} ${input}`);
});

Deno.test("readSocialLinks: drops empties, refuses unknown networks", () => {
  assertEquals(readSocialLinks({ instagram: "@a.b", website: "" }), { instagram: "https://instagram.com/a.b" });
  assertEquals(readSocialLinks(undefined), {});
  assertThrows(() => readSocialLinks({ tiktok: "x" }), HttpError);
});

Deno.test("readDisplayName and readPhone", () => {
  assertEquals(readDisplayName("  Gyasi Story "), "Gyasi Story");
  assertThrows(() => readDisplayName(" "), HttpError);
  assertEquals(readPhone("+1 (305) 555-0184"), "+1 (305) 555-0184");
  assertEquals(readPhone(""), null);
  assertThrows(() => readPhone("call me"), HttpError);
  assertThrows(() => readPhone("12345"), HttpError);
});

const DEFAULT_WEEK = {
  mon: { start: "07:00", end: "21:00" },
  tue: { start: "07:00", end: "21:00" },
  wed: { start: "07:00", end: "21:00" },
  thu: { start: "07:00", end: "21:00" },
  fri: { start: "07:00", end: "21:00" },
  sat: { start: "07:00", end: "21:00" },
  sun: null,
};

Deno.test("readWeeklySchedule: the same rules as agent_weekly_schedule_valid()", () => {
  assertEquals(readWeeklySchedule(DEFAULT_WEEK), DEFAULT_WEEK);
  assertEquals(readWeeklySchedule({ ...DEFAULT_WEEK, mon: { start: "00:00", end: "24:00" } }).mon, {
    start: "00:00",
    end: "24:00",
  });
  for (const bad of [
    {},
    { ...DEFAULT_WEEK, sun: undefined },
    { ...DEFAULT_WEEK, mon: {} },
    { ...DEFAULT_WEEK, mon: { start: "09:15", end: "17:00" } },
    { ...DEFAULT_WEEK, mon: { start: "17:00", end: "09:00" } },
    { ...DEFAULT_WEEK, mon: { start: "24:00", end: "24:00" } },
    { ...DEFAULT_WEEK, mon: { start: "09:00", end: "17:00", x: 1 } },
    { ...DEFAULT_WEEK, extra: null },
  ]) {
    assertThrows(() => readWeeklySchedule(bad), HttpError, undefined, JSON.stringify(bad));
  }
});

Deno.test("readTimeZone and readResponseTime: lists only", () => {
  assertEquals(readTimeZone("America/Chicago"), "America/Chicago");
  assertThrows(() => readTimeZone("Europe/London"), HttpError);
  assertEquals(readResponseTime(24), 24);
  assertThrows(() => readResponseTime(3), HttpError);
  assertThrows(() => readResponseTime("24"), HttpError);
});

Deno.test("readTimeOffDates: real dates, in order, at most a year", () => {
  assertEquals(readTimeOffDates("2026-11-26", "2026-11-29"), { startsOn: "2026-11-26", endsOn: "2026-11-29" });
  assertEquals(readTimeOffDates("2026-11-26", "2026-11-26").endsOn, "2026-11-26");
  assertThrows(() => readTimeOffDates("2026-02-30", "2026-03-01"), HttpError);
  assertThrows(() => readTimeOffDates("2026-11-29", "2026-11-26"), HttpError);
  assertEquals(detailOf(() => readTimeOffDates("2026-01-01", "2027-06-01")), "Time away can be up to a year. Check the dates.");
});

Deno.test("sniffImage / readAvatar: by the first bytes, never the claimed type", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assertEquals(sniffImage(jpeg)?.ext, "jpg");
  assertEquals(sniffImage(png)?.ext, "png");
  assertEquals(sniffImage(webp)?.ext, "webp");
  assertEquals(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  assertEquals(readAvatar(b64(png)).contentType, "image/png");
  assertThrows(() => readAvatar(b64(new TextEncoder().encode("GIF89a..."))), HttpError);
  assertThrows(() => readAvatar("not base64!!"), HttpError);
  assertThrows(() => readAvatar("A".repeat(2_000_000)), HttpError);
});

Deno.test("avatarKeyFromUrl: only a stored path in our bucket and this advisor's folder", () => {
  const me = "0195a2c0-1a00-7000-8000-000000000001";
  const file = "0195a2c0-1a00-7000-8000-0000000000ff.jpg";
  assertEquals(avatarKeyFromUrl(`/storage/v1/object/public/agent-avatars/${me}/${file}`, me), `${me}/${file}`);
  assertEquals(avatarKeyFromUrl(`/storage/v1/object/public/agent-avatars/0195a2c0-1a00-7000-8000-000000000002/${file}`, me), null);
  assertEquals(avatarKeyFromUrl(`http://kong:8000/storage/v1/object/public/agent-avatars/${me}/${file}`, me), null);
  assertEquals(avatarKeyFromUrl("https://cdn.example.com/me.jpg", me), null);
  assertEquals(avatarKeyFromUrl(null, me), null);
});
