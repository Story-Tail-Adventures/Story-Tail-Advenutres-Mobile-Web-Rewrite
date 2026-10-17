/**
 * §3.12 Agent Settings: the rules for what an advisor may save (Screens 3.12.1, 3.12.2).
 * Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17).
 *
 * PARALLEL IMPLEMENTATION. `web/lib/agent/settingsRules.ts` holds the same rules so the form
 * can say what is wrong before a round trip. Deno cannot import from web/, so the same vectors
 * are asserted in `agentSettings_test.ts` and `web/lib/agent/settingsRules.test.ts`; change one,
 * change both. The database checks the shapes too (agent_weekly_schedule_valid,
 * agent_social_links_valid), so a disagreement fails loudly rather than storing junk.
 */
import { badRequest } from "./problem.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

export const MAX_NAME = 80;
export const MAX_PRONOUNS = 30;
export const MAX_PHONE = 30;
export const MAX_BIO = 600;
export const MAX_LINK = 300;

export const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin", "website"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  website: "Website",
};

/** The hosts a link for each named network must live on. Website may be anywhere. */
const NETWORK_HOSTS: Record<Exclude<SocialNetwork, "website">, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  linkedin: ["linkedin.com"],
};

/** Trimmed text, or null when empty. Refuses anything longer than `max`. */
export function readOptionalText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`${label} didn't come through. Reload and try again.`);
  const t = value.trim();
  if (t === "") return null;
  if (t.length > max) throw badRequest(`${label} can be up to ${max} characters.`);
  return t;
}

export function readDisplayName(value: unknown): string {
  const t = readOptionalText(value, MAX_NAME, "Your name");
  if (!t) throw badRequest("Add the name clients will see.");
  return t;
}

/** Digits and the usual phone punctuation only: it is printed as typed in the signature. */
export function readPhone(value: unknown): string | null {
  const t = readOptionalText(value, MAX_PHONE, "Phone");
  if (t === null) return null;
  if (!/^[0-9+()\-. x]+$/i.test(t) || (t.match(/[0-9]/g) ?? []).length < 7) {
    throw badRequest("That phone number doesn't look right. Use digits, spaces, + - ( ) or .");
  }
  return t;
}

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/**
 * One social link, normalised to a full https URL, or null when left empty.
 *
 * - "@name" or a bare "name" for Instagram becomes https://instagram.com/name; Facebook the same.
 * - A link with no scheme ("story-tail.com", "linkedin.com/in/x") gets https:// in front.
 * - http:// is refused rather than upgraded: a silent upgrade can point at a page that is
 *   not there, and the advisor would never know.
 * - Instagram, Facebook and LinkedIn links must be on that network's own site, so a link
 *   labelled "Instagram" can never send a client somewhere else.
 */
