import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { StageMenu } from "@/components/agent/StageMenu";
import { ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { AGENT_COPY } from "@/lib/agent/content";
import { PIPELINE_STAGES, loadPipeline } from "@/lib/agent/queries";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

/**
 * Screen 3.2.2 — Pipeline / Funnel View.
 *
 * FIVE COLUMNS, FROM THE ENUM. The prototype draws `Inquiry · Qualified · Proposal · Booked
 * · Traveling`; `qualified` and `traveling` do not exist in `trip_status`, which is
 * `inquiry · proposal · booked · in_progress · completed · cancelled`. Screen-Inventory
 * §3.2.2's five map exactly onto it minus `cancelled`, so the Data Model and the document
 * agree against the drawing and the hierarchy puts both above it. Recorded as a prototype
 * defect in the §3.2.2 amendment rather than chased with a migration.
 *
 * `cancelled` IS COUNTED, NOT COLUMNED. It is a status, not a funnel stage — excluded from
 * the board and named beneath it, so cancelled trips do not become invisible.
 *
 * NO "ALL ADVISORS / GYASI" FILTER CHIPS. The prototype draws them; there is one advisor
 * until P3, and a filter with a single option is noise rather than an honest disabled state.
 *
 * THREE LAYOUTS, ONE DOM, per §4.4's three-way split — and the first version of this screen
 * shipped only the middle one. A phone got the tablet board: 272px columns in a horizontal
 * scroller inside a 343px viewport, with four of five stages behind a sideways drag. §4.4
 * is explicit that "mobile collapses the kanban into a stage-picker (one stage at a time)",
 * so `?stage=` now chooses the stage a phone shows and the other columns are hidden (see
 * `COLUMN_SX`). Above `md` every column is back; at §4.2's web breakpoint the columns go
 * flexible so all five fit without a scrollbar, which fixed columns never did — five 272px
 * columns need 1400px of board and this container caps at 1336.
 *
 * A LINK, NOT CLIENT STATE, for that picker: the stage is shareable, the back button means
 * what it says, and the board stays a server component. Only the stage menu on each card is
 * a client island.
 *
 * NOT a fixed-height grid — the prototype sets `height: calc(100% - 80px)` with scrolling
 * off, which is right for an artboard and wrong in a browser. See `.client-fill`'s doc
 * comment in client.css for what happens when an ancestor-dependent height meets React
 * streaming.
 *
 * ON MUI (step 2 of the migration, the agent app PR): the board's three layouts moved from
 * web/styles/agent.css into sx breakpoint objects (`BOARD_SX`, `COLUMN_SX`), the columns
 * are the artboard's flat Paper on surface.2, the cards MUI Cards, and the stage-picker a
 * row of Chips rendered as links. The DOM, the `?stage=` link and the `data-selected`
 * attribute the phone layout keys on are unchanged.
 */

export const metadata = { title: "Pipeline" };

/**
 * The column header's chip tone, from the one mapper that owns the translation.
 *
 * The old ternary translated `in_progress` to `traveling` and forgot the other half:
 * `completed` fell through as `chip-status completed`, which `components.css` does not
 * define in either scheme, so the fifth column's chip rendered as bare uppercase text with
 * no background. `tripStatusPresentation` already maps `completed` to `past` and
 * `in_progress` to `traveling`, and its `StatusChip` union is the list of variants that
 * actually exist — so this takes the tone from there rather than inventing a sixth.
 *
 * ONLY THE TONE. The visible word stays `col.label`, because a column is a funnel STAGE:
 * §3.2.2 names them Inquiry / Proposal / Booked / In progress / Completed, where the mapper
 * speaks in a traveler's terms ("Traveling now", "Past trip").
 *
 * `today` is read on one branch only — a `booked` trip with an unpaid milestone — and a
 * column header carries no milestone, so the empty string never reaches `daysBetween`.
 */
function stageChipTone(status: string): string {
  return tripStatusPresentation({
    status: status as TripStatus,
    nextUnpaidDueDate: null,
    today: "",
  }).chip;
}

export default async function AgentPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const params = await searchParams;
  const pipeline = await loadPipeline();
  if (!pipeline) return <ErrorState />;

  // An unknown or missing `?stage=` falls back to the first stage rather than to an empty
  // board — the same rule the calendar's `?month=` guard follows.
  const selectedStage: string =
    pipeline.columns.find((c) => c.status === params.stage)?.status ?? PIPELINE_STAGES[0].status;

  return (
    <Box sx={PAGE_SX}>
      <AgentViews />

      <Box component="header" sx={{ mt: 2.5 }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
          {AGENT_COPY.pipelineTitle}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
          {AGENT_COPY.pipelineSub}
        </Typography>
      </Box>

      {/* §4.4's stage-picker. Phone only — above `md` every column is on screen, so a
          picker would be a control that selects what you can already see. The count rides
          along so the agent can tell where the work is before switching. */}
      <Box component="nav" aria-label="Pipeline stages" sx={STAGE_PICKER_SX}>
        {pipeline.columns.map((col) => {
          const active = col.status === selectedStage;
          return (
            <Chip
              key={col.status}
              component={NextLink}
              href={`/agent/pipeline?stage=${col.status}`}
              clickable
              label={`${col.label} · ${col.count}`}
              color={active ? "secondary" : "default"}
              variant={active ? "filled" : "outlined"}
              aria-current={active ? "page" : undefined}
              sx={VIEW_LINK_SX}
            />
          );
        })}
      </Box>

      <Box sx={BOARD_SX}>
        {pipeline.columns.map((col) => (
          <Paper
            key={col.status}
            component="section"
            elevation={0}
            data-selected={col.status === selectedStage ? "true" : undefined}
            sx={COLUMN_SX}
          >
            <Box component="header" sx={{ pb: 1, borderBottom: 1, borderColor: "divider" }}>
              <StatusChip kind={stageChipTone(col.status)} label={col.label} />
              <Typography component="p" variant="subtitle2" sx={{ mt: 1 }}>
                {col.count} {col.count === 1 ? "trip" : "trips"} ·{" "}
                <Typography component="span" variant="subtitle2" sx={{ color: "text.secondary" }}>
                  {col.totalLabel}
                </Typography>
              </Typography>
            </Box>

            {col.cards.length === 0 ? (
              <Typography component="p" variant="body2" sx={{ py: 1, color: "text.secondary" }}>
                {AGENT_COPY.pipelineEmptyColumn}
              </Typography>
            ) : (
              col.cards.map((c) => (
                <Card key={c.tripId} component="article">
                  <CardContent sx={CARD_PAD_SX}>
                    {/* The link wraps everything except StageMenu below: a Link inside an
                        interactive control's own click target is a nested-interactive-element
                        a11y violation, and StageMenu's own click must stay independent of it. */}
                    <MuiLink
                      component={NextLink}
                      href={`/agent/trips/${c.tripId}`}
                      underline="none"
                      color="inherit"
                      sx={{ display: "block" }}
                    >
                      <Typography component="p" variant="subtitle2">
                        {c.clientName}
                      </Typography>
                      <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                        {c.title}
                      </Typography>
                      <Typography component="p" variant="caption" sx={MONEY_SX}>
                        {c.valueLabel}
                      </Typography>
                    </MuiLink>
                    <StageMenu
                      tripId={c.tripId}
                      status={c.status}
                      version={c.version}
                      stages={PIPELINE_STAGES}
                    />
                  </CardContent>
                </Card>
              ))
            )}
          </Paper>
        ))}
      </Box>

      {pipeline.cancelledCount > 0 && (
        <Typography component="p" variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
          {AGENT_COPY.cancelledNote(pipeline.cancelledCount)}
        </Typography>
      )}
    </Box>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────────────

/** The page column: `mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8`. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1400, px: { xs: 2, md: 4 }, py: 3 } as const;

/** The stage-picker row: the view-switcher's `.agent-views` geometry, phone only. */
const STAGE_PICKER_SX = {
  mt: 2,
  display: { xs: "flex", md: "none" },
  gap: 0.75,
  flexWrap: "wrap",
} as const;

/**
 * The legacy `.agent-view-link` box on MUI's Chip — the same constant AgentViews.tsx and the
 * calendar carry, kept local to each file while the agent app is converted in parallel.
 */
const VIEW_LINK_SX = {
  height: "auto",
  minHeight: 34,
  borderRadius: 999,
  fontWeight: 600,
  "& .MuiChip-label": { px: 1.75 },
  "@media (pointer: coarse)": { minHeight: 44 },
} as const;

/**
 * The board, in §4.4's three layouts (the rules web/styles/agent.css used to hold):
 *
 *   phone  — a column, one stage showing (see COLUMN_SX).
 *   tablet — "2-3 stages at once with horizontal scroll": a row that scrolls sideways.
 *   web    — "the full kanban (5 stages side-by-side)": the row, no scroll.
 */
const BOARD_SX = {
  mt: 2,
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  gap: 1.25,
  alignItems: { md: "flex-start" },
  overflowX: { md: "auto", web: "visible" },
  pb: { md: 1 },
} as const;

/**
 * A stage column. Hidden on a phone unless it is the `?stage=` the page selected — the
 * attribute selector beats the base rule on specificity, so the chosen stage shows below
 * `md` and every stage shows from `md` up. 272px fixed on the tablet band, a flexible track
 * at `web` so five fit in the 1336px content column.
 */
const COLUMN_SX = {
  display: { xs: "none", md: "flex" },
  flexDirection: "column",
  gap: 1,
  p: 1.25,
  bgcolor: "surface.2",
  flex: { md: "0 0 272px", web: "1 1 0" },
  minWidth: { web: 0 },
  '&[data-selected="true"]': { display: "flex" },
} as const;

/** The legacy `.card.p-3` (12px) on CardContent, with MUI's last-child rule cancelled. */
const CARD_PAD_SX = { p: 1.5, "&:last-child": { pb: 1.5 } } as const;

/** A monospaced amount: JetBrains Mono, bold, at MUI's caption size. */
const MONEY_SX = { mt: 1, fontFamily: "mono", fontWeight: 700 } as const;
