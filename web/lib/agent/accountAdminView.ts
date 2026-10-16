/**
 * §3.9 Login Support: Client Detail's Account admin tab (Screens 3.9.1 to 3.9.6).
 * Rulings: docs/Screen-Inventory.md §3.9 (2026-10-16).
 *
 * ONE READ, `agent_client_account_admin`, which answers `{needsMfa}` and nothing else until the
 * session is aal2 (checked in the database from the verified JWT, not here). Everything this
 * file does after that is shaping: no decision about what an advisor may do is made in the
 * browser that the `account-admin` Edge Function does not make again.
 *
 * PURE: no server imports, so the tab's client island can import these values. The loader is
 * `accountAdmin.ts`.
 */

/** The snapshot as `account_admin_target()` builds it (keys are camelCase in the SQL). */
export type AccountAdminRow = {
  needsMfa: boolean;
  agentHasFactor?: boolean;
  clientId?: string;
  firstName?: string | null;
  clientEmail?: string | null;
  clientArchived?: boolean;
  duplicateEmail?: boolean;
  duplicateEmailClientId?: string | null;
  signInEmailsLastHour?: number;
  hasSignIn?: boolean;
  agentTimeZone?: string | null;
  accountId?: string;
  signInEmail?: string | null;
  emailVerifiedAt?: string | null;
  invitedAt?: string | null;
  hasPassword?: boolean;
  providers?: string[];
  mfaEnrolled?: boolean;
  lockedAt?: string | null;
  lockedReason?: string | null;
  lastLoginAt?: string | null;
  sessions?: { id: string; startedAt: string; lastActiveAt: string; userAgent: string | null; ip: string | null }[];
  activity?: { id: string; at: string; userAgent: string | null; ip: string | null; flagged: boolean }[];
};

export const SIGN_IN_EMAILS_PER_HOUR = 3;

export type AccountSession = { id: string; device: string; ip: string | null; lastActive: string };
export type AccountSignIn = { id: string; when: string; device: string; ip: string | null; flagged: boolean };

export type AccountAdminView =
  | { kind: "needs-mfa"; agentHasFactor: boolean }
  | {
      kind: "no-sign-in";
      firstName: string;
      email: string | null;
      archived: boolean;
      duplicate: { any: boolean; clientId: string | null };
      sendsLeft: number;
    }
  | {
      kind: "account";
      firstName: string;
      email: string;
      emailVerified: boolean;
      invitePending: boolean;
      /** "Google", "Apple", or null for an email-and-password sign-in. */
      socialOnly: string | null;
      hasPassword: boolean;
      mfaOn: boolean;
      locked: { reason: string | null; since: string } | null;
      lastSignIn: string | null;
      sessions: AccountSession[];
      activity: AccountSignIn[];
      duplicate: { any: boolean; clientId: string | null };
      sendsLeft: number;
    };

/**
 * A short device name from a user agent, the way A396 draws it ("iPhone · Safari"). Not a full
 * parser: no new dependency for a label (CLAUDE.md asks for a review before any SDK), and a
 * wrong guess costs a less specific word, never a wrong decision, because nothing branches on it.
 */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return "Unknown device";
  const s = ua;

  // Our own phone app talks to GoTrue through Ktor; there is no browser to name.
  if (/ktor[- ]client|supabase-kt/i.test(s)) return "Story-Tail app";

  const device =
    /iPhone/.test(s) ? "iPhone"
    : /iPad/.test(s) ? "iPad"
    : /Android/.test(s) ? "Android"
    : /Macintosh|Mac OS X/.test(s) ? "Mac"
    : /Windows/.test(s) ? "Windows"
    : /CrOS/.test(s) ? "Chromebook"
    : /Linux/.test(s) ? "Linux"
    : null;

  // Order matters: Edge and Chrome both say "Safari", Chrome says "Safari" too.
  const browser =
    /Edg\//.test(s) ? "Edge"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox"
    : /OPR\//.test(s) ? "Opera"
    : /Chrome\/|CriOS/.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari"
    : null;

  if (device && browser) return `${device} · ${browser}`;
  return device ?? browser ?? "Unknown device";
}

/** "Oct 16 · 3:42 PM" in the advisor's zone; "Today · …" / "Yesterday · …" when close. */
export function whenLabel(iso: string, timeZone: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  const today = day(now);
  const yesterday = day(new Date(now.getTime() - 86_400_000));
  const d = day(at);
  if (d === today) return `Today · ${time}`;
  if (d === yesterday) return `Yesterday · ${time}`;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(d.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(at);
  return `${date} · ${time}`;
}

const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple" };

export function toAccountAdminView(row: AccountAdminRow, now: Date = new Date()): AccountAdminView {
  if (row.needsMfa) return { kind: "needs-mfa", agentHasFactor: Boolean(row.agentHasFactor) };

  const tz = row.agentTimeZone || "America/New_York";
  const firstName = row.firstName?.trim() || "this client";
  const duplicate = { any: Boolean(row.duplicateEmail), clientId: row.duplicateEmailClientId ?? null };
  const sendsLeft = Math.max(0, SIGN_IN_EMAILS_PER_HOUR - (row.signInEmailsLastHour ?? 0));

  if (!row.hasSignIn) {
    return {
      kind: "no-sign-in",
      firstName,
      email: row.clientEmail ?? null,
      archived: Boolean(row.clientArchived),
      duplicate,
      sendsLeft,
    };
  }

  const providers = (row.providers ?? []).filter((p) => p !== "email");
  const social = providers.map((p) => PROVIDER_NAMES[p]).find(Boolean) ?? null;
  const latest = row.activity?.[0];

  return {
    kind: "account",
    firstName,
    email: row.signInEmail ?? row.clientEmail ?? "",
    emailVerified: Boolean(row.emailVerifiedAt),
    invitePending: !row.emailVerifiedAt && Boolean(row.invitedAt),
    socialOnly: row.hasPassword ? null : social,
    hasPassword: Boolean(row.hasPassword),
    mfaOn: Boolean(row.mfaEnrolled),
    locked: row.lockedAt ? { reason: row.lockedReason ?? null, since: whenLabel(row.lockedAt, tz, now) } : null,
    lastSignIn: row.lastLoginAt
      ? `${whenLabel(row.lastLoginAt, tz, now)}${latest ? ` · ${deviceLabel(latest.userAgent)}` : ""}`
      : null,
    sessions: (row.sessions ?? []).map((s) => ({
      id: s.id,
      device: deviceLabel(s.userAgent),
      ip: s.ip,
      lastActive: whenLabel(s.lastActiveAt, tz, now),
    })),
    activity: (row.activity ?? []).map((a) => ({
      id: a.id,
      when: whenLabel(a.at, tz, now),
      device: deviceLabel(a.userAgent),
      ip: a.ip,
      flagged: a.flagged,
    })),
    duplicate,
    sendsLeft,
  };
}

