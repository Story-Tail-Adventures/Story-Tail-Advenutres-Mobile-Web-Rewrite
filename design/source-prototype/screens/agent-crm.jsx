/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.3 Client Management (CRM) — 12 screens. MUI v9.

function CRMShell({ children, tab = 'overview' }) {
  const { Box, Stack, Typography, TextField, InputAdornment, Chip, Avatar, Button, List, ListItemButton, ListItemAvatar, ListItemText, Tabs, Tab } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={0}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '100%', overflow: 'hidden' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 1.75, pt: 1.75, pb: 1 }}>
            <TextField size="small" fullWidth placeholder="Search clients · ⌘K"
                       slotProps={{ input: { readOnly: true, startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={13}/></InputAdornment> } }}
                       sx={{ '& .MuiInputBase-root': { bgcolor: 'surface.3' } }}/>
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ px: 1.75, pb: 1, flexWrap: 'wrap' }}>
            {['Active ✓','VIP','Honeymoon','New'].map((t) => (
              t.includes('✓') ? <Chip key={t} size="small" color="secondary" onClick={noop} label={t}/> : <Chip key={t} size="small" variant="outlined" onClick={noop} label={t}/>
            ))}
          </Stack>
          <List disablePadding sx={{ flex: 1, overflow: 'auto' }}>
            {[
              { n: 'Jordan & Sam Hayes', m: 'Honeymoon · Aug', a: 'avatarC', val: 6480, active: true },
              { n: 'Maya & Daniel Carter', m: 'VIP · 4 trips', a: 'avatarA', val: 14820 },
              { n: 'Westbrook family', m: 'Family · 4 pax', a: 'avatarB', val: 9120 },
              { n: 'Aisha Patel', m: 'Cruise · May', a: 'avatarE', val: 3200 },
              { n: 'Reggie & Marc', m: 'Traveling', a: 'avatarF', val: 5800 },
              { n: 'Linda Gomez', m: 'Lead · new', a: 'avatarA', val: 0 },
              { n: 'Eli Park', m: 'Referral', a: 'avatarF', val: 0 },
            ].map((c) => (
              <ListItemButton key={c.n} selected={!!c.active} sx={{ px: 1.75, py: 1.25, gap: 1.25 }}>
                <ListItemAvatar sx={{ minWidth: 0 }}><Avatar src={staImg(c.a, 64, 64)} sx={{ width: 32, height: 32 }}/></ListItemAvatar>
                <ListItemText primary={c.n} secondary={c.m} slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'caption' } }} sx={{ my: 0 }}/>
                {c.val > 0 && <Typography variant="caption" color="text.secondary" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>${c.val.toLocaleString()}</Typography>}
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Stack direction="row" spacing={1.75} sx={{
            p: 2.5, alignItems: 'center', borderBottom: 1, borderColor: 'divider',
            background: (t) => `linear-gradient(110deg, ${t.palette.primary.container}, ${t.palette.secondary.container})`,
          }}>
            <Avatar src={staImg('avatarC', 200, 200)} sx={{ width: 72, height: 72, border: 3, borderColor: 'background.paper' }}/>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Jordan & Sam Hayes</Typography>
                <MuiStaStatus kind="booked">Active</MuiStaStatus>
                <MuiStaStatus kind="proposal">Trip in motion</MuiStaStatus>
              </Stack>
              <Stack direction="row" spacing={1.75} sx={{ mt: 0.5, color: 'primary.onContainer' }}>
                {['jordan.hayes@example.com', '+1 (305) 555-0184', 'Miami, FL', 'Since Mar 2024'].map((s) => (
                  <Typography key={s} variant="body2" sx={{ fontWeight: 500, fontSize: 12.5 }}>{s}</Typography>
                ))}
              </Stack>
            </Box>
            <Stack direction="row" spacing={0.75}>
              <Button variant="outlined" color="secondary" size="small" sx={{ minWidth: 0, px: 1 }}><MuiIcon name="message" size={12}/></Button>
              <Button variant="outlined" color="secondary" size="small" sx={{ minWidth: 0, px: 1 }}><MuiIcon name="phone" size={12}/></Button>
              <Button variant="contained" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>New trip</Button>
            </Stack>
          </Stack>
          <Tabs value={tab} variant="scrollable" scrollButtons={false} sx={{ px: 1.75, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
            {[{i:'overview',l:'Overview'},{i:'trips',l:'Trips · 4'},{i:'msg',l:'Messages'},{i:'docs',l:'Documents · 5'},{i:'notes',l:'Notes'},{i:'activity',l:'Activity'},{i:'admin',l:'Account admin'}].map((t) => (
              <Tab key={t.i} value={t.i} label={t.l} sx={{ minHeight: 40, py: 1, fontSize: 12.5 }}/>
            ))}
          </Tabs>
          <Box sx={{ flex: 1, overflow: 'auto', p: 2.25 }}>{children}</Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.3.1 Client List / Roster (full-page version)
function A331_ClientList() {
  const { Box, Stack, Card, Typography, TextField, InputAdornment, Chip, Avatar, Button, IconButton, Checkbox, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={20} scrollable>
      <MuiScreenHeader title="Clients · roster" subtitle="68 active · 14 in motion · 4 leads to qualify."
                       actions={<>
                         <Button variant="outlined" size="small" startIcon={<MuiIcon name="filter" size={12}/>}>Filters</Button>
                         <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>New client</Button>
                       </>} small/>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
        <TextField size="small" placeholder="Search by name, email, trip…"
                   slotProps={{ input: { readOnly: true, startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={14}/></InputAdornment> } }}
                   sx={{ flex: 1, '& .MuiInputBase-root': { bgcolor: 'surface.3' } }}/>
        {['Active','VIP','Honeymoon','Family','Lead','Archived'].map((t, i) => (
          i === 0 ? <Chip key={t} color="secondary" onClick={noop} label={t}/> : <Chip key={t} variant="outlined" onClick={noop} label={t}/>
        ))}
      </Stack>
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox size="small"/></TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Last trip</TableCell>
                <TableCell>Next trip</TableCell>
                <TableCell align="right">Lifetime $</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell/>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                { n: 'Jordan & Sam Hayes', e: 'jordan.hayes@example.com', last: 'Symphony · Mar 25', next: 'Sandals · Aug 26', val: 18640, tags: ['VIP','Honeymoon'], a: 'avatarC' },
                { n: 'Maya & Daniel Carter', e: 'maya@example.com', last: 'Turks · Apr 25', next: 'Sandals · Jul 26', val: 14820, tags: ['VIP'], a: 'avatarA' },
                { n: 'Westbrook family', e: 'wfam@example.com', last: 'Atlantis · Apr 26', next: 'Symphony · Dec 26', val: 9120, tags: ['Family'], a: 'avatarB' },
                { n: 'Aisha Patel', e: 'aisha.patel@example.com', last: '—', next: 'Princess · May 26', val: 3200, tags: ['New'], a: 'avatarE' },
                { n: 'Reggie & Marc', e: 'reggie@example.com', last: 'Sandals · Aug 25', next: 'Now · St Lucia', val: 5800, tags: ['Traveling'], a: 'avatarF' },
                { n: 'Linda Gomez', e: 'gomez.lj@example.com', last: '—', next: '—', val: 0, tags: ['Lead'], a: 'avatarA' },
              ].map((r, i) => (
                <TableRow key={i} hover>
                  <TableCell padding="checkbox"><Checkbox size="small"/></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                      <Avatar src={staImg(r.a, 64, 64)} sx={{ width: 32, height: 32 }}/>
                      <Box>
                        <Typography variant="subtitle2">{r.n}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.e}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{r.last}</TableCell>
                  <TableCell>{r.next}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700 }}>{r.val ? `$${r.val.toLocaleString()}` : '—'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {r.tags.map((t) => <Chip key={t} size="small" variant="outlined" label={t} sx={{ height: 20, fontSize: 10.5 }}/>)}
                    </Stack>
                  </TableCell>
                  <TableCell align="right"><IconButton size="small"><MuiIcon name="more_vert" size={14}/></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.3.2 Client Detail / Profile (wrapper, defaults to Overview tab)
function A332_ClientDetail() {
  const { Box, Stack, Grid, Card, CardContent, Typography, Button, Chip, Avatar, AvatarGroup } = MUI;
  return (
    <CRMShell tab="overview">
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 1.75 }}>
        <Box>
          <Card sx={{ mb: 1.5 }}>
            <CardContent>
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <Typography variant="h5">Snapshot</Typography>
                <Button variant="text" size="small" sx={{ ml: 'auto' }}>Edit</Button>
              </Stack>
              <Grid container rowSpacing={1.25} columnSpacing={2.25} sx={{ mt: 1 }}>
                {[
                  { l: 'Phone', v: '+1 (305) 555-0184' },
                  { l: 'Email', v: 'jordan.hayes@example.com' },
                  { l: 'Address', v: '1240 Brickell Bay Dr, Miami' },
                  { l: 'Birthdays', v: 'Jordan · Apr 22 · Sam · Nov 3' },
                  { l: 'Anniversary', v: 'Sep 14 (surprise flag)' },
                  { l: 'Frequent flyer', v: 'AAdvantage Platinum' },
                ].map((kv) => (
                  <Grid key={kv.l} size={6}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{kv.l}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.25 }}>{kv.v}</Typography>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Typography variant="h5" sx={{ mb: 1 }}>Preferences</Typography>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {['Caribbean','Bahamas','All-inclusive','Honeymoon','Adults-only','Pescatarian (Sam)','Anniversary surprise OK'].map((t) => <Chip key={t} variant="outlined" label={t}/>)}
              </Stack>
            </CardContent>
          </Card>
        </Box>
        <Stack component="aside" spacing={1.5}>
          <Grid container spacing={1}>
            {[{ l: 'Lifetime $', v: '$18,640' }, { l: 'Trips', v: '3 · 1 active' }, { l: 'Commission', v: '$2,610' }, { l: 'Last contact', v: '2h ago' }].map((k) => (
              <Grid key={k.l} size={6}>
                <Card>
                  <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{k.l}</Typography>
                    <Typography variant="subtitle1" sx={{ mt: 0.25, lineHeight: 1.3 }}>{k.v}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Household</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                <AvatarGroup sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12 } }}>
                  {['avatarC','avatarF','avatarD'].map((a, i) => <Avatar key={i} src={staImg(a, 48, 48)}/>)}
                </AvatarGroup>
                <Typography variant="caption" color="text.secondary">Sam (spouse) · Ava (child)</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </CRMShell>
  );
}

// 3.3.3 Overview tab is the same as detail above; we still expose it for completeness.
function A333_OverviewTab() { return <A332_ClientDetail/>; }

// 3.3.4 Trips tab
function A334_TripsTab() {
  const { Box, Stack, Card, CardMedia, Typography, Button, Chip } = MUI;
  const noop = () => {};
  return (
    <CRMShell tab="trips">
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25, alignItems: 'center' }}>
        {['Active · 1','Past · 3','Cancelled · 0'].map((t, i) => (
          i === 0 ? <Chip key={t} color="secondary" onClick={noop} label={t}/> : <Chip key={t} variant="outlined" onClick={noop} label={t}/>
        ))}
        <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12}/>} sx={{ ml: 'auto !important' }}>New trip for client</Button>
      </Stack>
      {[
        { i: 'overwater', t: 'Sandals Royal Bahamian · Honeymoon', d: 'Aug 12 – 19, 2026', v: 6480, c: 970, s: 'Booked', stat: 'booked' },
        { i: 'cruiseShip', t: 'Royal Caribbean · Symphony', d: 'Mar 4 – 11, 2025', v: 5240, c: 685, s: 'Past', stat: 'past' },
        { i: 'turks', t: 'Beaches T&C · Family', d: 'Jan 6 – 13, 2024', v: 6920, c: 955, s: 'Past', stat: 'past' },
      ].map((r, i) => (
        <Card key={i} sx={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', alignItems: 'center', mb: 1 }}>
          <CardMedia component="img" image={staImg(r.i, 220, 140)} alt="" sx={{ width: '100%', height: 80, objectFit: 'cover' }}/>
          <Box sx={{ px: 1.75, py: 1.25 }}>
            <Typography variant="subtitle2">{r.t}</Typography>
            <Typography variant="caption" color="text.secondary">{r.d}</Typography>
          </Box>
          <Box sx={{ px: 1.75, textAlign: 'right' }}>
            <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>${r.v.toLocaleString()}</Typography>
            <Typography variant="caption" color="text.secondary">Comm ${r.c}</Typography>
          </Box>
          <Box sx={{ px: 1.75 }}><MuiStaStatus kind={r.stat}>{r.s}</MuiStaStatus></Box>
        </Card>
      ))}
    </CRMShell>
  );
}

