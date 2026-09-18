/**
 * Copy for Screen 2.5.11 Help & Support. Pinned against `HelpMessages` by
 * check_copy_parity.py — see the note in ../content.ts.
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

  /**
   * THE `mailto:` IS GONE. It said "until §2.6.3 can send, this is the honest path" — 2.6.3
   * can send now, so the honest path is the thread.
   *
   * No replacement string, on purpose. The destination is `/messages/new` on web and
   * `AppRoute.NewConversation` on native, and neither of those is copy: a route is not a
   * phrase the two stacks have to agree on word for word, and holding a web path in a
   * parity-pinned constant would force native to carry a URL it has no use for.
   */

  faqHeading: "COMMON QUESTIONS",
  legalHeading: "Legal",
  legal: [
    { slug: "privacy", label: "Privacy" },
    { slug: "terms", label: "Terms" },
    { slug: "cookies", label: "Cookies" },
    { slug: "accessibility", label: "Accessibility" },
  ],
} as const;
