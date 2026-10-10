/* global React, Icon, IOSDevice */
// Agent · 3.4m Mobile · Trip Builder & Management — 2 of 16 screens.
// Mobile-native interpretation of the 3.4 desktop artboards in agent-trip.jsx.
//
// Pattern, per Screen-Inventory §4.4: 3.4.2 **C** — the desk half is "a persistent left rail
// or tab strip with a wide detail pane"; the mobile half is "a horizontally scrolling tab
// strip, each tab a full screen". That is what these frames draw.
//
// WHY TWO FRAMES AND NOT SIXTEEN. The house convention is 1:1 parity and §3.2m says why: an
// omitted entry reads as "not designed", a drawn-and-deferred one reads as "designed, and
// here is why it is not on your phone". The convention is not abandoned — §3.4 shipped on
// web across five PRs and this file tracks the build rather than front-running it. What
// arrives here is the ONE screen §6.6 puts on a phone, §3.4.2 Trip Detail, drawn at two of
// its eight tabs because the tab strip is the pattern and one frame cannot show a strip
// moving. The other fourteen are named under departure 1, with the reason each is not here.
//
// THE TRIP DETAIL CARRIES ALL EIGHT TABS, READ-ONLY (Gyasi, 2026-09-29, asked at approval).
// That reads like a contradiction of §6.6's "intentionally narrower than web" and is not:
// §3.3.2 already settled what narrower means on this surface. Its mobile client detail kept
// every real tab and dropped only the one that was disabled on web too. Narrower here is
// about WRITES and about navigational depth, not about how much an advisor may look at. An
// advisor standing at a gate needs to READ anything about a trip; what they will not do on a
// phone is build one.
//
// DELIBERATE DEPARTURES from the desktop artboards, each verified against the schema, the
// shipped accessor and the migrations rather than assumed.
//
//   1. NO TRIPS TAB, AND THAT IS WHY THERE IS NO §3.4.1 FRAME. §6.6's bottom bar is
//      Worklist, Clients, Messages, More — four, and Trips is not among them. The web rail
//      has seven and includes Trips. So a trip is reached on a phone from the WORKLIST's
//      rows, which is where `AgentCopy.TRIP_DETAIL_DEFERRED` has been rendering on three
//      sections since §3.2.1 shipped. That deferral is what this file's build retires.
//
//      The fourteen frames not here, and the reason for each:
//        3.4.1  Trip List — no Trips tab to hang it on (above). The worklist IS the list.
//        3.4.3  New Trip — a form. Deep work, and §6.6's own example of it.
//        3.4.4  Trip Builder — the desk screen of the section. A seven-button rail and a
//               canvas of component rows is the definition of what a phone is not for.
//        3.4.5–3.4.12  The eight component sheets — writes, and children of the builder.
//        3.4.13 Template Library — §6.6 names "template management" as web-only IN SO MANY
//               WORDS. The one screen here settled by the doc rather than by judgement.
//        3.4.14 Itinerary Editor — the WRITE half of a tab this file draws as a read.
//        3.4.15 Payment Schedule — likewise: the read is tab 4 here, the editor is web.
//        3.4.16 Cancel / Archive — a write, with an impact list and a mandatory reason.
//      Those will be DRAWN-AND-DEFERRED frames when this file grows, per the convention.
//      Naming them now is the record that they were considered rather than forgotten.
//
//   2. THE TAB STRIP SCROLLS AND DOES NOT WRAP. Eight tabs will not fit 375pt and wrapping
//      them costs two rows of a screen whose whole job is the pane below. The active tab is
//      scrolled into view, and the strip is the only horizontally scrolling thing on the
//      surface — §4.4 Pattern C mobile asks for exactly this.
//
//   3. THE MONEY ROW IS THREE FIGURES, NOT THE DESKTOP'S CARD. `A342_TripDetail` draws a
//      "Cost & commission" card with a labelled grid. A phone gets one row: what the trip
//      costs, what has been paid, what the agency makes. Those are the three an advisor is
//      ever asked on the move, and the third is `trip.total_commission_cents` which is
//      withheld from the client role entirely — so it is drawn here and nowhere a traveler
//      can reach.
//
//   4. NO CURRENCY NOTE AND NO ASTERISK. The desktop frames and this file's §3.3 sibling
//      both drew a marker beside a money figure and a footnote naming the currency it left
//      out. `trip_currency_usd` (20260930100000) makes more than one currency impossible to
//      store, and the accessors stopped scoping. A figure that cannot exclude anything must
//      not carry a mark saying it did.
//
//   5. "FINAL PAYMENT DUE", NOT "BOOKED". The status chip is derived rather than read:
//      `tripStatusPresentation` folds the stage together with the next unpaid milestone, so
//      a booked trip with a balance eleven days out says the thing the advisor has to act
//      on. The desktop draws the raw stage. Same derivation on both surfaces; only this
//      frame shows what it actually produces.
//
//   6. NO WRITE CONTROLS AT ALL — no stage menu, no "Save as template", no "Cancel trip",
//      no builder link. Every one of those exists on the web header as of §3.4.16 and
//      §3.4.13. §6.6 keeps them there. A control that opens a form is not a triage task.
//
//   7. THE DAY-BY-DAY SHOWS A DAY WITH NOTHING IN IT. Day 2 of the seeded itinerary has no
//      activities, and the frame draws that rather than a tidier trip. A day-by-day with
//      gaps is the normal state of a trip being written, and a design that only shows the
//      finished article is how an empty state ships unconsidered.
//
//   8. GYASI'S TIP IS DRAWN AS ITS OWN BLOCK, not as body text. It is a distinct column on
//      `itinerary_activity` and the thing an advisor reaches for when a client rings from
//      the resort. Folding it into the description would lose it in the paragraph.
//
// ── Departures 9–12 were added when the Compose screen shipped (2026-09-30) ───────────
//
// These four are corrections rather than decisions: the build met the shared `AgentTopBar`,
// the copy-parity gate and an accessor, and each one overruled how this file had drawn it.
// Recording them as departures rather than editing the frames silently is what keeps the
// artboard usable as a record of what was decided and why.
//
//   9. THE TOP BAR SAYS "Trip" AND HAS NO CHEVRON. `AgentTopBar` is shared with both agent
//      tab roots, where there is nothing to go back to, so it has no navigation slot — back
//      is a line of text under it, which is what §3.3.2 already built. And the bar is one
//      line with Sign out beside it, so the trip's own name arrives truncated while the H1
//      below carries it whole. A category beats a clipped duplicate.
//
//  10. THE CLIENT'S NAME IS THE ONE LINK OUT, tinted to say so. §3.3.2 is built on this
//      stack and is where the phone number is. Everything else on the surface is a read.
//
//  11. FOUR GLANCE ROWS, AND "Next payment" IS NOT ONE OF THEM. It moved to the Payments
//      tab's summary line. Deriving the next-due milestone in two places is two places for
//      them to disagree — and the accessor already picks it once, with
//      `status IN ('scheduled','overdue')`, which is the set the status chip also uses.
//
//  12. THE ITINERARY TAB LEADS WITH PUBLISHED OR DRAFT, at the cost of an eighth accessor.
//      A draft day-by-day looks exactly like a published one, so without it an advisor can
//      tell a client "it is in your app" about a trip the client cannot open. `TripItineraryView`
//      on the web says the same thing — "never blank; an agent must know which one they are
//      reading" — and the phone had no other way to know.
//
// Three labels also changed to the shipped strings: the money row's first two
// ("Client total", "Paid so far"), the empty day ("Nothing on this day yet.") and the tip
// ("Gyasi's Tip", not uppercased). All five are compared byte for byte across web and
// Compose by check_copy_parity.py, so the words this file invented could not have existed.

