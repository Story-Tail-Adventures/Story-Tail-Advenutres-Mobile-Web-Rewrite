// Copy for the topic-page quote hand-off (/quote). P2.
//
// None of this is shown on /quote itself, which only redirects. Each name travels on to the
// quote form (Screen 2.3.8), where it is the h2 on the summary card and the trip's working
// title on Gyasi's worklist ("Caribbean week · Aruba" once a destination is added).
import type { Topic } from "@/content/public/types";

/** One per topic page. `satisfies` makes a new Topic fail to compile until it has a name. */
export const TOPIC_QUOTE_NAMES = {
  caribbean: "Caribbean week",
  cruises: "Cruise",
  honeymoons: "Honeymoon",
} as const satisfies Record<Topic, string>;
