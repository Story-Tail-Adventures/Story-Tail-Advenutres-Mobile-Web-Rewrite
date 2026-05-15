/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.8 Leads — 5 screens · 3.9 Login Support — 7 screens · 3.10 Messaging & Templates — 6 screens.

// ─── 3.8 LEADS ───────────────────────────────────────────────────────────
// 3.8.1 Leads Inbox
function A381_LeadsInbox() {
  const rows = [
    { n: 'Tasha Whitfield', src: 'Self-guided search', want: 'Aruba honeymoon · Oct 12-19', age: '2h', sla: 'ok', val: 3800 },
    { n: 'Eli Park', src: 'Referral · Maya Carter', want: 'Cruise · 4 pax · Spring break', age: '14h', sla: 'ok', val: 9000 },
    { n: 'Linda Gomez', src: 'Marketing form', want: 'All-inclusive · adults-only · Sep', age: '23h', sla: 'warn', val: 5200 },
    { n: 'Kim Wallace', src: 'Search · saved 3 trips', want: 'Solo · Aruba · Jun', age: '2d', sla: 'late', val: 2400 },
    { n: 'Marin & Joe', src: 'Self-guided search', want: 'Sandals St Lucia · honeymoon · Nov', age: '3d', sla: 'late', val: 6800 },
  ];
  return (
    <ScreenFrame role="agent" tab="leads" padding={20} scrollable>
      <ScreenHeader title="Leads" subtitle="From self-guided search, referrals, and the marketing site." actions={<><span className="chip chip-filter is-on">Unread · 3</span><span className="chip">All sources</span></>} small/>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Lead</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Wants</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Source</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Est. value</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>SLA</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px' }}><div className="t-title-s">{r.n}</div></td>
                <td style={{ padding: '10px 14px' }}>{r.want}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.src}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.val.toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 11.5px/1 var(--font-sans)', color: r.sla === 'ok' ? 'var(--md-success)' : r.sla === 'warn' ? 'var(--md-warning)' : 'var(--md-error)' }}>
                    <span className="dot" style={{ background: 'currentColor' }}/> {r.age}{r.sla === 'late' && ' · past SLA'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}><button className="btn btn-filled btn-sm">Reach out</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.8.2 Lead Detail
function A382_LeadDetail() {
  return (
    <ScreenFrame role="agent" tab="leads" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to leads</button>
      <ScreenHeader title="Tasha Whitfield · Aruba honeymoon" subtitle="Self-guided search · 2 hours ago · saved 3 trips" actions={<><button className="btn btn-outlined btn-sm">Reject</button><button className="btn btn-orange btn-sm"><Icon name="briefcase" size={12}/> Convert to trip</button></>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="t-title-l" style={{ margin: 0 }}>What they want</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 10 }}>
            {[{ l: 'Destination', v: 'Aruba' }, { l: 'Dates', v: 'Oct 12 – 19, 2026' }, { l: 'Travelers', v: '2 adults · honeymoon' }, { l: 'Budget', v: '$3,500 – $4,500 /pp' }, { l: 'Trip type', v: 'All-inclusive · adults-only' }, { l: 'Departure city', v: 'Atlanta (ATL)' }].map((k) => (
              <div key={k.l}><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{k.l}</div><div className="t-body" style={{ marginTop: 2 }}>{k.v}</div></div>
            ))}
          </div>
          <hr className="divider" style={{ margin: '14px 0' }}/>
          <div className="t-title-s">Free-text from form</div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6, fontStyle: 'italic' }}>"We just got engaged and want something easy + romantic. Both pescatarian. Anniversary is the 14th — anything you can do to make it special would be cool. We've heard great things about Aruba."</p>
          <div className="t-title-s" style={{ marginTop: 14 }}>Saved trips · 3</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 6 }}>
            {['aruba','sunset','overwater'].map((k, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <img src={staImg(k, 240, 140)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover' }}/>
                <div style={{ padding: 8 }}>
                  <div className="t-title-s" style={{ fontSize: 12.5 }}>{['Aruba Marriott','Bucuti & Tara','Renaissance Aruba'][i]}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>${['3,890','4,210','3,640'][i]}/pp</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-title-s">Contact</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>tasha.w@gmail.com<br/>+1 (404) 555-0192</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}><button className="btn btn-tonal btn-sm" style={{ flex: 1 }}><Icon name="message" size={12}/> Message</button><button className="btn btn-outlined btn-sm" style={{ flex: 1 }}><Icon name="phone" size={12}/> Call</button></div>
          </div>
          <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}>
            <div className="t-title-s">No existing account</div>
            <div className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>You can convert to client + trip in one step. Send portal invite afterward.</div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.8.3 Convert Lead to Trip
function A383_ConvertLead() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 580, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Convert lead to trip · Tasha Whitfield</h2>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>CLIENT</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span className="chip chip-filter is-on" style={{ height: 28 }}>Create new client</span>
              <span className="chip" style={{ height: 28 }}>Attach to existing</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div><label className="field-label">First name</label><input className="input" defaultValue="Tasha"/></div>
            <div><label className="field-label">Last name</label><input className="input" defaultValue="Whitfield"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Email</label><input className="input" defaultValue="tasha.w@gmail.com"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Trip name</label><input className="input" defaultValue="Whitfield honeymoon · Aruba · Oct 2026"/></div>
            <div><label className="field-label">Trip type</label><input className="input" defaultValue="All-inclusive · honeymoon"/></div>
            <div><label className="field-label">Starting stage</label><input className="input" defaultValue="Inquiry"/></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, font: '500 12.5px/1.4 var(--font-sans)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span>
            Send portal invite with "lead response" template
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Continue to builder <Icon name="arrow_right" size={12}/></button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.8.4 Reject / Archive Lead
function A384_RejectLead() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 480, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Archive lead · Linda Gomez</h2>
          <div><label className="field-label" style={{ marginTop: 12 }}>Reason</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Out of region','Budget mismatch ✓','Duplicate','Not responding','Other'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}</div>
          </div>
          <div style={{ marginTop: 10 }}><label className="field-label">Notes (internal)</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Budget $1,000/pp · below our supplier minimums."/></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: '500 12.5px/1.4 var(--font-sans)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)' }}/> Send "thanks but not a fit" template
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>Archive lead</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.8.5 Lead Source Analytics
function A385_LeadAnalytics() {
  return (
    <ScreenFrame role="agent" tab="leads" padding={24} scrollable>
      <ScreenHeader title="Lead source · analytics" subtitle="Where leads come from, how well they convert." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">By source · last 90 days</div>
          {[
            { s: 'Self-guided search', n: 28, conv: 32, c: 'var(--brand-burgundy)' },
            { s: 'Referrals', n: 14, conv: 50, c: 'var(--brand-orange)' },
            { s: 'Marketing site', n: 12, conv: 18, c: 'var(--brand-ocean)' },
            { s: 'Direct', n: 6, conv: 67, c: 'var(--brand-sunset)' },
          ].map((r) => (
            <div key={r.s} style={{ padding: '8px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="dot" style={{ background: r.c }}/>
                <div className="t-title-s" style={{ flex: 1, fontSize: 12.5 }}>{r.s}</div>
                <div className="t-body-s">{r.n} leads · {r.conv}% conv</div>
              </div>
              <div style={{ height: 4, background: 'var(--md-surface-3)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ width: `${r.conv}%`, height: '100%', background: r.c }}/>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Time to first contact</div>
          <div className="t-display-s" style={{ margin: '8px 0', color: 'var(--md-primary)' }}>1h 42m</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Average across 60 leads · target 2h.</div>
          <hr className="divider" style={{ margin: '12px 0' }}/>
          <div className="t-title-s">Best converting destination</div>
          <div className="t-body" style={{ marginTop: 4 }}>Caribbean · 42% conversion</div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// ─── 3.9 LOGIN SUPPORT ──────────────────────────────────────────────────
// 3.9.1 Client Account Management
function A391_AccountMgmt() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Jordan & Sam Hayes</button>
      <ScreenHeader title="Account admin · Jordan Hayes" subtitle="Help less-technical clients. Every action audit-logged." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Quick actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            {[
              { i: 'refresh', t: 'Send password reset' },
              { i: 'mail', t: 'Send magic-link login' },
              { i: 'check', t: 'Verify email manually' },
              { i: 'users', t: 'Merge duplicate accounts' },
              { i: 'lock', t: 'Lock account' },
              { i: 'list', t: 'View login activity' },
            ].map((a) => (
              <button key={a.t} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', cursor: 'pointer', background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--md-surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.i} size={14}/></span>
                <span className="t-title-s" style={{ flex: 1, fontSize: 12.5 }}>{a.t}</span>
                <Icon name="chevron_right" size={14} color="var(--md-on-surface-variant)"/>
              </button>
            ))}
          </div>
        </div>
        <aside className="card" style={{ padding: 14 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>STATUS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {[{ l: 'Account', v: 'Active', tone: 'booked' }, { l: 'Email', v: 'Verified', tone: 'booked' }, { l: 'MFA', v: 'On · Authy', tone: 'booked' }, { l: 'Last sign-in', v: '2h · Miami iPhone' }].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', font: '500 12.5px/1.4 var(--font-sans)' }}>
                <span style={{ color: 'var(--md-on-surface-variant)' }}>{s.l}</span>
                {s.tone ? <span className={`chip-status ${s.tone}`}>{s.v}</span> : <span>{s.v}</span>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

function ConfirmModal({ title, body, primary, danger, extra }) {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 480, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>{title}</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>{body}</p>
          {extra}
          <div className="card" style={{ padding: 10, marginTop: 12, background: 'var(--md-surface-2)', font: '500 11.5px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)', display: 'flex', gap: 8 }}>
            <Icon name="list" size={13}/> This action is audit-logged and visible to admins.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className={`btn ${danger ? 'btn-danger' : 'btn-filled'}`} style={{ marginLeft: 'auto' }}>{primary}</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.9.2 Send password reset
function A392_SendReset() { return <ConfirmModal title="Send password reset to Jordan?" body="An email goes to jordan.hayes@gmail.com with a 30-minute link. You won't see the password." primary="Send reset link"/>; }
// 3.9.3 Send magic link
function A393_SendMagic() { return <ConfirmModal title="Send a magic-link sign-in?" body="One-time link valid for 15 minutes. Sent to verified email only." primary="Send magic link"/>; }
// 3.9.4 Verify email manually
function A394_VerifyEmail() {
  return <ConfirmModal title="Manually mark email as verified?" body="Use only after out-of-band confirmation (phone call). Skips standard verification." primary="Mark verified" extra={
    <div><label className="field-label" style={{ marginTop: 12 }}>Confirmation method</label><input className="input" defaultValue="Phone call · verified DOB and last 4 of phone"/></div>
  }/>;
}
// 3.9.5 Lock / unlock
function A395_LockAccount() {
  return <ConfirmModal title="Lock Jordan's account?" body="Prevents new sign-ins. Existing sessions remain. Used for suspected fraud." danger primary="Lock account" extra={
    <div><label className="field-label" style={{ marginTop: 12 }}>Reason</label><input className="input" placeholder="e.g. suspicious sign-in from Atlanta"/></div>
  }/>;
}
// 3.9.6 Client login activity
function A396_LoginActivity() {
  return (
    <ScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <ScreenHeader title="Login activity · Jordan Hayes" subtitle="Recent sign-ins. Flag anything that looks off." small/>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>When</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Device</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Location</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>IP</th><th></th>
            </tr>
          </thead>
          <tbody>
            {[
              { d: '2h ago', dev: 'iPhone 17 · Safari', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
              { d: 'Yesterday', dev: 'Mac · Chrome', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
              { d: 'May 6 · 11:42p', dev: 'Android · Chrome', loc: 'Atlanta, GA', ip: '24.117.220.5', warn: true },
              { d: 'May 4 · 7:08p', dev: 'iPhone 17 · Safari', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px' }}>{r.d}</td>
                <td style={{ padding: '10px 14px' }}>{r.dev}</td>
                <td style={{ padding: '10px 14px', color: r.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{r.warn && '⚠ '}{r.loc}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--md-on-surface-variant)' }}>{r.ip}</td>
                <td style={{ padding: '10px 14px' }}>{r.warn ? <button className="btn btn-outlined btn-sm">Flag</button> : <span className="chip-status booked">Trusted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}
// 3.9.7 Merge duplicate accounts (reuse CRM)
function A397_MergeFromAdmin() {
  return <ConfirmModal title="Merge sam@hayes.email into jordan.hayes@gmail.com?" body="The source account becomes inactive; trips & cards roll up to the target. Best done on desktop." primary="Open merge tool →"/>;
}

// ─── 3.10 MESSAGING & TEMPLATES ──────────────────────────────────────────
// 3.10.1 Agent Inbox
function A3101_AgentInbox() {
  return (
    <ScreenFrame role="agent" tab="msg" padding={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 14px 6px' }}><div className="t-headline" style={{ margin: 0, fontSize: 20 }}>Inbox</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>5 unread · 2 past SLA</div></div>
          <div style={{ padding: '0 14px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['Unread ✓','By client','By trip','SLA past'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : 'chip-filter'}`} style={{ height: 24, fontSize: 11 }}>{t}</span>)}</div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {[
              { who: 'Maya Carter', m: '"Yes lock the upgrade!"', t: '2:14p', trip: 'Sandals · Jul', u: 2, a: 'avatarA', active: true },
              { who: 'Aisha Patel', m: '"Anything for under $3k?"', t: '11:22a', trip: 'Princess · May', u: 1, a: 'avatarE' },
              { who: 'Tasha Whitfield', m: '"Got your email — when can we…"', t: '10:08a', trip: 'Lead', u: 1, a: 'avatarE', warn: true },
              { who: 'Westbrook fam', m: '"Authorizing today, sorry for delay"', t: 'Yest', trip: 'Symphony · Dec', u: 0, a: 'avatarB' },
              { who: 'Linda Gomez', m: '"Can we talk tonight?"', t: 'May 12', trip: '—', u: 0, a: 'avatarA' },
            ].map((t, i) => (
              <div key={i} style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', background: t.active ? 'var(--md-secondary-container)' : 'transparent', borderLeft: t.active ? '3px solid var(--brand-orange)' : '3px solid transparent' }}>
                <img src={staImg(t.a, 64, 64)} alt="" style={{ width: 32, height: 32, borderRadius: 999 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex' }}><span className="t-title-s" style={{ flex: 1, fontSize: 12.5 }}>{t.who}</span><span className="t-body-s" style={{ color: t.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{t.warn && '⚠ '}{t.t}</span></div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.m}</div>
                  <div style={{ font: '600 10px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--brand-orange)', marginTop: 4 }}>· {t.trip}</div>
                </div>
                {t.u > 0 && <span style={{ background: 'var(--brand-orange)', color: '#FFF', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', font: '700 11px/1 var(--font-sans)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.u}</span>}
              </div>
            ))}
          </div>
        </aside>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}><div className="t-title-s">Maya Carter · Sandals · Jul honeymoon</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Last reply 2 min ago · client online</div></div>
            <button className="btn btn-tonal btn-sm"><Icon name="briefcase" size={12}/> Open trip</button>
          </div>
          <div style={{ flex: 1, padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { mine: false, t: '11:14a', b: "Yes lock the upgrade! 🥹" },
              { mine: true, t: '11:16a', b: 'Done — bungalow is yours. Sending the new proposal with adjusted balance now.' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '70%', background: m.mine ? 'var(--md-primary)' : 'var(--md-surface-1)', color: m.mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)', padding: '10px 14px', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', font: '400 13.5px/1.45 var(--font-sans)' }}>{m.b}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--md-outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)' }}>
              <Icon name="sparkle" size={14} color="var(--brand-orange)"/>
              <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Use template ▾</span>
              <span className="t-body-s" style={{ flex: 1, marginLeft: 8, color: 'var(--md-on-surface)' }}>Type a reply…</span>
              <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>Internal note</span><span style={{ width: 28, height: 16, background: 'var(--md-surface-3)', borderRadius: 999, padding: 2 }}><span style={{ width: 12, height: 12, background: '#FFF', borderRadius: 999, display: 'block' }}/></span>
              <button className="btn btn-filled btn-sm"><Icon name="send" size={12}/></button>
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.10.2 Conversation Thread (Agent View) — similar to inbox view but full bleed
function A3102_AgentThread() { return <A3101_AgentInbox/>; /* same component; the inbox shows the thread */ }

// 3.10.3 Template Picker
function A3103_TemplatePicker() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 720, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="sparkle" size={18} color="var(--brand-orange)"/>
            <h2 className="t-title-l" style={{ margin: 0 }}>Insert a template</h2>
            <button className="btn-icon" style={{ marginLeft: 'auto' }}><Icon name="close" size={16}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
            <div className="card" style={{ padding: 8, background: 'var(--md-surface-2)' }}>
              {['Lead response ✓','Proposal · honeymoon','Booking confirmation','Pre-trip · 14 day','Pre-trip · 7 day','Post-trip survey','Payment reminder'].map((t, i) => (
                <div key={t} style={{ padding: '8px 10px', borderRadius: 8, background: t.includes('✓') ? 'var(--md-secondary-container)' : 'transparent', color: t.includes('✓') ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)', font: '500 12.5px/1 var(--font-sans)', marginBottom: 2 }}>{t}</div>
              ))}
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PREVIEW · WITH JORDAN HAYES MERGED</div>
              <div className="t-body" style={{ marginTop: 8, font: '400 13.5px/1.55 var(--font-sans)' }}>
                Hey <b>Jordan</b>, thanks for reaching out about <b>Sandals Royal Bahamian</b>. I'd love to put together a couple options for <b>Aug 12 – 19</b> — give me a few hours and I'll come back with two routes I'd actually want for you.
                <br/><br/>— Gyasi
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}>Insert & edit</button>
            <button className="btn btn-filled">Insert as-is</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.10.4 Template Library
function A3104_TemplateLibrary() {
  return (
    <ScreenFrame role="agent" tab="msg" padding={24} scrollable>
      <ScreenHeader title="Templates" subtitle="Reusable email + in-app messages. Grouped by stage." actions={<button className="btn btn-orange btn-sm"><Icon name="plus" size={12}/> New template</button>} small/>
      {[
        { g: 'Lead', items: [{ n: 'Lead response · within 2h', uses: 42 }, { n: 'Lead · not a fit', uses: 8 }] },
        { g: 'Proposal', items: [{ n: 'Proposal · honeymoon · 2 options', uses: 18 }, { n: 'Proposal · family cruise', uses: 11 }] },
        { g: 'Booking', items: [{ n: 'Booking confirmation', uses: 34 }, { n: 'Payment authorization needed', uses: 28 }] },
        { g: 'Pre / post', items: [{ n: 'Pre-trip · 14 day reminder', uses: 24 }, { n: 'Pre-trip · 7 day reminder', uses: 22 }, { n: 'Post-trip · survey', uses: 19 }] },
      ].map((g) => (
        <div key={g.g} style={{ marginBottom: 16 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{g.g}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 8 }}>
            {g.items.map((t) => (
              <div key={t.n} className="card" style={{ padding: 12 }}>
                <div className="t-title-s">{t.n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>Used {t.uses}× · last edited Apr 22</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><button className="btn btn-tonal btn-sm" style={{ flex: 1 }}>Edit</button><button className="btn btn-text btn-sm"><Icon name="copy" size={12}/></button></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </ScreenFrame>
  );
}

// 3.10.5 Template Editor
function A3105_TemplateEditor() {
  return (
    <ScreenFrame role="agent" tab="msg" padding={0}>
      <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Templates · Proposal</div>
          <h1 className="t-headline" style={{ margin: 0 }}>Proposal · honeymoon · 2 options</h1>
        </div>
        <button className="btn btn-text">Auto-save</button>
        <button className="btn btn-tonal">Preview</button>
        <button className="btn btn-filled">Save</button>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        <div style={{ padding: 18, overflow: 'auto', borderRight: '1px solid var(--md-outline-variant)' }}>
          <div><label className="field-label">Subject</label><input className="input" defaultValue="Your honeymoon · two options to choose from"/></div>
          <div style={{ marginTop: 10 }}><label className="field-label">Body · rich text</label>
            <textarea className="input" style={{ height: 280, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'none' }} defaultValue={`Hey {{client.firstName}},\n\nFinally have the two honeymoon options I love most for {{trip.destination}} ({{trip.dates}}). Take your time — I'll be around to chat through them.\n\nOption A · {{option.A.title}} — {{option.A.price}}\nOption B · {{option.B.title}} — {{option.B.price}}\n\nPing me whenever.\n— Gyasi`}/>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {['{{client.firstName}}','{{trip.destination}}','{{trip.dates}}','{{option.A.title}}','{{option.A.price}}','{{agent.name}}'].map((t) => <span key={t} className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, height: 22 }}>{t}</span>)}
          </div>
          <div style={{ marginTop: 12 }}><label className="field-label">Tags</label><div style={{ display: 'flex', gap: 6 }}>{['Honeymoon','Proposal','Sandals','2 options'].map((t) => <span key={t} className="chip">{t}</span>)}</div></div>
        </div>
        <div style={{ padding: 18, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>LIVE PREVIEW · WITH SAMPLE DATA</div>
          <div className="card" style={{ padding: 16, marginTop: 6 }}>
            <div className="t-title-s">Your honeymoon · two options to choose from</div>
            <div className="t-body" style={{ marginTop: 8, font: '400 13.5px/1.55 var(--font-sans)' }}>
              Hey <b>Jordan</b>,<br/><br/>
              Finally have the two honeymoon options I love most for <b>Nassau, Bahamas</b> (<b>Aug 12 – 19, 2026</b>). Take your time — I'll be around to chat through them.<br/><br/>
              <b>Option A</b> · Beachfront Walkout — <b>$3,290 / pp</b><br/>
              <b>Option B</b> · Over-water bungalow — <b>$3,970 / pp</b><br/><br/>
              Ping me whenever.<br/>— Gyasi
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.10.6 Bulk Send
function A3106_BulkSend() {
  return (
    <ScreenFrame role="agent" tab="msg" padding={28} scrollable>
      <ScreenHeader title="Bulk send · monthly hot deals" subtitle="Web-only. Segment + template + send." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Segment</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{['Active clients ✓','Caribbean travelers ✓','Past honeymooners','VIP','Inactive 6mo'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}</div>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>MATCHES</div>
            <div className="t-display-s" style={{ margin: '4px 0', fontSize: 22 }}>34 clients</div>
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Template</div>
          <input className="input" style={{ marginTop: 8 }} defaultValue="Hot deals · May 2026 · Caribbean focus"/>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginTop: 12 }}>SCHEDULE</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <span className="chip chip-filter is-on">Send now</span>
            <span className="chip">Schedule for…</span>
          </div>
        </div>
        <div className="card" style={{ padding: 18, gridColumn: 'span 2' }}>
          <div className="t-title-s">Preview · merged for first 3 recipients</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 8 }}>
            {['Jordan Hayes','Maya Carter','Aisha Patel'].map((n) => (
              <div key={n} className="card" style={{ padding: 12, background: 'var(--md-surface-2)' }}>
                <div className="t-title-s" style={{ fontSize: 12.5 }}>To: {n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>"Hey {n.split(' ')[0]} — 6 Caribbean trips just dropped 18%…"</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-tonal" style={{ marginLeft: 'auto' }}>Save draft</button>
            <button className="btn btn-filled"><Icon name="send" size={12}/> Send to 34</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  A381_LeadsInbox, A382_LeadDetail, A383_ConvertLead, A384_RejectLead, A385_LeadAnalytics,
  A391_AccountMgmt, A392_SendReset, A393_SendMagic, A394_VerifyEmail, A395_LockAccount, A396_LoginActivity, A397_MergeFromAdmin,
  A3101_AgentInbox, A3102_AgentThread, A3103_TemplatePicker, A3104_TemplateLibrary, A3105_TemplateEditor, A3106_BulkSend,
});
