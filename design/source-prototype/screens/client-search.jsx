/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Client · 2.3 Self-Guided Search — 10 screens.

// 2.3.1 — Search Landing / Inspiration Hub
function C231_SearchLanding() {
  return (
    <ScreenFrame role="client" tab="search" padding={0} scrollable>
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <img src={staImg('bahamas', 1600, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.55), rgba(13,33,55,0.45))' }}/>
        <div style={{ position: 'absolute', inset: 0, padding: '28px 32px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="t-label-s" style={{ color: '#FFC83F' }}>DISCOVER</span>
          <h1 className="t-display-s" style={{ margin: '4px 0 10px', color: '#FFF' }}>Where to next, Jordan?</h1>
          <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, borderRadius: 999, maxWidth: 760, boxShadow: 'var(--md-shadow-2)' }}>
            {[{ l: 'Destination', v: 'Caribbean', i: 'map' }, { l: 'Dates', v: 'Aug 12 – 19', i: 'calendar' }, { l: 'Travelers', v: '2 adults', i: 'user' }].map((f, i) => (
              <div key={f.l} style={{ flex: 1, padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--md-outline-variant)' : 0 }}>
                <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{f.l}</div>
                <div style={{ font: '600 13px/1.2 var(--font-sans)', marginTop: 2, color: 'var(--md-on-surface)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={f.i} size={13} color="var(--brand-orange)"/> {f.v}</div>
              </div>
            ))}
            <button className="btn btn-filled" style={{ height: 44, margin: 4 }}><Icon name="search" size={16}/> Search</button>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px 28px' }}>
        <div className="t-title-l">Curated for you</div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 14px' }}>Based on your saved Caribbean searches and past trips.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {[{ t: 'Caribbean escapes', i: 'turks' }, { t: 'Family cruises', i: 'cruiseShip' }, { t: 'All-inclusive', i: 'resortPool' }, { t: 'Honeymoons', i: 'honeymoon' }, { t: 'Adventure', i: 'snorkel' }, { t: 'Hot deals 🔥', i: 'aruba' }].map((s) => (
            <div key={s.t} className="card" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '3/4' }}>
              <img src={staImg(s.i, 320, 440)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7))' }}/>
              <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: '#FFF', font: '700 13px/1.2 var(--font-sans)' }}>{s.t}</div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.3.2 — Search Form
function C232_SearchForm() {
  return (
    <ScreenFrame role="client" tab="search" padding={28} scrollable>
      <ScreenHeader title="Plan a search" subtitle="Tell us what you're picturing — Gyasi sees results too and curates picks." small/>
      <div className="card" style={{ padding: 22, maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="field-label">Destination · multi-select</label>
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--md-outline)', background: 'var(--md-surface-1)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 44 }}>
              {['Bahamas', 'Turks & Caicos', 'Jamaica'].map((d) => <span key={d} className="chip chip-filter is-on" style={{ height: 26 }}>{d} ×</span>)}
              <span style={{ color: 'var(--md-on-surface-variant)', font: '400 13px/1 var(--font-sans)' }}>+ add another…</span>
            </div>
          </div>
          <div><label className="field-label">Trip type</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['All-inclusive ✓','Cruise','Tour','Custom'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}</div></div>
          <div><label className="field-label">Flex dates</label><label style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 13px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}><span style={{ width: 36, height: 22, borderRadius: 999, background: 'var(--md-primary)', padding: 2, position: 'relative' }}><span style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 999, background: '#FFF' }}/></span>±3 days</label></div>
          <div><label className="field-label">Departure date</label><input className="input" defaultValue="Aug 12, 2026"/></div>
          <div><label className="field-label">Return date</label><input className="input" defaultValue="Aug 19, 2026"/></div>
          <div><label className="field-label">Adults</label><input className="input" defaultValue="2"/></div>
          <div><label className="field-label">Children (with ages)</label><input className="input" defaultValue="None"/></div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="field-label">Vibe · pick any</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Adults-only ✓','Family-friendly','Honeymoon ✓','Spa','Foodie','Adventure','5★','Beachfront ✓'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-text">Clear</button>
          <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}><Icon name="bookmark" size={14}/> Save search</button>
          <button className="btn btn-filled"><Icon name="search" size={14}/> Search</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

