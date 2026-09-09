/* global React, Icon, StoryTailMark, staImg, ScreenFrame, ScreenHeader */
// Client · 2.0 Public / Pre-Auth Surface — 7 screens.
// All screens here live at app.story-tail.com and complement (not replace)
// the marketing site at adventures.story-tail.com.

// 2.0.1 — App Subdomain Public Landing
function C201_PublicLanding() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', borderRadius: 0 }}>
          <img src={staImg('turks', 1600, 900)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(122,26,31,0.72) 0%, rgba(122,26,31,0.2) 55%, transparent)' }}/>
          <div style={{ position: 'absolute', inset: 0, padding: '40px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#FFF', maxWidth: 660 }}>
            <span className="t-label-s" style={{ color: '#FFC83F', marginBottom: 10 }}>REST IS A GIFT · CREATION IS A GIFT</span>
            <h1 className="t-display" style={{ margin: 0, color: '#FFF', lineHeight: 1.05 }}>Plan a rest worthy of the <span className="t-script" style={{ color: '#FFC83F', fontSize: 60 }}>world He made.</span></h1>
            <p className="t-body-l" style={{ marginTop: 14, color: 'rgba(255,255,255,0.92)' }}>Your portal for everything Story-Tail — trips in motion, cards authorized for suppliers, and a place to dream up what's next. We believe vacation is rest, and rest is sacred.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn btn-orange btn-lg">Sign in</button>
              <button className="btn btn-lg" style={{ background: 'rgba(255,255,255,0.18)', color: '#FFF', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.3)' }}>Create an account</button>
              <button className="btn btn-text btn-lg" style={{ color: '#FFF' }}>Take a quick tour →</button>
            </div>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'baseline', gap: 18, color: 'rgba(255,255,255,0.78)' }}>
              <span style={{ font: 'italic 500 13px/1.4 var(--font-script)', fontSize: 18, color: '#FFC83F' }}>"On the seventh day God rested."</span>
              <span className="t-label-s" style={{ letterSpacing: 1.2, opacity: 0.7 }}>GEN 2 : 2</span>
              <span style={{ opacity: 0.3 }}>·</span>
              <span style={{ font: 'italic 500 13px/1.4 var(--font-script)', fontSize: 18, color: '#FFC83F' }}>"It was very good."</span>
              <span className="t-label-s" style={{ letterSpacing: 1.2, opacity: 0.7 }}>GEN 1 : 31</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <a className="chip" style={{ background: 'rgba(255,255,255,0.16)', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)' }}>Browse trip ideas →</a>
              <a className="chip" style={{ background: 'rgba(255,255,255,0.16)', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)' }}><Icon name="external" size={12}/> adventures.story-tail.com</a>
            </div>
          </div>
        </div>
        <footer style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between',
                          background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)',
                          font: '500 11.5px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
          <span>© 2026 Story-Tail Adventures · Hosted by Inteletravel</span>
          <span style={{ display: 'flex', gap: 16 }}>
            <a href="#">Privacy</a><a href="#">Terms</a><a href="#">Cookies</a><a href="#">Accessibility</a><a href="#">Marketing site →</a>
          </span>
        </footer>
      </div>
    </ScreenFrame>
  );
}

