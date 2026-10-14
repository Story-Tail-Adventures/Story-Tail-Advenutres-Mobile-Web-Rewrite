/* global React, Icon, staImg, IOSDevice, StoryTailMark, GRP, GRP_OPTIONS, GRP_PARTIES, GRP_WAITLIST, GRP_ITIN, GRP_LEADERS, GRP_NOTE, GStatus, GToggle, GyasiAvatar, GMemberCard, leaderOpt, optName */
// Group trips · phone artboards (public page, sign-up, offer, leader roster, welcome note, member card).
// Same translation moves as 2.2m: rails become cards below content, tables become stacked cards,
// bottom bars are siblings of the scroll, never overlays.

function GMFrame({ dark = false, children, footer }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--md-bg)', color: 'var(--md-on-surface)', paddingTop: 54 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
        {footer}
      </div>
    </IOSDevice>
  );
}

function GMTabs({ active = 'trips' }) {
  const t = [['trips', 'home', 'Trips'], ['discover', 'search', 'Discover'], ['msg', 'message', 'Messages'], ['me', 'user', 'Account']];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 6px 18px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
      {t.map(([id, ic, l]) => {
        const on = id === active;
        return (
          <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56 }}>
            <span style={{ width: 56, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--md-secondary-container)' : 'transparent', color: on ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}><Icon name={ic} size={19}/></span>
            <span style={{ font: '600 11px/1 var(--font-sans)', color: on ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}

function GMBar({ title, back = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', minHeight: 48 }}>
      {back && <button className="btn-icon" aria-label="Back"><Icon name="arrow_left" size={20}/></button>}
      <div className="t-title" style={{ flex: 1, fontSize: 17 }}>{title}</div>
    </div>
  );
}

function GMFooter({ children }) {
  return <div style={{ padding: '12px 16px 26px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)', display: 'flex', gap: 10 }}>{children}</div>;
}

function M285_PublicOpen({ dark }) {
  const l = GRP_LEADERS[0];
  return (
    <GMFrame dark={dark} footer={<GMFooter><div style={{ flex: 1 }}><div className="t-title-s">From $1,240 pp</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>8 spots left</div></div><button className="btn btn-orange" style={{ height: 48, padding: '0 28px' }}>Sign up</button></GMFooter>}>
      <div style={{ position: 'relative', height: 280 }}>
        <img src={staImg('cruiseShip', 800, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 25%, rgba(13,33,55,0.85))' }}/>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, color: '#FFF' }}>
          <div className="t-label-s" style={{ color: '#FFC83F' }}>GROUP TRIP</div>
          <div style={{ font: '800 28px/1.1 var(--font-sans)', letterSpacing: '-0.4px', margin: '4px 0 6px' }}>{GRP.name}</div>
          <div className="t-body-s" style={{ opacity: 0.92 }}>{GRP.dates} · Western Caribbean</div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="card" style={{ flex: 1, padding: 12 }}><div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>SIGN UP BY</div><div className="t-title-s" style={{ marginTop: 2 }}>{GRP.deadlineShort}</div></div>
          <div className="card" style={{ flex: 1, padding: 12 }}><div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>SPOTS</div><div className="t-title-s" style={{ marginTop: 2 }}>8 spots left</div></div>
        </div>
        <div>
          <div className="t-title-l" style={{ fontSize: 20 }}>A week at sea together. Time to slow down.</div>
          <p className="t-body" style={{ margin: '6px 0 0', color: 'var(--md-on-surface-variant)' }}>Seven nights in the Western Caribbean with people you already know, and a few you'll be glad to meet.</p>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: 'var(--md-surface-2)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <img src={staImg(l.img, 96, 96)} alt="" style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover' }}/>
            <div><div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>FROM YOUR GROUP LEADER</div><div className="t-title-s">{l.name}</div></div>
          </div>
          <p className="t-body" style={{ margin: 0 }}>{GRP_NOTE}</p>
        </div>
        <div>
          <div className="t-title" style={{ marginBottom: 8 }}>Choose your cabin</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GRP_OPTIONS.filter((o) => o.isPublic).map((o) => {
              const full = o.limit && o.filled >= o.limit;
              return (
                <div key={o.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="t-title-s">{o.name}</span>{full && <span className="chip-status past">Full</span>}</div>
                    <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{o.price} per person · {o.deposit} deposit · {o.occ.toLowerCase()}</div>
                  </div>
                  {full ? <button className="btn btn-text btn-sm">Join the waitlist</button> : <button className="btn btn-tonal btn-sm">Choose</button>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="t-title" style={{ marginBottom: 8 }}>Day by day</div>
          {GRP_ITIN.slice(0, 4).map((d, i) => (
            <div key={d.d} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: i ? '1px solid var(--md-outline-variant)' : 0 }}>
              <span className="t-label-s" style={{ color: 'var(--brand-orange)', width: 44 }}>Day {i + 1}</span>
              <span className="t-body">{d.t}</span>
            </div>
          ))}
          <button className="btn btn-text btn-sm" style={{ padding: 0 }}>See all 8 days</button>
        </div>
      </div>
    </GMFrame>
  );
}

function M285_SignupStep({ dark }) {
  return (
    <GMFrame dark={dark} footer={<GMFooter><button className="btn btn-text">Back</button><button className="btn btn-filled" style={{ flex: 1, height: 48 }}>Continue</button></GMFooter>}>
      <GMBar title="Sign up"/>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3, 4].map((n) => <span key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= 2 ? 'var(--md-primary)' : 'var(--md-surface-3)' }}/>)}</div>
        <div>
          <div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>STEP 2 OF 4 · OCEAN VIEW</div>
          <div className="t-headline" style={{ fontSize: 24, marginTop: 4 }}>Who's coming?</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Full names as they appear on each person's ID.</div>
        </div>
        {[['Rachel Anne Thompson', 'Adult'], ['Owen James Thompson', 'Adult']].map(([n, k], i) => (
          <div key={n} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}><span className="t-title-s" style={{ flex: 1 }}>Traveler {i + 1}</span>{i > 0 && <button className="btn btn-text btn-sm">Remove</button>}</div>
            <input className="input" defaultValue={n}/>
            <div style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--md-surface-3)' }}>
              {['Adult', 'Child'].map((x) => <span key={x} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 999, font: '600 13px/1 var(--font-sans)', background: x === k ? 'var(--md-secondary-container)' : 'transparent', color: x === k ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}>{x}</span>)}
            </div>
          </div>
        ))}
        <button style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderRadius: 14, border: '1.5px dashed var(--md-outline)', background: 'transparent', color: 'var(--md-primary)', font: '600 14px/1 var(--font-sans)' }}>
          <Icon name="plus" size={16}/> Add a traveler <span style={{ marginLeft: 'auto', color: 'var(--md-on-surface-variant)', fontWeight: 500, fontSize: 12 }}>Up to 4</span>
        </button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', display: 'flex', gap: 8 }}><Icon name="shield" size={16}/> Nothing is charged today.</div>
      </div>
    </GMFrame>
  );
}

