/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Client · 2.5 Account & Profile — 11 screens.

// 2.5.1 — Account Overview
function C251_AccountOverview() {
  const tiles = [
    { i: 'user', t: 'Personal info', s: 'Name, email, phone, address' },
    { i: 'heart', t: 'Travel preferences', s: 'Style, dietary, loyalty' },
    { i: 'passport', t: 'Travel documents', s: '5 files · 1 expiring soon' },
    { i: 'bell', t: 'Notifications', s: 'Email · push · SMS' },
    { i: 'shield', t: 'Security & MFA', s: 'MFA on · 1 active session' },
    { i: 'link', t: 'Connected accounts', s: 'Google linked · Apple not' },
    { i: 'lock', t: 'Privacy & data export', s: 'Download a copy of your data' },
    { i: 'question', t: 'Help & support', s: 'FAQ · contact Gyasi' },
  ];
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <div className="card" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18, background: 'linear-gradient(120deg, var(--md-primary-container), var(--md-secondary-container))', border: 0 }}>
        <img src={staImg('avatarC', 200, 200)} alt="" style={{ width: 84, height: 84, borderRadius: 999, border: '3px solid #FFF' }}/>
        <div style={{ flex: 1 }}>
          <h1 className="t-headline" style={{ margin: 0 }}>Jordan Hayes</h1>
          <div style={{ font: '500 12.5px/1.3 var(--font-sans)', color: 'var(--md-on-primary-container)', display: 'flex', gap: 14, marginTop: 4 }}>
            <span>jordan.hayes@gmail.com</span><span>·</span><span>Member since Mar 2024</span><span>·</span><span>Miami, FL</span>
          </div>
        </div>
        <div className="card" style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.5)', border: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>Member ID · STA-5839</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {tiles.map((t) => (
          <button key={t.t} className="card" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--md-outline-variant)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={t.i} size={18}/></span>
            <div className="t-title-s" style={{ marginTop: 10 }}>{t.t}</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{t.s}</div>
          </button>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.5.2 — Personal Info Edit
