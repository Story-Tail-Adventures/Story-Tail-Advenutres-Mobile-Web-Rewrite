/* global React, Icon, StoryTailMark, staImg, IOSDevice */
// Client · 2.7 Mobile-Specific Screens — 8 screens.
// These are screens that exist only (or are meaningfully different) on mobile.

function MFrame({ dark = false, children }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--md-bg)', color: 'var(--md-on-surface)', paddingTop: 54 }}>
        {children}
      </div>
    </IOSDevice>
  );
}

// 2.7.1 — Offline Itinerary View
function C271_OfflineItinerary({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '10px 16px', background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" size={14}/>
          <div style={{ font: '600 11px/1.3 var(--font-sans)' }}>Offline · last synced 2h ago · using cached itinerary</div>
        </div>
        <div style={{ padding: '14px 18px 4px' }}>
          <div className="t-script" style={{ fontSize: 32, color: 'var(--brand-burgundy)', lineHeight: 1 }}>Day 03</div>
          <div className="t-title-l" style={{ marginTop: 4 }}>Cay day-trip</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Fri Aug 14 · Snorkel + private island</div>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          {[
            { time: '09:00', i: 'sparkle', t: 'Rose Island Cay snorkel', s: 'Catamaran for 2 · 6 hrs · gear + lunch' },
            { time: '17:30', i: 'heart', t: 'Beach yoga (optional)', s: 'Pavilion · 45 min' },
            { time: '20:30', i: 'utensils', t: 'Hibachi · Kimonos', s: 'Reserved 8:30 PM · Bldg 1' },
          ].map((b, i) => (
            <div key={i} className="card" style={{ padding: 12, marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 50 }}><div style={{ font: '700 14px/1 var(--font-sans)' }}>{b.time}</div></div>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={b.i} size={14}/></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 13 }}>{b.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{b.s}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>
            <div className="t-title-s" style={{ fontSize: 12 }}>Available offline</div>
            <div className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>Itinerary, contacts, confirmations. Maps and weather need a connection.</div>
          </div>
          <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'var(--md-surface-2)', font: '500 11.5px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
            <b style={{ color: 'var(--md-on-surface)' }}>Cached:</b> 3 day blocks · 4 contact numbers · 2 PDFs · supplier confirmations
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// 2.7.2 — Quick Call Advisor
function C272_QuickCall({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' }}>
        <button style={{ position: 'absolute', top: 6, left: 6, width: 36, height: 36, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--md-on-surface)' }}><Icon name="close" size={18}/></button>
        <div style={{ marginTop: 14 }}>
          <img src={staImg('avatarA', 200, 200)} alt="" style={{ width: 120, height: 120, borderRadius: 999, border: '4px solid var(--md-secondary-container)' }}/>
          <h2 className="t-headline" style={{ margin: '14px 0 4px' }}>Gyasi Story</h2>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Your travel advisor · Story-Tail</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', font: '600 11px/1 var(--font-sans)' }}>
            <span className="dot" style={{ background: 'var(--md-success)' }}/> Available now · 9a – 6p ET
          </div>
        </div>
        <button style={{ marginTop: 28, width: 96, height: 96, borderRadius: 999, border: 0, background: 'var(--md-success)', color: '#FFF', boxShadow: 'var(--md-shadow-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="phone" size={42}/>
        </button>
        <div className="t-title-s" style={{ marginTop: 10 }}>Tap to call · +1 (305) 555-0184</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, width: '100%' }}>
          <button className="btn btn-tonal btn-lg" style={{ flex: 1 }}><Icon name="message" size={14}/> Message</button>
          <button className="btn btn-outlined btn-lg" style={{ flex: 1 }}><Icon name="calendar" size={14}/> Book a call</button>
        </div>
        <div className="card" style={{ marginTop: 22, padding: 14, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', border: 0, width: '100%' }}>
          <div className="t-title-s" style={{ fontSize: 12 }}>After-hours · emergencies</div>
          <div className="t-body-s" style={{ marginTop: 4 }}>Resort front desk · Allianz hotline · Local police / consulate — saved offline.</div>
          <button className="btn btn-text btn-sm" style={{ padding: 0, marginTop: 6, color: 'var(--md-on-error-container)', fontWeight: 700 }}>View emergency contacts →</button>
        </div>
      </div>
    </MFrame>
  );
}

// 2.7.3 — Emergency Contacts
function C273_Emergency({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ padding: '14px 18px 6px' }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>SAFETY · OFFLINE-READY</div>
        <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>Emergency contacts</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Synced for your current trip · Sandals · Nassau</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 18px 18px' }}>
        {[
          { g: 'YOUR ADVISOR', rows: [{ i: 'phone', t: 'Gyasi Story', s: '+1 (305) 555-0184', tone: 'primary' }] },
          { g: 'AT THE RESORT', rows: [{ i: 'building', t: 'Sandals Royal · Front desk', s: '+1 (242) 327-6400' }, { i: 'shield', t: 'Sandals · Security', s: '+1 (242) 327-6411' }] },
          { g: 'INSURANCE', rows: [{ i: 'shield', t: 'Allianz · 24h hotline', s: '+1 (804) 281-5700' }] },
          { g: 'LOCAL · BAHAMAS', rows: [{ i: 'flag', t: 'Police · Bahamas', s: '919' }, { i: 'plus', t: 'Ambulance · Bahamas', s: '911' }, { i: 'globe', t: 'US Embassy · Nassau', s: '+1 (242) 322-1181' }] },
        ].map((g) => (
          <div key={g.g} style={{ marginTop: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>{g.g}</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {g.rows.map((r, i) => (
                <button key={i} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 0, background: r.tone === 'primary' ? 'var(--md-primary-container)' : 'var(--md-surface-1)', color: r.tone === 'primary' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)', borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)', textAlign: 'left' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 999, background: r.tone === 'primary' ? 'var(--md-primary)' : 'var(--md-surface-3)', color: r.tone === 'primary' ? 'var(--md-on-primary)' : 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={r.i} size={16}/></span>
                  <div style={{ flex: 1 }}>
                    <div className="t-title-s" style={{ fontSize: 13 }}>{r.t}</div>
                    <div className="t-body-s" style={{ color: r.tone === 'primary' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>{r.s}</div>
                  </div>
                  <Icon name="phone" size={16}/>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// 2.7.4 — Push Notification Permission Prompt (soft ask)
function C274_PushPrompt({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 30 }}>
          <span style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="bell" size={42}/></span>
          <h2 className="t-headline" style={{ margin: '14px 0 4px' }}>Stay in the loop</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', maxWidth: 280 }}>Push notifications for trip updates, payment activity, and pre-trip reminders. You can fine-tune later.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22, width: '100%', textAlign: 'left' }}>
            {[
              { i: 'plane', t: 'Trip status changes', s: 'Proposal ready, booked, departing soon' },
              { i: 'card', t: 'Payment activity', s: 'When Gyasi uses a stored card' },
              { i: 'message', t: 'Replies from Gyasi', s: 'In-app messages' },
            ].map((b) => (
              <div key={b.t} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--md-surface-2)' }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={b.i} size={14}/></span>
                <div>
                  <div className="t-title-s" style={{ fontSize: 13 }}>{b.t}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{b.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn-filled btn-lg" style={{ width: '100%', height: 52 }}>Turn on notifications</button>
        <button className="btn btn-text" style={{ width: '100%', marginTop: 4 }}>Maybe later</button>
      </div>
    </MFrame>
  );
}

// 2.7.5 — Biometric Login Setup
function C275_Biometric({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 30 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4a8 8 0 0 1 4 6.9V13M4 11a8 8 0 0 1 12.7-6.5M12 8v5a3 3 0 0 1-3 3M9 11v2a6 6 0 0 0 6 6"/></svg>
        </span>
        <h2 className="t-headline" style={{ margin: '14px 0 4px' }}>Use Face ID to sign in</h2>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', maxWidth: 280 }}>Skip the password — Face ID unlocks the app in less than a second.</p>
        <div className="card" style={{ padding: 14, marginTop: 18, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)', border: 0, width: '100%', textAlign: 'left' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="shield" size={16}/><div className="t-title-s" style={{ fontSize: 12 }}>Local-only</div></div>
          <div className="t-body-s" style={{ marginTop: 4, opacity: 0.85 }}>Your face stays on this device. Story-Tail never receives biometric data.</div>
        </div>
        <button className="btn btn-filled btn-lg" style={{ width: '100%', height: 52, marginTop: 'auto' }}>Set up Face ID</button>
        <button className="btn btn-text" style={{ width: '100%', marginTop: 4 }}>Not now</button>
      </div>
    </MFrame>
  );
}

// 2.7.6 — Calendar Sync
function C276_CalendarSync({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ padding: '14px 18px 6px' }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>CONVENIENCE</div>
        <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>Calendar sync</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Add trip events to your native calendar so flights, transfers, and dining show up next to your everyday.</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 18px' }}>
        {[
          { i: 'calendar', t: 'Apple Calendar', s: 'Connected · Jordan iCloud', on: true },
          { i: 'calendar', t: 'Google Calendar', s: 'Not connected', on: false },
          { i: 'mail', t: 'Outlook Calendar', s: 'Not connected', on: false },
        ].map((c, i) => (
          <div key={c.t} className="card" style={{ padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-surface-3)', color: 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.i} size={16}/></span>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{c.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
            </div>
            <span style={{ width: 36, height: 22, borderRadius: 999, background: c.on ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 999, background: '#FFF', transform: c.on ? 'translateX(14px)' : 'translateX(0)' }}/></span>
          </div>
        ))}
        <div className="t-title-s" style={{ marginTop: 18, marginBottom: 8 }}>What gets added</div>
        {[
          { l: 'Flight times', on: true },
          { l: 'Hotel check-in / check-out', on: true },
          { l: 'Dining reservations', on: true },
          { l: 'Excursions', on: true },
          { l: 'Payment due dates', on: false },
        ].map((p) => (
          <div key={p.l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
            <Icon name={p.on ? 'check' : 'close'} size={14} color={p.on ? 'var(--md-success)' : 'var(--md-on-surface-variant)'} stroke={2.5}/>
            <div className="t-body" style={{ flex: 1 }}>{p.l}</div>
            <span style={{ width: 32, height: 18, borderRadius: 999, background: p.on ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 999, background: '#FFF', transform: p.on ? 'translateX(14px)' : 'translateX(0)' }}/></span>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// 2.7.7 — In-App Settings (Mobile)
function C277_AppSettings({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ padding: '14px 18px 6px' }}>
        <h1 className="t-headline" style={{ margin: 0 }}>App settings</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '2px 0 0' }}>Story-Tail v1.4.0 (build 1402)</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 18px' }}>
        {[
          { g: 'AUTHENTICATION', rows: [{ t: 'Face ID', s: 'On', toggle: true }, { t: 'Auto-lock', s: 'After 5 min', chev: true }] },
          { g: 'NOTIFICATIONS', rows: [{ t: 'Push notifications', s: 'On', toggle: true }, { t: 'Notification preferences', chev: true }] },
          { g: 'DATA & STORAGE', rows: [{ t: 'Data saver', s: 'Off', toggle: false }, { t: 'Offline downloads', s: '3 trips · 86 MB', chev: true }, { t: 'Clear cache', s: 'Frees ~24 MB', chev: true }] },
          { g: 'ABOUT', rows: [{ t: 'Privacy policy', chev: true }, { t: 'Terms of service', chev: true }, { t: 'Accessibility', chev: true }, { t: 'Send feedback', chev: true }] },
        ].map((g) => (
          <div key={g.g} style={{ marginTop: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>{g.g}</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {g.rows.map((r, i) => (
                <div key={r.t} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
                  <div style={{ flex: 1 }}>
                    <div className="t-title-s" style={{ fontSize: 13 }}>{r.t}</div>
                    {r.s && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s}</div>}
                  </div>
                  {r.toggle !== undefined && <span style={{ width: 36, height: 22, borderRadius: 999, background: r.toggle ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 999, background: '#FFF', transform: r.toggle ? 'translateX(14px)' : 'translateX(0)' }}/></span>}
                  {r.chev && <Icon name="chevron_right" size={14} color="var(--md-on-surface-variant)"/>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

// 2.7.8 — App Update Required
function C278_AppUpdate({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <StoryTailMark size={68}/>
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ width: 60, height: 60, borderRadius: 999, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="refresh" size={28}/></span>
          <h2 className="t-headline" style={{ margin: '14px 0 4px' }}>Time to update</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', maxWidth: 260 }}>Story-Tail v1.4.0 is the minimum supported version. You're on v1.2.6.</p>
        </div>
        <div className="card" style={{ marginTop: 22, padding: 14, textAlign: 'left', width: '100%' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>WHAT'S NEW</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 12.5px/1.55 var(--font-sans)' }}>
            <li>New itinerary-day view with offline caching</li>
            <li>Push-notification fine-tuning per category</li>
            <li>Faster card authorization flow</li>
            <li>Security &amp; bug fixes</li>
          </ul>
        </div>
        <button className="btn btn-filled btn-lg" style={{ width: '100%', height: 52, marginTop: 'auto' }}>Update now</button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>Opens the App Store · ~14 MB</div>
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  C271_OfflineItinerary, C272_QuickCall, C273_Emergency, C274_PushPrompt,
  C275_Biometric, C276_CalendarSync, C277_AppSettings, C278_AppUpdate,
});
