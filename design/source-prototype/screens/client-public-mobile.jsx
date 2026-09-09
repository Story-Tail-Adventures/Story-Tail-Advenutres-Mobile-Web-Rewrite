/* global React, Icon, StoryTailMark, staImg, staAvatar, IOSDevice */
// Client · 2.0m Mobile · Public Pre-Auth surfaces — 11 screens.
// Mobile-native interpretation of the 2.0 desktop public surfaces:
// portrait iOS frame, single-column flow, sticky bottom CTA bar,
// hamburger menu instead of a full nav row.

// ──────────────────────────────────────────────────────────────────────
// Mobile shell
// ──────────────────────────────────────────────────────────────────────

function MFrame({ dark = false, children, footer, scrollable = true }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

function MTopBar({ light = false }) {
  const fg = light ? '#FFF' : 'var(--md-on-surface)';
  const bg = light ? 'transparent' : 'rgba(251,248,243,0.92)';
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 4,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', background: bg, backdropFilter: light ? 'none' : 'blur(10px)',
      borderBottom: light ? 0 : '1px solid var(--md-outline-variant)',
    }}>
      <div className="brand-mark" style={{ color: fg }}>
        <StoryTailMark size={22}/>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
          <span className="mark-script" style={{ color: fg, fontSize: 17 }}>Story-Tail</span>
          <span style={{ font: '700 7.5px/1 var(--font-sans)', letterSpacing: 1.3, color: light ? '#FFC83F' : 'var(--brand-orange)' }}>ADVENTURES</span>
        </span>
      </div>
      <button className="btn-icon" style={{ width: 34, height: 34, color: fg, background: light ? 'rgba(255,255,255,0.15)' : 'transparent', backdropFilter: light ? 'blur(6px)' : 'none' }}>
        <Icon name="more" size={18}/>
      </button>
    </div>
  );
}

function MStickyCTA({ primary = 'Request a quote', secondary = 'Sign in' }) {
  return (
    <div style={{
      padding: '10px 14px 22px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
      display: 'flex', gap: 8,
    }}>
      <button className="btn btn-text" style={{ flex: '0 0 auto' }}>{secondary}</button>
      <button className="btn btn-filled" style={{ flex: 1 }}>
        <Icon name="message" size={14}/> {primary}
      </button>
    </div>
  );
}

