// Screen 2.3.8 Quote Request Form — copy module. P2.
//
// Voice checked against Design-System §2.6: a friend who has done this a hundred times, the
// trip as a gift rather than a commodity, and a gentle CTA. Nothing here promises a price or
// a turnaround the platform cannot keep.

export const QUOTE = {
  meta: {
    title: "Request a quote",
    description: "Send Gyasi the details and he'll come back with real prices.",
  },
  overline: "REQUEST A QUOTE",
  title: "Let's get you a real price.",
  body:
    "Here's what I've got. Add anything that matters — a room you liked, a flight you're holding, the reason for the trip — and Gyasi will come back with what it actually costs.",
  summary: {
    label: "What you're asking about",
    dates: "Dates",
    travelers: "Travelers",
    flexibleDates: "Flexible — Gyasi will suggest a week",
    travelerCount: (n: number) => `${n} ${n === 1 ? "traveler" : "travelers"}`,
    indicative: "Seen at",
    perNight: "/night",
    /** Sits under an indicative figure so it is never read as the quote itself. */
    indicativeNote: "A public rate for those dates, not a quote — Gyasi prices the whole trip.",
    starClass: (n: number) => `${n}-star`,
  },
  notes: {
    label: "Anything else Gyasi should know?",
    placeholder: "Room preference, occasion, flights you're already holding, budget in mind…",
    optional: "Optional",
  },
  submit: "Send to Gyasi",
  submitting: "Sending…",
  cancel: "Back to search",
  errors: {
    generic: "That didn't send. Try once more, and if it sticks, message Gyasi directly.",
    signedOut: "Your session expired. Sign in and I'll still have this.",
    duplicate: "You've already sent this one — it's with Gyasi.",
    nothing: "I've lost track of what you were looking at. Start the search again and I'll pick it up.",
  },
  sent: {
    title: "That's with Gyasi.",
    body:
      "He reads every one himself. You'll hear back with real prices — and if he needs anything from you first, he'll ask.",
    viewTrip: "See it in your trips",
    keepLooking: "Keep looking",
  },
} as const;
