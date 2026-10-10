import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { AGENT_COPY, needsYouLine } from "@/lib/agent/content";
import { loadWorklist, type AgentKpi } from "@/lib/agent/queries";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

/**
 * Screen 3.2.1 — Agent Dashboard / Worklist.
 *
 * Pattern D: stacked sections, KPI cards in a carousel near the top, a "See all" per section
 * rather than exhaustive data.
 *
 * FIVE TILES, NOT THE FOUR §3.2.1 NAMES. Gyasi chose the prototype's strip on 2026-09-19 —
 * pipeline value, booked this month, commission expected with a confidence figure,
 * inquiry-to-book cycle time, active clients. Two of them had nothing behind them, which is
 * why Data-Model §7.4 (PipelineWeight) and §8.8 (TripStatusHistory) exist. Screen-Inventory
 * §3.2.1 carries the amendment.
 *
 * TRIP ROWS ARE NOW LIVE LINKS. §3.4.2 shipped after this screen did; the four sections
 * whose rows carry a `tripId` (proposals, payments, inquiries, departures) now route to
 * `/agent/trips/[tripId]`. Client detail (§3.3.2) and messaging (§3.10) are still unbuilt, so
 * the "Recent messages" section stays read-only and keeps its `messagesDeferred` footer.
 *
 * A server component throughout. Nothing here needs state, so nothing crosses a client
 * boundary — which is also what keeps the agent's time zone correct: every date was
 * formatted in `lib/agent/queries.ts` from `as_of_date`, which the accessors computed in
 * `agent.time_zone`.
 *
 * ON MUI (step 2 of the migration, the agent app PR): the same column, header, KPI rail and
 * stacked sections, drawn with MUI Card / Chip / Avatar / ListItemButton and plain sx. The
 * KPI rail's three layouts moved from web/styles/agent.css into one sx breakpoint object
 * (see `KPIS_SX`), so this file no longer needs the `.agent-kpis` / `.agent-kpi` rules.
 */

// The root layout supplies the " · Story-Tail Adventures" suffix; repeating it here
// produced "Worklist · Story-Tail Adventures · Story-Tail Adventures" in the tab.
export const metadata = { title: "Worklist" };

/** The tile's colour pair per accent — the M3 container roles, or the neutral surface. */
const KPI_TONE: Record<AgentKpi["accent"], { bgcolor: string; color: string }> = {
  primary: { bgcolor: "primary.container", color: "primary.onContainer" },
  secondary: { bgcolor: "secondary.container", color: "secondary.onContainer" },
  tertiary: { bgcolor: "tertiary.container", color: "tertiary.onContainer" },
  surface: { bgcolor: "surface.2", color: "text.primary" },
};

