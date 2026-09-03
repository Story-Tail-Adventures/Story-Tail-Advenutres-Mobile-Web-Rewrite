/* global React, Icon, StoryTailMark, staImg, ScreenFrame, ScreenHeader */
// Client · 2.2 Dashboard & Trip Experience — 11 screens.

// 2.2.1 — Client Dashboard / Home
function C221_Dashboard() {
  return (
    <ScreenFrame role="client" tab="home" scrollable padding={24}>
      <ScreenHeader
        overline="WELCOME BACK · YOUR REST IS COMING"
        title="Hey Jordan — 90 days until you can finally breathe out. ✈"
        subtitle="One card to authorize for final balance, one new idea from Gyasi. The hard part is almost done."
        actions={<><button className="btn btn-tonal btn-sm"><Icon name="search" size={14}/> New idea</button><button className="btn btn-filled btn-sm"><Icon name="message" size={14}/> Message Gyasi</button></>}
      />

      {/* Hero countdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.1fr 1fr', gap: 14 }}>
        <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', minHeight: 260, color: '#FFF', boxShadow: 'var(--md-shadow-3)' }}>
          <img src={staImg('overwater', 1400, 500)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.8), rgba(13,33,55,0.65))' }}/>
          <div style={{ position: 'relative', padding: 20, height: 260, display: 'flex', flexDirection: 'column' }}>
            <span className="chip-status booked">Booked · Honeymoon</span>
            <h2 className="t-display-s" style={{ margin: '10px 0 4px', color: '#FFF' }}>Sandals Royal Bahamian</h2>
            <div style={{ font: '500 13px/1.3 var(--font-sans)', opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · Nassau</div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              {[{ v: 90, l: 'DAYS' }, { v: 14, l: 'HR' }, { v: 32, l: 'MIN' }].map((c) => (
                <div key={c.l} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '8px 14px', minWidth: 64, textAlign: 'center', backdropFilter: 'blur(8px)' }}>
                  <div style={{ font: '800 22px/1 var(--font-sans)' }}>{c.v}</div>
                  <div style={{ font: '600 9px/1 var(--font-sans)', letterSpacing: 1.2, opacity: 0.85, marginTop: 3 }}>{c.l}</div>
                </div>
              ))}
              <button className="btn btn-orange btn-sm" style={{ marginLeft: 'auto' }}>View itinerary <Icon name="arrow_right" size={12}/></button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card" style={{ padding: 14, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', border: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="card" size={16}/><span className="t-label-s">ACTION NEEDED · 14 DAYS</span></div>
            <div className="t-title-s" style={{ marginTop: 6 }}>Authorize a card for final balance</div>
            <div className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>$4,180 due to Sandals on May 28.</div>
            <button className="btn btn-filled btn-sm" style={{ width: '100%', marginTop: 10, background: 'var(--md-on-error-container)', color: 'var(--md-error-container)' }}>Authorize a card →</button>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={staImg('avatarA', 48, 48)} alt="" style={{ width: 28, height: 28, borderRadius: 999 }}/>
              <div className="t-title-s" style={{ fontSize: 13 }}>Gyasi · Advisor</div>
              <span className="dot" style={{ background: 'var(--md-success)', marginLeft: 'auto' }}/>
            </div>
            <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>"Locked your bungalow upgrade — peek at day 3."</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--md-outline-variant)', gap: 4 }}>
          {['In planning · 1', 'Past trips · 5', 'Saved searches · 3'].map((t, i) => (
            <button key={t} style={{
              padding: '10px 14px', border: 0, background: 'transparent', cursor: 'pointer',
              font: '600 13px/1 var(--font-sans)',
              color: i === 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
              borderBottom: i === 0 ? '3px solid var(--brand-orange)' : '3px solid transparent', marginBottom: -1,
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 14 }}>
          {[
            { t: 'Family week — Negril', s: 'Dec 22 – 29 · 4 travelers', i: 'jamaica', tag: 'proposal', tagL: 'Proposal ready' },
            { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025', i: 'cruiseShip', tag: 'past', tagL: 'Past' },
            { t: 'Beaches Turks & Caicos', s: 'Jan 6 – 13, 2024', i: 'turks', tag: 'past', tagL: 'Past' },
          ].map((c, i) => (
            <div key={i} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: 120 }}>
                <img src={staImg(c.i, 480, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span className={`chip-status ${c.tag}`} style={{ position: 'absolute', top: 10, left: 10 }}>{c.tagL}</span>
              </div>
              <div style={{ padding: 12 }}>
                <div className="t-title-s">{c.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.2.2 — All Trips List
function C222_AllTrips() {
  const trips = [
    { t: 'Sandals Royal Bahamian', s: 'Aug 12 – 19, 2026 · Honeymoon', tag: 'booked', tagL: 'Booked', i: 'overwater', val: 6480 },
    { t: 'Family week — Negril', s: 'Dec 22 – 29, 2026 · 4 travelers', tag: 'proposal', tagL: 'Proposal ready', i: 'jamaica', val: 9120 },
    { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025 · Cruise', tag: 'past', tagL: 'Past', i: 'cruiseShip', val: 5240 },
    { t: 'Beaches Turks & Caicos', s: 'Jan 6 – 13, 2024 · Family', tag: 'past', tagL: 'Past', i: 'turks', val: 6920 },
    { t: 'Atlantis Paradise', s: 'Nov 18 – 22, 2023 · Weekend', tag: 'past', tagL: 'Past', i: 'bahamas', val: 3180 },
  ];
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ padding: '20px 28px 0' }}>
        <ScreenHeader title="My trips" subtitle="Everything Story-Tail has built for you — past, present, and in motion." small/>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['All · 5', 'Upcoming · 1', 'In Planning · 1', 'Past · 3', 'Cancelled · 0'].map((t, i) => (
            <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 30, borderRadius: 999, background: 'var(--md-surface-3)', font: '500 12px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}><Icon name="search" size={12}/> Search trips</div>
            <span className="chip">Sort · Date ▾</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 28px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((t, i) => (
          <div key={i} className="card" style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', padding: 0 }}>
            <img src={staImg(t.i, 400, 220)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            <div style={{ padding: 16 }}>
              <span className={`chip-status ${t.tag}`}>{t.tagL}</span>
              <div className="t-title-l" style={{ margin: '6px 0 2px' }}>{t.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.s}</div>
            </div>
            <div style={{ padding: 16, borderLeft: '1px solid var(--md-outline-variant)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 160 }}>
              <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>TRIP VALUE</div>
              <div className="t-title-l" style={{ margin: '2px 0' }}>${t.val.toLocaleString()}</div>
              <button className="btn btn-tonal btn-sm" style={{ marginTop: 'auto' }}>Open</button>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.2.3 — Trip Detail / Overview
function C223_TripDetail() {
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <img src={staImg('overwater', 1600, 480)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(13,33,55,0.75))' }}/>
        <div style={{ position: 'absolute', left: 28, right: 28, bottom: 18, color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span className="chip-status booked">Booked</span>
            <h1 className="t-display-s" style={{ margin: '8px 0 2px', color: '#FFF' }}>Sandals Royal Bahamian</h1>
            <div style={{ font: '500 13px/1.3 var(--font-sans)', opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · Nassau · 90 days to go</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-orange">Authorize card</button>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.18)', color: '#FFF', backdropFilter: 'blur(6px)' }}><Icon name="download" size={14}/> PDF</button>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', overflow: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { i: 'plane', l: 'Itinerary', s: 'Day-by-day', tone: 'primary' },
              { i: 'card', l: 'Payments', s: '$4,180 due May 28', tone: 'error' },
              { i: 'passport', l: 'Documents', s: '5 files', tone: 'secondary' },
              { i: 'message', l: 'Messages', s: '2 unread', tone: 'tertiary' },
            ].map((s) => (
              <div key={s.l} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: `var(--md-${s.tone}-container)`, color: `var(--md-on-${s.tone}-container)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={s.i} size={16}/>
                </span>
                <div>
                  <div className="t-title-s">{s.l}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="t-title-l">At a glance</div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {[
                { l: 'Trip type', v: 'Honeymoon · 7 nights' },
                { l: 'Destination', v: 'Nassau, Bahamas' },
                { l: 'Travelers', v: 'Jordan + Sam Hayes' },
                { l: 'Total value', v: '$6,480 all-in' },
                { l: 'Card on file', v: 'VISA •••• 4242' },
                { l: 'Status', v: 'Booked · final balance pending' },
              ].map((kv) => (
                <div key={kv.l}>
                  <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</div>
                  <div className="t-body" style={{ marginTop: 2 }}>{kv.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="t-title-l">Notes from Gyasi</div>
            <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>
              "I added a Red Lane spa credit and locked in your bungalow upgrade for Day 3. Sandals will invoice me on May 28 — your card is set to cover up to $4,598 of the final balance."
            </p>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>YOUR ADVISOR</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 40, height: 40, borderRadius: 999 }}/>
              <div style={{ flex: 1 }}>
                <div className="t-title-s">Gyasi Story</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Online · reply in &lt; 2h</div>
              </div>
              <span className="dot" style={{ background: 'var(--md-success)' }}/>
            </div>
            <button className="btn btn-tonal btn-sm" style={{ width: '100%', marginTop: 10 }}><Icon name="message" size={14}/> Message</button>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PAYMENT TIMELINE</div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, font: '500 12px/1.3 var(--font-sans)' }}><span className="dot" style={{ background: 'var(--md-success)' }}/> Deposit · paid $800</div>
              <div style={{ display: 'flex', gap: 8, font: '500 12px/1.3 var(--font-sans)' }}><span className="dot" style={{ background: 'var(--md-success)' }}/> Mid · paid $1,500</div>
              <div style={{ display: 'flex', gap: 8, font: '500 12px/1.3 var(--font-sans)', color: 'var(--md-error)' }}><span className="dot" style={{ background: 'var(--md-error)' }}/> Final · $4,180 due May 28</div>
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.2.4 — Itinerary Viewer (Day-by-Day)
function C224_ItineraryViewer() {
  const blocks = [
    { time: '06:40', period: 'MORNING', kind: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Direct · 2h 50m · Seats 14A 14B', c: 'PNR TLR8QV' },
    { time: '11:20', period: 'AFTERNOON', kind: 'trip', t: 'Private transfer · Mercedes Vito', s: 'Sun & Fun Tours · 25 min' },
    { time: '13:00', period: 'AFTERNOON', kind: 'building', t: 'Check-in · Sandals Royal Bahamian', s: 'Honeymoon Beachfront Walkout · Bldg 3', c: 'SRB-220119' },
    { time: '19:30', period: 'EVENING', kind: 'utensils', t: 'Welcome dinner · Bayside', s: '4 courses · Reserved 7:30 PM' },
  ];
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
        <img src={staImg('overwater', 1600, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(13,33,55,0.7))' }}/>
        <div style={{ position: 'absolute', left: 28, right: 28, bottom: 16, color: '#FFF' }}>
          <span className="chip-status booked">Booked · 7 nights</span>
          <h1 className="t-headline" style={{ margin: '6px 0 2px', color: '#FFF' }}>Sandals Royal Bahamian · Itinerary</h1>
          <div style={{ font: '500 12px/1.3 var(--font-sans)', opacity: 0.9 }}>Aug 12 – Aug 19, 2026 · Jordan + Sam</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '18px 28px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 18, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflow: 'auto' }}>
            {['Day 1 · Wed','Day 2 · Thu','Day 3 · Fri','Day 4 · Sat','Day 5 · Sun','Day 6 · Mon','Day 7 · Tue'].map((t, i) => (
              <span key={t} className="chip" style={{
                background: i === 0 ? 'var(--md-primary)' : 'var(--md-surface-2)',
                color: i === 0 ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                height: 32, border: 0, font: '600 12.5px/1 var(--font-sans)',
              }}>{t}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 32 }}>Day 01</div>
            <div className="t-title-l">Miami → Nassau</div>
          </div>
          {blocks.map((b, i) => (
            <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ minWidth: 60 }}>
                <div style={{ font: '700 14px/1 var(--font-sans)' }}>{b.time}</div>
                <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{b.period}</div>
              </div>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={b.kind} size={18}/>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s">{b.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{b.s}</div>
              </div>
              {b.c && <span className="kbd">{b.c}</span>}
            </div>
          ))}
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-tonal" style={{ width: '100%' }}><Icon name="download" size={14}/> Download PDF</button>
          <button className="btn btn-outlined" style={{ width: '100%' }}><Icon name="share" size={14}/> Share with co-traveler</button>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>IMPORTANT INFO</div>
            {['Insurance · Allianz #98-7124', 'Emergency · +1 (242) 555-3300', 'Packing list (Gyasi\'s)', 'Visa · not required'].map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--md-outline-variant)', font: '500 12.5px/1.3 var(--font-sans)' }}>
                <Icon name="info" size={13} color="var(--md-on-surface-variant)"/>
                {s}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.2.5 — Itinerary Day Detail
function C225_DayDetail() {
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ padding: '16px 28px 8px', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <button className="btn btn-text btn-sm" style={{ padding: 0 }}><Icon name="arrow_left" size={14}/> Back to itinerary</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 36 }}>Day 03</div>
          <div>
            <h1 className="t-headline" style={{ margin: 0 }}>Cay day-trip</h1>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Fri Aug 14, 2026 · Snorkel + private island lunch</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { i: 'sparkle', time: '09:00 – 15:00', t: 'Catamaran to Rose Island Cay', s: 'Snorkel gear + lunch included · 6 hours · for 2', address: 'Rose Island Marina, Nassau' },
            { i: 'heart', time: '17:30 – 18:15', t: 'Beach yoga (optional)', s: '45 min · Pavilion · towels provided' },
            { i: 'utensils', time: '20:30', t: 'Hibachi night — Kimonos', s: 'Party of 2 · 8:30 PM · dress code: evening resort', address: 'Inside resort, Building 1' },
          ].map((b) => (
            <div key={b.t} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={b.i} size={18}/>
                </span>
                <div style={{ flex: 1 }}>
                  <div className="t-title-s">{b.t}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{b.s}</div>
                </div>
                <span className="kbd">{b.time}</span>
              </div>
              {b.address && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', gap: 8, font: '500 12px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
                  <Icon name="pin" size={13}/> {b.address}
                  <button className="btn btn-text btn-sm" style={{ marginLeft: 'auto', padding: 0 }}>Open in Maps →</button>
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <button className="btn btn-tonal btn-sm" style={{ height: 28 }}><Icon name="phone" size={12}/> Call supplier</button>
                <button className="btn btn-outlined btn-sm" style={{ height: 28 }}>Mark as done</button>
              </div>
            </div>
          ))}
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>WEATHER · NASSAU</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <Icon name="sun" size={32} color="var(--brand-sunset)" fill="var(--brand-sunset)"/>
              <div>
                <div className="t-display-s" style={{ margin: 0 }}>87°F</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Mostly sunny · UV high · 8mph SE</div>
              </div>
            </div>
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', font: '500 12px/1.3 var(--font-sans)' }}>
              ☀ UV index 9 · Pack reef-safe sunscreen
            </div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OFFLINE-READY</div>
            <div className="t-title-s" style={{ marginTop: 4 }}>Synced 2h ago</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Available on plane / no signal.</div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.2.6 — Trip Document Library
function C226_TripDocuments() {
  const groups = [
    { t: 'Supplier confirmations', docs: [{ n: 'sandals-confirmation.pdf', s: '320 KB · Gyasi', d: 'Mar 14' }, { n: 'flight-aa1413-boarding.pdf', s: '180 KB · Gyasi', d: 'Apr 02' }] },
    { t: 'Passports & visas', docs: [{ n: 'passport-jordan.jpg', s: '1.1 MB · You', d: 'Mar 20' }, { n: 'passport-sam.jpg', s: '1.4 MB · You', d: 'Mar 20' }] },
    { t: 'Insurance', docs: [{ n: 'allianz-policy-987124.pdf', s: '620 KB · Gyasi', d: 'Mar 28' }] },
  ];
  return (
    <ScreenFrame role="client" tab="docs" padding={28} scrollable>
      <ScreenHeader title="Documents · Sandals · Aug 2026" subtitle="Everything for this trip, all in one place. Auto-encrypted, share via secure link." actions={<><button className="btn btn-outlined btn-sm"><Icon name="grid" size={14}/> Grid</button><button className="btn btn-orange btn-sm"><Icon name="upload" size={14}/> Upload</button></>} small/>
      {groups.map((g) => (
        <div key={g.t} style={{ marginBottom: 18 }}>
          <div className="t-title-s" style={{ marginBottom: 8 }}>{g.t}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {g.docs.map((d) => (
              <div key={d.n} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 38, height: 46, borderRadius: 4, background: d.n.endsWith('.pdf') ? 'var(--brand-burgundy)' : 'var(--brand-orange)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px/1 var(--font-sans)', flexShrink: 0 }}>
                  {d.n.endsWith('.pdf') ? 'PDF' : 'IMG'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5 }}>{d.n}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{d.s} · {d.d}</div>
                </div>
                <button className="btn-icon"><Icon name="more_vert" size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </ScreenFrame>
  );
}

// 2.2.7 — Trip Messages / Conversation Thread (per trip)
function C227_TripThread() {
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-icon"><Icon name="arrow_left" size={18}/></button>
        <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
        <div style={{ flex: 1 }}>
          <div className="t-title-s">Gyasi · Sandals · Aug 12</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Trip thread · last reply 2h ago</div>
        </div>
        <button className="btn btn-tonal btn-sm">Open trip</button>
      </div>
      <div style={{ flex: 1, padding: '18px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center' }}><span className="chip" style={{ background: 'var(--md-surface-2)' }}>Today</span></div>
        {[
          { who: 'Gyasi', mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates. I held one tentatively. Want me to lock?' },
          { who: 'You', mine: true, t: '11:32a', b: "Yes please. Sam will lose it 😍 — what's the upgrade run us?" },
          { who: 'Gyasi', mine: false, t: '11:33a', b: '$680 over the base, but I got a Red Lane spa credit + a private island day. Net win.' },
          { who: 'You', mine: true, t: '11:36a', b: 'Done. Authorize whatever you need on the VISA.' },
          { who: 'Gyasi', mine: false, t: '2:14p', b: "Locked. I also flagged your card for the final balance ($4,180) — there's a payment authorization request in your dashboard." },
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', gap: 8 }}>
            {!m.mine && <img src={staImg('avatarA', 48, 48)} alt="" style={{ width: 28, height: 28, borderRadius: 999, alignSelf: 'flex-end' }}/>}
            <div style={{ maxWidth: '70%' }}>
              <div style={{ background: m.mine ? 'var(--md-primary)' : 'var(--md-surface-1)', color: m.mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                            padding: '10px 14px', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            border: m.mine ? 0 : '1px solid var(--md-outline-variant)', font: '400 13.5px/1.45 var(--font-sans)' }}>{m.b}</div>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 3, textAlign: m.mine ? 'right' : 'left' }}>{m.t}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--md-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
          <Icon name="attach" size={16}/>
          <span style={{ flex: 1, color: 'var(--md-on-surface-variant)', font: '400 13px/1 var(--font-sans)' }}>Reply to Gyasi…</span>
          <button className="btn btn-filled btn-sm"><Icon name="send" size={12}/> Send</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {['👍 Sounds good', 'Add my partner', 'Send passport', 'Schedule a call'].map((t) => <span key={t} className="chip" style={{ height: 26 }}>{t}</span>)}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.2.8 — Empty Trip Component States
function C228_EmptyState() {
  return (
    <ScreenFrame role="client" tab="home" padding={28}>
      <ScreenHeader title="Itinerary · Day 1 · Wed Aug 12" subtitle="Some pieces aren't booked yet — friendly empty states keep things clear." small/>
      <div className="card" style={{ padding: 24, textAlign: 'center', border: '1.5px dashed var(--md-outline-variant)', background: 'var(--md-surface-2)' }}>
        <span style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Icon name="plane" size={28}/>
        </span>
        <div className="t-title-l">Your flights aren't booked yet</div>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', maxWidth: 460, margin: '6px auto 16px' }}>Gyasi is comparing American and JetBlue for the best Saturday departure window. We'll add flights here once confirmed.</p>
        <button className="btn btn-tonal"><Icon name="message" size={14}/> Ask Gyasi where things stand</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        {[
          { i: 'utensils', t: 'No dining reserved yet', s: 'Gyasi will book Bayside Friday once she hears back from concierge.' },
          { i: 'sparkle', t: 'Day 4 — Open day', s: 'Nothing planned. Tell us if you\'d like a tour or some pool time and we\'ll add it.' },
        ].map((c) => (
          <div key={c.t} className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start', border: '1.5px dashed var(--md-outline-variant)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={c.i} size={16}/>
            </span>
            <div>
              <div className="t-title-s">{c.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{c.s}</div>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.2.9 — Trip Status Change Notification View
function C229_StatusChange() {
  return (
    <ScreenFrame role="client" tab="home" padding={28}>
      <div className="card" style={{ padding: 22, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 18, alignItems: 'center' }}>
        <span style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--md-on-secondary-container)', color: 'var(--md-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkle" size={28}/>
        </span>
        <div style={{ flex: 1 }}>
          <span className="t-label-s">STATUS UPDATED · 2 MIN AGO</span>
          <div className="t-headline" style={{ margin: '4px 0 2px' }}>Proposal Ready</div>
          <div className="t-body">"Family week — Negril" moved from <i>Inquiry</i> to <i>Proposal Ready</i>. Gyasi sent you a curated 7-night package.</div>
        </div>
        <button className="btn btn-filled" style={{ background: 'var(--md-on-secondary-container)', color: 'var(--md-secondary-container)' }}>View proposal →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">What changed</div>
          <div className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>
            • New proposal: Couples Swept Away · Negril · Dec 22–29<br/>
            • $9,120 total · Gyasi's notes attached<br/>
            • Two room-type options to choose from
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">What's next</div>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 13.5px/1.5 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
            <li>Review the proposal</li>
            <li>Reply with feedback or pick a room</li>
            <li>Authorize a card so we can lock it in</li>
          </ol>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.2.10 — Trip Cancellation View
function C2210_Cancelled() {
  return (
    <ScreenFrame role="client" tab="home" padding={0}>
      <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
        <img src={staImg('cruiseShip', 1600, 320)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.55) brightness(0.6)' }}/>
        <div style={{ position: 'absolute', inset: 0, padding: '24px 28px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <span className="chip-status past" style={{ background: '#D7DFE6', color: '#3D352E', alignSelf: 'flex-start' }}>Cancelled</span>
          <h1 className="t-headline" style={{ margin: '6px 0 2px', color: '#FFF' }}>Carnival Mardi Gras · Spring break 2026</h1>
          <div style={{ font: '500 12.5px/1.3 var(--font-sans)', opacity: 0.85 }}>Mar 15 – 22, 2026 · 4 travelers · Cancelled Feb 02, 2026</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '20px 28px', overflow: 'auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-l">Cancellation summary</div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { l: 'Reason', v: 'Family schedule conflict' },
              { l: 'Cancelled on', v: 'Feb 02, 2026' },
              { l: 'Cancellation fee', v: '$120 (per Carnival)' },
              { l: 'Refund', v: '$1,640 · processed Feb 12' },
              { l: 'Refund method', v: 'Original VISA •••• 4242' },
              { l: 'Future-trip credit', v: '$240 · use by Dec 2027' },
            ].map((kv) => (
              <div key={kv.l}><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</div><div className="t-body" style={{ marginTop: 2 }}>{kv.v}</div></div>
            ))}
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn btn-tonal" style={{ width: '100%' }}><Icon name="passport" size={14}/> View archived itinerary</button>
          <button className="btn btn-outlined" style={{ width: '100%' }}><Icon name="message" size={14}/> Message Gyasi</button>
          <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
            <div className="t-title-s">Ready to plan again?</div>
            <p className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>Apply your $240 credit toward a future cruise — Gyasi has 3 options for fall.</p>
            <button className="btn btn-filled btn-sm" style={{ marginTop: 10, background: 'var(--md-on-secondary-container)', color: 'var(--md-secondary-container)' }}>Book a similar trip →</button>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.2.11 — Past Trip Memory View
function C2211_PastTrip() {
  return (
    <ScreenFrame role="client" tab="home" padding={0} scrollable>
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <img src={staImg('turks', 1600, 480)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.7))' }}/>
        <div style={{ position: 'absolute', left: 28, right: 28, bottom: 18, color: '#FFF' }}>
          <span className="chip-status past">Past · Loved by you</span>
          <h1 className="t-display-s" style={{ margin: '6px 0 0', color: '#FFF' }}>Beaches Turks &amp; Caicos</h1>
          <div style={{ font: '500 13px/1.3 var(--font-sans)', opacity: 0.9 }}>Jan 6 – 13, 2024 · The Hayes family · 4 travelers</div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div>
          <div className="t-title-l">Your photos · 12</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
            {['turks','bahamas','aruba','snorkel','overwater','resortPool','sunset','honeymoon'].map((k, i) => (
              <div key={i} style={{ aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden' }}>
                <img src={staImg(k, 240, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              </div>
            ))}
            <div style={{ aspectRatio: '1/1', borderRadius: 12, background: 'var(--md-surface-2)', border: '1.5px dashed var(--md-outline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-on-surface-variant)', flexDirection: 'column', gap: 4 }}>
              <Icon name="upload" size={18}/>
              <div className="t-body-s">Add more</div>
            </div>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: 999, background: 'rgba(255,255,255,0.18)' }}/>
            <div style={{ position: 'relative' }}>
              <div className="t-label-s" style={{ opacity: 0.75 }}>A NOTE FROM GYASI</div>
              <div className="t-script" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 4 }}>You took the rest. That matters.</div>
              <p className="t-body-s" style={{ margin: '6px 0 0', opacity: 0.85 }}>Seven nights of "very good" — reef, family, salt air. Thank you for letting us hold the details. Welcome home. 🌴</p>
            </div>
          </div>
          <div className="card" style={{ padding: 16, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
            <div className="t-title-s">Book a similar trip</div>
            <p className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>Gyasi pulled 6 family-friendly all-inclusives for Jan 2027 with your past preferences.</p>
            <button className="btn btn-filled btn-sm" style={{ marginTop: 10, background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>Browse picks →</button>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-title-s">Leave a testimonial</div>
            <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Helps Gyasi (and other travelers).</p>
            <button className="btn btn-tonal btn-sm" style={{ marginTop: 8, width: '100%' }}>Write a review</button>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>TRIP SNAPSHOT</div>
            <div style={{ marginTop: 6, font: '500 12.5px/1.6 var(--font-sans)', color: 'var(--md-on-surface)' }}>
              7 nights · 4 travelers<br/>
              $6,920 all-in<br/>
              Highlights: Sesame Street experience, snorkel at Bight Reef
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C221_Dashboard, C222_AllTrips, C223_TripDetail, C224_ItineraryViewer, C225_DayDetail,
  C226_TripDocuments, C227_TripThread, C228_EmptyState, C229_StatusChange, C2210_Cancelled, C2211_PastTrip,
});