export function normalizeSocialLink(network: SocialNetwork, value: unknown): string | null {
  const label = NETWORK_LABEL[network];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`${label} didn't come through. Reload and try again.`);
  let t = value.trim();
  if (t === "") return null;

  const handle = /^@?([A-Za-z0-9._]{1,60})$/.exec(t);
  // "instagram.com" alone is the site, not a handle; it falls through and is refused below.
  const bareSite = /^(www\.)?(instagram|facebook|fb)\.com$/i.test(t.replace(/^@/, ""));
  if (handle && !bareSite && (network === "instagram" || network === "facebook") && !handle[1].includes("..")) {
    // A bare word with a dot in it ("story.tail") is still a handle on these two networks;
    // a domain needs the scheme or a slash to be read as one.
    t = `https://${network === "instagram" ? "instagram.com" : "facebook.com"}/${handle[1]}`;
  } else if (/^http:\/\//i.test(t)) {
    throw badRequest(`Use the https:// address for ${label}.`);
  } else if (!/^https:\/\//i.test(t)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) throw badRequest(`${label} should be a web link.`);
    t = `https://${t}`;
  }

  if (t.length > MAX_LINK) throw badRequest(`${label} link is too long.`);
  if (/[\s<>"]/.test(t)) throw badRequest(`${label} link has a space or a symbol that won't work in a link.`);

  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw badRequest(`${label} doesn't look like a link.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) {
    throw badRequest(`${label} doesn't look like a link.`);
  }
  if (network !== "website" && !hostMatches(url.hostname, NETWORK_HOSTS[network])) {
    throw badRequest(`${label} should be a link on ${NETWORK_HOSTS[network][0]}.`);
  }
  if (network !== "website" && url.pathname.replace(/\/+$/, "") === "") {
    throw badRequest(`Add your handle or the link to your ${label} page.`);
  }
  return t.replace(/^https:\/\//i, "https://");
}

export function readSocialLinks(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw badRequest("Your links didn't come through. Reload and try again.");
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) {
    if (!(SOCIAL_NETWORKS as readonly string[]).includes(key)) throw badRequest("We don't have a spot for that link yet.");
  }
  const out: Record<string, string> = {};
  for (const n of SOCIAL_NETWORKS) {
    const link = normalizeSocialLink(n, v[n]);
    if (link) out[n] = link;
  }
  return out;
}

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * §3.12.2 (Q9): North American zones only (USD / North America business). The label is what
 * the picker shows. Order is east to west, then the islands.
 */
export const NORTH_AMERICAN_TIME_ZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "America/St_Johns", label: "Newfoundland (St. John's)" },
  { id: "America/Halifax", label: "Atlantic (Halifax)" },
  { id: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Toronto", label: "Eastern (Toronto)" },
  { id: "America/Cancun", label: "Eastern (Cancún)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/Winnipeg", label: "Central (Winnipeg)" },
  { id: "America/Mexico_City", label: "Central (Mexico City)" },
  { id: "America/Regina", label: "Central, no daylight saving (Regina)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Edmonton", label: "Mountain (Edmonton)" },
  { id: "America/Phoenix", label: "Mountain, no daylight saving (Phoenix)" },
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "America/Vancouver", label: "Pacific (Vancouver)" },
  { id: "America/Tijuana", label: "Pacific (Tijuana)" },
  { id: "America/Anchorage", label: "Alaska (Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export function readTimeZone(value: unknown): string {
  if (typeof value !== "string" || !NORTH_AMERICAN_TIME_ZONES.some((z) => z.id === value)) {
    throw badRequest("Pick a time zone from the list.");
  }
  return value;
}

export const RESPONSE_TIME_CHOICES = [2, 4, 12, 24, 48] as const;

export function readResponseTime(value: unknown): number {
  if (typeof value !== "number" || !(RESPONSE_TIME_CHOICES as readonly number[]).includes(value)) {
    throw badRequest("Pick how soon you usually reply from the list.");
  }
  return value;
}

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const DAY_NAME: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type DayHours = { start: string; end: string } | null;
export type WeeklySchedule = Record<Weekday, DayHours>;

const START = /^([01][0-9]|2[0-3]):(00|30)$/;
const END = /^(([01][0-9]|2[0-3]):(00|30)|24:00)$/;

/** Exactly the database's agent_weekly_schedule_valid(), with a sentence for the advisor. */
export function readWeeklySchedule(value: unknown): WeeklySchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Set hours for each day, or mark it Off.");
  }
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort();
  if (keys.join() !== [...WEEKDAYS].sort().join()) {
    throw badRequest("Set hours for each day, or mark it Off.");
  }
  const out = {} as WeeklySchedule;
  for (const day of WEEKDAYS) {
    const d = v[day];
    if (d === null) {
      out[day] = null;
      continue;
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) throw badRequest("Each day is either off or a From and To time.");
    const dd = d as Record<string, unknown>;
    if (Object.keys(dd).sort().join() !== "end,start") throw badRequest("Each day is either off or a From and To time.");
    const { start, end } = dd;
    if (typeof start !== "string" || typeof end !== "string" || !START.test(start) || !END.test(end)) {
      throw badRequest("Working hours go in half-hour steps.");
    }
    if (start >= end) throw badRequest(`${DAY_NAME[day]}'s hours have to end after they start.`);
    out[day] = { start, end };
  }
  return out;
}

// ── Out of office ────────────────────────────────────────────────────────────

export const MAX_TIME_OFF_LABEL = 80;
/** A single block longer than a year is almost certainly a typo in the year. */
export const MAX_TIME_OFF_DAYS = 366;

/** A calendar date "YYYY-MM-DD" that really exists (no 2026-02-30). */
export function readDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} should be a date.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw badRequest(`${label} isn't a real date.`);
  return value;
}

export function readTimeOffDates(startsOn: unknown, endsOn: unknown): { startsOn: string; endsOn: string } {
  const s = readDate(startsOn, "The first day away");
  const e = readDate(endsOn, "The last day away");
  if (e < s) throw badRequest("The last day away can't be before the first.");
  const days = (Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_TIME_OFF_DAYS) throw badRequest("Time away can be up to a year. Check the dates.");
  return { startsOn: s, endsOn: e };
}

// ── Photo ────────────────────────────────────────────────────────────────────

