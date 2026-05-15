/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.11 Reporting — 8 screens · 3.12 Agent Profile & Settings — 5 screens.

// ─── 3.11 REPORTING ──────────────────────────────────────────────────────

// 3.11.1 Reports Hub
function A3111_ReportsHub() {
  const tiles = [
    { i: 'chart', t: 'Revenue by month', s: 'Line · YoY toggle', fav: true },
    { i: 'dollar', t: 'Commission by supplier', s: 'Bar + table' },
    { i: 'pin', t: 'Top destinations', s: 'Map + ranking' },
    { i: 'users', t: 'Client lifetime value', s: 'Cohort analysis' },
    { i: 'trend_up', t: 'Conversion funnel', s: 'Lead → Booked → Travelled', fav: true },
    { i: 'briefcase', t: 'Pipeline value', s: 'Forecast · weighted' },
    { i: 'clock', t: 'Time-to-book', s: 'Inquiry → confirmation' },
    { i: 'download', t: 'Export center', s: 'CSV / Excel for tax' },
  ];
  return (
    <ScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <ScreenHeader title="Reports" subtitle="Snapshot of the business. All exportable." small/>
      <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>FAVORITES &amp; RECENT</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {tiles.map((t) => (
          <button key={t.t} className="card" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', position: 'relative', border: t.fav ? '1.5px solid var(--brand-orange)' : '1px solid var(--md-outline-variant)' }}>
            {t.fav && <Icon name="star" size={14} color="var(--brand-orange)" fill="var(--brand-orange)" style={{ position: 'absolute', top: 12, right: 12 }}/>}
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={t.i} size={18}/></span>
            <div className="t-title-s" style={{ marginTop: 10 }}>{t.t}</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{t.s}</div>
          </button>
        ))}
      </div>
    </ScreenFrame>
  );
}

function ReportShell({ title, sub, children }) {
  return (
    <ScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 6 }}><Icon name="arrow_left" size={12}/> Reports hub</button>
      <ScreenHeader title={title} subtitle={sub} actions={<><span className="chip chip-filter is-on">YTD</span><span className="chip">12mo</span><span className="chip">QTD</span><button className="btn btn-outlined btn-sm"><Icon name="download" size={12}/> Export</button></>} small/>
      {children}
    </ScreenFrame>
  );
}

// 3.11.2 Revenue by month
function A3112_Revenue() {
  const bars = [21,30,38,24,31,42,58,41,36,45,49,43];
  const max = 65;
  return (
    <ReportShell title="Revenue by month" sub="Booked dollars per month · YoY toggle.">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 10 }}>
          <div className="t-display-s" style={{ margin: 0 }}>$498,440 <span className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>YTD</span></div>
          <span className="chip" style={{ marginLeft: 'auto', background: 'var(--md-success-container)', color: 'var(--md-success)' }}>+22% vs LY</span>
        </div>
        <div style={{ height: 220, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          {bars.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '60%', height: `${(v/max)*100}%`, background: i === 11 ? 'var(--brand-orange)' : 'var(--brand-burgundy)', borderRadius: '4px 4px 0 0' }}/>
              <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </ReportShell>
  );
}

