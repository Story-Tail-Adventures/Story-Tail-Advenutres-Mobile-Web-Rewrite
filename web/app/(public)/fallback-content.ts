// Copy for the public shell's fallback screens — not-found and the route error boundary (Screen
// Inventory §5 error / empty states). Neither has a prototype artboard; the voice follows
// docs/Design-System.md §2: a friend who has done this a hundred times, gentle, no jargon,
// leaves room for rest. P1.

export const NOT_FOUND = {
  overline: "LOST AT SEA",
  title: "We can't find that page.",
  body: "The tide moved it, or the link is a little off. Let's get you back to somewhere restful.",
  primary: { label: "Back to the front door", href: "/" },
  secondary: { label: "Browse trip ideas", href: "/explore" },
} as const;

export const SOMETHING_WENT_WRONG = {
  title: "Something went sideways.",
  body: "It's on our end, not yours. Try again in a moment — or message Gyasi and we'll sort it out.",
  retry: "Try again",
  /** Links to About Gyasi, where every "message" CTA lives; the inquiry mailto reads env on the server. */
  message: { label: "Message Gyasi", href: "/about" },
} as const;
