/* global React, MUI, Icon, StoryTailMark */
// Story-Tail Adventures — MUI versions of the legacy app shell and shared parts.
//
// Every component here keeps the SAME prop API as its legacy counterpart in
// shared/components.jsx and shared/screen-frame.jsx, so a screen file converts
// by swapping names:  ScreenFrame → MuiScreenFrame, StaKPI → MuiStaKPI, …
// Copy (strings) is identical to the legacy versions, word for word.
//
// Built from stock MUI parts. The nav rails are static Lists inside a Box
// (not a portal Drawer) because artboards are static boxes. The brand lockup
// reuses the legacy .brand-mark / .mark-script / .mark-tagline classes so the
// dark-scheme gradient treatment keeps working through the `scheme-dark`
// class that StaMuiScheme preserves.
//
// Classic script, no import/export, wrapped in an IIFE. Must load AFTER
// shared/icons.jsx and shared/mui-theme.jsx.
(() => {
  const {
    Box, Stack, Typography, AppBar, Toolbar, IconButton, Avatar, Badge,
    Chip, Card, CardContent, CardMedia, List, ListItemButton, ListItemText,
    TextField, InputAdornment, Link,
  } = window.MUI;

  // ─── Icon helper ────────────────────────────────────────────────────────
  // Wraps the existing stroke Icon so it sits centred in MUI slots
  // (IconButton, InputAdornment, ListItemIcon, Button startIcon…).
  function MuiIcon({ name, size = 20, sx, ...rest }) {
    return (
      <Box component="span" sx={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0, ...sx }}>
        <Icon name={name} size={size} {...rest} />
      </Box>
    );
  }

  // ─── Brand lockup (internal) ────────────────────────────────────────────
  // Same markup the legacy bars draw: glyph + "Story-Tail" script + ADVENTURES.
  function BrandLockup({ mark = 26, script = 18, tagline = 8.5, letterSpacing = '1.5px', color }) {
    return (
      <Box className="brand-mark" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, color }}>
        <StoryTailMark size={mark} />
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: '2px' }}>
          <Box component="span" className="mark-script" sx={{ fontSize: script, color }}>Story-Tail</Box>
          <Box component="span" className="mark-tagline"
               sx={{ fontWeight: 700, fontSize: tagline, lineHeight: 1, letterSpacing }}>ADVENTURES</Box>
        </Box>
      </Box>
    );
  }

  // Search pill shared by both top bars. Read-only: artboards are static.
  function SearchField({ placeholder, maxWidth, size = 'small', hint }) {
    return (
      <TextField
        size={size}
        placeholder={placeholder}
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start"><MuiIcon name="search" size={size === 'small' ? 16 : 18} /></InputAdornment>
            ),
            endAdornment: hint ? (
              <InputAdornment position="end">
                <Typography variant="caption" color="text.secondary">{hint}</Typography>
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{ flex: 1, maxWidth, '& .MuiInputBase-root': { bgcolor: 'surface.3' } }}
      />
    );
  }

  // Theme toggle: both halves rendered, CSS shows the one for the scheme you
  // are switching TO (moon while light, sun while dark). Same idiom as app.css.
  function ThemeToggle({ size = 'small', icon = 16 }) {
    return (
      <>
        <IconButton size={size} className="sta-light-only" title="Switch to dark mode"><MuiIcon name="moon" size={icon} /></IconButton>
        <IconButton size={size} className="sta-dark-only" title="Switch to light mode"><MuiIcon name="sun" size={icon} /></IconButton>
      </>
    );
  }

  // ─── Rail item (internal) ───────────────────────────────────────────────
  function RailItem({ icon, label, selected, width, iconSize, labelSize }) {
    return (
      <ListItemButton
        selected={selected}
        sx={{ width, flexDirection: 'column', alignItems: 'center', gap: 0.25, py: 0.75, px: 0.5, borderRadius: 1, flexGrow: 0 }}
      >
        <Box sx={{ color: selected ? 'primary.main' : 'text.secondary', display: 'inline-flex' }}>
          <Icon name={icon} size={iconSize} />
        </Box>
        <Typography variant="caption" noWrap
          sx={{ fontSize: labelSize, fontWeight: 600, lineHeight: 1.2, color: selected ? 'text.primary' : 'text.secondary' }}>
          {label}
        </Typography>
      </ListItemButton>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // screen-frame.jsx equivalents
  // ═══════════════════════════════════════════════════════════════════════

  // A web screen surrounded by the standard chrome (top bar + nav rail).
  // `chrome`: 'full' | 'topbar' | 'plain' | 'split' — same as ScreenFrame.
  function MuiScreenFrame({ children, chrome = 'full', tab = 'home', role = 'client', search = true, scrollable = false, padding = 24 }) {
    if (chrome === 'plain') {
      return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>{children}</Box>;
    }
    if (chrome === 'split') {
      return (
        <Box sx={{ width: '100%', height: '100%', bgcolor: 'surface.main', display: 'flex' }}>
          <MuiScreenSplitBrand />
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, overflow: 'hidden' }}>
            <Stack spacing={1.75} sx={{ width: '100%', maxWidth: 440 }}>
              {children}
            </Stack>
          </Box>
        </Box>
      );
    }
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
        <MuiScreenTopBar role={role} search={search} />
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {chrome === 'full' && <MuiScreenNavRail role={role} active={tab} />}
          <Box component="main" sx={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', p: `${padding}px` }}>
            {children}
          </Box>
        </Box>
      </Box>
    );
  }

  // Slimmer top bar used by every cataloged screen.
  function MuiScreenTopBar({ role = 'client', search = true }) {
    const navLinks = role === 'public'
      ? ['Explore', 'Caribbean', 'Cruises', 'Honeymoons', 'About Gyasi']
      : null;
    const placeholder = role === 'agent' ? 'Search clients, trips…' : role === 'public' ? 'Where to next?' : 'Search trips, destinations…';
    return (
      <AppBar position="static" color="inherit" elevation={0}
              sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Toolbar variant="dense" disableGutters sx={{ minHeight: 56, height: 56, px: 2.5, gap: 1.75 }}>
          <BrandLockup mark={26} script={18} tagline={8.5} />
          {navLinks && (
            <Stack direction="row" spacing={2.25} component="nav" sx={{ ml: 1 }}>
              {navLinks.map((l, i) => (
                <Link key={l} href="#" underline="none" variant="body2"
                      sx={{ fontSize: 12.5, fontWeight: i === 0 ? 600 : 500, color: i === 0 ? 'text.primary' : 'text.secondary' }}>
                  {l}
                </Link>
              ))}
            </Stack>
          )}
          {search && <SearchField placeholder={placeholder} maxWidth={360} />}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', ml: 'auto' }}>
            <ThemeToggle />
            <IconButton size="small"><MuiIcon name="bell" size={16} /></IconButton>
            <Avatar sx={{ width: 28, height: 28, fontSize: 10, fontWeight: 600, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
              {role === 'agent' ? 'GS' : 'JH'}
            </Avatar>
          </Stack>
        </Toolbar>
      </AppBar>
    );
  }

  function MuiScreenNavRail({ role = 'client', active = 'home' }) {
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
      <Box component="nav" sx={{ width: 72, flexShrink: 0, bgcolor: 'surface.main', borderRight: 1, borderColor: 'divider' }}>
        <List dense disablePadding sx={{ py: 1.75, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          {items.map((it) => (
            <RailItem key={it.id} icon={it.icon} label={it.label} selected={it.id === active} width={60} iconSize={18} labelSize={9.5} />
          ))}
        </List>
      </Box>
    );
  }

  // Used inside split-pane auth screens — the brand-forward left panel.
  function MuiScreenSplitBrand({ title = 'Your next chapter is\nalready in the works.', sub = 'Branded portal — every detail, one place.' }) {
    return (
      <Box className="tropical-gradient" sx={{
        flex: '0 0 42%', px: 4.5, py: 4, color: '#FFF',
        display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      }}>
        <Box className="brand-mark" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, color: '#FFF' }}>
          <StoryTailMark size={36} />
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: '2px' }}>
            <Box component="span" className="mark-script" sx={{ color: '#FFF', fontSize: 26 }}>Story-Tail</Box>
            <Box component="span" sx={{ fontWeight: 700, fontSize: 9, lineHeight: 1, letterSpacing: '2px', color: '#FFC83F' }}>ADVENTURES</Box>
          </Box>
        </Box>
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="overline" sx={{ display: 'block', color: '#FFC83F', fontWeight: 600, lineHeight: 1.3, mb: 1.25 }}>STORY-TAIL · MEMBER PORTAL</Typography>
          <Typography variant="h4" component="h1" sx={{ color: '#FFF', fontWeight: 700, whiteSpace: 'pre-line', lineHeight: 1.1 }}>{title}</Typography>
          <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.85)' }}>{sub}</Typography>
        </Box>
        <Box sx={{
          position: 'absolute', top: 28, right: 28, width: 96, height: 96, borderRadius: '50%',
          border: '1.5px dashed rgba(255,255,255,0.45)', color: 'rgba(255,255,255,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-10deg)',
        }}>
          <Icon name="passport" size={36} />
        </Box>
      </Box>
    );
  }

  // A bottom-anchored title strip used inside many screens for context.
  function MuiScreenHeader({ overline, title, subtitle, actions, small = false }) {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mb: 1.75 }}>
        <Box sx={{ minWidth: 0 }}>
          {overline && <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}>{overline}</Typography>}
          <Typography variant={small ? 'h5' : 'h4'} component="h1" sx={{ fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>{actions}</Stack>}
      </Stack>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // components.jsx equivalents
  // ═══════════════════════════════════════════════════════════════════════

  // App shell (web): top app bar. `scheme` is accepted for API parity; the
  // MUI theme comes from the enclosing StaMuiScheme.
  function MuiStaTopBar({ scheme = 'light', userInitials = 'GS', userName = 'Gyasi Story', userRole = 'Advisor', search = true, role = 'agent' }) {
    void scheme;
    return (
      <AppBar position="static" color="inherit" elevation={0}
              sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Toolbar disableGutters sx={{ minHeight: 64, height: 64, px: 3, gap: 2 }}>
          <Box sx={{ mr: 1 }}>
            <BrandLockup mark={32} script={22} tagline={9.5} letterSpacing="1.6px" />
          </Box>
          {search && (
            <SearchField
              placeholder={role === 'agent' ? 'Search clients, trips, suppliers…' : 'Search destinations, trips…'}
              maxWidth={480}
              hint="⌘K"
            />
          )}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', ml: 'auto' }}>
            <ThemeToggle size="medium" icon={20} />
            <IconButton title="Help"><MuiIcon name="question" size={20} /></IconButton>
            <IconButton title="Messages">
              <Badge variant="dot" color="error"><MuiIcon name="message" size={20} /></Badge>
            </IconButton>
            <IconButton title="Notifications">
              <Badge badgeContent={3} color="error"><MuiIcon name="bell" size={20} /></Badge>
            </IconButton>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', ml: 0.75 }}>
              <Avatar sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 600, bgcolor: 'primary.main', color: 'primary.contrastText' }}>{userInitials}</Avatar>
              <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <Typography variant="subtitle2" sx={{ fontSize: 13, lineHeight: 1.2 }}>{userName}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, lineHeight: 1.2 }}>{userRole}</Typography>
              </Box>
            </Stack>
          </Stack>
        </Toolbar>
      </AppBar>
    );
  }

  // Vertical nav rail (M3 navigation rail) — items: [{ id, icon, label }]
  function MuiStaNavRail({ items, active }) {
    return (
      <Box component="nav" sx={{ width: 88, flexShrink: 0, bgcolor: 'surface.main', borderRight: 1, borderColor: 'divider' }}>
        <List disablePadding sx={{ py: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          {items.map((it) => (
            <RailItem key={it.id} icon={it.icon} label={it.label} selected={it.id === active} width={72} iconSize={22} labelSize={11} />
          ))}
        </List>
      </Box>
    );
  }

  // Page header inside main content
  function MuiStaPageHeader({ overline, title, subtitle, actions }) {
    return (
      <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          {overline && <Typography variant="overline" sx={{ display: 'block', color: 'secondary.main', fontWeight: 600, lineHeight: 1.3, mb: 0.75 }}>{overline}</Typography>}
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>{actions}</Stack>}
      </Stack>
    );
  }

  // Status chip — colors from theme.palette.status (Design-System §4.3).
  // kind: proposal | booked | due | traveling | past | lead | inquiry | cancelled
  function MuiStaStatus({ kind, children, size = 'small', sx, ...rest }) {
    return (
      <Chip
        size={size}
        label={children}
        sx={{
          bgcolor: `status.${kind}.bg`, color: `status.${kind}.fg`,
          fontWeight: 600, fontSize: 10.5, letterSpacing: '0.3px', textTransform: 'uppercase',
          height: 22, '& .MuiChip-label': { px: 1.125 },
          ...sx,
        }}
        {...rest}
      />
    );
  }

  // KPI tile. accent: primary | secondary | tertiary | surface
  function MuiStaKPI({ label, value, delta, deltaKind = 'up', icon, accent = 'primary' }) {
    const bg = accent === 'surface' ? 'surface.2' : `${accent}.container`;
    const fg = accent === 'surface' ? 'text.primary' : `${accent}.onContainer`;
    return (
      <Card sx={{ bgcolor: bg, color: fg, minHeight: 124, display: 'flex' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 500, letterSpacing: '0.4px', opacity: 0.85 }}>{label}</Typography>
            {icon && <Box sx={{ opacity: 0.85, display: 'inline-flex' }}><Icon name={icon} size={20} /></Box>}
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 'auto', color: 'inherit' }}>{value}</Typography>
          {delta && (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Icon name={deltaKind === 'up' ? 'trend_up' : 'chart'} size={14} />
              <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1 }}>{delta}</Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    );
  }

  // Trip card (image-led). status: { kind, label }
  function MuiStaTripCard({ image, title, dates, status, travelers, location, countdown, daysLeft, compact = false }) {
    return (
      <Card sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'relative', height: compact ? 140 : 180, overflow: 'hidden' }}>
          <CardMedia component="img" image={image} alt="" loading="lazy" sx={{ height: '100%', objectFit: 'cover' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55))' }} />
          <Stack direction="row" spacing={0.75} sx={{ position: 'absolute', top: 12, left: 12 }}>
            {status && <MuiStaStatus kind={status.kind}>{status.label}</MuiStaStatus>}
          </Stack>
          {countdown && (
            <Chip
              size="small"
              icon={<MuiIcon name="clock" size={12} stroke={2.2} />}
              label={`${daysLeft}d to go`}
              sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(255,255,255,0.92)', color: 'brand.dark', fontWeight: 700, fontSize: 12,
                    '& .MuiChip-icon': { color: 'inherit', ml: 1 } }}
            />
          )}
          <Box sx={{ position: 'absolute', bottom: 12, left: 12, right: 12, color: '#FFF' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>{title}</Typography>
            {location && <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, opacity: 0.9, mt: 0.25 }}>{location}</Typography>}
          </Box>
        </Box>
        <CardContent sx={{ py: 1.5, px: 1.75, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Icon name="calendar" size={13} /><Typography variant="caption" sx={{ fontWeight: 500 }}>{dates}</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Icon name="user" size={13} /><Typography variant="caption" sx={{ fontWeight: 500 }}>{travelers}</Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  // List row
  function MuiStaRow({ leading, title, subtitle, trailing, meta, onClick }) {
    return (
      <ListItemButton onClick={onClick} disableRipple={!onClick}
                      sx={{ gap: 1.75, px: 1.75, py: 1.5, borderRadius: 1, cursor: onClick ? 'pointer' : 'default' }}>
        {leading && <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>{leading}</Box>}
        <ListItemText
          primary={title}
          secondary={subtitle}
          slotProps={{
            primary: { noWrap: true, variant: 'subtitle2', sx: { fontSize: 14 } },
            secondary: { variant: 'body2', sx: { fontSize: 12.5, mt: 0.25 } },
          }}
          sx={{ my: 0, minWidth: 0 }}
        />
        {meta && <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, flexShrink: 0 }}>{meta}</Typography>}
        {trailing && <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>{trailing}</Box>}
      </ListItemButton>
    );
  }

  Object.assign(window, {
    MuiIcon,
    MuiScreenFrame, MuiScreenTopBar, MuiScreenNavRail, MuiScreenSplitBrand, MuiScreenHeader,
    MuiStaTopBar, MuiStaNavRail, MuiStaPageHeader, MuiStaStatus, MuiStaKPI, MuiStaTripCard, MuiStaRow,
  });
})();