function M286_Offer({ dark }) {
  return (
    <GMFrame dark={dark} footer={<GMFooter><div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><button className="btn btn-orange" style={{ height: 48 }}>Yes, I'll take it</button><button className="btn btn-text">No thanks, take me off the list</button></div></GMFooter>}>
      <GMBar title="Waitlist offer"/>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <img src={staImg('cruiseShip', 800, 400)} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 16 }}/>
        <div>
          <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>A SPOT OPENED UP</div>
          <div className="t-headline" style={{ fontSize: 26, margin: '4px 0 6px' }}>A spot opened up for you.</div>
          <div className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>A Balcony cabin on the {GRP.name} is yours if you'd like it.</div>
        </div>
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['Option', 'Balcony · up to 2'], ['Travelers', 'Pat & Gene Doyle'], ['Price', '$1,840 pp · $3,680 total'], ['Deposit', '$300 pp, after Gyasi confirms']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{k}</span><span className="t-body-s" style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}><Icon name="clock" size={18}/><span className="t-body">Held for you until <b>Thursday, January 14 at 3:00 PM ET</b>, about 2 days from now.</span></div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Saying yes doesn't charge anything.</div>
      </div>
    </GMFrame>
  );
}

function M287_Roster({ dark }) {
  return (
    <GMFrame dark={dark} footer={<GMTabs/>}>
      <GMBar title="Grace Community Cruise"/>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="chip-status booked">Sign-ups open</span><span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Close {GRP.deadlineShort}</span></div>
          <div className="t-title-s">32 of 40 spots filled</div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--md-surface-3)' }}><div style={{ width: '80%', height: '100%', borderRadius: 999, background: 'var(--md-primary)' }}/></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {[['2', 'Requested', 'inquiry'], ['3', 'Confirmed', 'proposal'], ['5', 'Deposit', 'booked'], ['3', 'Paid', 'booked']].map(([n, l, k]) => <span key={l} className={`chip-status ${k}`}>{n} {l}</span>)}
          </div>
        </div>
        <button className="btn btn-orange" style={{ height: 48 }}><Icon name="plus" size={16}/> Add someone to the trip</button>
        <div className="t-title" style={{ marginTop: 4 }}>Who's coming · 14</div>
        {GRP_PARTIES.slice(9).concat(GRP_PARTIES.slice(0, 2)).map((p) => (
          <div key={p.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}><div className="t-title-s">{p.names}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{p.n} {p.n === 1 ? 'person' : 'people'} · {leaderOpt(p.opt)} · {p.date}</div></div>
              <GStatus s={p.status}/>
            </div>
            {p.hold && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Added by {p.byLeader} · {p.hold}</div>}
            {p.flag ? <span className="t-body-s" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--md-on-surface-variant)' }}><Icon name="flag" size={14} color="var(--brand-orange)"/> Flagged for Gyasi</span>
              : <button className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start', padding: 0 }}><Icon name="flag" size={14}/> Flag for Gyasi</button>}
          </div>
        ))}
      </div>
    </GMFrame>
  );
}

