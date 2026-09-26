/* global React, Icon, IOSDevice */
// Agent · 3.3m Mobile · Client Management (CRM) — 1 of 12 screens.
// Mobile-native interpretation of the 3.3 desktop artboards in agent-crm.jsx.
//
// Pattern, per Screen-Inventory §4.4: 3.3.1 **B** — "a vertical list of cards (one item per
// row); each card is touch-optimized with primary info, secondary info, and one quick action;
// filter and search collapsed behind icon buttons". The web half of the same pattern is "a
// true data table with sortable column headers, sticky header row".
//
// WHY ONE FRAME AND NOT TWELVE. The house convention is 1:1 parity, and §3.2m says why: an
// omitted entry reads as "not designed", a drawn-and-deferred one reads as "designed, and
// here is why it is not on your phone". That convention is not abandoned here — §3.3 is being
// DELIVERED in three stacked PRs (roster, then detail and its six tabs, then the write path),
// and this file tracks the build rather than front-running it. The remaining eleven frames
// arrive with the PRs that build them, and the ones that will be drawn-and-deferred are named
// under departure 2 so the intent is on the record now rather than inferred later.
//
// DELIBERATE DEPARTURES from the desktop artboards, each verified against the schema, the
// migrations and the shipped accessor rather than assumed.
//
//   1. SEARCH IS VISIBLE, NOT BEHIND AN ICON — and this is a departure from §4.4 itself, not
//      from the desktop frame. Pattern B mobile says "filter and search collapsed behind icon
//      buttons". §6.6 scopes the agent's phone to "on-the-go tasks rather than deep work",
//      and for a roster the on-the-go task IS the search: an advisor reaching for their phone
//      wants one client, by name, now. Putting the only control that serves that behind a tap
//      to save 56pt inverts the section's purpose. The FILTERS are collapsed as the pattern
//      asks — two status chips and nothing else.
//   2. NO TAG CHIPS, NO BULK SELECT, NO "NEW CLIENT", NO ROW TAP. Desk affordances, each for
//      its own reason. The desktop draws a twelve-wide facet row; a phone cannot carry it.
//      Bulk-select has no action behind it on either surface until §3.3.9 (bulk-tag) and
//      §3.10 (bulk-message). "New client" is §3.3.9, a form, which is the definition of deep
//      work. The row tap is §3.3.2, which is not built — the worklist made the same call and
//      a row wired to nothing is worse than a row that is plainly a list item.
//      The three write screens — 3.3.9 Create, 3.3.10 Edit, 3.3.12 Archive — are the ones
//      that will be DRAWN-AND-DEFERRED when this file grows: §6.6 keeps them web-only, and a
//      frame showing why is the record that they were considered.
//   3. ONE TRIP LINE, NOT TWO COLUMNS. The desktop table gives "Last trip" and "Next trip" a
//      column each. A phone row has one line, and the useful half for an advisor looking
//      someone up on the move is the one that has not happened yet — so the row shows the
//      next trip, falls back to the last, and shows nothing only when there is neither.
//   4. INITIALS, NEVER A STOCK PORTRAIT of a stranger standing in for a client. The same
//      call §3.2m's departure 5 made, and the shipped web roster makes it too.
//   5. NO PAGINATOR. The web build pages with Previous/Next, which is Pattern B's desk half.
//      This appends. Paging a book of business back and forth on a phone is deep work by
//      another name, and the count line plus search already answer "is the one I want here".
//   6. THE MONEY COLUMN CARRIES AN ASTERISK, AND THE FOOT OF THE LIST EXPLAINS IT. §3.2
//      settled the rule: a figure names one currency and says how many it left out. The
//      scope here is the ROW rather than the agent, because two clients on one roster can
//      legitimately bank in different currencies. `client.lifetime_value_cents` is NOT the
//      source — nothing in the repository maintains that column, so the figure is derived
//      from committed trips (see 20260926140000_agent_client_read_surface.sql).
//   7. A DASH, NOT "$0.00", for a client with nothing committed. The accessor returns a NULL
//      currency for exactly that case; a labelled zero claims they have spent nothing where
//      the truth is that nothing has been booked yet.
//   8. SIGN-OUT RIDES THIS TOP BAR TOO. §3.12 has not built More, so this is still the only
//      way out of the agent shell — and on iOS `PlatformBackHandler` is a deliberate no-op,
//      so there is no system exit at all. Both bars lose it together when More lands.

