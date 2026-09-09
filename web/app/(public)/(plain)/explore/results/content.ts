// Screen 2.0.4 Public Search Results — copy module. Desktop copy (C204) is the source; the
// mobile sticky CTA uses the brief's corrected label ("Create account to save"). P2.

export const RESULTS = {
  meta: {
    title: "Trip ideas",
    description:
      "Trip ideas from Gyasi's curated catalog — filter by trip type, vibe and budget, no account needed.",
  },
  header: {
    update: "Update",
  },
  /** Header pill cells (C204: Caribbean / Aug 12 – 19 / 2 adults / Any). */
  pill: {
    destination: "Destination",
    dates: "Dates",
    travelers: "Travelers",
    tripType: "Trip type",
    anywhere: "Anywhere",
    flexibleDates: "Flexible dates",
    anyGroup: "Any group",
    anyType: "Any",
    travelersCount: (n: number) => `${n} ${n === 1 ? "traveler" : "travelers"}`,
  },
  chips: {
    label: "Quick filters",
    filters: "Filters",
    filtersWithCount: (n: number) => `Filters · ${n}`,
  },
  filters: {
    label: "Filters",
    overline: "FILTERS",
    tripType: "Trip type",
    vibe: "Vibe",
    budget: "Budget",
    apply: "Apply filters",
    clear: "Clear all",
    close: "Close filters",
  },
  sort: {
    label: "Sort",
    chip: (current: string) => `Sort · ${current}`,
  },
  heading: (count: number, where: string) => `${count} ${count === 1 ? "trip" : "trips"} · ${where}`,
  card: {
    from: "FROM",
    perPerson: "/pp",
    quote: "Request quote*",
    save: "Save*",
    saveAria: (name: string) => `Save ${name} for later`,
  },
  footnote: "* Requires creating an account — takes 60 seconds.",
  empty: {
    title: "No trips match that week yet.",
    body: "Loosen a filter, or tell Gyasi what you're after — that's usually faster.",
    clear: "Clear filters",
    message: "Message Gyasi",
  },
  sticky: {
    primary: "Create account to save",
    secondary: "Filter",
  },
  loading: "Loading trips…",

  mode: {
    label: "Results",
    picks: "Gyasi's picks",
    hotels: "Hotels",
  },

  /**
   * Hotels-mode copy. Voice checked against Design-System §2.6 — a friend who has done this
   * a hundred times, the trip as a gift rather than a commodity, room to breathe, and
   * nothing that reads like a machine apologising.
   *
   * Note what none of these do: promise a price, blame the visitor, or dead-end. Every
   * state offers Gyasi and the curated catalog, which is the §5.7 rule the trips empty
   * state already follows.
   */
  hotels: {
    heading: (count: number, where: string) =>
      `${count} ${count === 1 ? "stay" : "stays"} · ${where}`,
    indicative: "INDICATIVE",
    perNight: "/night",
    noRate: "Rate on request",
    starClass: (n: number) => `${n}-STAR`,
    /** Rail legends. "Star rating" is Google's classification, not the guest score. */
    starRating: "Star rating",
    amenities: "Amenities",
    nightlyRate: "Nightly rate",
    starClassLabel: (n: number) => (n === 5 ? "5★" : `${n}★+`),
    reviews: (n: number) => `${n.toLocaleString("en-US")} reviews`,
    /** Sits under the results, next to the trips footnote. */
    basis: "Nightly rates are public rates for the dates you picked, before taxes and fees — a starting point, not a quote.",
    staleAsOf: (when: string) => `Prices as of ${when}. Gyasi will confirm what's live when he quotes.`,

    needDestination: {
      title: "Where are you headed?",
      body: "Give me an island, a city, or just “Caribbean” — I’ll pull up what’s open for your week.",
    },
    needDates: {
      title: "Pick your week.",
      body: "Hotels move with the calendar, so I need your dates before I can show you what’s actually there.",
    },
    empty: {
      title: "Nothing came back for that week.",
      body: "It happens — a small island in high season fills up. Try a wider range, or let me look properly; I can usually find a room a search engine can’t.",
    },
    unavailable: {
      title: "That search didn’t come back.",
      body: "Nothing you did — the hotel feed is quiet right now. Gyasi’s picks are still here, and so is he.",
    },
    exhausted: {
      title: "Live hotel search is resting today.",
      body: "We cap how often we call the hotel feed each month so this stays fast and free for everyone. It’ll be back tomorrow — and these are the places Gyasi actually books.",
    },
    editSearch: "Change your search",
    seePicks: "See Gyasi’s picks",
  },
} as const;
