/**
 * §3.12 PR 3 (Q11, Q14): the client's "Your advisor" card, shaped from `client_advisor_card()`.
 * PURE: client components import the types and labels; `advisorCardLoad.ts` (server only) reads.
 */
import { avatarSrc } from "@/lib/agent/avatarUrl";

export type AdvisorCardRow = {
  displayName?: string | null;
  firstName?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  avatarPath?: string | null;
  socialLinks?: Record<string, unknown> | null;
  responseTimeHours?: number | null;
  awayUntil?: string | null;
};

export const ADVISOR_LINK_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  website: "Website",
} as const;

export type AdvisorLink = { label: string; href: string };

export type AdvisorCardView = {
  firstName: string;
  displayName: string;
  pronouns: string | null;
  bio: string | null;
  /** Absolute, on the browser's Supabase origin; null means initials. */
  avatarUrl: string | null;
  initials: string;
  links: AdvisorLink[];
  /** "Usually replies within 4 hours". */
  replyLabel: string;
  /** "Away until Tuesday, October 20" while a block runs, else null. */
  awayLabel: string | null;
};

/** The promise clients see (Q13). A day and two days read better than 24 and 48 hours. */
export function replyLabel(hours: number | null | undefined): string {
  switch (hours) {
    case 2:
    case 4:
    case 12:
      return `Usually replies within ${hours} hours`;
    case 48:
      return "Usually replies within 2 days";
    default:
      return "Usually replies within a day";
  }
}

/** "Away until Tuesday, October 20": the first day back, read as a calendar date. */
export function awayLabel(firstDayBack: string | null | undefined): string | null {
  if (!firstDayBack || !/^\d{4}-\d{2}-\d{2}$/.test(firstDayBack)) return null;
  const d = new Date(`${firstDayBack}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `Away until ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

export function toAdvisorCard(row: AdvisorCardRow, supabaseOrigin: string): AdvisorCardView {
  const displayName = row.displayName?.trim() || "Your advisor";
  const links: AdvisorLink[] = [];
  for (const key of Object.keys(ADVISOR_LINK_LABELS) as Array<keyof typeof ADVISOR_LINK_LABELS>) {
    const href = row.socialLinks?.[key];
    // The database only ever holds https links (agent_social_links_valid); checked again so a
    // card can never render a javascript: or http: link.
    if (typeof href === "string" && /^https:\/\/[^\s<>"]+$/.test(href)) {
      links.push({ label: ADVISOR_LINK_LABELS[key], href });
    }
  }
  return {
    firstName: row.firstName?.trim() || displayName.split(/\s+/)[0],
    displayName,
    pronouns: row.pronouns?.trim() || null,
    bio: row.bio?.trim() || null,
    avatarUrl: avatarSrc(row.avatarPath ?? null, supabaseOrigin),
    initials: initialsOf(displayName),
    links,
    replyLabel: replyLabel(row.responseTimeHours),
    awayLabel: awayLabel(row.awayUntil),
  };
}
