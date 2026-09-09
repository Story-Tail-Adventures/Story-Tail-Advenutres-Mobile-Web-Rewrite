import Form from "next/form";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { EXPLORE } from "@/app/(public)/(hero)/explore/content";
import { todayIso } from "@/lib/public/dates";
import { effectiveMode, SEARCH_TIME_ZONE, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { inquirySummary } from "./filters";

/**
 * The results header pill (design C204), as a REAL form.
 *
 * It used to be `InquiryBar` — read-only cells plus an "Update" button linking to /explore —
 * and that link went to a BLANK search form. Changing one thing about a search meant retyping
 * all of it, which is the opposite of what a button called "Update" promises.
 *
 * `InquiryBar` is deliberately left alone: the three topic pages use it as a read-only sticky
 * bar and it is correct there. This is the one place the pill needs to be editable, so the
 * editable version lives here rather than growing a mode into a shared component.
 *
 * EDITING HAPPENS IN PLACE rather than by navigating to /explore, for two reasons. This route
 * is already dynamic (it reads searchParams), so a form here costs nothing, while making
 * /explore read them would turn the main public landing page from static to dynamic — and
 * BRD §15.1 makes SEO load-bearing for exactly that page. And it is simply fewer steps.
 *
 * EVERYTHING NOT IN THE FORM RIDES AS A HIDDEN INPUT. Filters, sort, topic and mode live in
 * the URL too, and a form that posted only the three visible fields would silently clear
 * them — the same trap `FilterRail` avoids from the other direction.
 */
/** Anchor target, so an empty state can send someone back to the form on this page. */
export const SEARCH_ANCHOR = "update-search";

export function SearchUpdateBar({ q }: { q: SearchQuery }) {
  const today = todayIso(SEARCH_TIME_ZONE);
  const mode = effectiveMode(q);

  const carried = (
    <>
      {/* `mode` is written explicitly, not derived: an update that clears the dates would
          otherwise silently drop the visitor from Hotels back to the curated catalog. */}
      <input type="hidden" name="mode" value={mode} />
      {q.topic && <input type="hidden" name="topic" value={q.topic} />}
      {q.sort !== "best-fit" && <input type="hidden" name="sort" value={q.sort} />}
      {q.types.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
      {q.vibes.map((v) => <input key={v} type="hidden" name="vibe" value={v} />)}
      {q.budgets.map((b) => <input key={b} type="hidden" name="budget" value={b} />)}
      {q.stars.map((s) => <input key={s} type="hidden" name="star" value={s} />)}
      {q.amenities.map((a) => <input key={a} type="hidden" name="amenity" value={a} />)}
      {q.rates.map((r) => <input key={r} type="hidden" name="rate" value={r} />)}
    </>
  );

  const cells = (compact: boolean) => (
    <>
      <div
        className={cn(
          "min-w-0 flex-1 border-outline-variant",
          compact ? "flex items-center gap-1.5 border-r px-3.5 py-2.5" : "flex items-center gap-2.5 border-b py-1.5",
        )}
      >
        <Icon name="map" size={compact ? 12 : 14} className="shrink-0 text-brand-orange" />
        {!compact && (
          <label htmlFor="update-dest" className="t-label w-19 shrink-0 text-on-surface-variant">
            {RESULTS.pill.destination}
          </label>
        )}
        <input
          id={compact ? "update-dest-compact" : "update-dest"}
          name="dest"
          type="text"
          maxLength={60}
          defaultValue={q.dest ?? ""}
          placeholder={RESULTS.pill.anywhere}
          aria-label={compact ? RESULTS.pill.destination : undefined}
          autoComplete="off"
          className={cn(
            "w-full min-w-0 rounded-sm bg-transparent text-on-surface placeholder:text-on-surface-variant",
            compact ? "t-label-l" : "t-title-s min-h-11",
          )}
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 border-outline-variant",
          compact ? "flex items-center border-r px-3.5 py-2.5" : "flex items-center gap-2.5 border-b py-1.5",
        )}
      >
        {!compact && <Icon name="calendar" size={14} className="shrink-0 text-brand-orange" />}
        {!compact && (
          <span className="t-label w-19 shrink-0 text-on-surface-variant">{RESULTS.pill.dates}</span>
        )}
        <DateRangePicker
          idPrefix={compact ? "update-compact" : "update-stacked"}
          label={RESULTS.pill.dates}
          placeholder={RESULTS.pill.flexibleDates}
          today={today}
          defaultCheckIn={q.checkIn}
          defaultCheckOut={q.checkOut}
          variant={compact ? "compact" : "stacked"}
          copy={EXPLORE.dates}
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1",
          compact ? "flex items-center gap-1.5 px-3.5 py-2.5" : "flex items-center gap-2.5 py-1.5",
        )}
      >
        <Icon name="user" size={compact ? 12 : 14} className="shrink-0 text-brand-orange" />
        {!compact && (
          <label htmlFor="update-travelers" className="t-label w-19 shrink-0 text-on-surface-variant">
            {RESULTS.pill.travelers}
          </label>
        )}
        <input
          id={compact ? "update-travelers-compact" : "update-travelers"}
          name="travelers"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          defaultValue={q.travelers ?? ""}
          placeholder="2"
          aria-label={compact ? RESULTS.pill.travelers : undefined}
          className={cn(
            "w-full min-w-0 rounded-sm bg-transparent text-on-surface placeholder:text-on-surface-variant",
            compact ? "t-label-l" : "t-title-s min-h-11",
          )}
        />
      </div>
    </>
  );

  return (
    <div id={SEARCH_ANCHOR} className="scroll-mt-20">
      {/* md+ — the C204 pill, editable. */}
      <Form
        action="/explore/results"
        role="search"
        aria-label={RESULTS.header.updateLabel}
        className="card hidden items-center rounded-full p-0 shadow-2 md:flex"
      >
        {carried}
        {cells(true)}
        <button type="submit" className="btn btn-filled btn-sm m-1 shrink-0">
          {RESULTS.header.update}
        </button>
      </Form>

      {/* Below md — the summary stays, and opens the same form in place rather than sending
          anyone to another page. A native <details>, so it needs no JavaScript, which matches
          how every other control on this route behaves. */}
      <details className="group md:hidden">
        <summary className="card tap-44 flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5">
          <Icon name="search" size={13} className="shrink-0 text-on-surface-variant" />
          <span className="t-label-l flex-1 truncate text-on-surface-variant">
            {inquirySummary(q)}
          </span>
          <span className="chip h-6 px-2 text-on-surface">{RESULTS.header.edit}</span>
        </summary>
        <Form action="/explore/results" role="search" aria-label={RESULTS.header.updateLabel} className="card mt-2 flex flex-col gap-1 p-3">
          {carried}
          {cells(false)}
          <button type="submit" className="btn btn-filled mt-2">
            <Icon name="search" size={16} />
            {RESULTS.header.update}
          </button>
        </Form>
      </details>
    </div>
  );
}
