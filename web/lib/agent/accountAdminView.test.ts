import { describe, expect, it } from "vitest";

import { type AccountAdminRow, deviceLabel, toAccountAdminView, whenLabel } from "./accountAdminView";

/** §3.9 (ruled 2026-10-16). The tab's shaping: device names, times in the advisor's zone, states. */

const NOW = new Date("2026-10-16T19:00:00Z"); // 2:00 PM in Chicago
const TZ = "America/Chicago";

describe("deviceLabel", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "iPhone · Safari"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1", "iPhone · Chrome"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", "Mac · Chrome"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0", "Windows · Edge"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36", "Android · Chrome"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0", "Mac · Firefox"],
    ["Ktor client", "Story-Tail app"],
    ["", "Unknown device"],
    [null, "Unknown device"],
  ])("%s → %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});

describe("whenLabel", () => {
  it("says Today and Yesterday in the advisor's zone, not UTC's", () => {
    expect(whenLabel("2026-10-16T15:30:00Z", TZ, NOW)).toBe("Today · 10:30 AM");
    // 03:30 UTC on the 16th is still the 15th in Chicago.
    expect(whenLabel("2026-10-16T03:30:00Z", TZ, NOW)).toBe("Yesterday · 10:30 PM");
  });

  it("drops the year inside this year and keeps it before", () => {
    expect(whenLabel("2026-05-06T04:42:00Z", TZ, NOW)).toBe("May 5 · 11:42 PM");
    expect(whenLabel("2025-12-31T18:00:00Z", TZ, NOW)).toBe("Dec 31, 2025 · 12:00 PM");
  });
});

const ACCOUNT: AccountAdminRow = {
  needsMfa: false,
  clientId: "c1",
  firstName: "Jordan",
  clientEmail: "jordan@example.com",
  clientArchived: false,
  duplicateEmail: false,
  duplicateEmailClientId: null,
  signInEmailsLastHour: 1,
  hasSignIn: true,
  agentTimeZone: TZ,
  accountId: "a1",
  signInEmail: "jordan@example.com",
  emailVerifiedAt: "2026-01-01T00:00:00Z",
  invitedAt: null,
  hasPassword: true,
  providers: ["email"],
  mfaEnrolled: false,
  lockedAt: null,
  lockedReason: null,
  lastLoginAt: "2026-10-16T17:00:00Z",
  sessions: [{ id: "s1", startedAt: "2026-10-16T17:00:00Z", lastActiveAt: "2026-10-16T18:00:00Z", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", ip: "99.244.18.4" }],
  activity: [{ id: "e1", at: "2026-10-16T17:00:00Z", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", ip: "99.244.18.4", flagged: false }],
};

describe("toAccountAdminView", () => {
  it("before aal2 it is only the gate", () => {
    expect(toAccountAdminView({ needsMfa: true, agentHasFactor: false }, NOW)).toEqual({
      kind: "needs-mfa",
      agentHasFactor: false,
    });
  });

  it("no sign-in: the invite state, with sends left", () => {
    const v = toAccountAdminView({ ...ACCOUNT, hasSignIn: false, signInEmailsLastHour: 0 }, NOW);
    expect(v.kind).toBe("no-sign-in");
    if (v.kind !== "no-sign-in") return;
    expect(v.sendsLeft).toBe(3);
    expect(v.email).toBe("jordan@example.com");
  });

  it("an account: status, last sign-in with its device, sends left", () => {
    const v = toAccountAdminView(ACCOUNT, NOW);
    expect(v.kind).toBe("account");
    if (v.kind !== "account") return;
    expect(v.lastSignIn).toBe("Today · 12:00 PM · iPhone · Safari");
    expect(v.sendsLeft).toBe(2);
    expect(v.sessions[0]).toEqual({ id: "s1", device: "iPhone · Safari", ip: "99.244.18.4", lastActive: "Today · 1:00 PM" });
    expect(v.socialOnly).toBeNull();
    expect(v.invitePending).toBe(false);
    expect(v.locked).toBeNull();
  });

  it("Google-only has no password to reset", () => {
    const v = toAccountAdminView({ ...ACCOUNT, hasPassword: false, providers: ["google"] }, NOW);
    expect(v.kind === "account" && v.socialOnly).toBe("Google");
  });

  it("an unconfirmed invited sign-in is a pending invite", () => {
    const v = toAccountAdminView({ ...ACCOUNT, emailVerifiedAt: null, invitedAt: "2026-10-16T18:00:00Z", hasPassword: false }, NOW);
    expect(v.kind === "account" && v.invitePending).toBe(true);
  });

  it("locked carries the reason and when", () => {
    const v = toAccountAdminView({ ...ACCOUNT, lockedAt: "2026-10-16T18:30:00Z", lockedReason: "odd device" }, NOW);
    expect(v.kind === "account" && v.locked).toEqual({ reason: "odd device", since: "Today · 1:30 PM" });
  });

  it("a ban with no lock row still reads as locked", () => {
    const v = toAccountAdminView({ ...ACCOUNT, bannedUntil: "2126-10-16T00:00:00Z" }, NOW);
    expect(v.kind === "account" && v.locked !== null).toBe(true);
  });

  it("a sign-in duplicate counts as a duplicate, and a changed record address is flagged", () => {
    const v = toAccountAdminView({ ...ACCOUNT, duplicateSignInEmail: true, clientEmail: "new@example.com" }, NOW);
    expect(v.kind === "account" && v.duplicate.any).toBe(true);
    expect(v.kind === "account" && v.addressMismatch).toBe(true);
  });

  it("a bad zone falls back instead of throwing", () => {
    expect(whenLabel("2026-10-16T15:30:00Z", "Not/AZone", NOW)).toBe("Today · 11:30 AM");
  });

  it("never goes below zero sends left", () => {
    const v = toAccountAdminView({ ...ACCOUNT, signInEmailsLastHour: 7 }, NOW);
    expect(v.kind === "account" && v.sendsLeft).toBe(0);
  });
});
