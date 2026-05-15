/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Client · 2.8 Group Trip Coordination (Future-Ready) — 4 screens.

// 2.8.1 — Group Trip Overview
function C281_GroupOverview() {
  return (
    <ScreenFrame role="client" tab="home" padding={0} scrollable>
      <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <img src={staImg('cruiseShip', 1600, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(13,33,55,0.8))' }}/>
        <div style={{ position: 'absolute', left: 28, right: 28, bottom: 16, color: '#FFF' }}>
          <span className="chip-status booked">Group · 12 travelers</span>
          <h1 className="t-display-s" style={{ margin: '6px 0 2px', color: '#FFF' }}>The 40th Birthday Cruise</h1>
          <div style={{ font: '500 13px/1.3 var(--font-sans)', opacity: 0.92 }}>Royal Caribbean Symphony · Dec 28 – Jan 4, 2027 · 4 cabins booked</div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['Overview', 'Shared itinerary', 'Group chat · 23', 'Payment status'].map((t, i) => (
              <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`} style={{ height: 28 }}>{t}</span>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="t-title-l">Roster · 12 travelers in 4 cabins</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 10 }}>
              {[
                { cabin: 'Cabin 1 · Balcony 7430', who: 'Jordan + Sam Hayes (you)', tag: 'Organizer', tone: 'primary' },
                { cabin: 'Cabin 2 · Balcony 7432', who: 'Maya + Daniel Carter', tag: 'Authorized · paid' },
                { cabin: 'Cabin 3 · Balcony 7434', who: 'Reggie + Marc + child', tag: 'Authorized · deposit only' },
                { cabin: 'Cabin 4 · Suite 9200', who: 'Westbrook family (4)', tag: 'Awaiting authorization', warn: true },
              ].map((c, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 12, background: c.tone === 'primary' ? 'var(--md-primary-container)' : 'var(--md-surface-2)', color: c.tone === 'primary' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>
                  <div className="t-label" style={{ color: c.tone === 'primary' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}>{c.cabin}</div>
                  <div className="t-title-s" style={{ marginTop: 2 }}>{c.who}</div>
                  <span className={`chip-status ${c.warn ? 'due' : 'booked'}`} style={{ marginTop: 6, display: 'inline-flex' }}>{c.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="t-title-l">Shared itinerary · highlights</div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { d: 'Day 1 · Dec 28', t: 'Group sail-away on the pool deck · 5 PM' },
                { d: 'Day 3 · Dec 30', t: 'Reserved dining · all 12 at Chef\'s Table' },
                { d: 'Day 4 · Dec 31', t: 'NYE balcony fireworks · group photo at 11:30 PM' },
                { d: 'Day 6 · Jan 02', t: 'CocoCay private island · cabana for 12 booked' },
              ].map((b) => (
                <div key={b.d} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="kbd">{b.d}</span>
                  <div className="t-body" style={{ flex: 1 }}>{b.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', border: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="warning" size={16}/><div className="t-title-s">1 cabin needs payment</div></div>
            <div className="t-body-s" style={{ marginTop: 4 }}>Westbrook family — final balance authorization pending. Gyasi has nudged them.</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>GROUP CHAT</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {['avatarA','avatarB','avatarC','avatarD'].map((a, i) => (
                  <img key={a} src={staImg(a, 64, 64)} alt="" style={{ width: 28, height: 28, borderRadius: 999, border: '2px solid var(--md-surface-1)', marginLeft: i === 0 ? 0 : -8 }}/>
                ))}
              </div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>4 active · 23 new</div>
            </div>
            <button className="btn btn-tonal btn-sm" style={{ width: '100%', marginTop: 10 }}>Open group chat</button>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>INVITE</div>
            <p className="t-body-s" style={{ color: 'var(--md-on-surface)', marginTop: 6 }}>2 invited but not yet on board · Westbrooks need an account.</p>
            <button className="btn btn-outlined btn-sm" style={{ width: '100%', marginTop: 8 }}>Send reminder</button>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.8.2 — Co-Traveler Invitation
function C282_CoTravelerInvite() {
  return (
    <ScreenFrame role="client" tab="home" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to group</button>
      <ScreenHeader title="Invite a co-traveler" subtitle="They'll see the itinerary and group chat. Set their permissions below." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, maxWidth: 920 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="field-label">Name</label><input className="input" placeholder="e.g. Jamie Westbrook"/></div>
            <div><label className="field-label">Email</label><input className="input" placeholder="jamie@example.com"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Personal note (optional)</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Hey Jamie — added you to our 40th cruise group on Story-Tail. Tap the link to see the itinerary 🚢"/></div>
          </div>

          <div className="t-title-s" style={{ marginTop: 16 }}>Permission level</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            {[
              { t: 'View itinerary only', s: 'No account needed · magic-link access', sel: true },
              { t: 'Full member', s: 'Creates a Story-Tail account · can authorize own cards' },
            ].map((p) => (
              <label key={p.t} style={{ padding: 14, borderRadius: 12, border: `1.5px solid ${p.sel ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: p.sel ? 'var(--md-primary-container)' : 'var(--md-surface-1)', color: p.sel ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: `2px solid ${p.sel ? 'var(--md-primary)' : 'var(--md-outline)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{p.sel && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--md-primary)' }}/>}</span>
                  <span className="t-title-s">{p.t}</span>
                </div>
                <div className="t-body-s" style={{ marginTop: 4, opacity: 0.85 }}>{p.s}</div>
              </label>
            ))}
          </div>

          <div className="t-title-s" style={{ marginTop: 16 }}>Delivery</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <span className="chip chip-filter is-on">Send via email</span>
            <span className="chip">Copy invite link</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}><Icon name="send" size={14}/> Send invite</button>
          </div>
        </div>
        <aside className="card" style={{ padding: 14 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PREVIEW · INVITE EMAIL</div>
          <div className="card" style={{ marginTop: 8, padding: 12, background: 'var(--md-surface-2)' }}>
            <div className="t-title-s">You're invited to the 40th Birthday Cruise</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>From Jordan Hayes · via Story-Tail Adventures</div>
            <hr className="divider" style={{ margin: '10px 0' }}/>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface)' }}>"Hey Jamie — added you to our 40th cruise group on Story-Tail. Tap the link to see the itinerary 🚢"</div>
            <button className="btn btn-filled btn-sm" style={{ width: '100%', marginTop: 10 }}>View the trip</button>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.8.3 — Group Chat
function C283_GroupChat() {
  return (
    <ScreenFrame role="client" tab="msg" padding={0}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-icon"><Icon name="arrow_left" size={16}/></button>
        <div style={{ display: 'flex' }}>
          {['avatarA','avatarB','avatarC','avatarD'].map((a, i) => (
            <img key={a} src={staImg(a, 64, 64)} alt="" style={{ width: 32, height: 32, borderRadius: 999, border: '2px solid var(--md-surface-1)', marginLeft: i === 0 ? 0 : -8 }}/>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div className="t-title-s">40th Cruise Group · 4 households</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Maya, Reggie, Westbrook, Hayes · Gyasi added</div>
        </div>
        <button className="btn btn-tonal btn-sm">Open trip</button>
        <button className="btn-icon"><Icon name="more_vert" size={16}/></button>
      </div>
      <div style={{ flex: 1, padding: '18px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ textAlign: 'center' }}><span className="chip" style={{ background: 'var(--md-surface-2)' }}>Today</span></div>
        {[
          { who: 'Maya', a: 'avatarA', t: '9:14a', b: 'Y\'all I cannot wait. Counting down 🥳' },
          { who: 'Reggie', a: 'avatarF', t: '10:02a', b: 'Drinks package on me for night 3 — I\'ll talk to Gyasi.', reactions: [{ e: '🥃', n: 3 }] },
          { who: 'You', mine: true, t: '10:14a', b: 'Sending. ❤' },
          { who: 'Gyasi', a: 'avatarC', t: '11:30a', b: 'I confirmed the Chef\'s Table reservation for all 12 on Day 3. Want me to add the drinks package company-wide?', system: true },
          { who: 'Westbrook', a: 'avatarB', t: '12:48p', b: 'YES drinks. Also — we just authorized our card. Sorry for the delay, work has been a circus.' },
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', gap: 8 }}>
            {!m.mine && <img src={staImg(m.a, 48, 48)} alt="" style={{ width: 28, height: 28, borderRadius: 999, alignSelf: 'flex-end' }}/>}
            <div style={{ maxWidth: '70%' }}>
              {!m.mine && <div className="t-body-s" style={{ color: m.system ? 'var(--brand-orange)' : 'var(--md-on-surface-variant)', fontWeight: m.system ? 700 : 500, marginBottom: 3 }}>{m.who}{m.system && ' · Advisor'}</div>}
              <div style={{ background: m.mine ? 'var(--md-primary)' : m.system ? 'var(--md-secondary-container)' : 'var(--md-surface-1)', color: m.mine ? 'var(--md-on-primary)' : m.system ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)', padding: '10px 14px', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', border: m.mine || m.system ? 0 : '1px solid var(--md-outline-variant)', font: '400 13.5px/1.45 var(--font-sans)' }}>{m.b}</div>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 3, textAlign: m.mine ? 'right' : 'left' }}>{m.t}</div>
              {m.reactions && <div style={{ marginTop: 4 }}>{m.reactions.map((r) => <span key={r.e} className="chip" style={{ height: 22, padding: '0 8px', fontSize: 11 }}>{r.e} {r.n}</span>)}</div>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--md-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
          <Icon name="attach" size={16}/>
          <span style={{ flex: 1, color: 'var(--md-on-surface-variant)', font: '400 13px/1 var(--font-sans)' }}>Message the group…</span>
          <button className="btn-icon"><Icon name="pin" size={14}/></button>
          <button className="btn btn-filled btn-sm"><Icon name="send" size={12}/></button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.8.4 — Co-Traveler View (limited, magic-link)
function C284_CoTravelerView() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--md-bg)' }}>
        <div style={{ padding: '14px 28px', background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--md-outline-variant)' }}>
          <Icon name="link" size={16}/>
          <div className="t-body-s"><b>Read-only view</b> · You're invited by Jordan Hayes as a co-traveler. <a href="#" style={{ color: 'inherit', textDecoration: 'underline' }}>Create a full account →</a></div>
          <div style={{ marginLeft: 'auto', font: '500 12px/1 var(--font-sans)' }}>Magic link expires Dec 30</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>SHARED WITH YOU</span>
          <h1 className="t-display-s" style={{ margin: '4px 0 4px' }}>The 40th Birthday Cruise · itinerary</h1>
          <div className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>Royal Caribbean Symphony · Dec 28 – Jan 4 · 12 travelers · Cabin 2</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
            {[
              { i: 'ship', l: 'Ship', v: 'Symphony of the Seas' },
              { i: 'building', l: 'Your cabin', v: 'Balcony 7432' },
              { i: 'calendar', l: 'Sailing dates', v: 'Dec 28 – Jan 4, 2027' },
              { i: 'pin', l: 'Departs', v: 'Port Canaveral, FL' },
              { i: 'shield', l: 'Insurance', v: 'Allianz · group policy' },
              { i: 'phone', l: 'Emergency', v: '+1 (305) 555-0184 · Gyasi' },
            ].map((s) => (
              <div key={s.l} className="card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                <Icon name={s.i} size={18} color="var(--brand-orange)"/>
                <div>
                  <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{s.l}</div>
                  <div className="t-title-s" style={{ marginTop: 2 }}>{s.v}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="t-title-l" style={{ marginTop: 22 }}>Day-by-day · highlights</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: 720 }}>
            {[
              { d: 'Day 1 · Dec 28', t: 'Embark Port Canaveral · sail-away on pool deck 5 PM' },
              { d: 'Day 2 · Dec 29', t: 'At sea · welcome group brunch · 11 AM Boardwalk' },
              { d: 'Day 3 · Dec 30', t: 'Nassau · group catamaran 9 AM · Chef\'s Table 7 PM' },
              { d: 'Day 4 · Dec 31', t: 'CocoCay · NYE fireworks on the balcony · 11:30 PM' },
            ].map((b) => (
              <div key={b.d} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="kbd">{b.d}</span>
                <div className="t-body" style={{ flex: 1 }}>{b.t}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 20, padding: 16, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0, display: 'flex', gap: 14, alignItems: 'center' }}>
            <Icon name="message" size={20}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Questions for the advisor?</div>
              <div className="t-body-s" style={{ opacity: 0.85, marginTop: 2 }}>Gyasi is across this group trip — message her without an account.</div>
            </div>
            <button className="btn btn-filled btn-sm" style={{ background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>Message Gyasi</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { C281_GroupOverview, C282_CoTravelerInvite, C283_GroupChat, C284_CoTravelerView });
