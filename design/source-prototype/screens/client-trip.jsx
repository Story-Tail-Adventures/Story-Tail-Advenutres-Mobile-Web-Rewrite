/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Client · 2.2 Dashboard & Trip Experience — 11 screens. MUI v9.

// ─── Small shared bits for this file (names prefixed so nothing collides) ───

// Legacy .t-label (small secondary label above a value).
function C22_MuiLabel({ children, sx }) {
  const { Typography } = MUI;
  return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500, lineHeight: 1.3, ...sx }}>{children}</Typography>;
}

// 36px rounded icon tile. tone: primary | secondary | tertiary | error | surface
function C22_MuiIconTile({ name, size = 16, tone = 'secondary', sx }) {
  const { Box } = MUI;
  const bg = tone === 'surface' ? 'surface.3' : `${tone}.container`;
  const fg = tone === 'surface' ? 'text.secondary' : `${tone}.onContainer`;
  return (
    <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...sx }}>
      <Icon name={name} size={size} />
    </Box>
  );
}

// Label over value (At a glance, Cancellation summary).
function C22_MuiKV({ l, v }) {
  const { Box, Typography } = MUI;
  return (
    <Box>
      <C22_MuiLabel>{l}</C22_MuiLabel>
      <Typography variant="body2" sx={{ mt: 0.25 }}>{v}</Typography>
    </Box>
  );
}

// Legacy .dot
function C22_MuiDot({ color = 'success.main', sx }) {
  const { Box } = MUI;
  return <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, display: 'inline-block', flexShrink: 0, ...sx }} />;
}

// Legacy .kbd
function C22_MuiKbd({ children }) {
  const { Chip } = MUI;
  return <Chip size="small" variant="outlined" label={children} sx={{ fontFamily: (t) => t.typography.mono, fontSize: 11, height: 20, flexShrink: 0 }} />;
}

// Chat bubble (trip thread).
function C22_MuiBubble({ mine, children }) {
  const { Paper } = MUI;
  return (
    <Paper
      elevation={0}
      variant={mine ? 'elevation' : 'outlined'}
      sx={{
        bgcolor: mine ? 'primary.main' : 'background.paper',
        color: mine ? 'primary.contrastText' : 'text.primary',
        px: 1.75, py: 1.25,
        borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        typography: 'body2', lineHeight: 1.45,
      }}
    >
      {children}
    </Paper>
  );
}