function KpiTile({ kpi }: { kpi: AgentKpi }) {
  return (
    <Card sx={{ ...KPI_TONE[kpi.accent], ...KPI_TILE_SX }}>
      <CardContent sx={KPI_PAD_SX}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography component="span" variant="caption" sx={KPI_LABEL_SX}>
            {kpi.label}
          </Typography>
          <Icon name={kpi.icon} size={14} />
        </Box>
        {/* Null is not zero. A tile with nothing to report says so. */}
        {kpi.value === null ? (
          <Typography component="p" variant="body2" sx={{ mt: 1, opacity: 0.85 }}>
            {kpi.unavailable}
          </Typography>
        ) : (
          <>
            <Typography component="div" variant="h4" sx={KPI_VALUE_SX}>
              {kpi.value}
            </Typography>
            {kpi.sub && (
              <Typography component="div" variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.85 }}>
                {kpi.sub}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  count,
  empty,
  seeAll,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  /** Omitted once the section's rows are live links — there is nowhere else to send "see all". */
  seeAll?: string;
  children: React.ReactNode;
}) {
  return (
    <Card component="section" sx={{ mt: 2 }}>
      <Box sx={SECTION_HEAD_SX}>
        <Typography component="h2" variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        {count > 0 && <Chip size="small" variant="outlined" label={count} />}
      </Box>
      {count === 0 ? (
        <Typography component="p" variant="body2" sx={{ px: 2, py: 2, color: "text.secondary" }}>
          {empty}
        </Typography>
      ) : (
        children
      )}
      {seeAll && (
        <Typography component="p" variant="body2" sx={SEE_ALL_SX}>
          {seeAll}
        </Typography>
      )}
    </Card>
  );
}

/** A row whose trip now has somewhere to go. */
function TripRow({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  return (
    <ListItemButton component={NextLink} href={`/agent/trips/${tripId}`} sx={ROW_SX}>
      {children}
    </ListItemButton>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <Box sx={ROW_SX}>{children}</Box>;
}

/**
 * A trip's status chip, from the one mapper that owns the translation.
 *
 * THIS USED TO BE A LITERAL `chip-status lead`, which was the only place in the repo that
 * produced a `lead` chip from a trip. `web/lib/trips/status.ts` calls itself "the one place
 * a trip becomes a chip and a label", its `StatusChip` union deliberately excludes `lead`
 * ("`lead` belongs to the Phase 2 Lead entity and is never produced from a trip"), and
 * `status.test.ts` asserts exactly that — writing the class in JSX broke the invariant
 * while stepping around the test that guards it. The visible cost was two colours for one
 * status: pink here, purple on the pipeline board one click away.
 *
 * `today` is read on one branch only — a `booked` trip with an unpaid milestone — and no
 * row on this screen carries a milestone date, so the empty string never reaches
 * `daysBetween`. The alternative is threading a date through five sections to feed a
 * parameter none of them uses.
 */
function TripChip({ status }: { status: string }) {
  const { chip, label } = tripStatusPresentation({
    status: status as TripStatus,
    nextUnpaidDueDate: null,
    today: "",
  });
  return <StatusChip kind={chip} label={label} />;
}

/** Initials, never a stock portrait standing in for a named client. */
function Initials({ name }: { name: string }) {
  const letters = name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return <Avatar sx={INITIALS_SX}>{letters}</Avatar>;
}

export default async function AgentWorklistPage() {
  const worklist = await loadWorklist();

  // Null means the READ failed. An empty book is a populated object with empty arrays —
  // the §2.2 contract, repeated here.
  if (!worklist) return <ErrorState />;

  const zero = worklist.needsYouCount === 0;

  return (
    <Box sx={PAGE_SX}>
      <AgentViews />

      <Box component="header" sx={{ mt: 2.5 }}>
        <Typography component="p" variant="overline" sx={OVERLINE_SX}>
          {worklist.periodLabel.toUpperCase()}
        </Typography>
        <Typography component="h1" variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
          {worklist.partOfDay}, {worklist.greetingName}.
          <br />
          {needsYouLine(worklist.needsYouCount)}
        </Typography>
        {/* The one place the worldview earns a line on this side: when nothing is urgent,
            say so and stop. No call to action underneath it. */}
        {zero && (
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {AGENT_COPY.greetingZeroSub}
          </Typography>
        )}
      </Box>

      <Box sx={KPIS_SX}>
        {worklist.kpis.map((k) => (
          <KpiTile key={k.id} kpi={k} />
        ))}
      </Box>

      <Section
        title={AGENT_COPY.proposalsTitle}
        count={worklist.proposalsAwaiting.length}
        empty={AGENT_COPY.proposalsEmpty}
      >
        {worklist.proposalsAwaiting.map((t) => (
          <TripRow key={t.tripId} tripId={t.tripId}>
            <Initials name={t.clientName} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="p" variant="subtitle2">
                {t.clientName}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {t.title}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography component="p" variant="caption" sx={MONEY_SX}>
                {t.valueLabel}
              </Typography>
              {t.dueLabel && (
                <Box sx={{ mt: 0.5 }}>
                  <StatusChip kind="proposal" label={t.dueLabel} />
                </Box>
              )}
            </Box>
          </TripRow>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.paymentsTitle}
        count={worklist.paymentsDue.length}
        empty={AGENT_COPY.paymentsEmpty}
      >
        {worklist.paymentsDue.map((p) => (
          <TripRow key={p.milestoneId} tripId={p.tripId}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="p" variant="subtitle2">
                {p.clientName}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {p.label}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography component="p" variant="caption" sx={MONEY_SX}>
                {p.amountLabel}
              </Typography>
              {/* No risk dots. payment_milestone.status is a four-value enum with no risk
                  model; `days_until` going negative is the real signal. */}
              <Typography
                component="p"
                variant="body2"
                sx={{ color: p.overdue ? "error.main" : "text.secondary" }}
              >
                {p.dueLabel}
              </Typography>
            </Box>
          </TripRow>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.inquiriesTitle}
        count={worklist.newInquiries.length}
        empty={AGENT_COPY.inquiriesEmpty}
        seeAll={AGENT_COPY.leadsDeferred}
      >
        {worklist.newInquiries.map((t) => (
          <TripRow key={t.tripId} tripId={t.tripId}>
            <Initials name={t.clientName} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="p" variant="subtitle2">
                {t.clientName}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {t.title}
              </Typography>
            </Box>
            <TripChip status={t.status} />
          </TripRow>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.departingTitle}
        count={worklist.departingSoon.length}
        empty={AGENT_COPY.departingEmpty}
      >
        {worklist.departingSoon.map((t) => (
          <TripRow key={t.tripId} tripId={t.tripId}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="p" variant="subtitle2">
                {t.clientName}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {t.title}
              </Typography>
            </Box>
            {t.startLabel && <StatusChip kind="traveling" label={t.startLabel} />}
          </TripRow>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.messagesTitle}
        count={worklist.recentMessages.length}
        empty={AGENT_COPY.messagesEmpty}
        seeAll={AGENT_COPY.messagesDeferred}
      >
        {worklist.recentMessages.map((m) => (
          <Row key={m.conversationId}>
            <Initials name={m.clientName} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: "flex" }}>
                <Typography component="p" variant="subtitle2" sx={{ flex: 1 }}>
                  {m.clientName}
                </Typography>
                <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                  {m.timeLabel}
                </Typography>
              </Box>
              <Typography component="p" variant="body2" sx={{ fontStyle: "italic" }}>
                {m.preview}
              </Typography>
            </Box>
            {m.unread > 0 && <Chip size="small" variant="outlined" label={m.unread} />}
          </Row>
        ))}
      </Section>
    </Box>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────────────

/** The page column: `mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8`. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1100, px: { xs: 2, md: 4 }, py: 3 } as const;

/** The kit header's overline (design/source-prototype/shared/mui-kit.jsx MuiScreenHeader). */
const OVERLINE_SX = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/**
 * The KPI rail's three layouts, the ones web/styles/agent.css drew: a horizontal snap
 * carousel below `md` (Pattern D: "KPI cards in a horizontal carousel near the top"), a
 * THREE-up grid across the tablet band, and the five-up grid only at §4.2's web breakpoint.
 *
 * FIVE ACROSS AT 768px DOES NOT FIT. At 768 the rail takes 72 and the page column's
 * `md:px-8` takes 64, so five `minmax(0, 1fr)` tracks with four 10px gaps are 118px each
 * and the content box is 86px. The amount is Poppins ExtraBold at 26px with no space in
 * it, so it cannot wrap and the track cannot grow: "$9,640" is already ~93px and paints over
 * the next tile. Five tiles do not clear a six-figure total until roughly 935px; three
 * across at 768 gives a 172px content box, which holds a seven-figure amount with room.
 *
 * MUI emits the breakpoint keys as ascending min-width queries, so the order the CSS file
 * had to get right by hand ("the narrower min-width comes first") is handled here.
 */
const KPIS_SX = {
  mt: 2,
  display: { xs: "flex", md: "grid" },
  gap: 1.25,
  overflowX: { xs: "auto", md: "visible" },
  scrollSnapType: "x mandatory",
  pb: 0.25,
  gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))", web: "repeat(5, minmax(0, 1fr))" },
} as const;

/**
 * A tile: 152px wide as a carousel card, free to shrink once it is a grid cell. Deliberately
 * NO `overflow: hidden` beyond the Card's own: clipping an amount turns "$1,284,500" into
 * "$1,284,50", which reads as a real number and is wrong; the breakpoints above are the fix.
 */
const KPI_TILE_SX = { minWidth: { xs: 152, md: 0 }, flexShrink: 0, scrollSnapAlign: "start" } as const;

/** The legacy 14px × 16px tile padding on CardContent, with MUI's last-child rule cancelled. */
const KPI_PAD_SX = { px: 2, py: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** `.t-label` on MUI's caption, dimmed into the tile's colour. */
const KPI_LABEL_SX = { fontWeight: 500, letterSpacing: "0.4px", opacity: 0.85 } as const;

/**
 * The amount. 26px is pinned on purpose: it is the figure the rail's breakpoint arithmetic
 * above is computed from, not a leftover from the legacy type scale.
 */
const KPI_VALUE_SX = { mt: 0.5, fontSize: 26, fontWeight: 800, lineHeight: 1 } as const;

/** A section's title row: `px-4 py-3` over a divider. */
const SECTION_HEAD_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 2,
  py: 1.5,
  borderBottom: 1,
  borderColor: "divider",
} as const;

/** The "see all" / deferral footer under a section's rows. */
const SEE_ALL_SX = {
  px: 2,
  py: 1,
  borderTop: 1,
  borderColor: "divider",
  color: "text.secondary",
  opacity: 0.6,
} as const;

/**
 * A row: `flex items-center gap-3 px-4 py-3`, with a rule between rows but not above the
 * first. `& + &` draws the rule on a row that FOLLOWS a row, so the first one under the
 * section header has none — without `:first-child`, which emotion flags as unsafe on the
 * server, and without the element-type dependence of `:first-of-type` (the header and a
 * read-only Row are both divs).
 */
const ROW_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  px: 2,
  py: 1.5,
  borderColor: "divider",
  "& + &": { borderTop: 1 },
} as const;

/** A monospaced amount: JetBrains Mono, bold, at MUI's caption size. */
const MONEY_SX = { fontFamily: "mono", fontWeight: 700 } as const;

/** The 36px initials disc on the primary container pair. */
const INITIALS_SX = {
  width: 36,
  height: 36,
  flexShrink: 0,
  bgcolor: "primary.container",
  color: "primary.onContainer",
  fontSize: 12,
  fontWeight: 700,
} as const;
