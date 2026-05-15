/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.4 Trip Builder & Management — 16 screens.

function TripShell({ title, status, children, sidebar, fullbleed = false }) {
  return (
    <ScreenFrame role="agent" tab="trips" padding={0}>
      <div style={{ padding: '14px 28px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Trips · Jordan & Sam Hayes · <b style={{ color: 'var(--md-on-surface)' }}>{title}</b></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <h1 className="t-headline" style={{ margin: 0 }}>{title}</h1>
            {status}
          </div>
        </div>
        <button className="btn btn-text"><Icon name="copy" size={12}/> Duplicate</button>
        <button className="btn btn-outlined"><Icon name="external" size={12}/> Client preview</button>
        <button className="btn btn-tonal"><Icon name="send" size={12}/> Send proposal</button>
        <button className="btn btn-filled"><Icon name="check" size={12}/> Mark booked</button>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: sidebar ? '1fr 320px' : '1fr', overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', padding: fullbleed ? 0 : 18 }}>{children}</div>
        {sidebar && <aside style={{ borderLeft: '1px solid var(--md-outline-variant)', padding: 16, background: 'var(--md-surface)', overflow: 'auto' }}>{sidebar}</aside>}
      </div>
    </ScreenFrame>
  );
}

// 3.4.1 Trip List
function A341_TripList() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={20} scrollable>
      <ScreenHeader title="Trips" subtitle="Every trip you own or assist with." actions={<><button className="btn btn-outlined btn-sm"><Icon name="filter" size={12}/> Filter</button><button className="btn btn-orange btn-sm"><Icon name="plus" size={12}/> New trip</button></>} small/>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['All · 26','Inquiry · 12','Proposal · 3','Booked · 9','Traveling · 2'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}><span className="chip">Sort · Departure ▾</span></div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Trip</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Client</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Travel</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Stage</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Value</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Comm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[
              { t: 'Sandals · honeymoon', c: 'Jordan & Sam Hayes', tr: 'Aug 12 – 19, 2026', s: 'Booked', tone: 'booked', v: 6480, comm: 970 },
              { t: 'Symphony · family', c: 'Westbrook family', tr: 'Dec 22 – 29, 2026', s: 'Proposal', tone: 'proposal', v: 9120, comm: 1094 },
              { t: 'Atlantis weekend', c: 'Aisha Patel', tr: 'May 24 – 27, 2026', s: 'Booked', tone: 'booked', v: 3200, comm: 384 },
              { t: 'St. Lucia honeymoon', c: 'Reggie & Marc', tr: 'Now · May 18 – 23', s: 'Traveling', tone: 'traveling', v: 5800, comm: 870 },
              { t: 'Negril family week', c: 'Khan family', tr: 'Aug 2 – 9, 2026', s: 'Inquiry', tone: 'lead', v: 7200, comm: 936 },
              { t: 'Aruba honeymoon', c: 'Tasha Whitfield', tr: 'Oct 12 – 19, 2026', s: 'Inquiry', tone: 'lead', v: 3800, comm: 494 },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px' }}><div className="t-title-s">{r.t}</div></td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.c}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.tr}</td>
                <td style={{ padding: '10px 14px' }}><span className={`chip-status ${r.tone}`}>{r.s}</span></td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.v.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--md-primary)' }}>${r.comm.toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}><button className="btn-icon" style={{ width: 28, height: 28 }}><Icon name="more_vert" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.4.2 Trip Detail (agent view)
function A342_TripDetail() {
  return (
    <TripShell
      title="Sandals Royal Bahamian honeymoon"
      status={<><span className="chip-status booked">Booked</span><span className="chip-status proposal">Final balance pending</span></>}
      sidebar={
        <>
          <div className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div className="t-title-s">Cost & commission</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, font: '500 12.5px/1.4 var(--font-sans)' }}><span style={{ color: 'var(--md-on-surface-variant)' }}>Client total</span><span style={{ fontWeight: 700 }}>$6,480</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 12.5px/1.4 var(--font-sans)' }}><span style={{ color: 'var(--md-on-surface-variant)' }}>Rate · Sandals</span><span>15%</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, font: '700 16px/1.4 var(--font-sans)', color: 'var(--md-primary)' }}><span>Commission</span><span>$970</span></div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-title-s">Payments</div>
            {[{l:'Deposit · paid',v:'$800',t:'good'},{l:'Mid · paid',v:'$1,500',t:'good'},{l:'Final · May 28',v:'$4,180',t:'warn'}].map((s) => (
              <div key={s.l} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                <span className="dot" style={{ background: s.t === 'good' ? 'var(--md-success)' : 'var(--md-error)' }}/>
                <div className="t-body-s" style={{ flex: 1 }}>{s.l}</div>
                <span style={{ font: '700 12px/1 var(--font-mono)' }}>{s.v}</span>
              </div>
            ))}
          </div>
        </>
      }
    >
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <img src={staImg('overwater', 1400, 220)} alt="" style={{ width: '100%', height: 130, objectFit: 'cover' }}/>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { l: 'Trip type', v: 'Honeymoon · 7 nights' },
            { l: 'Destination', v: 'Nassau, Bahamas' },
            { l: 'Travelers', v: 'Jordan + Sam Hayes' },
            { l: 'Dates', v: 'Aug 12 – 19, 2026' },
            { l: 'Booking source', v: 'Inteletravel · Sandals' },
            { l: 'Card on file', v: 'VISA •••• 4242 · $4,598 cap' },
            { l: 'Status', v: 'Booked · final balance pending' },
            { l: 'Last activity', v: '2h ago · Jordan replied' },
          ].map((k) => (<div key={k.l}><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{k.l}</div><div className="t-body" style={{ marginTop: 2 }}>{k.v}</div></div>))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div className="t-title-l" style={{ margin: 0 }}>Itinerary</div>
        <span className="chip">6 components</span>
        <span className="chip">2 manual · 4 API</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { k: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Aug 12 · Direct · seats 14A 14B', src: 'Amadeus', c: 460 },
          { k: 'trip', t: 'Private transfer · Mercedes Vito', s: 'Sun & Fun · 25 min', src: 'Manual', c: 180 },
          { k: 'building', t: 'Sandals Royal Bahamian', s: 'Honeymoon Beachfront Walkout · 7n', src: 'Hotelbeds', c: 4980 },
          { k: 'sparkle', t: 'Rose Island Cay snorkel', s: 'Aug 14 · Catamaran for 2', src: 'Viator', c: 280 },
          { k: 'heart', t: 'Red Lane spa · couples', s: 'Aug 13 · 90 min · included', src: 'Manual', c: 0 },
          { k: 'plane', t: 'AA 1410 · NAS → MIA', s: 'Aug 19 · Direct', src: 'Amadeus', c: 460 },
        ].map((c, i) => (
          <div key={i} className="card" style={{ padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <Icon name="more_vert" size={14} color="var(--md-on-surface-variant)"/>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.k} size={16}/></span>
            <div style={{ flex: 1 }}><div className="t-title-s">{c.t}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div></div>
            <span className="kbd">{c.src}</span>
            <div style={{ font: '700 12px/1 var(--font-mono)', minWidth: 70, textAlign: 'right' }}>${c.c.toLocaleString()}</div>
            <button className="btn-icon"><Icon name="more_vert" size={14}/></button>
          </div>
        ))}
      </div>
    </TripShell>
  );
}

