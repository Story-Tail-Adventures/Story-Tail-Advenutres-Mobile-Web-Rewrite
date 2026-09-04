/**
 * Screen 2.1.13 Connect with Agent — form state and copy.
 *
 * Copy follows design/source-prototype/screens/client-auth.jsx (`C2113_ConnectAgent`) and
 * client-auth-mobile.jsx (`M2113_ConnectAgent`), with the departures noted below.
 *
 * THE PROTOTYPE CALLS GYASI "her". Four functions further up the same file the shipped copy
 * says "him", and supabase/seed.sql and web/content/public/proof.ts both say he/him. The
 * prototype is internally inconsistent and the shipped code is the tiebreaker.
 *
 * THE PROTOTYPE ALSO PROMISES SOMETHING THAT HAS ALREADY HAPPENED: "Otherwise, skip — we'll
 * find them automatically by email." The automatic match is not future work, it ran at
 * email confirmation (`handle_user_email_confirmed`), and by the time this screen renders
 * it has either succeeded or not. Telling somebody it is about to happen, on the screen
 * that exists precisely because it did not, is the one thing this copy must not do. So the
 * banner reports the outcome instead.
 */

export interface ConnectState {
  /** The reason a code was refused, in the words the Edge Function chose. */
  formError?: string;
  /** Echoed back so a rejected code is still in the box to be corrected. */
  code?: string;
}

export const initialConnectState: ConnectState = {};

/** A trip already attached to whichever client this account is bound to. */
export interface LinkedTrip {
  id: string;
  title: string;
  startDate: string;
}

export const CONNECT_TEXT = {
  metaTitle: "Connect your trips",
  metaDescription:
    "Link the trips Gyasi has already started planning to your Story-Tail account.",
  // First person throughout the on-page copy, like every sibling step. The prototype
  // names Gyasi in the third person here and then switches to "I" in the next sentence,
  // which reads as the system talking about him rather than him talking to you.
  title: "Have I already started planning a trip for you?",
  sub:
    "If I've already sent you an invitation code, paste it below and I'll link those trips " +
    "to your account. No code? Skip this — you can add one later from your account settings.",

  /** Reports what the automatic match found, rather than promising it is coming. */
  matchedOne: (title: string, when: string) =>
    `Already linked · ${title} — ${when}. I started this one before you signed up, and ` +
    `it's waiting on your dashboard.`,
  matchedMany: (count: number, titles: string) =>
    `Already linked · ${count} trips are on your dashboard: ${titles}. I started these ` +
    `before you signed up.`,
  matchedFooter: (email: string) => `Linked to ${email}.`,
  noMatch:
    "Nothing linked yet — which is completely normal if this is your first trip with me. " +
    "If I've already started planning something for you, the code from your invitation " +
    "email will pull it in.",

  fieldLabel: "Invite code (optional)",
  fieldHelp:
    "Codes look like STA-7HX2J9. Spaces, dashes and lowercase are all fine.",
  placeholder: "STA-7HX2J9",

  /** The primary changes with the field, because pressing it does two different things. */
  primaryCta: "Connect my trips",
  primaryCtaEmpty: "Continue",
  pending: "Connecting…",
  secondaryCta: "Skip for now",
  secondaryCtaA11y: "Skip for now — you can add a code later",
  secondaryPending: "Taking you to the next step…",

  // No link on "message Gyasi" anywhere on this screen: in-app messaging is Screen 2.6 and
  // is not built. Said as text, it is still the right advice — somebody holding an
  // invitation code is holding an email from him.
  formError:
    "Something went wrong connecting your trips. Try again in a moment — or message Gyasi " +
    "and he'll sort it out.",
} as const;
