/* global React, Icon, StoryTailMark, staImg */
// Tight, reusable building blocks for the screen catalog.
// Each inventory screen is wrapped in a <ScreenFrame> that gives a
// consistent visual envelope across the catalog. The catalog is browsed
// at small zooms, so frames stay legible at scale.

// A web screen surrounded by the standard chrome (top bar + nav rail).
// `chrome` controls how much of the shell is drawn:
//   'full'   — top bar + nav rail (default)
//   'topbar' — top bar only (public marketing)
//   'plain'  — nothing (modals, splashes)
//   'split'  — auth-style 2-column with brand panel left, content right
function ScreenFrame({ children, chrome = 'full', tab = 'home', role = 'client', search = true, scrollable = false, padding = 24 }) {
  if (chrome === 'plain') {
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--md-bg)', overflow: 'hidden' }}>{children}</div>;
  }
  if (chrome === 'split') {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--md-surface)', display: 'flex' }}>
        <ScreenSplitBrand/>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>
          <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--md-bg)', overflow: 'hidden' }}>
      <ScreenTopBar role={role} search={search}/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {chrome === 'full' && <ScreenNavRail role={role} active={tab}/>}
        <main style={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', padding }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Slimmer top bar used by every cataloged screen.
function ScreenTopBar({ role = 'client', search = true }) {
  const navLinks = role === 'public'
    ? ['Explore', 'Caribbean', 'Cruises', 'Honeymoons', 'About Gyasi']
    : null;
  return (
    <header style={{
      height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14,
      background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)', flexShrink: 0,
    }}>
      <div className="brand-mark">
        <StoryTailMark size={26}/>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
          <span className="mark-script" style={{ fontSize: 18 }}>Story-Tail</span>
          <span className="mark-tagline" style={{ font: '700 8.5px/1 var(--font-sans)', letterSpacing: '1.5px' }}>ADVENTURES</span>
        </span>
      </div>
      {navLinks && (
        <nav style={{ display: 'flex', gap: 18, font: '500 12.5px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginLeft: 8 }}>
          {navLinks.map((l, i) => <a key={l} href="#" style={{ color: i === 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)', fontWeight: i === 0 ? 600 : 500 }}>{l}</a>)}
        </nav>
      )}
      {search && (
        <div style={{ flex: 1, maxWidth: 360, height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
                      borderRadius: 999, background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)',
                      font: '400 12.5px/1 var(--font-sans)' }}>
          <Icon name="search" size={14}/>
          <span>{role === 'agent' ? 'Search clients, trips…' : role === 'public' ? 'Where to next?' : 'Search trips, destinations…'}</span>
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn-icon" style={{ width: 34, height: 34 }}><Icon name="bell" size={16}/></button>
        <div className="avatar sm" style={{ width: 28, height: 28, fontSize: 10, background: 'var(--brand-burgundy)', color: '#FFF' }}>
          {role === 'agent' ? 'GS' : 'JH'}
        </div>
      </div>
    </header>
  );
}

function ScreenNavRail({ role = 'client', active = 'home' }) {
  const itemsClient = [
    { id: 'home', icon: 'home', label: 'Trips' },
    { id: 'search', icon: 'search', label: 'Discover' },
    { id: 'msg', icon: 'message', label: 'Messages' },
    { id: 'wallet', icon: 'card', label: 'Wallet' },
    { id: 'docs', icon: 'passport', label: 'Documents' },
    { id: 'me', icon: 'user', label: 'Account' },
  ];
  const itemsAgent = [
    { id: 'home', icon: 'pulse', label: 'Worklist' },
    { id: 'clients', icon: 'users', label: 'Clients' },
    { id: 'trips', icon: 'briefcase', label: 'Trips' },
    { id: 'leads', icon: 'inbox', label: 'Leads' },
    { id: 'msg', icon: 'message', label: 'Messages' },
    { id: 'comm', icon: 'dollar', label: 'Commission' },
    { id: 'reports', icon: 'chart', label: 'Reports' },
  ];
  const items = role === 'agent' ? itemsAgent : itemsClient;
  return (
    <nav style={{
      width: 72, padding: '14px 0', background: 'var(--md-surface)',
      borderRight: '1px solid var(--md-outline-variant)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0,
    }}>
      {items.map((it) => {
        const a = it.id === active;
        return (
          <div key={it.id} style={{ width: 60, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{
              width: 46, height: 26, borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: a ? 'var(--md-secondary-container)' : 'transparent',
              color: a ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={it.icon} size={18}/>
            </span>
            <span style={{ font: '600 9.5px/1.2 var(--font-sans)', color: a ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)', textAlign: 'center' }}>{it.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

// Used inside split-pane auth screens — the brand-forward left panel.
function ScreenSplitBrand({ title = 'Your next chapter is\nalready in the works.', sub = 'Branded portal — every detail, one place.' }) {
  return (
    <div className="tropical-gradient" style={{
      flex: '0 0 42%', padding: '32px 36px', color: '#FFF',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <div className="brand-mark" style={{ color: '#FFF' }}>
        <StoryTailMark size={36}/>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
          <span className="mark-script" style={{ color: '#FFF', fontSize: 26 }}>Story-Tail</span>
          <span style={{ font: '700 9px/1 var(--font-sans)', letterSpacing: '2px', color: '#FFC83F' }}>ADVENTURES</span>
        </span>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div className="t-label-s" style={{ color: '#FFC83F', marginBottom: 10 }}>STORY-TAIL · MEMBER PORTAL</div>
        <h1 className="t-display-s" style={{ margin: 0, color: '#FFF', whiteSpace: 'pre-line', lineHeight: 1.1 }}>{title}</h1>
        <p className="t-body" style={{ marginTop: 8, color: 'rgba(255,255,255,0.85)' }}>{sub}</p>
      </div>
      <div style={{ position: 'absolute', top: 28, right: 28, width: 96, height: 96, borderRadius: 999,
                    border: '1.5px dashed rgba(255,255,255,0.45)', color: 'rgba(255,255,255,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: 'rotate(-10deg)' }}>
        <Icon name="passport" size={36}/>
      </div>
    </div>
  );
}

// A bottom-anchored title strip used inside many screens for context.
function ScreenHeader({ overline, title, subtitle, actions, small = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        {overline && <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginBottom: 4 }}>{overline}</div>}
        <h1 style={{ margin: 0, font: `700 ${small ? 22 : 28}px/1.15 var(--font-sans)`, letterSpacing: '-0.3px', color: 'var(--md-on-surface)' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', font: '400 14px/1.45 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

Object.assign(window, { ScreenFrame, ScreenTopBar, ScreenNavRail, ScreenSplitBrand, ScreenHeader });
