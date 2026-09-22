import Link from "next/link";

import { AgentViews } from "@/components/agent/AgentViews";
import { ErrorState } from "@/components/client/states";
import { buildMonth, monthOf, type CalendarDay, type CalendarEvent } from "@/lib/agent/calendar";
import { AGENT_COPY } from "@/lib/agent/content";
import { loadCalendar } from "@/lib/agent/queries";

/**
 * Screen 3.2.3 — Calendar.
 *
 * MONTH IS THE WEB DEFAULT, AGENDA THE MOBILE ONE (§4.4). Both are rendered from the same
 * event list and the view moves through `?view=`, so each is shareable, the back button
 * means what it says, and there is no client state. WEEK IS NOT BUILT: every event §3.2.3
 * names is all-day, so a week view would be a time grid with nothing in the time axis. It
 * becomes meaningful when §3.12 lands availability with hours.
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

export default async function AgentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const params = await searchParams;
  const data = await loadCalendar();
  if (!data) return <ErrorState />;

  // Default to the month the agent is actually in, computed from `as_of_date` — which the
  // accessors produced in `agent.time_zone`, not in UTC. A malformed `?month=` falls back
  // rather than rendering an empty grid for a month that does not exist.
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : monthOf(data.today);
  const grid = buildMonth(month, data.today, data.events);
  const agenda = params.view === "agenda";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8">
      <AgentViews />

      <header className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="t-headline flex-1 text-[24px]">{grid.monthLabel}</h1>
        <div className="agent-views">
          <Link
            href={`/agent/calendar?month=${month}`}
            className="agent-view-link"
            aria-current={agenda ? undefined : "page"}
          >
            {AGENT_COPY.calendarMonthLabel}
          </Link>
          <Link
            href={`/agent/calendar?month=${month}&view=agenda`}
            className="agent-view-link"
            aria-current={agenda ? "page" : undefined}
          >
            {AGENT_COPY.calendarAgendaLabel}
          </Link>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-tonal btn-sm" href={`/agent/calendar?month=${grid.prevMonth}${agenda ? "&view=agenda" : ""}`}>
            ← {grid.prevMonth}
          </Link>
          <Link className="btn btn-tonal btn-sm" href={`/agent/calendar?month=${grid.nextMonth}${agenda ? "&view=agenda" : ""}`}>
            {grid.nextMonth} →
          </Link>
        </div>
      </header>

      {grid.agenda.length === 0 && (
        <p className="t-body-s mt-4 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.calendarEmpty}
        </p>
      )}

      {agenda ? (
        <ol className="mt-4">
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
      ) : (
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
      )}

      <p className="t-body-s mt-4 text-[var(--md-on-surface-variant)] opacity-60">
        {AGENT_COPY.availabilityDeferred}
      </p>
    </div>
  );
}
