import {
  paymentLine,
  proposalLine,
  statusChangeNarrative,
  statusChangeNextSteps,
  STATUS_CHANGE_MESSAGES,
} from "@/lib/trips/statusChange";

/**
 * Screen 2.2.9's web chrome.
 *
 * Everything load-bearing — the per-status narrative, the next-steps lists, the CTA labels —
 * lives in `web/lib/trips/statusChange.ts`, because native renders it too and CI compares the
 * two tables. This screen is reached from a push notification, so copy drifting between the
 * stacks would mean two travelers being told different things about the same event.
 */
export const STATUS_CHANGE = {
  back: "Back to trip",
  changedUnknown: STATUS_CHANGE_MESSAGES.changedUnknown,

  whatChanged: STATUS_CHANGE_MESSAGES.whatChanged,
  whatsNext: STATUS_CHANGE_MESSAGES.whatsNext,
  itineraryLine: STATUS_CHANGE_MESSAGES.itineraryLine,

  viewProposal: STATUS_CHANGE_MESSAGES.viewProposal,
  viewItinerary: STATUS_CHANGE_MESSAGES.viewItinerary,
  viewTrip: STATUS_CHANGE_MESSAGES.viewTrip,
  viewSummary: STATUS_CHANGE_MESSAGES.viewSummary,
  viewMemories: STATUS_CHANGE_MESSAGES.viewMemories,
  authorizeCard: STATUS_CHANGE_MESSAGES.authorizeCard,
  authorizeDeferred: STATUS_CHANGE_MESSAGES.authorizeDeferred,

  narrativeFor: statusChangeNarrative,
  nextSteps: statusChangeNextSteps,
  proposalLine,
  paymentLine,
} as const;
