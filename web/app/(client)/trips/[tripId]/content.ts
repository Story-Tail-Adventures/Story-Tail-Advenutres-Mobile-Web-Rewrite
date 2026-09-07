/**
 * Copy for Screen 2.2.3 Trip Detail / Overview, and for 2.2.10 Trip Cancellation View —
 * which §4.4 calls a "Pattern C variant", i.e. the same screen with a different body rather
 * than a screen of its own.
 */
export const TRIP_DETAIL = {
  back: "All trips",
  downloadPdf: "PDF",

  tileItinerary: "Itinerary",
  tileItinerarySub: (days: number) => (days > 0 ? `${days} days, day by day` : "Day-by-day"),
  tileItineraryPending: "Not published yet",
  tilePayments: "Payments",
  tileDocuments: "Documents",
  tileDocumentsSub: (n: number) => (n === 1 ? "1 file" : `${n} files`),
  tileMessages: "Messages",
  tileMessagesSub: (n: number) => (n === 0 ? "Open the thread" : n === 1 ? "1 unread" : `${n} unread`),

  glance: "At a glance",
  glanceTripType: "Trip type",
  glanceNights: "Nights",
  glanceDestination: "Destination",
  glanceTravelers: "Travelers",
  glanceTotal: "Total value",
  glanceStatus: "Status",
  glanceComponents: "Booked pieces",

  noteHeading: "A note from Gyasi",
  // The artboard called this "Notes from Gyasi" and sourced it from what would have been
  // trip.notes. That column is the agent's own thinking and is outside the client column
  // grant; this reads itinerary.intro_note, which Design-System §2.4 names as the
  // voice-forward surface of the trip. Singular, because it is one note, not a log.
  notePending:
    "Gyasi hasn’t written the introduction yet. It arrives with the itinerary.",

  advisorLabel: "YOUR ADVISOR",
  advisorName: "Gyasi Story",
  advisorReplyTime: "Usually replies the same day",
  message: "Message",

  paymentTimeline: "PAYMENT TIMELINE",
  // Said plainly because it is the one thing about money a client could otherwise
  // misread. BRD §10.5: the agency is not the merchant of record and charges no fees.
  paymentTimelineNote: "What the resort expects, and when. Story-Tail never charges you a fee.",
  paid: "paid",
  due: "due",
  waived: "waived by the supplier",
  overdue: "overdue",
  noSchedule: "No payment schedule yet.",

  cancelledHeading: "Cancellation summary",
  cancelledReason: "Reason",
  cancelledRefund: "Refund",
  cancelledNoReason: "Not recorded",
  archivedItinerary: "View the archived itinerary",
  // Rewritten, not just repointed. The artboard's "Ready to plan again? Apply your $240
  // credit — Gyasi has 3 options for fall" pushes at somebody whose trip just fell through,
  // and claims three options nothing backs. Tone check 3 in Design-System §2.6 asks whether
  // copy leaves room for rest.
  cancelledAgainHeading: "When you’re ready",
  cancelledAgainBody:
    "There’s no hurry. Tell Gyasi when the timing feels right and he’ll pick it up from here.",

  notFoundTitle: "We couldn’t find that trip",
  notFoundBody: "It may have been archived, or the link may belong to a different account.",
} as const;
