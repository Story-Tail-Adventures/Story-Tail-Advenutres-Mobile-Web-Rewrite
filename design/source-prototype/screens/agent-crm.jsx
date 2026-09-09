/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.3 Client Management (CRM) — 12 screens.

function CRMShell({ children, tab = 'overview' }) {
  return (
    <ScreenFrame role="agent" tab="clients" padding={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '100%', overflow: 'hidden' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, background: 'var(--md-surface-3)', height: 32, color: 'var(--md-on-surface-variant)' }}><Icon name="search" size={13}/><span className="t-body-s">Search clients · ⌘K</span></div>
          </div>
          <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['Active ✓','VIP','Honeymoon','New'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : 'chip-filter'}`} style={{ height: 24, fontSize: 11 }}>{t}</span>)}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {[
              { n: 'Jordan & Sam Hayes', m: 'Honeymoon · Aug', a: 'avatarC', val: 6480, active: true },
              { n: 'Maya & Daniel Carter', m: 'VIP · 4 trips', a: 'avatarA', val: 14820 },
              { n: 'Westbrook family', m: 'Family · 4 pax', a: 'avatarB', val: 9120 },
              { n: 'Aisha Patel', m: 'Cruise · May', a: 'avatarE', val: 3200 },
              { n: 'Reggie & Marc', m: 'Traveling', a: 'avatarF', val: 5800 },
              { n: 'Linda Gomez', m: 'Lead · new', a: 'avatarA', val: 0 },
              { n: 'Eli Park', m: 'Referral', a: 'avatarF', val: 0 },
            ].map((c) => (
              <div key={c.n} style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', background: c.active ? 'var(--md-secondary-container)' : 'transparent', borderLeft: c.active ? '3px solid var(--brand-orange)' : '3px solid transparent', cursor: 'pointer' }}>
                <img src={staImg(c.a, 64, 64)} alt="" style={{ width: 32, height: 32, borderRadius: 999 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s" style={{ color: c.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)' }}>{c.n}</div>
                  <div className="t-body-s" style={{ color: c.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}>{c.m}</div>
                </div>
                {c.val > 0 && <div style={{ font: '700 11px/1 var(--font-mono)', color: c.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}>${c.val.toLocaleString()}</div>}
              </div>
            ))}
          </div>
        </aside>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 20, background: 'linear-gradient(110deg, var(--md-primary-container), var(--md-secondary-container))', display: 'flex', gap: 14, alignItems: 'center', borderBottom: '1px solid var(--md-outline-variant)' }}>
            <img src={staImg('avatarC', 200, 200)} alt="" style={{ width: 72, height: 72, borderRadius: 999, border: '3px solid #FFF' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <h1 className="t-headline" style={{ margin: 0 }}>Jordan & Sam Hayes</h1>
                <span className="chip-status booked">Active</span>
                <span className="chip-status proposal">Trip in motion</span>
              </div>
              <div style={{ font: '500 12.5px/1.3 var(--font-sans)', display: 'flex', gap: 14, marginTop: 4, color: 'var(--md-on-primary-container)' }}>
                <span>jordan.hayes@example.com</span><span>+1 (305) 555-0184</span><span>Miami, FL</span><span>Since Mar 2024</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-tonal btn-sm"><Icon name="message" size={12}/></button>
              <button className="btn btn-tonal btn-sm"><Icon name="phone" size={12}/></button>
              <button className="btn btn-filled btn-sm"><Icon name="plus" size={12}/> New trip</button>
            </div>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--md-outline-variant)', padding: '0 14px' }}>
            {[{i:'overview',l:'Overview'},{i:'trips',l:'Trips · 4'},{i:'msg',l:'Messages'},{i:'docs',l:'Documents · 5'},{i:'notes',l:'Notes'},{i:'activity',l:'Activity'},{i:'admin',l:'Account admin'}].map((t) => (
              <button key={t.i} style={{ padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer', font: '600 12.5px/1 var(--font-sans)', color: t.i === tab ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)', borderBottom: t.i === tab ? '3px solid var(--brand-orange)' : '3px solid transparent', marginBottom: -1 }}>{t.l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>{children}</div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.3.1 Client List / Roster (full-page version)
function A331_ClientList() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={20} scrollable>
      <ScreenHeader title="Clients · roster" subtitle="68 active · 14 in motion · 4 leads to qualify." actions={<><button className="btn btn-outlined btn-sm"><Icon name="filter" size={12}/> Filters</button><button className="btn btn-orange btn-sm"><Icon name="plus" size={12}/> New client</button></>} small/>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, background: 'var(--md-surface-3)', height: 36 }}><Icon name="search" size={14}/><span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Search by name, email, trip…</span></div>
        {['Active','VIP','Honeymoon','Family','Lead','Archived'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}><input type="checkbox"/></th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Client</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Last trip</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Next trip</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Lifetime $</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[
              { n: 'Jordan & Sam Hayes', e: 'jordan.hayes@example.com', last: 'Symphony · Mar 25', next: 'Sandals · Aug 26', val: 18640, tags: ['VIP','Honeymoon'], a: 'avatarC' },
              { n: 'Maya & Daniel Carter', e: 'maya@example.com', last: 'Turks · Apr 25', next: 'Sandals · Jul 26', val: 14820, tags: ['VIP'], a: 'avatarA' },
              { n: 'Westbrook family', e: 'wfam@example.com', last: 'Atlantis · Apr 26', next: 'Symphony · Dec 26', val: 9120, tags: ['Family'], a: 'avatarB' },
              { n: 'Aisha Patel', e: 'aisha.patel@example.com', last: '—', next: 'Princess · May 26', val: 3200, tags: ['New'], a: 'avatarE' },
              { n: 'Reggie & Marc', e: 'reggie@example.com', last: 'Sandals · Aug 25', next: 'Now · St Lucia', val: 5800, tags: ['Traveling'], a: 'avatarF' },
              { n: 'Linda Gomez', e: 'gomez.lj@example.com', last: '—', next: '—', val: 0, tags: ['Lead'], a: 'avatarA' },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px' }}><input type="checkbox"/></td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <img src={staImg(r.a, 64, 64)} alt="" style={{ width: 32, height: 32, borderRadius: 999 }}/>
                    <div><div className="t-title-s">{r.n}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.e}</div></div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)', font: '500 12.5px/1 var(--font-sans)' }}>{r.last}</td>
                <td style={{ padding: '10px 14px', font: '500 12.5px/1 var(--font-sans)' }}>{r.next}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.val ? `$${r.val.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '10px 14px' }}>{r.tags.map((t) => <span key={t} className="chip" style={{ height: 20, fontSize: 10.5, marginRight: 4 }}>{t}</span>)}</td>
                <td style={{ padding: '10px 14px' }}><button className="btn-icon" style={{ width: 28, height: 28 }}><Icon name="more_vert" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.3.2 Client Detail / Profile (wrapper, defaults to Overview tab)