// 2.0.2 — About / How It Works
function C202_About() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false} scrollable padding={0}>
      <div style={{ padding: '32px 48px 48px', maxWidth: 980, margin: '0 auto' }}>
        <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>HOW STORY-TAIL WORKS</span>
        <h1 className="t-display-s" style={{ margin: '4px 0 6px' }}>You ask. We plan together. You go and rest.</h1>
        <p className="t-body-l" style={{ margin: 0, color: 'var(--md-on-surface-variant)', maxWidth: 720 }}>Under 90 seconds of reading — promise. No planning fees, ever — Story-Tail earns commission from suppliers, not from you. We exist so you can take the rest you were made for.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 24 }}>
          {[
            { i: 'message', t: 'Ask', d: 'Tell me what you\'re craving — beach week, family cruise, honeymoon — by message or a quick call.' },
            { i: 'sparkle', t: 'Plan together', d: 'I come back with a curated proposal: real options, real prices, my honest takes — never a generic search dump.' },
            { i: 'plane', t: 'Go rest', d: 'I book through suppliers, you authorize a card for them to charge, and I keep watch on the details while you receive the rest you came for.' },
          ].map((s, i) => (
            <div key={s.t} className="card" style={{ padding: 18 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.i} size={20}/>
              </span>
              <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 12 }}>STEP {String(i+1).padStart(2,'0')}</div>
              <div className="t-title-l" style={{ margin: '4px 0 6px' }}>{s.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{s.d}</div>
            </div>
          ))}
        </div>

        {/* Our heart — why we do this */}
        <div style={{ marginTop: 28, padding: '24px 24px 26px', borderRadius: 22, background: 'linear-gradient(135deg, var(--md-surface-2) 0%, var(--md-primary-container) 140%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 240, height: 240, borderRadius: 999, background: 'radial-gradient(circle at 30% 30%, rgba(232,119,34,0.18), transparent 70%)' }}/>
          <div style={{ position: 'relative' }}>
            <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>OUR HEART · WHY WE DO THIS</span>
            <h2 className="t-headline" style={{ margin: '4px 0 6px', maxWidth: 760 }}>Vacation is <i>rest</i>. Rest is sacred. The world is <i>good</i>, and meant to be enjoyed.</h2>
            <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 18px', maxWidth: 720 }}>Two beliefs sit behind every trip we plan. They're the reason Gyasi answers a 9pm message about sunscreen brands and the reason we cap your card at the invoice — not a penny more.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
              {/* Pillar 1 — Rest is a command */}
              <div className="card" style={{ padding: 20, background: 'var(--md-surface-1)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="heart" size={20}/>
                  </span>
                  <div>
                    <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>PILLAR 01</div>
                    <div className="t-title-l">Rest is a command, not a luxury.</div>
                  </div>
                </div>
                <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
                  On the seventh day God rested and called it holy — not because He was tired, but because He was making rest a gift to us. When we plan your week away, we plan a Sabbath worth taking. No screens that demand you. No charges that surprise you. Real rest.
                </p>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 22, lineHeight: 1 }}>"Come to me, all who are weary, and I will give you rest."</span>
                  <span className="t-label-s" style={{ color: 'var(--md-on-surface-variant)', letterSpacing: 1.2, whiteSpace: 'nowrap' }}>MATT 11:28</span>
                </div>
              </div>

              {/* Pillar 2 — Creation is a gift */}
              <div className="card" style={{ padding: 20, background: 'var(--md-surface-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="palm" size={20}/>
                  </span>
                  <div>
                    <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>PILLAR 02</div>
                    <div className="t-title-l">Creation is a gift, meant to be enjoyed.</div>
                  </div>
                </div>
                <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
                  God made the reef, the trade wind, the warm rain on a tin roof — and called it very good. We don't sell escape from your life; we help you receive a world that's already waiting for you. The Caribbean is one beautiful answer to that invitation.
                </p>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 22, lineHeight: 1 }}>"God saw all that he had made, and it was very good."</span>
                  <span className="t-label-s" style={{ color: 'var(--md-on-surface-variant)', letterSpacing: 1.2, whiteSpace: 'nowrap' }}>GEN 1:31</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'var(--md-surface-1)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="info" size={16} color="var(--md-on-surface-variant)"/>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
                <b style={{ color: 'var(--md-on-surface)' }}>Whatever your faith — you're welcome here.</b> This is just where our hands come from. Every traveler gets the same care, the same honesty, the same Caribbean.
              </div>
            </div>
          </div>
        </div>

        {/* Gyasi card */}
        <div className="card" style={{ marginTop: 24, padding: 22, display: 'grid', gridTemplateColumns: '120px 1fr', gap: 22, alignItems: 'center', background: 'var(--md-surface-2)' }}>
          <img src={staImg('avatarA', 240, 240)} alt="" style={{ width: 120, height: 120, borderRadius: 999, objectFit: 'cover' }}/>
          <div>
            <div className="t-title-l">Meet Gyasi Story · Travel Advisor</div>
            <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>Caribbean specialist hosted by Inteletravel. Family travel, honeymoons, cruises, and the kind of all-inclusive weeks that turn into stories worth retelling.</p>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, font: '500 12px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
              <span><Icon name="star" size={12} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9 · 138 reviews</span>
              <span><Icon name="users" size={12}/> 240+ travelers</span>
              <span><Icon name="shield" size={12}/> CLIA member</span>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 24 }}>
          <div className="t-title-l">FAQ</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { q: 'Do I pay a planning fee?', a: 'No. Inteletravel host-agency policy prohibits it. Gyasi earns commission from suppliers — you pay them, never us.' },
              { q: 'What does Inteletravel mean for me?', a: 'It\'s the host agency that issues bookings. You\'ll see them on supplier invoices. It does not change how you work with Story-Tail.' },
              { q: 'How does payment authorization work?', a: 'You add a card through a Stripe-secured form. Story-Tail uses it only to pay suppliers on your behalf — never to charge you a service fee. Every use is audit-logged and you get notified.' },
              { q: 'Can I plan without an account?', a: 'You can browse and inquire as a guest. To save searches, view a real proposal, or authorize a card, you\'ll create an account.' },
            ].map((f, i) => (
              <details key={i} className="card" style={{ padding: 0 }} open={i === 0}>
                <summary style={{ padding: '14px 16px', cursor: 'pointer', fontWeight: 600, color: 'var(--md-on-surface)', display: 'flex', justifyContent: 'space-between' }}>
                  {f.q} <Icon name="chevron_down" size={16}/>
                </summary>
                <div style={{ padding: '0 16px 14px', color: 'var(--md-on-surface-variant)', font: '400 13px/1.55 var(--font-sans)' }}>{f.a}</div>
              </details>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 30, padding: 20, borderRadius: 18, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="t-title-l">Ready to start planning?</div>
            <p className="t-body-s" style={{ opacity: 0.85, margin: '4px 0 0' }}>Create an account in under 60 seconds — or message Gyasi without one.</p>
          </div>
          <button className="btn btn-filled" style={{ background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>Create account</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.0.3 — Public Search Landing (No Account)
function C203_PublicSearchLanding() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <div style={{ position: 'relative', height: 280, overflow: 'hidden' }}>
        <img src={staImg('bahamas', 1600, 500)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,33,55,0.6), rgba(13,33,55,0.2))' }}/>
        <div style={{ position: 'absolute', inset: 0, padding: '32px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#FFF', maxWidth: 760 }}>
          <span className="t-label-s" style={{ color: '#FFC83F' }}>BROWSE WITHOUT AN ACCOUNT</span>
          <h1 className="t-display-s" style={{ margin: '4px 0 12px', color: '#FFF' }}>Find your next chapter.</h1>
          <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, borderRadius: 999, boxShadow: 'var(--md-shadow-2)' }}>
            {[
              { l: 'Destination', v: 'Caribbean', icon: 'map' },
              { l: 'Dates', v: 'Aug 12 – 19', icon: 'calendar' },
              { l: 'Travelers', v: '2 adults', icon: 'user' },
            ].map((f, i) => (
              <div key={f.l} style={{ flex: 1, padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--md-outline-variant)' : 'none' }}>
                <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{f.l}</div>
                <div style={{ font: '600 13px/1.2 var(--font-sans)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--md-on-surface)' }}><Icon name={f.icon} size={13} color="var(--brand-orange)"/> {f.v}</div>
              </div>
            ))}
            <button className="btn btn-filled" style={{ height: 44, margin: 4 }}><Icon name="search" size={16}/> Search</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 48px', background: 'var(--md-warning-container)', color: 'var(--md-on-surface)',
                    display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--md-outline-variant)' }}>
        <Icon name="info" size={16}/>
        <div className="t-body-s"><b>Sign in or create an account</b> to save searches, favorite trips, and request a real proposal.</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-text btn-sm">Sign in</button>
          <button className="btn btn-filled btn-sm">Create account</button>
        </div>
      </div>

      <div style={{ padding: '24px 48px 32px' }}>
        <div className="t-title-l">Inspiration · curated</div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 14px' }}>Six trip types we live and breathe. Tap any to start a search.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {[
            { t: 'Caribbean escapes', i: 'turks', tag: '12 active' },
            { t: 'Family cruises', i: 'cruiseShip', tag: '8 active' },
            { t: 'Honeymoons', i: 'honeymoon', tag: '6 active' },
            { t: 'All-inclusive resorts', i: 'resortPool', tag: '15 active' },
            { t: 'Adventure travel', i: 'snorkel', tag: '4 active' },
            { t: 'Group trips · 6+', i: 'overwater', tag: '3 active' },
          ].map((s) => (
            <div key={s.t} className="card" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '5/3' }}>
              <img src={staImg(s.i, 600, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7))' }}/>
              <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, color: '#FFF' }}>
                <div style={{ font: '700 15px/1.2 var(--font-sans)' }}>{s.t}</div>
                <div style={{ font: '500 11px/1 var(--font-sans)', opacity: 0.85, marginTop: 2 }}>{s.tag}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 22, padding: 18, borderRadius: 16, background: 'var(--md-surface-2)' }}>
          <Icon name="shield" size={20} color="var(--md-secondary)"/>
          <div style={{ flex: 1 }}>
            <div className="t-title-s">Trusted</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Hosted by Inteletravel · CLIA member · 4.9★ from 138 travelers</div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.0.4 — Public Search Results (Browse Anonymously)