/** The browser sends a 400×400 image it made; this is generous headroom for that. */
export const MAX_AVATAR_BYTES = 1_048_576;

export type AvatarImage = { bytes: Uint8Array; contentType: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** The type by the file's own first bytes, never by what the sender says it is. */
export function sniffImage(bytes: Uint8Array): AvatarImage | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { bytes, contentType: "image/jpeg", ext: "jpg" };
  }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) {
    return { bytes, contentType: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(at(0), at(1), at(2), at(3)) === "RIFF" &&
    String.fromCharCode(at(8), at(9), at(10), at(11)) === "WEBP"
  ) {
    return { bytes, contentType: "image/webp", ext: "webp" };
  }
  return null;
}

export function readAvatar(value: unknown): AvatarImage {
  if (typeof value !== "string" || value === "") throw badRequest("Choose a photo first.");
  // base64 is 4/3 the size; refuse before decoding something huge.
  if (value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 4) throw badRequest("That photo is too large. Try a smaller one.");
  let bytes: Uint8Array;
  try {
    const bin = atob(value);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw badRequest("That photo didn't come through. Try again.");
  }
  if (bytes.length > MAX_AVATAR_BYTES) throw badRequest("That photo is too large. Try a smaller one.");
  const img = sniffImage(bytes);
  if (!img) throw badRequest("Use a JPG, PNG or WebP photo.");
  return img;
}

export const AVATAR_BUCKET = "agent-avatars";

/** The object key inside the bucket for a stored avatar path of ours, or null for anything else. */
export function avatarKeyFromUrl(url: string | null, agentId: string): string | null {
  if (!url) return null;
  const m = /^\/storage\/v1\/object\/public\/agent-avatars\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/.exec(url);
  if (!m || m[1] !== agentId) return null;
  return `${m[1]}/${m[2]}`;
}

// ── Notifications (3.12.3) ───────────────────────────────────────────────────

export function readSwitch(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw badRequest(`${label} didn't come through. Reload and try again.`);
  return value;
}

// ── Signature (3.12.4) ───────────────────────────────────────────────────────

export const MAX_SIGNATURE = 500;
export const MAX_SIGNATURE_LINES = 8;
export const SIGNATURE_FIELDS = ["agent.name", "agent.phone", "agent.email"] as const;

/** The merge fields a signature names that are not one of the three, as typed inside the braces. */
export function unknownSignatureFields(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!(SIGNATURE_FIELDS as readonly string[]).includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Plain text (Q19): at most 8 lines and 500 characters, only the three merge fields. Empty (or
 * missing) means "use the default". Trailing spaces and blank lines at either end are dropped.
 */
export function readSignature(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest("Your signature didn't come through. Reload and try again.");
  const t = value.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").replace(/^\n+|\n+$/g, "");
  if (t.trim() === "") return null;
  if (t.length > MAX_SIGNATURE) throw badRequest(`A signature can be up to ${MAX_SIGNATURE} characters.`);
  if (t.split("\n").length > MAX_SIGNATURE_LINES) throw badRequest(`A signature can be up to ${MAX_SIGNATURE_LINES} lines.`);
  const unknown = unknownSignatureFields(t);
  if (unknown.length > 0) {
    throw badRequest(`We don't have a {{${unknown[0]}}} field. You can use {{agent.name}}, {{agent.phone}} or {{agent.email}}.`);
  }
  return t;
}

// ── Out-of-office auto-reply ─────────────────────────────────────────────────

export const MAX_AUTO_REPLY = 600;

/** On or off, and the words when on (Q21). Only `{{return_date}}` may be filled. */
export function readAutoReply(enabled: unknown, text: unknown): { enabled: boolean; text: string | null } {
  const on = enabled === true;
  if (enabled !== undefined && enabled !== null && typeof enabled !== "boolean") {
    throw badRequest("The automatic reply didn't come through. Reload and try again.");
  }
  if (text !== undefined && text !== null && typeof text !== "string") {
    throw badRequest("The automatic reply didn't come through. Reload and try again.");
  }
  const t = typeof text === "string" ? text.trim() : "";
  if (t.length > MAX_AUTO_REPLY) throw badRequest(`An automatic reply can be up to ${MAX_AUTO_REPLY} characters.`);
  for (const m of t.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (m[1] !== "return_date") {
      throw badRequest(`We don't have a {{${m[1]}}} field. You can use {{return_date}}.`);
    }
  }
  if (on && t === "") throw badRequest("Add the words for your automatic reply, or turn it off.");
  return { enabled: on, text: t === "" ? null : t };
}
