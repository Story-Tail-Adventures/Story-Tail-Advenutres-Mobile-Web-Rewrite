/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.6 Payment & Card Management — 7 screens.

// 3.6.1 Card Vault (per trip)
function A361_CardVault() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <ScreenHeader title="Card vault · Sandals · Aug 2026" subtitle="Tokenized cards authorized for this trip. Never raw PANs at rest." actions={<button className="btn btn-orange btn-sm"><Icon name="plus" size={12}/> Request new auth</button>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, maxWidth: 1000 }}>
        {[
          { b: 'VISA', l: '4242', exp: '08/29', client: 'Jordan Hayes', cap: '$4,598', remaining: '$418', used: '$4,180', col: 'linear-gradient(135deg,#1A1F71,#5050E0)', active: true },
          { b: 'MC', l: '8801', exp: '03/27', client: 'Sam Hayes', cap: '$2,000', remaining: '$2,000', used: '$0', col: 'linear-gradient(135deg,#EB001B,#F79E1B)', active: true },
        ].map((c) => (
          <div key={c.l} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '8/5', background: c.col, padding: 14, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ font: '800 14px/1 var(--font-sans)' }}>{c.b}</span><Icon name="card" size={20}/></div>
              <div>
                <div style={{ font: '500 22px/1 var(--font-mono)', letterSpacing: 2 }}>•••• {c.l}</div>
                <div style={{ font: '500 11px/1.4 var(--font-sans)', marginTop: 4, opacity: 0.8 }}>{c.client} · exp {c.exp}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                <div><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>Cap</div><div className="t-title-s">{c.cap}</div></div>
                <div><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>Used</div><div className="t-title-s">{c.used}</div></div>
                <div><div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>Left</div><div className="t-title-s" style={{ color: 'var(--md-primary)' }}>{c.remaining}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-filled btn-sm" style={{ flex: 1 }}><Icon name="key" size={12}/> Reveal & use</button>
                <button className="btn btn-tonal btn-sm">Log use</button>
                <button className="btn-icon"><Icon name="more_vert" size={14}/></button>
              </div>
            </div>
          </div>
        ))}
        <button className="card" style={{ padding: 0, border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: 'var(--md-on-surface-variant)', minHeight: 220, cursor: 'pointer' }}>
          <Icon name="plus" size={28}/>
          <div className="t-title-s">Request a card from client</div>
          <div className="t-body-s">Sends a Stripe-secured link</div>
        </button>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="shield" size={16}/>
        <div className="t-body-s"><b>Every reveal is audited:</b> supplier, amount, reason, timestamp, agent. 60-second auto-clear of clipboard.</div>
      </div>
    </ScreenFrame>
  );
}

// 3.6.2 Request Card Authorization
function A362_RequestAuth() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.4)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 600, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Request a card from Jordan</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Sends a Stripe-secured form to the client. The card is tokenized before it leaves their browser.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div><label className="field-label">For trip</label><input className="input" defaultValue="Sandals · Aug 2026"/></div>
            <div><label className="field-label">Spending limit</label><input className="input" defaultValue="$4,598" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Authorization expires</label><input className="input" defaultValue="Aug 26, 2026 · trip end + 7"/></div>
            <div><label className="field-label">Notify via</label><input className="input" defaultValue="In-app + email"/></div>
          </div>
          <div style={{ marginTop: 10 }}><label className="field-label">Personal note</label><textarea className="input" style={{ height: 70, padding: 12, resize: 'none' }} defaultValue="Hey J — adding the final-balance card here so Sandals invoices me on the 28th."/></div>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PREVIEW</div>
            <div className="t-body-s" style={{ marginTop: 4 }}>"Jordan — Gyasi requested authorization for VISA on file (up to $4,598). Tap to confirm."</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}><Icon name="send" size={12}/> Send request</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.6.3 Authorization Request Sent