const PRICE_DOTS = { '$': 1, '$$': 2, '$$$': 3 };
function MPriceRange({ range }) {
  const filled = PRICE_DOTS[range] || 2;
  return (
    <span style={{ display: 'inline-flex', gap: 1, padding: '2px 7px', borderRadius: 5, background: 'rgba(13,33,55,0.85)', color: '#FFF', font: '700 9px/1 var(--font-mono)', letterSpacing: 0.5 }}>
      {['$','$','$'].map((d, i) => <span key={i} style={{ opacity: i < filled ? 1 : 0.32 }}>$</span>)}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.1 — App Subdomain Landing (mobile)
// ──────────────────────────────────────────────────────────────────────

function M201_PublicLanding({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <div style={{ position: 'relative', minHeight: 540, overflow: 'hidden' }}>
        <img src={staImg('turks', 900, 1200)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.55) 0%, rgba(122,26,31,0.7) 60%, rgba(13,33,55,0.85) 100%)' }}/>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 540 }}>
          <MTopBar light/>
          <div style={{ padding: '20px 22px 28px', color: '#FFF', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span className="t-label-s" style={{ color: '#FFC83F', marginBottom: 10 }}>REST IS A GIFT · CREATION IS A GIFT</span>
            <h1 style={{ font: '800 32px/1.05 var(--font-sans)', letterSpacing: -0.6, margin: 0, color: '#FFF' }}>
              Plan a rest worthy of the <span className="t-script" style={{ color: '#FFC83F', fontSize: 42 }}>world He made.</span>
            </h1>
            <p className="t-body" style={{ marginTop: 12, color: 'rgba(255,255,255,0.92)' }}>Your portal for trips in motion, supplier payments, and dreaming up what's next. Vacation is rest, and rest is sacred.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 24 }}>
              <button className="btn btn-orange btn-lg" style={{ width: '100%' }}>Create an account</button>
              <button className="btn btn-lg" style={{ width: '100%', background: 'rgba(255,255,255,0.18)', color: '#FFF', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.3)' }}>Sign in</button>
              <button className="btn btn-text btn-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>Take a quick tour →</button>
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.18)', display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'baseline', color: 'rgba(255,255,255,0.78)' }}>
              <span className="t-script" style={{ color: '#FFC83F', fontSize: 17 }}>"On the seventh day God rested."</span>
              <span className="t-label-s" style={{ letterSpacing: 1.2, opacity: 0.7 }}>GEN 2 : 2</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 22px 30px', background: 'var(--md-bg)' }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>WHAT YOU CAN DO HERE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {[
            { i: 'plane', t: 'View your trips', s: 'Itinerary, day-by-day, offline at the resort.' },
            { i: 'card', t: 'Authorize cards', s: 'Stripe-secured. We pay suppliers — never charge fees.' },
            { i: 'message', t: 'Message Gyasi', s: 'Threaded by trip. Reply usually under 2h.' },
          ].map((c) => (
            <div key={c.t} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.i} size={16}/>
              </span>
              <div>
                <div className="t-title-s">{c.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.2 — About / How It Works
// ──────────────────────────────────────────────────────────────────────

function M202_About({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MStickyCTA secondary="Skip"/>}>
      <MTopBar/>
      <div style={{ padding: '20px 22px 24px' }}>
        <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>HOW STORY-TAIL WORKS</span>
        <h1 style={{ font: '800 28px/1.1 var(--font-sans)', letterSpacing: -0.5, margin: '4px 0 6px' }}>You ask. We plan. You rest.</h1>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Under 60 seconds of reading — promise. No fees. We exist so you can take the rest you were made for.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {[
            { i: 'message', t: 'Ask', d: 'Tell Gyasi what you\'re craving — beach week, family cruise, honeymoon.' },
            { i: 'sparkle', t: 'Plan together', d: 'A curated proposal: real options, real prices, honest takes — never a search dump.' },
            { i: 'plane', t: 'Go rest', d: 'I book through suppliers, watch the details, and let you receive the rest you came for.' },
          ].map((s, i) => (
            <div key={s.t} className="card" style={{ padding: 14 }}>
              <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>STEP {String(i+1).padStart(2,'0')}</div>
              <div className="t-title-s" style={{ marginTop: 2 }}>{s.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{s.d}</div>
            </div>
          ))}
        </div>

        {/* Our heart */}
        <div style={{ marginTop: 22, padding: '18px 18px 20px', borderRadius: 18, background: 'linear-gradient(135deg, var(--md-surface-2) 0%, var(--md-primary-container) 160%)' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>OUR HEART</span>
          <h2 style={{ font: '700 20px/1.2 var(--font-sans)', margin: '4px 0 4px' }}>Vacation is <i>rest</i>. The world is <i>good</i>.</h2>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Two beliefs behind every trip we plan.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div className="card" style={{ padding: 14, background: 'var(--md-surface-1)' }}>
              <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>01</div>
              <div className="t-title-s" style={{ marginTop: 2 }}>Rest is a command, not a luxury.</div>
              <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 8px' }}>God called the seventh day holy. Vacation isn't escape — it's obedience to a kind invitation.</p>
              <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 18, lineHeight: 1.1 }}>"Come to me, all who are weary." <span style={{ font: '700 9px/1 var(--font-sans)', letterSpacing: 1.2, color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap' }}>MATT 11:28</span></div>
            </div>
            <div className="card" style={{ padding: 14, background: 'var(--md-surface-1)' }}>
              <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>02</div>
              <div className="t-title-s" style={{ marginTop: 2 }}>Creation is a gift, meant to be enjoyed.</div>
              <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 8px' }}>The reef, the trade wind, the warm rain — He called it very good. We help you receive it.</p>
              <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 18, lineHeight: 1.1 }}>"It was very good." <span style={{ font: '700 9px/1 var(--font-sans)', letterSpacing: 1.2, color: 'var(--md-on-surface-variant)' }}>GEN 1:31</span></div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--md-surface-1)' }}>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}><b style={{ color: 'var(--md-on-surface)' }}>Whatever your faith — you're welcome here.</b> This is just where our hands come from.</div>
          </div>
        </div>

        {/* Gyasi card */}
        <div className="card" style={{ marginTop: 22, padding: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--md-surface-2)' }}>
          <img src={staImg('avatarA', 120, 120)} alt="" style={{ width: 60, height: 60, borderRadius: 999 }}/>
          <div>
            <div className="t-title-s">Meet Gyasi Story</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Caribbean specialist · Inteletravel</div>
            <div className="t-body-s" style={{ marginTop: 4, display: 'flex', gap: 8, color: 'var(--md-on-surface-variant)' }}>
              <span><Icon name="star" size={10} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9</span>
              <span>· 240+ trav.</span>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="t-title-l" style={{ marginTop: 22, marginBottom: 8 }}>FAQ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { q: 'Do I pay a planning fee?', a: 'No. Inteletravel policy prohibits it. Gyasi earns commission from suppliers.' },
            { q: 'Can I plan without an account?', a: 'You can browse and message Gyasi. Saving searches needs an account.' },
            { q: 'How do payments work?', a: 'Tokenized through Stripe, capped at the supplier invoice, audited every use.' },
          ].map((f, i) => (
            <details key={i} className="card" style={{ padding: 0 }} open={i === 0}>
              <summary style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: 13.5 }}>
                {f.q} <Icon name="chevron_down" size={14}/>
              </summary>
              <div style={{ padding: '0 14px 12px', color: 'var(--md-on-surface-variant)', font: '400 13px/1.55 var(--font-sans)' }}>{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.3 — Search Landing (no account)
// ──────────────────────────────────────────────────────────────────────

function M203_PublicSearchLanding({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Search" secondary="Sign in"/>}>
      <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <img src={staImg('bahamas', 900, 500)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.55), rgba(13,33,55,0.85))' }}/>
        <div style={{ position: 'relative' }}><MTopBar light/></div>
        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18, color: '#FFF' }}>
          <span className="t-label-s" style={{ color: '#FFC83F' }}>BROWSE WITHOUT AN ACCOUNT</span>
          <h1 style={{ font: '800 26px/1.1 var(--font-sans)', margin: '4px 0 0', color: '#FFF' }}>Find your next chapter.</h1>
        </div>
      </div>

      <div style={{ padding: '16px 22px 24px' }}>
        <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { l: 'Destination', v: 'Caribbean', i: 'map' },
            { l: 'Dates', v: 'Aug 12 – 19', i: 'calendar' },
            { l: 'Travelers', v: '2 adults', i: 'user' },
          ].map((f) => (
            <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--md-outline-variant)' }}>
              <Icon name={f.i} size={14} color="var(--brand-orange)"/>
              <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', width: 86 }}>{f.l}</div>
              <div style={{ font: '600 13px/1.2 var(--font-sans)' }}>{f.v}</div>
            </div>
          ))}
        </div>

        <div className="t-title-l" style={{ marginTop: 22 }}>Inspiration · curated</div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 10px' }}>Six trip types we live and breathe.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { t: 'Caribbean escapes', i: 'turks', tag: '12' },
            { t: 'Family cruises', i: 'cruiseShip', tag: '8' },
            { t: 'Honeymoons', i: 'honeymoon', tag: '6' },
            { t: 'All-inclusive', i: 'overwater', tag: '15' },
            { t: 'Adventure', i: 'snorkel', tag: '4' },
            { t: 'Group · 6+', i: 'overwater', tag: '3' },
          ].map((s) => (
            <div key={s.t} className="card" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '5/4' }}>
              <img src={staImg(s.i, 360, 280)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.7))' }}/>
              <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, color: '#FFF' }}>
                <div style={{ font: '700 12.5px/1.2 var(--font-sans)' }}>{s.t}</div>
                <div style={{ font: '500 10px/1 var(--font-sans)', opacity: 0.85, marginTop: 2 }}>{s.tag} active</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 18, padding: 14, background: 'var(--md-surface-2)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="shield" size={16} color="var(--md-secondary)"/>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Hosted by Inteletravel · CLIA · <Icon name="star" size={10} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9</div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.4 — Search Results
