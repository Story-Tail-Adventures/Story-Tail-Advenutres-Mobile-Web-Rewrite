/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Client · 2.4 Payment & Card Authorization — 7 screens.

// 2.4.1 — My Cards / Payment Methods List
function C241_MyCards() {
  return (
    <ScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <ScreenHeader
        overline="WALLET"
        title="Cards on file"
        subtitle="Each card is tokenized by Stripe — we never see the full number. Used only to pay suppliers on your behalf."
        actions={<button className="btn btn-orange"><Icon name="plus" size={14}/> Add a card</button>}
        small
      />
      <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Icon name="shield" size={18}/>
        <div className="t-body-s"><b>Story-Tail never charges you a service fee.</b> Cards are used only to pay suppliers (Sandals, Royal Caribbean, etc.). <a href="#" style={{ color: 'inherit', textDecoration: 'underline' }}>Read our security policy →</a></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {[
          { b: 'VISA', l: '4242', name: 'Personal Visa', exp: '08/29', trip: 'Sandals · Aug 2026', cap: '$4,598', status: 'Active', col: 'linear-gradient(135deg, #1A1F71, #5050E0)' },
          { b: 'MC', l: '8801', name: 'Chase Mastercard', exp: '03/27', trip: 'Used Mar 2025 · Symphony', cap: '—', status: 'Revoked', col: 'linear-gradient(135deg, #EB001B, #F79E1B)' },
        ].map((c) => (
          <div key={c.l} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '8/5', background: c.col, padding: 16, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ font: '800 14px/1 var(--font-sans)' }}>{c.b}</span>
                <Icon name="card" size={20}/>
              </div>
              <div>
                <div style={{ font: '500 26px/1 var(--font-mono)', letterSpacing: 2, marginBottom: 4 }}>•••• {c.l}</div>
                <div style={{ font: '500 11px/1 var(--font-sans)', opacity: 0.8 }}>{c.name} · exp {c.exp}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.trip}</div>
                <span className={`chip-status ${c.status === 'Active' ? 'booked' : 'past'}`}>{c.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-tonal btn-sm">Details</button>
                <button className="btn btn-outlined btn-sm">{c.status === 'Active' ? 'Revoke' : 'Re-authorize'}</button>
              </div>
            </div>
          </div>
        ))}
        <button className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: 'var(--md-on-surface-variant)', cursor: 'pointer', minHeight: 200 }}>
          <Icon name="plus" size={28}/>
          <div className="t-title-s">Add a new card</div>
          <div className="t-body-s">Stripe-secured · 60 seconds</div>
        </button>
      </div>
    </ScreenFrame>
  );
}

