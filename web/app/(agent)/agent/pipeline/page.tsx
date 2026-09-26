import Link from "next/link";

import { AgentViews } from "@/components/agent/AgentViews";
import { StageMenu } from "@/components/agent/StageMenu";
import { ErrorState } from "@/components/client/states";
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
 * so `?stage=` now chooses the stage a phone shows and `web/styles/agent.css` hides the
 * rest. Above `md` every column is back; at §4.2's web breakpoint the columns go flexible
 * so all five fit without a scrollbar, which fixed columns never did — five 272px columns
 * need 1400px of board and this container caps at 1336.
 *
 * A LINK, NOT CLIENT STATE, for that picker: the stage is shareable, the back button means
 * what it says, and the board stays a server component. Only the stage menu on each card is
 * a client island.
 *
 * NOT a fixed-height grid — the prototype sets `height: calc(100% - 80px)` with scrolling
 * off, which is right for an artboard and wrong in a browser. See `.client-fill`'s doc
 * comment in client.css for what happens when an ancestor-dependent height meets React
 * streaming.
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

/**
 * What a column total left out.
 *
 * A total must not add two currencies together, so each column sums only the cards priced
 * in the agent's dominant currency and reports how many it set aside. Naming the excluded
 * cards is the whole point — a quiet total that is short by one trip is worse than a total
 * with a footnote.
 *
 * TODO(copy): call `AGENT_COPY.excludedNote(count)` and delete this function. The sentence
 * is user-facing, and web/lib/agent/content.ts opens by claiming "every user-facing string
 * on the agent surface" — its two siblings of exactly this shape, `currencyNote(dominant,
 * others)` and `cancelledNote(n)`, both live there and are pinned by content.test.ts,
 * precisely because check_copy_parity.py skips non-literal entries. A count-pluralising
 * string written HERE is invisible to the copy module and to the gate alike. The key does
 * not exist in AGENT_COPY as this is written and content.ts belongs to another change; the
 * wording wants to get SHORTER on the way in, because `pipeline.currencyNote` renders a few
 * lines above and says the same thing with a different number — a count of CURRENCIES there
 * ("Trips priced in 2 other currencies are not counted here") against a count of TRIPS here
 * ("3 trips priced in other currencies are not in this total"), stacked on one screen.
 */
function excludedNote(count: number): string {
  return count === 1
    ? "1 trip priced in another currency is not in this total."
    : `${count} trips priced in other currencies are not in this total.`;
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
      <AgentViews />

      <header className="mt-5">
        <h1 className="t-headline text-[24px]">{AGENT_COPY.pipelineTitle}</h1>
        <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.pipelineSub}
        </p>
      </header>

      {pipeline.currencyNote && (
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
          {pipeline.currencyNote}
        </p>
      )}

      {/* §4.4's stage-picker. Phone only — above `md` every column is on screen, so a
          picker would be a control that selects what you can already see. The count rides
          along so the agent can tell where the work is before switching. */}
      <nav className="agent-views mt-4 md:hidden" aria-label="Pipeline stages">
        {pipeline.columns.map((col) => (
          <Link
            key={col.status}
            href={`/agent/pipeline?stage=${col.status}`}
            className="agent-view-link"
            aria-current={col.status === selectedStage ? "page" : undefined}
          >
            {col.label} · {col.count}
          </Link>
        ))}
      </nav>

      <div className="agent-board mt-4">
        {pipeline.columns.map((col) => (
          <section
            key={col.status}
            className="agent-board-column"
            data-selected={col.status === selectedStage ? "true" : undefined}
          >
            <header className="border-b border-[var(--md-outline-variant)] pb-2">
              <span className={`chip-status ${stageChipTone(col.status)}`}>{col.label}</span>
              <p className="t-title-s mt-2 text-[13px]">
                {col.count} {col.count === 1 ? "trip" : "trips"} ·{" "}
                <span className="font-normal text-[var(--md-on-surface-variant)]">
                  {col.totalLabel}
                </span>
              </p>
              {col.excludedCount > 0 && (
                <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
                  {excludedNote(col.excludedCount)}
                </p>
              )}
            </header>

            {col.cards.length === 0 ? (
              <p className="t-body-s py-2 text-[var(--md-on-surface-variant)]">
                {AGENT_COPY.pipelineEmptyColumn}
              </p>
            ) : (
              col.cards.map((c) => (
                <article key={c.tripId} className="card p-3">
                  {/* The link wraps everything except StageMenu below: a Link inside an
                      interactive control's own click target is a nested-interactive-element
                      a11y violation, and StageMenu's own click must stay independent of it. */}
                  <Link href={`/agent/trips/${c.tripId}`} className="block">
                    <p className="t-title-s text-[13px]">{c.clientName}</p>
                    <p className="t-body-s text-[var(--md-on-surface-variant)]">{c.title}</p>
                    <p className="mt-2 font-mono text-xs font-bold">{c.valueLabel}</p>
                  </Link>
                  <StageMenu
                    tripId={c.tripId}
                    status={c.status}
                    version={c.version}
                    stages={PIPELINE_STAGES}
                  />
                </article>
              ))
            )}
          </section>
        ))}
      </div>

      {pipeline.cancelledCount > 0 && (
        <p className="t-body-s mt-4 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.cancelledNote(pipeline.cancelledCount)}
        </p>
      )}
    </div>
  );
}
