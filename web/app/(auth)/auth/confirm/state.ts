/**
 * §3.9: the page an advisor's emailed link opens (reset, sign-in link, invite). Pure data.
 *
 * WHY A PAGE AND A BUTTON, NOT A ROUTE THAT SIGNS THEM IN ON GET: mail scanners (Outlook Safe
 * Links, Mimecast, Gmail's preview) open every link in a message. A GET that called verifyOtp
 * would spend the one-time link before the client ever clicked it, and "my link doesn't work"
 * is the exact problem these tools exist for. A scanner loads this page; only a person presses
 * the button (review finding, 2026-10-16).
 */
export const CONFIRM_TYPES = ["recovery", "magiclink", "invite"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export function isConfirmType(value: unknown): value is ConfirmType {
  return typeof value === "string" && (CONFIRM_TYPES as readonly string[]).includes(value);
}

/** GoTrue's hashed_token: lowercase hex. */
export function isTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32,128}$/.test(value);
}

export const CONFIRM_TEXT = {
  metaTitle: "Sign in",
  overline: "STORY-TAIL ADVENTURES",
  title: {
    recovery: "Choose a new password",
    magiclink: "Sign in",
    invite: "Welcome to your trips",
  } satisfies Record<ConfirmType, string>,
  sub: {
    recovery: "One tap and you can set a new password.",
    magiclink: "One tap and you're in. No password needed.",
    invite: "One tap opens your plans, messages and travel documents.",
  } satisfies Record<ConfirmType, string>,
  button: {
    recovery: "Continue",
    magiclink: "Sign me in",
    invite: "Open my trips",
  } satisfies Record<ConfirmType, string>,
  pending: "Just a moment…",
  failedTitle: "That link has already been used or has run out",
  failedBody: "Links work once, for an hour. Ask your advisor for a new one and you'll be set.",
  badTitle: "This link isn't complete",
  badBody: "Try opening it again from the email. If that doesn't work, ask your advisor for a new one.",
  signInLink: "Go to sign in",
} as const;