function C204_PublicSearchResults() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 32px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)' }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, borderRadius: 999 }}>
            {[
              { l: 'Caribbean', i: 'map' }, { l: 'Aug 12 – 19', i: 'calendar' },
              { l: '2 adults', i: 'user' }, { l: 'Any', i: 'palm' },
            ].map((f, i) => (
              <div key={i} style={{ flex: 1, padding: '10px 14px', borderRight: i < 3 ? '1px solid var(--md-outline-variant)' : 0, display: 'flex', alignItems: 'center', gap: 6, font: '500 12.5px/1 var(--font-sans)' }}>
                <Icon name={f.i} size={12} color="var(--brand-orange)"/> {f.l}
              </div>
            ))}
            <button className="btn btn-filled btn-sm" style={{ margin: 4 }}>Update</button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
          <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 16, overflow: 'auto', background: 'var(--md-surface)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>FILTERS</div>
            {[
              { t: 'Trip type', opts: ['All-inclusive', 'Cruise', 'Hotel', 'Tour'] },
              { t: 'Vibe', opts: ['Adults-only', 'Family', 'Honeymoon', '5★'] },
              { t: 'Budget', opts: ['Under $2k pp', '$2–4k pp', '$4k+ pp'] },
            ].map((g) => (
              <div key={g.t} style={{ marginBottom: 14 }}>
                <div className="t-title-s" style={{ marginBottom: 6 }}>{g.t}</div>
                {g.opts.map((o, i) => (
                  <label key={o} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', font: '500 12.5px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--md-outline)', background: i === 0 ? 'var(--md-primary)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {i === 0 && <Icon name="check" size={10} color="#FFF" stroke={2.5}/>}
                    </span>
                    {o}
                  </label>
                ))}
              </div>
            ))}
          </aside>
          <div style={{ overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="t-title-l" style={{ margin: 0 }}>148 trips · Caribbean</div>
              <span className="chip">Sort · Best fit ▾</span>
            </div>
            {[
              { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only', p: 3290, i: 'overwater', tag: 'All-inclusive · 7n', r: 4.9 },
              { t: 'Royal Caribbean Symphony', s: 'Eastern Caribbean · 7-day', p: 1850, i: 'cruiseShip', tag: 'Cruise · Family', r: 4.7 },
              { t: 'Beaches Turks & Caicos', s: 'Providenciales', p: 2640, i: 'turks', tag: 'All-inclusive · Family', r: 4.8 },
            ].map((r, i) => (
              <div key={i} className="card" style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', padding: 0, marginBottom: 10 }}>
                <img src={staImg(r.i, 360, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ background: 'rgba(13,33,55,0.85)', color: '#FFF', display: 'inline-block', padding: '3px 8px', borderRadius: 6, font: '600 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{r.tag}</div>
                  <div className="t-title-l" style={{ margin: '6px 0 2px' }}>{r.t}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s} · <Icon name="star" size={11} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> {r.r}</div>
                </div>
                <div style={{ padding: '14px 16px', borderLeft: '1px solid var(--md-outline-variant)', textAlign: 'right', minWidth: 170, display: 'flex', flexDirection: 'column' }}>
                  <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>FROM</div>
                  <div className="t-title-l" style={{ margin: '2px 0' }}>${r.p.toLocaleString()}<span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}> /pp</span></div>
                  <button className="btn btn-filled btn-sm" style={{ marginTop: 'auto' }}>Request quote*</button>
                  <button className="btn btn-text btn-sm" style={{ padding: 0 }}><Icon name="heart" size={11}/> Save*</button>
                </div>
              </div>
            ))}
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 8 }}>* Requires creating an account — takes 60 seconds.</div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.0.5 — Public Property / Cruise / Tour Detail
function C205_PublicDetail() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <div style={{ position: 'relative', height: 280, overflow: 'hidden' }}>
        <img src={staImg('overwater', 1600, 500)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5))' }}/>
        <div style={{ position: 'absolute', left: 32, right: 32, bottom: 20, color: '#FFF', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--brand-burgundy)', padding: '4px 10px', borderRadius: 8, font: '700 10px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase' }}>All-inclusive · 7 nights</span>
            <h1 className="t-display-s" style={{ margin: '8px 0 2px', color: '#FFF' }}>Sandals Royal Bahamian</h1>
            <div style={{ font: '500 13px/1.3 var(--font-sans)', opacity: 0.92, display: 'flex', gap: 14 }}>
              <span><Icon name="pin" size={13}/> Nassau, Bahamas</span>
              <span><Icon name="star" size={13} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9 · 312 reviews</span>
            </div>
          </div>
          <button style={{ width: 40, height: 40, borderRadius: 999, border: 0, background: 'rgba(255,255,255,0.92)', color: 'var(--md-on-surface)' }}>
            <Icon name="heart" size={18}/>
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 32px 32px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18 }}>
        <div>
          <div className="t-title-l" style={{ margin: 0 }}>What it is</div>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 14px' }}>
            Over-water bungalows, six pools, twelve dining venues, a Red Lane spa, and a private island day. Adults-only — built for honeymoons, anniversaries, and "just us" weeks.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { i: 'plane', t: 'Flights included from MIA' },
              { i: 'utensils', t: '12 restaurants' },
              { i: 'heart', t: 'Red Lane spa credit' },
              { i: 'ship', t: 'Day-trip to Rose Island' },
            ].map((f) => (
              <div key={f.t} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={f.i} size={16} color="var(--brand-orange)"/>
                <div className="t-body-s">{f.t}</div>
              </div>
            ))}
          </div>

          <div className="t-title-l">Sample itinerary</div>
          {['Day 1 · Arrival & sunset welcome', 'Day 2 · Beach + Red Lane spa', 'Day 3 · Rose Island Cay snorkel', 'Day 4 · Resort day'].map((d, i) => (
            <div key={d} className="card" style={{ padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 11px/1 var(--font-sans)' }}>{i+1}</span>
              <div className="t-body">{d}</div>
            </div>
          ))}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>STARTING AT</div>
            <div className="t-display-s" style={{ margin: '4px 0' }}>$3,290<span className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}> /person</span></div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>All-in · flights, transfers, all meals, drinks, activities</div>
            <button className="btn btn-filled" style={{ width: '100%', marginTop: 14 }}>Request a quote</button>
            <button className="btn btn-tonal" style={{ width: '100%', marginTop: 8 }}><Icon name="heart" size={14}/> Favorite</button>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 10 }}>* Requires an account, or...</div>
            <button className="btn btn-text btn-sm" style={{ width: '100%', marginTop: 4 }}>Message Gyasi without an account →</button>
          </div>
          <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Gyasi planned 14 of these</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Caribbean specialist</div>
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 2.0.6 — Sign-up Gate / Quote Request Prompt (modal)
function C206_SignUpGate() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
                    background: 'radial-gradient(circle at 50% 30%, rgba(122,26,31,0.18), transparent), var(--md-bg)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 520, padding: 28, boxShadow: 'var(--md-shadow-3)' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>ALMOST THERE</span>
          <h2 className="t-headline" style={{ margin: '4px 0 6px' }}>Create an account to send Gyasi your trip details.</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>Takes about 60 seconds. You'll get a real proposal back — not a generic search dump.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {[
              'Save searches & favorites',
              'View Gyasi\'s curated proposals',
              'Authorize cards securely · paid to suppliers, not us',
            ].map((b) => (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, font: '500 13px/1.4 var(--font-sans)' }}>
                <Icon name="check" size={14} color="var(--md-success)" stroke={2.5}/> {b}
              </div>
            ))}
          </div>

          <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9V14.9H8V12h2.5V9.7c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7C18.3 21.2 22 17 22 12Z" fill="#1565C0"/></svg>
            Continue with Google
          </button>
          <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 14 }}>
            <Icon name="user" size={14}/> Continue with Apple
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
            <hr className="divider" style={{ flex: 1 }}/>
            <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR EMAIL</span>
            <hr className="divider" style={{ flex: 1 }}/>
          </div>
          <input className="input" defaultValue="Jordan Hayes" style={{ marginBottom: 8 }} placeholder="Your name"/>
          <input className="input" defaultValue="jordan.hayes@example.com" style={{ marginBottom: 8 }} placeholder="Email"/>
          <input className="input" type="password" defaultValue="••••••••••••" placeholder="Password"/>

          <button className="btn btn-filled btn-lg" style={{ width: '100%', marginTop: 14 }}>Create account &amp; send quote</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, font: '500 12px/1 var(--font-sans)' }}>
            <a href="#" style={{ color: 'var(--md-primary)' }}>Already have an account? Sign in</a>
            <a href="#" style={{ color: 'var(--md-on-surface-variant)' }}>Continue as guest →</a>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.0.7 — Footer Pages (Privacy/Terms/Cookies/Accessibility)