const hotels = [
  { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only', p: 3290, i: 'overwater', tag: 'All-inclusive · 7n', r: 4.9, badges: ['Gyasi pick'] },
  { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family', p: 2640, i: 'turks', tag: 'All-inclusive · 6n', r: 4.8, badges: ['Family'] },
  { t: 'Couples Swept Away', s: 'Negril · Adults-only', p: 2110, i: 'jamaica', tag: 'All-inclusive · 5n', r: 4.9 },
];
const cruises = [
  { t: 'Royal Caribbean · Symphony', s: 'Eastern Caribbean · 7-day', p: 1850, i: 'cruiseShip', tag: 'Cruise · Family', r: 4.7, badges: ['Kids sail free'] },
  { t: 'Carnival Mardi Gras', s: 'Western Caribbean · 7-day', p: 1290, i: 'cruiseShip', tag: 'Cruise · Casual', r: 4.5 },
  { t: 'Princess Caribbean Princess', s: 'Southern Caribbean · 10-day', p: 2640, i: 'cruiseShip', tag: 'Cruise · Premium', r: 4.6 },
];
const tours = [
  { t: 'Rose Island Cay snorkel', s: 'Nassau · 6 hrs', p: 140, i: 'snorkel', tag: 'Tour · Half-day', r: 4.9, badges: ['Top-rated'] },
  { t: 'Zipline + waterfalls', s: 'Negril · 8 hrs', p: 95, i: 'snorkel', tag: 'Tour · Adventure', r: 4.7 },
  { t: 'Sunset catamaran', s: 'Aruba · 4 hrs', p: 75, i: 'sunset', tag: 'Tour · Romantic', r: 4.8 },
];

function ResultsLayout({ kind, rows }) {
  return (
    <ScreenFrame role="client" tab="search" padding={0}>
      <div style={{ padding: '14px 28px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="t-title-l" style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: kind }}/>
        <span className="chip">{rows.length * 40} results</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{['Hotels','Cruises','Flights','Tours'].map((t) => <span key={t} className={`chip ${kind.startsWith(t) ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}</div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>FILTERS</div>
          {[{ t: 'Price', body: <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="t-body-s">$1k</span><div style={{ flex: 1, height: 3, background: 'var(--md-primary)', borderRadius: 2 }}/><span className="t-body-s">$8k</span></div> }, { t: 'Star rating', body: ['5★', '4★+', '3★+'].map((s) => <label key={s} style={{ display: 'flex', gap: 8, padding: '4px 0', font: '500 12.5px/1 var(--font-sans)' }}><span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--md-outline)', background: s === '5★' ? 'var(--md-primary)' : 'transparent' }}/> {s}</label>) }, { t: 'Amenities', body: ['Beachfront ✓','Spa ✓','Adults-only','Kids club','All-inclusive ✓'].map((s) => <label key={s} style={{ display: 'flex', gap: 8, padding: '4px 0', font: '500 12.5px/1 var(--font-sans)' }}><span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--md-outline)', background: s.includes('✓') ? 'var(--md-primary)' : 'transparent' }}/>{s}</label>) }].map((g) => (
            <div key={g.t} style={{ marginBottom: 12 }}><div className="t-title-s" style={{ marginBottom: 6 }}>{g.t}</div>{g.body}</div>
          ))}
        </aside>
        <div style={{ overflow: 'auto', padding: 16 }}>
          {rows.map((r, i) => (
            <div key={i} className="card" style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', padding: 0, marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <img src={staImg(r.i, 360, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <button style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 999, border: 0, background: 'rgba(255,255,255,0.9)' }}><Icon name="heart" size={14}/></button>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span className="kbd" style={{ background: 'rgba(13,33,55,0.85)', color: '#FFF', borderColor: 'transparent' }}>{r.tag}</span>
                  {(r.badges||[]).map((b) => <span key={b} className="chip" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', height: 22, fontSize: 11 }}>⭐ {b}</span>)}
                </div>
                <div className="t-title-l" style={{ margin: '2px 0' }}>{r.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s} · <Icon name="star" size={11} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> {r.r}</div>
              </div>
              <div style={{ padding: '14px 16px', borderLeft: '1px solid var(--md-outline-variant)', minWidth: 160, textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>FROM</div>
                <div className="t-title-l" style={{ margin: '2px 0' }}>${r.p.toLocaleString()}<span className="t-body-s"> /pp</span></div>
                <button className="btn btn-filled btn-sm" style={{ marginTop: 'auto' }}>Request quote</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

function C233_HotelsResults() { return <ResultsLayout kind="Hotels &amp; resorts" rows={hotels}/>; }
function C234_CruisesResults() { return <ResultsLayout kind="Cruises" rows={cruises}/>; }
function C236_ToursResults() { return <ResultsLayout kind="Tours &amp; activities" rows={tours}/>; }

// 2.3.5 — Search Results · Flights
function C235_FlightsResults() {
  const flights = [
    { c: 'American', n: 'AA 1413', dep: '06:40', arr: '09:30', dur: '2h 50m', stops: 'Nonstop', p: 462 },
    { c: 'JetBlue', n: 'B6 521', dep: '08:15', arr: '11:00', dur: '2h 45m', stops: 'Nonstop', p: 388 },
    { c: 'Delta', n: 'DL 1672+2802', dep: '07:20', arr: '13:40', dur: '6h 20m', stops: '1 stop · ATL', p: 312 },
  ];
  return (
    <ScreenFrame role="client" tab="search" padding={0}>
      <div style={{ padding: '14px 28px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <div className="t-title-l" style={{ margin: 0 }}>MIA → NAS · Aug 12 → 19 · 2 adults</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Amadeus · display-only · book through Gyasi</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flights.map((f, i) => (
          <div key={i} className="card" style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 14, alignItems: 'center' }}>
            <div><div className="t-title-s">{f.c}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-mono)' }}>{f.n}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div><div style={{ font: '700 16px/1 var(--font-sans)' }}>{f.dep}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>MIA</div></div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 1, background: 'var(--md-outline)' }}/>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{f.dur} · {f.stops}</div>
              </div>
              <div><div style={{ font: '700 16px/1 var(--font-sans)' }}>{f.arr}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>NAS</div></div>
            </div>
            <div style={{ font: '700 18px/1 var(--font-sans)', textAlign: 'right' }}>${f.p}<span className="t-body-s"> /pp</span></div>
            <button className="btn btn-tonal btn-sm">Add to quote</button>
          </div>
        ))}
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)', font: '500 12.5px/1.4 var(--font-sans)' }}>
          ℹ Flights are <b>display-only</b> at MVP. Add any to your quote — Gyasi books via Inteletravel.
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.3.7 — Property / Cruise / Tour Detail
function C237_PropertyDetail() {
  return (
    <ScreenFrame role="client" tab="search" padding={0} scrollable>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', height: 280, gap: 4 }}>
        <img src={staImg('overwater', 800, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <img src={staImg('resortPool', 400, 200)} alt="" style={{ width: '100%', height: '50%', objectFit: 'cover' }}/>
          <img src={staImg('sunset', 400, 200)} alt="" style={{ width: '100%', height: '50%', objectFit: 'cover' }}/>
        </div>
        <div style={{ position: 'relative' }}>
          <img src={staImg('honeymoon', 400, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          <button className="btn" style={{ position: 'absolute', bottom: 12, right: 12, background: '#FFF', color: 'var(--md-on-surface)' }}>All 24 photos</button>
        </div>
      </div>
      <div style={{ padding: '20px 28px 28px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span className="kbd" style={{ background: 'rgba(13,33,55,0.85)', color: '#FFF', borderColor: 'transparent' }}>All-inclusive · 7 nights</span>
            <span className="chip" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>⭐ Gyasi's pick</span>
          </div>
          <h1 className="t-display-s" style={{ margin: 0 }}>Sandals Royal Bahamian</h1>
          <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)', display: 'flex', gap: 14, marginTop: 4 }}>
            <span><Icon name="pin" size={13}/> Nassau, Bahamas</span>
            <span><Icon name="star" size={13} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9 · 312 reviews</span>
          </div>
          <p className="t-body" style={{ marginTop: 14, maxWidth: 640 }}>Over-water bungalows, six pools, twelve dining venues, a Red Lane spa, and a private island day. Adults-only.</p>

          <div className="t-title-l" style={{ marginTop: 18 }}>Room types</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[{ t: 'Honeymoon Beachfront Walkout', s: 'King · 540 sqft · private patio', p: 3290 }, { t: 'Over-Water Bungalow', s: 'King · 700 sqft · glass floor', p: 3970, recommended: true }, { t: 'Crystal Lagoon Penthouse', s: '2BR · 1,200 sqft · butler', p: 5240 }].map((r) => (
              <div key={r.t} className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', border: r.recommended ? '1.5px solid var(--md-primary)' : '1px solid var(--md-outline-variant)' }}>
                <div style={{ flex: 1 }}>
                  <div className="t-title-s">{r.t} {r.recommended && <span style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)', padding: '2px 6px', borderRadius: 4, font: '600 9.5px/1 var(--font-sans)', marginLeft: 6 }}>RECOMMENDED</span>}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div className="t-title-l" style={{ margin: 0 }}>${r.p.toLocaleString()}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>/pp · all-in</div></div>
              </div>
            ))}
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>FROM</div>
            <div className="t-display-s" style={{ margin: '4px 0' }}>$3,290<span className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}> /pp</span></div>
            <button className="btn btn-filled" style={{ width: '100%', marginTop: 12 }}>Request a quote</button>
            <button className="btn btn-tonal" style={{ width: '100%', marginTop: 6 }}><Icon name="heart" size={14}/> Favorite</button>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.3.8 — Quote Request Form
function C238_QuoteRequest() {
  return (
    <ScreenFrame role="client" tab="search" padding={28} scrollable>
      <ScreenHeader title="Request a quote · Sandals Royal Bahamian" subtitle="Gyasi will reply within 2 hours with a real proposal." small/>
      <div className="card" style={{ padding: 22, maxWidth: 760 }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginBottom: 8 }}>PRE-FILLED FROM YOUR SEARCH</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Trip name</label><input className="input" defaultValue="Hayes honeymoon · Sandals · Aug 2026"/></div>
          <div><label className="field-label">Departure</label><input className="input" defaultValue="Aug 12, 2026"/></div>
          <div><label className="field-label">Return</label><input className="input" defaultValue="Aug 19, 2026"/></div>
          <div><label className="field-label">Travelers</label><input className="input" defaultValue="2 adults · Jordan + Sam"/></div>
          <div><label className="field-label">Budget · per person</label><input className="input" defaultValue="$3,000 — $4,000"/></div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="field-label">Anything Gyasi should know?</label>
            <textarea className="input" style={{ height: 80, padding: 12, resize: 'none' }} defaultValue="Over-water bungalow if it works for budget. Sam is pescatarian. Anniversary Sep 14 — surprise nod welcome 🙂"/>
          </div>
        </div>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', margin: '12px 0 6px' }}>INCLUDED FROM YOUR FAVORITES (3)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['overwater','snorkel','sunset'].map((k) => (
            <div key={k} style={{ width: 80, height: 60, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
              <img src={staImg(k, 200, 150)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <button style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.6)', color: '#FFF' }}><Icon name="close" size={10}/></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-text">Save as draft</button>
          <button className="btn btn-filled" style={{ marginLeft: 'auto' }}><Icon name="send" size={14}/> Send to Gyasi</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.3.9 — Quote Request Confirmation
function C239_QuoteConfirmation() {
  return (
    <ScreenFrame role="client" tab="search" padding={0}>
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 540, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><Icon name="check" size={40} stroke={2.5}/></div>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>QUOTE REQUEST SENT</span>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>On its way to Gyasi.</h1>
          <p className="t-body-l" style={{ color: 'var(--md-on-surface-variant)' }}>You'll hear back within 2 hours. We'll send you a notification when a proposal lands.</p>
          <div className="card" style={{ padding: 14, marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 44, height: 44, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Gyasi Story · Online</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Usually replies in under 2 hours</div>
            </div>
            <button className="btn btn-tonal btn-sm"><Icon name="message" size={12}/> Note</button>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn-outlined">Dashboard</button>
            <button className="btn btn-filled">Start another search</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.3.10 — Saved Searches & Favorites
function C2310_Saved() {
  return (
    <ScreenFrame role="client" tab="search" padding={28} scrollable>
      <ScreenHeader title="Saved & favorites" subtitle="Pick up where you left off." small/>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--md-outline-variant)', marginBottom: 14 }}>
        {['Saved searches · 3', 'Favorites · 12'].map((t, i) => (
          <button key={t} style={{ padding: '10px 14px', border: 0, background: 'transparent', cursor: 'pointer', font: '600 13px/1 var(--font-sans)', color: i === 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)', borderBottom: i === 0 ? '3px solid var(--brand-orange)' : '3px solid transparent', marginBottom: -1 }}>{t}</button>
        ))}
      </div>
      <div className="t-title-s" style={{ marginBottom: 8 }}>Saved searches</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[{ t: 'Caribbean · Aug 12-19 · 2 adults', n: '148 trips · price dropped 18% today', alert: true }, { t: 'Cruise · Dec 22-29 · 4 travelers', n: '52 trips · 3 new' }, { t: 'Aruba honeymoon · Oct', n: '34 trips' }].map((s) => (
          <div key={s.t} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Icon name="bookmark" size={18} color="var(--brand-orange)" fill="var(--brand-orange)"/>
            <div style={{ flex: 1 }}><div className="t-title-s">{s.t}</div><div className="t-body-s" style={{ color: s.alert ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{s.alert && '🔥 '}{s.n}</div></div>
            <button className="btn btn-tonal btn-sm">Re-run</button>
          </div>
        ))}
      </div>
      <div className="t-title-s" style={{ marginTop: 22, marginBottom: 8 }}>Favorites</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {['overwater','cruiseShip','turks','honeymoon','snorkel','jamaica','aruba','resortPool'].map((k, i) => (
          <div key={i} className="card" style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: 120 }}><img src={staImg(k, 320, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/></div>
            <div style={{ padding: 10 }}>
              <div className="t-title-s" style={{ fontSize: 13 }}>{['Sandals Royal','Symphony EC','Beaches T&C','Couples SwAway','Rose Island','Negril Cliffs','Aruba Sunset','Atlantis'][i]}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>${[3290,1850,2640,2110,140,2110,1890,2480][i].toLocaleString()}/pp</div>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C231_SearchLanding, C232_SearchForm, C233_HotelsResults, C234_CruisesResults,
  C235_FlightsResults, C236_ToursResults, C237_PropertyDetail, C238_QuoteRequest,
  C239_QuoteConfirmation, C2310_Saved,
});
