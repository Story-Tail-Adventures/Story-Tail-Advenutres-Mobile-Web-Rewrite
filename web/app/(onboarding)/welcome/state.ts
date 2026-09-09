import type { IconName } from "@/components/ui/Icon";

/**
 * Screen 2.1.9 Welcome / First Login — copy and state.
 *
 * The one screen in §2.1 with explicit brand-voice guidance: Design-System §2.4 asks for a
 * personal welcome from Gyasi and offers "Travel is one of the ways we step into something
 * restoring. I'm glad to plan that with you." The prototype's own line — "Here's to a year
 * of trips worth telling — and rest worth taking. — Gyasi" — already does that job, so it
 * is kept rather than replaced.
 */

export interface WelcomeState {
  /** Set when the skip could not be recorded. The traveler is not held here for it. */
  error?: string;
}

export const initialWelcomeState: WelcomeState = {};

export const WELCOME_TEXT = {
  metaTitle: "Welcome",
  metaDescription: "Your Story-Tail portal, and what it does for you.",
  overline: "WELCOME · REST WELL",
  /** Used when we have a name worth using. */
  title: (firstName: string) => `So glad you're here, ${firstName}.`,
  /**
   * Used when we do not. A sign-up that reached us through a provider sending no name
   * claims leaves a placeholder in the database; greeting somebody as "New" is worse than
   * greeting them as nobody in particular.
   */
  titleNoName: "So glad you're here.",
  sub: "Here's to a year of trips worth telling — and rest worth taking. — Gyasi",
  sectionHeading: "Here's what your portal will do for you:",
  primaryCta: "Get started",
  secondaryCta: "Skip the tour",
  secondaryCtaA11y: "Skip the tour and go to my dashboard",
  skipPending: "Taking you to your dashboard…",
  skipError:
    "We couldn't save that just now — but nothing is lost. Try again, or head straight " +
    "to your dashboard.",
  skipErrorEscape: "Go to my dashboard",
} as const;

export interface WelcomeCard {
  icon: IconName;
  title: string;
  body: string;
  /**
   * The mobile artboard (M219) shows four cards where the desktop one shows five. This is
   * the one it drops — self-guided search is Phase 2, so it is also the least true of the
   * five today.
   */
  desktopOnly?: boolean;
}

export const WELCOME_CARDS: readonly WelcomeCard[] = [
  {
    icon: "plane",
    title: "Your trips, always here",
    body:
      "Your itinerary stays current as things firm up, and you can download it as a PDF " +
      "to carry with you.",
  },
  {
    icon: "card",
    title: "Securely authorize cards",
    // The prototype says "We pay suppliers — never charge you a fee." Kept in substance
    // because it is true and it is the thing travelers most need to hear (BRD §10.5: the
    // agency is contractually barred from charging planning fees), but said in a way that
    // does not imply we hold the card ourselves.
    body:
      "Your card stays with Stripe, not in our database. It pays the resort or cruise " +
      "line directly — and there's never a planning fee from us.",
  },
  {
    icon: "message",
    title: "Talk to me anytime",
    body:
      "Messages threaded by trip, so nothing gets lost in your inbox. We'll email you " +
      "when something changes.",
  },
  {
    icon: "search",
    title: "Explore on your time",
    body: "Browse trip ideas at your own pace, and send me the ones you want to hear about.",
    desktopOnly: true,
  },
  {
    icon: "shield",
    title: "Documents in one place",
    body: "Passports, visas and insurance, kept alongside the trip they belong to.",
  },
];