function C252_PersonalInfo() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Personal info" subtitle="Edit your contact details and emergency contact." actions={<><button className="btn btn-text">Cancel</button><button className="btn btn-filled">Save</button></>} small/>
      <div className="card" style={{ padding: 22, maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="field-label">First name</label><input className="input" defaultValue="Jordan"/></div>
          <div><label className="field-label">Last name</label><input className="input" defaultValue="Hayes"/></div>
          <div><label className="field-label">Email <span style={{ color: 'var(--md-warning)', fontWeight: 600 }}>· change requires verification</span></label><input className="input" defaultValue="jordan.hayes@gmail.com"/></div>
          <div><label className="field-label">Phone</label><input className="input" defaultValue="+1 (305) 555-0184"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Mailing address</label><input className="input" defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></div>
          <div><label className="field-label">Date of birth</label><input className="input" defaultValue="04 / 22 / 1992"/></div>
          <div><label className="field-label">Pronouns (optional)</label><input className="input" defaultValue="she/her"/></div>
          <div style={{ gridColumn: 'span 2' }}>
            <div className="t-title-s" style={{ margin: '6px 0 6px' }}>Emergency contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <input className="input" defaultValue="Sam Hayes"/>
              <input className="input" defaultValue="+1 (305) 555-0186"/>
              <input className="input" defaultValue="Spouse"/>
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.5.3 — Travel Preferences Edit
function C253_PreferencesEdit() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Travel preferences" subtitle="Helps Gyasi plan with all the right context." actions={<><button className="btn btn-text">Cancel</button><button className="btn btn-filled">Save</button></>} small/>
      <div className="card" style={{ padding: 22, maxWidth: 760 }}>
        {[
          { t: 'Preferred destinations', opts: ['Caribbean ✓','Bahamas ✓','Greece','Mexico','Italy','Iceland','Japan'] },
          { t: 'Travel style', opts: ['Resort ✓','Cruise ✓','Adventure','Family','Honeymoon ✓','Group'] },
          { t: 'Dietary', opts: ['No restrictions','Vegetarian','Pescatarian ✓ (Sam)','Gluten-free','Halal'] },
          { t: 'Accessibility', opts: ['None','Mobility-friendly','Quiet rooms','Service animal'] },
        ].map((g) => (
          <div key={g.t} style={{ marginBottom: 14 }}>
            <div className="t-title-s" style={{ marginBottom: 6 }}>{g.t}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.opts.map((o) => <span key={o} className={`chip ${o.includes('✓') ? 'chip-filter is-on' : ''}`}>{o}</span>)}
            </div>
          </div>
        ))}
        <div>
          <label className="field-label">Loyalty programs · frequent flyer numbers</label>
          <textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="AAdvantage 4ZE82Q (Platinum)&#10;IHG Rewards 92214"/>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Favorite past trips · free text</label>
          <textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Beaches T&C 2024 — the kids loved it. Symphony EC 2025 — would do again."/>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.5.4 — Travel Documents
function C254_TravelDocs() {
  return (
    <ScreenFrame role="client" tab="docs" padding={28} scrollable>
      <ScreenHeader title="Travel documents" subtitle="Passports, visas, insurance certificates. Encrypted at rest." actions={<button className="btn btn-orange"><Icon name="upload" size={14}/> Upload</button>} small/>
      <div className="card" style={{ padding: 14, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', border: 0, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="warning" size={18}/>
        <div className="t-body-s"><b>Heads up:</b> Sam's passport expires in 6 months. Some countries require 6 months' validity from re-entry.</div>
      </div>
      {[
        { t: 'Passports', docs: [{ n: 'passport-jordan.jpg', s: 'Exp 08/2029 · USA', ok: true }, { n: 'passport-sam.jpg', s: 'Exp 02/2027 · USA', warn: true }] },
        { t: 'Visas & ESTA', docs: [{ n: 'esta-approval-jordan.pdf', s: 'Valid through Mar 2028', ok: true }] },
        { t: 'Insurance', docs: [{ n: 'allianz-policy-987124.pdf', s: 'Sandals trip · expires Aug 26', ok: true }] },
      ].map((g) => (
        <div key={g.t} style={{ marginBottom: 16 }}>
          <div className="t-title-s" style={{ marginBottom: 8 }}>{g.t}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {g.docs.map((d) => (
              <div key={d.n} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 38, height: 46, borderRadius: 4, background: d.n.endsWith('.pdf') ? 'var(--brand-burgundy)' : 'var(--brand-orange)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px/1 var(--font-sans)' }}>
                  {d.n.endsWith('.pdf') ? 'PDF' : 'IMG'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</div>
                  <div className="t-body-s" style={{ color: d.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{d.warn && '⚠ '}{d.s}</div>
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

// 2.5.5 — Document Upload / Camera Capture
function C255_DocUpload() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.4)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 600, padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="t-title-l" style={{ margin: 0 }}>Upload a document</h2>
            <button className="btn-icon"><Icon name="close" size={18}/></button>
          </div>
          <div><label className="field-label">Document type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['Passport ✓','Visa','Insurance','Boarding pass','Confirmation','Other'].map((t) => <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>)}
            </div>
          </div>
          <div className="card" style={{ padding: 22, border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)', textAlign: 'center' }}>
            <Icon name="upload" size={32} color="var(--md-on-surface-variant)"/>
            <div className="t-title-s" style={{ marginTop: 8 }}>Drop a file or take a photo</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>JPG, PNG, PDF · up to 10 MB</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-tonal btn-sm">Browse files</button>
              <button className="btn btn-outlined btn-sm">📷 Take photo</button>
            </div>
          </div>
          <div className="card" style={{ padding: 14, marginTop: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
            <div className="t-label-s">PREVIEW · jordan-passport.jpg</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ width: 80, height: 100, borderRadius: 8, background: 'var(--brand-burgundy)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="passport" size={36}/>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div className="t-label">Number (OCR)</div><input className="input" style={{ height: 32, fontSize: 12, padding: '0 10px', fontFamily: 'var(--font-mono)' }} defaultValue="A123456789"/></div>
                <div><div className="t-label">Expiry</div><input className="input" style={{ height: 32, fontSize: 12, padding: '0 10px' }} defaultValue="08/22/2029"/></div>
                <div style={{ gridColumn: 'span 2' }}><div className="t-label">Name (OCR)</div><input className="input" style={{ height: 32, fontSize: 12, padding: '0 10px' }} defaultValue="HAYES, JORDAN E"/></div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Save document</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.5.6 — Notification Preferences
function C256_Notifications() {
  const rows = [
    { l: 'Trip status updates', e: true, p: true, s: false },
    { l: 'Itinerary changes', e: true, p: true, s: false },
    { l: 'Payment activity', e: true, p: true, s: true },
    { l: 'Card use · audit', e: true, p: true, s: false },
    { l: 'Pre-trip reminders · 14 days out', e: true, p: true, s: false },
    { l: 'Post-trip follow-up', e: true, p: false, s: false },
    { l: 'New messages from Gyasi', e: true, p: true, s: false },
    { l: 'Marketing · hot deals', e: false, p: false, s: false },
  ];
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Notifications" subtitle="Pick how and when we ping you. Trip-critical alerts can't be fully muted." actions={<button className="btn btn-filled btn-sm">Save</button>} small/>
      <div className="card" style={{ padding: 0, maxWidth: 760 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Notification</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Push</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>SMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.l} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)' }}>{r.l}</td>
                {['e','p','s'].map((k) => (
                  <td key={k} style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', width: 32, height: 18, borderRadius: 999, background: r[k] ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2, position: 'relative', verticalAlign: 'middle' }}>
                      <span style={{ position: 'absolute', top: 2, left: r[k] ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: '#FFF', transition: 'left 120ms' }}/>
                    </span>
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

// 2.5.7 — Security Settings
function C257_Security() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Security" subtitle="Password, MFA, and active sessions." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 920 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Password</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Last changed Mar 14, 2024</div>
          <button className="btn btn-tonal btn-sm" style={{ marginTop: 10 }}>Change password</button>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="t-title-s">Two-factor auth</div><span className="chip-status booked" style={{ marginLeft: 'auto' }}>On · Authy</span></div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>3 backup codes remaining</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="btn btn-outlined btn-sm">Manage</button>
            <button className="btn btn-text btn-sm">Show backup codes</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 0, maxWidth: 920 }}>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--md-outline-variant)' }}>
          <div className="t-title-s">Active sessions</div>
          <button className="btn btn-text btn-sm">Sign out of all devices</button>
        </div>
        {[
          { d: 'iPhone 17 · Safari', loc: 'Miami, FL · this device', last: 'Active now', ok: true },
          { d: 'MacBook Pro · Chrome', loc: 'Miami, FL', last: '2 hours ago', ok: true },
          { d: 'Unknown Android', loc: 'Atlanta, GA · suspicious?', last: 'Mar 28', warn: true },
        ].map((s, i) => (
          <div key={i} style={{ padding: '12px 18px', borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name={s.d.includes('iPhone') ? 'phone' : s.d.includes('Mac') ? 'briefcase' : 'shield'} size={18} color={s.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)'}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{s.d}</div>
              <div className="t-body-s" style={{ color: s.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>{s.loc} · {s.last}</div>
            </div>
            {s.ok ? <span className="chip-status booked">Trusted</span> : <button className="btn btn-danger btn-sm">Sign out</button>}
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.5.8 — Connected Accounts
function C258_Connected() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Connected accounts" subtitle="Social logins linked to your Story-Tail account." small/>
      <div className="card" style={{ padding: 0, maxWidth: 720 }}>
        {[
          { n: 'Google', email: 'jordan.hayes@gmail.com', on: true },
          { n: 'Apple', email: 'Not connected', on: false },
          { n: 'Facebook', email: 'Not connected · available', on: false },
        ].map((c, i) => (
          <div key={c.n} style={{ padding: '14px 18px', borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-surface-3)', color: 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 14px/1 var(--font-sans)' }}>{c.n[0]}</span>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{c.n}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.email}</div>
            </div>
            {c.on ? <button className="btn btn-outlined btn-sm">Disconnect</button> : <button className="btn btn-tonal btn-sm">Connect</button>}
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.5.9 — Privacy & Data Export
function C259_Privacy() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Privacy & data" subtitle="Download your data, manage tracking, or close your account." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 920 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="download" size={18}/><div className="t-title-l" style={{ margin: 0 }}>Download my data</div></div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>Includes profile, trips, messages, card metadata (not full PANs), and audit log. JSON + PDF.</p>
          <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)', marginTop: 10 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>LAST EXPORT</div>
            <div className="t-body" style={{ marginTop: 2 }}>Mar 14, 2024 · 14 MB · expired</div>
          </div>
          <button className="btn btn-filled" style={{ marginTop: 12 }}>Request export</button>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="shield" size={18}/><div className="t-title-l" style={{ margin: 0 }}>Tracking preferences</div></div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[{ l: 'Essential cookies', sub: 'Required for login', on: true, locked: true }, { l: 'Analytics', sub: 'Helps us improve', on: true }, { l: 'Marketing', sub: 'Personalize offers', on: false }].map((p) => (
              <div key={p.l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
                <div style={{ flex: 1 }}>
                  <div className="t-title-s">{p.l}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{p.sub}{p.locked && ' · always on'}</div>
                </div>
                <span style={{ width: 36, height: 22, borderRadius: 999, background: p.on ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2, opacity: p.locked ? 0.5 : 1 }}><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 999, background: '#FFF', transform: p.on ? 'translateX(14px)' : 'translateX(0)', transition: 'transform 120ms' }}/></span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 18, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', border: 0, maxWidth: 920 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="warning" size={18}/><div className="t-title-l" style={{ margin: 0 }}>Close my account</div></div>
        <p className="t-body-s" style={{ opacity: 0.85, marginTop: 6 }}>Trips are archived, cards revoked, personal identifiers anonymized. Transaction records retained for tax compliance.</p>
        <button className="btn" style={{ marginTop: 10, background: 'var(--md-on-error-container)', color: 'var(--md-error-container)' }}>Close my account</button>
      </div>
    </ScreenFrame>
  );
}

// 2.5.10 — Account Closure (modal confirmation)
function C2510_Closure() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 520, padding: 26, boxShadow: 'var(--md-shadow-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="warning" size={20}/></span>
            <div>
              <span className="t-label-s" style={{ color: 'var(--md-error)' }}>CONFIRM CLOSURE</span>
              <h2 className="t-title-l" style={{ margin: 0 }}>Close your Story-Tail account?</h2>
            </div>
          </div>
          <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)', marginTop: 8 }}>
            <div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>WHAT THIS DOES</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, font: '400 12.5px/1.6 var(--font-sans)', color: 'var(--md-on-surface)' }}>
              <li>All cards revoked immediately</li>
              <li>5 past trips archived (you can request a final PDF)</li>
              <li>Personal identifiers anonymized in 30 days</li>
              <li>Transaction records retained for tax compliance</li>
            </ul>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Reason (optional)</label>
            <textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} placeholder="Tell us why — helps Gyasi follow up if you reconsider."/>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Confirm your password</label>
            <input className="input" type="password" placeholder="Password"/>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>Close my account</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.5.11 — Help & Support
function C2511_Help() {
  return (
    <ScreenFrame role="client" tab="me" padding={28} scrollable>
      <ScreenHeader title="Help & support" subtitle="Quick answers, or message Gyasi directly." small/>
      <div className="card" style={{ padding: 18, display: 'flex', gap: 10, marginBottom: 14, background: 'var(--md-surface-2)' }}>
        <Icon name="search" size={18} color="var(--md-on-surface-variant)"/>
        <input style={{ flex: 1, border: 0, background: 'transparent', font: '400 14px/1 var(--font-sans)', color: 'var(--md-on-surface)' }} placeholder="Search: 'reset password', 'authorize card'…"/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div>
          <div className="t-title-s" style={{ marginBottom: 8 }}>Popular FAQs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Do I pay a planning fee?', 'How does payment authorization work?', 'Can I revoke a card?', 'How do I add a co-traveler?', 'Is my passport scan safe?', 'How does Inteletravel fit in?'].map((q) => (
              <details key={q} className="card" style={{ padding: 0 }}>
                <summary style={{ padding: '12px 14px', cursor: 'pointer', fontWeight: 600, color: 'var(--md-on-surface)', display: 'flex', justifyContent: 'space-between' }}>{q} <Icon name="chevron_down" size={14}/></summary>
                <div style={{ padding: '0 14px 12px', color: 'var(--md-on-surface-variant)', font: '400 12.5px/1.5 var(--font-sans)' }}>Short answer here — links to the relevant section of the privacy/terms or to Gyasi.</div>
              </details>
            ))}
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
            <div className="t-title-s">Talk to Gyasi</div>
            <p className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>Quickest path for anything trip-specific.</p>
            <button className="btn btn-filled btn-sm" style={{ marginTop: 10, background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}><Icon name="message" size={12}/> Message Gyasi</button>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="t-title-s">Platform support</div>
            <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>For login, payments, or account issues.</p>
            <button className="btn btn-tonal btn-sm" style={{ marginTop: 10 }}>support@story-tail.com</button>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C251_AccountOverview, C252_PersonalInfo, C253_PreferencesEdit, C254_TravelDocs, C255_DocUpload,
  C256_Notifications, C257_Security, C258_Connected, C259_Privacy, C2510_Closure, C2511_Help,
});
