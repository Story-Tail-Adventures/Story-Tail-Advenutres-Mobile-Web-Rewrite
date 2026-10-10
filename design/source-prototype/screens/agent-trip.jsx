/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.4 Trip Builder & Management — 16 screens. MUI v9 (stock look, brand theme).

// Compact horizontal row card used by itinerary/component lists in this section.
function A34_MuiRowCard({ children, sx, contentSx, ...rest }) {
  const { Card, CardContent } = MUI;
  return (
    <Card sx={sx} {...rest}>
      <CardContent sx={{ py: 1.25, px: 1.75, display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 1.25 }, ...contentSx }}>
        {children}
      </CardContent>
    </Card>
  );
}

// Square tinted icon tile (secondary container by default).
function A34_MuiIconTile({ name, size = 16, box = 34, bg = 'secondary.container', fg = 'secondary.onContainer', variant = 'rounded' }) {
  const { Avatar } = MUI;
  return (
    <Avatar variant={variant} sx={{ width: box, height: box, bgcolor: bg, color: fg }}>
      <Icon name={name} size={size} />
    </Avatar>
  );
}

function TripShell({ title, status, children, sidebar, fullbleed = false }) {
  const { Box, Stack, Typography, Button, Breadcrumbs } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Breadcrumbs separator="·" sx={{ '& .MuiBreadcrumbs-separator': { mx: 0.75 } }}>
            <Typography variant="caption" color="text.secondary">Trips</Typography>
            <Typography variant="caption" color="text.secondary">Jordan & Sam Hayes</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
          </Breadcrumbs>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{title}</Typography>
            {status}
          </Stack>
        </Box>
        <Button variant="text" startIcon={<MuiIcon name="copy" size={12} />}>Duplicate</Button>
        <Button variant="outlined" startIcon={<MuiIcon name="external" size={12} />}>Client preview</Button>
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="send" size={12} />}>Send proposal</Button>
        <Button variant="contained" startIcon={<MuiIcon name="check" size={12} />}>Mark booked</Button>
      </Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: sidebar ? '1fr 320px' : '1fr', overflow: 'hidden' }}>
        <Box sx={{ overflow: 'auto', p: fullbleed ? 0 : 2.25 }}>{children}</Box>
        {sidebar && (
          <Box component="aside" sx={{ borderLeft: 1, borderColor: 'divider', p: 2, bgcolor: 'surface.main', overflow: 'auto' }}>{sidebar}</Box>
        )}
      </Box>
    </MuiScreenFrame>
  );
}

// 3.4.1 Trip List
function A341_TripList() {
  const { Box, Stack, Chip, Card, Table, TableHead, TableBody, TableRow, TableCell, IconButton, Button } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={20} scrollable>
      <MuiScreenHeader title="Trips" subtitle="Every trip you own or assist with." actions={<><Button variant="outlined" size="small" startIcon={<MuiIcon name="filter" size={12} />}>Filter</Button><Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12} />}>New trip</Button></>} small />
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25, alignItems: 'center' }}>
        {['All · 26', 'Inquiry · 12', 'Proposal · 3', 'Booked · 9', 'Traveling · 2'].map((t, i) => (
          i === 0 ? <Chip key={t} color="secondary" label={t} onClick={() => {}} /> : <Chip key={t} variant="outlined" label={t} onClick={() => {}} />
        ))}
        <Box sx={{ ml: 'auto !important' }}><Chip variant="outlined" label="Sort · Departure ▾" /></Box>
      </Stack>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Trip</TableCell>
              <TableCell>Client</TableCell>
              <TableCell>Travel</TableCell>
              <TableCell>Stage</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell align="right">Comm</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { t: 'Sandals · honeymoon', c: 'Jordan & Sam Hayes', tr: 'Aug 12 – 19, 2026', s: 'Booked', tone: 'booked', v: 6480, comm: 970 },
              { t: 'Symphony · family', c: 'Westbrook family', tr: 'Dec 22 – 29, 2026', s: 'Proposal', tone: 'proposal', v: 9120, comm: 1094 },
              { t: 'Atlantis weekend', c: 'Aisha Patel', tr: 'May 24 – 27, 2026', s: 'Booked', tone: 'booked', v: 3200, comm: 384 },
              { t: 'St. Lucia honeymoon', c: 'Reggie & Marc', tr: 'Now · May 18 – 23', s: 'Traveling', tone: 'traveling', v: 5800, comm: 870 },
              { t: 'Negril family week', c: 'Khan family', tr: 'Aug 2 – 9, 2026', s: 'Inquiry', tone: 'lead', v: 7200, comm: 936 },
              { t: 'Aruba honeymoon', c: 'Tasha Whitfield', tr: 'Oct 12 – 19, 2026', s: 'Inquiry', tone: 'lead', v: 3800, comm: 494 },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontWeight: 600 }}>{r.t}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.c}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.tr}</TableCell>
                <TableCell><MuiStaStatus kind={r.tone}>{r.s}</MuiStaStatus></TableCell>
                <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700 }}>${r.v.toLocaleString()}</TableCell>
                <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, color: 'primary.main' }}>${r.comm.toLocaleString()}</TableCell>
                <TableCell padding="checkbox"><IconButton size="small"><MuiIcon name="more_vert" size={14} /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.4.2 Trip Detail (agent view)