// ──────────────────────────────────────────────────────────────────────
// Shell
// ──────────────────────────────────────────────────────────────────────

function TripMFrame({ dark = false, children, footer }) {
  return (
    <IOSDevice>
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

// §6.6's four. Trips is deliberately not among them — departure 1.
const TRIP_M_TABS = [
  { id: 'work', icon: 'pulse', label: 'Worklist', built: true },
  { id: 'clients', icon: 'users', label: 'Clients', built: true },
  { id: 'msg', icon: 'message', label: 'Messages', built: false },
  { id: 'more', icon: 'more_vert', label: 'More', built: false },
];

function TripMTabs({ active = 'work' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {TRIP_M_TABS.map((t) => {
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

/**
 * Departure 9 — "Trip", and no chevron.
 *
 * The bar is SHARED with both agent tab roots (`AgentTopBar`), where there is nothing to go
 * back to, so it has no navigation slot and gaining one would change Worklist and Clients
 * too. Back is a line of text under it instead, which is what §3.3.2 already built and what
 * `CrmMTopBar` in the sibling file draws.
 *
 * And the title is a CATEGORY rather than the trip's name: the bar is one line with Sign out
 * beside it, so "Anniversary Week in Negril" arrives as "Anniversary Week i…" while the H1
 * two lines below carries the whole thing. A truncated duplicate is worse than a word.
 */
function TripMTopBar({ title = 'Trip' }) {
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

/** The back affordance TripMTopBar cannot carry. */
function TripMBack() {
  return (
    <div className="t-body-s" style={{ padding: '10px 16px 0', color: 'var(--md-on-surface-variant)' }}>
      &larr; Back
    </div>
  );
}

// Departure 2 — eight, scrolling, never wrapping.
const DETAIL_TABS = [
  'Overview', 'Components · 6', 'Itinerary', 'Payments', 'Documents · 3', 'Messages', 'Notes', 'Activity',
];

function TripMTabStrip({ active }) {
  return (
    <div style={{
      display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto',
      borderBottom: '1px solid var(--md-outline-variant)', whiteSpace: 'nowrap',
    }}>
      {DETAIL_TABS.map((t) => (
        <span key={t} className={`chip${t === active ? ' chip-filter is-on' : ''}`}
              style={{ height: 30, flexShrink: 0, fontSize: 12 }}>{t}</span>
      ))}
    </div>
  );
}

/** The trip header both frames share. Departures 3, 4 and 5 all live here. */
function TripMHeader() {
  return (
    <div style={{ padding: '10px 16px 12px' }}>
      {/* Departure 10 — the client's name is the ONE link out of a read-only screen, and it
          is tinted to say so. §3.3.2 is built on this stack and is where the phone number
          is; Design-System §2.6's conviction on the agent's side is that a traveler stays a
          named person rather than a row. */}
      <div className="t-body-s" style={{ color: 'var(--md-primary)' }}>Jordan Hayes</div>
      <div style={{ font: '600 20px/1.25 var(--font-sans)', marginTop: 2 }}>Anniversary Week in Negril</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {/* Departure 5 — derived from the stage AND the next unpaid milestone. */}
        <span className="chip chip-status" style={{ height: 24, fontSize: 11 }}>FINAL PAYMENT DUE</span>
        <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Dec 4 – 11 · 6 travelers</span>
      </div>

      {/* Departure 3 — three figures, not the desktop's card. No asterisk: departure 4. */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 12, padding: '10px 12px', borderRadius: 14,
        background: 'var(--md-surface-2)',
      }}>
        {/* THE LABELS ARE THE SHIPPED ONES, not shorter ones invented for the drawing.
            `clientTotalLabel` / `paidSoFarLabel` / `commissionLabel` are compared byte for
            byte across web and Compose by check_copy_parity.py, so "Trip total" and "Paid"
            — which this frame drew first — would have been a picture of copy that cannot
            exist. */}
        {[
          ['Client total', '$12,845'],
          ['Paid so far', '$5,000'],
          ['Commission', '$1,318'],
        ].map(([l, v]) => (
          <div key={l} style={{ flex: 1, minWidth: 0 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{l.toUpperCase()}</div>
            <div style={{ font: '600 15px/1.2 var(--font-mono)', marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.4m.2a — Trip detail · Overview
// ──────────────────────────────────────────────────────────────────────

function M342_TripDetail({ dark = false }) {
  // Trip 0040 from the seed, so the frame and the local stack agree to the cent. Commission
  // is $1,318 and not the $1,541 the ledger used to claim — 20260930140000 pointed the
  // forecast at the components, which correctly record two flights at 0%.
  // FOUR ROWS, NOT SIX. The desk grid adds Travelers and Dates; the header above already
  // reads "Dec 4 – Dec 11 · 6 travelers", and repeating both here is redundancy a 375pt
  // screen cannot afford. "Next payment" was drawn here in the first pass and moved to the
  // Payments tab's summary line — departure 11 — because two places deriving the same
  // next-due milestone is two places for them to disagree.
  const glance = [
    ['Trip type', 'All-inclusive'],
    ['Destination', 'Negril, Jamaica'],
    ['Card on file', 'VISA •••• 4242 · $9,000 cap'],
    ['Last activity', 'Sep 28'],
  ];

  return (
    <TripMFrame dark={dark} footer={<TripMTabs active="work"/>}>
      <TripMTopBar/>
      <TripMBack/>
      <TripMHeader/>
      <TripMTabStrip active="Overview"/>

      <div style={{ padding: '14px 16px 20px' }}>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>AT A GLANCE</div>
        <div style={{ marginTop: 6 }}>
          {glance.map(([l, v], i) => (
            <div key={l} style={{
              display: 'flex', gap: 12, padding: '9px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--md-outline-variant)',
            }}>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', flex: '0 0 116px' }}>{l}</div>
              <div className="t-body-s" style={{ flex: 1, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Departure 6 — no write controls. This is the read, and it says so rather than
            drawing a disabled row of them. */}
        <div className="t-body-s" style={{
          color: 'var(--md-on-surface-variant)', marginTop: 14, padding: '10px 12px',
          borderRadius: 12, background: 'var(--md-surface-2)',
        }}>
          Building, pricing and cancelling this trip live on the web app. This is the read.
        </div>
      </div>
    </TripMFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.4m.2b — Trip detail · Itinerary
// ──────────────────────────────────────────────────────────────────────

function M342_TripItinerary({ dark = false }) {
  // The seeded day-by-day for trip 0040. Day 2 is deliberately empty — departure 7.
  const days = [
    {
      n: 1, date: 'Fri Dec 4', label: 'Miami → Negril', items: [
        { block: 'MORNING', time: '06:40', title: 'AA 1413 · MIA → MBJ' },
        { block: 'AFTERNOON', time: '10:20', title: 'Private transfer · Mercedes Vito',
          tip: 'Ask for Delroy. He knows the back road when the coast road is shut.' },
        { block: 'AFTERNOON', time: '15:00', title: 'Check in · Ocean-view suite' },
      ],
    },
    { n: 2, date: 'Sat Dec 5', label: 'Seven Mile Beach', items: [] },
    {
      n: 3, date: 'Sun Dec 6', label: 'Booby Cay day-trip', items: [
        { block: 'MORNING', time: '09:00', title: 'Catamaran to Booby Cay',
          tip: 'Sit at the back on the way out — the spray is at the front.' },
      ],
    },
    { n: 4, date: 'Mon Dec 7', label: 'An open day', items: [] },
  ];

  return (
    <TripMFrame dark={dark} footer={<TripMTabs active="work"/>}>
      <TripMTopBar/>
      <TripMBack/>
      <TripMHeader/>
      <TripMTabStrip active="Itinerary"/>

      <div style={{ padding: '12px 16px 20px' }}>
        {/* Departure 12 — PUBLISHED OR DRAFT, first, and it costs an eighth accessor. A
            draft day-by-day looks exactly like a published one, so without this line an
            advisor can tell a client "it is in your app" off a trip the client cannot see.
            It is the only column read from `itinerary` itself. */}
        <div className="t-label" style={{ color: 'var(--md-primary)', marginBottom: 10 }}>PUBLISHED</div>
        {days.map((d) => (
          <div key={d.n} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: '700 13px/1.2 var(--font-sans)' }}>Day {d.n}</span>
              <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{d.date}</span>
            </div>
            <div style={{ font: '600 15px/1.25 var(--font-sans)', marginTop: 2 }}>{d.label}</div>

            {d.items.length === 0 ? (
              /* Departure 7 — a day with nothing in it is the normal state of a trip being
                 written, and drawing it is how the empty state gets considered. */
              <div className="t-body-s" style={{
                color: 'var(--md-on-surface-variant)', marginTop: 6, padding: '10px 12px',
                borderRadius: 12, border: '1px dashed var(--md-outline-variant)',
              }}>
                Nothing on this day yet.
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {d.items.map((it, i) => (
                  <div key={i} style={{
                    padding: '9px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--md-outline-variant)',
                  }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: '0 0 62px' }}>
                        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{it.block}</div>
                        <div style={{ font: '600 12px/1.2 var(--font-mono)', marginTop: 1 }}>{it.time}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="t-body-s" style={{ fontWeight: 500 }}>{it.title}</div>
                        {/* Departure 8 — its own block, never folded into the body. */}
                        {it.tip && (
                          <div style={{
                            marginTop: 5, padding: '7px 10px', borderRadius: 10,
                            background: 'var(--md-secondary-container)',
                            color: 'var(--md-on-secondary-container)',
                          }}>
                            {/* `tipLabel`, verbatim and not uppercased: Design-System §2
                                makes "Gyasi's Tip" a named thing, and it is compared byte
                                for byte across both stacks. */}
                            <div className="t-label">Gyasi&apos;s Tip</div>
                            <div className="t-body-s" style={{ marginTop: 1 }}>{it.tip}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="t-body-s" style={{
          color: 'var(--md-on-surface-variant)', padding: '10px 12px',
          borderRadius: 12, background: 'var(--md-surface-2)',
        }}>
          Writing the day-by-day is §3.4.14, on the web app.
        </div>
      </div>
    </TripMFrame>
  );
}

Object.assign(window, { M342_TripDetail, M342_TripItinerary });
