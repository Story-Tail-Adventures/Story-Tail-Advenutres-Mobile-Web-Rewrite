/* global React, Icon, StoryTailMark, staImg, IOSDevice */
// Client · 2.2m Mobile · Dashboard & Trip Experience — 11 screens.
// Mobile-native interpretation of the 2.2 desktop artboards in client-trip.jsx.
//
// Patterns, per Screen-Inventory §4.4: 2.2.1 D · 2.2.2 B · 2.2.3 C · 2.2.4 I ·
// 2.2.5 I · 2.2.6 B · 2.2.7 J-adjacent · 2.2.8 inline · 2.2.9 J · 2.2.10 C-variant ·
// 2.2.11 I + gallery. The recurring translation moves are: right rails become cards or
// accordions BELOW the content, multi-column grids collapse to one column (or 2x2 for
// icon tiles), and any bottom bar is a SIBLING of the scroll rather than an overlay —
// the structural rule that kept the native §2.0 build clear of the sticky-CTA/footer
// overlap bug the web side shipped.
//
// Deliberate departures from the desktop artboards, all decided 2026-09-06 and recorded
// in .claude/skills/sync-design-handoff/SKILL.md under "Known upstream deltas":
//   1. The bottom bar carries FOUR tabs (Trips · Discover · Messages · Account), matching
//      the prototype's own StaMobileTabs, not Screen-Inventory §6.3's five. No Help FAB.
//   2. Gyasi's portrait is an initials avatar. staImg('avatarA') has no entry in
//      web/lib/images.ts, and no licensed photograph of him exists yet.
//   3. Gyasi is he/him. C228_EmptyState says "once she hears back"; fixed here.
//   4. "Saved searches" is gone from the dashboard tabs — SavedSearch is a Phase 2 entity.
//   5. The "OFFLINE-READY / Synced 2h ago" card is gone — offline UI is Phase 3 per
//      BRD §13.3, even though the SqlDelight cache lands in Phase 1.
//   6. "Share with co-traveler" collapses into "Download PDF". The secure link is deferred
//      to §2.8, where Screen-Inventory §7's open question about account-less co-traveler
//      access belongs.
//   7. "Book a similar trip" repoints at the trip thread — §2.3 self-guided search is P2.
// Kept deliberately: the payment timeline and the testimonial card, because
// payment_milestone and testimonial are being modelled in this same PR; the weather card,
// because itinerary_day.weather_forecast already exists and is agent-authored; "Mark as
// done", which ships as per-device local state; and "Authorize a card", because §2.4 is
// Phase 1 and lands next.

// ──────────────────────────────────────────────────────────────────────
// Shells
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

// Four tabs, per the prototype's StaMobileTabs. 70px of bar plus an 18px home-indicator
// inset, and a 56x28 active pill in secondary-container so the active tab reads at a glance.
const M_TABS = [
  { id: 'trips', icon: 'home', label: 'Trips' },
  { id: 'discover', icon: 'search', label: 'Discover' },
  { id: 'msg', icon: 'message', label: 'Messages' },
  { id: 'me', icon: 'user', label: 'Account' },
];

