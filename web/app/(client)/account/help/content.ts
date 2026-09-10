/**
 * Copy for Screen 2.5.11 Help & Support. Not in check_copy_parity's MESSAGE_TABLES until a
 * Kotlin twin exists — see the note in ../content.ts.
 *
 * `replyWindow` is the settled authenticated-surface string. Do NOT reach for
 * `web/content/public/proof.ts`'s `avgReplyTime` ("< 2h"): it is `verified: false`, it is
 * fenced behind PUBLIC_CLAIMS_MODE=strict so it cannot ship unexamined, and §2.1/§2.2
 * already settled this wording.
 */
export const HELP = {
  title: "Help & support",
  subtitle: "Quick answers, or talk to Gyasi directly.",

  advisorName: "Gyasi Story · your advisor",
  /** Initials, never a photograph — the same rule 2.5.1's avatar follows. */
  advisorInitials: "GS",
  replyWindow: "Usually replies the same day",
  advisorBody: "Anything about your own trip is quickest this way. There is never a fee for asking.",
  messageCta: "Message Gyasi",

  /** Until §2.6.3 can send, this is the honest path — the same call 2.1.14 makes. */
  mailto: "mailto:hello@story-tail.com?subject=A%20question",

  faqHeading: "COMMON QUESTIONS",
  legalHeading: "Legal",
  legal: [
    { slug: "privacy", label: "Privacy" },
    { slug: "terms", label: "Terms" },
    { slug: "cookies", label: "Cookies" },
    { slug: "accessibility", label: "Accessibility" },
  ],
} as const;
