import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import {
  buildMonth,
  monthOf,
  validMonth,
  type CalendarDay,
  type CalendarEvent,
} from "@/lib/agent/calendar";
import { AGENT_COPY } from "@/lib/agent/content";
import { loadCalendar } from "@/lib/agent/queries";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.2.3 — Calendar.
 *
 * §4.4 ASKS FOR A DIFFERENT DEFAULT PER VIEWPORT: "Mobile: agenda view default; tablet:
 * week view; web: month view default." The first version of this screen read `?view=` and
 * nothing else, so a phone loaded the seven-column month table — ~49px a day cell, ~37px
 * of truncated event label — and the agenda was reachable only by tapping the toggle. Both
 * branches are now in the DOM and an `md` breakpoint picks between them (CSS only, in sx —
 * see `agendaDisplay` / `monthDisplay` below), so the mobile default is the agenda and the
 * web default is the month with no client state, no viewport sniffing and no layout shift.
 *
 * `?view=` STILL WINS when it is set, at every width, so both views stay shareable and the
 * back button means what it says. Unset is the responsive default rather than "month".
 *
 * WEEK IS NOT BUILT, which is §4.4's tablet half and a stated deferral rather than a gap:
 * every event §3.2.3 names is all-day, so a week view would be a time grid with nothing in
 * the time axis. It becomes meaningful when §3.12 lands availability with hours. Tablet
 * gets the month grid until then.
 *
 * THE GRID IS REAL, which is the main departure from the artboard — see
 * `lib/agent/calendar.ts` for what the prototype's version does instead, and its test file
 * for the eleven ways that is wrong.
 *
 * THE AVAILABILITY LAYER IS ABSENT with a stated reason: `time_off_blocks` is jsonb with no
 * declared schema.
 *
 * ON MUI (step 2 of the migration, the agent app PR): the month grid is an MUI Table (the
 * artboard's CSS grid of Boxes would lose the `<th scope="col">` and caption a real table
 * carries), the agenda an MUI List of Cards, the toggles Chips rendered as links and the
 * month arrows outlined secondary Buttons. Still a Server Component with plain sx.
 */

export const metadata = { title: "Calendar" };