// 3.3.5 Messages tab
function A335_MessagesTab() {
  const { Box, Stack, Card, CardContent, Typography, Button, Chip } = MUI;
  return (
    <CRMShell tab="msg">
      <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
        {[
          { sub: 'Sandals upgrade locked in', last: 'Yes please. Sam will lose it 😍', t: '2h', unread: 2 },
          { sub: 'New family cruise idea', last: 'Sounds great — send the details!', t: 'Tue', unread: 0 },
          { sub: 'Welcome to Story-Tail', last: 'Thanks for getting me set up', t: 'Mar 14', unread: 0 },
        ].map((m, i) => (
          <Card key={i} sx={{ alignSelf: 'stretch' }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box sx={{ display: 'inline-flex', color: 'primary.main' }}><Icon name="message" size={16}/></Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">{m.sub}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.last}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">{m.t}</Typography>
                {m.unread > 0 && <Chip size="small" color="brand" label={m.unread} sx={{ height: 20, fontWeight: 700 }}/>}
              </Stack>
            </CardContent>
          </Card>
        ))}
        <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>New thread</Button>
      </Stack>
    </CRMShell>
  );
}

// 3.3.6 Documents tab
function A336_DocumentsTab() {
  const { Box, Stack, Grid, Card, CardContent, Typography, IconButton, Chip, Avatar } = MUI;
  const noop = () => {};
  return (
    <CRMShell tab="docs">
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
        {['All · 5','Passport','Insurance','Confirmations'].map((t, i) => (
          i === 0 ? <Chip key={t} color="secondary" onClick={noop} label={t}/> : <Chip key={t} variant="outlined" onClick={noop} label={t}/>
        ))}
      </Stack>
      <Grid container spacing={1.25}>
        {[
          { n: 'passport-jordan.jpg', s: 'Jordan · exp 08/29', i: 'IMG' },
          { n: 'passport-sam.jpg', s: 'Sam · exp 02/27 · warn', i: 'IMG' },
          { n: 'sandals-confirmation.pdf', s: 'Sandals · Aug 2026', i: 'PDF' },
          { n: 'allianz-policy.pdf', s: 'Insurance · active', i: 'PDF' },
          { n: 'global-entry.pdf', s: 'Jordan · exp 09/26', i: 'PDF' },
        ].map((d) => (
          <Grid key={d.n} size={4}>
            <Card>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Avatar variant="rounded" sx={{ width: 36, height: 44, fontSize: 9, fontWeight: 800,
                                                 bgcolor: d.i === 'PDF' ? 'primary.main' : 'brand.main',
                                                 color: d.i === 'PDF' ? 'primary.contrastText' : 'brand.contrastText' }}>{d.i}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap sx={{ fontSize: 12.5 }}>{d.n}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.s}</Typography>
                  </Box>
                  <IconButton size="small"><MuiIcon name="download" size={14}/></IconButton>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </CRMShell>
  );
}

// 3.3.7 Notes tab (internal)
function A337_NotesTab() {
  const { Stack, Card, CardContent, Paper, Typography, TextField, Button } = MUI;
  return (
    <CRMShell tab="notes">
      <Card>
        <CardContent>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>NEW NOTE · INTERNAL ONLY</Typography>
          <TextField fullWidth size="small" multiline minRows={3} placeholder="Internal note (client doesn't see this)…" sx={{ mt: 0.75 }}/>
          <Button variant="outlined" color="secondary" size="small" sx={{ mt: 1 }}>Save note</Button>
        </CardContent>
      </Card>
      <Stack spacing={1} sx={{ mt: 1.75 }}>
        {[
          { d: 'May 12 · 2:14p', a: 'Gyasi', n: 'Jordan asked about Greece for 2027 — Sandals competitor? Save for fall outreach.' },
          { d: 'Apr 02 · 11:30a', a: 'Gyasi', n: "Sam's mom paid the deposit on the Symphony trip — check refund routing if cancelled." },
          { d: 'Mar 14 · 9:14a', a: 'Gyasi', n: 'Anniversary couple. Sep 14. Surprise flag set.' },
        ].map((n, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.75, bgcolor: 'surface.2' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="overline" sx={{ color: 'brand.main', lineHeight: 1.3 }}>{n.d}</Typography>
              <Typography variant="caption" color="text.secondary">· {n.a}</Typography>
            </Stack>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{n.n}</Typography>
          </Paper>
        ))}
      </Stack>
    </CRMShell>
  );
}

// 3.3.8 Activity log
function A338_ActivityLog() {
  const { Stack, Card, CardContent, Typography, Chip, Avatar } = MUI;
  const noop = () => {};
  return (
    <CRMShell tab="activity">
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
        {['All','Cards','Auth','Trips','Messages'].map((t, i) => (
          i === 0 ? <Chip key={t} color="secondary" onClick={noop} label={t}/> : <Chip key={t} variant="outlined" onClick={noop} label={t}/>
        ))}
      </Stack>
      <Stack spacing={0.75}>
        {[
          { t: '2h', a: 'Jordan signed in · Miami iPhone', i: 'user' },
          { t: '5h', a: 'Card VISA •••• 4242 used for Sandals $4,180', i: 'card' },
          { t: '1d', a: 'Replied to "Sandals upgrade" thread', i: 'message' },
          { t: '3d', a: 'Authorized VISA •••• 4242 · cap $4,598', i: 'shield' },
          { t: '12d', a: 'Sandals deposit captured · $800', i: 'card' },
          { t: '1mo', a: 'Trip "Sandals · Aug" status → Booked', i: 'check' },
        ].map((e, i) => (
          <Card key={i}>
            <CardContent sx={{ px: 1.75, py: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Avatar sx={{ width: 28, height: 28, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}><Icon name={e.i} size={13}/></Avatar>
                <Typography variant="body2" sx={{ flex: 1 }}>{e.a}</Typography>
                <Typography variant="caption" color="text.secondary">{e.t}</Typography>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </CRMShell>
  );
}

// 3.3.9 Create Client
function A339_CreateClient() {
  const { Box, Stack, Grid, Card, CardContent, Paper, Typography, TextField, Button, Chip, Switch } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <MuiScreenHeader title="New client" subtitle="Required: name + email. Everything else can be added later." small/>
      <Card sx={{ maxWidth: 760 }}>
        <CardContent>
          <Grid container spacing={1.5}>
            <Grid size={6}><TextField label="First name *" size="small" fullWidth/></Grid>
            <Grid size={6}><TextField label="Last name *" size="small" fullWidth/></Grid>
            <Grid size={12}><TextField label="Email *" size="small" fullWidth placeholder="they@example.com"/></Grid>
            <Grid size={6}><TextField label="Phone" size="small" fullWidth/></Grid>
            <Grid size={6}><TextField label="Date of birth" size="small" fullWidth/></Grid>
            <Grid size={12}><TextField label="Address" size="small" fullWidth/></Grid>
            <Grid size={6}><TextField label="Important dates · birthdays, anniversaries" size="small" fullWidth/></Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Tags</Typography>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {['Honeymoon','Family','VIP','Cruise','Returning'].map((t) => <Chip key={t} variant="outlined" label={t}/>)}
              </Stack>
            </Grid>
          </Grid>
          <Paper elevation={0} sx={{ mt: 1.75, p: 1.5, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
              <Box sx={{ display: 'inline-flex' }}><Icon name="mail" size={16}/></Box>
              <Typography variant="caption" sx={{ flex: 1 }}>Send a portal invitation with welcome template?</Typography>
              <Switch defaultChecked size="small"/>
            </Stack>
          </Paper>
          <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
            <Button variant="text">Cancel</Button>
            <Button variant="outlined" color="secondary" sx={{ ml: 'auto !important' }}>Save</Button>
            <Button variant="contained">Save &amp; create trip</Button>
          </Stack>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.3.10 Edit Client (same as Create with values prefilled)
function A3310_EditClient() {
  const { Stack, Grid, Card, CardContent, Typography, TextField, Button, Chip } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <MuiScreenHeader title="Edit · Jordan & Sam Hayes" subtitle="Email and phone changes notify the client."
                       actions={<><Button variant="text">Cancel</Button><Button variant="contained">Save</Button></>} small/>
      <Card sx={{ maxWidth: 760 }}>
        <CardContent>
          <Grid container spacing={1.5}>
            <Grid size={6}><TextField label="First name" size="small" fullWidth defaultValue="Jordan"/></Grid>
            <Grid size={6}><TextField label="Last name" size="small" fullWidth defaultValue="Hayes"/></Grid>
            <Grid size={12}><TextField label="Email" size="small" fullWidth defaultValue="jordan.hayes@example.com"/></Grid>
            <Grid size={6}><TextField label="Phone" size="small" fullWidth defaultValue="+1 (305) 555-0184"/></Grid>
            <Grid size={6}><TextField label="DOB" size="small" fullWidth defaultValue="04 / 22 / 1992"/></Grid>
            <Grid size={12}><TextField label="Address" size="small" fullWidth defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></Grid>
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Tags</Typography>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {['VIP ✓','Honeymoon ✓','Caribbean ✓','Cruise','Family'].map((t) => (
                  t.includes('✓') ? <Chip key={t} color="secondary" onClick={noop} label={t}/> : <Chip key={t} variant="outlined" label={t}/>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.3.11 Merge Clients
function A3311_MergeClients() {
  const { Box, Stack, Card, CardContent, Typography, Button, Chip, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <MuiScreenHeader title="Merge duplicate clients" subtitle="Pick which value wins per field. Audit-logged. Best done on desktop." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 1.25, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3 }}>SOURCE</Typography>
            <Typography variant="subtitle1" sx={{ mt: 0.5, lineHeight: 1.3 }}>Sam Hayes · sam@example.com</Typography>
            <Typography variant="caption" color="text.secondary">1 trip · joined Apr 2024</Typography>
          </CardContent>
        </Card>
        <Typography color="text.secondary" sx={{ alignSelf: 'center', textAlign: 'center' }}>→</Typography>
        <Card>
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3 }}>TARGET</Typography>
            <Typography variant="subtitle1" sx={{ mt: 0.5, lineHeight: 1.3 }}>Jordan & Sam Hayes · jordan.hayes@example.com</Typography>
            <Typography variant="caption" color="text.secondary">3 trips · joined Mar 2024</Typography>
          </CardContent>
        </Card>
      </Box>
      <Card sx={{ mt: 1.75, maxWidth: 1080 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Field</TableCell><TableCell align="center">Source</TableCell><TableCell align="center">Target</TableCell><TableCell align="center">Winner</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                { f: 'Email', s: 'sam@example.com', t: 'jordan.hayes@example.com', w: 't' },
                { f: 'Phone', s: '305-555-0186', t: '305-555-0184', w: 'b' },
                { f: 'Address', s: '(blank)', t: '1240 Brickell Bay Dr…', w: 't' },
                { f: 'DOB', s: '11/03/1990', t: '04/22/1992', w: 'b' },
                { f: 'Tags', s: 'Cruise', t: 'VIP, Honeymoon', w: 'merge' },
              ].map((r, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontWeight: 600 }}>{r.f}</TableCell>
                  <TableCell align="center" sx={{ color: r.w === 's' ? 'text.primary' : 'text.secondary' }}>{r.s}</TableCell>
                  <TableCell align="center" sx={{ color: r.w === 't' ? 'text.primary' : 'text.secondary' }}>{r.t}</TableCell>
                  <TableCell align="center">
                    <Chip size="small" sx={{ bgcolor: 'primary.container', color: 'primary.onContainer' }}
                          label={r.w === 's' ? 'Source' : r.w === 't' ? 'Target' : r.w === 'b' ? 'Both → keep target' : 'Merge'}/>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75, maxWidth: 1080 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="outlined" color="secondary" sx={{ ml: 'auto !important' }}>Preview merged record</Button>
        <Button variant="contained" startIcon={<MuiIcon name="users" size={14}/>}>Merge clients</Button>
      </Stack>
    </MuiScreenFrame>
  );
}

// 3.3.12 Archive / Restore
function A3312_Archive() {
  const { Box, Stack, Card, CardContent, Typography, TextField, Button, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Card elevation={8} sx={{ width: '100%', maxWidth: 520 }}>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Avatar sx={{ width: 40, height: 40, bgcolor: 'warning.container', color: 'text.primary' }}><Icon name="trash" size={18}/></Avatar>
              <Box>
                <Typography variant="overline" sx={{ display: 'block', color: 'warning.main', lineHeight: 1.3 }}>ARCHIVE CLIENT</Typography>
                <Typography variant="h5" component="h2">Archive Linda Gomez?</Typography>
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1.75 }}>Hides them from the active roster. Past trips and audit log remain. You can restore anytime.</Typography>
            <TextField label="Reason (optional)" size="small" fullWidth multiline minRows={2} placeholder="e.g. Cold lead · no reply for 6 months"/>
            <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
              <Button variant="outlined">Cancel</Button>
              <Button variant="outlined" color="secondary" sx={{ ml: 'auto !important' }}>Archive</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A331_ClientList, A332_ClientDetail, A333_OverviewTab, A334_TripsTab, A335_MessagesTab, A336_DocumentsTab, A337_NotesTab, A338_ActivityLog, A339_CreateClient, A3310_EditClient, A3311_MergeClients, A3312_Archive });