// Reply composer: attach icon, text, send button.
function C22_MuiComposer({ placeholder, sendLabel }) {
  const { TextField, InputAdornment, Button } = MUI;
  return (
    <TextField
      size="small"
      fullWidth
      placeholder={placeholder}
      slotProps={{
        input: {
          readOnly: true,
          startAdornment: <InputAdornment position="start"><MuiIcon name="attach" size={16} /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <Button variant="contained" size="small" startIcon={<MuiIcon name="send" size={12} />}>{sendLabel}</Button>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

// 2.2.1 — Client Dashboard / Home
function C221_Dashboard() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, CardMedia, Paper, Avatar, Tabs, Tab } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" scrollable padding={24}>
      <MuiScreenHeader
        overline="WELCOME BACK · YOUR REST IS COMING"
        title="Hey Jordan — 90 days until you can finally breathe out. ✈"
        subtitle="One card to authorize for final balance, one new idea from Gyasi. The hard part is almost done."
        actions={<>
          <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="search" size={14} />}>New idea</Button>
          <Button variant="contained" size="small" startIcon={<MuiIcon name="message" size={14} />}>Message Gyasi</Button>
        </>}
      />

      {/* Hero countdown */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '2.1fr 1fr', gap: 1.75 }}>
        <Card elevation={4} sx={{ position: 'relative', minHeight: 260, color: 'common.white', overflow: 'hidden' }}>
          <CardMedia component="img" image={staImg('overwater', 1400, 500)} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.8), rgba(13,33,55,0.65))' }} />
          <Box sx={{ position: 'relative', p: 2.5, height: 260, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <MuiStaStatus kind="booked">Booked · Honeymoon</MuiStaStatus>
            <Typography variant="h3" component="h2" sx={{ mt: 1.25, mb: 0.5, color: 'common.white' }}>Sandals Royal Bahamian</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · Nassau</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 'auto', alignItems: 'flex-end', alignSelf: 'stretch' }}>
              {[{ v: 90, l: 'DAYS' }, { v: 14, l: 'HR' }, { v: 32, l: 'MIN' }].map((c) => (
                <Paper key={c.l} elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'inherit', px: 1.75, py: 1, minWidth: 64, textAlign: 'center', backdropFilter: 'blur(8px)' }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>{c.v}</Typography>
                  <Typography variant="overline" sx={{ display: 'block', fontSize: 9, lineHeight: 1, opacity: 0.85, mt: 0.375 }}>{c.l}</Typography>
                </Paper>
              ))}
              <Button variant="contained" color="brand" size="small" endIcon={<MuiIcon name="arrow_right" size={12} />} sx={{ ml: 'auto' }}>View itinerary</Button>
            </Stack>
          </Box>
        </Card>
        <Stack spacing={1.25}>
          <Card sx={{ bgcolor: 'error.container', color: 'error.onContainer' }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Icon name="card" size={16} />
                <Typography variant="overline" sx={{ lineHeight: 1.3 }}>ACTION NEEDED · 14 DAYS</Typography>
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.75 }}>Authorize a card for final balance</Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.5 }}>$4,180 due to Sandals on May 28.</Typography>
              <Button variant="contained" color="error" size="small" fullWidth sx={{ mt: 1.25 }}>Authorize a card →</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Avatar src={staImg('avatarA', 48, 48)} alt="" sx={{ width: 28, height: 28 }} />
                <Typography variant="subtitle2">Gyasi · Advisor</Typography>
                <C22_MuiDot sx={{ ml: 'auto' }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>"Locked your bungalow upgrade — peek at day 3."</Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>

      {/* Sections */}
      <Box sx={{ mt: 2.25 }}>
        <Tabs value={0} onChange={() => {}} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {['In planning · 1', 'Past trips · 5', 'Saved searches · 3'].map((t) => <Tab key={t} label={t} />)}
        </Tabs>
        <Grid container spacing={1.5} sx={{ mt: 1.75 }}>
          {[
            { t: 'Family week — Negril', s: 'Dec 22 – 29 · 4 travelers', i: 'jamaica', tag: 'proposal', tagL: 'Proposal ready' },
            { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025', i: 'cruiseShip', tag: 'past', tagL: 'Past' },
            { t: 'Beaches Turks & Caicos', s: 'Jan 6 – 13, 2024', i: 'turks', tag: 'past', tagL: 'Past' },
          ].map((c, i) => (
            <Grid key={i} size={4}>
              <Card>
                <Box sx={{ position: 'relative', height: 120 }}>
                  <CardMedia component="img" image={staImg(c.i, 480, 240)} alt="" sx={{ height: '100%', objectFit: 'cover' }} />
                  <MuiStaStatus kind={c.tag} sx={{ position: 'absolute', top: 10, left: 10 }}>{c.tagL}</MuiStaStatus>
                </Box>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{c.t}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.s}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.2 — All Trips List
function C222_AllTrips() {
  const { Box, Stack, Typography, Button, Card, CardContent, CardMedia, Chip, TextField, InputAdornment } = MUI;
  const trips = [
    { t: 'Sandals Royal Bahamian', s: 'Aug 12 – 19, 2026 · Honeymoon', tag: 'booked', tagL: 'Booked', i: 'overwater', val: 6480 },
    { t: 'Family week — Negril', s: 'Dec 22 – 29, 2026 · 4 travelers', tag: 'proposal', tagL: 'Proposal ready', i: 'jamaica', val: 9120 },
    { t: 'Symphony of the Seas', s: 'Mar 4 – 11, 2025 · Cruise', tag: 'past', tagL: 'Past', i: 'cruiseShip', val: 5240 },
    { t: 'Beaches Turks & Caicos', s: 'Jan 6 – 13, 2024 · Family', tag: 'past', tagL: 'Past', i: 'turks', val: 6920 },
    { t: 'Atlantis Paradise', s: 'Nov 18 – 22, 2023 · Weekend', tag: 'past', tagL: 'Past', i: 'bahamas', val: 3180 },
  ];
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3.5, pt: 2.5 }}>
          <MuiScreenHeader title="My trips" subtitle="Everything Story-Tail has built for you — past, present, and in motion." small />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {['All · 5', 'Upcoming · 1', 'In Planning · 1', 'Past · 3', 'Cancelled · 0'].map((t, i) => (
              i === 0
                ? <Chip key={t} label={t} color="secondary" onClick={() => {}} />
                : <Chip key={t} label={t} variant="outlined" onClick={() => {}} />
            ))}
            <Stack direction="row" spacing={1} sx={{ ml: 'auto', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search trips"
                slotProps={{ input: { readOnly: true, startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={12} /></InputAdornment> } }}
                sx={{ width: 180 }}
              />
              <Chip label="Sort · Date ▾" variant="outlined" />
            </Stack>
          </Stack>
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, overflow: 'auto', px: 3.5, pt: 1.75, pb: 3.5 }}>
          {trips.map((t, i) => (
            <Card key={i} sx={{ display: 'grid', gridTemplateColumns: '200px 1fr auto' }}>
              <CardMedia component="img" image={staImg(t.i, 400, 220)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <CardContent sx={{ p: 2 }}>
                <MuiStaStatus kind={t.tag}>{t.tagL}</MuiStaStatus>
                <Typography variant="h5" sx={{ mt: 0.75, mb: 0.25 }}>{t.t}</Typography>
                <Typography variant="caption" color="text.secondary">{t.s}</Typography>
              </CardContent>
              <Box sx={{ p: 2, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 160 }}>
                <C22_MuiLabel>TRIP VALUE</C22_MuiLabel>
                <Typography variant="h5" sx={{ my: 0.25 }}>${t.val.toLocaleString()}</Typography>
                <Button variant="outlined" color="secondary" size="small" sx={{ mt: 'auto' }}>Open</Button>
              </Box>
            </Card>
          ))}
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.3 — Trip Detail / Overview
function C223_TripDetail() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, CardActionArea, Avatar } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'relative', height: 220, overflow: 'hidden', flexShrink: 0 }}>
          <Box component="img" src={staImg('overwater', 1600, 480)} alt="" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(13,33,55,0.75))' }} />
          <Stack direction="row" sx={{ position: 'absolute', left: 28, right: 28, bottom: 18, color: 'common.white', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Box>
              <MuiStaStatus kind="booked">Booked</MuiStaStatus>
              <Typography variant="h3" component="h1" sx={{ mt: 1, mb: 0.25, color: 'common.white' }}>Sandals Royal Bahamian</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.9 }}>Aug 12 – 19, 2026 · Jordan + Sam · Nassau · 90 days to go</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" color="brand">Authorize card</Button>
              <Button variant="outlined" color="inherit" startIcon={<MuiIcon name="download" size={14} />}>PDF</Button>
            </Stack>
          </Stack>
        </Box>
        <Box sx={{ px: 3.5, py: 2.5, overflow: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 2.25, alignContent: 'start' }}>
          <Box>
            <Grid container spacing={1.25} sx={{ mb: 2 }}>
              {[
                { i: 'plane', l: 'Itinerary', s: 'Day-by-day', tone: 'primary' },
                { i: 'card', l: 'Payments', s: '$4,180 due May 28', tone: 'error' },
                { i: 'passport', l: 'Documents', s: '5 files', tone: 'secondary' },
                { i: 'message', l: 'Messages', s: '2 unread', tone: 'tertiary' },
              ].map((s) => (
                <Grid key={s.l} size={3}>
                  <Card>
                    <CardActionArea sx={{ p: 1.5, display: 'flex', gap: 1.25, alignItems: 'center', justifyContent: 'flex-start' }}>
                      <C22_MuiIconTile name={s.i} tone={s.tone} />
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{s.l}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.s}</Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Card sx={{ mb: 1.5 }}>
              <CardContent>
                <Typography variant="h5">At a glance</Typography>
                <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.75 }}>
                  {[
                    { l: 'Trip type', v: 'Honeymoon · 7 nights' },
                    { l: 'Destination', v: 'Nassau, Bahamas' },
                    { l: 'Travelers', v: 'Jordan + Sam Hayes' },
                    { l: 'Total value', v: '$6,480 all-in' },
                    { l: 'Card on file', v: 'VISA •••• 4242' },
                    { l: 'Status', v: 'Booked · final balance pending' },
                  ].map((kv) => <C22_MuiKV key={kv.l} l={kv.l} v={kv.v} />)}
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h5">Notes from Gyasi</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  "I added a Red Lane spa credit and locked in your bungalow upgrade for Day 3. Sandals will invoice me on May 28 — your card is set to cover up to $4,598 of the final balance."
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Stack component="aside" spacing={1.5}>
            <Card>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <C22_MuiLabel>YOUR ADVISOR</C22_MuiLabel>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 0.75 }}>
                  <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 40, height: 40 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Gyasi Story</Typography>
                    <Typography variant="caption" color="text.secondary">Online · reply in &lt; 2h</Typography>
                  </Box>
                  <C22_MuiDot />
                </Stack>
                <Button variant="outlined" color="secondary" size="small" fullWidth startIcon={<MuiIcon name="message" size={14} />} sx={{ mt: 1.25 }}>Message</Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <C22_MuiLabel>PAYMENT TIMELINE</C22_MuiLabel>
                <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><C22_MuiDot /><Typography variant="caption" sx={{ fontWeight: 500 }}>Deposit · paid $800</Typography></Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><C22_MuiDot /><Typography variant="caption" sx={{ fontWeight: 500 }}>Mid · paid $1,500</Typography></Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'error.main' }}><C22_MuiDot color="error.main" /><Typography variant="caption" sx={{ fontWeight: 500 }}>Final · $4,180 due May 28</Typography></Stack>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.4 — Itinerary Viewer (Day-by-Day)