function C207_FooterPages() {
  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 22, background: 'var(--md-surface-1)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>LEGAL &amp; COMPLIANCE</div>
          {['Privacy policy', 'Terms of service', 'Cookies', 'Accessibility statement', 'Data processing addendum'].map((s, i) => (
            <a key={s} href="#" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, font: '500 13px/1.3 var(--font-sans)',
                                          background: i === 0 ? 'var(--md-secondary-container)' : 'transparent',
                                          color: i === 0 ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
                                          marginBottom: 2 }}>{s}</a>
          ))}
          <div style={{ marginTop: 20, padding: 12, background: 'var(--md-surface-2)', borderRadius: 12, font: '500 11.5px/1.5 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
            Need to print? Click "Printable view" at the top of any page.
          </div>
        </aside>
        <div style={{ padding: '32px 48px', maxWidth: 720, overflow: 'auto' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>LEGAL</span>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>Privacy policy</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--md-on-surface-variant)', font: '500 12px/1 var(--font-sans)' }}>
            Last updated May 14, 2026 · <a href="#" style={{ color: 'var(--md-primary)' }}>Printable view</a> · <a href="#" style={{ color: 'var(--md-primary)' }}>Download PDF</a>
          </div>

          <div style={{ marginTop: 18, font: '400 14px/1.65 var(--font-sans)', color: 'var(--md-on-surface)' }}>
            <h3 className="t-title-l" style={{ marginTop: 18 }}>1. What we collect</h3>
            <p>Story-Tail Adventures collects contact information, trip details, and payment-card data (tokenized via Stripe) only to provide travel advisory services. We do not sell or share your information with marketing third parties.</p>
            <h3 className="t-title-l" style={{ marginTop: 18 }}>2. How payment cards are handled</h3>
            <p>Cards you add through the portal are tokenized by Stripe Elements before they leave your browser. Story-Tail never sees the full card number. Tokenized cards are used solely to pay travel suppliers on your behalf, and every use generates an audit-logged event with a notification to you.</p>
            <h3 className="t-title-l" style={{ marginTop: 18 }}>3. Your data rights</h3>
            <p>You can request a copy of all data we hold about you at any time from your Account → Privacy &amp; Data Export. You can revoke any stored card from your Wallet at any time. Account closure preserves transaction records for tax compliance but anonymizes personal identifiers.</p>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C201_PublicLanding, C202_About, C203_PublicSearchLanding,
  C204_PublicSearchResults, C205_PublicDetail, C206_SignUpGate, C207_FooterPages,
});
