/* global React, Icon, StoryTailMark, Swatch */
// Brand foundations artboard — palette, typography, M3 token tiers, components.

function BrandArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--md-surface)',
      padding: '40px 48px',
      color: 'var(--md-on-surface)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginBottom: 6 }}>00 · DESIGN SYSTEM</div>
          <h1 className="t-display-s" style={{ margin: 0 }}>Two modes, one Story-Tail.</h1>
          <p className="t-body-l" style={{ margin: '6px 0 0', color: 'var(--md-on-surface-variant)', maxWidth: 640 }}>
            <b>Light</b> rides the warm burgundy + orange book-and-fox identity. <b>Dark</b> shifts to the tropical island logo — ocean blue + sunset gold on deep navy. The two logos are not interchangeable; they map directly to the two modes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
          {/* Light wordmark */}
          <div style={{ padding: '14px 18px', borderRadius: 16, background: '#FBF8F3', border: '1px solid #D7C2BD', display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width={48} height={48} viewBox="0 0 64 64" fill="none">
              <path d="M10 44c4 12 18 14 28 10 6-3 9-9 8-15-2 4-7 6-12 5-6-2-8-7-7-12-4 4-12 4-17 12Z" fill="#E87722"/>
              <path d="M22 6h22c2 0 4 2 4 4v40c0 2-2 4-4 4H26c-4 0-6-2-6-6V8c0-1 1-2 2-2Z" fill="#7A1A1F" stroke="#5C0F13" strokeWidth="1.4"/>
              <circle cx="34" cy="28" r="8" stroke="#F1E7D5" strokeWidth="1.6" fill="none"/>
              <path d="M40 19l3-3M40 19l-1 3M40 19l3 0" stroke="#F1E7D5" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 4 }}>
              <span className="t-script" style={{ color: '#7A1A1F', fontSize: 28 }}>Story-Tail</span>
              <span style={{ font: '700 9.5px/1 var(--font-sans)', letterSpacing: '2.2px', color: '#E87722' }}>ADVENTURES</span>
            </span>
          </div>
          {/* Dark wordmark */}
          <div style={{ padding: '14px 18px', borderRadius: 16, background: '#050D1A', border: '1px solid #25405E', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 48, height: 48, display: 'inline-block' }}>
              <img src="brand/logo-tropical-dark.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 4 }}>
              <span style={{ font: '700 28px/1 var(--font-script)', background: 'linear-gradient(180deg, #FFE08A 0%, #FF9436 60%, #F26B1A 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Story-Tail</span>
              <span style={{ font: '700 9.5px/1 var(--font-sans)', letterSpacing: '2.2px', background: 'linear-gradient(180deg, #7CC5FF 0%, #1E92E5 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ADVENTURES</span>
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 24 }}>

        {/* Palette */}
        <section>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>LIGHT MODE · BURGUNDY + ORANGE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 10 }}>
            <Swatch color="#7A1A1F" name="Burgundy" hex="#7A1A1F" fg="#FFF" size="lg"/>
            <Swatch color="#E87722" name="Story Orange" hex="#E87722" fg="#FFF" size="lg"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 18 }}>
            <Swatch color="#5C0F13" name="Deep" hex="#5C0F13" fg="#FFF"/>
            <Swatch color="#A53A3F" name="Wine" hex="#A53A3F" fg="#FFF"/>
            <Swatch color="#FFDAD5" name="Tint" hex="#FFDAD5" fg="#410005"/>
            <Swatch color="#FFDCC1" name="Peach" hex="#FFDCC1" fg="#321200"/>
          </div>

          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>DARK MODE · OCEAN + SUNSET</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Swatch color="#1E92E5" name="Ocean" hex="#1E92E5" fg="#FFF" size="lg"/>
            <Swatch color="#FFC83F" name="Sunset" hex="#FFC83F" fg="#4A2C00" size="lg"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <Swatch color="#0D2137" name="Deep Navy" hex="#0D2137" fg="#FFF"/>
            <Swatch color="#5BB6FF" name="Ocean·Lift" hex="#5BB6FF" fg="#00264D"/>
            <Swatch color="#6CD279" name="Palm" hex="#6CD279" fg="#003915"/>
            <Swatch color="#F58F33" name="Sun·Glow" hex="#F58F33" fg="#3A1700"/>
          </div>
        </section>

        {/* Type */}
        <section>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>TYPOGRAPHY · POPPINS + CAVEAT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', background: 'var(--md-surface-2)', borderRadius: 16 }}>
            <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 44 }}>Story-Tail</div>
            <div className="t-display-s" style={{ margin: 0 }}>Adventures begin</div>
            <div className="t-title-l">Subhead — Section</div>
            <div className="t-body-l" style={{ color: 'var(--md-on-surface-variant)' }}>Body large for trip descriptions and itinerary day notes.</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Body small for metadata, captions, agent notes.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>OVERLINE · SECTION</span>
              <span className="kbd">label · 12px</span>
            </div>
          </div>

          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', margin: '20px 0 10px' }}>STATUS LANGUAGE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className="chip-status lead">Lead</span>
            <span className="chip-status inquiry">Inquiry</span>
            <span className="chip-status proposal">Proposal Ready</span>
            <span className="chip-status booked">Booked</span>
            <span className="chip-status due">Payment Due</span>
            <span className="chip-status traveling">Traveling Now</span>
            <span className="chip-status past">Past Trip</span>
          </div>
        </section>

        {/* Components */}
        <section>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>CONTROLS · M3</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-filled">Authorize card</button>
            <button className="btn btn-tonal">Save trip</button>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-text">Learn more</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <button className="btn btn-orange btn-sm"><Icon name="plus" size={14}/> New trip</button>
            <button className="btn btn-tertiary btn-sm">Filter</button>
            <button className="fab"><Icon name="plus" size={18}/> New</button>
          </div>

          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>SURFACES · ELEVATION TIERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 14 }}>
            {[1,2,3,4,5].map((n) => (
              <div key={n} style={{
                height: 56, borderRadius: 12,
                background: `var(--md-surface-${n})`,
                border: '1px solid var(--md-outline-variant)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: '600 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)',
              }}>L{n}</div>
            ))}
          </div>

          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>RADIUS &amp; SHAPE</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {[{r:6,n:'xs'},{r:10,n:'sm'},{r:14,n:'md'},{r:20,n:'lg'},{r:28,n:'xl'}].map((s) => (
              <div key={s.n} style={{ textAlign: 'center', font: '500 11px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
                <div style={{ width: 44, height: 44, borderRadius: s.r, background: 'var(--brand-burgundy)', marginBottom: 4 }}/>
                {s.n}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ marginTop: 28, padding: 18, borderRadius: 20, background: 'var(--md-surface-2)', display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="info" size={18} color="var(--md-secondary)"/>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', maxWidth: 760 }}>
            <b style={{ color: 'var(--md-on-surface)' }}>Brand rule:</b>{' '}
            The book-and-fox mark only appears in light mode; the tropical island mark only appears on dark surfaces. Wordmark gradient swaps to match (orange→sunset script + blue ADVENTURES on dark). Status &amp; chip language stays consistent in both modes.
          </div>
        </div>
      </div>
    </div>
  );
}

window.BrandArtboard = BrandArtboard;