function A342_TripDetail() {
  const { Box, Stack, Typography, Card, CardContent, CardMedia, Chip, IconButton } = MUI;
  return (
    <TripShell
      title="Sandals Royal Bahamian honeymoon"
      status={<><MuiStaStatus kind="booked">Booked</MuiStaStatus><MuiStaStatus kind="proposal">Final balance pending</MuiStaStatus></>}
      sidebar={
        <>
          <Card sx={{ mb: 1.25 }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="subtitle1">Cost & commission</Typography>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="text.secondary">Client total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>$6,480</Typography>
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Rate · Sandals</Typography>
                <Typography variant="body2">15%</Typography>
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75, color: 'primary.main' }}>
                <Typography variant="h6">Commission</Typography>
                <Typography variant="h6">$970</Typography>
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="subtitle1">Payments</Typography>
              {[{ l: 'Deposit · paid', v: '$800', t: 'good' }, { l: 'Mid · paid', v: '$1,500', t: 'good' }, { l: 'Final · May 28', v: '$4,180', t: 'warn' }].map((s) => (
                <Stack key={s.l} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.t === 'good' ? 'success.main' : 'error.main', flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1 }}>{s.l}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 12 }}>{s.v}</Typography>
                </Stack>
              ))}
            </CardContent>
          </Card>
        </>
      }
    >
      <Card sx={{ mb: 1.75 }}>
        <CardMedia component="img" image={staImg('overwater', 1400, 220)} alt="" sx={{ height: 130, objectFit: 'cover' }} />
        <CardContent sx={{ p: 1.75, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1.5, '&:last-child': { pb: 1.75 } }}>
          {[
            { l: 'Trip type', v: 'Honeymoon · 7 nights' },
            { l: 'Destination', v: 'Nassau, Bahamas' },
            { l: 'Travelers', v: 'Jordan + Sam Hayes' },
            { l: 'Dates', v: 'Aug 12 – 19, 2026' },
            { l: 'Booking source', v: 'Inteletravel · Sandals' },
            { l: 'Card on file', v: 'VISA •••• 4242 · $4,598 cap' },
            { l: 'Status', v: 'Booked · final balance pending' },
            { l: 'Last activity', v: '2h ago · Jordan replied' },
          ].map((k) => (
            <Box key={k.l}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{k.l}</Typography>
              <Typography variant="body2" sx={{ mt: 0.25 }}>{k.v}</Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1.25 }}>
        <Typography variant="h5">Itinerary</Typography>
        <Chip variant="outlined" size="small" label="6 components" />
        <Chip variant="outlined" size="small" label="2 manual · 4 API" />
      </Stack>
      <Stack spacing={0.75}>
        {[
          { k: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Aug 12 · Direct · seats 14A 14B', src: 'Amadeus', c: 460 },
          { k: 'trip', t: 'Private transfer · Mercedes Vito', s: 'Sun & Fun · 25 min', src: 'Manual', c: 180 },
          { k: 'building', t: 'Sandals Royal Bahamian', s: 'Honeymoon Beachfront Walkout · 7n', src: 'Hotelbeds', c: 4980 },
          { k: 'sparkle', t: 'Rose Island Cay snorkel', s: 'Aug 14 · Catamaran for 2', src: 'Viator', c: 280 },
          { k: 'heart', t: 'Red Lane spa · couples', s: 'Aug 13 · 90 min · included', src: 'Manual', c: 0 },
          { k: 'plane', t: 'AA 1410 · NAS → MIA', s: 'Aug 19 · Direct', src: 'Amadeus', c: 460 },
        ].map((c, i) => (
          <A34_MuiRowCard key={i}>
            <MuiIcon name="more_vert" size={14} sx={{ color: 'text.secondary' }} />
            <A34_MuiIconTile name={c.k} size={16} box={34} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{c.t}</Typography>
              <Typography variant="caption" color="text.secondary">{c.s}</Typography>
            </Box>
            <Chip size="small" variant="outlined" label={c.src} sx={{ fontFamily: (t) => t.typography.mono, fontSize: 11, height: 20 }} />
            <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 12, minWidth: 70, textAlign: 'right' }}>${c.c.toLocaleString()}</Typography>
            <IconButton size="small"><MuiIcon name="more_vert" size={14} /></IconButton>
          </A34_MuiRowCard>
        ))}
      </Stack>
    </TripShell>
  );
}

