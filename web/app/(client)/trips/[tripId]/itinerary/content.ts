/**
 * Copy for Screens 2.2.4 Itinerary Viewer, 2.2.5 Day Detail and 2.2.8 Empty Trip Component
 * States — which §4.4 places "inline within Itinerary Viewer", so they live here too.
 *
 * Design-System §2.4 is unusually specific about this section: the intro note "is the place
 * to let the voice come through", and §2.5 is equally clear about the limit — "the Itinerary
 * Viewer for a Royal Caribbean cruise doesn't need a verse, it needs flight times, cabin
 * numbers, and Gyasi's tips. Save the voice for the surfaces where it lands." So the note
 * carries the voice and everything around it is plain.
 */
export const ITINERARY = {
  heading: "Itinerary",
  back: "Back to the trip",
  downloadPdf: "Download the full itinerary (PDF)",
  // "Share with co-traveler" collapses into the PDF. The secure link is deferred to §2.8,
  // where Screen-Inventory §7's open question about account-less co-traveler access lives.
  shareNote: "Forward the PDF to anyone travelling with you.",

  notPublishedTitle: "Your itinerary isn’t ready yet",
  notPublishedBody:
    "Gyasi is still writing it. It appears here the moment he publishes, and you’ll get an email when it does.",
  notFoundTitle: "We couldn’t find that itinerary",
  notFoundBody: "It may belong to a different trip, or the trip may have been archived.",

  dayLabel: (n: number) => `Day ${String(n).padStart(2, "0")}`,
  dayShort: (n: number) => `Day ${n}`,
  blockMorning: "MORNING",
  blockAfternoon: "AFTERNOON",
  blockEvening: "EVENING",
  blockAllDay: "ALL DAY",

  confirmation: "CONFIRMATION",
  tip: "GYASI’S TIP",
  openInMaps: "Open in Maps",
  call: "Call",
  markDone: "Mark as done",
  markedDone: "Done",

  importantInfo: "Important info",
  insurance: "Insurance",
  emergency: "Emergency contact",
  visaUnknown: "Ask Gyasi about visas",
  noImportantInfo: "Nothing filed for this trip yet.",

  weather: "WEATHER",
  uvWarning: (uv: number) => `UV index ${uv} — pack the reef-safe sunscreen.`,

  // ── 2.2.8, the empty component states ──────────────────────────────────────
  //
  // Screen-Inventory:448's own example sets the register: "Your flights aren't booked yet —
  // we'll add them here once confirmed." The artboard went further and narrated operations
  // nothing backs ("Gyasi is comparing American and JetBlue for the best Saturday departure
  // window"), which asserts a fact no column holds and no agent promised. These say what is
  // true, say who is on it, and stop.
  emptyFlightsTitle: "Your flights aren’t booked yet",
  emptyFlightsBody:
    "Gyasi is still working on the best departure for you. They’ll appear here the moment they’re confirmed.",
  emptyDiningTitle: "No dining reserved yet",
  emptyDiningBody: "Gyasi will add your reservations here once he has them.",
  emptyDayTitle: (n: number) => `Day ${n} is open`,
  emptyDayBody:
    "Nothing planned — which is allowed. Tell Gyasi if you’d like a tour, or leave it for the pool.",
  askGyasi: "Ask Gyasi where things stand",

  emptyItineraryTitle: "No days yet",
  emptyItineraryBody: "Gyasi adds the days as the pieces of the trip are confirmed.",
} as const;

export const BLOCK_LABEL: Record<string, string> = {
  morning: ITINERARY.blockMorning,
  afternoon: ITINERARY.blockAfternoon,
  evening: ITINERARY.blockEvening,
  all_day: ITINERARY.blockAllDay,
};