/** An event's colour pair per kind — the M3 container roles, or the neutral surface. */
const KIND_TONE: Record<CalendarEvent["kind"], { bgcolor: string; color: string }> = {
  departure: { bgcolor: "tertiary.container", color: "tertiary.onContainer" },
  return: { bgcolor: "surface.3", color: "text.primary" },
  payment: { bgcolor: "error.container", color: "error.onContainer" },
  availability: { bgcolor: "secondary.container", color: "secondary.onContainer" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayCell({ day }: { day: CalendarDay }) {
  const shown = day.events.slice(0, 2);
  const overflow = day.events.length - shown.length;
  return (
    <TableCell sx={{ ...DAY_CELL_SX, opacity: day.inMonth ? 1 : 0.4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {day.isToday ? (
          <Avatar component="span" sx={TODAY_SX}>
            {day.dayOfMonth}
          </Avatar>
        ) : (
          <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
            {day.dayOfMonth}
          </Typography>
        )}
      </Box>
      {shown.map((e) => {
        const title = `${e.label}${e.detail ? ` · ${e.detail}` : ""}`;
        const sx = { ...EVENT_SX, ...KIND_TONE[e.kind] };
        // A departure/return/payment event carries a trip id and is now a live link; an
        // `availability` event (not yet emitted anywhere) has nowhere to go.
        return e.href ? (
          <Typography
            key={e.id}
            component={NextLink}
            href={e.href}
            variant="caption"
            noWrap
            title={title}
            sx={sx}
          >
            {e.label}
          </Typography>
        ) : (
          <Typography key={e.id} component="p" variant="caption" noWrap title={title} sx={sx}>
            {e.label}
          </Typography>
        );
      })}
      {/* Several events on one day is routine; the prototype's map allows exactly one. */}
      {overflow > 0 && (
        <Typography component="p" variant="caption" sx={{ mt: 0.5, color: "text.secondary" }}>
          +{overflow} more
        </Typography>
      )}
    </TableCell>
  );
}

/**
 * The month / agenda toggle.
 *
 * Rendered twice, once per viewport band, because with `?view=` unset the two bands are on
 * different views and one shared toggle could only be right about one of them. Both links
 * carry an explicit `view=`, so a tap pins the choice at every width from then on. The
 * hidden copy is `display: none`, so no screen reader meets it twice.
 */
function ViewToggle({
  month,
  active,
  display,
}: {
  month: string;
  active: "month" | "agenda";
  /** Which band this copy shows in: `{ xs: "flex", md: "none" }` or the reverse. */
  display: { xs: "flex" | "none"; md: "flex" | "none" };
}) {
  const monthOn = active === "month";
  return (
    <Box sx={{ ...VIEWS_SX, display }}>
      <Chip
        component={NextLink}
        href={`/agent/calendar?month=${month}&view=month`}
        clickable
        label={AGENT_COPY.calendarMonthLabel}
        color={monthOn ? "secondary" : "default"}
        variant={monthOn ? "filled" : "outlined"}
        aria-current={monthOn ? "page" : undefined}
        sx={VIEW_LINK_SX}
      />
      <Chip
        component={NextLink}
        href={`/agent/calendar?month=${month}&view=agenda`}
        clickable
        label={AGENT_COPY.calendarAgendaLabel}
        color={monthOn ? "default" : "secondary"}
        variant={monthOn ? "outlined" : "filled"}
        aria-current={monthOn ? undefined : "page"}
        sx={VIEW_LINK_SX}
      />
    </Box>
  );
}

export default async function AgentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const params = await searchParams;
  const data = await loadCalendar();
  if (!data) return <ErrorState />;

  // Default to the month the agent is actually in, computed from `as_of_date` — which the
  // accessors produced in `agent.time_zone`, not in UTC.
  //
  // `validMonth` MOVED TO lib/agent/calendar.ts and is imported rather than written here.
  // It is the one piece of §3.2.3 logic that decides whether a URL may be trusted, and as a
  // page-local unexported function it was the only piece with no test while `monthOf`,
  // `shiftMonth` and `buildMonth` all sat in that module under calendar.test.ts. Its
  // window also has to agree with the one `navMonth` holds the prev/next links inside, and
  // two copies of a range in two files is how they stop agreeing.
  const month = validMonth(params.month, monthOf(data.today));
  const grid = buildMonth(month, data.today, data.events);

  // Null is "no choice made", which is the responsive default, not a synonym for month.
  const view = params.view === "agenda" ? "agenda" : params.view === "month" ? "month" : null;
  const viewParam = view ? `&view=${view}` : "";

  // With no choice made: agenda below `md`, month from `md` up. Both are plain `display`
  // values, so the pick is CSS only and the server HTML is the same at every width.
  const agendaDisplay =
    view === "agenda" ? "block" : view === "month" ? "none" : { xs: "block", md: "none" };
  const monthDisplay =
    view === "month" ? "block" : view === "agenda" ? "none" : { xs: "none", md: "block" };

  return (
    <Box sx={PAGE_SX}>
      <AgentViews />

      <Box component="header" sx={HEADER_SX}>
        <Typography component="h1" variant="h5" sx={{ flex: 1, fontWeight: 700 }}>
          {grid.monthLabel}
        </Typography>
        <ViewToggle month={month} active={view ?? "agenda"} display={{ xs: "flex", md: "none" }} />
        <ViewToggle month={month} active={view ?? "month"} display={{ xs: "none", md: "flex" }} />
        <Box sx={{ display: "flex", gap: 1 }}>
          <MuiButton
            component={NextLink}
            href={`/agent/calendar?month=${grid.prevMonth}${viewParam}`}
            variant="outlined"
            color="secondary"
            size="small"
            sx={BTN_SM}
          >
            ← {grid.prevMonth}
          </MuiButton>
          <MuiButton
            component={NextLink}
            href={`/agent/calendar?month=${grid.nextMonth}${viewParam}`}
            variant="outlined"
            color="secondary"
            size="small"
            sx={BTN_SM}
          >
            {grid.nextMonth} →
          </MuiButton>
        </Box>
      </Box>

      {grid.agenda.length === 0 && (
        <Typography component="p" variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
          {AGENT_COPY.calendarEmpty}
        </Typography>
      )}

      <List component="ol" disablePadding sx={{ mt: 2, display: agendaDisplay }}>
        {grid.agenda.map((e) => {
          const body = (
            <>
              <Box
                component="span"
                aria-hidden="true"
                sx={{ ...AGENDA_BAR_SX, bgcolor: KIND_TONE[e.kind].bgcolor }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography component="p" variant="subtitle2">
                  {e.label}
                </Typography>
                {e.detail && (
                  <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                    {e.detail}
                  </Typography>
                )}
              </Box>
              <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                {e.date.slice(5)}
              </Typography>
            </>
          );
          return (
            <Card key={e.id} component="li" sx={{ mt: 1 }}>
              {e.href ? (
                <ListItemButton component={NextLink} href={e.href} sx={AGENDA_ROW_SX}>
                  {body}
                </ListItemButton>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", ...AGENDA_ROW_SX }}>{body}</Box>
              )}
            </Card>
          );
        })}
      </List>

      {/* The wrapper carries the visibility, not the table: `display: block` on a `<table>`
          would replace `display: table` and collapse the grid into a stack of cells. */}
      <Box sx={{ display: monthDisplay }}>
        <Table sx={{ mt: 2, tableLayout: "fixed" }}>
          <Box component="caption" sx={VISUALLY_HIDDEN}>
            {grid.monthLabel}
          </Box>
          <TableHead>
            <TableRow>
              {WEEKDAYS.map((d) => (
                <TableCell key={d} component="th" scope="col" sx={WEEKDAY_SX}>
                  {d}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {grid.weeks.map((week) => (
              <TableRow key={week[0].date}>
                {week.map((day) => (
                  <DayCell key={day.date} day={day} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Typography component="p" variant="body2" sx={{ mt: 2, color: "text.secondary", opacity: 0.6 }}>
        {AGENT_COPY.availabilityDeferred}
      </Typography>
    </Box>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────────────

/** The page column: `mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8`. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1100, px: { xs: 2, md: 4 }, py: 3 } as const;

/** The title row: `mt-5 flex flex-wrap items-center gap-3`. */
const HEADER_SX = { mt: 2.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 } as const;

/** The legacy `.agent-views` row: 6px between pills, wrapping. */
const VIEWS_SX = { gap: 0.75, flexWrap: "wrap" } as const;

/**
 * The legacy `.agent-view-link` box on MUI's Chip — the same constant AgentViews.tsx and the
 * pipeline carry, kept local to each file while the agent app is converted in parallel.
 */
const VIEW_LINK_SX = {
  height: "auto",
  minHeight: 34,
  borderRadius: 999,
  fontWeight: 600,
  "& .MuiChip-label": { px: 1.75 },
  "@media (pointer: coarse)": { minHeight: 44 },
} as const;

/** The legacy `.btn.btn-tonal.btn-sm` box on MUI's Button: 32px tall, 16px sides. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** An agenda row: `flex items-center gap-3 p-3`. */
const AGENDA_ROW_SX = { gap: 1.5, p: 1.5 } as const;

/** The 8px colour bar at the start of an agenda row. `flexShrink: 0` so a long label cannot squeeze it away. */
const AGENDA_BAR_SX = { width: 8, flexShrink: 0, alignSelf: "stretch", borderRadius: 999 } as const;

/** A weekday heading: `.t-label pb-1 text-left`, no rule under it. */
const WEEKDAY_SX = {
  typography: "caption",
  fontWeight: 500,
  p: 0,
  pb: 0.5,
  borderBottom: 0,
  textAlign: "left",
  color: "text.secondary",
} as const;

/** A day cell: `align-top border p-1.5`, ruled on every side. */
const DAY_CELL_SX = { verticalAlign: "top", border: 1, borderColor: "divider", p: 0.75 } as const;

/** Today's number: the 24px primary disc. */
const TODAY_SX = {
  width: 24,
  height: 24,
  bgcolor: "primary.main",
  color: "primary.contrastText",
  fontSize: 12,
  fontWeight: 700,
} as const;

/** An event pill inside a day cell: `mt-1 block truncate rounded px-1 py-0.5`. */
const EVENT_SX = { display: "block", mt: 0.5, px: 0.5, py: 0.25, borderRadius: 1, textDecoration: "none" } as const;