// 3.4.3 Create New Trip — Type Selector
function A343_NewTripType() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <ScreenHeader title="New trip · pick a type" subtitle="Templates speed up repeat trip types. You can always customize from there." small/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 960 }}>
        {[
          { i: 'building', t: 'All-inclusive resort', s: 'Sandals, Beaches, Couples', count: '12 templates' },
          { i: 'ship', t: 'Cruise', s: 'Royal Caribbean, Princess, Carnival', count: '7 templates' },
          { i: 'plane', t: 'Multi-destination', s: 'City + beach, multi-stop', count: '3 templates' },
          { i: 'users', t: 'Group trip', s: 'Up to 24 travelers', count: '2 templates' },
          { i: 'heart', t: 'Honeymoon', s: 'Adults-only, surprise nods', count: '5 templates' },
          { i: 'sparkle', t: 'Custom / blank', s: 'Start from zero', count: 'Blank slate' },
        ].map((c, i) => (
          <button key={c.t} className="card" style={{ padding: 18, textAlign: 'left', border: i === 0 ? '1.5px solid var(--md-primary)' : '1px solid var(--md-outline-variant)', cursor: 'pointer' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: i === 0 ? 'var(--md-primary)' : 'var(--md-primary-container)', color: i === 0 ? 'var(--md-on-primary)' : 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.i} size={20}/></span>
            <div className="t-title-l" style={{ margin: '12px 0 4px' }}>{c.t}</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
            <div className="t-label" style={{ color: 'var(--brand-orange)', marginTop: 10 }}>{c.count}</div>
          </button>
        ))}
      </div>
      <div className="card" style={{ marginTop: 18, padding: 16, maxWidth: 960 }}>
        <div className="t-title-s">Or attach to a client first</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
          <input className="input" style={{ flex: 1 }} placeholder="Search clients to attach…"/>
          <button className="btn btn-tonal btn-sm">Pick later</button>
          <button className="btn btn-filled">Continue <Icon name="arrow_right" size={12}/></button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.4.4 Trip Builder Workspace
function A344_TripBuilder() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={0}>
      <div style={{ padding: '14px 28px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Trip builder · Jordan & Sam Hayes</div>
          <h1 className="t-headline" style={{ margin: 0 }}>Sandals honeymoon · Aug 2026</h1>
        </div>
        <button className="btn btn-text">Auto-save · just now</button>
        <button className="btn btn-tonal">Preview proposal</button>
        <button className="btn btn-filled">Send to client</button>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 320px', overflow: 'hidden' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>ADD COMPONENT</div>
          {[
            { i: 'plane', l: 'Flight · Amadeus' }, { i: 'building', l: 'Hotel · Hotelbeds' }, { i: 'ship', l: 'Cruise · Widgety' },
            { i: 'sparkle', l: 'Tour · Viator' }, { i: 'trip', l: 'Transfer · manual' }, { i: 'utensils', l: 'Dining · manual' },
            { i: 'shield', l: 'Insurance · Allianz' }, { i: 'receipt', l: 'Other · manual' },
          ].map((c) => (
            <button key={c.l} className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', width: '100%', marginBottom: 4, cursor: 'pointer', background: 'transparent', border: 0, boxShadow: 'none' }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.i} size={14}/></span>
              <span className="t-body-s" style={{ flex: 1, textAlign: 'left' }}>{c.l}</span>
              <Icon name="plus" size={12} color="var(--md-on-surface-variant)"/>
            </button>
          ))}
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginTop: 14, marginBottom: 6 }}>TEMPLATES</div>
          {['Sandals honeymoon · 7n', 'Family cruise · 7n EC', 'Atlantis weekend'].map((t) => (
            <div key={t} className="card" style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <Icon name="bookmark" size={12} color="var(--brand-orange)"/>
              <span className="t-body-s" style={{ flex: 1 }}>{t}</span>
              <button className="btn-icon" style={{ width: 24, height: 24 }}><Icon name="plus" size={12}/></button>
            </div>
          ))}
        </aside>
        <div style={{ overflow: 'auto', padding: 18 }}>
          {['Day 1 · Arrival', 'Day 2 · Beach', 'Day 3 · Cay day-trip'].map((d, di) => (
            <div key={d} style={{ marginBottom: 16 }}>
              <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 26, lineHeight: 1, marginBottom: 4 }}>{d.split(' ·')[0]}</div>
              <div className="t-title-s" style={{ marginBottom: 8 }}>{d.split(' ·')[1]}</div>
              {(di === 0 ? [{ k: 'plane', t: 'AA 1413 · MIA → NAS', s: '06:40 · Direct' }, { k: 'building', t: 'Check-in · Sandals', s: 'Beachfront Walkout' }] : di === 1 ? [{ k: 'heart', t: 'Spa · couples', s: '15:30 · 90 min' }] : [{ k: 'sparkle', t: 'Rose Island Cay snorkel', s: '9:00 · 6 hrs' }]).map((c, i) => (
                <div key={i} className="card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', gap: 12, alignItems: 'center', border: '1px dashed var(--md-outline)' }}>
                  <Icon name="more_vert" size={12} color="var(--md-on-surface-variant)"/>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.k} size={13}/></span>
                  <div style={{ flex: 1 }}><div className="t-title-s" style={{ fontSize: 12.5 }}>{c.t}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div></div>
                  <button className="btn-icon" style={{ width: 24, height: 24 }}><Icon name="edit" size={12}/></button>
                </div>
              ))}
              <button className="btn btn-text btn-sm" style={{ padding: 0 }}>+ Add to Day {di+1}</button>
            </div>
          ))}
        </div>
        <aside style={{ borderLeft: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>SELECTED · CHECK-IN SANDALS</div>
          <div className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div><label className="field-label">Supplier</label><input className="input" defaultValue="Sandals Royal Bahamian"/></div>
            <div style={{ marginTop: 8 }}><label className="field-label">Room type</label><input className="input" defaultValue="Honeymoon Beachfront Walkout"/></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label className="field-label">Check-in</label><input className="input" defaultValue="Aug 12 · 1:00p"/></div>
              <div><label className="field-label">Check-out</label><input className="input" defaultValue="Aug 19 · 11:00a"/></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label className="field-label">Cost</label><input className="input" defaultValue="$4,980" style={{ fontFamily: 'var(--font-mono)' }}/></div>
              <div><label className="field-label">Comm %</label><input className="input" defaultValue="15%"/></div>
            </div>
            <div style={{ marginTop: 8 }}><label className="field-label">Confirmation #</label><input className="input" defaultValue="SRB-220119" style={{ fontFamily: 'var(--font-mono)' }}/></div>
          </div>
          <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>SOURCE · HOTELBEDS</div>
            <div className="t-body-s" style={{ marginTop: 4 }}>Live · last refreshed 14 min ago</div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.4.5–3.4.10 are component add/edit screens — render as a single common pattern, parametrized.
function CompModal({ icon, kind, fields, search }) {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.35)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 720, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18}/></span>
            <div><span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>ADD COMPONENT</span><h2 className="t-title-l" style={{ margin: 0 }}>{kind}</h2></div>
            <button className="btn-icon" style={{ marginLeft: 'auto' }}><Icon name="close" size={18}/></button>
          </div>
          {search && (
            <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--md-surface-2)' }}>
              <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{search.label}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <Icon name="search" size={14} color="var(--md-on-surface-variant)"/>
                <input className="input" style={{ flex: 1, height: 36, border: 0, background: 'transparent', padding: 0 }} defaultValue={search.value}/>
                <button className="btn btn-tonal btn-sm">Search</button>
              </div>
              {search.results && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {search.results.map((r, i) => (
                    <div key={i} className="card" style={{ padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', border: i === 0 ? '1.5px solid var(--md-primary)' : '1px solid var(--md-outline-variant)' }}>
                      <div style={{ flex: 1 }}><div className="t-title-s" style={{ fontSize: 12.5 }}>{r.t}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s}</div></div>
                      <div style={{ font: '700 12px/1 var(--font-mono)' }}>{r.p}</div>
                      <button className="btn btn-text btn-sm" style={{ padding: 0 }}>Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {fields.map((f) => (
              <div key={f.l} style={{ gridColumn: f.full ? 'span 2' : 'auto' }}>
                <label className="field-label">{f.l}</label>
                <input className="input" defaultValue={f.v} style={f.mono ? { fontFamily: 'var(--font-mono)' } : {}}/>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Add to trip</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.4.5 Add Flight
function A345_AddFlight() {
  return <CompModal icon="plane" kind="Add flight"
    search={{ label: 'Search Amadeus · MIA → NAS · Aug 12', value: 'MIA → NAS · Aug 12, 2026 · 2 pax', results: [
      { t: 'AA 1413 · MIA → NAS · 06:40 → 09:30', s: 'Nonstop · 2h 50m · Economy', p: '$462' },
      { t: 'B6 521 · MIA → NAS · 08:15 → 11:00', s: 'Nonstop · 2h 45m · Economy', p: '$388' },
    ] }}
    fields={[
      { l: 'Airline', v: 'American Airlines', full: true },
      { l: 'Flight #', v: 'AA 1413', mono: true },
      { l: 'PNR', v: 'TLR8QV', mono: true },
      { l: 'Seats', v: '14A, 14B' },
      { l: 'Cost (pp)', v: '$462', mono: true },
      { l: 'Notes', v: 'Both pax · Group 4 boarding', full: true },
    ]}
  />;
}

// 3.4.6 Add Hotel
function A346_AddHotel() {
  return <CompModal icon="building" kind="Add hotel · resort"
    search={{ label: 'Search Hotelbeds · Nassau · Aug 12 – 19', value: 'Nassau · Aug 12 – 19 · 2 adults', results: [
      { t: 'Sandals Royal Bahamian · Honeymoon Beachfront', s: 'All-inclusive · adults-only', p: '$4,980' },
      { t: 'Atlantis Paradise · Coral Tower', s: '4★ · ocean view', p: '$2,640' },
    ] }}
    fields={[
      { l: 'Property', v: 'Sandals Royal Bahamian', full: true },
      { l: 'Room type', v: 'Honeymoon Beachfront Walkout', full: true },
      { l: 'Check-in', v: 'Aug 12 · 1:00p' },
      { l: 'Check-out', v: 'Aug 19 · 11:00a' },
      { l: 'Total cost', v: '$4,980', mono: true },
      { l: 'Confirmation', v: 'SRB-220119', mono: true },
    ]}
  />;
}

// 3.4.7 Add Cruise
function A347_AddCruise() {
  return <CompModal icon="ship" kind="Add cruise"
    search={{ label: 'Widgety cruise content · Dec 22 – 29', value: 'Eastern Caribbean · 7-day · 4 pax', results: [
      { t: 'Royal Caribbean Symphony · Dec 22', s: '7-day EC · CocoCay · 2 ports', p: '$1,850' },
    ] }}
    fields={[
      { l: 'Line', v: 'Royal Caribbean', full: true },
      { l: 'Ship', v: 'Symphony of the Seas' },
      { l: 'Itinerary', v: 'Eastern Caribbean · 7-day' },
      { l: 'Sail date', v: 'Dec 22, 2026' },
      { l: 'Return', v: 'Dec 29, 2026' },
      { l: 'Cabin', v: 'Balcony · 7430' },
      { l: 'Booking #', v: 'RCL-99421', mono: true },
      { l: 'Total cost', v: '$9,120', mono: true },
    ]}
  />;
}

// 3.4.8 Add Tour
function A348_AddTour() {
  return <CompModal icon="sparkle" kind="Add tour · activity"
    search={{ label: 'Search Viator · Nassau · half-day', value: 'Nassau · Aug 14 · snorkel', results: [
      { t: 'Rose Island Cay snorkel · catamaran', s: '6 hrs · lunch + gear', p: '$140 / pax' },
      { t: 'Atlantis dolphin encounter', s: '2 hrs · 1 swim', p: '$220 / pax' },
    ] }}
    fields={[
      { l: 'Tour name', v: 'Rose Island Cay snorkel', full: true },
      { l: 'Date', v: 'Aug 14, 2026' },
      { l: 'Start time', v: '9:00 AM' },
      { l: 'Duration', v: '6 hours' },
      { l: 'Travelers', v: '2 adults' },
      { l: 'Cost (pp)', v: '$140', mono: true },
      { l: 'Confirmation', v: 'VIA-882211', mono: true },
    ]}
  />;
}

// 3.4.9 Add Transfer
function A349_AddTransfer() {
  return <CompModal icon="trip" kind="Add transfer"
    fields={[
      { l: 'Operator', v: 'Sun & Fun Tours', full: true },
      { l: 'Pickup', v: 'Lynden Pindling Intl (NAS)' },
      { l: 'Drop-off', v: 'Sandals Royal Bahamian' },
      { l: 'Date / time', v: 'Aug 12 · 11:20 AM' },
      { l: 'Vehicle', v: 'Mercedes Vito · private' },
      { l: 'Cost', v: '$180', mono: true },
      { l: 'Confirmation', v: 'STT-1133', mono: true },
    ]}
  />;
}

// 3.4.10 Add Dining
function A3410_AddDining() {
  return <CompModal icon="utensils" kind="Add dining reservation"
    fields={[
      { l: 'Restaurant', v: 'Bayside · Sandals Royal', full: true },
      { l: 'Date', v: 'Aug 12, 2026' },
      { l: 'Time', v: '7:30 PM' },
      { l: 'Party size', v: '2' },
      { l: 'Reserved by', v: 'Concierge' },
      { l: 'Notes', v: '4-course welcome menu · Sam pescatarian', full: true },
    ]}
  />;
}

// 3.4.11 Add Insurance
function A3411_AddInsurance() {
  return <CompModal icon="shield" kind="Add travel insurance"
    fields={[
      { l: 'Provider', v: 'Allianz Travel', full: true },
      { l: 'Policy #', v: '987124', mono: true },
      { l: 'Plan', v: 'Classic · trip protection' },
      { l: 'Coverage', v: '$6,480 trip cost' },
      { l: 'Premium', v: '$284', mono: true },
      { l: 'Effective', v: 'Mar 14, 2026 – Aug 26, 2026', full: true },
    ]}
  />;
}

// 3.4.12 Add Other / Manual
function A3412_AddOther() {
  return <CompModal icon="receipt" kind="Add other component"
    fields={[
      { l: 'Description', v: 'Welcome bottle of bubbly · in-room', full: true },
      { l: 'Supplier', v: 'Sandals · concierge' },
      { l: 'Cost', v: '$45', mono: true },
      { l: 'Date', v: 'Aug 12, 2026' },
      { l: 'Notes', v: 'Anniversary nod · do not bill to client', full: true },
    ]}
  />;
}

// 3.4.13 Trip Template Library
function A3413_TemplateLibrary() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={20} scrollable>
      <ScreenHeader title="Trip template library" subtitle="Reusable starting points for repeat trip types. Web-only editing at MVP." actions={<button className="btn btn-orange btn-sm"><Icon name="plus" size={12}/> New template</button>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { i: 'overwater', t: 'Sandals honeymoon · 7n', s: 'Bungalow + spa + cay day-trip', uses: 14, c: '$6,480' },
          { i: 'cruiseShip', t: 'Royal Caribbean · family 7n EC', s: 'Cabin + CocoCay + dining', uses: 9, c: '$5,240' },
          { i: 'bahamas', t: 'Atlantis weekend', s: '4n · pool · dolphin add-on', uses: 6, c: '$3,180' },
          { i: 'jamaica', t: 'Couples Negril · 5n', s: 'AI · cliff tours', uses: 4, c: '$2,110' },
          { i: 'turks', t: 'Beaches T&C · family week', s: 'Sesame · kids stay free', uses: 4, c: '$6,920' },
          { i: 'aruba', t: 'Aruba sunset · 5n', s: 'Beachfront · spa', uses: 2, c: '$2,840' },
        ].map((t) => (
          <div key={t.t} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <img src={staImg(t.i, 400, 200)} alt="" style={{ width: '100%', height: 110, objectFit: 'cover' }}/>
            <div style={{ padding: 12 }}>
              <div className="t-title-s">{t.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.s}</div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, gap: 6 }}>
                <span className="chip" style={{ height: 22, fontSize: 11 }}>{t.uses}× used</span>
                <span className="chip" style={{ height: 22, fontSize: 11 }}>{t.c}</span>
                <button className="btn btn-tonal btn-sm" style={{ marginLeft: 'auto', height: 28 }}>Use</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 3.4.14 Itinerary Editor
function A3414_ItineraryEditor() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={0}>
      <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Itinerary editor · Sandals · Aug 12 – 19</div>
          <h1 className="t-headline" style={{ margin: 0 }}>Day-by-day editor</h1>
        </div>
        <button className="btn btn-tonal"><Icon name="sparkle" size={12}/> Auto-generate from components</button>
        <button className="btn btn-filled">Publish update</button>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 320px', overflow: 'hidden' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 10, overflow: 'auto', background: 'var(--md-surface)' }}>
          {['Day 1 · Arrival','Day 2 · Beach','Day 3 · Cay','Day 4 · Resort','Day 5 · Spa','Day 6 · Snorkel','Day 7 · Pool','Departure'].map((d, i) => (
            <div key={d} style={{ padding: '8px 10px', borderRadius: 8, background: i === 0 ? 'var(--md-secondary-container)' : 'transparent', color: i === 0 ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)', cursor: 'pointer', font: '600 12px/1.3 var(--font-sans)', marginBottom: 2 }}>{d}</div>
          ))}
        </aside>
        <div style={{ overflow: 'auto', padding: 18 }}>
          <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 32, lineHeight: 1 }}>Day 01</div>
          <input className="input" defaultValue="Miami → Nassau" style={{ marginTop: 4, font: '700 20px/1.2 var(--font-sans)', border: 0, padding: '4px 0', background: 'transparent', boxShadow: 'none' }}/>
          <textarea className="input" style={{ marginTop: 4, height: 60, padding: 10, resize: 'none' }} defaultValue="Arrival & sunset welcome dinner — easy day, get oriented, drinks on the beach."/>
          <div className="t-title-s" style={{ marginTop: 14 }}>Time blocks</div>
          {[
            { p: 'MORNING', t: '06:40 · AA 1413 · MIA → NAS', tip: 'Group 4 boarding · arrive 5:30a' },
            { p: 'AFTERNOON', t: '13:00 · Check-in · Sandals', tip: 'Honeymoon walkout · request building 3' },
            { p: 'EVENING', t: '19:30 · Welcome dinner · Bayside', tip: 'Reserved for 2 · pescatarian flag for Sam' },
          ].map((b, i) => (
            <div key={i} className="card" style={{ padding: 14, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{b.p}</span>
                <input className="input" defaultValue={b.t} style={{ flex: 1, border: 0, padding: '4px 0', font: '600 14px/1.3 var(--font-sans)', background: 'transparent', boxShadow: 'none' }}/>
                <button className="btn-icon"><Icon name="more_vert" size={14}/></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>
                <span className="t-label-s" style={{ flexShrink: 0 }}>GYASI'S TIP</span>
                <input className="input" defaultValue={b.tip} style={{ flex: 1, border: 0, padding: 0, height: 18, font: '500 12px/1.4 var(--font-sans)', background: 'transparent', boxShadow: 'none', color: 'inherit' }}/>
              </div>
            </div>
          ))}
        </div>
        <aside style={{ borderLeft: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>VISIBLE TO CLIENT</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--md-surface-2)' }}>
            <Icon name="info" size={14}/><div className="t-body-s">Changes publish on "Publish update" · client gets push.</div>
          </div>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginTop: 14 }}>SUGGESTED NEXT</div>
          {['Add Day 3 snorkel from Viator', 'Confirm Bayside dinner', 'Add packing reminder for Day 2'].map((s) => (
            <div key={s} className="card" style={{ padding: 10, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkle" size={13} color="var(--brand-orange)"/><div className="t-body-s">{s}</div>
            </div>
          ))}
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.4.15 Trip Payment Schedule
function A3415_PaymentSchedule() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <ScreenHeader title="Payment schedule · Sandals · Aug 2026" subtitle="What's due when, to whom, from which card." actions={<button className="btn btn-filled btn-sm"><Icon name="plus" size={12}/> Add scheduled payment</button>} small/>
      <div className="card" style={{ padding: 0, maxWidth: 1000 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Due</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Supplier</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Amount</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Card</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { d: 'Mar 14', desc: 'Deposit', sup: 'Sandals', a: 800, c: 'VISA 4242', s: 'Paid', tone: 'booked' },
              { d: 'Apr 22', desc: 'Mid payment', sup: 'Sandals', a: 1500, c: 'VISA 4242', s: 'Paid', tone: 'booked' },
              { d: 'May 28', desc: 'Final balance', sup: 'Sandals', a: 4180, c: 'VISA 4242 · $4,598 cap', s: 'Authorized · due', tone: 'due' },
              { d: 'Aug 14', desc: 'Tour · Rose Island', sup: 'Viator', a: 280, c: 'VISA 4242', s: 'Scheduled', tone: 'proposal' },
              { d: 'Aug 12', desc: 'Transfer', sup: 'Sun & Fun', a: 180, c: 'VISA 4242', s: 'Scheduled', tone: 'proposal' },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '600 12.5px/1 var(--font-sans)' }}>{r.d}</td>
                <td style={{ padding: '10px 14px' }}>{r.desc}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.sup}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.a.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.c}</td>
                <td style={{ padding: '10px 14px' }}><span className={`chip-status ${r.tone}`}>{r.s}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--md-outline-variant)', background: 'var(--md-surface-2)' }}>
              <td colSpan="3" style={{ padding: '12px 14px', font: '700 13px/1 var(--font-sans)' }}>Trip total</td>
              <td style={{ padding: '12px 14px', textAlign: 'right', font: '800 16px/1 var(--font-mono)' }}>$6,940</td>
              <td colSpan="2"/>
            </tr>
          </tfoot>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.4.16 Cancel / Archive Trip
function A3416_CancelTrip() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 560, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="warning" size={18}/></span>
            <div><span className="t-label-s" style={{ color: 'var(--md-error)' }}>CANCEL TRIP</span><h2 className="t-title-l" style={{ margin: 0 }}>Cancel Sandals · Aug 12 – 19?</h2></div>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>IMPACT</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, font: '400 12.5px/1.6 var(--font-sans)' }}>
              <li>Card authorization will be revoked</li>
              <li>Allianz policy refund subject to terms (15 day window)</li>
              <li>Sandals cancellation fee · $120 per policy</li>
              <li>Commission expectation removed ($970)</li>
            </ul>
          </div>
          <div style={{ marginTop: 10 }}><label className="field-label">Reason</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} placeholder="Family conflict · medical · etc."/></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: '500 12.5px/1.4 var(--font-sans)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span>
            Notify client with cancellation template
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Keep trip</button>
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>Cancel trip</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  A341_TripList, A342_TripDetail, A343_NewTripType, A344_TripBuilder,
  A345_AddFlight, A346_AddHotel, A347_AddCruise, A348_AddTour, A349_AddTransfer,
  A3410_AddDining, A3411_AddInsurance, A3412_AddOther,
  A3413_TemplateLibrary, A3414_ItineraryEditor, A3415_PaymentSchedule, A3416_CancelTrip,
});