// 2.4.2 — Add Card
function C242_AddCard() {
  return (
    <ScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to wallet</button>
      <ScreenHeader title="Add a new card" subtitle="Tokenized by Stripe — Story-Tail never sees the full number." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, maxWidth: 920 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field-label">Card number</label>
              <div style={{ position: 'relative' }}>
                <input className="input" defaultValue="4242 4242 4242 4242" style={{ paddingRight: 80, fontFamily: 'var(--font-mono)' }}/>
                <span style={{ position: 'absolute', top: '50%', right: 14, transform: 'translateY(-50%)' }}>
                  <span style={{ width: 32, height: 22, borderRadius: 4, background: '#1A1F71', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px/1 var(--font-sans)' }}>VISA</span>
                </span>
              </div>
            </div>
            <div><label className="field-label">Cardholder name</label><input className="input" defaultValue="Jordan E. Hayes"/></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label className="field-label">Expiration</label><input className="input" defaultValue="08 / 29" style={{ fontFamily: 'var(--font-mono)' }}/></div>
              <div><label className="field-label">CVC</label><input className="input" defaultValue="•••" style={{ fontFamily: 'var(--font-mono)' }}/></div>
              <div><label className="field-label">ZIP</label><input className="input" defaultValue="33131"/></div>
            </div>
            <div><label className="field-label">Nickname (optional)</label><input className="input" defaultValue="Personal Visa" placeholder="e.g. Personal Visa"/></div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, font: '500 12.5px/1.45 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="check" size={12} color="#FFF" stroke={2.5}/>
              </span>
              I understand this card is stored for <b>supplier payments only</b>. Story-Tail will never charge me a planning or service fee. I'll be notified every time the card is used.
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Save card</button>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}><Icon name="lock" size={16}/><div className="t-title-s">Secured by Stripe</div></div>
            <div className="t-body-s" style={{ opacity: 0.85 }}>PCI DSS · SAQ A · TLS 1.3. The card never touches Story-Tail servers in the clear.</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-title-s">What this card is used for</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 12.5px/1.6 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
              <li>Paying suppliers (Sandals, cruise lines, tour operators) on your behalf</li>
              <li>Audit-logged with notification on every use</li>
              <li>Revocable any time</li>
            </ul>
            <div className="t-title-s" style={{ marginTop: 12 }}>What it is <em>not</em></div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 12.5px/1.6 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
              <li>A way for Story-Tail to charge you fees</li>
              <li>Stored as raw PAN on our servers</li>
            </ul>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.4.3 — Card Authorization for Trip
function C243_AuthorizeForTrip() {
  return (
    <ScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <ScreenHeader overline="STEP 1 OF 2" title="Authorize a card for Sandals" subtitle="Pick a card, set a cap, and consent. We'll send Sandals the balance on May 28." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, maxWidth: 980 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="t-title-s" style={{ marginBottom: 8 }}>Card</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { b: 'VISA', l: '4242', exp: '08/29', name: 'Personal Visa', sel: true },
              { b: 'MC', l: '8801', exp: '03/27', name: 'Chase Mastercard' },
            ].map((c) => (
              <label key={c.l} style={{ padding: 12, borderRadius: 12, border: `1.5px solid ${c.sel ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: c.sel ? 'var(--md-primary-container)' : 'var(--md-surface-1)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${c.sel ? 'var(--md-primary)' : 'var(--md-outline)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.sel && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--md-primary)' }}/>}
                </span>
                <span style={{ width: 36, height: 22, borderRadius: 4, background: c.b === 'VISA' ? '#1A1F71' : '#EB001B', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px/1 var(--font-sans)' }}>{c.b}</span>
                <div style={{ flex: 1 }}>
                  <div className="t-title-s" style={{ fontFamily: 'var(--font-mono)', color: c.sel ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>•••• {c.l}</div>
                  <div className="t-body-s" style={{ color: c.sel ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)', opacity: 0.8 }}>{c.name} · exp {c.exp}</div>
                </div>
              </label>
            ))}
            <button className="btn btn-tonal btn-sm" style={{ alignSelf: 'flex-start' }}><Icon name="plus" size={14}/> Add new card</button>
          </div>

          <hr className="divider" style={{ margin: '20px 0' }}/>
          <div className="t-title-s" style={{ marginBottom: 4 }}>Spending limit</div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 10px' }}>Max we can charge. We'll ask before going over.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[{ l: 'Exact', v: '$4,180' }, { l: 'Balance + 10%', v: '$4,598', sel: true }, { l: 'Balance + 20%', v: '$5,016' }, { l: 'Custom', v: 'Set' }].map((o) => (
              <div key={o.l} style={{ padding: 10, borderRadius: 12, border: `1.5px solid ${o.sel ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: o.sel ? 'var(--md-primary-container)' : 'var(--md-surface-1)', color: o.sel ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>
                <div className="t-label">{o.l}</div>
                <div className="t-title-s" style={{ marginTop: 4 }}>{o.v}</div>
              </div>
            ))}
          </div>
          <div><label className="field-label" style={{ marginTop: 14 }}>Authorization expires</label><input className="input" defaultValue="Aug 26, 2026 · 7 days after trip end" style={{ maxWidth: 320 }}/></div>

          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--md-surface-2)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, font: '500 12.5px/1.5 var(--font-sans)' }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}><Icon name="check" size={12} color="#FFF" stroke={2.5}/></span>
              <span><b>I authorize</b> Story-Tail Adventures to use VISA •••• 4242 to pay Sandals Resorts on my behalf, up to $4,598, until Aug 26, 2026. Story-Tail does not charge me a planning or service fee.</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Authorize $4,598 <Icon name="arrow_right" size={14}/></button>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <img src={staImg('overwater', 600, 180)} alt="" style={{ width: '100%', height: 110, objectFit: 'cover' }}/>
            <div style={{ padding: 14 }}>
              <span className="chip-status booked">Booked</span>
              <div className="t-title-s" style={{ margin: '6px 0 2px' }}>Sandals Royal Bahamian</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Aug 12 – 19 · Jordan + Sam</div>
              <hr className="divider" style={{ margin: '10px 0' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 12.5px/1.5 var(--font-sans)' }}><span style={{ color: 'var(--md-on-surface-variant)' }}>Trip total</span><span>$6,480</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 12.5px/1.5 var(--font-sans)' }}><span style={{ color: 'var(--md-on-surface-variant)' }}>Paid to date</span><span>–$2,300</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '700 14px/1.4 var(--font-sans)', marginTop: 4 }}><span>Authorizing for</span><span style={{ color: 'var(--md-primary)' }}>$4,180</span></div>
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.4.4 — Authorization Confirmation
function C244_AuthConfirmation() {
  return (
    <ScreenFrame role="client" tab="wallet" padding={0}>
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: 'var(--md-shadow-2)' }}><Icon name="check" size={48} stroke={2.5}/></div>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>AUTHORIZED</span>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>VISA •••• 4242 is locked in for Sandals.</h1>
          <p className="t-body-l" style={{ color: 'var(--md-on-surface-variant)' }}>Spending cap $4,598 · expires Aug 26, 2026. Gyasi can settle the May 28 invoice — you'll be notified.</p>
          <div className="card" style={{ padding: 14, marginTop: 18, textAlign: 'left' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>SUMMARY</div>
            {[{ l: 'Trip', v: 'Sandals Royal Bahamian · Aug 12 – 19' }, { l: 'Cap', v: '$4,598' }, { l: 'Expires', v: 'Aug 26, 2026' }, { l: 'Notifications', v: 'Email + push on every use' }].map((kv) => (
              <div key={kv.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--md-outline-variant)', font: '500 13px/1.4 var(--font-sans)' }}>
                <span style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</span>
                <span>{kv.v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn-outlined">View activity</button>
            <button className="btn btn-filled">Back to trip</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.4.5 — Card Use History
function C245_CardUseHistory() {
  const events = [
    { d: 'Today · 9:14a', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Final balance', amt: 4180, card: 'VISA 4242', tone: 'primary' },
    { d: 'Mar 22 · 3:02p', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Mid-payment', amt: 1500, card: 'VISA 4242' },
    { d: 'Mar 14 · 11:21a', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Deposit', amt: 800, card: 'VISA 4242' },
    { d: 'Mar 02 · 2:14p', who: 'Gyasi', supplier: 'AT Tours', t: 'St. Lucia transfer · Reggie + Marc', amt: 220, card: 'MC 8801' },
    { d: 'Feb 28 · 8:00a', who: 'Gyasi', supplier: 'Royal Caribbean', t: 'Symphony cruise · final', amt: 3120, card: 'MC 8801' },
  ];
  return (
    <ScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <ScreenHeader title="Card use · activity" subtitle="Every time a card on file was used to pay a supplier. Audit-logged. Export anytime." actions={<button className="btn btn-outlined btn-sm"><Icon name="download" size={14}/> Export CSV</button>} small/>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['All cards', 'VISA 4242', 'MC 8801', 'All trips'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map((e, i) => (
          <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', border: i === 0 ? '1.5px solid var(--md-primary)' : '1px solid var(--md-outline-variant)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="card" size={16}/>
            </span>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{e.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{e.d} · {e.supplier} · by {e.who}</div>
            </div>
            <span className="kbd">{e.card}</span>
            <div style={{ font: '700 14px/1 var(--font-mono)', minWidth: 80, textAlign: 'right' }}>${e.amt.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

// 2.4.6 — Card Use Detail / Event Detail
function C246_CardUseDetail() {
  return (
    <ScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to activity</button>
      <ScreenHeader title="Card use · $4,180" subtitle="Sandals Resorts · Final balance · Today 9:14 AM" small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, maxWidth: 960 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="t-title-l" style={{ margin: 0, marginBottom: 12 }}>Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { l: 'Amount', v: '$4,180.00' },
              { l: 'Card', v: 'VISA •••• 4242' },
              { l: 'Supplier', v: 'Sandals Resorts' },
              { l: 'Agent', v: 'Gyasi Story' },
              { l: 'Trip', v: 'Sandals · Aug 12 – 19, 2026' },
              { l: 'Date / time', v: 'May 14, 2026 · 9:14 AM ET' },
              { l: 'Reference', v: 'SRB-INV-220119-FINAL', mono: true },
              { l: 'Method', v: 'Reveal-and-use via supplier portal' },
            ].map((kv) => (
              <div key={kv.l}>
                <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</div>
                <div className="t-body" style={{ marginTop: 2, fontFamily: kv.mono ? 'var(--font-mono)' : 'inherit' }}>{kv.v}</div>
              </div>
            ))}
          </div>
          <hr className="divider" style={{ margin: '16px 0' }}/>
          <div className="t-title-s">Note from Gyasi</div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 0' }}>"Final balance to Sandals — over-water bungalow upgrade included. Receipt attached."</p>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <button className="btn btn-tonal btn-sm"><Icon name="download" size={12}/> Receipt</button>
            <button className="btn btn-outlined btn-sm"><Icon name="warning" size={12}/> Flag as unfamiliar</button>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14, background: 'var(--md-success-container)', color: 'var(--md-success)', border: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><Icon name="check" size={16} stroke={2.5}/><div className="t-title-s">Successful charge</div></div>
            <div className="t-body-s" style={{ opacity: 0.85 }}>Charged by Sandals on your card. Story-Tail did not handle funds.</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>NEXT</div>
            <div className="t-title-s" style={{ marginTop: 4 }}>You're paid in full.</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Trip starts in 90 days. We'll send pre-trip reminders 14 days out.</div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.4.7 — Revoke Card Authorization Confirmation
function C247_RevokeConfirm() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.35)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 540, padding: 26, boxShadow: 'var(--md-shadow-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="warning" size={20}/></span>
            <div>
              <span className="t-label-s" style={{ color: 'var(--md-error)' }}>CONFIRM REVOCATION</span>
              <h2 className="t-title-l" style={{ margin: 0 }}>Revoke VISA •••• 4242?</h2>
            </div>
          </div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>This stops Gyasi from using the card for future supplier payments. <b>Past charges are unaffected</b> — Sandals can't be refunded through Story-Tail.</p>

          <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)', marginTop: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>CURRENTLY USING THIS CARD</div>
            <div className="t-title-s" style={{ marginTop: 4 }}>Sandals Royal Bahamian · Aug 12 – 19</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>$418 cap remaining · expires Aug 26</div>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>WE'LL NOTIFY</div>
            <div className="t-body-s" style={{ marginTop: 4 }}>Gyasi will receive an in-app alert. She may request a different card.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>Yes, revoke</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C241_MyCards, C242_AddCard, C243_AuthorizeForTrip, C244_AuthConfirmation,
  C245_CardUseHistory, C246_CardUseDetail, C247_RevokeConfirm,
});
