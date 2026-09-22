import { AgentViews } from "@/components/agent/AgentViews";
import { ErrorState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY, needsYouLine } from "@/lib/agent/content";
import { loadWorklist, type AgentKpi } from "@/lib/agent/queries";

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
 * EVERY ROW IS READ-ONLY IN THIS SLICE, and the screen says so rather than wiring taps to
 * nothing. Trip detail is §3.4.2, client detail §3.3.2, messaging §3.10 — none built. A
 * worklist you cannot tap into is a strange first delivery; pretending otherwise by linking
 * to a 404 is worse.
 *
 * A server component throughout. Nothing here needs state, so nothing crosses a client
 * boundary — which is also what keeps the agent's time zone correct: every date was
 * formatted in `lib/agent/queries.ts` from `as_of_date`, which the accessors computed in
 * `agent.time_zone`.
 */

// The root layout supplies the " · Story-Tail Adventures" suffix; repeating it here
// produced "Worklist · Story-Tail Adventures · Story-Tail Adventures" in the tab.
export const metadata = { title: "Worklist" };

function KpiTile({ kpi }: { kpi: AgentKpi }) {
  const tone = {
    primary: "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]",
    secondary: "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]",
    tertiary: "bg-[var(--md-tertiary-container)] text-[var(--md-on-tertiary-container)]",
    surface: "bg-[var(--md-surface-2)] text-[var(--md-on-surface)]",
  }[kpi.accent];

  return (
    <div className={`agent-kpi ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="t-label opacity-85">{kpi.label}</span>
        <Icon name={kpi.icon} size={14} />
      </div>
      {/* Null is not zero. A tile with nothing to report says so. */}
      {kpi.value === null ? (
        <p className="t-body-s mt-2 opacity-85">{kpi.unavailable}</p>
      ) : (
        <>
          <div className="mt-1 font-sans text-[26px] font-extrabold leading-none">{kpi.value}</div>
          {kpi.sub && <div className="t-body-s mt-1 opacity-85">{kpi.sub}</div>}
        </>
      )}
    </div>
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
  seeAll: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mt-4 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-[var(--md-outline-variant)] px-4 py-3">
        <h2 className="t-title-s flex-1">{title}</h2>
        {count > 0 && <span className="chip">{count}</span>}
      </div>
      {count === 0 ? (
        <p className="t-body-s px-4 py-4 text-[var(--md-on-surface-variant)]">{empty}</p>
      ) : (
        children
      )}
      <p className="t-body-s border-t border-[var(--md-outline-variant)] px-4 py-2 text-[var(--md-on-surface-variant)] opacity-60">
        {seeAll}
      </p>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--md-outline-variant)] px-4 py-3 first:border-t-0">
      {children}
    </div>
  );
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
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--md-primary-container)] font-sans text-xs font-bold text-[var(--md-on-primary-container)]">
      {letters}
    </span>
  );
}

export default async function AgentWorklistPage() {
  const worklist = await loadWorklist();

  // Null means the READ failed. An empty book is a populated object with empty arrays —
  // the §2.2 contract, repeated here.
  if (!worklist) return <ErrorState />;

  const zero = worklist.needsYouCount === 0;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8">
      <AgentViews />

      <header className="mt-5">
        <p className="t-label tracking-[0.08em] text-[var(--md-on-surface-variant)]">
          {worklist.periodLabel.toUpperCase()}
        </p>
        <h1 className="t-headline mt-1 text-[26px] leading-tight">
          {worklist.partOfDay}, {worklist.greetingName}.
          <br />
          {needsYouLine(worklist.needsYouCount)}
        </h1>
        {/* The one place the worldview earns a line on this side: when nothing is urgent,
            say so and stop. No call to action underneath it. */}
        {zero && (
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {AGENT_COPY.greetingZeroSub}
          </p>
        )}
      </header>

      <div className="agent-kpis mt-4">
        {worklist.kpis.map((k) => (
          <KpiTile key={k.id} kpi={k} />
        ))}
      </div>

      {worklist.currencyNote && (
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">{worklist.currencyNote}</p>
      )}

      <Section
        title={AGENT_COPY.proposalsTitle}
        count={worklist.proposalsAwaiting.length}
        empty={AGENT_COPY.proposalsEmpty}
        seeAll={AGENT_COPY.tripDetailDeferred}
      >
        {worklist.proposalsAwaiting.map((t) => (
          <Row key={t.tripId}>
            <Initials name={t.clientName} />
            <div className="min-w-0 flex-1">
              <p className="t-title-s text-[13px]">{t.clientName}</p>
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{t.title}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold">{t.valueLabel}</p>
              {t.dueLabel && <span className="chip-status proposal mt-1 inline-block">{t.dueLabel}</span>}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.paymentsTitle}
        count={worklist.paymentsDue.length}
        empty={AGENT_COPY.paymentsEmpty}
        seeAll={AGENT_COPY.tripDetailDeferred}
      >
        {worklist.paymentsDue.map((p) => (
          <Row key={p.milestoneId}>
            <div className="min-w-0 flex-1">
              <p className="t-title-s text-[13px]">{p.clientName}</p>
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{p.label}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold">{p.amountLabel}</p>
              {/* No risk dots. payment_milestone.status is a four-value enum with no risk
                  model; `days_until` going negative is the real signal. */}
              <p
                className={`t-body-s ${p.overdue ? "text-[var(--md-error)]" : "text-[var(--md-on-surface-variant)]"}`}
              >
                {p.dueLabel}
              </p>
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.inquiriesTitle}
        count={worklist.newInquiries.length}
        empty={AGENT_COPY.inquiriesEmpty}
        seeAll={AGENT_COPY.leadsDeferred}
      >
        {worklist.newInquiries.map((t) => (
          <Row key={t.tripId}>
            <Initials name={t.clientName} />
            <div className="min-w-0 flex-1">
              <p className="t-title-s text-[13px]">{t.clientName}</p>
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{t.title}</p>
            </div>
            <span className="chip-status lead">Inquiry</span>
          </Row>
        ))}
      </Section>

      <Section
        title={AGENT_COPY.departingTitle}
        count={worklist.departingSoon.length}
        empty={AGENT_COPY.departingEmpty}
        seeAll={AGENT_COPY.tripDetailDeferred}
      >
        {worklist.departingSoon.map((t) => (
          <Row key={t.tripId}>
            <div className="min-w-0 flex-1">
              <p className="t-title-s text-[13px]">{t.clientName}</p>
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{t.title}</p>
            </div>
            {t.startLabel && (
              <span className="chip-status traveling">{t.startLabel}</span>
            )}
          </Row>
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
            <div className="min-w-0 flex-1">
              <div className="flex">
                <p className="t-title-s flex-1 text-[13px]">{m.clientName}</p>
                <p className="t-body-s text-[var(--md-on-surface-variant)]">{m.timeLabel}</p>
              </div>
              <p className="t-body-s italic">{m.preview}</p>
            </div>
            {m.unread > 0 && <span className="chip">{m.unread}</span>}
          </Row>
        ))}
      </Section>
    </div>
  );
}