// ──────────────────────────────────────────────────────────────────────

function M204_PublicSearchResults({ dark = false }) {
  const results = [
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only · 7n', p: 3290, i: 'overwater', tag: 'All-incl', r: 4.9 },
    { t: 'Royal Caribbean Symphony', s: 'Eastern Caribbean · 7d', p: 1850, i: 'cruiseShip', tag: 'Cruise', r: 4.7 },
    { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family', p: 2640, i: 'turks', tag: 'Family', r: 4.8 },
    { t: 'Couples Negril', s: 'Negril · Adults-only · 5n', p: 2180, i: 'jamaica', tag: 'Couples', r: 4.6 },
  ];
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Save signing up" secondary="Filter"/>}>
      <MTopBar/>
      <div style={{ padding: '8px 14px 0', background: 'var(--md-surface-1)' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8, borderRadius: 999, font: '500 12px/1 var(--font-sans)' }}>
          <Icon name="search" size={13}/>
          <span style={{ flex: 1, color: 'var(--md-on-surface-variant)' }}>Caribbean · Aug · 2 adults</span>
          <span className="chip" style={{ padding: '2px 8px', font: '600 10px/1 var(--font-sans)' }}>Edit</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0 12px', marginBottom: -1 }}>
          {['All-inclusive', 'Cruise', 'Hotel', 'Adults-only', 'Family', '$ · $$ · $$$'].map((c, i) => (
            <span key={c} className="chip" style={{ flexShrink: 0, padding: '6px 12px', background: i === 0 ? 'var(--md-primary-container)' : 'var(--md-surface-3)', color: i === 0 ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: '14px 14px 18px' }}>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>148 trips · Sort: Best fit</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map((r, i) => (
            <div key={i} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                <img src={staImg(r.i, 600, 340)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(13,33,55,0.85)', color: '#FFF', padding: '3px 8px', borderRadius: 5, font: '700 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{r.tag}</span>
                <button className="btn-icon" style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.92)' }}>
                  <Icon name="heart" size={14}/>
                </button>
              </div>
              <div style={{ padding: 12 }}>
                <div className="t-title-s">{r.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{r.s} · <Icon name="star" size={10} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> {r.r}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div>
                    <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>FROM</span>
                    <div style={{ font: '700 17px/1 var(--font-sans)' }}>${r.p.toLocaleString()}<span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}> /pp</span></div>
                  </div>
                  <button className="btn btn-filled btn-sm">Request quote*</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 10 }}>* Requires creating an account — 60 seconds.</div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.5 — Property Detail
// ──────────────────────────────────────────────────────────────────────

function M205_PublicDetail({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <div style={{ padding: '10px 14px 22px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>FROM</div>
          <div style={{ font: '700 20px/1 var(--font-sans)' }}>$3,290<span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}> /pp</span></div>
        </div>
        <button className="btn btn-tonal btn-sm" style={{ width: 38, height: 38, padding: 0, borderRadius: 999 }}><Icon name="heart" size={14}/></button>
        <button className="btn btn-filled" style={{ flex: 1 }}>Request a quote</button>
      </div>
    }>
      <div style={{ position: 'relative', height: 280, overflow: 'hidden' }}>
        <img src={staImg('overwater', 900, 600)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6))' }}/>
        <div style={{ position: 'relative' }}><MTopBar light/></div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14, color: '#FFF' }}>
          <span style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--brand-burgundy)', padding: '3px 8px', borderRadius: 6, font: '700 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase' }}>All-inclusive · 7 nights</span>
          <h1 style={{ font: '800 24px/1.15 var(--font-sans)', margin: '8px 0 4px', color: '#FFF' }}>Sandals Royal Bahamian</h1>
          <div style={{ font: '500 12px/1.3 var(--font-sans)', opacity: 0.92, display: 'flex', gap: 12 }}>
            <span><Icon name="pin" size={11}/> Nassau</span>
            <span><Icon name="star" size={11} color="var(--brand-sunset)" fill="var(--brand-sunset)"/> 4.9 · 312</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 22px 18px' }}>
        <div className="t-title-l">What it is</div>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 14px' }}>Over-water bungalows, six pools, twelve dining venues, a Red Lane spa, and a private island day. Adults-only — built for honeymoons and "just us" weeks.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { i: 'plane', t: 'Flights incl.' },
            { i: 'utensils', t: '12 restaurants' },
            { i: 'heart', t: 'Spa credit' },
            { i: 'ship', t: 'Rose Island day' },
          ].map((f) => (
            <div key={f.t} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={f.i} size={14} color="var(--brand-orange)"/>
              <div className="t-body-s">{f.t}</div>
            </div>
          ))}
        </div>

        <div className="t-title-l" style={{ marginTop: 18 }}>Sample itinerary</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {['Day 1 · Arrival & sunset welcome', 'Day 2 · Beach + Red Lane spa', 'Day 3 · Rose Island Cay snorkel', 'Day 4 · Resort day'].map((d, i) => (
            <div key={d} className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 10px/1 var(--font-sans)' }}>{i+1}</span>
              <div className="t-body-s">{d}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 18, padding: 14, background: 'var(--md-surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={staImg('avatarA', 80, 80)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
          <div style={{ flex: 1 }}>
            <div className="t-title-s">Gyasi planned 14 of these</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Caribbean specialist</div>
          </div>
          <button className="btn btn-text btn-sm">Message →</button>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.6 — Sign-up Gate
// ──────────────────────────────────────────────────────────────────────

function M206_SignUpGate({ dark = false }) {
  return (
    <MFrame dark={dark} scrollable={false}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 50% 25%, rgba(122,26,31,0.18), transparent), var(--md-bg)' }}>
        <MTopBar/>
        <div style={{ flex: 1, padding: '18px 18px 22px', display: 'flex', flexDirection: 'column' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>ALMOST THERE</span>
          <h2 style={{ font: '800 24px/1.18 var(--font-sans)', margin: '4px 0 4px' }}>Create an account to send your trip details to Gyasi.</h2>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 14px' }}>About 60 seconds. You'll get a real proposal back — not a generic search dump.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {[
              'Save searches & favorites',
              'View curated proposals',
              'Authorize cards · paid to suppliers, not us',
            ].map((b) => (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 13px/1.4 var(--font-sans)' }}>
                <Icon name="check" size={13} color="var(--md-success)" stroke={2.5}/> {b}
              </div>
            ))}
          </div>

          <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9V14.9H8V12h2.5V9.7c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7C18.3 21.2 22 17 22 12Z" fill="#1565C0"/></svg>
            Continue with Google
          </button>
          <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 12 }}>
            <Icon name="user" size={13}/> Continue with Apple
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
            <hr className="divider" style={{ flex: 1 }}/>
            <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR EMAIL</span>
            <hr className="divider" style={{ flex: 1 }}/>
          </div>
          <input className="input" defaultValue="Jordan Hayes" style={{ marginBottom: 8 }} placeholder="Your name"/>
          <input className="input" defaultValue="jordan.hayes@example.com" style={{ marginBottom: 8 }} placeholder="Email"/>
          <input className="input" type="password" defaultValue="••••••••••••" placeholder="Password"/>

          <button className="btn btn-filled btn-lg" style={{ width: '100%', marginTop: 14 }}>Create account &amp; send quote</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, font: '500 11.5px/1 var(--font-sans)' }}>
            <a href="#" style={{ color: 'var(--md-primary)' }}>Sign in</a>
            <a href="#" style={{ color: 'var(--md-on-surface-variant)' }}>Continue as guest →</a>
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.7 — Footer Pages (Privacy)
// ──────────────────────────────────────────────────────────────────────

function M207_FooterPages({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MTopBar/>
      <div style={{ padding: '14px 18px 22px' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
          {['Privacy', 'Terms', 'Cookies', 'Accessibility', 'DPA'].map((s, i) => (
            <span key={s} className="chip" style={{ flexShrink: 0, padding: '6px 12px', background: i === 0 ? 'var(--md-secondary-container)' : 'var(--md-surface-2)', color: i === 0 ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}>{s}</span>
          ))}
        </div>

        <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>LEGAL</span>
        <h1 style={{ font: '800 24px/1.2 var(--font-sans)', margin: '4px 0 4px' }}>Privacy policy</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--md-on-surface-variant)', font: '500 11.5px/1 var(--font-sans)', marginBottom: 14 }}>
          Last updated May 14, 2026 · <a href="#" style={{ color: 'var(--md-primary)' }}>PDF</a>
        </div>

        <div style={{ font: '400 13.5px/1.65 var(--font-sans)', color: 'var(--md-on-surface)' }}>
          <h3 className="t-title-s" style={{ marginTop: 4 }}>1. What we collect</h3>
          <p style={{ margin: '4px 0 12px', color: 'var(--md-on-surface-variant)' }}>Story-Tail collects contact info, trip details, and payment-card data (tokenized via Stripe) only to provide travel advisory services. We don't sell or share with marketing third parties.</p>
          <h3 className="t-title-s">2. Payment cards</h3>
          <p style={{ margin: '4px 0 12px', color: 'var(--md-on-surface-variant)' }}>Cards are tokenized by Stripe Elements before they leave your browser. Story-Tail never sees the full card number. Used solely to pay travel suppliers on your behalf, audit-logged every time.</p>
          <h3 className="t-title-s">3. Your rights</h3>
          <p style={{ margin: '4px 0 12px', color: 'var(--md-on-surface-variant)' }}>Request a full data export from Account → Privacy. Revoke any stored card from Wallet. Account closure preserves transaction records for tax compliance but anonymizes personal identifiers.</p>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Topic-page helpers (Caribbean / Cruises / Honeymoons)
// ──────────────────────────────────────────────────────────────────────

function MHero({ img, overline, title, script, sub, tall }) {
  return (
    <div style={{ position: 'relative', height: tall ? 360 : 280, overflow: 'hidden' }}>
      <img src={staImg(img, 900, 700)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.45) 0%, rgba(122,26,31,0.55) 60%, rgba(13,33,55,0.9) 100%)' }}/>
      <div style={{ position: 'relative' }}><MTopBar light/></div>
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18, color: '#FFF' }}>
        <span className="t-label-s" style={{ color: '#FFC83F' }}>{overline}</span>
        <h1 style={{ font: '800 26px/1.08 var(--font-sans)', margin: '4px 0 2px', color: '#FFF', letterSpacing: -0.4 }}>
          {title} {script && <span className="t-script" style={{ color: '#FFC83F', fontSize: 34 }}>{script}</span>}
        </h1>
        {sub && <p className="t-body-s" style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.88)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function MTripTile({ t, s, img, range, tag, badge }) {
  return (
    <div className="card" style={{ overflow: 'hidden', display: 'flex' }}>
      <div style={{ position: 'relative', width: 120, flexShrink: 0 }}>
        <img src={staImg(img, 240, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        {badge && <span style={{ position: 'absolute', top: 6, left: 6, background: 'var(--md-secondary)', color: 'var(--md-on-secondary)', padding: '2px 6px', borderRadius: 4, font: '700 8.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{badge}</span>}
      </div>
      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
          <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{tag}</div>
          <MPriceRange range={range}/>
        </div>
        <div className="t-title-s" style={{ marginTop: 2, fontSize: 13.5 }}>{t}</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 12 }}>{s}</div>
        <button className="btn btn-filled btn-sm" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>Request quote</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.8 — Caribbean
// ──────────────────────────────────────────────────────────────────────

function M208_Caribbean({ dark = false }) {
  const islands = [
    { n: 'Turks & Caicos', img: 'turks' }, { n: 'Bahamas', img: 'bahamas' },
    { n: 'St. Lucia', img: 'stlucia' }, { n: 'Jamaica', img: 'jamaica' },
    { n: 'Aruba', img: 'aruba' }, { n: 'BVI', img: 'bvi' },
  ];
  const trips = [
    { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family', tag: 'ALL-INCL · FAMILY', img: 'turks', range: '$$', badge: "Gyasi's pick" },
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only', tag: 'ADULTS', img: 'bahamas', range: '$$$' },
    { t: 'Couples Negril', s: 'Negril · Quiet · No kids', tag: 'COUPLES', img: 'jamaica', range: '$$' },
    { t: 'Bucuti & Tara', s: 'Eagle Beach Aruba · Boutique', tag: 'BOUTIQUE', img: 'aruba', range: '$$$' },
    { t: 'BVI sailing charter', s: '7-night skippered cat', tag: 'SAILING', img: 'bvi', range: '$$$' },
  ];
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Request a quote" secondary="Browse all"/>}>
      <MHero
        img="turks"
        overline="CARIBBEAN VACATIONS"
        title="A region built for"
        script="rest."
        sub="Twelve islands. One advisor who's planned every one of them."
      />

      <div style={{ padding: '18px 18px 24px' }}>
        {/* Intro band */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {[
            { i: 'palm', t: 'You won\'t have to think.', d: 'Transfers, dining, the spa slot you didn\'t know you needed — handled before you leave home.' },
            { i: 'shield', t: 'Real prices, honest takes.', d: 'I tell you which resorts are tired and which are quietly the best.' },
            { i: 'heart', t: 'Rest you bring home.', d: 'We plan the week with the goal of restoration, not just photos.' },
          ].map((c) => (
            <div key={c.t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.i} size={15}/>
              </span>
              <div>
                <div style={{ font: '700 14px/1.2 var(--font-sans)' }}>{c.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Islands — horizontal scroll */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>ISLANDS</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Where to land</h2>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginLeft: -18, paddingLeft: 18, marginRight: -18, paddingRight: 18 }}>
          {islands.map((isl) => (
            <div key={isl.n} className="card" style={{ flexShrink: 0, width: 110, position: 'relative', overflow: 'hidden', aspectRatio: '4/5' }}>
              <img src={staImg(isl.img, 240, 320)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.75))' }}/>
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, color: '#FFF', font: '700 11px/1.15 var(--font-sans)' }}>{isl.n}</div>
            </div>
          ))}
        </div>

        {/* Trips */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 22 }}>HAND-PICKED</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Caribbean weeks Gyasi loves</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map((t) => <MTripTile key={t.t} {...t}/>)}
        </div>
        <button className="btn btn-tonal" style={{ width: '100%', marginTop: 12 }}>See all 28 Caribbean trips →</button>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.9 — Cruises
// ──────────────────────────────────────────────────────────────────────

function M209_Cruises({ dark = false }) {
  const types = [
    { t: 'Family', d: 'Multi-gen sailings · waterparks · connecting rooms.', img: 'cruiseShip', tag: 'FAMILY' },
    { t: 'Adults-only', d: 'Virgin, Viking, premium Celebrity — quieter ships, real dining.', img: 'cruiseAerial', tag: 'ADULTS' },
    { t: 'Group', d: '8+ travelers · birthday, anniversary, ministry, friends week.', img: 'overwater', tag: 'GROUP' },
  ];
  const trips = [
    { t: 'Symphony of the Seas', s: 'Eastern Caribbean · 7n · Miami', tag: 'ROYAL', img: 'cruiseShip', range: '$$', badge: "Gyasi's" },
    { t: 'Disney Fantasy', s: 'Western Caribbean · 7n · Castaway', tag: 'DISNEY · FAMILY', img: 'cruiseAerial', range: '$$$' },
    { t: 'Celebrity Edge', s: 'Southern · 11n · Curaçao + Aruba', tag: 'CELEBRITY', img: 'cruiseShip', range: '$$$' },
    { t: 'Virgin Resilient Lady', s: 'Adults-only · 5n · Puerto Plata', tag: 'VIRGIN', img: 'cruiseAerial', range: '$$' },
    { t: 'Carnival Celebration', s: 'Eastern · 6n · Family-priced', tag: 'CARNIVAL', img: 'cruiseShip', range: '$' },
  ];
  const lines = ['Royal Caribbean', 'Celebrity', 'Disney', 'Princess', 'Carnival', 'Virgin', 'Norwegian', 'Holland America'];
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Request a quote" secondary="All sailings"/>}>
      <MHero
        img="cruiseAerial"
        overline="CRUISING"
        title="A floating Sabbath,"
        script="every morning new."
        sub="Unpack once. See three islands. We pick the ship — you pick the balcony."
      />

      <div style={{ padding: '18px 18px 24px' }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>WHO IT'S FOR</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Three kinds of cruise.</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {types.map((tp) => (
            <div key={tp.t} className="card" style={{ overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: 100, flexShrink: 0, position: 'relative' }}>
                <img src={staImg(tp.img, 240, 280)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(255,255,255,0.94)', color: 'var(--brand-burgundy)', padding: '2px 6px', borderRadius: 4, font: '700 8.5px/1 var(--font-sans)', letterSpacing: 0.4 }}>{tp.tag}</span>
              </div>
              <div style={{ padding: 12, flex: 1 }}>
                <div className="t-title-s">{tp.t} cruises</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 12, marginTop: 4 }}>{tp.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>LINES WE BOOK</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 18 }}>
          {lines.map((l) => <span key={l} className="chip" style={{ padding: '6px 10px', font: '500 11.5px/1 var(--font-sans)' }}>{l}</span>)}
        </div>

        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>HAND-PICKED</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Sailings worth booking</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map((t) => <MTripTile key={t.t} {...t}/>)}
        </div>
        <button className="btn btn-tonal" style={{ width: '100%', marginTop: 12 }}>See all 36 sailings →</button>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.10 — Honeymoons
// ──────────────────────────────────────────────────────────────────────

function M2010_Honeymoons({ dark = false }) {
  const styles = [
    { t: 'Adults-only resorts', d: 'Sandals, Couples, Excellence.', img: 'overwater', tag: 'ALL-INCL' },
    { t: 'Overwater bungalows', d: 'Tahiti, Maldives, El Dorado.', img: 'overwater', tag: 'OVERWATER' },
    { t: 'Multi-stop', d: 'Two islands. Busy first, rest second.', img: 'sunset', tag: 'MULTI-STOP' },
  ];
  const trips = [
    { t: 'Sandals Grande St. Lucian', s: 'Overwater · 7n', tag: 'OVERWATER', img: 'stlucia', range: '$$$', badge: "Gyasi's" },
    { t: 'Couples Sans Souci', s: 'Ocho Rios · Cliffside · 7n', tag: 'BOUTIQUE', img: 'jamaica', range: '$$' },
    { t: 'Excellence Playa Mujeres', s: 'Cancún · Adults-only', tag: 'ALL-INCL', img: 'aruba', range: '$$' },
    { t: 'Le Blanc Spa Resort', s: 'Cancún · Five-star', tag: 'LUXURY', img: 'overwater', range: '$$$' },
  ];
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Request a quote" secondary="Message Gyasi"/>}>
      <MHero
        img="overwater"
        overline="HONEYMOONS"
        title="The first rest,"
        script="after the I-do's."
        sub="A week to begin your marriage — quiet, unhurried, around the two of you."
        tall
      />

      <div style={{ padding: '18px 18px 24px' }}>
        {/* Gyasi note */}
        <div className="card" style={{ padding: 14, background: 'var(--md-surface-2)', display: 'flex', gap: 12, marginBottom: 20 }}>
          <img src={staImg('avatarA', 80, 80)} alt="" style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0 }}/>
          <div>
            <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>A NOTE FROM GYASI</div>
            <p className="t-body-s" style={{ margin: '4px 0 0', color: 'var(--md-on-surface)' }}>I ask one question first: <i>what kind of rest does your marriage need to begin with?</i> Then we plan from there.</p>
          </div>
        </div>

        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>THREE WAYS</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Pick the rhythm.</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {styles.map((s) => (
            <div key={s.t} className="card" style={{ overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: 96, flexShrink: 0, position: 'relative' }}>
                <img src={staImg(s.img, 240, 280)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(255,255,255,0.94)', color: 'var(--brand-burgundy)', padding: '2px 6px', borderRadius: 4, font: '700 8.5px/1 var(--font-sans)', letterSpacing: 0.4 }}>{s.tag}</span>
              </div>
              <div style={{ padding: 12, flex: 1 }}>
                <div className="t-title-s" style={{ fontSize: 13.5 }}>{s.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 12, marginTop: 2 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>FEATURED</div>
        <h2 style={{ font: '700 18px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>Honeymoons booked this year</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {trips.map((t) => <MTripTile key={t.t} {...t}/>)}
        </div>

        {/* Christian couples sub-card */}
        <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg, var(--md-primary-container) 0%, var(--md-secondary-container) 110%)', padding: 18 }}>
          <span className="t-label-s" style={{ color: 'var(--brand-burgundy)' }}>FOR CHRISTIAN COUPLES</span>
          <h3 style={{ font: '700 17px/1.25 var(--font-sans)', margin: '4px 0 6px', color: 'var(--md-on-primary-container)' }}>A honeymoon that honors what you just promised.</h3>
          <p className="t-body-s" style={{ color: 'var(--md-on-primary-container)', opacity: 0.85, margin: 0 }}>Quieter resorts, family-owned boutiques, an Adventist-friendly Sabbath rhythm if you ask for it. Just note it on the inquiry — no upcharge, no awkwardness.</p>
          <button className="btn btn-filled btn-sm" style={{ marginTop: 12, background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>See the curated list →</button>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// M2.0.11 — About Gyasi
// ──────────────────────────────────────────────────────────────────────

function M2011_AboutGyasi({ dark = false }) {
  const stats = [
    { n: '240+', l: 'Travelers' },
    { n: '4.9★', l: '138 reviews' },
    { n: '<2h', l: 'Avg reply' },
    { n: '5yr', l: 'Specialist' },
  ];
  const creds = ['Hosted by Inteletravel', 'CLIA Member', 'Sandals Certified', 'Royal Caribbean Master'];
  const testimonials = [
    { q: 'Gyasi planned our first family cruise. Three kids, two grandparents — she didn\'t miss a detail.', who: 'The Westbrooks', trip: 'Symphony · Dec', a: 'avatarC' },
    { q: 'She steered us to a quieter resort than what we picked online — saved thousands too.', who: 'Reggie & Marc', trip: 'St. Lucia · May', a: 'avatarD' },
    { q: 'I message her at 9pm with random questions and she replies. That\'s the whole pitch.', who: 'Aisha P.', trip: 'Atlantis · Mar', a: 'avatarE' },
  ];
  return (
    <MFrame dark={dark} footer={<MStickyCTA primary="Request a quote" secondary="Message me"/>}>
      {/* Portrait hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, #5C0F13 0%, #7A1A1F 50%, #E87722 130%)', minHeight: 380 }}>
        <div style={{ position: 'relative' }}><MTopBar light/></div>
        <div style={{ padding: '20px 22px 220px', color: '#FFF' }}>
          <span className="t-label-s" style={{ color: '#FFC83F' }}>YOUR ADVISOR</span>
          <h1 style={{ font: '800 32px/1.05 var(--font-sans)', margin: '4px 0 6px', color: '#FFF' }}>Hi, I'm <span className="t-script" style={{ color: '#FFC83F', fontSize: 44 }}>Gyasi.</span></h1>
          <p className="t-body-s" style={{ color: 'rgba(255,255,255,0.92)', margin: 0 }}>Caribbean specialist, mom of three, Sandals-certified, hosted by Inteletravel.</p>
        </div>
        <img src={staImg('avatarA', 600, 600)} alt="" style={{ position: 'absolute', right: -10, bottom: -10, width: 200, height: 200, borderRadius: 999, objectFit: 'cover', border: '4px solid rgba(255,255,255,0.4)' }}/>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
        {stats.map((s, i) => (
          <div key={s.l} style={{ padding: '14px 6px', textAlign: 'center', borderLeft: i > 0 ? '1px solid var(--md-outline-variant)' : 0 }}>
            <div style={{ font: '800 18px/1 var(--font-sans)', color: 'var(--brand-burgundy)' }}>{s.n}</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 10.5, marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 22px 24px' }}>
        {/* Bio */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>THE STORY</div>
        <h2 style={{ font: '700 20px/1.2 var(--font-sans)', margin: '2px 0 10px' }}>How Story-Tail started.</h2>
        <p className="t-body" style={{ color: 'var(--md-on-surface)', margin: 0 }}>I started planning trips for friends in 2019 because they kept asking. By 2021 the side-thing had a name — <i>Story-Tail Adventures</i> — and a backlog. I'm hosted by Inteletravel, which means you get my care plus an IATA-accredited host agency behind every booking.</p>
        <p className="t-body" style={{ color: 'var(--md-on-surface)', marginTop: 10 }}>My belief is simple: vacation isn't an escape from your life, it's a gift. The world is good. Rest is good. My job is to remove the friction so you can receive both.</p>
        <p className="t-script" style={{ margin: '12px 0 0', color: 'var(--brand-burgundy)', fontSize: 26 }}>— Gyasi</p>

        {/* Credentials */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 22 }}>CREDENTIALS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {creds.map((c) => (
            <div key={c} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="shield" size={14} color="var(--md-secondary)"/>
              <div style={{ font: '600 13px/1.2 var(--font-sans)' }}>{c}</div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 22 }}>WHAT TRAVELERS SAY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {testimonials.map((t, i) => (
            <div key={i} className="card" style={{ padding: 14 }}>
              <span style={{ font: '700 24px/0.5 var(--font-script)', color: 'var(--brand-orange)' }}>"</span>
              <p className="t-body-s" style={{ color: 'var(--md-on-surface)', margin: '4px 0 10px', fontSize: 12.5 }}>{t.q}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--md-outline-variant)' }}>
                <img src={staImg(t.a, 80, 80)} alt="" style={{ width: 28, height: 28, borderRadius: 999 }}/>
                <div>
                  <div style={{ font: '600 12px/1.2 var(--font-sans)' }}>{t.who}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 11 }}>{t.trip}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 22 }}>FAQ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {[
            { q: 'Do you charge a planning fee?', a: 'No. Inteletravel policy prohibits it. I earn commission from suppliers when you travel.' },
            { q: 'Why the Caribbean specifically?', a: 'I lived in the islands. I know which resorts are quietly the best, which ships fit which families.' },
            { q: 'Do you book non-Caribbean trips?', a: 'Yes — Mexico, Europe, cruises anywhere, group trips. Caribbean is my deepest specialty, not my only one.' },
          ].map((f, i) => (
            <details key={i} className="card" style={{ padding: 0 }} open={i === 0}>
              <summary style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: 13 }}>
                {f.q} <Icon name="chevron_down" size={13}/>
              </summary>
              <div style={{ padding: '0 14px 12px', color: 'var(--md-on-surface-variant)', font: '400 12.5px/1.55 var(--font-sans)' }}>{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  M201_PublicLanding, M202_About, M203_PublicSearchLanding, M204_PublicSearchResults,
  M205_PublicDetail, M206_SignUpGate, M207_FooterPages,
  M208_Caribbean, M209_Cruises, M2010_Honeymoons, M2011_AboutGyasi,
});
