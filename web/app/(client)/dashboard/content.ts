/**
 * Copy for Screen 2.2.1 Client Dashboard / Home.
 *
 * Design-System §2.4 names the hero countdown as a voice-forward surface and suggests a
 * "Resting in [destination] in [N] days" framing "for trips that are clearly leisure (not
 * always — sometimes the trip is a wedding, reunion, work-adjacent — but the default
 * leisure framing works)".
 *
 * THAT CONDITIONAL NEEDED A SIGNAL AND THERE IS NO `is_leisure` FIELD. Rather than add one,
 * or ship the rest framing unconditionally at somebody flying to a funeral, it derives from
 * `trip_type`, which already carries enough: a cruise or an all-inclusive is a holiday by
 * construction, while `group`, `multi_destination` and `custom` are exactly the shapes a
 * wedding or a reunion takes. Ambiguous types get warm-but-neutral copy. Recorded here
 * because it is a copy decision made from data that was not put there for it.
 *
 * Tone checks (§2.6) applied to the hero: it sounds like a friend who has done this a
 * hundred times, it treats the trip as a gift, it leaves room for rest, and a
 * non-Christian traveler reads "breathe out" as plain English — which is the point of §2.2
 * being one of the surfaces where the worldview shows through what is *valued* rather than
 * through a quoted verse.
 */

/** Trip types where a rest framing is safe. */
export const LEISURE_TRIP_TYPES = ["cruise", "all_inclusive"] as const;

export function isLeisure(tripType: string): boolean {
  return (LEISURE_TRIP_TYPES as readonly string[]).includes(tripType);
}

export const DASHBOARD = {
  overlineRest: "WELCOME BACK · YOUR REST IS COMING",
  overlineNeutral: "WELCOME BACK",

  /** The hero greeting. `days` is never negative — see daysUntilDeparture. */
  greetingRest: (name: string, days: number) =>
    days === 0
      ? `Today’s the day, ${name}.`
      : days === 1
        ? `One more day, ${name}.`
        : `Hey ${name} — ${days} days until you can finally breathe out.`,
  greetingNeutral: (name: string, days: number) =>
    days === 0
      ? `Today’s the day, ${name}.`
      : days === 1
        ? `One more day, ${name}.`
        : `Hey ${name} — ${days} days to go.`,
  greetingTraveling: (name: string) => `You’re there, ${name}.`,
  greetingNoTrip: (name: string) => `Hello, ${name}.`,

  subtitleNoTrip:
    "Nothing on the calendar yet — which is its own kind of open. Tell Gyasi roughly when and where, and he’ll take it from there.",
  subtitleTraveling: "Everything you need is on the itinerary. Rest deeply this week.",

  countdownUnits: { days: "DAYS", hours: "HR", minutes: "MIN" },

  viewItinerary: "View itinerary",
  itineraryNotReady: "Gyasi is still writing this one",

  actionNeededLabel: "ACTION NEEDED",
  authorizeCard: "Authorize a card",
  // §2.4 is Phase 1 and unbuilt; until it lands the CTA has no destination, so it is
  // rendered disabled rather than pointed at a 404. Phase-leak treatment per the plan.
  authorizeCardComingSoon: "Card authorization opens with the next release",

  advisorLabel: "YOUR ADVISOR",
  advisorName: "Gyasi",
  advisorRole: "Your advisor",
  // One reply-time string for the whole app. Three competed before this: "< 2h" in the
  // artboard and proof.ts, "within 48 hours" also in proof.ts, and "the same day" already
  // shipped in onboarding/complete/state.ts. The shipped one wins — it is the only one a
  // traveler has been told, and it is the least likely to be broken on a bad week.
  advisorReplyTime: "Usually replies the same day",
  messageAgent: "Message Gyasi",

  tabInPlanning: (n: number) => `In planning · ${n}`,
  tabPast: (n: number) => `Past trips · ${n}`,

  emptyPlanningTitle: "Nothing in planning",
  emptyPlanningBody:
    "When Gyasi starts putting something together for you, it shows up here first.",
  emptyPastTitle: "No past trips yet",
  emptyPastBody: "Once you’ve travelled with Story-Tail, every trip stays here for you.",

  // Repointed rather than removed: §2.3 self-guided search is Phase 2, so "Explore trips"
  // has no destination. Asking Gyasi is how a client actually starts a trip at MVP, and it
  // is a real destination today.
  startSomethingNew: "Ask Gyasi about something new",

  seeAllTrips: "See all trips",
} as const;
