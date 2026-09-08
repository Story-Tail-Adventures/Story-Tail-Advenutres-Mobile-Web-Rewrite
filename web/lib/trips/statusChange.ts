import type { TripStatus } from "./status";

/**
 * Screen 2.2.9's copy — the narrative per status, and the next-steps list.
 *
 * SHARED because this is the screen a traveler reaches from a push notification, which is the
 * one place our words arrive without being asked for. The Kotlin twin is
 * `domain/trip/TripStatusChange.kt`, compared by `.github/scripts/check_copy_parity.py`.
 *
 * WHAT THIS SCREEN CAN HONESTLY SAY is the design problem. The artboard's "What changed" card
 * lists three specific facts — the resort, the price, "two room types to choose between" — and
 * nothing in the schema records a DIFF. There is `trip.status` and `trip.status_changed_at`,
 * and that is all. So the headline and description are derived from the status it landed ON,
 * the supporting detail comes from real rows (a sent proposal, a published itinerary, the next
 * unpaid milestone), and "two room types" is never said by anything. Narrating a change we
 * cannot see would put words in Gyasi's mouth on the screen where being wrong costs most.
 */

export const STATUS_CHANGE_MESSAGES = {
  whatChanged: "What changed",
  whatsNext: "What’s next",

  overlineUpdated: "Status updated",
  overlineInquiry: "We have your note",
  overlineTravelling: "You’re travelling",
  overlineHome: "Welcome home",

  headingInquiry: "Gyasi has your inquiry",
  headingProposal: "Your proposal is ready",
  headingBooked: "It’s booked",
  headingTravelling: "You’re on your way",
  headingCompleted: "That’s a wrap",
  headingCancelled: "This trip has been cancelled",

  itineraryLine: "The day-by-day is published and ready to read",

  viewProposal: "View the proposal",
  viewItinerary: "Read the itinerary",
  viewTrip: "Open the trip",
  viewSummary: "See the cancellation summary",
  viewMemories: "Open the memories",
  authorizeCard: "Authorize a card",
  authorizeDeferred: "Card authorization arrives with the payments screen",

  /** Shown when `status_changed_at` is null — a trip whose status never moved. */
  changedUnknown: "Recently",
} as const;

const OVERLINE: Record<TripStatus, string> = {
  inquiry: STATUS_CHANGE_MESSAGES.overlineInquiry,
  proposal: STATUS_CHANGE_MESSAGES.overlineUpdated,
  booked: STATUS_CHANGE_MESSAGES.overlineUpdated,
  in_progress: STATUS_CHANGE_MESSAGES.overlineTravelling,
  completed: STATUS_CHANGE_MESSAGES.overlineHome,
  cancelled: STATUS_CHANGE_MESSAGES.overlineUpdated,
};

const HEADING: Record<TripStatus, string> = {
  inquiry: STATUS_CHANGE_MESSAGES.headingInquiry,
  proposal: STATUS_CHANGE_MESSAGES.headingProposal,
  booked: STATUS_CHANGE_MESSAGES.headingBooked,
  in_progress: STATUS_CHANGE_MESSAGES.headingTravelling,
  completed: STATUS_CHANGE_MESSAGES.headingCompleted,
  cancelled: STATUS_CHANGE_MESSAGES.headingCancelled,
};

/** The description, which needs the trip's own title interpolated. */
const BODY: Record<TripStatus, (title: string) => string> = {
  inquiry: (t) =>
    `“${t}” is on his desk. He reads every one himself, so give him a little time and he will come back with questions or a plan.`,
  proposal: (t) =>
    `“${t}” moved from an inquiry to a proposal. Gyasi has put something together — have a read, no rush.`,
  booked: (t) =>
    `“${t}” is confirmed. From here Gyasi holds the details and you get to look forward to it.`,
  in_progress: (t) => `“${t}” has started. Everything you need is in the itinerary.`,
  completed: (t) =>
    `“${t}” is done. Whenever you feel like it, there is a place to keep the photos and say what you carried home.`,
  cancelled: (t) =>
    `“${t}” is no longer going ahead. The summary has what was refunded and what is held as credit.`,
};

/**
 * Per-status, and deliberately gentle. Design-System §2.6's third tone check asks whether
 * copy leaves room for rest, and this screen is reached from a notification, which is already
 * an interruption.
 */
const NEXT_STEPS: Record<TripStatus, readonly string[]> = {
  inquiry: ["Nothing to do yet", "Gyasi will come back to you with a plan or a question"],
  proposal: [
    "Have a read, no rush",
    "Reply with what you think",
    "Authorize a card and Gyasi locks it in",
  ],
  booked: [
    "Look through the itinerary when you have a minute",
    "Add your passports whenever it suits you",
    "Gyasi will be in touch before you travel",
  ],
  in_progress: ["Keep the itinerary handy", "Message Gyasi if anything shifts"],
  completed: ["Have a look at the photos", "Write something down if you feel like it"],
  cancelled: ["Read the cancellation summary", "Message Gyasi when the timing feels right"],
};

export function statusChangeNarrative(status: TripStatus, title: string) {
  return { overline: OVERLINE[status], heading: HEADING[status], body: BODY[status](title) };
}

export function statusChangeNextSteps(status: TripStatus): readonly string[] {
  return NEXT_STEPS[status];
}

/** "Family Week in Turks · version 1", or a bare version when the proposal has no title. */
export function proposalLine(version: number, title: string | null): string {
  return title ? `${title} · version ${version}` : `Proposal · version ${version}`;
}

export function paymentLine(label: string, money: string, due: string | null): string {
  return due ? `${label} · ${money} due ${due}` : `${label} · ${money}`;
}