function MClientTabs({ active = 'trips' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {M_TABS.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56 }}>
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

// 56px bar. `over` floats white glyphs on a hero photograph; otherwise it is an opaque
// sticky bar with a hairline. `title` is omitted on hero screens — the photo carries it.
function MTripTopBar({ title, over = false, onBackLabel = 'Back', trailing }) {
  const fg = over ? '#FFF' : 'var(--md-on-surface)';
  return (
    <div style={{
      position: over ? 'absolute' : 'sticky', top: over ? 54 : 0, left: 0, right: 0, zIndex: 5,
      height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 6px',
      background: over ? 'transparent' : 'var(--md-bg)',
      borderBottom: over ? 0 : '1px solid var(--md-outline-variant)',
    }}>
      <button className="btn-icon" aria-label={onBackLabel} style={{
        width: 40, height: 40, color: fg,
        background: over ? 'rgba(13,33,55,0.42)' : 'transparent',
        backdropFilter: over ? 'blur(6px)' : 'none',
      }}>
        <Icon name="arrow_left" size={19}/>
      </button>
      {title && <div className="t-title-s" style={{ flex: 1, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>}
      {!title && <div style={{ flex: 1 }}/>}
      {trailing}
    </div>
  );
}

// Gyasi's portrait until a licensed photograph exists. Initials, never a stock face.
function MAdvisorAvatar({ size = 36, tone = 'secondary' }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: `var(--md-${tone}-container)`, color: `var(--md-on-${tone}-container)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: `700 ${Math.round(size * 0.38)}px/1 var(--font-sans)`, letterSpacing: 0.3,
    }}>GS</span>
  );
}

function MHeroPhoto({ img, height = 240, children, grayscale = false }) {
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden' }}>
      <img src={staImg(img, 800, Math.round(height * 2))} alt="" style={{
        width: '100%', height: '100%', objectFit: 'cover',
        filter: grayscale ? 'grayscale(0.55) brightness(0.6)' : 'none',
      }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.34) 0%, transparent 34%, rgba(13,33,55,0.78) 100%)' }}/>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: '#FFF' }}>{children}</div>
    </div>
  );
}

// The day navigator. §4.4 Pattern I: "day navigator as a horizontal scrollable chip strip"
// on mobile. Sticky, so it survives scrolling a long day.
function MDayChips({ days, active = 0, sticky = true }) {
  return (
    <div style={{
      position: sticky ? 'sticky' : 'static', top: sticky ? 56 : 'auto', zIndex: 4,
      display: 'flex', gap: 6, padding: '10px 16px', overflow: 'auto',
      background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)',
      scrollSnapType: 'x proximity',
    }}>
      {days.map((d, i) => (
        <span key={d} className="chip" style={{
          flexShrink: 0, height: 34, border: 0, scrollSnapAlign: 'start',
          font: '600 12.5px/1 var(--font-sans)',
          background: i === active ? 'var(--md-primary)' : 'var(--md-surface-2)',
          color: i === active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
        }}>{d}</span>
      ))}
    </div>
  );
}

// The desktop "At a glance" / cancellation grids are 3-col and 2-col. On a 400pt frame
// they go 2-col, and any row whose value is long gets the full width.
function MKeyGrid({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {rows.map((kv) => (
        <div key={kv.l} style={{ gridColumn: kv.wide ? '1 / -1' : 'auto' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</div>
          <div className="t-body" style={{ marginTop: 2 }}>{kv.v}</div>
        </div>
      ))}
    </div>
  );
}

function MSectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 8px' }}>
      <div className="t-title-s" style={{ flex: 1 }}>{children}</div>
      {action && <button className="btn btn-text btn-sm" style={{ padding: 0, height: 'auto' }}>{action}</button>}
    </div>
  );
}

function MEmptyCard({ icon, title, body, cta, big = false }) {
  return (
    <div className="card" style={{
      padding: big ? '22px 18px' : 16, textAlign: big ? 'center' : 'left',
      border: '1.5px dashed var(--md-outline-variant)', background: 'var(--md-surface-2)',
      display: big ? 'block' : 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{
        width: big ? 52 : 36, height: big ? 52 : 36, borderRadius: big ? 999 : 10, flexShrink: 0,
        background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: big ? 10 : 0,
      }}>
        <Icon name={icon} size={big ? 26 : 16}/>
      </span>
      <div>
        <div className={big ? 't-title-l' : 't-title-s'}>{title}</div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: big ? '6px auto 14px' : '4px 0 0', maxWidth: big ? 300 : 'none' }}>{body}</p>
        {cta && <button className="btn btn-tonal btn-sm"><Icon name="message" size={13}/> {cta}</button>}
      </div>
    </div>
  );
}

// §4.4 Pattern J on mobile is "full-height bottom sheet ... swipe-down to dismiss", which
// the desktop artboards never draw. The grabber is what says so.
function MSheet({ children, height = '72%' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--md-scrim)' }}/>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height,
        background: 'var(--md-surface-1)', borderRadius: '28px 28px 0 0',
        boxShadow: 'var(--md-shadow-3)', display: 'flex', flexDirection: 'column',
        padding: '8px 16px 22px', overflow: 'auto',
      }}>
        <span style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--md-outline-variant)', margin: '0 auto 12px', flexShrink: 0 }}/>
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.1 — Client Dashboard / Home  ·  Pattern D
// Stacked sections. §4.4: "Mobile hero countdown is full-width" — and the tablet/web
// weather widget beside it is explicitly a larger-viewport affordance, so it is absent
// here. The desktop right rail (action-needed card, advisor card) becomes the first two
// cards below the hero, in the same order, because both are things to act on.
// ──────────────────────────────────────────────────────────────────────

function M221_Dashboard({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MClientTabs active="trips"/>}>
      <div style={{ padding: '14px 16px 0' }}>
        <div className="t-label-s" style={{ color: 'var(--md-secondary)' }}>WELCOME BACK · YOUR REST IS COMING</div>
        <h1 className="t-headline" style={{ margin: '6px 0 4px' }}>Hey Jordan — 90 days until you can finally breathe out.</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
          One card to authorize, one new idea from Gyasi. The hard part is almost done.
        </p>
      </div>

      {/* Hero countdown — full width, the three tiles in one row */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', height: 268, color: '#FFF', boxShadow: 'var(--md-shadow-3)' }}>
          <img src={staImg('overwater', 800, 560)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, rgba(122,26,31,0.82), rgba(13,33,55,0.7))' }}/>
          <div style={{ position: 'relative', padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <span className="chip-status booked" style={{ alignSelf: 'flex-start' }}>Booked · Honeymoon</span>
            <h2 className="t-title-l" style={{ margin: '10px 0 2px', color: '#FFF' }}>Sandals Royal Bahamian</h2>
            <div style={{ font: '500 12.5px/1.35 var(--font-sans)', opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · Nassau</div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 7 }}>
              {[{ v: 90, l: 'DAYS' }, { v: 14, l: 'HR' }, { v: 32, l: 'MIN' }].map((c) => (
                <div key={c.l} style={{
                  flex: 1, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 12, padding: '8px 0', textAlign: 'center', backdropFilter: 'blur(8px)',
                }}>
                  <div style={{ font: '800 21px/1 var(--font-sans)' }}>{c.v}</div>
                  <div style={{ font: '600 9px/1 var(--font-sans)', letterSpacing: 1.2, opacity: 0.85, marginTop: 3 }}>{c.l}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-orange" style={{ width: '100%', marginTop: 10 }}>
              View itinerary <Icon name="arrow_right" size={13}/>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="card" style={{ padding: 14, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', border: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="card" size={15}/><span className="t-label-s">ACTION NEEDED · 14 DAYS</span>
          </div>
          <div className="t-title-s" style={{ marginTop: 6 }}>Authorize a card for the final balance</div>
          <div className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>$4,180 due to Sandals on May 28.</div>
          <button className="btn btn-filled" style={{ width: '100%', marginTop: 10, background: 'var(--md-on-error-container)', color: 'var(--md-error-container)' }}>
            Authorize a card <Icon name="arrow_right" size={13}/>
          </button>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MAdvisorAvatar size={32}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s" style={{ fontSize: 13 }}>Gyasi · Your advisor</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Usually replies the same day</div>
            </div>
            <Icon name="chevron_right" size={16} color="var(--md-on-surface-variant)"/>
          </div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '8px 0 0' }}>
            “Locked your bungalow upgrade — peek at day 3.”
          </p>
        </div>
      </div>

      {/* Section tabs — two, not three. Saved searches needs the Phase 2 SavedSearch entity. */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--md-outline-variant)' }}>
          {['In planning · 1', 'Past trips · 3'].map((t, i) => (
            <button key={t} style={{
              padding: '10px 12px', border: 0, background: 'transparent',
              font: '600 13px/1 var(--font-sans)', marginBottom: -1,
              color: i === 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
              borderBottom: i === 0 ? '3px solid var(--brand-orange)' : '3px solid transparent',
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { t: 'Family week — Negril', s: 'Dec 22 – 29 · 4 travelers', i: 'jamaica', tag: 'proposal', tagL: 'Proposal ready' },
          { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025 · Cruise', i: 'cruiseShip', tag: 'past', tagL: 'Past' },
        ].map((c) => (
          <div key={c.t} className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ position: 'relative', height: 132 }}>
              <img src={staImg(c.i, 800, 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <span className={`chip-status ${c.tag}`} style={{ position: 'absolute', top: 10, left: 10 }}>{c.tagL}</span>
            </div>
            <div style={{ padding: 12 }}>
              <div className="t-title-s">{c.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
            </div>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.2 — All Trips List  ·  Pattern B
// The desktop's `200px | 1fr | auto` row with a bordered TRIP VALUE column cannot survive
// 400pt, so the card goes image-top and the value becomes a quiet line under the dates.
// §4.4 Pattern B on mobile: "filter and search collapsed behind icon buttons; 'Sort' opens
// a bottom sheet" — so the dark artboard draws that sheet open, which the desktop never shows.
// ──────────────────────────────────────────────────────────────────────

function M222_AllTrips({ dark = false }) {
  const trips = [
    { t: 'Sandals Royal Bahamian', s: 'Aug 12 – 19, 2026 · Honeymoon', tag: 'booked', tagL: 'Booked', i: 'overwater', val: '$6,480' },
    { t: 'Family week — Negril', s: 'Dec 22 – 29, 2026 · 4 travelers', tag: 'proposal', tagL: 'Proposal ready', i: 'jamaica', val: '$9,120' },
    { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025 · Cruise', tag: 'past', tagL: 'Past', i: 'cruiseShip', val: '$5,240' },
    { t: 'Beaches Turks & Caicos', s: 'Jan 6 – 13, 2024 · Family', tag: 'past', tagL: 'Past', i: 'turks', val: '$6,920' },
  ];
  return (
    <MFrame dark={dark} footer={<MClientTabs active="trips"/>}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 8px 8px 16px' }}>
          <h1 className="t-title-l" style={{ flex: 1, margin: 0 }}>My trips</h1>
          <button className="btn-icon" aria-label="Search trips" style={{ width: 40, height: 40 }}><Icon name="search" size={18}/></button>
          <button className="btn-icon" aria-label="Sort" style={{ width: 40, height: 40 }}><Icon name="filter" size={18}/></button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflow: 'auto' }}>
          {['All · 4', 'Upcoming · 1', 'In planning · 1', 'Past · 2', 'Cancelled · 0'].map((t, i) => (
            <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`} style={{ flexShrink: 0, height: 32 }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {trips.map((t) => (
          <div key={t.t} className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ position: 'relative', height: 140 }}>
              <img src={staImg(t.i, 800, 320)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <span className={`chip-status ${t.tag}`} style={{ position: 'absolute', top: 10, left: 10 }}>{t.tagL}</span>
            </div>
            <div style={{ padding: '12px 14px 14px' }}>
              <div className="t-title-s">{t.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{t.s}</div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                <span className="t-body-s" style={{ flex: 1, color: 'var(--md-on-surface-variant)' }}>{t.val} all-in</span>
                <button className="btn btn-tonal btn-sm">Open</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {dark && (
        <MSheet height="46%">
          <div className="t-title-s" style={{ marginBottom: 4 }}>Sort trips</div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 10px' }}>Newest departures first, by default.</p>
          {['Departure date · soonest', 'Departure date · latest', 'Recently updated', 'A – Z'].map((o, i) => (
            <div key={o} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 2px',
              borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)',
              font: '500 14px/1.3 var(--font-sans)',
            }}>
              <span style={{ flex: 1 }}>{o}</span>
              {i === 0 && <Icon name="check" size={17} color="var(--md-primary)"/>}
            </div>
          ))}
        </MSheet>
      )}
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.3 — Trip Detail / Overview  ·  Pattern C
// §4.4: "Full-screen detail; back button to list; sub-sections collapsible accordions."
// The four quick-access tiles become a 2x2 grid; the desktop right rail becomes the
// advisor card and the payment timeline, below the content, in the same order.
// "Card on file · VISA •••• 4242" is dropped from At a glance — that lives on payment_card
// and belongs to §2.4; "Nights" takes the slot and comes off the trip's own dates.
// ──────────────────────────────────────────────────────────────────────

function M223_TripDetail({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MTripTopBar over onBackLabel="Back to my trips" trailing={
        <button className="btn-icon" aria-label="Download PDF" style={{ width: 40, height: 40, color: '#FFF', background: 'rgba(13,33,55,0.42)', backdropFilter: 'blur(6px)' }}>
          <Icon name="download" size={18}/>
        </button>
      }/>
      <MHeroPhoto img="overwater" height={240}>
        <span className="chip-status booked">Booked</span>
        <h1 className="t-title-l" style={{ margin: '8px 0 2px', color: '#FFF' }}>Sandals Royal Bahamian</h1>
        <div style={{ font: '500 12.5px/1.35 var(--font-sans)', opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · 90 days to go</div>
      </MHeroPhoto>

      <div style={{ padding: '14px 16px 22px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-orange" style={{ flex: 1 }}>Authorize card</button>
          <button className="btn btn-outlined" style={{ flex: 1 }}><Icon name="message" size={14}/> Message</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          {[
            { i: 'plane', l: 'Itinerary', s: 'Day-by-day', tone: 'primary' },
            { i: 'card', l: 'Payments', s: '$4,180 due', tone: 'error' },
            { i: 'passport', l: 'Documents', s: '5 files', tone: 'secondary' },
            { i: 'message', l: 'Messages', s: '2 unread', tone: 'tertiary' },
          ].map((s) => (
            <div key={s.l} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `var(--md-${s.tone}-container)`, color: `var(--md-on-${s.tone}-container)`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={s.i} size={16}/>
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{s.l}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.s}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <div className="t-title-s" style={{ marginBottom: 10 }}>At a glance</div>
          <MKeyGrid rows={[
            { l: 'Trip type', v: 'Honeymoon' },
            { l: 'Nights', v: '7 nights' },
            { l: 'Destination', v: 'Nassau, Bahamas' },
            { l: 'Travelers', v: '2 travelers' },
            { l: 'Total value', v: '$6,480 all-in' },
            { l: 'Status', v: 'Booked · final balance pending' },
          ]}/>
        </div>

        {/* itinerary.intro_note — the client-facing note. trip.notes is the agent's own and
            is deliberately outside the client column grant. */}
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div className="t-title-s">A note from Gyasi</div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>
            “I added a Red Lane spa credit and locked in your bungalow upgrade for Day 3. Sandals
            settles with me on May 28 — your card covers the final balance and nothing more.”
          </p>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MAdvisorAvatar size={40}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Gyasi Story</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Usually replies the same day</div>
            </div>
          </div>
          <button className="btn btn-tonal" style={{ width: '100%', marginTop: 10 }}><Icon name="message" size={14}/> Message Gyasi</button>
        </div>

        {/* payment_milestone rows. A supplier payment schedule, not an invoice — there is no
            "pay now" here and never will be (BRD §10.5). */}
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PAYMENT TIMELINE</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { d: 'var(--md-success)', t: 'Deposit · paid $800', c: null },
              { d: 'var(--md-success)', t: 'Second payment · paid $1,500', c: null },
              { d: 'var(--md-error)', t: 'Final · $4,180 due May 28', c: 'var(--md-error)' },
            ].map((p) => (
              <div key={p.t} style={{ display: 'flex', alignItems: 'center', gap: 9, font: '500 12.5px/1.3 var(--font-sans)', color: p.c || 'inherit' }}>
                <span className="dot" style={{ background: p.d, flexShrink: 0 }}/>{p.t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.4 — Itinerary Viewer (Day-by-Day)  ·  Pattern I
// §4.4: "Single column reading width, generous line height, large readable type (17pt
// body); day navigator as a horizontal scrollable chip strip; activities as full-width
// cards." The desktop aside becomes one full-width PDF button plus an IMPORTANT INFO
// accordion at the foot.
// This artboard draws the "Gyasi's Tip" callout the DESKTOP one omits — Screen-Inventory
// §2.2.4 names it a primary element and itinerary_activity.gyasis_tip exists to hold it.
// "Share with co-traveler" is gone; the PDF is the sharing story at MVP.
// ──────────────────────────────────────────────────────────────────────

function M224_ItineraryViewer({ dark = false }) {
  const blocks = [
    { time: '06:40', period: 'MORNING', kind: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Direct · 2h 50m · Seats 14A, 14B', c: 'TLR8QV' },
    { time: '11:20', period: 'MORNING', kind: 'trip', t: 'Private transfer', s: 'Sun & Fun Tours · Mercedes Vito · 25 min' },
    { time: '13:00', period: 'AFTERNOON', kind: 'building', t: 'Check-in · Sandals Royal Bahamian', s: 'Honeymoon Beachfront Walkout · Building 3', c: 'SRB-220119',
      tip: 'Ask for Devon at the front desk — he knows you are on honeymoon and will sort the room.' },
    { time: '19:30', period: 'EVENING', kind: 'utensils', t: 'Welcome dinner · Bayside', s: 'Four courses · reserved 7:30 PM' },
  ];
  return (
    <MFrame dark={dark}>
      <MTripTopBar title="Itinerary" trailing={
        <button className="btn-icon" aria-label="Download PDF" style={{ width: 40, height: 40 }}><Icon name="download" size={18}/></button>
      }/>
      <MDayChips days={['Day 1 · Wed', 'Day 2 · Thu', 'Day 3 · Fri', 'Day 4 · Sat', 'Day 5 · Sun', 'Day 6 · Mon', 'Day 7 · Tue']} active={0}/>

      <div style={{ padding: '16px 16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 34 }}>Day 01</div>
          <div className="t-title-s">Miami → Nassau</div>
        </div>
        <p style={{ font: '400 17px/1.55 var(--font-sans)', color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>
          Travel day. You land early enough for lunch on the sand — nothing is scheduled until dinner.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocks.map((b) => (
            <div key={b.t} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ minWidth: 52 }}>
                  <div style={{ font: '700 15px/1 var(--font-sans)' }}>{b.time}</div>
                  <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 3 }}>{b.period}</div>
                </div>
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={b.kind} size={18}/>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s">{b.t}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{b.s}</div>
                  {b.c && (
                    <div style={{ marginTop: 8 }}>
                      <span className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>CONFIRMATION </span>
                      <span className="kbd">{b.c}</span>
                    </div>
                  )}
                </div>
              </div>
              {b.tip && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 12,
                  background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)',
                }}>
                  <div className="t-label-s" style={{ opacity: 0.8 }}>GYASI’S TIP</div>
                  <div className="t-script" style={{ fontSize: 19, lineHeight: 1.25, marginTop: 2 }}>{b.tip}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button className="btn btn-tonal" style={{ width: '100%', marginTop: 16 }}>
          <Icon name="download" size={14}/> Download the full itinerary (PDF)
        </button>

        <div className="card" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14 }}>
            <Icon name="info" size={16} color="var(--md-on-surface-variant)"/>
            <div className="t-title-s" style={{ flex: 1 }}>Important info</div>
            <Icon name="chevron_up" size={16} color="var(--md-on-surface-variant)"/>
          </div>
          {['Insurance · Allianz #98-7124', 'Emergency · +1 (242) 555-3300', 'Gyasi’s packing list', 'Visa · not required'].map((s) => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
              borderTop: '1px solid var(--md-outline-variant)', font: '500 13px/1.3 var(--font-sans)',
            }}>
              <span style={{ flex: 1 }}>{s}</span>
              <Icon name="chevron_right" size={15} color="var(--md-on-surface-variant)"/>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.5 — Itinerary Day Detail  ·  Pattern I
// The weather card moves ABOVE the activities, so it reads as the day's context rather
// than a sidebar afterthought — it is the reason you'd check this screen on the morning of.
// §4.4: "Maps are full-screen on mobile", so "Open in Maps" is a full-width button implying
// the hand-off. "Mark as done" is kept: it ships as per-device local state, no column.
// The desktop's "OFFLINE-READY / Synced 2h ago" card is absent — Phase 3.
// ──────────────────────────────────────────────────────────────────────

function M225_DayDetail({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MTripTopBar title="Day 3 · Fri Aug 14" onBackLabel="Back to itinerary"/>
      <div style={{ padding: '16px 16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 38 }}>Day 03</div>
          <div>
            <h1 className="t-title-l" style={{ margin: 0 }}>Cay day-trip</h1>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Snorkel + private island lunch</div>
          </div>
        </div>

        {/* itinerary_day.weather_forecast — agent-authored, cached with a TTL. Not a live API. */}
        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>WEATHER · NASSAU</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Icon name="sun" size={34} color="var(--brand-sunset)"/>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 30px/1 var(--font-sans)' }}>87°F</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 3 }}>Mostly sunny · 8 mph SE</div>
            </div>
          </div>
          <div style={{
            marginTop: 10, padding: '9px 11px', borderRadius: 10,
            background: 'var(--md-warning-container)', color: 'var(--md-on-surface)',
            font: '500 12.5px/1.35 var(--font-sans)',
          }}>
            UV index 9 — pack the reef-safe sunscreen.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {[
            { i: 'ship', time: '09:00 – 15:00', t: 'Catamaran to Rose Island Cay', s: 'Snorkel gear and lunch included · 6 hours · for two', address: 'Rose Island Marina, Nassau' },
            { i: 'heart', time: '17:30 – 18:15', t: 'Beach yoga (optional)', s: '45 min · Pavilion · towels provided' },
            { i: 'utensils', time: '20:30', t: 'Hibachi night — Kimonos', s: 'Party of two · dress code: evening resort', address: 'Inside the resort, Building 1' },
          ].map((b) => (
            <div key={b.t} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={b.i} size={18}/>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s">{b.t}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{b.s}</div>
                  <span className="kbd" style={{ marginTop: 6, display: 'inline-block' }}>{b.time}</span>
                </div>
              </div>
              {b.address && (
                <>
                  <div style={{
                    marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
                    font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--md-on-surface-variant)',
                  }}>
                    <Icon name="pin" size={14}/> {b.address}
                  </div>
                  <button className="btn btn-tonal btn-sm" style={{ width: '100%', marginTop: 8 }}>
                    <Icon name="map" size={13}/> Open in Maps
                  </button>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-outlined btn-sm" style={{ flex: 1 }}><Icon name="phone" size={13}/> Call</button>
                <button className="btn btn-outlined btn-sm" style={{ flex: 1 }}><Icon name="check" size={13}/> Mark as done</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.6 — Trip Document Library  ·  Pattern B
// §4.4 is explicit: "Documents shown as thumbnails (grid) on tablet/web, list on mobile."
// So the desktop 3-col grid becomes grouped list rows. Upload is a sticky primary and a
// SIBLING of the scroll.
// The desktop subtitle "Auto-encrypted, share via secure link" is gone: it is jargon, it
// makes a security claim nobody has verified, and it promises the per-document share that
// is deferred with §2.2.4's secure link.
// ──────────────────────────────────────────────────────────────────────

function M226_TripDocuments({ dark = false }) {
  const groups = [
    { t: 'Supplier confirmations', docs: [
      { n: 'sandals-confirmation.pdf', s: '320 KB · added by Gyasi', d: 'Mar 14' },
      { n: 'flight-aa1413-boarding.pdf', s: '180 KB · added by Gyasi', d: 'Apr 2' },
    ] },
    { t: 'Passports & visas', docs: [
      { n: 'passport-jordan.jpg', s: '1.1 MB · added by you', d: 'Mar 20' },
      { n: 'passport-sam.jpg', s: '1.4 MB · added by you', d: 'Mar 20' },
    ] },
    { t: 'Insurance', docs: [
      { n: 'allianz-policy-987124.pdf', s: '620 KB · added by Gyasi', d: 'Mar 28' },
    ] },
  ];
  return (
    <MFrame dark={dark} footer={
      <div style={{ padding: '10px 16px 22px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
        <button className="btn btn-orange" style={{ width: '100%' }}><Icon name="upload" size={14}/> Upload a document</button>
      </div>
    }>
      <MTripTopBar title="Documents"/>
      <div style={{ padding: '14px 16px 18px' }}>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 4px' }}>
          Everything for Sandals, August 2026 — in one place.
        </p>
        {groups.map((g) => (
          <div key={g.t}>
            <MSectionLabel>{g.t}</MSectionLabel>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {g.docs.map((d, i) => {
                const pdf = d.n.endsWith('.pdf');
                return (
                  <div key={d.n} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)',
                  }}>
                    <span style={{
                      width: 38, height: 46, borderRadius: 4, flexShrink: 0,
                      background: pdf ? 'var(--brand-burgundy)' : 'var(--brand-orange)', color: '#FFF',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      font: '800 9px/1 var(--font-sans)',
                    }}>{pdf ? 'PDF' : 'IMG'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-title-s" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</div>
                      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{d.s} · {d.d}</div>
                    </div>
                    <button className="btn-icon" aria-label={`More actions for ${d.n}`} style={{ width: 36, height: 36 }}>
                      <Icon name="more_vert" size={16}/>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.7 — Trip Messages / Conversation Thread  ·  Pattern J-adjacent
// §4.4: "Mobile is full-screen." No tab bar — the compose bar owns the bottom, and it is a
// SIBLING of the scroll. Bubbles cap at 78% so a short reply never spans the frame.
// The typing indicator Screen-Inventory §2.2.7 names is NOT drawn: nothing backs it — it
// needs Realtime presence, which is a deliberate deferral recorded in the plan.
// ──────────────────────────────────────────────────────────────────────

function M227_TripThread({ dark = false }) {
  const msgs = [
    { mine: false, t: '11:14a', b: 'Quick win — Sandals just opened the over-water bungalows for your dates. I held one tentatively. Want me to lock it?' },
    { mine: true, t: '11:32a', b: 'Yes please. Sam will lose it — what does the upgrade run us?' },
    { mine: false, t: '11:33a', b: '$680 over the base, and I got a Red Lane spa credit plus a private island day with it. Net win.' },
    { mine: true, t: '11:36a', b: 'Done. Authorize whatever you need.' },
    { mine: false, t: '2:14p', b: 'Locked. I also flagged your card for the final balance of $4,180 — there is an authorization request waiting on your dashboard.' },
  ];
  return (
    <MFrame dark={dark} footer={
      <div style={{ background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)', padding: '8px 0 20px' }}>
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', overflow: 'auto' }}>
          {['Sounds good', 'Add my partner', 'Send a passport', 'Schedule a call'].map((t) => (
            <span key={t} className="chip" style={{ flexShrink: 0, height: 30 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <button className="btn-icon" aria-label="Attach a file" style={{ width: 40, height: 40 }}><Icon name="attach" size={18}/></button>
          <div style={{
            flex: 1, height: 40, display: 'flex', alignItems: 'center', padding: '0 14px',
            borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-bg)',
            font: '400 13.5px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)',
          }}>Reply to Gyasi…</div>
          <button className="btn-icon" aria-label="Send" style={{ width: 40, height: 40, background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>
            <Icon name="send" size={16}/>
          </button>
        </div>
      </div>
    }>
      <MTripTopBar title="" trailing={<button className="btn btn-tonal btn-sm" style={{ marginRight: 4 }}>Open trip</button>}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 12px', marginTop: -46 }}>
        <div style={{ width: 40 }}/>
        <MAdvisorAvatar size={34}/>
        <div style={{ minWidth: 0 }}>
          <div className="t-title-s" style={{ fontSize: 13 }}>Gyasi</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Sandals · Aug 12</div>
        </div>
      </div>

      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <span className="chip" style={{ background: 'var(--md-surface-2)', height: 26 }}>Today</span>
        </div>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', gap: 8 }}>
            {!m.mine && <MAdvisorAvatar size={26} tone="secondary"/>}
            <div style={{ maxWidth: '78%' }}>
              <div style={{
                background: m.mine ? 'var(--md-primary)' : 'var(--md-surface-1)',
                color: m.mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                border: m.mine ? 0 : '1px solid var(--md-outline-variant)',
                borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding: '10px 13px', font: '400 14px/1.45 var(--font-sans)',
              }}>{m.b}</div>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 4, textAlign: m.mine ? 'right' : 'left' }}>{m.t}</div>
            </div>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.8 — Empty Trip Component States  ·  inline within the Itinerary Viewer
// A component sheet, not a route — §4.4 says "identical content across viewports".
// Two copy fixes from the desktop artboard: Gyasi is HE (C228 says "once she hears back"),
// and the operational narration is gone. "Comparing American and JetBlue" asserts something
// no field holds and no agent promised; Screen-Inventory:448's own example is the register
// to hit — say what is true, say who is on it, stop.
// ──────────────────────────────────────────────────────────────────────

function M228_EmptyState({ dark = false }) {
  return (
    <MFrame dark={dark} padded>
      <div className="t-title-s" style={{ marginBottom: 2 }}>Itinerary · Day 1 · Wed Aug 12</div>
      <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 14px' }}>
        Some pieces aren’t booked yet.
      </p>

      <MEmptyCard
        big
        icon="plane"
        title="Your flights aren’t booked yet"
        body="Gyasi is still working on the best departure for you. They’ll appear here the moment they’re confirmed."
        cta="Ask Gyasi where things stand"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        <MEmptyCard
          icon="utensils"
          title="No dining reserved yet"
          body="Gyasi will add your dinner reservations here once he has them."
        />
        <MEmptyCard
          icon="sparkle"
          title="Day 4 is open"
          body="Nothing planned — which is allowed. Tell us if you’d like a tour, or leave it for the pool."
        />
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.9 — Trip Status Change Notification View  ·  Pattern J
// §4.4: "Mobile sheet; tablet/web modal." The desktop artboard draws a full page, which is
// the tablet/web form. This draws what mobile actually gets: a full-height bottom sheet over
// the dimmed dashboard the push notification landed on, with a grabber to say it dismisses.
// ──────────────────────────────────────────────────────────────────────

function M229_StatusChange({ dark = false }) {
  return (
    <MFrame dark={dark} scrollable={false} footer={<MClientTabs active="trips"/>}>
      {/* The dashboard, dimmed, behind the sheet */}
      <div style={{ padding: '14px 16px', opacity: 0.55 }}>
        <div className="t-label-s" style={{ color: 'var(--md-secondary)' }}>WELCOME BACK</div>
        <h1 className="t-headline" style={{ margin: '6px 0 12px' }}>Hey Jordan.</h1>
        <div style={{ height: 190, borderRadius: 22, background: 'var(--md-surface-3)' }}/>
      </div>

      <MSheet height="78%">
        <span style={{
          width: 54, height: 54, borderRadius: 999, alignSelf: 'flex-start', flexShrink: 0,
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkle" size={26}/>
        </span>
        <div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 12 }}>STATUS UPDATED · 2 MIN AGO</div>
        <h1 className="t-title-l" style={{ margin: '4px 0 6px' }}>Your proposal is ready</h1>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
          “Family week — Negril” moved from Inquiry to Proposal Ready. Gyasi put together a
          seven-night package for the four of you.
        </p>

        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div className="t-title-s">What changed</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6, lineHeight: 1.6 }}>
            Couples Swept Away · Negril · Dec 22–29<br/>
            $9,120 total, with Gyasi’s notes attached<br/>
            Two room types to choose between
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 10 }}>
          <div className="t-title-s">What’s next</div>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 13.5px/1.6 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
            <li>Have a read, no rush</li>
            <li>Reply with what you think, or pick a room</li>
            <li>Authorize a card and Gyasi locks it in</li>
          </ol>
        </div>

        <button className="btn btn-filled" style={{ width: '100%', marginTop: 16 }}>
          View the proposal <Icon name="arrow_right" size={13}/>
        </button>
      </MSheet>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.10 — Trip Cancellation View  ·  Pattern C variant
// The cancellation summary is the whole screen; actions stack full-width beneath it.
// "Refund method · Original VISA •••• 4242" is dropped — card metadata lives on
// payment_card and belongs to §2.4. Data-Model §21 moved cancellation_reason and
// refund_status to client-visible precisely so this screen could exist, and those two are
// what it shows.
// The "Ready to plan again?" card is rewritten, not just repointed. The desktop copy pushes
// ("Gyasi has 3 options for fall" — a claim nothing backs) at someone whose trip just fell
// through. Tone check 3 in Design-System §2.6 asks whether copy leaves room for rest.
// ──────────────────────────────────────────────────────────────────────

function M2210_Cancelled({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MTripTopBar over onBackLabel="Back to my trips"/>
      <MHeroPhoto img="cruiseShip" height={180} grayscale>
        <span className="chip-status past" style={{ background: '#D7DFE6', color: '#3D352E' }}>Cancelled</span>
        <h1 className="t-title-l" style={{ margin: '8px 0 2px', color: '#FFF' }}>Carnival Mardi Gras</h1>
        <div style={{ font: '500 12.5px/1.35 var(--font-sans)', opacity: 0.88 }}>Mar 15 – 22, 2026 · cancelled Feb 2, 2026</div>
      </MHeroPhoto>

      <div style={{ padding: '14px 16px 22px' }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-title-s" style={{ marginBottom: 10 }}>Cancellation summary</div>
          <MKeyGrid rows={[
            { l: 'Reason', v: 'Family schedule conflict', wide: true },
            { l: 'Cancelled on', v: 'Feb 2, 2026' },
            { l: 'Cancellation fee', v: '$120 (per Carnival)' },
            { l: 'Refund', v: '$1,640 · processed Feb 12', wide: true },
            { l: 'Future-trip credit', v: '$240 · good through Dec 2027', wide: true },
          ]}/>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          <button className="btn btn-tonal" style={{ width: '100%' }}><Icon name="passport" size={14}/> View the archived itinerary</button>
          <button className="btn btn-outlined" style={{ width: '100%' }}><Icon name="message" size={14}/> Message Gyasi</button>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
          <div className="t-title-s">When you’re ready</div>
          <p className="t-body-s" style={{ opacity: 0.88, margin: '5px 0 0' }}>
            Your $240 credit holds until December 2027. There’s no hurry — tell Gyasi when the
            timing feels right and he’ll pick it up from here.
          </p>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.2.11 — Past Trip / Memory View  ·  Pattern I + gallery
// The note from Gyasi LEADS on mobile. On the desktop artboard it sits in the right rail,
// but this screen exists for the feeling and a phone shows one column — so the emotional
// beat goes first and the logistics settle underneath.
// §4.4: "Photo grid is 1-col on mobile", so the photos are full-width and stacked.
// The testimonial card stays, and its prompt uses the gratitude framing Design-System §2.4
// names for this screen. "Book a similar trip" repoints at the thread — §2.3 is Phase 2.
// ──────────────────────────────────────────────────────────────────────

function M2211_PastTrip({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MTripTopBar over onBackLabel="Back to my trips"/>
      <MHeroPhoto img="turks" height={230}>
        <span className="chip-status past">Past trip</span>
        <h1 className="t-title-l" style={{ margin: '8px 0 2px', color: '#FFF' }}>Beaches Turks &amp; Caicos</h1>
        <div style={{ font: '500 12.5px/1.35 var(--font-sans)', opacity: 0.9 }}>Jan 6 – 13, 2024 · the Hayes family · 4 travelers</div>
      </MHeroPhoto>

      <div style={{ padding: '14px 16px 22px' }}>
        <div className="card" style={{ padding: 18, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -24, right: -24, width: 104, height: 104, borderRadius: 999, background: 'rgba(255,255,255,0.16)' }}/>
          <div style={{ position: 'relative' }}>
            <div className="t-label-s" style={{ opacity: 0.75 }}>A NOTE FROM GYASI</div>
            <div className="t-script" style={{ fontSize: 27, lineHeight: 1.15, marginTop: 5 }}>You took the rest. That matters.</div>
            <p className="t-body-s" style={{ margin: '8px 0 0', opacity: 0.88 }}>
              Seven nights of reef, family and salt air. Thank you for letting me hold the
              details. Welcome home.
            </p>
          </div>
        </div>

        <MSectionLabel action="Add photos">Your photos · 12</MSectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['turks', 'snorkel', 'sunset'].map((k) => (
            <div key={k} style={{ borderRadius: 16, overflow: 'hidden', height: 200 }}>
              <img src={staImg(k, 800, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
          ))}
          <button className="btn btn-outlined" style={{ width: '100%', height: 52, borderStyle: 'dashed' }}>
            <Icon name="upload" size={15}/> Add your photos
          </button>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <div className="t-title-s">What did you carry home from this trip?</div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '5px 0 0' }}>
            Whatever you write comes to Gyasi first. Nothing is published unless you say so.
          </p>
          <button className="btn btn-tonal" style={{ width: '100%', marginTop: 10 }}>Write a reflection</button>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>TRIP SNAPSHOT</div>
          <div style={{ marginTop: 8, font: '500 13px/1.7 var(--font-sans)' }}>
            7 nights · 4 travelers<br/>
            $6,920 all-in<br/>
            Bight Reef snorkelling, and the Sesame Street breakfast
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 12, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
          <div className="t-title-s">Somewhere like this again?</div>
          <p className="t-body-s" style={{ opacity: 0.88, margin: '5px 0 0' }}>
            Gyasi still has your notes from this one. Tell him roughly when, and he’ll start looking.
          </p>
          <button className="btn btn-filled" style={{ width: '100%', marginTop: 10, background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>
            <Icon name="message" size={14}/> Message Gyasi
          </button>
        </div>
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  M221_Dashboard, M222_AllTrips, M223_TripDetail, M224_ItineraryViewer, M225_DayDetail,
  M226_TripDocuments, M227_TripThread, M228_EmptyState, M229_StatusChange, M2210_Cancelled,
  M2211_PastTrip,
});