function CrmMFrame({ dark = false, children, footer }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

// §6.6's four, with TWO built as of 2026-09-26 — Clients is no longer dimmed.
const CRM_M_TABS = [
  { id: 'work', icon: 'pulse', label: 'Worklist', built: true },
  { id: 'clients', icon: 'users', label: 'Clients', built: true },
  { id: 'msg', icon: 'message', label: 'Messages', built: false },
  { id: 'more', icon: 'more_vert', label: 'More', built: false },
];

function CrmMTabs({ active = 'clients' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {CRM_M_TABS.map((t) => {
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

/** Departure 8 — the title comes off the same registry the bottom bar draws. */
function CrmMTopBar({ title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderBottom: '1px solid var(--md-outline-variant)',
      background: 'var(--md-surface-1)',
    }}>
      <div style={{ flex: 1, font: '600 17px/1.2 var(--font-sans)' }}>{title}</div>
      <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Sign out</span>
    </div>
  );
}

/** Departure 4 — initials, never a stock portrait. */
function CrmMInitials({ name }) {
  const initials = name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span style={{
      width: 36, height: 36, borderRadius: 999, flexShrink: 0,
      background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: '700 12px/1 var(--font-sans)',
    }}>{initials}</span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.3m.1 — Client roster
// ──────────────────────────────────────────────────────────────────────

function M331_ClientRoster({ dark = false }) {
  // The seed's own book, so the frame and the local stack agree. Emails are @example.com
  // throughout: the local mirror sanitises every real domain and this file is part of it.
  const rows = [
    { n: 'Jordan Hayes', e: 'jordan.hayes@example.com', trip: 'Anniversary Week in Negril · Aug 26', money: '$19,765' },
    { n: 'Maya Carter', e: 'maya.carter@example.com', trip: 'Now · Soufriere, Saint Lucia', money: '$16,560', now: true },
    { n: 'Belle Fitzwilliam-Castellanos', e: 'annabelle.fc@example.com', trip: 'Maldives, overwater · Apr 27', money: '$24,800' },
    { n: 'Pri Raghunathan', e: 'priya.r@example.com', trip: 'Kyoto in the spring · Nov 26', money: '$18,300*', star: true },
    { n: 'Linda Gomez', e: 'linda.gomez@example.com', trip: 'Somewhere warm, February-ish', money: '—' },
    { n: 'Eli Park', e: 'eli.park@example.com', trip: null, money: '—' },
    { n: 'Marcus Webb', e: 'No email on file', trip: 'Alaska, the inside passage · Feb 27', money: '—' },
  ];

  return (
    <CrmMFrame dark={dark} footer={<CrmMTabs active="clients"/>}>
      <CrmMTopBar title="Clients"/>

      <div style={{ padding: '14px 16px 0' }}>
        {/* Departure 1 — visible, because on this section the search IS the task. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
          borderRadius: 999, background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)',
        }}>
          <Icon name="search" size={15}/>
          <span className="t-body-s">Search by name, email, trip…</span>
        </div>

        {/* Collapsed as Pattern B asks — a radio pair, because a client is active or
            archived and never both. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <span className="chip chip-filter is-on">Active</span>
          <span className="chip chip-filter">Archived</span>
        </div>

        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', margin: '12px 0 10px' }}>
          27 active · 5 in motion · 1 lead to qualify.
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.n} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <CrmMInitials name={r.n}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.e}</div>
              {/* Departure 3 — one line, and it prefers the trip that has not happened yet.
                  Departure 6's asterisk rides the money, not this. */}
              {r.trip && (
                <div className="t-body-s" style={{
                  marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: r.now ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
                  fontWeight: r.now ? 600 : 400,
                }}>{r.trip}</div>
              )}
            </div>
            {/* Departure 7 — a dash for a client with nothing committed, never "$0.00". */}
            <div style={{ font: '700 11px/1 var(--font-mono)', color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>
              {r.money}
            </div>
          </div>
        ))}

        {/* Departure 6 — the note that says which currency the figure above left out. */}
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
          * One client banks in more than one currency. Their lifetime figure covers their most-used one.
        </div>

        {/* Departure 5 — appends, never pages. */}
        <button className="btn btn-outlined btn-sm" style={{ width: '100%', marginTop: 6, marginBottom: 12 }}>
          Load more · 7 of 27
        </button>
      </div>
    </CrmMFrame>
  );
}

Object.assign(window, { M331_ClientRoster });
