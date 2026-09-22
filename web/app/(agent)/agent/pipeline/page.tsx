import { AgentViews } from "@/components/agent/AgentViews";
import { StageMenu } from "@/components/agent/StageMenu";
import { ErrorState } from "@/components/client/states";
import { AGENT_COPY } from "@/lib/agent/content";
import { PIPELINE_STAGES, loadPipeline } from "@/lib/agent/queries";

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
 * A HORIZONTALLY SCROLLING ROW, not the prototype's fixed-height grid. It sets
 * `height: calc(100% - 80px)` with scrolling off, which is right for an artboard and wrong
 * in a browser — and `.client-fill`'s doc comment in client.css records what happens when an
 * ancestor-dependent height meets React streaming.
 *
 * The board is a server component; only the stage menu on each card is a client island.
 */

export const metadata = { title: "Pipeline" };

export default async function AgentPipelinePage() {
  const pipeline = await loadPipeline();
  if (!pipeline) return <ErrorState />;

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

      <div className="agent-board mt-4">
        {pipeline.columns.map((col) => (
          <section key={col.status} className="agent-board-column">
            <header className="border-b border-[var(--md-outline-variant)] pb-2">
              <span className={`chip-status ${col.status === "in_progress" ? "traveling" : col.status}`}>
                {col.label}
              </span>
              <p className="t-title-s mt-2 text-[13px]">
                {col.count} {col.count === 1 ? "trip" : "trips"} ·{" "}
                <span className="font-normal text-[var(--md-on-surface-variant)]">
                  {col.totalLabel}
                </span>
              </p>
            </header>

            {col.cards.length === 0 ? (
              <p className="t-body-s py-2 text-[var(--md-on-surface-variant)]">
                {AGENT_COPY.pipelineEmptyColumn}
              </p>
            ) : (
              col.cards.map((c) => (
                <article key={c.tripId} className="card p-3">
                  <p className="t-title-s text-[13px]">{c.clientName}</p>
                  <p className="t-body-s text-[var(--md-on-surface-variant)]">{c.title}</p>
                  <p className="mt-2 font-mono text-xs font-bold">{c.valueLabel}</p>
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
