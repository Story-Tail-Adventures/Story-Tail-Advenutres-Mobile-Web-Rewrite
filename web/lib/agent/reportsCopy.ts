/**
 * §3.11 Reporting's words (P1). Rulings: docs/Screen-Inventory.md §3.11, "Ruled 2026-10-21".
 *
 * Its own module, like `settingsCopy.ts`, rather than more of `content.ts`. Pure data and pure
 * functions: imported by Server Components and by the view model's tests. No phone twin: §3.11
 * is web only, so nothing here has a Kotlin parity row.
 *
 * Voice (Design-System §2): the advisor's own business, said plainly. The footnotes say what a
 * number leaves out, because a figure that quietly drops something reads as a wrong figure.
 */

export const REPORTS_COPY = {
  // ── 3.11.1 Hub ──────────────────────────────────────────────────────────
  hubTitle: "Reports",
  // The artboard's subtitle, kept.
  hubSubtitle: "Snapshot of the business. All exportable.",
  backToHub: "Reports hub",
  // A tile whose report lands in a later PR of this section. Visible text, not a hover title:
  // §3.2.1's rule for a disabled control, and the hub is on the tablet surface.
  tileSoon: "On its way",

  // ── Shared ──────────────────────────────────────────────────────────────
  periodLabel: "Period",
  periodYtd: "Year to date",
  period12mo: "Last 12 months",
  periodQtd: "This quarter",
  exportLabel: "Export",
  total: "Total",
  exportFailed: "The export didn't come through. Go back and try again in a moment.",
  // Every report that reads stage dates (§3.11: no backfill before trip_status_history).
  trackingSince: "Tracking began Sep 19, 2026, so bookings before then don't show here.",
  // Lifetime value DOES count those bookings; only their cohort is unknown.
  clientsTracking: "Clients whose first booking came before Sep 19, 2026, when tracking began, are under Before tracking.",
  // The funnel counts every trip; only days to book needs a recorded booking date.
  funnelTracking: "Days to book counts only bookings made since Sep 19, 2026, when tracking began.",

  // ── 3.11.2 Revenue by Month ─────────────────────────────────────────────
  revenueTitle: "Revenue by month",
  revenueSubtitle: "Booked value or commission received, month by month.",
  basisLabel: "Show",
  basisBooked: "Booked value",
  basisReceived: "Commission received",
  revenueBookedNote:
    "Each trip counts once, in the month it was first booked. Cancelled trips, and trips that went back to an earlier stage, are left out.",
  revenueReceivedNote: "Commission that arrived from suppliers, by the day it came in.",
  revenueEmptyBooked: "Nothing booked in this period yet.",
  revenueEmptyReceived: "No commission received in this period yet.",
  compareShow: "Compare with last year",
  compareHide: "Hide last year",
  revenueTableCaption: "Revenue by month",
  colMonth: "Month",
  colBooked: "Booked value",
  colReceived: "Received",
  colTrips: "Trips",
  colPayments: "Commission payments",
  colLastYear: "Same month last year",
  // The empty cell for a month a year back with nothing recorded: not $0, which is a claim.
  noPrior: "—",
  thisYear: "This year",
  lastYear: "Last year",

  // ── 3.11.3 Commission by Supplier ───────────────────────────────────────
  suppliersTitle: "Commission by supplier",
  // The artboard's subtitle, kept.
  suppliersSubtitle: "Where the money's coming from.",
  suppliersNote: "By travel dates in this period, the same as the ledger.",
  suppliersEmpty: "No commission lines for trips in this period yet.",
  suppliersTableCaption: "Commission by supplier",
  colSupplier: "Supplier",
  colOwed: "Still owed",
  colShare: "Share",

  // ── 3.11.4 Top Destinations ─────────────────────────────────────────────
  destinationsTitle: "Top destinations",
  destinationsSubtitle: "By trip count and value.",
  destinationsNote:
    "Booked, traveling and completed trips, by travel start date. A trip with more than one stop counts once in each place, with its value split evenly between them.",
  destinationsEmpty: "No booked trips start in this period yet.",
  destinationsTableCaption: "Top destinations",
  colDestination: "Destination",
  colValue: "Value",
  noDestination: "No destination yet",

  // ── 3.11.5 Client Lifetime Value ────────────────────────────────────────
  clientsTitle: "Client lifetime value",
  clientsSubtitle: "Clients ranked by what they've booked with you.",
  clientsNote:
    "Lifetime value adds up every booked, traveling and completed trip, the same number you see on each client's page. Cohort is the quarter they first booked.",
  clientsEmpty: "No booked trips yet.",
  clientsCohortEmpty: "No clients in this cohort.",
  clientsTableCaption: "Client lifetime value",
  cohortLabel: "Cohort",
  cohortAll: "All clients",
  noCohort: "Before tracking",
  colRank: "Rank",
  colClient: "Client",
  colLifetime: "Lifetime value",
  colCommission: "Commission",
  colCohort: "Cohort",

  // ── 3.11.6 Conversion Funnel ────────────────────────────────────────────
  funnelTitle: "Conversion funnel",
  funnelNote:
    "Trips that came in during this period, and how far each has gone. A trip entered as booked counts as an inquiry and a proposal too.",
  funnelEmpty: "No new trips came in during this period.",
  funnelTableCaption: "Conversion funnel",
  colStage: "Stage",
  colPctOfInquiries: "% of inquiries",
  colReached: "Reached",
  colStillOpen: "Still open here",
  colCancelled: "Cancelled here",
  funnelStages: ["Inquiry", "Proposal", "Booked", "Traveled"],
  bookDaysNone: "No trips from this period have booked yet.",

  // ── 3.11.7 Pipeline Value ───────────────────────────────────────────────
  pipelineTitle: "Pipeline value",
  pipelineSubtitle: "What's open today, and what it's likely worth.",
  tileOpen: "Open pipeline",
  tileWeighted: "Weighted",
  tileWeightedSub: "By the stage weights below",
  byStage: "By stage",
  // Shown under the card title AND as the save hint: the weights are one set (§3.11).
  weightsShared: "Shared with the commission forecast.",
  weightsHint: "Saving also changes your commission forecast and the confidence on your worklist.",
  byMonth: "By travel month",
  byMonthSub: "Weighted value, by the month each trip starts.",
  byMonthTableCaption: "Pipeline by travel month",
  monthNow: "This month includes trips already underway.",
  colMonth2: "Month",
  colWeightedValue: "Weighted value",
  pastStart: "Start date passed",
  later: "Later",
  undated: "No travel dates yet",
  pipelineEmpty: "Nothing open right now.",
  colWeighted: "Weighted",
} as const;

