/* global React, Icon, StoryTailMark */
// Shared building-block components for Story-Tail Adventures designs.
// All artboards consume these so visual vocabulary stays consistent.

// ─── App shell (web): top app bar + nav rail ────────────────────────────
function StaTopBar({ scheme = 'light', userInitials = 'GS', userName = 'Gyasi Story', userRole = 'Advisor', search = true, role = 'agent' }) {
  return (
    <header style={{
      height: 64, display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16,
      background: 'var(--md-surface-1)',
      borderBottom: '1px solid var(--md-outline-variant)',
      flexShrink: 0,
    }}>
      <div className="brand-mark" style={{ marginRight: 8 }}>
        <StoryTailMark size={32}/>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
          <span className="mark-script" style={{ marginBottom: -2 }}>Story-Tail</span>
          <span className="mark-tagline" style={{ font: '700 9.5px/1 var(--font-sans)', letterSpacing: '1.6px' }}>ADVENTURES</span>
        </span>
      </div>
      {search && (
        <div style={{
          flex: 1, maxWidth: 480, height: 40,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 14px', borderRadius: 999,
          background: 'var(--md-surface-3)',
          color: 'var(--md-on-surface-variant)',
          font: '400 13.5px/1 var(--font-sans)',
        }}>
          <Icon name="search" size={18}/>
          <span>{role === 'agent' ? 'Search clients, trips, suppliers…' : 'Search destinations, trips…'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }}>⌘K</span>
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="btn-icon" title="Help"><Icon name="question" size={20}/></button>
        <button className="btn-icon" title="Messages" style={{ position: 'relative' }}>
          <Icon name="message" size={20}/>
          <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 999, background: 'var(--md-error)' }}/>
        </button>
        <button className="btn-icon" title="Notifications" style={{ position: 'relative' }}>
          <Icon name="bell" size={20}/>
          <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, fontSize: 9, fontWeight: 700, borderRadius: 999, background: 'var(--md-error)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>3</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 6 }}>
          <div className="avatar" style={{ background: 'var(--brand-burgundy)', color: '#FFF' }}>{userInitials}</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ font: '600 13px/1.2 var(--font-sans)', color: 'var(--md-on-surface)' }}>{userName}</span>
            <span style={{ font: '500 11px/1.2 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>{userRole}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

// Vertical nav rail (M3 navigation rail)
function StaNavRail({ items, active }) {
  return (
    <nav style={{
      width: 88, padding: '20px 0',
      background: 'var(--md-surface)',
      borderRight: '1px solid var(--md-outline-variant)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, flexShrink: 0,
    }}>
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button key={it.id} style={{
            width: 72, padding: '8px 0', border: 0, background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            cursor: 'pointer', color: 'var(--md-on-surface-variant)',
          }}>
            <span style={{
              width: 56, height: 32, borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? 'var(--md-secondary-container)' : 'transparent',
              color: isActive ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={it.icon} size={22}/>
            </span>
            <span style={{ font: '600 11px/1.2 var(--font-sans)', color: isActive ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Page header inside main content ────────────────────────────────────
function StaPageHeader({ overline, title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
      <div>
        {overline && <div className="t-label-s" style={{ color: 'var(--md-secondary)', marginBottom: 6 }}>{overline}</div>}
        <h1 className="t-headline" style={{ margin: 0, color: 'var(--md-on-surface)' }}>{title}</h1>
        {subtitle && <p className="t-body-l" style={{ margin: '6px 0 0', color: 'var(--md-on-surface-variant)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

// ─── Status chip helpers ─────────────────────────────────────────────────
function StaStatus({ kind, children }) {
  return <span className={`chip-status ${kind}`}>{children}</span>;
}

// ─── KPI tile ────────────────────────────────────────────────────────────
function StaKPI({ label, value, delta, deltaKind = 'up', icon, accent = 'primary' }) {
  const bgVar = {
    primary:   'var(--md-primary-container)',
    secondary: 'var(--md-secondary-container)',
    tertiary:  'var(--md-tertiary-container)',
    surface:   'var(--md-surface-2)',
  }[accent];
  const fgVar = {
    primary:   'var(--md-on-primary-container)',
    secondary: 'var(--md-on-secondary-container)',
    tertiary:  'var(--md-on-tertiary-container)',
    surface:   'var(--md-on-surface)',
  }[accent];
  return (
    <div style={{
      background: bgVar, color: fgVar,
      borderRadius: 20, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
      minHeight: 124,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="t-label" style={{ opacity: 0.85 }}>{label}</span>
        {icon && <span style={{ opacity: 0.85 }}><Icon name={icon} size={20}/></span>}
      </div>
      <div className="t-display-s" style={{ marginTop: 'auto' }}>{value}</div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 12px/1 var(--font-sans)' }}>
          <Icon name={deltaKind === 'up' ? 'trend_up' : 'chart'} size={14}/>
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}

// ─── Trip card (image-led) ───────────────────────────────────────────────
function StaTripCard({ image, title, dates, status, travelers, location, countdown, daysLeft, compact = false }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: compact ? 140 : 180, position: 'relative', overflow: 'hidden' }}>
        <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy"/>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55))',
        }}/>
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          {status && <StaStatus kind={status.kind}>{status.label}</StaStatus>}
        </div>
        {countdown && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(255,255,255,0.92)', color: 'var(--brand-burgundy)',
            borderRadius: 12, padding: '6px 10px',
            font: '700 12px/1 var(--font-sans)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="clock" size={12} stroke={2.2}/>
            {daysLeft}d to go
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, color: '#FFF' }}>
          <div style={{ font: '700 17px/1.2 var(--font-sans)' }}>{title}</div>
          {location && <div style={{ font: '500 12px/1.3 var(--font-sans)', opacity: 0.9, marginTop: 2 }}>{location}</div>}
        </div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: '500 12px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="calendar" size={13}/> {dates}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="user" size={13}/> {travelers}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── List row ────────────────────────────────────────────────────────────
function StaRow({ leading, title, subtitle, trailing, meta, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 12,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {leading && <div>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--md-on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle && <div style={{ font: '400 12.5px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {meta && <div style={{ font: '500 12px/1.3 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>{meta}</div>}
      {trailing && <div>{trailing}</div>}
    </div>
  );
}

// ─── Mobile bottom tab bar ───────────────────────────────────────────────
function StaMobileTabs({ active }) {
  const items = [
    { id: 'home', label: 'Trips', icon: 'home' },
    { id: 'search', label: 'Discover', icon: 'search' },
    { id: 'msg', label: 'Messages', icon: 'message' },
    { id: 'me', label: 'Account', icon: 'user' },
  ];
  return (
    <div style={{
      height: 70, padding: '8px 8px 18px',
      background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
      display: 'flex',
    }}>
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <div key={it.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0' }}>
            <span style={{
              width: 56, height: 28, borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? 'var(--md-secondary-container)' : 'transparent',
              color: isActive ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={it.icon} size={20}/>
            </span>
            <span style={{ font: '600 10px/1 var(--font-sans)', color: isActive ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Small swatch (used in legends + brand card)
function Swatch({ color, name, hex, fg = '#FFF', size = 'md' }) {
  const h = size === 'lg' ? 96 : 64;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: h, borderRadius: 14, background: color, color: fg,
        padding: '10px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        font: '600 11px/1 var(--font-sans)' }}>
        <span>{name}</span>
        <span style={{ opacity: 0.85, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{hex}</span>
      </div>
    </div>
  );
}

// Surface frame: wraps an artboard's children with the chosen color scheme.
function StaScheme({ scheme = 'light', children, style = {} }) {
  return (
    <div className={scheme === 'dark' ? 'scheme-dark' : ''}
         style={{ width: '100%', height: '100%', background: 'var(--md-bg)', color: 'var(--md-on-surface)', ...style }}>
      {children}
    </div>
  );
}

Object.assign(window, {
  StaTopBar, StaNavRail, StaPageHeader, StaStatus, StaKPI,
  StaTripCard, StaRow, StaMobileTabs, Swatch, StaScheme,
});
