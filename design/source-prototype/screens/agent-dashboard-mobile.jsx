/* global React, Icon, IOSDevice */
// Agent · 3.2m Mobile · Dashboard & Pipeline — 3 screens.
// Mobile-native interpretation of the 3.2 desktop artboards in agent-dashboard.jsx.
//
// Patterns, per Screen-Inventory §4.4: 3.2.1 **D** (vertically stacked sections, KPI cards in
// a horizontal carousel near the top, a "See all" per section rather than exhaustive data) ·
// 3.2.2 **B variant** (the kanban collapses to a stage-picker, one stage at a time) · 3.2.3
// **D variant** (agenda view is the mobile default).
//
// THE AGENT BAR IS NOT THE CLIENT BAR. Screen-Inventory §6.6: Worklist · Clients · Messages ·
// More — four tabs, and deliberately narrower than the web rail, which carries eleven. "The
// mobile experience for agents at MVP is intentionally narrower than web — designed for
// on-the-go tasks rather than deep work. The full pipeline, reporting, and template
// management features remain web-only at MVP."
//
// WHICH MAKES TWO OF THE THREE FRAMES HERE A RECORD RATHER THAN A PLAN, and that is the point
// of drawing them. The house convention is 1:1 parity (§2.0 is 11/11, §2.2 11/11, §2.4 7/7):
// an omitted entry reads as "not designed", whereas a drawn-and-deferred one reads as
// "designed, and here is why it is not on your phone". §6.6 currently asserts that in prose
// only. 3.2m.2 and 3.2m.3 are what it looks like.
//
// DELIBERATE DEPARTURES from the desktop artboards. Each is a thing the desktop frame draws
// that the platform cannot honour, verified against the schema, the migrations and the
// shipped accessors rather than assumed, and each is recorded in docs/Screen-Inventory.md
// §3.2 as well.
//
//   1. THERE IS NO `lead` TABLE, SO THERE IS NO "FRESH LEADS" CARD. The desktop draws leads
//      as a distinct secondary-container panel with per-row "Reply" buttons, which is what
//      makes it read as a second entity. The `lead` domain is Data-Model §11, specified and
//      deliberately unbuilt; BRD §6.5 was amended 2026-09-09 so a quote request creates a
//      TRIP in `inquiry` status, and supabase/functions/quote-request does exactly that. The
//      section here is "New inquiries", its rows are trips, and it wears the same chrome as
//      every other section. `agent_kpis()` returns the count as `new_inquiry_count` — no
//      column, function or route on this side may be named `lead`.
//   2. QUICK-ADD HAS TWO ITEMS, NOT THREE. "New trip" (§3.4.3) and "New client" (§3.3.9) are
//      unbuilt and drawn disabled with their reasons, per §2.5's rule. "New lead" is CUT
//      rather than drawn-and-disabled: a disabled control promises a thing that will exist,
//      and this one will not.
//   3. NO MONTH-OVER-MONTH DELTAS. Every desktop KPI carries one — "↗ +18% LM", "−3 d vs LM",
//      "+4 this month". Nothing stores a prior-period snapshot, and last month's pipeline
//      value cannot be reconstructed from current rows at all: `trip.total_value_cents` is
//      the value NOW. Computing the rest live is a second aggregate that §3.11 Reporting
//      owns. Cut, not drawn-and-disabled — a number-shaped hole is worse than no line.
//   4. THE CONFIDENCE FIGURE STAYS, AND IS REAL. The desktop's "71% confidence" was a
//      drawing; it is now the weighted commission total over the raw one, weighted per stage
//      by `pipeline_weight` (Data-Model §7.4, defaults 20/50/100/100 set 2026-09-19). Against
//      the seeded book it lands at 73%. It is NULL over an empty pipeline and the frame shows
//      that state too — a 0% would be a claim where an absence is the truth.
//   5. CLIENT PORTRAITS BECOME INITIALS. The desktop uses `staImg('avatarA'..'avatarF')` —
//      stock photographs of strangers against named clients. Every other surface in this
//      product answered this the same way: the About page, AdvisorCard, ClientTopBar and the
//      wallet all use initials. `domain/auth/Initials.kt` already exists on the mobile side.
//      Same departure as client-trip-mobile.jsx #2, one step further because these are the
//      agency's own clients rather than its advisor.
//   6. THE THREE-COLUMN GRID BECOMES STACKED CARDS WITH "SEE ALL", capped at three rows each
//      with a count chip. Pattern D, verbatim. The whole value of a worklist on a phone is
//      knowing whether anything is on fire, not reading the book.
//   7. NO RISK DOTS ON PAYMENTS. The desktop draws high/med/low against --md-error /
//      --md-warning / --md-success. `payment_milestone.status` is
//      `scheduled | paid | waived | overdue` — four states, no risk model anywhere in the
//      schema. Three colours over a four-value enum is a control that lies. `days_until` goes
//      negative when a milestone is late, which is the real signal, and the frame shows that.
//   8. EVERY "SEE ALL" IS DISABLED WITH A REASON. §3.3, §3.4, §3.10 are unbuilt, and so is
//      trip detail — so in this slice the Worklist is a read-only screen with no live
//      destination. That is a strange first delivery and the frame says so rather than
//      wiring rows to nothing.
//   9. THE PIPELINE'S STAGES ARE THE ENUM, NOT THE DRAWING. The desktop draws
//      `Inquiry · Qualified · Proposal · Booked · Traveling`. `qualified` and `traveling` do
//      not exist: `trip_status` is `inquiry · proposal · booked · in_progress · completed ·
//      cancelled`. Screen-Inventory §3.2.2 names five columns that map exactly onto the enum
//      minus `cancelled`, so the document and the Data Model agree against the drawing and
//      the hierarchy puts both above it. Recorded as a prototype defect; agent-dashboard.jsx
//      should be corrected.
//  10. NO "ALL ADVISORS / GYASI" FILTER CHIPS. One advisor until P3. A filter with a single
//      option is noise rather than an honest disabled state.
//  11. THE CALENDAR'S MONTH GRID IS FAKE IN THE DESKTOP FRAME.
//      `Array.from({length: 35}, (_, i) => i - 3)` hardcodes a three-day leading offset and
//      35 cells, and `events[dayNum]` allows exactly one event per day. Real months need the
//      right offset, 28–31 days, sometimes six rows, and a departure plus a payment on one
//      date is routine. Mobile is agenda-first anyway (§4.4), which sidesteps the grid — the
//      web build owes the real arithmetic.
//  12. THE AVAILABILITY LAYER IS ABSENT, WITH A REASON. `agent_availability.time_off_blocks`
//      is `jsonb` with no declared schema, so there is nothing to validate a parse against —
//      the same gap Data-Model §7.4 cites as its reason for making PipelineWeight a table.
//      Defining the shape is §3.12's job.
//  13. GYASI IS HE/HIM. Not an error in THIS section's frames, but `agent-auth.jsx:192` and
//      `agent-reports-settings.jsx:256` both default the Pronouns field to "she/her", and
//      `agent.pronouns` is 'he/him' in the seed. That is the third and fourth instance of an
//      error client-trip-mobile.jsx:19 and client-payment-mobile.jsx already recorded.
//      Flagged here so the frames get fixed rather than the error quietly persisting.
//
// WHAT IS REAL BEHIND THESE FRAMES: `agent_kpis()`, `agent_trip_board()`,
// `agent_payments_due()`, `agent_inbox()` and `agent_availability_self()` — SECURITY DEFINER
// accessors over PostgREST, because the client column REVOKEs bind agents too and §3.2 needs
// `trip.notes`, `trip.total_commission_cents` and `conversation.agent_unread_count`. The one
// write is `agent-trip-status`, which requires the version the board was rendered from.

