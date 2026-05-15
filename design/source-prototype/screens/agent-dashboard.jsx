/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.2 Dashboard & Pipeline — 3 screens.

function AgentKPI({ label, value, delta, icon, accent }) {
  const map = { primary: ['var(--md-primary-container)','var(--md-on-primary-container)'], secondary: ['var(--md-secondary-container)','var(--md-on-secondary-container)'], tertiary: ['var(--md-tertiary-container)','var(--md-on-tertiary-container)'], surface: ['var(--md-surface-2)','var(--md-on-surface)'] };
  const [bg, fg] = map[accent] || map.surface;
  return (
    <div style={{ background: bg, color: fg, borderRadius: 16, padding: '14px 16px', minHeight: 100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="t-label" style={{ opacity: 0.85 }}>{label}</span>
        <Icon name={icon} size={16}/>
      </div>
      <div className="t-display-s" style={{ margin: '6px 0 2px', fontSize: 26 }}>{value}</div>
      {delta && <div className="t-body-s" style={{ opacity: 0.85, fontWeight: 600 }}>{delta}</div>}
    </div>
  );
}

// 3.2.1 — Agent Dashboard / Worklist
function A321_Worklist() {
  return (
    <ScreenFrame role="agent" tab="home" padding={24} scrollable>
      <ScreenHeader
        overline="THIS WEEK · MAY 12 – MAY 18"
        title="Morning, Gyasi. 3 things need you today."
        subtitle="One card to chase, two proposals in client court, one new lead from search."
        actions={<><button className="btn btn-tonal btn-sm"><Icon name="filter" size={14}/> Filter</button><button className="btn btn-orange btn-sm"><Icon name="plus" size={14}/> New trip</button></>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
        <AgentKPI label="Pipeline value" value="$148,720" delta="↗ +18% LM" icon="briefcase" accent="primary"/>
        <AgentKPI label="Booked · month" value="$32,440" delta="9 trips · 3 to close" icon="check" accent="secondary"/>
        <AgentKPI label="Commission expected" value="$4,310" delta="71% confidence" icon="dollar" accent="tertiary"/>
        <AgentKPI label="Inquiry → book" value="11 days" delta="−3 d vs LM" icon="clock" accent="surface"/>
        <AgentKPI label="Active clients" value="68" delta="+4 this month" icon="users" accent="surface"/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center' }}>
            <div className="t-title-s">Proposals awaiting reply</div>
            <span className="chip" style={{ marginLeft: 'auto' }}>3 · $22,080</span>
          </div>
          {[
            { c: 'Maya & Daniel Carter', t: 'Sandals honeymoon · Aug 12', v: 6480, due: 'Tomorrow', a: 'avatarA' },
            { c: 'Westbrook family (4)', t: 'Royal Caribbean Symphony · Dec 22', v: 9120, due: '3 days', a: 'avatarB' },
            { c: 'Jordan & Sam Hayes', t: 'Sandals · bungalow upgrade', v: 6480, due: 'Booked', a: 'avatarC' },
          ].map((p, i) => (
            <div key={i} style={{ padding: '12px 16px', borderTop: i ? '1px solid var(--md-outline-variant)' : 0, display: 'flex', gap: 10, alignItems: 'center' }}>
              <img src={staImg(p.a, 80, 80)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s">{p.c}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{p.t}</div>
              </div>
              <div style={{ font: '700 12px/1 var(--font-mono)' }}>${p.v.toLocaleString()}</div>
              <span className={`chip-status ${p.due === 'Booked' ? 'booked' : 'proposal'}`}>{p.due}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-outline-variant)' }}><div className="t-title-s">Payments to settle</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Supplier-pay due</div></div>
          {[
            { c: 'Jordan Hayes', s: 'Sandals · final', amt: 4180, due: 'May 28', risk: 'med' },
            { c: 'Aisha Patel', s: 'Princess deposit', amt: 850, due: 'May 19', risk: 'low' },
            { c: 'Reggie & Marc', s: 'St. Lucia transfer', amt: 220, due: 'May 16', risk: 'high' },
          ].map((p, i) => (
            <div key={i} style={{ padding: '10px 16px', borderTop: i ? '1px solid var(--md-outline-variant)' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: p.risk === 'high' ? 'var(--md-error)' : p.risk === 'med' ? 'var(--md-warning)' : 'var(--md-success)' }}/>
                <div className="t-title-s" style={{ flex: 1, fontSize: 12.5 }}>{p.c}</div>
                <div style={{ font: '700 12px/1 var(--font-mono)' }}>${p.amt.toLocaleString()}</div>
              </div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{p.s} · due {p.due}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden', background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}>
          <div style={{ padding: '12px 16px' }}>
            <div className="t-title-s">Fresh leads · search</div>
            <div className="t-body-s" style={{ opacity: 0.75 }}>3 new today</div>
          </div>
          {[
            { n: 'Tasha Whitfield', want: 'Aruba honeymoon · Oct', age: '2h', a: 'avatarE' },
            { n: 'Eli Park', want: 'Cruise · 4 pax · Spring', age: '14h', a: 'avatarF' },
            { n: 'Linda Gomez', want: 'Adults-only AI', age: 'Yest', a: 'avatarA' },
          ].map((l, i) => (
            <div key={i} style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={staImg(l.a, 64, 64)} alt="" style={{ width: 28, height: 28, borderRadius: 999 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 12.5 }}>{l.n}</div>
                <div className="t-body-s" style={{ opacity: 0.75 }}>{l.want}</div>
              </div>
              <button className="btn btn-filled btn-sm" style={{ height: 28, background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>Reply</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginTop: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><div className="t-title-s">Travelers in next 30 days</div><span className="chip" style={{ marginLeft: 'auto' }}>5</span></div>
          {[
            { d: 'May 18', who: 'Reggie & Marc', t: 'St. Lucia · 5n', a: 'avatarF' },
            { d: 'May 24', who: 'Patel family', t: 'Atlantis · 4 pax', a: 'avatarD' },
            { d: 'Jun 02', who: 'Kim Wallace', t: 'Aruba · solo', a: 'avatarE' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--md-outline-variant)' : 0 }}>
              <div style={{ width: 44, padding: '4px 0', borderRadius: 8, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)', textAlign: 'center' }}>
                <div className="t-label-s">{t.d.split(' ')[0]}</div>
                <div style={{ font: '800 14px/1 var(--font-sans)' }}>{t.d.split(' ')[1]}</div>
              </div>
              <div style={{ flex: 1 }}><div className="t-title-s">{t.who}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.t}</div></div>
              <img src={staImg(t.a, 64, 64)} alt="" style={{ width: 28, height: 28, borderRadius: 999 }}/>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-title-s">Recent messages</div>
          {[
            { who: 'Maya Carter', m: '"Yes lock the upgrade!"', t: '2:14p' },
            { who: 'Aisha Patel', m: '"Anything for under $3k?"', t: '11:22a' },
            { who: 'Linda Gomez', m: '"Talk tonight at 7?"', t: 'Yest' },
          ].map((m, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--md-outline-variant)' : 0 }}>
              <div style={{ display: 'flex' }}><div className="t-title-s" style={{ flex: 1, fontSize: 12.5 }}>{m.who}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{m.t}</div></div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface)', fontStyle: 'italic' }}>{m.m}</div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.2.2 — Pipeline / Funnel View
function A322_Pipeline() {
  const stages = [
    { k: 'Inquiry', tone: 'lead', count: 12, val: 24800, items: [{c:'Tasha W.',t:'Aruba honeymoon',v:3800},{c:'Eli Park',t:'Spring cruise',v:9000},{c:'Linda Gomez',t:'AI · Oct',v:5200}] },
    { k: 'Qualified', tone: 'inquiry', count: 6, val: 28600, items: [{c:'Khan family',t:'Beaches T&C',v:7200},{c:'Marin & Joe',t:'Sandals St Lucia',v:6800}] },
    { k: 'Proposal', tone: 'proposal', count: 3, val: 22080, items: [{c:'Maya & Daniel',t:'Sandals · Aug',v:6480},{c:'Westbrook',t:'Symphony · Dec',v:9120},{c:'Hayes',t:'Bungalow upgrade',v:6480}] },
    { k: 'Booked', tone: 'booked', count: 9, val: 32440, items: [{c:'Jordan Hayes',t:'Sandals · Aug',v:6480},{c:'Aisha Patel',t:'Atlantis',v:3200}] },
    { k: 'Traveling', tone: 'traveling', count: 2, val: 8900, items: [{c:'Reggie & Marc',t:'St Lucia · now',v:5800}] },
  ];
  return (
    <ScreenFrame role="agent" tab="home" padding={20}>
      <ScreenHeader title="Pipeline" subtitle="Drag a card to change its stage. Stage value is summed live." actions={<><span className="chip">All advisors</span><span className="chip chip-filter is-on">Gyasi</span></>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, height: 'calc(100% - 80px)', overflow: 'hidden' }}>
        {stages.map((s) => (
          <div key={s.k} style={{ display: 'flex', flexDirection: 'column', background: 'var(--md-surface-2)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--md-outline-variant)' }}>
              <span className={`chip-status ${s.tone}`}>{s.k}</span>
              <div className="t-title-s" style={{ marginTop: 6, fontSize: 13 }}>{s.count} trips · <span style={{ color: 'var(--md-on-surface-variant)', fontWeight: 500 }}>${s.val.toLocaleString()}</span></div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.items.map((it, i) => (
                <div key={i} className="card" style={{ padding: 10, cursor: 'grab' }}>
                  <div className="t-title-s" style={{ fontSize: 12.5 }}>{it.c}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{it.t}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span className="t-body-s" style={{ fontFamily: 'var(--font-mono)' }}>${it.v.toLocaleString()}</span>
                    <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>·</span>
                  </div>
                </div>
              ))}
              <button className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start', padding: 0 }}>+ Add</button>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 3.2.3 — Calendar
function A323_Calendar() {
  // Build a simple month grid for May 2026
  const days = Array.from({ length: 35 }, (_, i) => i - 3); // first row offset
  const events = {
    12: { c: 'Hayes · proposal due', t: 'proposal' },
    14: { c: 'Today', t: 'today' },
    16: { c: 'St. Lucia transfer pay', t: 'due' },
    18: { c: 'Reggie & Marc depart', t: 'travel' },
    24: { c: 'Patel family depart', t: 'travel' },
    28: { c: 'Sandals final · Hayes', t: 'due' },
  };
  return (
    <ScreenFrame role="agent" tab="home" padding={20} scrollable>
      <ScreenHeader title="Calendar" subtitle="Trips, payments, and availability." actions={<><span className="chip chip-filter is-on">Month</span><span className="chip">Week</span><span className="chip">Agenda</span></>} small/>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button className="btn-icon"><Icon name="chevron_left" size={16}/></button>
          <div className="t-title-l" style={{ margin: 0 }}>May 2026</div>
          <button className="btn-icon"><Icon name="chevron_right" size={16}/></button>
          <button className="btn btn-tonal btn-sm" style={{ marginLeft: 'auto' }}><Icon name="plus" size={12}/> Block availability</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid var(--md-outline-variant)', borderLeft: '1px solid var(--md-outline-variant)' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
            <div key={d} style={{ padding: 8, font: '600 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', borderRight: '1px solid var(--md-outline-variant)', borderBottom: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-2)' }}>{d}</div>
          ))}
          {days.map((dayNum, i) => {
            const inMonth = dayNum >= 1 && dayNum <= 31;
            const ev = events[dayNum];
            const today = dayNum === 14;
            return (
              <div key={i} style={{ minHeight: 88, padding: 6, borderRight: '1px solid var(--md-outline-variant)', borderBottom: '1px solid var(--md-outline-variant)', background: today ? 'var(--md-primary-container)' : 'var(--md-surface-1)', opacity: inMonth ? 1 : 0.35 }}>
                <div style={{ font: '600 12px/1 var(--font-sans)', color: today ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>{inMonth ? dayNum : ''}</div>
                {ev && (
                  <div style={{ marginTop: 6, padding: '3px 6px', borderRadius: 4, font: '600 10px/1.2 var(--font-sans)', background: ev.t === 'today' ? 'var(--md-primary)' : ev.t === 'due' ? 'var(--md-error-container)' : ev.t === 'travel' ? 'var(--md-tertiary-container)' : 'var(--md-warning-container)', color: ev.t === 'today' ? 'var(--md-on-primary)' : 'var(--md-on-surface)' }}>{ev.c}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, font: '500 12px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
        <span><span className="dot" style={{ background: 'var(--md-error)' }}/> Payment due</span>
        <span><span className="dot" style={{ background: 'var(--md-tertiary)' }}/> Travel day</span>
        <span><span className="dot" style={{ background: 'var(--md-warning)' }}/> Proposal milestone</span>
        <span><span className="dot" style={{ background: 'var(--md-primary)' }}/> Today</span>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { A321_Worklist, A322_Pipeline, A323_Calendar });
