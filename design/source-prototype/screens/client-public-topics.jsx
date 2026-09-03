/* global React, Icon, StoryTailMark, staImg, staAvatar, ScreenFrame */
// Client · 2.0 Public — Topic & advisor landing pages.
// Format: Hero + sticky inquire bar + curated tile grid.
// Voice: subtle Rest + Wonder language; no explicit scripture except the
// one designated Christian sub-card in Honeymoons.

// ──────────────────────────────────────────────────────────────────────
// Shared building blocks
// ──────────────────────────────────────────────────────────────────────

function HeroBleed({ img, overline, title, script, sub, gradient, tall }) {
  return (
    <div style={{ position: 'relative', height: tall ? 420 : 360, overflow: 'hidden' }}>
      <img src={staImg(img, 1800, 700)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      <div style={{ position: 'absolute', inset: 0, background: gradient || 'linear-gradient(115deg, rgba(13,33,55,0.7) 0%, rgba(122,26,31,0.45) 55%, rgba(0,0,0,0.15) 100%)' }}/>
      <div style={{ position: 'absolute', inset: 0, padding: '40px 48px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', maxWidth: 760 }}>
        {overline && <span className="t-label-s" style={{ color: '#FFC83F', marginBottom: 8 }}>{overline}</span>}
        <h1 className="t-display" style={{ margin: 0, color: '#FFF', lineHeight: 1.04 }}>
          {title} {script && <span className="t-script" style={{ color: '#FFC83F', fontSize: 64 }}>{script}</span>}
        </h1>
        {sub && <p className="t-body-l" style={{ marginTop: 12, color: 'rgba(255,255,255,0.92)', maxWidth: 620 }}>{sub}</p>}
      </div>
    </div>
  );
}

function StickyInquireBar({ destination, dates, travelers, vibe }) {
  return (
    <div style={{
      position: 'sticky', top: 56, zIndex: 5,
      padding: '14px 48px', background: 'var(--md-surface-1)',
      borderBottom: '1px solid var(--md-outline-variant)',
      boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
    }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, borderRadius: 999, boxShadow: 'var(--md-shadow-1)' }}>
        {[
          { l: 'Destination', v: destination, i: 'map' },
          { l: 'When', v: dates, i: 'calendar' },
          { l: 'Travelers', v: travelers, i: 'user' },
          { l: 'Vibe', v: vibe, i: 'palm' },
        ].map((f, i) => (
          <div key={f.l} style={{ flex: 1, padding: '10px 16px', borderRight: i < 3 ? '1px solid var(--md-outline-variant)' : 'none' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{f.l}</div>
            <div style={{ font: '600 13px/1.2 var(--font-sans)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--md-on-surface)' }}>
              <Icon name={f.i} size={13} color="var(--brand-orange)"/> {f.v}
            </div>
          </div>
        ))}
        <button className="btn btn-filled" style={{ height: 44, margin: 4 }}>
          <Icon name="message" size={14}/> Request a quote
        </button>
      </div>
    </div>
  );
}

const PRICE_DOTS = { '$': 1, '$$': 2, '$$$': 3 };
function PriceRange({ range }) {
  const filled = PRICE_DOTS[range] || 2;
  return (
    <span style={{
      display: 'inline-flex', gap: 1, padding: '3px 8px', borderRadius: 6,
      background: 'rgba(13,33,55,0.85)', color: '#FFF',
      font: '700 10px/1 var(--font-mono)', letterSpacing: 0.5,
    }}>
      {['$', '$', '$'].map((d, i) => (
        <span key={i} style={{ opacity: i < filled ? 1 : 0.32 }}>$</span>
      ))}
    </span>
  );
}

function TripTile({ t, s, img, range, tag, badge }) {
  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '5/3' }}>
        <img src={staImg(img, 600, 360)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        {badge && (
          <span style={{ position: 'absolute', top: 10, left: 10, background: 'var(--md-secondary)', color: 'var(--md-on-secondary)', padding: '3px 9px', borderRadius: 999, font: '700 9.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{badge}</span>
        )}
        <span style={{ position: 'absolute', top: 10, right: 10 }}><PriceRange range={range}/></span>
      </div>
      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{tag}</div>
        <div className="t-title-s" style={{ marginTop: 2 }}>{t}</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{s}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10 }}>
          <button className="btn btn-filled btn-sm" style={{ flex: 1 }}>Request quote</button>
          <button className="btn-icon" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--md-outline-variant)' }}>
            <Icon name="heart" size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ overline, title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {overline && <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{overline}</span>}
      <h2 className="t-headline" style={{ margin: '4px 0 4px' }}>{title}</h2>
      {sub && <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0, maxWidth: 720 }}>{sub}</p>}
    </div>
  );
}