// ──────────────────────────────────────────────────────────────────────
// Shells — deliberately identical to client-payment-mobile.jsx's, which are themselves
// client-account-mobile.jsx's. These files draw one app and must not drift. The ONE
// difference is the tab bar, and §6.6 is why.
// ──────────────────────────────────────────────────────────────────────

function MFrame({ dark = false, children, footer, scrollable = true, padded = false }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', padding: padded ? '14px 16px 8px' : 0 }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

// Screen-Inventory §6.6. Four tabs, and three of them have nowhere to go in this slice —
// drawn dimmed at the same 0.38 alpha every other deferral in this product uses, rather than
// live and dead. "More" is a sheet rather than a rail destination; it is the eventual home of
// sign-out, which an agent signing in on mobile has no other way to reach.
const M_AGENT_TABS = [
  { id: 'work', icon: 'pulse', label: 'Worklist', built: true },
  { id: 'clients', icon: 'users', label: 'Clients', built: false },
  { id: 'msg', icon: 'message', label: 'Messages', built: false },
  { id: 'more', icon: 'more_vert', label: 'More', built: false },
];

function MAgentTabs({ active = 'work' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {M_AGENT_TABS.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56,
            opacity: t.built ? 1 : 0.38,
          }}>
            <span style={{
              width: 56, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: on ? 'var(--md-secondary-container)' : 'transparent',
              color: on ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={t.icon} size={19}/>
            </span>
            <span style={{ font: '600 10px/1.2 var(--font-sans)', color: on ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MBackBar({ title, trailing }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderBottom: '1px solid var(--md-outline-variant)',
      background: 'var(--md-surface-1)',
    }}>
      <span style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-on-surface-variant)' }}>
        <Icon name="arrow_left" size={18}/>
      </span>
      <div style={{ flex: 1, font: '600 15px/1.2 var(--font-sans)' }}>{title}</div>
      {trailing}
    </div>
  );
}

/** Departure 5 — initials, never a stock portrait of a stranger standing in for a client. */
function MInitials({ name, tone = 'primary' }) {
  const initials = name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const bg = tone === 'primary' ? 'var(--md-primary-container)' : 'var(--md-tertiary-container)';
  const fg = tone === 'primary' ? 'var(--md-on-primary-container)' : 'var(--md-on-tertiary-container)';
  return (
    <span style={{
      width: 34, height: 34, borderRadius: 999, background: bg, color: fg, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: '700 12px/1 var(--font-sans)',
    }}>{initials}</span>
  );
}

/** Pattern D's "each section has a See all link rather than showing exhaustive data". */
function MSection({ title, count, children, seeAll }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <div className="t-title-s" style={{ flex: 1 }}>{title}</div>
        {count != null && <span className="chip">{count}</span>}
      </div>
      {children}
      {seeAll && (
        <div style={{ padding: '9px 14px', borderTop: '1px solid var(--md-outline-variant)' }}>
          <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', opacity: 0.55 }}>
            See all — {seeAll}
          </span>
        </div>
      )}
    </div>
  );
}

function MRow({ children, first }) {
  return (
    <div style={{ padding: '11px 14px', borderTop: first ? 0 : '1px solid var(--md-outline-variant)', display: 'flex', gap: 10, alignItems: 'center' }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.2m.1 — Worklist
// ──────────────────────────────────────────────────────────────────────

function M321_Worklist({ dark = false }) {
  // Five tiles, as chosen 2026-09-19 over the Screen Inventory's four. Pattern D puts them in
  // a horizontal carousel rather than a grid — five across a 400pt screen gives each one
  // 72pt, which is narrower than the amounts inside them.
  const kpis = [
    { label: 'Pipeline value', value: '$58,165', sub: '6 open trips', accent: 'primary', icon: 'briefcase' },
    { label: 'Booked · month', value: '$5,120', sub: '1 trip', accent: 'secondary', icon: 'check' },
    { label: 'Commission expected', value: '$6,505', sub: '73% confidence', accent: 'tertiary', icon: 'dollar' },
    { label: 'Inquiry → book', value: '17.3 d', sub: 'over 4 trips', accent: 'surface', icon: 'clock' },
    { label: 'Active clients', value: '2', sub: null, accent: 'surface', icon: 'users' },
  ];
  const map = {
    primary: ['var(--md-primary-container)', 'var(--md-on-primary-container)'],
    secondary: ['var(--md-secondary-container)', 'var(--md-on-secondary-container)'],
    tertiary: ['var(--md-tertiary-container)', 'var(--md-on-tertiary-container)'],
    surface: ['var(--md-surface-2)', 'var(--md-on-surface)'],
  };

  const proposals = [
    { c: 'Maya & Daniel Carter', t: 'Sandals honeymoon · Aug 12', v: '$6,480', due: 'Tomorrow' },
    { c: 'Westbrook family', t: 'Symphony of the Seas · Dec 22', v: '$9,120', due: '3 days' },
  ];
  const payments = [
    { c: 'Maya Carter', s: 'Cabo · final balance', amt: '$2,560', due: '4 days late' },
    { c: 'Jordan Hayes', s: 'Sandals · final', amt: '$7,845', due: 'in 11 days' },
  ];
  const inquiries = [
    { n: 'Jordan Hayes', want: 'Somewhere quiet in December', age: '2h' },
  ];
  const departing = [
    { d: 'Oct 01', who: 'Maya Carter', t: 'Cabo · 4 nights' },
    { d: 'Oct 15', who: 'Maya Carter', t: 'Bimini · long weekend' },
  ];
  const messages = [
    { who: 'Jordan Hayes', m: '"Yes — lock the upgrade."', t: '2:14p' },
  ];

  return (
    <MFrame dark={dark} footer={<MAgentTabs active="work"/>}>
      {/* The greeting is the one thing that makes opening this on a phone worth doing. The
          count is derived — proposals awaiting + payments due + new inquiries — because a
          hardcoded 3 that says 3 when there are 7 is worse than no count at all. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', letterSpacing: '0.08em' }}>
          SATURDAY · SEPTEMBER 19
        </div>
        <div className="t-headline" style={{ fontSize: 23, margin: '4px 0 0', lineHeight: 1.2 }}>
          Morning, Gyasi.<br/>5 things need you today.
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
          Two proposals in client court, one payment late, one new inquiry.
        </div>
      </div>

      {/* Pattern D: KPI cards in a horizontal carousel near the top. */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 2px', scrollSnapType: 'x mandatory' }}>
        {kpis.map((k) => {
          const [bg, fg] = map[k.accent];
          return (
            <div key={k.label} style={{
              background: bg, color: fg, borderRadius: 14, padding: '11px 12px',
              minWidth: 136, flexShrink: 0, scrollSnapAlign: 'start',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="t-label" style={{ opacity: 0.85, fontSize: 10 }}>{k.label}</span>
                <Icon name={k.icon} size={13}/>
              </div>
              <div style={{ font: '800 21px/1.1 var(--font-sans)', margin: '5px 0 1px' }}>{k.value}</div>
              {/* Departure 3: no "↗ +18% LM". Nothing stores a prior period. */}
              {k.sub && <div className="t-body-s" style={{ opacity: 0.85, fontSize: 11 }}>{k.sub}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '2px 16px 20px' }}>
        <MSection title="Proposals awaiting reply" count="2 · $15,600" seeAll="trips arrive with §3.4">
          {proposals.map((p, i) => (
            <MRow key={p.c} first={i === 0}>
              <MInitials name={p.c}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{p.c}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{p.t}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '700 12px/1 var(--font-mono)' }}>{p.v}</div>
                <span className="chip-status proposal" style={{ marginTop: 4, display: 'inline-block' }}>{p.due}</span>
              </div>
            </MRow>
          ))}
        </MSection>

        {/* Departure 7: no risk dots. days_until going negative is the real signal. */}
        <MSection title="Payments to settle" count="2" seeAll="the schedule lives on the trip, §3.4">
          {payments.map((p, i) => (
            <MRow key={p.s} first={i === 0}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{p.c}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{p.s}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '700 12px/1 var(--font-mono)' }}>{p.amt}</div>
                <div className="t-body-s" style={{ color: p.due.includes('late') ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>
                  {p.due}
                </div>
              </div>
            </MRow>
          ))}
        </MSection>

        {/* Departure 1: "New inquiries", not "Fresh leads". Same chrome as every other
            section, because these are trips like any other and the desktop's separate
            treatment is what makes them read as a second entity. */}
        <MSection title="New inquiries" count="1" seeAll="the inbox arrives with §3.10">
          {inquiries.map((l, i) => (
            <MRow key={l.n} first={i === 0}>
              <MInitials name={l.n} tone="tertiary"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{l.n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{l.want}</div>
              </div>
              <span className="chip-status lead">{l.age}</span>
            </MRow>
          ))}
        </MSection>

        <MSection title="Travelers in next 30 days" count="2" seeAll="trips arrive with §3.4">
          {departing.map((t, i) => (
            <MRow key={t.d} first={i === 0}>
              <div style={{
                width: 44, padding: '4px 0', borderRadius: 8, textAlign: 'center', flexShrink: 0,
                background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)',
              }}>
                <div className="t-label-s" style={{ fontSize: 9 }}>{t.d.split(' ')[0]}</div>
                <div style={{ font: '800 14px/1 var(--font-sans)' }}>{t.d.split(' ')[1]}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{t.who}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.t}</div>
              </div>
            </MRow>
          ))}
        </MSection>

        <MSection title="Recent messages" count="1" seeAll="messaging arrives with §3.10">
          {messages.map((m, i) => (
            <MRow key={m.who} first={i === 0}>
              <MInitials name={m.who}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex' }}>
                  <div className="t-title-s" style={{ flex: 1, fontSize: 13 }}>{m.who}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{m.t}</div>
                </div>
                <div className="t-body-s" style={{ fontStyle: 'italic' }}>{m.m}</div>
              </div>
            </MRow>
          ))}
        </MSection>

        {/* Departure 2: two items, not three. Both disabled with the section that builds
            them; "New lead" is cut because a disabled control promises a thing that will
            exist, and no lead entity ever will. */}
        <div className="card" style={{ padding: 12, marginTop: 12, opacity: 0.55 }}>
          <div className="t-title-s" style={{ fontSize: 13, marginBottom: 8 }}>Quick add</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-tonal btn-sm" disabled style={{ flex: 1, minHeight: 44 }}>
              <Icon name="plus" size={13}/> New trip
            </button>
            <button className="btn btn-tonal btn-sm" disabled style={{ flex: 1, minHeight: 44 }}>
              <Icon name="plus" size={13}/> New client
            </button>
          </div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>
            Creating trips arrives with §3.4, clients with §3.3.
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.2m.2 — Pipeline · the stage-picker §4.4 describes, and §6.6 defers
// ──────────────────────────────────────────────────────────────────────

function M322_Pipeline({ dark = false }) {
  // Departure 9: the enum, not the drawing. `cancelled` is the sixth value and a real
  // destination, but not a funnel column — it is counted beneath the board instead, so
  // cancelled trips are excluded without becoming invisible.
  const stages = [
    { k: 'Inquiry', tone: 'lead', n: 1, val: '$0' },
    { k: 'Proposal', tone: 'proposal', n: 2, val: '$28,760' },
    { k: 'Booked', tone: 'booked', n: 2, val: '$17,965' },
    { k: 'In progress', tone: 'traveling', n: 1, val: '$7,480' },
    { k: 'Completed', tone: 'past', n: 1, val: '$6,920' },
  ];
  const cards = [
    { c: 'Maya & Daniel Carter', t: 'Sandals honeymoon · Aug 12', v: '$6,480' },
    { c: 'Westbrook family', t: 'Symphony of the Seas · Dec 22', v: '$9,120' },
  ];
  return (
    <MFrame dark={dark} footer={<MAgentTabs active="work"/>}>
      <MBackBar title="Pipeline"/>
      <div style={{ padding: '12px 16px 20px' }}>
        <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)', border: 0 }}>
          <div className="t-title-s" style={{ fontSize: 13 }}>Web-only at MVP</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
            Screen-Inventory §6.6 keeps the full pipeline on the desktop rail — the phone is
            for triage, not for moving a book around. This frame records the shape it would
            take if that changes: §4.4 specifies a stage-picker, one stage at a time, swiped
            between. Drag-and-drop is a web affordance and does not cross.
          </div>
        </div>

        {/* The picker. One stage visible, the rest as a segmented strip. */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 14, paddingBottom: 2 }}>
          {stages.map((s, i) => (
            <span key={s.k} className={`chip${i === 1 ? ' chip-filter is-on' : ''}`} style={{ flexShrink: 0 }}>
              {s.k} · {s.n}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
          <span className="chip-status proposal">Proposal</span>
          <div className="t-title-s" style={{ fontSize: 13 }}>
            2 trips · <span style={{ color: 'var(--md-on-surface-variant)', fontWeight: 500 }}>$28,760</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {cards.map((c) => (
            <div key={c.c} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <MInitials name={c.c}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s" style={{ fontSize: 13 }}>{c.c}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.t}</div>
                </div>
                <div style={{ font: '700 12px/1 var(--font-mono)' }}>{c.v}</div>
              </div>
              {/* The stage change is real and version-checked. On a phone it is a menu, not a
                  drag — WCAG 2.2 SC 2.5.7 wants a single-pointer alternative for every drag
                  anyway, so the menu is the primary control on every viewport. */}
              <button className="btn btn-outlined btn-sm" style={{ marginTop: 10, minHeight: 44, width: '100%' }}>
                Move stage
              </button>
            </div>
          ))}
        </div>

        {/* Departure 9, second half: cancelled is counted, not columned. */}
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 14 }}>
          1 cancelled trip is not on the board. It is a status, not a stage — find it in the
          trip list.
        </div>
        {/* Departure 10: no "All advisors / Gyasi" chips. One advisor until P3. */}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.2m.3 — Calendar · agenda by default, per §4.4
// ──────────────────────────────────────────────────────────────────────

function M323_Calendar({ dark = false }) {
  // Departure 11: agenda-first sidesteps the desktop frame's fake month grid. Each day can
  // carry several events — a departure and a payment on one date is routine — which the
  // desktop's one-event-per-day map cannot express.
  const days = [
    { d: 'Mon 22 Sep', events: [
      { kind: 'due', label: 'Cabo · final balance · $2,560', note: '4 days late' },
    ] },
    { d: 'Wed 01 Oct', events: [
      { kind: 'travel', label: 'Maya Carter departs · Cabo', note: '4 nights' },
      { kind: 'due', label: 'Bimini · deposit · $990', note: null },
    ] },
    { d: 'Sun 05 Oct', events: [
      { kind: 'travel', label: 'Maya Carter returns · Cabo', note: null },
    ] },
    { d: 'Wed 15 Oct', events: [
      { kind: 'travel', label: 'Maya Carter departs · Bimini', note: '4 adults' },
    ] },
  ];
  const tone = { travel: ['var(--md-tertiary-container)', 'var(--md-on-tertiary-container)'],
                 due: ['var(--md-error-container)', 'var(--md-on-error-container)'] };
  return (
    <MFrame dark={dark} footer={<MAgentTabs active="work"/>}>
      <MBackBar title="Calendar"/>
      <div style={{ padding: '12px 16px 20px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="chip chip-filter is-on">Agenda</span>
          <span className="chip" style={{ opacity: 0.55 }}>Week</span>
          <span className="chip" style={{ opacity: 0.55 }}>Month</span>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>
          Agenda is the mobile default (§4.4). Week and month are the tablet and web ones.
        </div>

        {days.map((day) => (
          <div key={day.d} style={{ marginTop: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', letterSpacing: '0.06em' }}>
              {day.d.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {day.events.map((e) => {
                const [bg, fg] = tone[e.kind];
                return (
                  <div key={e.label} className="card" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 8, height: 34, borderRadius: 999, background: bg, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-title-s" style={{ fontSize: 13 }}>{e.label}</div>
                      {e.note && <div className="t-body-s" style={{ color: fg === 'var(--md-on-error-container)' ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{e.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Departure 12. */}
        <div className="card" style={{ padding: 12, marginTop: 16, opacity: 0.55 }}>
          <div className="t-title-s" style={{ fontSize: 13 }}>Availability is not shown</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
            `agent_availability.time_off_blocks` is jsonb with no declared schema, so there is
            nothing to parse it against. Blocking time arrives with §3.12 Settings, which is
            where the shape gets defined.
          </div>
        </div>
      </div>
    </MFrame>
  );
}
