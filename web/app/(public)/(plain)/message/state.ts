/**
 * Screen 2.0.12 Message Gyasi: form state and copy. P2 (BRD §6.5, 2026-10-21).
 *
 * Lives here rather than in actions.ts because a `"use server"` module may only export async
 * functions (the same reason /join keeps its state beside its action).
 *
 * Copy follows Design-System §2: a friend who has done this a hundred times, no pushy CTA, and
 * the reply-time promise is the one settled string ("Usually replies the same day",
 * Screen Inventory 2.6 note of 2026-09-10). No artboard exists for this screen; it borrows
 * 2.0.6's Pattern J card, and every string here is new for the brand-voice review.
 */
export interface MessageState {
  outcome?: "sent";
  /** One sentence the visitor can act on: a 400's detail, the limit, or "try again". */
  formError?: string;
  /** Echoed back so a failed send does not clear what they typed. */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export const initialMessageState: MessageState = {};

export const MESSAGE_TEXT = {
  metaTitle: "Message Gyasi",
  metaDescription:
    "No account needed. Send Gyasi a note about the trip you're dreaming of. He usually replies the same day.",
  overline: "NO ACCOUNT NEEDED",
  title: "Send Gyasi a note",
  body: "Tell him a little about the trip you're dreaming of. He reads every message himself and usually replies the same day.",
  aboutPrefix: "About: ",
  firstName: "First name",
  lastName: "Last name (optional)",
  email: "Email",
  phone: "Phone (optional)",
  message: "Your note",
  messageHint: "Where you'd love to go, roughly when, who's coming, and what kind of rest you're after.",
  honeypot: "Leave this empty",
  // Wider than "only to reply" since the 2026-10-21 brand-voice review: the page, the trip or
  // topic and the campaign tag are also kept for 3.11.9 Lead Sources (Screen Inventory 2.0.12).
  privacyBefore: "Gyasi will only use this to get back to you and see where people find us. ",
  privacyLink: "Privacy policy",
  submit: "Send to Gyasi",
  pending: "Sending…",
  sentTitle: "Thank you. Your note is on its way.",
  sentBody: "Gyasi usually replies the same day, to the email you gave. Until then, rest easy.",
  keepExploring: "Keep exploring",
  quoteInstead: "When you're ready for a full quote, you can create an account.",
  throttled: "A few notes have come from this connection in the last hour. Please try again a little later.",
  unavailable: "Your note didn't send just now. What you wrote is still here, so please try again in a moment.",
} as const;

/** The longest note the function accepts (Data-Model §11.2). */
export const MESSAGE_MAX = 2000;