/**
 * The set-aside footnote; nothing at zero. Names any money already received on those lines,
 * because Revenue's "Commission received" counts it and this report does not.
 */
export function suppliersSetAside(n: number, receivedLabel: string | null = null): string | null {
  if (n <= 0) return null;
  const lines = n === 1
    ? "1 disputed or lost line is set aside and not counted here"
    : `${n} disputed or lost lines are set aside and not counted here`;
  return receivedLabel ? `${lines}, including ${receivedLabel} already received on them.` : `${lines}.`;
}

/** "+22% vs last year" / "−8% vs last year" (a real minus sign, as the commission chip). */
export function reportChangeVsLastYear(pct: number): string {
  if (pct === 0) return "Same as last year";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs last year`;
}

/** "1 trip", "38 trips" on a funnel bar. */
export function funnelTrips(n: number): string {
  return n === 1 ? "1 trip" : `${n} trips`;
}

/** "142 inquiries → 32 traveled · 22.5% made it all the way". */
export function funnelSummary(inquiries: number, traveled: number, pct: string | null): string {
  const head = `${inquiries} ${inquiries === 1 ? "inquiry" : "inquiries"} → ${traveled} traveled`;
  return pct === null ? head : `${head} · ${pct} made it all the way`;
}

/** "−22 · 15 still open, 7 cancelled". Only the parts that are not zero. */
export function funnelStopped(open: number, cancelled: number): string | null {
  if (open + cancelled === 0) return null;
  const parts = [open > 0 ? `${open} still open` : null, cancelled > 0 ? `${cancelled} cancelled` : null].filter(Boolean);
  return `−${open + cancelled} · ${parts.join(", ")}`;
}

/** "18.4 days on average from inquiry to booked, across 38 trips". */
export function funnelBookDays(days: string, n: number): string {
  return `${days} ${days === "1.0" ? "day" : "days"} on average from inquiry to booked, across ${n} ${n === 1 ? "trip" : "trips"}.`;
}

/** "29 trips, at full value". */
export function pipelineOpenSub(n: number): string {
  return `${n} ${n === 1 ? "trip" : "trips"}, at full value`;
}

/** "Later · 3 trips". */
export function pipelineBucketTrips(label: string, n: number): string {
  return n > 0 ? `${label} · ${n} ${n === 1 ? "trip" : "trips"}` : label;
}

/** "Total · Year to date". */
export function reportTotalFor(periodName: string): string {
  return `Total · ${periodName}`;
}

/** The hub tiles, in the artboard's order (less Time-to-book, which the Funnel carries). */
export const REPORT_TILES = [
  { id: "revenue", title: "Revenue by month", sub: "Booked value or commission received", icon: "chart" },
  { id: "suppliers", title: "Commission by supplier", sub: "Who's paid, and who still owes", icon: "dollar" },
  { id: "destinations", title: "Top destinations", sub: "Where your travelers are headed", icon: "pin" },
  { id: "clients", title: "Client lifetime value", sub: "Clients ranked by what they've booked", icon: "users" },
  { id: "funnel", title: "Conversion funnel", sub: "Inquiry to traveled, and days to book", icon: "pulse" },
  { id: "pipeline", title: "Pipeline value", sub: "What's open, weighted by stage", icon: "briefcase" },
  { id: "export", title: "Export center", sub: "CSV files for taxes and the books", icon: "download" },
] as const;