function A332_ClientDetail() {
  return (
    <CRMShell tab="overview">
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}><div className="t-title-l" style={{ margin: 0 }}>Snapshot</div><button className="btn btn-text btn-sm" style={{ marginLeft: 'auto' }}>Edit</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 18, marginTop: 8 }}>
              {[
                { l: 'Phone', v: '+1 (305) 555-0184' },
                { l: 'Email', v: 'jordan.hayes@example.com' },
                { l: 'Address', v: '1240 Brickell Bay Dr, Miami' },
                { l: 'Birthdays', v: 'Jordan · Apr 22 · Sam · Nov 3' },
                { l: 'Anniversary', v: 'Sep 14 (surprise flag)' },
                { l: 'Frequent flyer', v: 'AAdvantage Platinum' },
              ].map((kv) => (
                <div key={kv.l}><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</div><div className="t-body" style={{ marginTop: 2 }}>{kv.v}</div></div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="t-title-l" style={{ margin: 0, marginBottom: 8 }}>Preferences</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Caribbean','Bahamas','All-inclusive','Honeymoon','Adults-only','Pescatarian (Sam)','Anniversary surprise OK'].map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[{ l: 'Lifetime $', v: '$18,640' }, { l: 'Trips', v: '3 · 1 active' }, { l: 'Commission', v: '$2,610' }, { l: 'Last contact', v: '2h ago' }].map((k) => (
              <div key={k.l} className="card" style={{ padding: 10 }}>
                <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{k.l}</div>
                <div className="t-title-s" style={{ marginTop: 2 }}>{k.v}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-title-s">Household</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {['avatarC','avatarF','avatarD'].map((a, i) => <img key={i} src={staImg(a, 48, 48)} alt="" style={{ width: 28, height: 28, borderRadius: 999, border: '2px solid var(--md-surface-1)', marginLeft: i ? -6 : 0 }}/>)}
              <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', alignSelf: 'center', marginLeft: 4 }}>Sam (spouse) · Ava (child)</span>
            </div>
          </div>
        </aside>
      </div>
    </CRMShell>
  );
}

// 3.3.3 Overview tab is the same as detail above; we still expose it for completeness.
function A333_OverviewTab() { return <A332_ClientDetail/>; }

// 3.3.4 Trips tab
function A334_TripsTab() {
  return (
    <CRMShell tab="trips">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['Active · 1','Past · 3','Cancelled · 0'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
        <button className="btn btn-orange btn-sm" style={{ marginLeft: 'auto' }}><Icon name="plus" size={12}/> New trip for client</button>
      </div>
      {[
        { i: 'overwater', t: 'Sandals Royal Bahamian · Honeymoon', d: 'Aug 12 – 19, 2026', v: 6480, c: 970, s: 'Booked', stat: 'booked' },
        { i: 'cruiseShip', t: 'Royal Caribbean · Symphony', d: 'Mar 4 – 11, 2025', v: 5240, c: 685, s: 'Past', stat: 'past' },
        { i: 'turks', t: 'Beaches T&C · Family', d: 'Jan 6 – 13, 2024', v: 6920, c: 955, s: 'Past', stat: 'past' },
      ].map((r, i) => (
        <div key={i} className="card" style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', padding: 0, marginBottom: 8, alignItems: 'center' }}>
          <img src={staImg(r.i, 220, 140)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover' }}/>
          <div style={{ padding: '10px 14px' }}><div className="t-title-s">{r.t}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.d}</div></div>
          <div style={{ padding: '0 14px', textAlign: 'right' }}>
            <div style={{ font: '700 13px/1 var(--font-mono)' }}>${r.v.toLocaleString()}</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Comm ${r.c}</div>
          </div>
          <div style={{ padding: '0 14px' }}><span className={`chip-status ${r.stat}`}>{r.s}</span></div>
        </div>
      ))}
    </CRMShell>
  );
}

// 3.3.5 Messages tab
function A335_MessagesTab() {
  return (
    <CRMShell tab="msg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { sub: 'Sandals upgrade locked in', last: 'Yes please. Sam will lose it 😍', t: '2h', unread: 2 },
          { sub: 'New family cruise idea', last: 'Sounds great — send the details!', t: 'Tue', unread: 0 },
          { sub: 'Welcome to Story-Tail', last: 'Thanks for getting me set up', t: 'Mar 14', unread: 0 },
        ].map((m, i) => (
          <div key={i} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Icon name="message" size={16} color="var(--md-primary)"/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{m.sub}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{m.last}</div>
            </div>
            <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{m.t}</span>
            {m.unread > 0 && <span style={{ background: 'var(--brand-orange)', color: '#FFF', borderRadius: 999, padding: '2px 8px', font: '700 11px/1 var(--font-sans)' }}>{m.unread}</span>}
          </div>
        ))}
        <button className="btn btn-tonal btn-sm" style={{ alignSelf: 'flex-start' }}><Icon name="plus" size={12}/> New thread</button>
      </div>
    </CRMShell>
  );
}