function M288_WelcomeNote({ dark }) {
  const l = GRP_LEADERS[0];
  return (
    <GMFrame dark={dark} footer={<GMFooter><button className="btn btn-filled" style={{ flex: 1, height: 48 }}>Save</button></GMFooter>}>
      <GMBar title="Your welcome note"/>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={staImg(l.img, 160, 160)} alt="" style={{ width: 72, height: 72, borderRadius: 999, objectFit: 'cover' }}/>
          <button className="btn btn-tonal btn-sm"><Icon name="upload" size={14}/> New photo</button>
        </div>
        <div>
          <label className="field-label">Note</label>
          <textarea className="input" style={{ height: 150, padding: 12, resize: 'none', lineHeight: 1.5 }} defaultValue={GRP_NOTE}/>
        </div>
        <div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>PREVIEW</div>
        <div style={{ padding: 14, borderRadius: 16, background: 'var(--md-surface-2)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <img src={staImg(l.img, 96, 96)} alt="" style={{ width: 36, height: 36, borderRadius: 999, objectFit: 'cover' }}/>
            <div><div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>FROM YOUR GROUP LEADER</div><div className="t-title-s">{l.name}</div></div>
          </div>
          <p className="t-body-s" style={{ margin: 0 }}>{GRP_NOTE}</p>
        </div>
      </div>
    </GMFrame>
  );
}

function M289_MemberCard({ dark }) {
  return (
    <GMFrame dark={dark} footer={<GMTabs/>}>
      <div style={{ position: 'relative', height: 200 }}>
        <img src={staImg('cruiseShip', 800, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 25%, rgba(13,33,55,0.85))' }}/>
        <div style={{ position: 'absolute', left: 16, bottom: 14, color: '#FFF' }}>
          <GStatus s="deposit"/>
          <div style={{ font: '700 22px/1.15 var(--font-sans)', margin: '6px 0 2px' }}>Western Caribbean Cruise</div>
          <div className="t-body-s" style={{ opacity: 0.9 }}>{GRP.datesShort} · Ocean view · 2 travelers</div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="t-title-s">Next up</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>Final balance of $2,460 due January 13, 2027.</div>
        </div>
        <GMemberCard state="member"/>
      </div>
    </GMFrame>
  );
}

Object.assign(window, { M285_PublicOpen, M285_SignupStep, M286_Offer, M287_Roster, M288_WelcomeNote, M289_MemberCard });