// 3.4.3 Create New Trip — Type Selector
function A343_NewTripType() {
  const { Stack, Grid, Typography, Card, CardContent, CardActionArea, TextField, Button } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader title="New trip · pick a type" subtitle="Templates speed up repeat trip types. You can always customize from there." small />
      <Grid container spacing={1.5} sx={{ maxWidth: 960 }}>
        {[
          { i: 'building', t: 'All-inclusive resort', s: 'Sandals, Beaches, Couples', count: '12 templates' },
          { i: 'ship', t: 'Cruise', s: 'Royal Caribbean, Princess, Carnival', count: '7 templates' },
          { i: 'plane', t: 'Multi-destination', s: 'City + beach, multi-stop', count: '3 templates' },
          { i: 'users', t: 'Group trip', s: 'Up to 24 travelers', count: '2 templates' },
          { i: 'heart', t: 'Honeymoon', s: 'Adults-only, surprise nods', count: '5 templates' },
          { i: 'sparkle', t: 'Custom / blank', s: 'Start from zero', count: 'Blank slate' },
        ].map((c, i) => (
          <Grid key={c.t} size={4}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: i === 0 ? 'primary.main' : 'divider', borderWidth: i === 0 ? 1.5 : 1 }}>
              <CardActionArea sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.25 }}>
                  <A34_MuiIconTile name={c.i} size={20} box={40}
                    bg={i === 0 ? 'primary.main' : 'primary.container'} fg={i === 0 ? 'primary.contrastText' : 'primary.onContainer'} />
                  <Typography variant="h5" sx={{ mt: 1.5, mb: 0.5 }}>{c.t}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{c.s}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, mt: 1.25 }}>{c.count}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Card sx={{ mt: 2.25, maxWidth: 960 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1">Or attach to a client first</Typography>
          <Stack direction="row" spacing={1.25} sx={{ mt: 1, alignItems: 'center' }}>
            <TextField size="small" placeholder="Search clients to attach…" sx={{ flex: 1 }} />
            <Button variant="outlined" color="secondary" size="small">Pick later</Button>
            <Button variant="contained" endIcon={<MuiIcon name="arrow_right" size={12} />}>Continue</Button>
          </Stack>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.4.4 Trip Builder Workspace
function A344_TripBuilder() {
  const { Box, Stack, Grid, Typography, Button, IconButton, Card, CardContent, TextField, List, ListItemButton, ListItemAvatar, ListItemText } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Trip builder · Jordan & Sam Hayes</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Sandals honeymoon · Aug 2026</Typography>
        </Box>
        <Button variant="text">Auto-save · just now</Button>
        <Button variant="outlined" color="secondary">Preview proposal</Button>
        <Button variant="contained">Send to client</Button>
      </Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 320px', overflow: 'hidden' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.75 }}>ADD COMPONENT</Typography>
          <List dense disablePadding>
            {[
              { i: 'plane', l: 'Flight · Amadeus' }, { i: 'building', l: 'Hotel · Hotelbeds' }, { i: 'ship', l: 'Cruise · Widgety' },
              { i: 'sparkle', l: 'Tour · Viator' }, { i: 'trip', l: 'Transfer · manual' }, { i: 'utensils', l: 'Dining · manual' },
              { i: 'shield', l: 'Insurance · Allianz' }, { i: 'receipt', l: 'Other · manual' },
            ].map((c) => (
              <ListItemButton key={c.l} sx={{ borderRadius: 1, px: 1.5, mb: 0.5 }}>
                <ListItemAvatar sx={{ minWidth: 36 }}><A34_MuiIconTile name={c.i} size={14} box={28} /></ListItemAvatar>
                <ListItemText primary={c.l} slotProps={{ primary: { variant: 'caption' } }} />
                <MuiIcon name="plus" size={12} sx={{ color: 'text.secondary' }} />
              </ListItemButton>
            ))}
          </List>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mt: 1.75, mb: 0.75 }}>TEMPLATES</Typography>
          <Stack spacing={0.5}>
            {['Sandals honeymoon · 7n', 'Family cruise · 7n EC', 'Atlantis weekend'].map((t) => (
              <A34_MuiRowCard key={t} contentSx={{ py: 1, px: 1.5, gap: 1, '&:last-child': { pb: 1 } }}>
                <MuiIcon name="bookmark" size={12} sx={{ color: 'brand.main' }} />
                <Typography variant="caption" sx={{ flex: 1 }}>{t}</Typography>
                <IconButton size="small" sx={{ p: 0.25 }}><MuiIcon name="plus" size={12} /></IconButton>
              </A34_MuiRowCard>
            ))}
          </Stack>
        </Box>
        <Box sx={{ overflow: 'auto', p: 2.25 }}>
          {['Day 1 · Arrival', 'Day 2 · Beach', 'Day 3 · Cay day-trip'].map((d, di) => (
            <Box key={d} sx={{ mb: 2 }}>
              <Typography variant="script" sx={{ display: 'block', color: 'primary.main', fontSize: 26, lineHeight: 1, mb: 0.5 }}>{d.split(' ·')[0]}</Typography>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>{d.split(' ·')[1]}</Typography>
              <Stack spacing={0.75} sx={{ mb: 0.75 }}>
                {(di === 0 ? [{ k: 'plane', t: 'AA 1413 · MIA → NAS', s: '06:40 · Direct' }, { k: 'building', t: 'Check-in · Sandals', s: 'Beachfront Walkout' }] : di === 1 ? [{ k: 'heart', t: 'Spa · couples', s: '15:30 · 90 min' }] : [{ k: 'sparkle', t: 'Rose Island Cay snorkel', s: '9:00 · 6 hrs' }]).map((c, i) => (
                  <A34_MuiRowCard key={i} variant="outlined" sx={{ borderStyle: 'dashed', borderColor: 'outline.main' }}>
                    <MuiIcon name="more_vert" size={12} sx={{ color: 'text.secondary' }} />
                    <A34_MuiIconTile name={c.k} size={13} box={28} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2">{c.t}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.s}</Typography>
                    </Box>
                    <IconButton size="small" sx={{ p: 0.25 }}><MuiIcon name="edit" size={12} /></IconButton>
                  </A34_MuiRowCard>
                ))}
              </Stack>
              <Button variant="text" size="small">+ Add to Day {di + 1}</Button>
            </Box>
          ))}
        </Box>
        <Box component="aside" sx={{ borderLeft: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.75 }}>SELECTED · CHECK-IN SANDALS</Typography>
          <Card sx={{ mb: 1.25 }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack spacing={1}>
                <TextField label="Supplier" size="small" fullWidth defaultValue="Sandals Royal Bahamian" />
                <TextField label="Room type" size="small" fullWidth defaultValue="Honeymoon Beachfront Walkout" />
                <Grid container spacing={1}>
                  <Grid size={6}><TextField label="Check-in" size="small" fullWidth defaultValue="Aug 12 · 1:00p" /></Grid>
                  <Grid size={6}><TextField label="Check-out" size="small" fullWidth defaultValue="Aug 19 · 11:00a" /></Grid>
                </Grid>
                <Grid container spacing={1}>
                  <Grid size={6}><TextField label="Cost" size="small" fullWidth defaultValue="$4,980" sx={{ '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } }} /></Grid>
                  <Grid size={6}><TextField label="Comm %" size="small" fullWidth defaultValue="15%" /></Grid>
                </Grid>
                <TextField label="Confirmation #" size="small" fullWidth defaultValue="SRB-220119" sx={{ '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } }} />
              </Stack>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ bgcolor: 'surface.2' }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>SOURCE · HOTELBEDS</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Live · last refreshed 14 min ago</Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.4.5–3.4.10 are component add/edit screens — render as a single common pattern, parametrized.
function CompModal({ icon, kind, fields, search }) {
  const { Box, Stack, Grid, Typography, Card, CardContent, Button, IconButton, TextField, InputAdornment } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Card sx={{ width: '100%', maxWidth: 720 }}>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
              <A34_MuiIconTile name={icon} size={18} box={40} bg="primary.container" fg="primary.onContainer" />
              <Box>
                <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.3 }}>ADD COMPONENT</Typography>
                <Typography variant="h5" component="h2">{kind}</Typography>
              </Box>
              <IconButton sx={{ ml: 'auto !important' }}><MuiIcon name="close" size={18} /></IconButton>
            </Stack>
            {search && (
              <Card variant="outlined" sx={{ bgcolor: 'surface.2', mb: 1.5 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{search.label}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'center' }}>
                    <TextField
                      size="small" fullWidth defaultValue={search.value}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={14} /></InputAdornment> } }}
                      sx={{ '& .MuiInputBase-root': { bgcolor: 'background.paper' } }}
                    />
                    <Button variant="outlined" color="secondary" size="small" sx={{ flexShrink: 0 }}>Search</Button>
                  </Stack>
                  {search.results && (
                    <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                      {search.results.map((r, i) => (
                        <A34_MuiRowCard key={i} variant="outlined" sx={{ borderColor: i === 0 ? 'primary.main' : 'divider', borderWidth: i === 0 ? 1.5 : 1 }} contentSx={{ py: 1, px: 1.5, gap: 1.25, '&:last-child': { pb: 1 } }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2">{r.t}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.s}</Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 12 }}>{r.p}</Typography>
                          <Button variant="text" size="small">Add</Button>
                        </A34_MuiRowCard>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            )}
            <Grid container spacing={1.25}>
              {fields.map((f) => (
                <Grid key={f.l} size={f.full ? 12 : 6}>
                  <TextField label={f.l} size="small" fullWidth defaultValue={f.v}
                    sx={f.mono ? { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } } : undefined} />
                </Grid>
              ))}
            </Grid>
            <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
              <Button variant="text">Cancel</Button>
              <Button variant="contained" sx={{ ml: 'auto !important' }}>Add to trip</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.4.5 Add Flight
function A345_AddFlight() {
  return <CompModal icon="plane" kind="Add flight"
    search={{ label: 'Search Amadeus · MIA → NAS · Aug 12', value: 'MIA → NAS · Aug 12, 2026 · 2 pax', results: [
      { t: 'AA 1413 · MIA → NAS · 06:40 → 09:30', s: 'Nonstop · 2h 50m · Economy', p: '$462' },
      { t: 'B6 521 · MIA → NAS · 08:15 → 11:00', s: 'Nonstop · 2h 45m · Economy', p: '$388' },
    ] }}
    fields={[
      { l: 'Airline', v: 'American Airlines', full: true },
      { l: 'Flight #', v: 'AA 1413', mono: true },
      { l: 'PNR', v: 'TLR8QV', mono: true },
      { l: 'Seats', v: '14A, 14B' },
      { l: 'Cost (pp)', v: '$462', mono: true },
      { l: 'Notes', v: 'Both pax · Group 4 boarding', full: true },
    ]}
  />;
}

// 3.4.6 Add Hotel
function A346_AddHotel() {
  return <CompModal icon="building" kind="Add hotel · resort"
    search={{ label: 'Search Hotelbeds · Nassau · Aug 12 – 19', value: 'Nassau · Aug 12 – 19 · 2 adults', results: [
      { t: 'Sandals Royal Bahamian · Honeymoon Beachfront', s: 'All-inclusive · adults-only', p: '$4,980' },
      { t: 'Atlantis Paradise · Coral Tower', s: '4★ · ocean view', p: '$2,640' },
    ] }}
    fields={[
      { l: 'Property', v: 'Sandals Royal Bahamian', full: true },
      { l: 'Room type', v: 'Honeymoon Beachfront Walkout', full: true },
      { l: 'Check-in', v: 'Aug 12 · 1:00p' },
      { l: 'Check-out', v: 'Aug 19 · 11:00a' },
      { l: 'Total cost', v: '$4,980', mono: true },
      { l: 'Confirmation', v: 'SRB-220119', mono: true },
    ]}
  />;
}

// 3.4.7 Add Cruise
function A347_AddCruise() {
  return <CompModal icon="ship" kind="Add cruise"
    search={{ label: 'Widgety cruise content · Dec 22 – 29', value: 'Eastern Caribbean · 7-day · 4 pax', results: [
      { t: 'Royal Caribbean Symphony · Dec 22', s: '7-day EC · CocoCay · 2 ports', p: '$1,850' },
    ] }}
    fields={[
      { l: 'Line', v: 'Royal Caribbean', full: true },
      { l: 'Ship', v: 'Symphony of the Seas' },
      { l: 'Itinerary', v: 'Eastern Caribbean · 7-day' },
      { l: 'Sail date', v: 'Dec 22, 2026' },
      { l: 'Return', v: 'Dec 29, 2026' },
      { l: 'Cabin', v: 'Balcony · 7430' },
      { l: 'Booking #', v: 'RCL-99421', mono: true },
      { l: 'Total cost', v: '$9,120', mono: true },
    ]}
  />;
}

// 3.4.8 Add Tour
function A348_AddTour() {
  return <CompModal icon="sparkle" kind="Add tour · activity"
    search={{ label: 'Search Viator · Nassau · half-day', value: 'Nassau · Aug 14 · snorkel', results: [
      { t: 'Rose Island Cay snorkel · catamaran', s: '6 hrs · lunch + gear', p: '$140 / pax' },
      { t: 'Atlantis dolphin encounter', s: '2 hrs · 1 swim', p: '$220 / pax' },
    ] }}
    fields={[
      { l: 'Tour name', v: 'Rose Island Cay snorkel', full: true },
      { l: 'Date', v: 'Aug 14, 2026' },
      { l: 'Start time', v: '9:00 AM' },
      { l: 'Duration', v: '6 hours' },
      { l: 'Travelers', v: '2 adults' },
      { l: 'Cost (pp)', v: '$140', mono: true },
      { l: 'Confirmation', v: 'VIA-882211', mono: true },
    ]}
  />;
}

// 3.4.9 Add Transfer
function A349_AddTransfer() {
  return <CompModal icon="trip" kind="Add transfer"
    fields={[
      { l: 'Operator', v: 'Sun & Fun Tours', full: true },
      { l: 'Pickup', v: 'Lynden Pindling Intl (NAS)' },
      { l: 'Drop-off', v: 'Sandals Royal Bahamian' },
      { l: 'Date / time', v: 'Aug 12 · 11:20 AM' },
      { l: 'Vehicle', v: 'Mercedes Vito · private' },
      { l: 'Cost', v: '$180', mono: true },
      { l: 'Confirmation', v: 'STT-1133', mono: true },
    ]}
  />;
}

// 3.4.10 Add Dining
function A3410_AddDining() {
  return <CompModal icon="utensils" kind="Add dining reservation"
    fields={[
      { l: 'Restaurant', v: 'Bayside · Sandals Royal', full: true },
      { l: 'Date', v: 'Aug 12, 2026' },
      { l: 'Time', v: '7:30 PM' },
      { l: 'Party size', v: '2' },
      { l: 'Reserved by', v: 'Concierge' },
      { l: 'Notes', v: '4-course welcome menu · Sam pescatarian', full: true },
    ]}
  />;
}

// 3.4.11 Add Insurance
function A3411_AddInsurance() {
  return <CompModal icon="shield" kind="Add travel insurance"
    fields={[
      { l: 'Provider', v: 'Allianz Travel', full: true },
      { l: 'Policy #', v: '987124', mono: true },
      { l: 'Plan', v: 'Classic · trip protection' },
      { l: 'Coverage', v: '$6,480 trip cost' },
      { l: 'Premium', v: '$284', mono: true },
      { l: 'Effective', v: 'Mar 14, 2026 – Aug 26, 2026', full: true },
    ]}
  />;
}

// 3.4.12 Add Other / Manual
function A3412_AddOther() {
  return <CompModal icon="receipt" kind="Add other component"
    fields={[
      { l: 'Description', v: 'Welcome bottle of bubbly · in-room', full: true },
      { l: 'Supplier', v: 'Sandals · concierge' },
      { l: 'Cost', v: '$45', mono: true },
      { l: 'Date', v: 'Aug 12, 2026' },
      { l: 'Notes', v: 'Anniversary nod · do not bill to client', full: true },
    ]}
  />;
}

// 3.4.13 Trip Template Library
function A3413_TemplateLibrary() {
  const { Stack, Grid, Typography, Card, CardMedia, CardContent, Chip, Button } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={20} scrollable>
      <MuiScreenHeader title="Trip template library" subtitle="Reusable starting points for repeat trip types. Web-only editing at MVP." actions={<Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12} />}>New template</Button>} small />
      <Grid container spacing={1.5}>
        {[
          { i: 'overwater', t: 'Sandals honeymoon · 7n', s: 'Bungalow + spa + cay day-trip', uses: 14, c: '$6,480' },
          { i: 'cruiseShip', t: 'Royal Caribbean · family 7n EC', s: 'Cabin + CocoCay + dining', uses: 9, c: '$5,240' },
          { i: 'bahamas', t: 'Atlantis weekend', s: '4n · pool · dolphin add-on', uses: 6, c: '$3,180' },
          { i: 'jamaica', t: 'Couples Negril · 5n', s: 'AI · cliff tours', uses: 4, c: '$2,110' },
          { i: 'turks', t: 'Beaches T&C · family week', s: 'Sesame · kids stay free', uses: 4, c: '$6,920' },
          { i: 'aruba', t: 'Aruba sunset · 5n', s: 'Beachfront · spa', uses: 2, c: '$2,840' },
        ].map((t) => (
          <Grid key={t.t} size={4}>
            <Card>
              <CardMedia component="img" image={staImg(t.i, 400, 200)} alt="" sx={{ height: 110, objectFit: 'cover' }} />
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="subtitle1">{t.t}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t.s}</Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1 }}>
                  <Chip size="small" variant="outlined" label={`${t.uses}× used`} />
                  <Chip size="small" variant="outlined" label={t.c} />
                  <Button variant="outlined" color="secondary" size="small" sx={{ ml: 'auto !important' }}>Use</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </MuiScreenFrame>
  );
}

// 3.4.14 Itinerary Editor
function A3414_ItineraryEditor() {
  const { Box, Stack, Typography, Button, IconButton, Card, CardContent, Paper, TextField, List, ListItemButton, ListItemText } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ px: 3.5, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Itinerary editor · Sandals · Aug 12 – 19</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Day-by-day editor</Typography>
        </Box>
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="sparkle" size={12} />}>Auto-generate from components</Button>
        <Button variant="contained">Publish update</Button>
      </Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 320px', overflow: 'hidden' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 1.25, overflow: 'auto', bgcolor: 'surface.main' }}>
          <List dense disablePadding>
            {['Day 1 · Arrival', 'Day 2 · Beach', 'Day 3 · Cay', 'Day 4 · Resort', 'Day 5 · Spa', 'Day 6 · Snorkel', 'Day 7 · Pool', 'Departure'].map((d, i) => (
              <ListItemButton key={d} selected={i === 0} sx={{ borderRadius: 1, mb: 0.25, py: 0.75 }}>
                <ListItemText primary={d} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600, fontSize: 12 } } }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Box sx={{ overflow: 'auto', p: 2.25 }}>
          <Typography variant="script" sx={{ display: 'block', color: 'primary.main', fontSize: 32, lineHeight: 1 }}>Day 01</Typography>
          <TextField variant="standard" fullWidth defaultValue="Miami → Nassau" sx={{ mt: 0.5, '& .MuiInputBase-input': { fontWeight: 700, fontSize: 20, lineHeight: 1.2 } }} />
          <TextField fullWidth multiline minRows={2} size="small" defaultValue="Arrival & sunset welcome dinner — easy day, get oriented, drinks on the beach." sx={{ mt: 1 }} />
          <Typography variant="subtitle1" sx={{ mt: 1.75 }}>Time blocks</Typography>
          {[
            { p: 'MORNING', t: '06:40 · AA 1413 · MIA → NAS', tip: 'Group 4 boarding · arrive 5:30a' },
            { p: 'AFTERNOON', t: '13:00 · Check-in · Sandals', tip: 'Honeymoon walkout · request building 3' },
            { p: 'EVENING', t: '19:30 · Welcome dinner · Bayside', tip: 'Reserved for 2 · pescatarian flag for Sam' },
          ].map((b, i) => (
            <Card key={i} sx={{ mt: 1 }}>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="overline" sx={{ color: 'brand.main', lineHeight: 1.3, flexShrink: 0 }}>{b.p}</Typography>
                  <TextField variant="standard" fullWidth defaultValue={b.t} sx={{ flex: 1, '& .MuiInputBase-input': { fontWeight: 600, fontSize: 14 } }} />
                  <IconButton size="small"><MuiIcon name="more_vert" size={14} /></IconButton>
                </Stack>
                <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, px: 1, py: 0.5, bgcolor: 'tertiary.container', color: 'tertiary.onContainer' }}>
                  <Typography variant="overline" sx={{ flexShrink: 0, lineHeight: 1.3 }}>GYASI'S TIP</Typography>
                  <TextField variant="standard" fullWidth defaultValue={b.tip}
                    slotProps={{ input: { disableUnderline: true } }}
                    sx={{ flex: 1, '& .MuiInputBase-input': { fontWeight: 500, fontSize: 12, color: 'inherit', py: 0.25 } }} />
                </Paper>
              </CardContent>
            </Card>
          ))}
        </Box>
        <Box component="aside" sx={{ borderLeft: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>VISIBLE TO CLIENT</Typography>
          <Paper elevation={0} sx={{ display: 'flex', gap: 1, mt: 0.75, alignItems: 'center', p: 1.25, bgcolor: 'surface.2' }}>
            <MuiIcon name="info" size={14} /><Typography variant="caption">Changes publish on "Publish update" · client gets push.</Typography>
          </Paper>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mt: 1.75 }}>SUGGESTED NEXT</Typography>
          {['Add Day 3 snorkel from Viator', 'Confirm Bayside dinner', 'Add packing reminder for Day 2'].map((s) => (
            <A34_MuiRowCard key={s} sx={{ mt: 0.75 }} contentSx={{ p: 1.25, gap: 1, '&:last-child': { pb: 1.25 } }}>
              <MuiIcon name="sparkle" size={13} sx={{ color: 'brand.main' }} /><Typography variant="caption">{s}</Typography>
            </A34_MuiRowCard>
          ))}
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.4.15 Trip Payment Schedule
function A3415_PaymentSchedule() {
  const { Card, Table, TableHead, TableBody, TableFooter, TableRow, TableCell, Button } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader title="Payment schedule · Sandals · Aug 2026" subtitle="What's due when, to whom, from which card." actions={<Button variant="contained" size="small" startIcon={<MuiIcon name="plus" size={12} />}>Add scheduled payment</Button>} small />
      <Card sx={{ maxWidth: 1000 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Due</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Card</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { d: 'Mar 14', desc: 'Deposit', sup: 'Sandals', a: 800, c: 'VISA 4242', s: 'Paid', tone: 'booked' },
              { d: 'Apr 22', desc: 'Mid payment', sup: 'Sandals', a: 1500, c: 'VISA 4242', s: 'Paid', tone: 'booked' },
              { d: 'May 28', desc: 'Final balance', sup: 'Sandals', a: 4180, c: 'VISA 4242 · $4,598 cap', s: 'Authorized · due', tone: 'due' },
              { d: 'Aug 14', desc: 'Tour · Rose Island', sup: 'Viator', a: 280, c: 'VISA 4242', s: 'Scheduled', tone: 'proposal' },
              { d: 'Aug 12', desc: 'Transfer', sup: 'Sun & Fun', a: 180, c: 'VISA 4242', s: 'Scheduled', tone: 'proposal' },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontWeight: 600 }}>{r.d}</TableCell>
                <TableCell>{r.desc}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.sup}</TableCell>
                <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700 }}>${r.a.toLocaleString()}</TableCell>
                <TableCell sx={{ fontFamily: (t) => t.typography.mono, fontSize: 12 }}>{r.c}</TableCell>
                <TableCell><MuiStaStatus kind={r.tone}>{r.s}</MuiStaStatus></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ bgcolor: 'surface.2' }}>
              <TableCell colSpan={3} sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>Trip total</TableCell>
              <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 800, fontSize: 16, color: 'text.primary' }}>$6,940</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.4.16 Cancel / Archive Trip