// 3.3.6 Documents tab
function A336_DocumentsTab() {
  return (
    <CRMShell tab="docs">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['All · 5','Passport','Insurance','Confirmations'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { n: 'passport-jordan.jpg', s: 'Jordan · exp 08/29', i: 'IMG' },
          { n: 'passport-sam.jpg', s: 'Sam · exp 02/27 · warn', i: 'IMG' },
          { n: 'sandals-confirmation.pdf', s: 'Sandals · Aug 2026', i: 'PDF' },
          { n: 'allianz-policy.pdf', s: 'Insurance · active', i: 'PDF' },
          { n: 'global-entry.pdf', s: 'Jordan · exp 09/26', i: 'PDF' },
        ].map((d) => (
          <div key={d.n} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 36, height: 44, borderRadius: 4, background: d.i === 'PDF' ? 'var(--brand-burgundy)' : 'var(--brand-orange)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px/1 var(--font-sans)' }}>{d.i}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title-s" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{d.s}</div>
            </div>
            <button className="btn-icon"><Icon name="download" size={14}/></button>
          </div>
        ))}
      </div>
    </CRMShell>
  );
}

// 3.3.7 Notes tab (internal)
function A337_NotesTab() {
  return (
    <CRMShell tab="notes">
      <div className="card" style={{ padding: 16 }}>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>NEW NOTE · INTERNAL ONLY</div>
        <textarea className="input" style={{ height: 80, padding: 12, marginTop: 6, resize: 'none' }} placeholder="Internal note (client doesn't see this)…"/>
        <button className="btn btn-tonal btn-sm" style={{ marginTop: 8 }}>Save note</button>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { d: 'May 12 · 2:14p', a: 'Gyasi', n: 'Jordan asked about Greece for 2027 — Sandals competitor? Save for fall outreach.' },
          { d: 'Apr 02 · 11:30a', a: 'Gyasi', n: "Sam's mom paid the deposit on the Symphony trip — check refund routing if cancelled." },
          { d: 'Mar 14 · 9:14a', a: 'Gyasi', n: 'Anniversary couple. Sep 14. Surprise flag set.' },
        ].map((n, i) => (
          <div key={i} className="card" style={{ padding: 14, background: 'var(--md-surface-2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{n.d}</span><span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>· {n.a}</span></div>
            <div className="t-body" style={{ marginTop: 4 }}>{n.n}</div>
          </div>
        ))}
      </div>
    </CRMShell>
  );
}

