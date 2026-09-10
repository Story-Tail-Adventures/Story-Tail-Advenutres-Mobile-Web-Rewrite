/**
 * Copy for Screen 2.5.10 Account Closure. Pinned against `CloseMessages` by check_copy_parity.py.
 *
 * EVERY LINE HERE IS A RETENTION OR LEGAL CLAIM. Two rules, both learned the hard way:
 *
 * 1. No number goes in unless something enforces it. Data-Model §18.5 describes a 30-day
 *    anonymization window and NOTHING implements it — no migration, no pg_cron entry, no
 *    Edge Function. So the copy states the intent and omits the deadline. Put "within 30
 *    days" back the day the scrubber ships, not before.
 * 2. Nothing here sells. Design-System §2.5 says the brand is not used to sell more, and the
 *    artboard's "helps Gyasi follow up if you reconsider" is a retention hook on a closure
 *    screen. The offer to talk to him stays — that is useful — but the field is not framed
 *    as a way to win somebody back.
 */
export const CLOSE = {
  title: "Close account",
  back: "Privacy & data",
  heading: "Close your account?",

  whatHappensLabel: "WHAT HAPPENS",
  whatHappens: [
    "Your trips are archived — ask for a final PDF first if you want one",
    "Any card you have saved stops being usable",
    "Your personal details are anonymized",
    "Booking and tax records are kept, because the law requires it",
  ],

  reconsiderBody:
    "If something went wrong, Gyasi would rather hear it than lose you. This page will still be here afterwards.",
  reconsiderCta: "Message him first",
  mailto: "mailto:hello@story-tail.com?subject=Before%20I%20close%20my%20account",

  reasonLabel: "Anything you want to tell us? (optional)",
  reasonPlaceholder: "Only if you feel like it.",

  confirmLabel: "Type your email address to confirm",
  confirmPlaceholder: "you@example.com",
  confirmHint: "This is the address you sign in with.",

  confirmCta: "Close my account",
  keepCta: "Keep my account",

  /** No function writes to `account` at all — see the page header. */
  deferred: "Coming with the next release",
} as const;
