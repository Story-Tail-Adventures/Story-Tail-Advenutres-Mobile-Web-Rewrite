// Copy for the topic-page quote hand-off (/quote). P2.
//
// None of this is shown on /quote itself, which only redirects. It travels on to the quote
// form (Screen 2.3.8), where `names` is the h2 on the summary card and the trip's working
// title on Gyasi's worklist, and `vibeNote` is the starting text of the note the visitor can
// still edit before sending.

export const TOPIC_QUOTE = {
  names: {
    caribbean: "Caribbean week",
    honeymoons: "Honeymoon",
  },
  vibeNote: (vibe: string) => `Hoping for: ${vibe}`,
} as const;
