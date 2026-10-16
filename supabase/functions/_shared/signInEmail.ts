/**
 * §3.9: the three sign-in emails an advisor can send a client (reset, magic link, invite).
 * Screen Inventory §3.9 (ruled 2026-10-16).
 *
 * Pure: no network, no database, no clock. `account-admin` asks GoTrue to MAKE the link
 * (`generateLink`) and hands its token hash here; this builds the URL and the email, and the
 * function gives the result to nodemailer.
 *
 * ── THE LINK SIGNS SOMEONE IN AS THE CLIENT ─────────────────────────────────
 *
 * So it exists in exactly one place: the body of an email to the client's own address. Nothing
 * in this file returns it except inside `BuiltSignInEmail`, and the caller never logs that
 * object, returns it, or writes any part of it to an audit row.
 *
 * ── WHY OUR OWN URL, NOT GOTRUE'S action_link ───────────────────────────────
 *
 * `action_link` points at GoTrue's /verify and then redirects with tokens in the URL fragment,
 * which our cookie-based (PKCE) web app cannot read. The token hash goes instead to
 * `/auth/confirm` on the web app, which calls `verifyOtp({ token_hash, type })` server-side and
 * sets the session cookies.
 */

import type { EmailConfig } from "./email.ts";

export type SignInEmailKind = "reset" | "magic_link" | "invite";

/** GoTrue's `verification_type` for each kind, which `/auth/confirm` passes to verifyOtp. */
export const VERIFY_TYPE: Record<SignInEmailKind, "recovery" | "magiclink" | "invite"> = {
  reset: "recovery",
  magic_link: "magiclink",
  invite: "invite",
};

/** Where `/auth/confirm` sends them once signed in. Fixed per kind; never from a request. */
export const NEXT_PATH: Record<SignInEmailKind, string> = {
  reset: "/reset-password",
  magic_link: "/dashboard",
  invite: "/dashboard",
};

export interface SignInEmailInput {
  kind: SignInEmailKind;
  /** The client's sign-in address (the record's address for an invite). */
  to: string;
  clientFirstName: string | null;
  agentFirstName: string | null;
  /** `properties.hashed_token` from generateLink. */
  tokenHash: string;
  /** For the Message-ID; any unique id (a uuid v7). */
  messageKey: string;
}

export interface BuiltSignInEmail {
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  headers: Record<string, string>;
}

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** GoTrue's hashed_token is lowercase hex (a SHA-224 today); refuse anything else. */
const TOKEN_HASH = /^[0-9a-f]{32,128}$/;

function headerSafe(value: string, what: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${what} would break a mail header`);
  return value;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The first word of a name, with control characters dropped; the fallback when empty. */
function firstWord(value: string | null, fallback: string): string {
  const cleaned = [...(value ?? "")]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c)).join("");
  return cleaned.trim().split(/\s+/)[0] || fallback;
}

/** The URL the email carries. Exported for tests; callers use `buildSignInEmail`. */
export function signInUrl(cfg: EmailConfig, kind: SignInEmailKind, tokenHash: string): string {
  if (!TOKEN_HASH.test(tokenHash)) throw new Error("token hash is not what GoTrue issues");
  const q = new URLSearchParams({
    token_hash: tokenHash,
    type: VERIFY_TYPE[kind],
    next: NEXT_PATH[kind],
  });
  return `${cfg.siteUrl}/auth/confirm?${q.toString()}`;
}

// Design-System §3 light scheme, as `buildEmail` uses.
const BURGUNDY = "#7A1A1F";
const CREAM = "#FBF6EE";
const INK = "#2B2B2B";
const MUTED = "#6B6259";

interface Copy {
  subject: string;
  lead: string;
  button: string;
  after: string;
}

function copyFor(kind: SignInEmailKind, agent: string): Copy {
  switch (kind) {
    case "reset":
      return {
        subject: `${agent} sent you a link to reset your password`,
        lead: `${agent} sent you this link because you asked for help signing in to Story-Tail ` +
          `Adventures. It lets you choose a new password.`,
        button: "Choose a new password",
        after: `The link works once, for the next hour. If you didn't ask for help, you can ` +
          `ignore this email and nothing will change.`,
      };
    case "magic_link":
      return {
        subject: `Your sign-in link from ${agent}`,
        lead: `${agent} sent you this link because you asked for help signing in to Story-Tail ` +
          `Adventures. It signs you straight in, no password needed.`,
        button: "Sign me in",
        after: `The link works once, for the next hour. If you didn't ask for help, you can ` +
          `ignore this email and nothing will change.`,
      };
    case "invite":
      return {
        subject: `${agent} invited you to Story-Tail Adventures`,
        lead: `${agent} set up a place for your trips, where your plans, messages and travel ` +
          `documents all live together. This link opens it for the first time.`,
        button: "Open my trips",
        after: `The link works once, for the next hour. If it runs out, just ask ${agent} for a ` +
          `new one. If you weren't expecting this, you can ignore it.`,
      };
  }
}

export function buildSignInEmail(input: SignInEmailInput, cfg: EmailConfig): BuiltSignInEmail {
  const to = input.to?.trim() ?? "";
  if (!ADDRESS.test(to)) throw new Error("recipient is not a single email address");

  const agent = firstWord(input.agentFirstName, "Your advisor");
  const client = firstWord(input.clientFirstName, "");
  const link = signInUrl(cfg, input.kind, input.tokenHash);
  const c = copyFor(input.kind, agent);

  const subject = headerSafe(c.subject, "subject");
  const fromName = headerSafe(`${agent} at Story-Tail Adventures`, "sender name");
  const greeting = client ? `Hi ${client},` : "Hi,";

  const text = [
    greeting,
    "",
    c.lead,
    "",
    `${c.button}: ${link}`,
    "",
    c.after,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};color:${INK};font-family:Poppins,Helvetica,Arial,sans-serif;font-size:16px">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<p style="margin:0 0 22px;font-weight:600;color:${BURGUNDY};letter-spacing:0.02em">Story-Tail Adventures</p>
<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(greeting)}</p>
<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(c.lead)}</p>
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${BURGUNDY};color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${escapeHtml(c.button)}</a></p>
<p style="margin:0;color:${MUTED};font-size:14px;line-height:1.5">${escapeHtml(c.after)}</p>
</div></body></html>`;

  return {
    from: { name: fromName, address: cfg.fromAddress },
    to,
    subject,
    text,
    html,
    messageId: headerSafe(`<${input.messageKey}@${cfg.fromAddress.split("@")[1]}>`, "message id"),
    headers: { "Auto-Submitted": "auto-generated" },
  };
}