function C224_ItineraryViewer() {
  const { Box, Stack, Typography, Button, Card, CardContent, Chip, List, ListItem, ListItemIcon, ListItemText } = MUI;
  const blocks = [
    { time: '06:40', period: 'MORNING', kind: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Direct · 2h 50m · Seats 14A 14B', c: 'PNR TLR8QV' },
    { time: '11:20', period: 'AFTERNOON', kind: 'trip', t: 'Private transfer · Mercedes Vito', s: 'Sun & Fun Tours · 25 min' },
    { time: '13:00', period: 'AFTERNOON', kind: 'building', t: 'Check-in · Sandals Royal Bahamian', s: 'Honeymoon Beachfront Walkout · Bldg 3', c: 'SRB-220119' },
    { time: '19:30', period: 'EVENING', kind: 'utensils', t: 'Welcome dinner · Bayside', s: '4 courses · Reserved 7:30 PM' },
  ];
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'relative', height: 180, overflow: 'hidden', flexShrink: 0 }}>
          <Box component="img" src={staImg('overwater', 1600, 400)} alt="" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(13,33,55,0.7))' }} />
          <Box sx={{ position: 'absolute', left: 28, right: 28, bottom: 16, color: 'common.white' }}>
            <MuiStaStatus kind="booked">Booked · 7 nights</MuiStaStatus>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 0.75, mb: 0.25, color: 'common.white' }}>Sandals Royal Bahamian · Itinerary</Typography>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, opacity: 0.9 }}>Aug 12 – Aug 19, 2026 · Jordan + Sam</Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, px: 3.5, py: 2.25, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 2.25, overflow: 'hidden' }}>
          <Box sx={{ overflow: 'auto' }}>
            <Stack direction="row" spacing={0.75} sx={{ mb: 1.75, overflow: 'auto' }}>
              {['Day 1 · Wed', 'Day 2 · Thu', 'Day 3 · Fri', 'Day 4 · Sat', 'Day 5 · Sun', 'Day 6 · Mon', 'Day 7 · Tue'].map((t, i) => (
                i === 0
                  ? <Chip key={t} label={t} color="primary" onClick={() => {}} />
                  : <Chip key={t} label={t} onClick={() => {}} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mb: 1.5 }}>
              <Typography variant="script" sx={{ color: 'primary.main', fontSize: 32 }}>Day 01</Typography>
              <Typography variant="h5">Miami → Nassau</Typography>
            </Stack>
            {blocks.map((b, i) => (
              <Card key={i} sx={{ mb: 1 }}>
                <CardContent sx={{ px: 1.75, py: 1.5, display: 'flex', gap: 1.75, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ minWidth: 60 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1 }}>{b.time}</Typography>
                    <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.6 }}>{b.period}</Typography>
                  </Box>
                  <C22_MuiIconTile name={b.kind} size={18} tone="secondary" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{b.t}</Typography>
                    <Typography variant="caption" color="text.secondary">{b.s}</Typography>
                  </Box>
                  {b.c && <C22_MuiKbd>{b.c}</C22_MuiKbd>}
                </CardContent>
              </Card>
            ))}
          </Box>
          <Stack component="aside" spacing={1.25}>
            <Button variant="outlined" color="secondary" fullWidth startIcon={<MuiIcon name="download" size={14} />}>Download PDF</Button>
            <Button variant="outlined" fullWidth startIcon={<MuiIcon name="share" size={14} />}>Share with co-traveler</Button>
            <Card>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1 } }}>
                <C22_MuiLabel>IMPORTANT INFO</C22_MuiLabel>
                <List dense disablePadding>
                  {['Insurance · Allianz #98-7124', 'Emergency · +1 (242) 555-3300', 'Packing list (Gyasi\'s)', 'Visa · not required'].map((s) => (
                    <ListItem key={s} disableGutters divider sx={{ py: 0.75, '&:last-child': { borderBottom: 0 } }}>
                      <ListItemIcon sx={{ minWidth: 24, color: 'text.secondary' }}><Icon name="info" size={13} /></ListItemIcon>
                      <ListItemText primary={s} slotProps={{ primary: { variant: 'caption', sx: { fontWeight: 500 } } }} sx={{ my: 0 }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.5 — Itinerary Day Detail
function C225_DayDetail() {
  const { Box, Stack, Typography, Button, Card, CardContent, Paper, useTheme } = MUI;
  const theme = useTheme();
  const sunset = theme.palette.brandSource.sunset;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3.5, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14} />} sx={{ px: 0 }}>Back to itinerary</Button>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 0.5 }}>
            <Typography variant="script" sx={{ color: 'primary.main', fontSize: 36 }}>Day 03</Typography>
            <Box>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Cay day-trip</Typography>
              <Typography variant="caption" color="text.secondary">Fri Aug 14, 2026 · Snorkel + private island lunch</Typography>
            </Box>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', px: 3.5, py: 2, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 2.25, alignContent: 'start' }}>
          <Stack spacing={1.25}>
            {[
              { i: 'sparkle', time: '09:00 – 15:00', t: 'Catamaran to Rose Island Cay', s: 'Snorkel gear + lunch included · 6 hours · for 2', address: 'Rose Island Marina, Nassau' },
              { i: 'heart', time: '17:30 – 18:15', t: 'Beach yoga (optional)', s: '45 min · Pavilion · towels provided' },
              { i: 'utensils', time: '20:30', t: 'Hibachi night — Kimonos', s: 'Party of 2 · 8:30 PM · dress code: evening resort', address: 'Inside resort, Building 1' },
            ].map((b) => (
              <Card key={b.t}>
                <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <C22_MuiIconTile name={b.i} size={18} tone="secondary" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{b.t}</Typography>
                      <Typography variant="caption" color="text.secondary">{b.s}</Typography>
                    </Box>
                    <C22_MuiKbd>{b.time}</C22_MuiKbd>
                  </Stack>
                  {b.address && (
                    <Paper elevation={0} sx={{ mt: 1.25, p: 1.25, bgcolor: 'surface.2', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon name="pin" size={13} />
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>{b.address}</Typography>
                      <Button variant="text" size="small" sx={{ ml: 'auto', px: 0 }}>Open in Maps →</Button>
                    </Paper>
                  )}
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                    <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="phone" size={12} />}>Call supplier</Button>
                    <Button variant="outlined" size="small">Mark as done</Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
          <Stack component="aside" spacing={1.5}>
            <Card>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <C22_MuiLabel>WEATHER · NASSAU</C22_MuiLabel>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 0.75 }}>
                  <Icon name="sun" size={32} color={sunset} fill={sunset} />
                  <Box>
                    <Typography variant="h3">87°F</Typography>
                    <Typography variant="caption" color="text.secondary">Mostly sunny · UV high · 8mph SE</Typography>
                  </Box>
                </Stack>
                <Paper elevation={0} sx={{ mt: 1, p: 1, bgcolor: 'warning.container', color: 'text.primary' }}>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>☀ UV index 9 · Pack reef-safe sunscreen</Typography>
                </Paper>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <C22_MuiLabel>OFFLINE-READY</C22_MuiLabel>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>Synced 2h ago</Typography>
                <Typography variant="caption" color="text.secondary">Available on plane / no signal.</Typography>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.6 — Trip Document Library
function C226_TripDocuments() {
  const { Box, Grid, Typography, Button, Card, CardContent, IconButton } = MUI;
  const groups = [
    { t: 'Supplier confirmations', docs: [{ n: 'sandals-confirmation.pdf', s: '320 KB · Gyasi', d: 'Mar 14' }, { n: 'flight-aa1413-boarding.pdf', s: '180 KB · Gyasi', d: 'Apr 02' }] },
    { t: 'Passports & visas', docs: [{ n: 'passport-jordan.jpg', s: '1.1 MB · You', d: 'Mar 20' }, { n: 'passport-sam.jpg', s: '1.4 MB · You', d: 'Mar 20' }] },
    { t: 'Insurance', docs: [{ n: 'allianz-policy-987124.pdf', s: '620 KB · Gyasi', d: 'Mar 28' }] },
  ];
  return (
    <MuiScreenFrame role="client" tab="docs" padding={28} scrollable>
      <MuiScreenHeader
        title="Documents · Sandals · Aug 2026"
        subtitle="Everything for this trip, all in one place. Auto-encrypted, share via secure link."
        actions={<>
          <Button variant="outlined" size="small" startIcon={<MuiIcon name="grid" size={14} />}>Grid</Button>
          <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="upload" size={14} />}>Upload</Button>
        </>}
        small
      />
      {groups.map((g) => (
        <Box key={g.t} sx={{ mb: 2.25 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{g.t}</Typography>
          <Grid container spacing={1.25}>
            {g.docs.map((d) => (
              <Grid key={d.n} size={4}>
                <Card>
                  <CardContent sx={{ p: 1.5, display: 'flex', gap: 1.25, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ width: 38, height: 46, borderRadius: 0.5, bgcolor: d.n.endsWith('.pdf') ? 'primary.main' : 'brand.main', color: d.n.endsWith('.pdf') ? 'primary.contrastText' : 'brand.contrastText', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 9, lineHeight: 1 }}>{d.n.endsWith('.pdf') ? 'PDF' : 'IMG'}</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>{d.n}</Typography>
                      <Typography variant="caption" color="text.secondary">{d.s} · {d.d}</Typography>
                    </Box>
                    <IconButton size="small"><MuiIcon name="more_vert" size={14} /></IconButton>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </MuiScreenFrame>
  );
}

// 2.2.7 — Trip Messages / Conversation Thread (per trip)
function C227_TripThread() {
  const { Box, Stack, Typography, Button, IconButton, Avatar, Chip } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1.5} sx={{ px: 3, py: 1.75, borderBottom: 1, borderColor: 'divider', alignItems: 'center', flexShrink: 0 }}>
          <IconButton size="small"><MuiIcon name="arrow_left" size={18} /></IconButton>
          <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 36, height: 36 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Gyasi · Sandals · Aug 12</Typography>
            <Typography variant="caption" color="text.secondary">Trip thread · last reply 2h ago</Typography>
          </Box>
          <Button variant="outlined" color="secondary" size="small">Open trip</Button>
        </Stack>
        <Stack spacing={1.5} sx={{ flex: 1, px: 3, py: 2.25, overflow: 'auto' }}>
          <Box sx={{ textAlign: 'center' }}><Chip size="small" label="Today" /></Box>
          {[
            { who: 'Gyasi', mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates. I held one tentatively. Want me to lock?' },
            { who: 'You', mine: true, t: '11:32a', b: "Yes please. Sam will lose it 😍 — what's the upgrade run us?" },
            { who: 'Gyasi', mine: false, t: '11:33a', b: '$680 over the base, but I got a Red Lane spa credit + a private island day. Net win.' },
            { who: 'You', mine: true, t: '11:36a', b: 'Done. Authorize whatever you need on the VISA.' },
            { who: 'Gyasi', mine: false, t: '2:14p', b: "Locked. I also flagged your card for the final balance ($4,180) — there's a payment authorization request in your dashboard." },
          ].map((m, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
              {!m.mine && <Avatar src={staImg('avatarA', 48, 48)} alt="" sx={{ width: 28, height: 28, alignSelf: 'flex-end' }} />}
              <Box sx={{ maxWidth: '70%' }}>
                <C22_MuiBubble mine={m.mine}>{m.b}</C22_MuiBubble>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500, fontSize: 11, mt: 0.375, textAlign: m.mine ? 'right' : 'left' }}>{m.t}</Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
        <Box sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <C22_MuiComposer placeholder="Reply to Gyasi…" sendLabel="Send" />
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
            {['👍 Sounds good', 'Add my partner', 'Send passport', 'Schedule a call'].map((t) => <Chip key={t} label={t} variant="outlined" size="small" onClick={() => {}} />)}
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.8 — Empty Trip Component States
function C228_EmptyState() {
  const { Box, Grid, Typography, Button, Paper, Avatar } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={28}>
      <MuiScreenHeader title="Itinerary · Day 1 · Wed Aug 12" subtitle="Some pieces aren't booked yet — friendly empty states keep things clear." small />
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed', bgcolor: 'surface.2' }}>
        <Avatar sx={{ width: 56, height: 56, bgcolor: 'surface.3', color: 'text.secondary', mx: 'auto', mb: 1.25 }}>
          <Icon name="plane" size={28} />
        </Avatar>
        <Typography variant="h5">Your flights aren't booked yet</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mt: 0.75, mb: 2 }}>Gyasi is still working on the flights. They will appear here once they are confirmed.</Typography>
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="message" size={14} />}>Ask Gyasi where things stand</Button>
      </Paper>

      <Grid container spacing={1.5} sx={{ mt: 2 }}>
        {[
          { i: 'utensils', t: 'No dining reserved yet', s: 'Gyasi will book Bayside Friday once he hears back from concierge.' },
          { i: 'sparkle', t: 'Day 4 — Open day', s: 'Nothing planned. Tell us if you\'d like a tour or some pool time and we\'ll add it.' },
        ].map((c) => (
          <Grid key={c.t} size={6}>
            <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', borderStyle: 'dashed' }}>
              <C22_MuiIconTile name={c.i} tone="surface" />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{c.t}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{c.s}</Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </MuiScreenFrame>
  );
}

// 2.2.9 — Trip Status Change Notification View
function C229_StatusChange() {
  const { Box, Grid, Typography, Button, Card, CardContent, Avatar } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={28}>
      <Card sx={{ bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
        <CardContent sx={{ p: 2.75, display: 'flex', gap: 2.25, alignItems: 'center', '&:last-child': { pb: 2.75 } }}>
          <Avatar sx={{ width: 56, height: 56, bgcolor: 'secondary.onContainer', color: 'secondary.container' }}>
            <Icon name="sparkle" size={28} />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ lineHeight: 1.3 }}>STATUS UPDATED · 2 MIN AGO</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, mb: 0.25 }}>Proposal Ready</Typography>
            <Typography variant="body2">"Family week — Negril" moved from <i>Inquiry</i> to <i>Proposal Ready</i>. Gyasi sent you a curated 7-night package.</Typography>
          </Box>
          <Button variant="contained" color="secondary">View proposal →</Button>
        </CardContent>
      </Card>

      <Grid container spacing={1.75} sx={{ mt: 2.5 }}>
        <Grid size={6}>
          <Card>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>What changed</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                • New proposal: Couples Swept Away · Negril · Dec 22–29<br />
                • $9,120 total · Gyasi's notes attached<br />
                • Two room-type options to choose from
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>What's next</Typography>
              <Typography component="ol" variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 0, pl: 2.25, lineHeight: 1.5 }}>
                <li>Review the proposal</li>
                <li>Reply with feedback or pick a room</li>
                <li>Authorize a card so we can lock it in</li>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </MuiScreenFrame>
  );
}

// 2.2.10 — Trip Cancellation View
function C2210_Cancelled() {
  const { Box, Stack, Typography, Button, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'relative', height: 160, overflow: 'hidden', flexShrink: 0 }}>
          <Box component="img" src={staImg('cruiseShip', 1600, 320)} alt="" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.55) brightness(0.6)' }} />
          <Box sx={{ position: 'absolute', inset: 0, px: 3.5, py: 3, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
            <MuiStaStatus kind="cancelled">Cancelled</MuiStaStatus>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 0.75, mb: 0.25, color: 'common.white' }}>Carnival Mardi Gras · Spring break 2026</Typography>
            <Typography variant="caption" sx={{ fontWeight: 500, opacity: 0.85 }}>Mar 15 – 22, 2026 · 4 travelers · Cancelled Feb 02, 2026</Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, px: 3.5, py: 2.5, overflow: 'auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 2.25, alignContent: 'start' }}>
          <Card>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="h5">Cancellation summary</Typography>
              <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
                {[
                  { l: 'Reason', v: 'Family schedule conflict' },
                  { l: 'Cancelled on', v: 'Feb 02, 2026' },
                  { l: 'Cancellation fee', v: '$120 (per Carnival)' },
                  { l: 'Refund', v: '$1,640 · processed Feb 12' },
                  { l: 'Refund method', v: 'Original VISA •••• 4242' },
                  { l: 'Future-trip credit', v: '$240 · use by Dec 2027' },
                ].map((kv) => <C22_MuiKV key={kv.l} l={kv.l} v={kv.v} />)}
              </Box>
            </CardContent>
          </Card>
          <Stack component="aside" spacing={1.5}>
            <Button variant="outlined" color="secondary" fullWidth startIcon={<MuiIcon name="passport" size={14} />}>View archived itinerary</Button>
            <Button variant="outlined" fullWidth startIcon={<MuiIcon name="message" size={14} />}>Message Gyasi</Button>
            <Card sx={{ bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Ready to plan again?</Typography>
                <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.5 }}>Apply your $240 credit toward a future cruise — Gyasi has 3 options for fall.</Typography>
                <Button variant="contained" color="secondary" size="small" sx={{ mt: 1.25 }}>Book a similar trip →</Button>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.2.11 — Past Trip Memory View
function C2211_PastTrip() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, Paper } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <Box component="img" src={staImg('turks', 1600, 480)} alt="" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.7))' }} />
        <Box sx={{ position: 'absolute', left: 28, right: 28, bottom: 18, color: 'common.white' }}>
          <MuiStaStatus kind="past">Past · Loved by you</MuiStaStatus>
          <Typography variant="h3" component="h1" sx={{ mt: 0.75, color: 'common.white' }}>Beaches Turks &amp; Caicos</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.9 }}>Jan 6 – 13, 2024 · The Hayes family · 4 travelers</Typography>
        </Box>
      </Box>
      <Box sx={{ px: 3.5, py: 2.5, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 2.25 }}>
        <Box>
          <Typography variant="h5">Your photos · 12</Typography>
          <Grid container spacing={1} sx={{ mt: 1 }}>
            {['turks', 'bahamas', 'aruba', 'snorkel', 'overwater', 'resortPool', 'sunset', 'honeymoon'].map((k, i) => (
              <Grid key={i} size={3}>
                <Box sx={{ aspectRatio: '1/1', borderRadius: 1, overflow: 'hidden' }}>
                  <Box component="img" src={staImg(k, 240, 240)} alt="" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                </Box>
              </Grid>
            ))}
            <Grid size={3}>
              <Paper variant="outlined" sx={{ aspectRatio: '1/1', bgcolor: 'surface.2', borderStyle: 'dashed', borderColor: 'outline.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', flexDirection: 'column', gap: 0.5 }}>
                <Icon name="upload" size={18} />
                <Typography variant="caption">Add more</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>
        <Stack component="aside" spacing={1.5}>
          <Card sx={{ bgcolor: 'secondary.container', color: 'secondary.onContainer', position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.18)' }} />
            <CardContent sx={{ position: 'relative', p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="overline" sx={{ display: 'block', opacity: 0.75, lineHeight: 1.3 }}>A NOTE FROM GYASI</Typography>
              <Typography variant="script" sx={{ display: 'block', fontSize: 28, lineHeight: 1.1, mt: 0.5 }}>You took the rest. That matters.</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.75, opacity: 0.85 }}>Seven nights of "very good" — reef, family, salt air. Thank you for letting us hold the details. Welcome home. 🌴</Typography>
            </CardContent>
          </Card>
          <Card sx={{ bgcolor: 'primary.container', color: 'primary.onContainer' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Book a similar trip</Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.5 }}>Gyasi pulled 6 family-friendly all-inclusives for Jan 2027 with your past preferences.</Typography>
              <Button variant="contained" size="small" sx={{ mt: 1.25 }}>Browse picks →</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Leave a testimonial</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Helps Gyasi (and other travelers).</Typography>
              <Button variant="outlined" color="secondary" size="small" fullWidth sx={{ mt: 1 }}>Write a review</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <C22_MuiLabel>TRIP SNAPSHOT</C22_MuiLabel>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, lineHeight: 1.6, mt: 0.75 }}>
                7 nights · 4 travelers<br />
                $6,920 all-in<br />
                Highlights: Sesame Street experience, snorkel at Bight Reef
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C221_Dashboard, C222_AllTrips, C223_TripDetail, C224_ItineraryViewer, C225_DayDetail,
  C226_TripDocuments, C227_TripThread, C228_EmptyState, C229_StatusChange, C2210_Cancelled, C2211_PastTrip,
});
