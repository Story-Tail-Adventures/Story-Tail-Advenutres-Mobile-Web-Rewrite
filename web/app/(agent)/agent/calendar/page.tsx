import Link from "next/link";

import { AgentViews } from "@/components/agent/AgentViews";
import { ErrorState } from "@/components/client/states";
import {
  buildMonth,
  monthOf,
  validMonth,
  type CalendarDay,
  type CalendarEvent,
} from "@/lib/agent/calendar";
import { AGENT_COPY } from "@/lib/agent/content";
import { loadCalendar } from "@/lib/agent/queries";

/**
 * Screen 3.2.3 — Calendar.
 *
 * §4.4 ASKS FOR A DIFFERENT DEFAULT PER VIEWPORT: "Mobile: agenda view default; tablet:
 * week view; web: month view default." The first version of this screen read `?view=` and
 * nothing else, so a phone loaded the seven-column month table — ~49px a day cell, ~37px
 * of truncated event label — and the agenda was reachable only by tapping the toggle. Both
 * branches are now in the DOM and `web/styles/agent.css`'s `md` breakpoint picks between
 * them, so the mobile default is the agenda and the web default is the month with no client
 * state, no viewport sniffing and no layout shift.
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
 */

export const metadata = { title: "Calendar" };

const KIND_TONE: Record<CalendarEvent["kind"], string> = {
  departure: "bg-[var(--md-tertiary-container)] text-[var(--md-on-tertiary-container)]",
  return: "bg-[var(--md-surface-3)] text-[var(--md-on-surface)]",
  payment: "bg-[var(--md-error-container)] text-[var(--md-on-error-container)]",
  availability: "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayCell({ day }: { day: CalendarDay }) {
  const shown = day.events.slice(0, 2);
  const overflow = day.events.length - shown.length;
  return (
    <td
      className={`align-top border border-[var(--md-outline-variant)] p-1.5 ${
        day.inMonth ? "" : "opacity-40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${
            day.isToday
              ? "flex size-6 items-center justify-center rounded-full bg-[var(--md-primary)] font-bold text-[var(--md-on-primary)]"
              : "text-[var(--md-on-surface-variant)]"
          }`}
        >
          {day.dayOfMonth}
        </span>
      </div>
      {shown.map((e) => (
        <p
          key={e.id}
          className={`mt-1 truncate rounded px-1 py-0.5 text-[11px] ${KIND_TONE[e.kind]}`}
          title={`${e.label}${e.detail ? ` · ${e.detail}` : ""}`}
        >
          {e.label}
        </p>
      ))}
      {/* Several events on one day is routine; the prototype's map allows exactly one. */}
      {overflow > 0 && (
        <p className="mt-1 text-[11px] text-[var(--md-on-surface-variant)]">+{overflow} more</p>
      )}
    </td>
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
  className,
}: {
  month: string;
  active: "month" | "agenda";
  className: string;
}) {
  return (
    <div className={`agent-views ${className}`}>
      <Link
        href={`/agent/calendar?month=${month}&view=month`}
        className="agent-view-link"
        aria-current={active === "month" ? "page" : undefined}
      >
        {AGENT_COPY.calendarMonthLabel}
      </Link>
      <Link
        href={`/agent/calendar?month=${month}&view=agenda`}
        className="agent-view-link"
        aria-current={active === "agenda" ? "page" : undefined}
      >
        {AGENT_COPY.calendarAgendaLabel}
      </Link>
    </div>
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

  // With no choice made: agenda below `md`, month from `md` up. Tailwind's utilities sit in
  // a later cascade layer than `.agent-views`, so `md:hidden` wins over the component rule
  // the same way `.agent-rail hidden md:flex` already does.
  const monthClass = view === "month" ? "" : view === "agenda" ? "hidden" : "hidden md:block";
  const agendaClass = view === "agenda" ? "" : view === "month" ? "hidden" : "md:hidden";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8">
      <AgentViews />

      <header className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="t-headline flex-1 text-[24px]">{grid.monthLabel}</h1>
        <ViewToggle month={month} active={view ?? "agenda"} className="md:hidden" />
        <ViewToggle month={month} active={view ?? "month"} className="hidden md:flex" />
        <div className="flex gap-2">
          <Link className="btn btn-tonal btn-sm" href={`/agent/calendar?month=${grid.prevMonth}${viewParam}`}>
            ← {grid.prevMonth}
          </Link>
          <Link className="btn btn-tonal btn-sm" href={`/agent/calendar?month=${grid.nextMonth}${viewParam}`}>
            {grid.nextMonth} →
          </Link>
        </div>
      </header>

      {grid.agenda.length === 0 && (
        <p className="t-body-s mt-4 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.calendarEmpty}
        </p>
      )}

      <ol className={`mt-4 ${agendaClass}`}>
        {grid.agenda.map((e) => (
          <li key={e.id} className="card mt-2 flex items-center gap-3 p-3">
            <span className={`w-2 self-stretch rounded-full ${KIND_TONE[e.kind]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="t-title-s text-[13px]">{e.label}</p>
              {e.detail && (
                <p className="t-body-s text-[var(--md-on-surface-variant)]">{e.detail}</p>
              )}
            </div>
            <span className="t-body-s text-[var(--md-on-surface-variant)]">{e.date.slice(5)}</span>
          </li>
        ))}
      </ol>

      {/* The wrapper carries the visibility, not the table: `md:block` on a `<table>` would
          replace `display: table` and collapse the grid into a stack of cells. */}
      <div className={monthClass}>
        <table className="mt-4 w-full table-fixed border-collapse">
          <caption className="sr-only">{grid.monthLabel}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="t-label pb-1 text-left text-[var(--md-on-surface-variant)]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.weeks.map((week) => (
              <tr key={week[0].date}>
                {week.map((day) => (
                  <DayCell key={day.date} day={day} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="t-body-s mt-4 text-[var(--md-on-surface-variant)] opacity-60">
        {AGENT_COPY.availabilityDeferred}
      </p>
    </div>
  );
}