function A363_AuthRequestSent() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><Icon name="send" size={36}/></div>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>Request sent to Jordan</h1>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>Status is now <b>Awaiting client</b>. We'll ping you when they authorize.</p>
          <div className="card" style={{ padding: 14, marginTop: 14, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="dot" style={{ background: 'var(--md-warning)' }}/><div className="t-title-s">Pending authorization</div></div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Auto-nudge in 48 hours if no action.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-tonal btn-sm">Copy invite link</button><button className="btn btn-text btn-sm">Resend</button></div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.6.4 Reveal Card Number (audited)
function A364_RevealCard() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.7)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 540, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="key" size={20}/></span>
            <div><span className="t-label-s" style={{ color: 'var(--md-error)' }}>AUDITED ACTION · MFA STEP-UP</span><h2 className="t-title-l" style={{ margin: 0 }}>Reveal card number</h2></div>
          </div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Justify this reveal. The audit log will capture supplier, amount, and reason. Card auto-hides after 60 seconds.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div><label className="field-label">Supplier *</label><input className="input" defaultValue="Sandals Resorts"/></div>
            <div><label className="field-label">Amount *</label><input className="input" defaultValue="$4,180" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Reason *</label><input className="input" defaultValue="Final balance · per invoice SRB-INV-220119-FINAL"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Your MFA code *</label><input className="input" defaultValue="• • •  • • •" style={{ fontFamily: 'var(--font-mono)', letterSpacing: 8, textAlign: 'center' }}/></div>
          </div>
          <div className="card" style={{ padding: 14, marginTop: 12, background: '#0F0B0A', color: '#FFF', textAlign: 'center', position: 'relative' }}>
            <div style={{ font: '500 11px/1 var(--font-sans)', opacity: 0.7 }}>VISA •••• 4242 · Jordan Hayes</div>
            <div style={{ font: '700 26px/1.2 var(--font-mono)', letterSpacing: 3, marginTop: 6 }}>4242 4242 4242 4242</div>
            <div style={{ font: '500 12px/1 var(--font-mono)', opacity: 0.7, marginTop: 4 }}>08 / 29 · CVC 314</div>
            <div style={{ position: 'absolute', top: 8, right: 12, font: '600 10.5px/1 var(--font-mono)', color: '#FFC83F' }}>auto-clear in 0:58</div>
            <button className="btn btn-filled btn-sm" style={{ marginTop: 12, background: '#FFF', color: '#0F0B0A' }}><Icon name="copy" size={12}/> Copy · clipboard clears in 60s</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Close</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Log use →</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.6.5 Log Card Use
function A365_LogUse() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 560, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Log card use</h2>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Records this charge in the trip's audit log and notifies the client.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div><label className="field-label">Card</label><input className="input" defaultValue="VISA •••• 4242"/></div>
            <div><label className="field-label">Supplier</label><input className="input" defaultValue="Sandals Resorts"/></div>
            <div><label className="field-label">Amount</label><input className="input" defaultValue="$4,180.00" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Date</label><input className="input" defaultValue="May 14, 2026"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Reference</label><input className="input" defaultValue="SRB-INV-220119-FINAL" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Note (visible to client)</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Final balance to Sandals — bungalow upgrade included. Receipt attached."/></div>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-surface-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="upload" size={14}/><div className="t-body-s">Attach receipt (optional) · supplier-portal screenshot, PDF</div>
            <button className="btn btn-tonal btn-sm" style={{ marginLeft: 'auto' }}>Choose file</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Log use</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.6.6 Card Use Log (per trip / per card)
function A366_CardUseLog() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <ScreenHeader title="Card use log · Sandals · Aug 2026" subtitle="Append-only audit. Export for tax. Filter by card or trip." actions={<button className="btn btn-outlined btn-sm"><Icon name="download" size={12}/> Export CSV</button>} small/>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['All cards','VISA 4242','MC 8801','All suppliers'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>When</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Card</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Supplier</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Reference</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[
              { d: 'Today · 9:14a', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-FINAL', a: 4180 },
              { d: 'Apr 22 · 3:02p', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-MID', a: 1500 },
              { d: 'Mar 14 · 11:21a', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-DEP', a: 800 },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '500 12.5px/1 var(--font-sans)' }}>{r.d}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.c}</td>
                <td style={{ padding: '10px 14px' }}>{r.s}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--md-on-surface-variant)' }}>{r.r}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.a.toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}><button className="btn-icon" style={{ width: 28, height: 28 }}><Icon name="more_vert" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.6.7 Set or Update Spending Limit
function A367_UpdateLimit() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 520, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Update spending limit</h2>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Client re-consent is required for any increase.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div><label className="field-label">Current</label><input className="input" defaultValue="$4,598" disabled style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">New</label><input className="input" defaultValue="$5,200" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Reason for change</label><input className="input" defaultValue="Added Day 6 spa treatment · $602"/></div>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)' }}>
            <Icon name="shield" size={14}/>
            <span className="t-body-s" style={{ marginLeft: 8 }}>Re-consent will be requested. The card is paused for new charges until Jordan approves.</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Request re-consent</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { A361_CardVault, A362_RequestAuth, A363_AuthRequestSent, A364_RevealCard, A365_LogUse, A366_CardUseLog, A367_UpdateLimit });
