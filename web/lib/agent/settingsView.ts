import {
  DEFAULT_WEEKLY_SCHEDULE,
  scheduleProblem,
  SOCIAL_NETWORKS,
  type SocialLinks,
  type WeeklySchedule,
} from "@/lib/agent/settingsRules";

/**
 * §3.12's view models, shaped from `agent_settings_self()`. Pure: the client forms import the
 * types, and `settings.ts` (server only) does the read.
 */

export type SettingsRow = {
  profile?: {
    displayName?: string | null;
    pronouns?: string | null;
    email?: string | null;
    phone?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    socialLinks?: Record<string, unknown> | null;
    emailSignature?: string | null;
  } | null;
  availability?: {
    timeZone?: string | null;
    weeklySchedule?: unknown;
    responseTimeHours?: number | null;
  } | null;
  today?: string | null;
  timeOff?: Array<{
    id: string;
    startsOn: string;
    endsOn: string;
    label?: string | null;
  }> | null;
};

export type ProfileView = {
  displayName: string;
  pronouns: string;
  email: string;
  phone: string;
  bio: string;
  avatarUrl: string | null;
  socialLinks: SocialLinks;
};

export type TimeOffView = { id: string; startsOn: string; endsOn: string; label: string };

export type AvailabilityView = {
  timeZone: string;
  weeklySchedule: WeeklySchedule;
  responseTimeHours: number;
  today: string;
  timeOff: TimeOffView[];
};

export type SettingsView = { profile: ProfileView; availability: AvailabilityView };

export function toSettingsView(row: SettingsRow): SettingsView {
  const p = row.profile ?? {};
  const a = row.availability ?? {};
  const links: SocialLinks = {};
  for (const n of SOCIAL_NETWORKS) {
    const v = p.socialLinks?.[n];
    if (typeof v === "string" && v !== "") links[n] = v;
  }
  const schedule = scheduleProblem(a.weeklySchedule) === null
    ? (a.weeklySchedule as WeeklySchedule)
    : DEFAULT_WEEKLY_SCHEDULE;
  return {
    profile: {
      displayName: p.displayName ?? "",
      pronouns: p.pronouns ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      bio: p.bio ?? "",
      avatarUrl: p.avatarUrl ?? null,
      socialLinks: links,
    },
    availability: {
      timeZone: a.timeZone ?? "America/Chicago",
      weeklySchedule: schedule,
      responseTimeHours: a.responseTimeHours ?? 24,
      today: row.today ?? new Date().toISOString().slice(0, 10),
      timeOff: (row.timeOff ?? []).map((t) => ({
        id: t.id,
        startsOn: t.startsOn,
        endsOn: t.endsOn,
        label: t.label ?? "",
      })),
    },
  };
}

/** "Gyasi Story" → "GS"; the fallback when there is no photo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
