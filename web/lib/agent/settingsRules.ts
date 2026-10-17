/**
 * §3.12 Agent Settings: what an advisor may save (Screens 3.12.1, 3.12.2).
 *
 * PURE DATA AND FUNCTIONS: imported by "use client" forms, so no React, MUI, Next or server
 * imports here.
 *
 * PARALLEL IMPLEMENTATION of `supabase/functions/_shared/agentSettings.ts`, which is the one
 * that decides; this copy lets the form say what is wrong before a round trip. The same
 * vectors are asserted in `settingsRules.test.ts` and `agentSettings_test.ts`; change one,
 * change both.
 */

export class SettingsRuleError extends Error {}

export const MAX_NAME = 80;
export const MAX_PRONOUNS = 30;
export const MAX_PHONE = 30;
export const MAX_BIO = 600;
export const MAX_LINK = 300;
export const MAX_TIME_OFF_LABEL = 80;

export const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin", "website"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export type SocialLinks = Partial<Record<SocialNetwork, string>>;

export const NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  website: "Website",
};

const NETWORK_HOSTS: Record<Exclude<SocialNetwork, "website">, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  linkedin: ["linkedin.com"],
};

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** The server's normalizeSocialLink, word for word. Null when left empty. */
export function normalizeSocialLink(network: SocialNetwork, value: string): string | null {
  const label = NETWORK_LABEL[network];
  let t = value.trim();
  if (t === "") return null;

  const handle = /^@?([A-Za-z0-9._]{1,60})$/.exec(t);
  // "instagram.com" alone is the site, not a handle; it falls through and is refused below.
  const bareSite = /^(www\.)?(instagram|facebook|fb)\.com$/i.test(t.replace(/^@/, ""));
  if (handle && !bareSite && (network === "instagram" || network === "facebook") && !handle[1].includes("..")) {
    t = `https://${network === "instagram" ? "instagram.com" : "facebook.com"}/${handle[1]}`;
  } else if (/^http:\/\//i.test(t)) {
    throw new SettingsRuleError(`Use the https:// address for ${label}.`);
  } else if (!/^https:\/\//i.test(t)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) throw new SettingsRuleError(`${label} should be a web link.`);
    t = `https://${t}`;
  }

  if (t.length > MAX_LINK) throw new SettingsRuleError(`${label} link is too long.`);
  if (/[\s<>"]/.test(t)) throw new SettingsRuleError(`${label} link has a space or a symbol that won't work in a link.`);

  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new SettingsRuleError(`${label} doesn't look like a link.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) {
    throw new SettingsRuleError(`${label} doesn't look like a link.`);
  }
  if (network !== "website" && !hostMatches(url.hostname, NETWORK_HOSTS[network])) {
    throw new SettingsRuleError(`${label} should be a link on ${NETWORK_HOSTS[network][0]}.`);
  }
  if (network !== "website" && url.pathname.replace(/\/+$/, "") === "") {
    throw new SettingsRuleError(`Add your handle or the link to your ${label} page.`);
  }
  return t.replace(/^https:\/\//i, "https://");
}

/** A phone number as typed, or the sentence saying why not. Mirrors readPhone. */
export function phoneProblem(value: string): string | null {
  const t = value.trim();
  if (t === "") return null;
  if (t.length > MAX_PHONE) return `Phone can be up to ${MAX_PHONE} characters.`;
  if (!/^[0-9+()\-. x]+$/i.test(t) || (t.match(/[0-9]/g) ?? []).length < 7) {
    return "That phone number doesn't look right. Use digits, spaces, + - ( ) or .";
  }
  return null;
}

// ── Availability ─────────────────────────────────────────────────────────────

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

export const RESPONSE_TIME_CHOICES = [2, 4, 12, 24, 48] as const;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { start: string; end: string } | null;
export type WeeklySchedule = Record<Weekday, DayHours>;

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** §3.12.2's default: Monday to Saturday 7am to 9pm, Sunday off. */
export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  mon: { start: "07:00", end: "21:00" },
  tue: { start: "07:00", end: "21:00" },
  wed: { start: "07:00", end: "21:00" },
  thu: { start: "07:00", end: "21:00" },
  fri: { start: "07:00", end: "21:00" },
  sat: { start: "07:00", end: "21:00" },
  sun: null,
};

const START = /^([01][0-9]|2[0-3]):(00|30)$/;
const END = /^(([01][0-9]|2[0-3]):(00|30)|24:00)$/;

/** Every half hour as "HH:MM"; starts stop at 23:30, ends run to 24:00. */
export const HALF_HOURS: readonly string[] = Array.from({ length: 49 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);

/** "07:00" → "7am", "21:30" → "9:30pm", "24:00" → "midnight", "12:00" → "noon". */
export function timeLabel(hhmm: string): string {
  if (hhmm === "24:00" || hhmm === "00:00") return "midnight";
  if (hhmm === "12:00") return "noon";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** The sentence for the first thing wrong with a schedule, or null. Mirrors readWeeklySchedule. */
export function scheduleProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Set hours for each day, or mark it Off.";
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== [...WEEKDAYS].sort().join()) return "Set hours for each day, or mark it Off.";
  for (const day of WEEKDAYS) {
    const d = v[day];
    if (d === null) continue;
    if (!d || typeof d !== "object" || Array.isArray(d)) return "Each day is either off or a From and To time.";
    const dd = d as Record<string, unknown>;
    if (Object.keys(dd).sort().join() !== "end,start") return "Each day is either off or a From and To time.";
    const { start, end } = dd;
    if (typeof start !== "string" || typeof end !== "string" || !START.test(start) || !END.test(end)) {
      return "Working hours go in half-hour steps.";
    }
    if (start >= end) return `${WEEKDAY_LABEL[day]}'s hours have to end after they start.`;
  }
  return null;
}

// ── Out of office ────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Mirrors readTimeOffDates, plus the database's "not before today". */
export function timeOffProblem(startsOn: string, endsOn: string, today: string): string | null {
  if (!isRealDate(startsOn)) return "Pick the first day away.";
  if (!isRealDate(endsOn)) return "Pick the last day away.";
  if (endsOn < startsOn) return "The last day away can't be before the first.";
  if (startsOn < today) return "Time away can start today or later.";
  const days = (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 366) return "Time away can be up to a year. Check the dates.";
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul 4 – Jul 7", "Jul 4", or "Dec 24 – Jan 2, 2027" when it crosses into another year. */
export function dateRangeLabel(startsOn: string, endsOn: string, today: string): string {
  const fmt = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  if (startsOn === endsOn) return fmt(startsOn);
  const otherYear = endsOn.slice(0, 4) !== startsOn.slice(0, 4) || startsOn.slice(0, 4) !== today.slice(0, 4);
  return `${fmt(startsOn)} – ${fmt(endsOn)}${otherYear ? `, ${endsOn.slice(0, 4)}` : ""}`;
}

/** "upcoming", "running" (started, not over) or "past", in the advisor's own days. */
export function timeOffPhase(startsOn: string, endsOn: string, today: string): "upcoming" | "running" | "past" {
  if (endsOn < today) return "past";
  return startsOn <= today ? "running" : "upcoming";
}