// 3.3.8 Activity log
function A338_ActivityLog() {
  return (
    <CRMShell tab="activity">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['All','Cards','Auth','Trips','Messages'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { t: '2h', a: 'Jordan signed in · Miami iPhone', i: 'user' },
          { t: '5h', a: 'Card VISA •••• 4242 used for Sandals $4,180', i: 'card' },
          { t: '1d', a: 'Replied to "Sandals upgrade" thread', i: 'message' },
          { t: '3d', a: 'Authorized VISA •••• 4242 · cap $4,598', i: 'shield' },
          { t: '12d', a: 'Sandals deposit captured · $800', i: 'card' },
          { t: '1mo', a: 'Trip "Sandals · Aug" status → Booked', i: 'check' },
        ].map((e, i) => (
          <div key={i} className="card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={e.i} size={13}/></span>
            <div className="t-body" style={{ flex: 1 }}>{e.a}</div>
            <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{e.t}</span>
          </div>
        ))}
      </div>
    </CRMShell>
  );
}

// 3.3.9 Create Client
function A339_CreateClient() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <ScreenHeader title="New client" subtitle="Required: name + email. Everything else can be added later." small/>
      <div className="card" style={{ padding: 20, maxWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="field-label">First name *</label><input className="input"/></div>
          <div><label className="field-label">Last name *</label><input className="input"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Email *</label><input className="input" placeholder="they@example.com"/></div>
          <div><label className="field-label">Phone</label><input className="input"/></div>
          <div><label className="field-label">Date of birth</label><input className="input"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Address</label><input className="input"/></div>
          <div><label className="field-label">Important dates · birthdays, anniversaries</label><input className="input"/></div>
          <div><label className="field-label">Tags</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Honeymoon','Family','VIP','Cruise','Returning'].map((t) => <span key={t} className="chip">{t}</span>)}</div></div>
        </div>
        <div className="card" style={{ padding: 12, marginTop: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="mail" size={16}/>
          <div className="t-body-s" style={{ flex: 1 }}>Send a portal invitation with welcome template?</div>
          <span style={{ width: 36, height: 22, borderRadius: 999, background: 'var(--md-primary)', padding: 2 }}><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 999, background: '#FFF', transform: 'translateX(14px)' }}/></span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn btn-text">Cancel</button>
          <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}>Save</button>
          <button className="btn btn-filled">Save &amp; create trip</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.3.10 Edit Client (same as Create with values prefilled)
function A3310_EditClient() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <ScreenHeader title="Edit · Jordan & Sam Hayes" subtitle="Email and phone changes notify the client." actions={<><button className="btn btn-text">Cancel</button><button className="btn btn-filled">Save</button></>} small/>
      <div className="card" style={{ padding: 20, maxWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="field-label">First name</label><input className="input" defaultValue="Jordan"/></div>
          <div><label className="field-label">Last name</label><input className="input" defaultValue="Hayes"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@example.com"/></div>
          <div><label className="field-label">Phone</label><input className="input" defaultValue="+1 (305) 555-0184"/></div>
          <div><label className="field-label">DOB</label><input className="input" defaultValue="04 / 22 / 1992"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Address</label><input className="input" defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Tags</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['VIP ✓','Honeymoon ✓','Caribbean ✓','Cruise','Family'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}</div></div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.3.11 Merge Clients
function A3311_MergeClients() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <ScreenHeader title="Merge duplicate clients" subtitle="Pick which value wins per field. Audit-logged. Best done on desktop." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 10, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 14 }}><div className="t-label">SOURCE</div><div className="t-title-s" style={{ marginTop: 4 }}>Sam Hayes · sam@example.com</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>1 trip · joined Apr 2024</div></div>
        <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>→</div>
        <div className="card" style={{ padding: 14 }}><div className="t-label">TARGET</div><div className="t-title-s" style={{ marginTop: 4 }}>Jordan & Sam Hayes · jordan.hayes@example.com</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>3 trips · joined Mar 2024</div></div>
      </div>
      <div className="card" style={{ padding: 0, marginTop: 14, maxWidth: 1080 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Field</th><th style={{ padding: '10px 14px' }}>Source</th><th style={{ padding: '10px 14px' }}>Target</th><th style={{ padding: '10px 14px' }}>Winner</th>
            </tr>
          </thead>
          <tbody>
            {[
              { f: 'Email', s: 'sam@example.com', t: 'jordan.hayes@example.com', w: 't' },
              { f: 'Phone', s: '305-555-0186', t: '305-555-0184', w: 'b' },
              { f: 'Address', s: '(blank)', t: '1240 Brickell Bay Dr…', w: 't' },
              { f: 'DOB', s: '11/03/1990', t: '04/22/1992', w: 'b' },
              { f: 'Tags', s: 'Cruise', t: 'VIP, Honeymoon', w: 'merge' },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '600 12.5px/1.4 var(--font-sans)' }}>{r.f}</td>
                <td style={{ padding: '10px 14px', color: r.w === 's' ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{r.s}</td>
                <td style={{ padding: '10px 14px', color: r.w === 't' ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{r.t}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="chip" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
                    {r.w === 's' ? 'Source' : r.w === 't' ? 'Target' : r.w === 'b' ? 'Both → keep target' : 'Merge'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, maxWidth: 1080 }}>
        <button className="btn btn-text">Cancel</button>
        <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}>Preview merged record</button>
        <button className="btn btn-filled"><Icon name="users" size={14}/> Merge clients</button>
      </div>
    </ScreenFrame>
  );
}

// 3.3.12 Archive / Restore
function A3312_Archive() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 520, padding: 22, boxShadow: 'var(--md-shadow-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={18}/></span>
            <div><span className="t-label-s" style={{ color: 'var(--md-warning)' }}>ARCHIVE CLIENT</span><h2 className="t-title-l" style={{ margin: 0 }}>Archive Linda Gomez?</h2></div>
          </div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>Hides them from the active roster. Past trips and audit log remain. You can restore anytime.</p>
          <div><label className="field-label">Reason (optional)</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} placeholder="e.g. Cold lead · no reply for 6 months"/></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}>Archive</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { A331_ClientList, A332_ClientDetail, A333_OverviewTab, A334_TripsTab, A335_MessagesTab, A336_DocumentsTab, A337_NotesTab, A338_ActivityLog, A339_CreateClient, A3310_EditClient, A3311_MergeClients, A3312_Archive });
