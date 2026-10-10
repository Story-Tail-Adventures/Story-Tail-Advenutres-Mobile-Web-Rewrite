/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Client · 2.8 Group Trip Coordination (Future-Ready) — 4 screens. MUI v9.

// Day tag (legacy kbd) — local helper, C28_ prefix keeps it collision-free.
function C28_MuiKbd({ children }) {
  const { Chip } = MUI;
  return <Chip size="small" variant="outlined" label={children} sx={{ fontFamily: (t) => t.typography.mono, fontSize: 11, height: 20 }} />;
}

// Overlapping avatar row from staImg keys.
function C28_MuiAvatarRow({ keys, size = 28 }) {
  const { AvatarGroup, Avatar } = MUI;
  return (
    <AvatarGroup max={keys.length} sx={{ '& .MuiAvatar-root': { width: size, height: size, borderColor: 'background.paper' } }}>
      {keys.map((a) => <Avatar key={a} src={staImg(a, 64, 64)} alt="" />)}
    </AvatarGroup>
  );
}

// 2.8.1 — Group Trip Overview
function C281_GroupOverview() {
  const { Box, Stack, Grid, Paper, Typography, Button, Chip, Card, CardContent, Alert, AlertTitle } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="client" tab="home" padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <Box component="img" src={staImg('cruiseShip', 1600, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(13,33,55,0.8))' }} />
        <Box sx={{ position: 'absolute', left: 28, right: 28, bottom: 16, color: 'common.white' }}>
          <MuiStaStatus kind="booked">Group · 12 travelers</MuiStaStatus>
          <Typography variant="h3" component="h1" sx={{ mt: 0.75, mb: 0.25, color: 'common.white' }}>The 40th Birthday Cruise</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.92 }}>Royal Caribbean Symphony · Dec 28 – Jan 4, 2027 · 4 cabins booked</Typography>
        </Box>
      </Box>
      <Box sx={{ px: 3.5, py: 2.5, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25 }}>
        <Box>
          <Stack direction="row" spacing={0.75} sx={{ mb: 1.75 }}>
            {['Overview', 'Shared itinerary', 'Group chat · 23', 'Payment status'].map((t, i) => (
              i === 0
                ? <Chip key={t} label={t} color="secondary" onClick={noop} />
                : <Chip key={t} label={t} variant="outlined" onClick={noop} />
            ))}
          </Stack>

          <Card sx={{ mb: 1.5 }}>
            <CardContent>
              <Typography variant="h5">Roster · 12 travelers in 4 cabins</Typography>
              <Grid container spacing={1} sx={{ mt: 1.25 }}>
                {[
                  { cabin: 'Cabin 1 · Balcony 7430', who: 'Jordan + Sam Hayes (you)', tag: 'Organizer', tone: 'primary' },
                  { cabin: 'Cabin 2 · Balcony 7432', who: 'Maya + Daniel Carter', tag: 'Authorized · paid' },
                  { cabin: 'Cabin 3 · Balcony 7434', who: 'Reggie + Marc + child', tag: 'Authorized · deposit only' },
                  { cabin: 'Cabin 4 · Suite 9200', who: 'Westbrook family (4)', tag: 'Awaiting authorization', warn: true },
                ].map((c, i) => (
                  <Grid key={i} size={6}>
                    <Paper elevation={0} sx={{ p: 1.5, height: '100%', bgcolor: c.tone === 'primary' ? 'primary.container' : 'surface.2', color: c.tone === 'primary' ? 'primary.onContainer' : 'text.primary' }}>
                      <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3, color: c.tone === 'primary' ? 'inherit' : 'text.secondary' }}>{c.cabin}</Typography>
                      <Typography variant="subtitle1" sx={{ mt: 0.25, color: 'inherit' }}>{c.who}</Typography>
                      <MuiStaStatus kind={c.warn ? 'due' : 'booked'} sx={{ mt: 0.75 }}>{c.tag}</MuiStaStatus>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h5">Shared itinerary · highlights</Typography>
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                {[
                  { d: 'Day 1 · Dec 28', t: 'Group sail-away on the pool deck · 5 PM' },
                  { d: 'Day 3 · Dec 30', t: 'Reserved dining · all 12 at Chef\'s Table' },
                  { d: 'Day 4 · Dec 31', t: 'NYE balcony fireworks · group photo at 11:30 PM' },
                  { d: 'Day 6 · Jan 02', t: 'CocoCay private island · cabana for 12 booked' },
                ].map((b) => (
                  <Paper key={b.d} elevation={0} sx={{ px: 1.5, py: 1, bgcolor: 'surface.2', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <C28_MuiKbd>{b.d}</C28_MuiKbd>
                    <Typography variant="body2" sx={{ flex: 1 }}>{b.t}</Typography>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>
        <Stack component="aside" spacing={1.5}>
          <Alert severity="warning">
            <AlertTitle>1 cabin needs payment</AlertTitle>
            Westbrook family — final balance authorization pending. Gyasi has nudged them.
          </Alert>
          <Card>
            <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>GROUP CHAT</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                <C28_MuiAvatarRow keys={['avatarA','avatarB','avatarC','avatarD']} size={28} />
                <Typography variant="caption" color="text.secondary">4 active · 23 new</Typography>
              </Stack>
              <Button variant="outlined" color="secondary" size="small" fullWidth sx={{ mt: 1.25 }}>Open group chat</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>INVITE</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>2 invited but not yet on board · Westbrooks need an account.</Typography>
              <Button variant="outlined" size="small" fullWidth sx={{ mt: 1 }}>Send reminder</Button>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.8.2 — Co-Traveler Invitation
function C282_CoTravelerInvite() {
  const { Box, Stack, Grid, Paper, Typography, Button, Chip, TextField, Card, CardContent, Divider, Radio, FormControlLabel } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="client" tab="home" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14} />} sx={{ mb: 1 }}>Back to group</Button>
      <MuiScreenHeader title="Invite a co-traveler" subtitle="They'll see the itinerary and group chat. Set their permissions below." small />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 2.25, maxWidth: 920 }}>
        <Card>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Grid container spacing={1.5}>
              <Grid size={6}><TextField label="Name" size="small" fullWidth placeholder="e.g. Jamie Westbrook" /></Grid>
              <Grid size={6}><TextField label="Email" size="small" fullWidth placeholder="jamie@example.com" /></Grid>
              <Grid size={12}><TextField label="Personal note (optional)" size="small" fullWidth multiline minRows={2} defaultValue="Hey Jamie — added you to our 40th cruise group on Story-Tail. Tap the link to see the itinerary 🚢" /></Grid>
            </Grid>

            <Typography variant="subtitle1" sx={{ mt: 2 }}>Permission level</Typography>
            <Grid container spacing={1.25} sx={{ mt: 1 }}>
              {[
                { t: 'View itinerary only', s: 'No account needed · magic-link access', sel: true },
                { t: 'Full member', s: 'Creates a Story-Tail account · can authorize own cards' },
              ].map((p) => (
                <Grid key={p.t} size={6}>
                  <Paper variant="outlined" sx={{
                    p: 1.75, height: '100%', cursor: 'pointer',
                    bgcolor: p.sel ? 'primary.container' : 'background.paper',
                    color: p.sel ? 'primary.onContainer' : 'text.primary',
                    borderColor: p.sel ? 'primary.main' : 'divider',
                  }}>
                    <FormControlLabel
                      control={<Radio size="small" checked={!!p.sel} onChange={noop} sx={{ py: 0 }} />}
                      label={<Typography variant="subtitle1" sx={{ color: 'inherit' }}>{p.t}</Typography>}
                      sx={{ m: 0, color: 'inherit' }}
                    />
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'inherit', opacity: 0.85 }}>{p.s}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Typography variant="subtitle1" sx={{ mt: 2 }}>Delivery</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
              <Chip label="Send via email" color="secondary" onClick={noop} />
              <Chip label="Copy invite link" variant="outlined" />
            </Stack>

            <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
              <Button variant="text">Cancel</Button>
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" startIcon={<MuiIcon name="send" size={14} />}>Send invite</Button>
            </Stack>
          </CardContent>
        </Card>
        <Card component="aside">
          <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>PREVIEW · INVITE EMAIL</Typography>
            <Paper variant="outlined" sx={{ mt: 1, p: 1.5, bgcolor: 'surface.2' }}>
              <Typography variant="subtitle1">You're invited to the 40th Birthday Cruise</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>From Jordan Hayes · via Story-Tail Adventures</Typography>
              <Divider sx={{ my: 1.25 }} />
              <Typography variant="caption" sx={{ display: 'block' }}>"Hey Jamie — added you to our 40th cruise group on Story-Tail. Tap the link to see the itinerary 🚢"</Typography>
              <Button variant="contained" size="small" fullWidth sx={{ mt: 1.25 }}>View the trip</Button>
            </Paper>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.8.3 — Group Chat
function C283_GroupChat() {
  const { Box, Stack, Paper, Typography, Button, IconButton, Chip, Avatar, TextField, InputAdornment } = MUI;
  return (
    <MuiScreenFrame role="client" tab="msg" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton size="small"><MuiIcon name="arrow_left" size={16} /></IconButton>
          <C28_MuiAvatarRow keys={['avatarA','avatarB','avatarC','avatarD']} size={32} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1">40th Cruise Group · 4 households</Typography>
            <Typography variant="caption" color="text.secondary">Maya, Reggie, Westbrook, Hayes · Gyasi added</Typography>
          </Box>
          <Button variant="outlined" color="secondary" size="small">Open trip</Button>
          <IconButton size="small"><MuiIcon name="more_vert" size={16} /></IconButton>
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0, px: 3, py: 2.25, overflow: 'auto' }}>
          <Box sx={{ textAlign: 'center' }}><Chip size="small" label="Today" /></Box>
          {[
            { who: 'Maya', a: 'avatarA', t: '9:14a', b: 'Y\'all I cannot wait. Counting down 🥳' },
            { who: 'Reggie', a: 'avatarF', t: '10:02a', b: 'Drinks package on me for night 3 — I\'ll talk to Gyasi.', reactions: [{ e: '🥃', n: 3 }] },
            { who: 'You', mine: true, t: '10:14a', b: 'Sending. ❤' },
            { who: 'Gyasi', a: 'avatarC', t: '11:30a', b: 'I confirmed the Chef\'s Table reservation for all 12 on Day 3. Want me to add the drinks package company-wide?', system: true },
            { who: 'Westbrook', a: 'avatarB', t: '12:48p', b: 'YES drinks. Also — we just authorized our card. Sorry for the delay, work has been a circus.' },
          ].map((m, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', gap: 1 }}>
              {!m.mine && <Avatar src={staImg(m.a, 48, 48)} alt="" sx={{ width: 28, height: 28, alignSelf: 'flex-end' }} />}
              <Box sx={{ maxWidth: '70%' }}>
                {!m.mine && (
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.375, color: m.system ? 'brand.main' : 'text.secondary', fontWeight: m.system ? 700 : 500 }}>
                    {m.who}{m.system && ' · Advisor'}
                  </Typography>
                )}
                <Paper
                  elevation={0}
                  variant={m.mine || m.system ? 'elevation' : 'outlined'}
                  sx={{
                    px: 1.75, py: 1.25,
                    bgcolor: m.mine ? 'primary.main' : m.system ? 'secondary.container' : 'background.paper',
                    color: m.mine ? 'primary.contrastText' : m.system ? 'secondary.onContainer' : 'text.primary',
                  }}
                >
                  <Typography variant="body2" sx={{ color: 'inherit' }}>{m.b}</Typography>
                </Paper>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.375, fontWeight: 500, textAlign: m.mine ? 'right' : 'left' }}>{m.t}</Typography>
                {m.reactions && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                    {m.reactions.map((r) => <Chip key={r.e} size="small" variant="outlined" label={`${r.e} ${r.n}`} />)}
                  </Stack>
                )}
              </Box>
            </Box>
          ))}
        </Stack>
        <Box sx={{ px: 3, pt: 1.5, pb: 2, borderTop: 1, borderColor: 'divider' }}>
          <TextField
            size="small" fullWidth placeholder="Message the group…"
            slotProps={{
              input: {
                readOnly: true,
                startAdornment: <InputAdornment position="start"><MuiIcon name="attach" size={16} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small"><MuiIcon name="pin" size={14} /></IconButton>
                    <Button variant="contained" size="small" sx={{ minWidth: 0, px: 1, ml: 0.5 }}><MuiIcon name="send" size={12} /></Button>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.8.4 — Co-Traveler View (limited, magic-link)
function C284_CoTravelerView() {
  const { Box, Stack, Grid, Paper, Typography, Button, Link, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
        <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', alignItems: 'center', gap: 1.25, borderBottom: 1, borderColor: 'divider' }}>
          <Icon name="link" size={16} />
          <Typography variant="caption" sx={{ color: 'inherit' }}><b>Read-only view</b> · You're invited by Jordan Hayes as a co-traveler. <Link href="#" color="inherit" underline="always">Create a full account →</Link></Typography>
          <Typography variant="caption" sx={{ ml: 'auto', fontWeight: 500, color: 'inherit', whiteSpace: 'nowrap' }}>Magic link expires Dec 30</Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3 }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>SHARED WITH YOU</Typography>
          <Typography variant="h3" component="h1" sx={{ my: 0.5 }}>The 40th Birthday Cruise · itinerary</Typography>
          <Typography variant="body2" color="text.secondary">Royal Caribbean Symphony · Dec 28 – Jan 4 · 12 travelers · Cabin 2</Typography>

          <Grid container spacing={1.25} sx={{ mt: 2.25 }}>
            {[
              { i: 'ship', l: 'Ship', v: 'Symphony of the Seas' },
              { i: 'building', l: 'Your cabin', v: 'Balcony 7432' },
              { i: 'calendar', l: 'Sailing dates', v: 'Dec 28 – Jan 4, 2027' },
              { i: 'pin', l: 'Departs', v: 'Port Canaveral, FL' },
              { i: 'shield', l: 'Insurance', v: 'Allianz · group policy' },
              { i: 'phone', l: 'Emergency', v: '+1 (305) 555-0184 · Gyasi' },
            ].map((s) => (
              <Grid key={s.l} size={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 1.75, display: 'flex', gap: 1.25, alignItems: 'center', '&:last-child': { pb: 1.75 } }}>
                    <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><Icon name={s.i} size={18} /></Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{s.l}</Typography>
                      <Typography variant="subtitle1" sx={{ mt: 0.25 }}>{s.v}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Typography variant="h5" sx={{ mt: 2.75 }}>Day-by-day · highlights</Typography>
          <Stack spacing={1} sx={{ mt: 1, maxWidth: 720 }}>
            {[
              { d: 'Day 1 · Dec 28', t: 'Embark Port Canaveral · sail-away on pool deck 5 PM' },
              { d: 'Day 2 · Dec 29', t: 'At sea · welcome group brunch · 11 AM Boardwalk' },
              { d: 'Day 3 · Dec 30', t: 'Nassau · group catamaran 9 AM · Chef\'s Table 7 PM' },
              { d: 'Day 4 · Dec 31', t: 'CocoCay · NYE fireworks on the balcony · 11:30 PM' },
            ].map((b) => (
              <Card key={b.d}>
                <CardContent sx={{ px: 2, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
                  <C28_MuiKbd>{b.d}</C28_MuiKbd>
                  <Typography variant="body2" sx={{ flex: 1 }}>{b.t}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Paper elevation={0} sx={{ mt: 2.5, p: 2, bgcolor: 'primary.container', color: 'primary.onContainer', display: 'flex', gap: 1.75, alignItems: 'center' }}>
            <Icon name="message" size={20} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ color: 'inherit' }}>Questions for the advisor?</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: 'inherit', opacity: 0.85 }}>Gyasi is across this group trip — message her without an account.</Typography>
            </Box>
            <Button variant="contained" size="small" sx={{ bgcolor: 'primary.onContainer', color: 'primary.container', flexShrink: 0 }}>Message Gyasi</Button>
          </Paper>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { C281_GroupOverview, C282_CoTravelerInvite, C283_GroupChat, C284_CoTravelerView });
