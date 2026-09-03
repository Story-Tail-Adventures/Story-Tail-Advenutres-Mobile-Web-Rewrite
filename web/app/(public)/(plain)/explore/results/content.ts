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
} as const;