function A3416_CancelTrip() {
  const { Box, Stack, Typography, Card, CardContent, Button, TextField, Checkbox, FormControlLabel } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Card sx={{ width: '100%', maxWidth: 560 }}>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
              <A34_MuiIconTile name="warning" size={18} box={40} variant="circular" bg="error.container" fg="error.onContainer" />
              <Box>
                <Typography variant="overline" sx={{ display: 'block', color: 'error.main', lineHeight: 1.3 }}>CANCEL TRIP</Typography>
                <Typography variant="h5" component="h2">Cancel Sandals · Aug 12 – 19?</Typography>
              </Box>
            </Stack>
            <Card variant="outlined" sx={{ bgcolor: 'surface.2', mt: 1 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>IMPACT</Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25, typography: 'body2', lineHeight: 1.6 }}>
                  <li>Card authorization will be revoked</li>
                  <li>Allianz policy refund subject to terms (15 day window)</li>
                  <li>Sandals cancellation fee · $120 per policy</li>
                  <li>Commission expectation removed ($970)</li>
                </Box>
              </CardContent>
            </Card>
            <TextField label="Reason" size="small" fullWidth multiline minRows={2} placeholder="Family conflict · medical · etc." sx={{ mt: 1.5 }} />
            <FormControlLabel sx={{ mt: 0.75 }} control={<Checkbox defaultChecked size="small" />}
              label={<Typography variant="body2">Notify client with cancellation template</Typography>} />
            <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
              <Button variant="outlined">Keep trip</Button>
              <Button variant="contained" color="error" sx={{ ml: 'auto !important' }}>Cancel trip</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  A341_TripList, A342_TripDetail, A343_NewTripType, A344_TripBuilder,
  A345_AddFlight, A346_AddHotel, A347_AddCruise, A348_AddTour, A349_AddTransfer,
  A3410_AddDining, A3411_AddInsurance, A3412_AddOther,
  A3413_TemplateLibrary, A3414_ItineraryEditor, A3415_PaymentSchedule, A3416_CancelTrip,
});