// 3.11.3 Commission by supplier
function A3113_CommBySupplier() {
  const rows = [
    { n: 'Sandals', v: 8420, c: '#7A1A1F', p: 38 },
    { n: 'Royal Caribbean', v: 5310, c: '#1565C0', p: 24 },
    { n: 'Atlantis', v: 4180, c: '#E87722', p: 18 },
    { n: 'Princess', v: 2210, c: '#F5A623', p: 10 },
    { n: 'Carnival', v: 1480, c: '#0D2137', p: 7 },
    { n: 'Other', v: 740, c: '#847370', p: 3 },
  ];
  return (
    <ReportShell title="Commission by supplier" sub="Where the money's coming from.">
      <div className="card" style={{ padding: 20 }}>
        {rows.map((r) => (
          <div key={r.n} style={{ padding: '10px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot" style={{ background: r.c }}/>
              <div className="t-title-s" style={{ flex: 1 }}>{r.n}</div>
              <div style={{ font: '700 13px/1 var(--font-mono)' }}>${r.v.toLocaleString()}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', minWidth: 50, textAlign: 'right' }}>{r.p}%</div>
            </div>
            <div style={{ height: 6, background: 'var(--md-surface-3)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${r.p}%`, height: '100%', background: r.c }}/>
            </div>
          </div>
        ))}
      </div>
    </ReportShell>
  );
}

// 3.11.4 Top destinations
function A3114_TopDestinations() {
  const rows = [
    { n: 'Bahamas', trips: 18, rev: 92400 },
    { n: 'Turks & Caicos', trips: 14, rev: 81200 },
    { n: 'Jamaica', trips: 11, rev: 58400 },
    { n: 'Aruba', trips: 7, rev: 32100 },
    { n: 'St Lucia', trips: 5, rev: 28600 },
    { n: 'Mexico', trips: 4, rev: 19200 },
  ];
  return (
    <ReportShell title="Top destinations" sub="By trip count and revenue.">
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 20, position: 'relative', overflow: 'hidden', minHeight: 320 }}>
          <img src={staImg('aruba', 800, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, filter: 'saturate(0.8) brightness(0.7)' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.4)' }}/>
          {rows.map((r, i) => (
            <div key={r.n} style={{ position: 'absolute', top: `${20 + i*12}%`, left: `${15 + (i%3)*25}%`, background: '#FFF', color: 'var(--brand-burgundy)', padding: '6px 10px', borderRadius: 999, font: '700 11.5px/1 var(--font-sans)', boxShadow: 'var(--md-shadow-1)' }}>{r.n} · {r.trips}</div>
          ))}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ font: '600 10.5px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}><th style={{ textAlign: 'left', padding: '8px 0' }}>Destination</th><th style={{ textAlign: 'right' }}>Trips</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                  <td style={{ padding: '8px 0', font: '500 13px/1 var(--font-sans)' }}>{r.n}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.trips}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.rev.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}

// 3.11.5 Client lifetime value
function A3115_LTV() {
  return (
    <ReportShell title="Client lifetime value" sub="Ranked. Click into a client for cohort analysis.">
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}><th style={{ textAlign: 'left', padding: '10px 14px' }}>Rank</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Client</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Trips</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>LTV</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Comm</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Cohort</th></tr></thead>
          <tbody>
            {[
              { n: 'Maya & Daniel Carter', tr: 4, ltv: 28420, c: 3811, co: '2023 Q4' },
              { n: 'Jordan & Sam Hayes', tr: 3, ltv: 18640, c: 2610, co: '2024 Q1' },
              { n: 'Westbrook family', tr: 3, ltv: 17240, c: 2068, co: '2024 Q2' },
              { n: 'Reggie & Marc', tr: 3, ltv: 15820, c: 2373, co: '2023 Q3' },
              { n: 'Khan family', tr: 2, ltv: 11200, c: 1456, co: '2024 Q4' },
            ].map((r, i) => (
              <tr key={r.n} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '700 13px/1 var(--font-mono)' }}>{i + 1}</td>
                <td style={{ padding: '10px 14px' }}>{r.n}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.tr}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.ltv.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--md-primary)' }}>${r.c.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.co}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

// 3.11.6 Conversion funnel
function A3116_Funnel() {
  const stages = [{ s: 'Lead', n: 142, w: 100 }, { s: 'Qualified', n: 96, w: 68 }, { s: 'Proposal', n: 54, w: 38 }, { s: 'Booked', n: 38, w: 27 }, { s: 'Travelled', n: 32, w: 23 }];
  return (
    <ReportShell title="Conversion funnel" sub="142 leads → 32 travelled · 22.5% end-to-end.">
      <div className="card" style={{ padding: 28 }}>
        {stages.map((s, i) => (
          <div key={s.s} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
            <div className="t-title-s" style={{ flex: '0 0 110px' }}>{s.s}</div>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{ width: `${s.w}%`, height: 38, background: i === 0 ? 'var(--md-primary-container)' : i === stages.length - 1 ? 'var(--md-success-container)' : 'var(--md-secondary-container)', color: 'var(--md-on-primary-container)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
                <span className="t-title-s">{s.n} trips</span>
                <span className="t-body-s" style={{ opacity: 0.85, fontWeight: 600 }}>{s.w}%</span>
              </div>
            </div>
            {i < stages.length - 1 && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', minWidth: 80, textAlign: 'right' }}>−{stages[i].n - stages[i+1].n} drop</div>}
          </div>
        ))}
      </div>
    </ReportShell>
  );
}

// 3.11.7 Pipeline value
function A3117_PipelineValue() {
  return <A3116_Funnel/>; // visually similar
}

// 3.11.8 Export Center
function A3118_ExportCenter() {
  return (
    <ScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <ScreenHeader title="Export center" subtitle="CSV / Excel exports for tax prep and accounting. Web-only." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Generate export</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div><label className="field-label">Type</label><input className="input" defaultValue="Commission ledger"/></div>
            <div><label className="field-label">Format</label><input className="input" defaultValue="CSV"/></div>
            <div><label className="field-label">From</label><input className="input" defaultValue="Jan 1, 2026"/></div>
            <div><label className="field-label">To</label><input className="input" defaultValue="May 14, 2026"/></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: '500 12.5px/1.4 var(--font-sans)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span>
            Include PII (client names, emails) · audit-logged
          </label>
          <button className="btn btn-filled" style={{ marginTop: 12, width: '100%' }}><Icon name="download" size={12}/> Generate</button>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Recent exports</div>
          {[
            { n: 'commission-jan-apr-2026.csv', s: '24 KB · May 12', ok: true },
            { n: 'clients-roster-2026.xlsx', s: '88 KB · May 04', ok: true },
            { n: 'pipeline-q1-2026.csv', s: '14 KB · Apr 01', expired: true },
          ].map((f) => (
            <div key={f.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
              <span style={{ width: 28, height: 34, borderRadius: 4, background: 'var(--brand-burgundy)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 8px/1 var(--font-sans)' }}>CSV</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 12.5 }}>{f.n}</div>
                <div className="t-body-s" style={{ color: f.expired ? 'var(--md-on-surface-variant)' : 'var(--md-on-surface)' }}>{f.s} {f.expired && '· expired'}</div>
              </div>
              {f.expired ? <span className="chip">Re-generate</span> : <button className="btn-icon"><Icon name="download" size={14}/></button>}
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// ─── 3.12 AGENT PROFILE & SETTINGS ──────────────────────────────────────

// 3.12.1 Agent Profile / My Account
function A3121_AgentProfile() {
  return (
    <ScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <ScreenHeader title="My profile" subtitle="What clients see in emails and the portal." actions={<><button className="btn btn-text">Cancel</button><button className="btn btn-filled">Save</button></>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <img src={staImg('avatarA', 200, 200)} alt="" style={{ width: 84, height: 84, borderRadius: 999 }}/>
            <div><div className="t-title-s">Profile photo</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>JPG / PNG · 400×400+</div><button className="btn btn-tonal btn-sm" style={{ marginTop: 6 }}>Upload new</button></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="field-label">Name</label><input className="input" defaultValue="Gyasi Story"/></div>
            <div><label className="field-label">Pronouns</label><input className="input" defaultValue="she/her"/></div>
            <div><label className="field-label">Email</label><input className="input" defaultValue="gyasi@story-tail.com"/></div>
            <div><label className="field-label">Phone</label><input className="input" defaultValue="+1 (305) 555-0184"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Bio · client-facing</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Caribbean specialist hosted by Inteletravel. Honeymoons, family cruises, and that one all-inclusive week you'll talk about for years."/></div>
            <div><label className="field-label">Instagram</label><input className="input" defaultValue="@story.tail.gyasi"/></div>
            <div><label className="field-label">LinkedIn</label><input className="input" defaultValue="linkedin.com/in/gyasistory"/></div>
          </div>
        </div>
        <aside className="card" style={{ padding: 14 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>HOW YOU APPEAR</div>
          <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-surface-2)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <img src={staImg('avatarA', 80, 80)} alt="" style={{ width: 44, height: 44, borderRadius: 999 }}/>
              <div><div className="t-title-s">Gyasi · Travel Advisor</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Online · reply in &lt; 2h</div></div>
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.12.2 Calendar / Availability
function A3122_AgentCalendar() {
  return (
    <ScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <ScreenHeader title="Availability" subtitle="Working hours, time zone, OOO, calendar sync." actions={<button className="btn btn-filled btn-sm">Save</button>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Working hours</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Time zone · America/New_York</div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '60px repeat(12,1fr)', gap: 2 }}>
            <div/>
            {['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'].map((h) => <div key={h} className="t-label" style={{ textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>{h}</div>)}
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, di) => (
              <React.Fragment key={d}>
                <div className="t-title-s" style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>{d}</div>
                {Array.from({ length: 12 }).map((_, hi) => {
                  const on = di < 5 && hi >= 1 && hi <= 9;
                  return <div key={hi} style={{ height: 22, borderRadius: 4, background: on ? 'var(--md-primary)' : 'var(--md-surface-3)' }}/>;
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Out of office</div>
          <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)' }}>
            <div className="t-title-s">Jul 4 – Jul 7</div>
            <div className="t-body-s" style={{ marginTop: 2 }}>Auto-reply enabled · Aria covering</div>
          </div>
          <button className="btn btn-tonal btn-sm" style={{ marginTop: 10 }}><Icon name="plus" size={12}/> Schedule OOO</button>
          <hr className="divider" style={{ margin: '14px 0' }}/>
          <div className="t-title-s">Calendar sync</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {[{ n: 'Google Calendar', on: true }, { n: 'Apple Calendar', on: false }].map((c) => (
              <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="t-body" style={{ flex: 1 }}>{c.n}</div>
                <span style={{ width: 32, height: 18, borderRadius: 999, background: c.on ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 999, background: '#FFF', transform: c.on ? 'translateX(14px)' : 'translateX(0)' }}/></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.12.3 Agent Notification Preferences
function A3123_AgentNotifs() {
  const rows = [
    { l: 'New lead', e: true, p: true, s: true },
    { l: 'Client message', e: true, p: true, s: false },
    { l: 'Status change · auto', e: true, p: false, s: false },
    { l: 'Payment activity · client', e: true, p: true, s: false },
    { l: 'Commission received', e: true, p: false, s: false },
    { l: 'SLA approaching', e: true, p: true, s: true },
  ];
  return (
    <ScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <ScreenHeader title="Notifications · you" subtitle="When and how you get pinged." actions={<button className="btn btn-filled btn-sm">Save</button>} small/>
      <div className="card" style={{ padding: 0, maxWidth: 720 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px' }}>Trigger</th><th style={{ textAlign: 'center', padding: '12px 16px' }}>Email</th><th style={{ textAlign: 'center', padding: '12px 16px' }}>Push</th><th style={{ textAlign: 'center', padding: '12px 16px' }}>SMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.l} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)' }}>{r.l}</td>
                {['e','p','s'].map((k) => (
                  <td key={k} style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', width: 32, height: 18, borderRadius: 999, background: r[k] ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: '#FFF', transform: r[k] ? 'translateX(14px)' : 'translateX(0)' }}/></span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.12.4 Email Signature Configuration
function A3124_AgentSignature() {
  return (
    <ScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <ScreenHeader title="Email signature" subtitle="Appended to every outbound email. Story-Tail brand baked in." actions={<button className="btn btn-filled btn-sm">Save</button>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>EDIT</div>
          <textarea className="input" style={{ height: 240, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'none', marginTop: 6 }} defaultValue={`{{agent.name}}, Travel Advisor\nStory-Tail Adventures · Hosted by Inteletravel\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\n— Making travel an adventure —`}/>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>RENDERED · DESKTOP &amp; MOBILE EMAIL</div>
          <div className="card" style={{ padding: 14, marginTop: 8, background: 'var(--md-surface-1)' }}>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>From: Gyasi Story &lt;gyasi@story-tail.com&gt;</div>
            <hr className="divider" style={{ margin: '8px 0' }}/>
            <div className="t-body" style={{ marginBottom: 12 }}>Hey Maya, here's your proposal…</div>
            <div style={{ borderTop: '1px solid var(--md-outline-variant)', paddingTop: 10 }}>
              <div className="t-title-s">Gyasi Story, Travel Advisor</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Story-Tail Adventures · Hosted by Inteletravel</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>+1 (305) 555-0184 · gyasi@story-tail.com</div>
              <div className="t-body-s" style={{ color: 'var(--brand-orange)', fontWeight: 700, marginTop: 4 }}>— Making travel an adventure —</div>
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.12.5 Branding Settings
function A3125_Branding() {
  return (
    <ScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <ScreenHeader title="Branding · multi-agent (future)" subtitle="When other advisors join under Story-Tail, allow tasteful per-agent variants." actions={<span className="chip" style={{ background: 'var(--md-warning-container)', color: 'var(--md-on-surface)' }}>Phase 3+ · preview</span>} small/>
      <div className="card" style={{ padding: 18, maxWidth: 720 }}>
        <div className="t-title-s">Master brand · locked</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['#7A1A1F','#E87722','#FFC83F','#1E92E5','#0D2137'].map((c) => <div key={c} style={{ width: 48, height: 48, borderRadius: 10, background: c }}/>)}
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>Story-Tail Adventures master palette. Read-only.</div>

        <hr className="divider" style={{ margin: '18px 0' }}/>

        <div className="t-title-s">Per-agent overrides</div>
        <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-surface-2)' }}>
          <div className="t-body-s">Allowed:</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, font: '400 12.5px/1.55 var(--font-sans)' }}>
            <li>Personal headshot &amp; bio</li>
            <li>Phone &amp; email merge fields</li>
            <li>Optional accent color from approved sub-palette</li>
          </ul>
          <div className="t-body-s" style={{ marginTop: 6 }}>Not allowed:</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, font: '400 12.5px/1.55 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
            <li>Logo replacement</li>
            <li>Off-brand fonts</li>
            <li>Removing "Hosted by Inteletravel" footer</li>
          </ul>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="field-label">Your accent color (from approved sub-palette)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#7A1A1F','#E87722','#1E92E5','#6CD279'].map((c, i) => (
              <button key={c} style={{ width: 42, height: 42, borderRadius: 10, background: c, border: i === 0 ? '3px solid var(--md-on-surface)' : '1px solid var(--md-outline-variant)' }}/>
            ))}
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  A3111_ReportsHub, A3112_Revenue, A3113_CommBySupplier, A3114_TopDestinations,
  A3115_LTV, A3116_Funnel, A3117_PipelineValue, A3118_ExportCenter,
  A3121_AgentProfile, A3122_AgentCalendar, A3123_AgentNotifs, A3124_AgentSignature, A3125_Branding,
});