function ClosingCTA({ image, title, body, primary = 'Request a quote', secondary = 'Message Gyasi first' }) {
  return (
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', margin: '12px 0 0', minHeight: 220 }}>
      <img src={staImg(image, 1600, 500)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.85), rgba(13,33,55,0.55))' }}/>
      <div style={{ position: 'relative', padding: '32px 36px', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 540 }}>
          <h3 className="t-headline" style={{ margin: 0, color: '#FFF' }}>{title}</h3>
          <p className="t-body" style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.9)' }}>{body}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-orange btn-lg">{primary}</button>
          <button className="btn btn-lg" style={{ background: 'rgba(255,255,255,0.18)', color: '#FFF', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.3)' }}>{secondary}</button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.8 — Caribbean
// ──────────────────────────────────────────────────────────────────────

function C208_Caribbean() {
  const islands = [
    { n: 'Turks & Caicos', img: 'turks' }, { n: 'Bahamas', img: 'bahamas' },
    { n: 'St. Lucia', img: 'stlucia' }, { n: 'Jamaica', img: 'jamaica' },
    { n: 'Aruba', img: 'aruba' }, { n: 'BVI', img: 'bvi' },
  ];
  const trips = [
    { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family all-inclusive', tag: 'ALL-INCLUSIVE · FAMILY', img: 'turks', range: '$$', badge: "Gyasi's pick" },
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only · 7 nights', tag: 'ALL-INCLUSIVE · ADULTS', img: 'bahamas', range: '$$$' },
    { t: 'Sandals Grande St. Lucian', s: 'Rodney Bay · Lush rainforest views', tag: 'ALL-INCLUSIVE · COUPLES', img: 'stlucia', range: '$$$' },
    { t: 'Couples Negril', s: 'Negril · Quiet, all-inclusive, no kids', tag: 'ALL-INCLUSIVE · COUPLES', img: 'jamaica', range: '$$' },
    { t: 'Bucuti & Tara · Aruba', s: 'Eagle Beach · Boutique adult-only', tag: 'BOUTIQUE · ADULTS', img: 'aruba', range: '$$$' },
    { t: 'Atlantis Paradise Island', s: 'Nassau · Waterpark + family suites', tag: 'RESORT · FAMILY', img: 'bahamas', range: '$$' },
    { t: 'Excellence Oyster Bay', s: 'Falmouth · Adults-only all-inclusive', tag: 'ALL-INCLUSIVE · ADULTS', img: 'jamaica', range: '$$' },
    { t: 'BVI sailing charter', s: '7-night skippered catamaran', tag: 'SAILING · GROUP', img: 'bvi', range: '$$$', badge: 'Group fav' },
    { t: 'Beaches Negril', s: 'Negril · Sesame Street + 7 beaches', tag: 'ALL-INCLUSIVE · FAMILY', img: 'overwater', range: '$$' },
  ];

  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="turks"
        overline="CARIBBEAN VACATIONS"
        title="A region built for"
        script="rest."
        sub="Twelve islands. One advisor who's planned every one of them. The hard part isn't finding a good week — it's choosing which good one."
      />
      <StickyInquireBar destination="Anywhere Caribbean" dates="Flexible · 7 nights" travelers="2 adults" vibe="Beach + rest"/>

      <div style={{ padding: '32px 48px 56px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Intro band */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 36 }}>
          {[
            { i: 'palm', t: 'You won\'t have to think.', d: 'Transfers, dining reservations, the spa slot you didn\'t know you needed — handled before you leave Miami.' },
            { i: 'shield', t: 'Real prices, honest takes.', d: 'I tell you which resorts are tired and which ones are quietly the best. No commission steers my picks.' },
            { i: 'heart', t: 'A week worth returning to.', d: 'The point isn\'t the trip — it\'s the rest you bring home from it. We plan with that in mind.' },
          ].map((c) => (
            <div key={c.t} style={{ padding: '14px 16px' }}>
              <Icon name={c.i} size={20} color="var(--brand-orange)"/>
              <div className="t-title-l" style={{ margin: '8px 0 4px' }}>{c.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.d}</div>
            </div>
          ))}
        </div>

        {/* Island chip strip */}
        <SectionLabel overline="ISLANDS" title="Where to land" sub="Tap an island to start a search, or let Gyasi suggest one based on your week."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 36 }}>
          {islands.map((isl) => (
            <div key={isl.n} className="card" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '4/5', cursor: 'pointer' }}>
              <img src={staImg(isl.img, 320, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))' }}/>
              <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: '#FFF', font: '700 13px/1.2 var(--font-sans)' }}>{isl.n}</div>
            </div>
          ))}
        </div>

        {/* Trip grid */}
        <SectionLabel overline="HAND-PICKED · 9 TRIPS" title="Caribbean weeks Gyasi loves right now" sub="Updated monthly. The $ chip is a rough range — request a quote to see real prices for your dates."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          {trips.map((t) => <TripTile key={t.t} {...t}/>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
          <button className="btn btn-tonal">See all 28 Caribbean trips →</button>
        </div>

        <ClosingCTA
          image="overwater"
          title="Tell me your week. I'll come back with three good options."
          body="No account needed to message. No planning fees, ever. Just a real conversation about what you actually need."
        />
      </div>
    </ScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.9 — Cruises
// ──────────────────────────────────────────────────────────────────────

function C209_Cruises() {
  const types = [
    { t: 'Family cruises', d: 'Multi-gen sailings with waterparks, character meet-ups, and rooms that connect.', img: 'cruiseShip', tag: 'FAMILY' },
    { t: 'Adults-only', d: 'Virgin, Viking, premium Celebrity — quieter ships, real dining, no kids underfoot.', img: 'cruiseAerial', tag: 'ADULTS' },
    { t: 'Group cruises', d: '8+ travelers — birthday, anniversary, ministry, friends week. Group rates + a coordinator.', img: 'overwater', tag: 'GROUP' },
  ];
  const lines = ['Royal Caribbean', 'Celebrity', 'Disney', 'Princess', 'Carnival', 'Virgin Voyages', 'Norwegian', 'Holland America'];
  const trips = [
    { t: 'Symphony of the Seas', s: 'Eastern Caribbean · 7 nights · From Miami', tag: 'ROYAL CARIBBEAN', img: 'cruiseShip', range: '$$', badge: "Gyasi's pick" },
    { t: 'Disney Fantasy', s: 'Western Caribbean · 7 nights · Castaway Cay', tag: 'DISNEY · FAMILY', img: 'cruiseAerial', range: '$$$' },
    { t: 'Celebrity Edge', s: 'Southern Caribbean · 11 nights · Curaçao + Aruba', tag: 'CELEBRITY · ADULTS', img: 'cruiseShip', range: '$$$' },
    { t: 'Princess Sky', s: 'Bahamas · 4 nights · Quick getaway', tag: 'PRINCESS · WEEKEND', img: 'bahamas', range: '$' },
    { t: 'Virgin Resilient Lady', s: 'Adults-only · 5 nights · Puerto Plata', tag: 'VIRGIN · ADULTS', img: 'cruiseAerial', range: '$$' },
    { t: 'Carnival Celebration', s: 'Eastern Caribbean · 6 nights · Family-priced', tag: 'CARNIVAL · FAMILY', img: 'cruiseShip', range: '$' },
    { t: 'Holland America Eurodam', s: 'Panama Canal · 11 nights · Bucket-list', tag: 'HAL · GROUP', img: 'cruiseAerial', range: '$$$' },
    { t: 'Norwegian Encore', s: 'Bermuda · 7 nights · Pink-sand beaches', tag: 'NCL · FAMILY', img: 'bahamas', range: '$$' },
    { t: 'Royal Wonder of the Seas', s: 'Western Caribbean · 7 nights · Mahogany Bay', tag: 'ROYAL · FAMILY', img: 'cruiseShip', range: '$$' },
  ];

  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="cruiseAerial"
        overline="CRUISING"
        title="A floating Sabbath,"
        script="every morning new."
        sub="Unpack once. See three islands. The ship handles dinner, the towel art, the kids' club — you handle being on a balcony at sunrise."
      />
      <StickyInquireBar destination="Caribbean cruise" dates="Flexible · 7 nights" travelers="2 adults" vibe="Family · Adults · Group"/>

      <div style={{ padding: '32px 48px 56px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Three types */}
        <SectionLabel overline="WHO IT'S FOR" title="Three kinds of cruise, one advisor." sub="I sail with each line at least once a year, so the recommendation isn't a brochure — it's lived."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 36 }}>
          {types.map((tp) => (
            <div key={tp.t} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: 160 }}>
                <img src={staImg(tp.img, 600, 320)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.92)', color: 'var(--brand-burgundy)', padding: '3px 9px', borderRadius: 6, font: '700 9.5px/1 var(--font-sans)', letterSpacing: 0.5 }}>{tp.tag}</span>
              </div>
              <div style={{ padding: 16 }}>
                <div className="t-title-l">{tp.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{tp.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Cruise lines */}
        <SectionLabel overline="LINES WE BOOK" title="Eight lines, picked for the trip — not the loyalty points."/>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
          {lines.map((l) => (
            <span key={l} className="chip" style={{ padding: '8px 14px', font: '500 13px/1 var(--font-sans)' }}>{l}</span>
          ))}
        </div>

        {/* Trip grid */}
        <SectionLabel overline="HAND-PICKED · 9 SAILINGS" title="Sailings worth booking this season"/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          {trips.map((t) => <TripTile key={t.t} {...t}/>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
          <button className="btn btn-tonal">See all 36 sailings →</button>
        </div>

        <ClosingCTA
          image="cruiseShip"
          title="Tell me how many people, when, and roughly your budget."
          body="I'll come back with three sailings, on three lines, with honest notes on what each ship is actually good at."
        />
      </div>
    </ScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.10 — Honeymoons
// ──────────────────────────────────────────────────────────────────────

function C2010_Honeymoons() {
  const styles = [
    { t: 'Adults-only resorts', d: 'Sandals, Couples, Excellence — all-inclusive, no kids, real spas.', img: 'overwater', tag: 'ALL-INCLUSIVE' },
    { t: 'Overwater bungalows', d: 'A door to the ocean from your bed. Tahiti, Maldives, El Dorado Maroma.', img: 'overwater', tag: 'OVERWATER' },
    { t: 'Multi-stop', d: 'Two islands. Or a city + a beach. We sequence the rhythm — busy first, rest second.', img: 'sunset', tag: 'MULTI-STOP' },
  ];
  const trips = [
    { t: 'Sandals Grande St. Lucian', s: 'St. Lucia · Overwater bungalows · 7 nights', tag: 'OVERWATER · ADULTS', img: 'stlucia', range: '$$$', badge: "Gyasi's pick" },
    { t: 'Couples Sans Souci', s: 'Ocho Rios, Jamaica · Cliffside · 7 nights', tag: 'BOUTIQUE · ADULTS', img: 'jamaica', range: '$$' },
    { t: 'Excellence Playa Mujeres', s: 'Cancún · Adults-only · Beachfront swim-up', tag: 'ALL-INCLUSIVE', img: 'aruba', range: '$$' },
    { t: 'Le Blanc Spa Resort', s: 'Cancún · Five-star · Couples-focused', tag: 'LUXURY · ADULTS', img: 'overwater', range: '$$$' },
    { t: 'Hamanasi Resort', s: 'Belize · Adventure + beach hybrid', tag: 'ADVENTURE', img: 'snorkel', range: '$$', badge: 'Off-the-beaten' },
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Private island day · 7 nights', tag: 'ALL-INCLUSIVE · ADULTS', img: 'bahamas', range: '$$$' },
  ];

  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="overwater"
        overline="HONEYMOONS"
        title="The first rest,"
        script="after the I-do's."
        sub="A week that begins your marriage — quiet, unhurried, and built around the two of you. We handle the moving parts so you can be present."
        tall
      />
      <StickyInquireBar destination="Anywhere romantic" dates="After your wedding date" travelers="2 adults" vibe="Quiet · Beach · Spa"/>

      <div style={{ padding: '32px 48px 56px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Intro letter */}
        <div className="card" style={{ padding: '24px 28px', background: 'var(--md-surface-2)', marginBottom: 36, display: 'grid', gridTemplateColumns: '56px 1fr', gap: 18, alignItems: 'start' }}>
          <img src={staImg('avatarA', 120, 120)} alt="" style={{ width: 56, height: 56, borderRadius: 999 }}/>
          <div>
            <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>A NOTE FROM GYASI</div>
            <p className="t-body-l" style={{ margin: '6px 0 0', color: 'var(--md-on-surface)', textWrap: 'pretty' }}>
              Honeymoons are the most personal trip I plan. Some couples want the resort with no decisions to make. Some want two islands and a snorkel boat between them. I ask the same question first either way: <i>what kind of rest does your marriage need to begin with?</i> Then we plan from there.
            </p>
          </div>
        </div>

        {/* Three styles */}
        <SectionLabel overline="THREE WAYS TO HONEYMOON" title="Pick the rhythm. We pick the rest."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 36 }}>
          {styles.map((s) => (
            <div key={s.t} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: 160 }}>
                <img src={staImg(s.img, 600, 320)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.92)', color: 'var(--brand-burgundy)', padding: '3px 9px', borderRadius: 6, font: '700 9.5px/1 var(--font-sans)', letterSpacing: 0.5 }}>{s.tag}</span>
              </div>
              <div style={{ padding: 16 }}>
                <div className="t-title-l">{s.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Featured packages */}
        <SectionLabel overline="FEATURED · 6 PACKAGES" title="Honeymoons booked this year"/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 36 }}>
          {trips.map((t) => <TripTile key={t.t} {...t}/>)}
        </div>

        {/* Christian couples sub-card — explicit framing for the audience that wants it */}
        <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', marginBottom: 36, background: 'linear-gradient(135deg, var(--md-primary-container) 0%, var(--md-secondary-container) 100%)', padding: '28px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28, alignItems: 'center' }}>
            <div>
              <span className="t-label-s" style={{ color: 'var(--brand-burgundy)' }}>FOR CHRISTIAN COUPLES</span>
              <h3 className="t-headline" style={{ margin: '4px 0 8px', color: 'var(--md-on-primary-container)' }}>A honeymoon that honors what you just promised.</h3>
              <p className="t-body" style={{ color: 'var(--md-on-primary-container)', opacity: 0.85, margin: 0, maxWidth: 540 }}>
                If you're building a Christ-centered marriage, your first week away matters. We'll steer you toward resorts that fit — quieter properties, family-owned boutiques, an Adventist-friendly Sabbath rhythm if that matters to you. Just tell me on the inquiry form. No upcharge, no judgment, no awkward conversation.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-filled">Request a quote</button>
                <button className="btn btn-text">See the curated list →</button>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', aspectRatio: '5/4' }}>
              <img src={staImg('candlelit', 600, 480)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
          </div>
        </div>

        <ClosingCTA
          image="honeymoon"
          title="When's the wedding? I'll start there."
          body="Tell me the date, your two priorities (rest? adventure? privacy?), and a budget range. I'll send three honest options within 48 hours."
        />
      </div>
    </ScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.11 — About Gyasi
// ──────────────────────────────────────────────────────────────────────

function C2011_AboutGyasi() {
  const stats = [
    { n: '240+', l: 'Travelers served', i: 'users' },
    { n: '4.9 ★', l: '138 reviews', i: 'star' },
    { n: '< 2h', l: 'Avg reply time', i: 'message' },
    { n: '5 yrs', l: 'Caribbean specialist', i: 'palm' },
  ];
  const creds = [
    { t: 'Hosted by Inteletravel', s: 'IATA-accredited host agency · Full supplier access' },
    { t: 'CLIA Member', s: 'Cruise Lines International Association · Sailings booked yearly' },
    { t: 'Sandals Certified Specialist', s: 'Trained on all properties in Jamaica, Bahamas, St. Lucia, Turks' },
    { t: 'Royal Caribbean Master', s: 'Master-level certification · Symphony, Wonder, Icon class' },
  ];
  const testimonials = [
    { q: 'Gyasi planned our first family cruise. Three kids, two grandparents, one mom who needed a break. She didn\'t miss a detail — even called when our connection got cancelled in Miami.', who: 'The Westbrook Family', trip: 'Symphony · Dec 2024', a: 'avatarC' },
    { q: 'She steered us to a quieter resort than what we picked online — saved us thousands too. Best honeymoon week we could\'ve asked for.', who: 'Reggie & Marc', trip: 'Sandals St. Lucia · May 2024', a: 'avatarD' },
    { q: 'I message her at 9pm with random questions and she replies. That\'s the whole pitch right there — she actually cares.', who: 'Aisha Patel', trip: 'Atlantis · Mar 2024', a: 'avatarE' },
    { q: 'We did a multi-gen group trip — 12 people, two cabins, three flights from three cities. She made it feel small.', who: 'The Khan Family', trip: 'Beaches T&C · Aug 2024', a: 'avatarF' },
    { q: 'No high-pressure sales, no upselling. Just real options, real prices, and a person who picks up the phone.', who: 'Tasha Whitfield', trip: 'Aruba · Oct 2023', a: 'avatarB' },
    { q: 'I was nervous about authorizing a card online. She walked me through every step, sent me the audit log, never made me feel silly.', who: 'Linda Gomez', trip: 'Riviera Maya · Jan 2024', a: 'avatarA' },
  ];
  const faq = [
    { q: 'Do you charge a planning fee?', a: 'No — and I can\'t. As an Inteletravel-hosted advisor I\'m contractually prohibited from charging clients planning, consultation, or service fees. I earn commission from suppliers when you travel.' },
    { q: 'What if I just want to message you, no commitment?', a: 'Please do. Most relationships start with a casual question. Use the form at the top of any page, or text the number on my contact card.' },
    { q: 'Why the Caribbean specifically?', a: 'I lived in the islands. I know which Sandals has the best Red Lane spa (Grande St. Lucian). I know which Royal Caribbean ship to put a multi-gen family on (Wonder, hands down). When you know one region well, you serve people better.' },
    { q: 'Do you book non-Caribbean trips?', a: 'Yes — Mexico, Europe, cruises anywhere, group trips, all-inclusives worldwide. The Caribbean is my deepest specialty, not my only one.' },
    { q: 'How does payment work?', a: 'You add a card through a Stripe-secured form. I use it only to pay suppliers on your behalf, up to a cap you authorize, with audit logs and notifications. I never charge you a service fee.' },
  ];

  return (
    <ScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      {/* Hero — portrait + name */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg, #5C0F13 0%, #7A1A1F 60%, #E87722 130%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 0, alignItems: 'stretch', minHeight: 420 }}>
          <div style={{ padding: '52px 56px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="t-label-s" style={{ color: '#FFC83F', marginBottom: 10 }}>YOUR ADVISOR</span>
            <h1 className="t-display" style={{ margin: 0, color: '#FFF', lineHeight: 1.04 }}>Hi, I'm <span className="t-script" style={{ color: '#FFC83F', fontSize: 72 }}>Gyasi.</span></h1>
            <p className="t-body-l" style={{ marginTop: 14, color: 'rgba(255,255,255,0.92)', maxWidth: 540 }}>
              Caribbean specialist, mom of three, Sandals-certified, hosted by Inteletravel. I plan the kind of week that turns into a story your family tells for years — and I don't disappear after the deposit clears.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn btn-orange btn-lg">Request a quote</button>
              <button className="btn btn-lg" style={{ background: 'rgba(255,255,255,0.18)', color: '#FFF', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.3)' }}>
                <Icon name="message" size={14}/> Message me first
              </button>
            </div>
          </div>
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <img src={staImg('avatarA', 800, 1000)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}/>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 48px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
          {stats.map((s) => (
            <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.i} size={20}/>
              </span>
              <div>
                <div className="t-display-s" style={{ margin: 0, fontSize: 28 }}>{s.n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '40px 48px 56px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Bio + credentials */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, marginBottom: 44 }}>
          <div>
            <SectionLabel overline="THE STORY" title="How Story-Tail started."/>
            <div className="t-body-l" style={{ color: 'var(--md-on-surface)', textWrap: 'pretty', maxWidth: 640 }}>
              <p style={{ margin: '0 0 14px' }}>I started planning trips for friends in 2019 because they kept asking. I'd done enough Caribbean weeks of my own to know which resorts were worth it and which were paying for good Google ads. By 2021 the side-thing had a name — <i>Story-Tail Adventures</i> — and a backlog.</p>
              <p style={{ margin: '0 0 14px' }}>I'm hosted by Inteletravel, which means you get my care plus an IATA-accredited host agency behind every booking. I earn commission from suppliers — never a fee from you.</p>
              <p style={{ margin: 0 }}>My belief about all this is simple: vacation isn't an escape from your life, it's a gift. The world is good. Rest is good. My job is to remove enough friction that you can actually receive both.</p>
              <p className="t-script" style={{ margin: '18px 0 0', color: 'var(--brand-burgundy)', fontSize: 30 }}>— Gyasi</p>
            </div>
          </div>
          <div>
            <SectionLabel overline="CREDENTIALS" title="Trained, certified, audited."/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {creds.map((c) => (
                <div key={c.t} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="shield" size={16}/>
                  </span>
                  <div>
                    <div className="t-title-s">{c.t}</div>
                    <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Testimonials */}
        <SectionLabel overline="WHAT TRAVELERS SAY" title="Six unedited notes."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 44 }}>
          {testimonials.map((t, i) => (
            <div key={i} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
              <span style={{ font: '700 32px/0.7 var(--font-script)', color: 'var(--brand-orange)', letterSpacing: -2 }}>"</span>
              <p className="t-body" style={{ color: 'var(--md-on-surface)', margin: '4px 0 0', textWrap: 'pretty', flex: 1 }}>{t.q}</p>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: '1px solid var(--md-outline-variant)' }}>
                <img src={staImg(t.a, 80, 80)} alt="" style={{ width: 32, height: 32, borderRadius: 999 }}/>
                <div>
                  <div style={{ font: '600 12.5px/1.2 var(--font-sans)' }}>{t.who}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{t.trip}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <SectionLabel overline="QUESTIONS PEOPLE ASK" title="FAQ"/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 44 }}>
          {faq.map((f, i) => (
            <details key={i} className="card" style={{ padding: 0 }} open={i === 0}>
              <summary style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                {f.q} <Icon name="chevron_down" size={16}/>
              </summary>
              <div style={{ padding: '0 18px 16px', color: 'var(--md-on-surface-variant)', font: '400 14px/1.6 var(--font-sans)' }}>{f.a}</div>
            </details>
          ))}
        </div>

        <ClosingCTA
          image="sunset"
          title="Let's start with a conversation."
          body="No account, no commitment — just tell me what you're dreaming about and I'll come back with three real options."
          primary="Request a quote"
          secondary="Message Gyasi"
        />
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { C208_Caribbean, C209_Cruises, C2010_Honeymoons, C2011_AboutGyasi });
