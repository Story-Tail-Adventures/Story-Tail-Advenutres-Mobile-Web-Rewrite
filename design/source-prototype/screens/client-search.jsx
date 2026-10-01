/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader */
// Client · 2.3 Self-Guided Search — 10 screens. MUI v9.

// Small helpers local to this file (C23_ prefix keeps them collision-free).

// A caption-sized field label for groups of chips / switches that have no TextField.
function C23_MuiFieldLabel({ children }) {
  const { Typography } = MUI;
  return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>{children}</Typography>;
}

// Filter chips: a trailing ✓ in the label means "selected" (same convention as the legacy data).
function C23_MuiFilterChips({ items, selected }) {
  const { Stack, Chip } = MUI;
  const noop = () => {};
  const isOn = (t) => (selected ? selected(t) : t.includes('✓'));
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {items.map((t) => (
        isOn(t)
          ? <Chip key={t} label={t} color="secondary" onClick={noop} />
          : <Chip key={t} label={t} variant="outlined" onClick={noop} />
      ))}
    </Stack>
  );
}

// Inverse "tag" chip (replaces the legacy navy kbd tag on result cards).
function C23_MuiTagChip({ children }) {
  const { Chip } = MUI;
  return <Chip size="small" label={children} sx={{ bgcolor: 'text.primary', color: 'background.paper', fontWeight: 600 }} />;
}

// Rating star in the brand sunset colour.
function C23_MuiStar({ size = 11 }) {
  const { Box } = MUI;
  return (
    <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'middle', color: (t) => t.palette.brandSource.sunset }}>
      <Icon name="star" size={size} fill="currentColor" />
    </Box>
  );
}

// 2.3.1 — Search Landing / Inspiration Hub
function C231_SearchLanding() {
  const { Box, Stack, Grid, Paper, Typography, Button, Card, CardMedia } = MUI;
  return (
    <MuiScreenFrame role="client" tab="search" padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 220, overflow: 'hidden' }}>
        <Box component="img" src={staImg('bahamas', 1600, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.55), rgba(13,33,55,0.45))' }} />
        <Box sx={{ position: 'absolute', inset: 0, px: 4, py: 3.5, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3, fontWeight: 600, color: (t) => t.palette.brandSource.gold }}>DISCOVER</Typography>
          <Typography variant="h3" component="h1" sx={{ mt: 0.5, mb: 1.25, color: 'common.white' }}>Where to next, Jordan?</Typography>
          <Paper elevation={2} sx={{ display: 'flex', alignItems: 'center', maxWidth: 760 }}>
            {[{ l: 'Destination', v: 'Caribbean', i: 'map' }, { l: 'Dates', v: 'Aug 12 – 19', i: 'calendar' }, { l: 'Travelers', v: '2 adults', i: 'user' }].map((f, i) => (
              <Box key={f.l} sx={{ flex: 1, px: 2, py: 1.5, borderRight: i < 2 ? 1 : 0, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{f.l}</Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
                  <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><Icon name={f.i} size={13} /></Box>
                  <Typography variant="subtitle2">{f.v}</Typography>
                </Stack>
              </Box>
            ))}
            <Button variant="contained" startIcon={<MuiIcon name="search" size={16} />} sx={{ height: 44, m: 0.5 }}>Search</Button>
          </Paper>
        </Box>
      </Box>
      <Box sx={{ px: 3.5, pt: 2.5, pb: 3.5 }}>
        <Typography variant="h5">Curated for you</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.75 }}>Based on your saved Caribbean searches and past trips.</Typography>
        <Grid container spacing={1.25}>
          {[{ t: 'Caribbean escapes', i: 'turks' }, { t: 'Family cruises', i: 'cruiseShip' }, { t: 'All-inclusive', i: 'resortPool' }, { t: 'Honeymoons', i: 'honeymoon' }, { t: 'Adventure', i: 'snorkel' }, { t: 'Hot deals 🔥', i: 'aruba' }].map((s) => (
            <Grid key={s.t} size={2}>
              <Card sx={{ position: 'relative', overflow: 'hidden', aspectRatio: '3/4' }}>
                <CardMedia component="img" image={staImg(s.i, 320, 440)} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7))' }} />
                <Typography variant="subtitle2" sx={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: 'common.white', fontWeight: 700, lineHeight: 1.2 }}>{s.t}</Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.3.2 — Search Form
function C232_SearchForm() {
  const { Box, Stack, Grid, Card, CardContent, Button, TextField, Autocomplete, Switch, FormControlLabel } = MUI;
  const picked = ['Bahamas', 'Turks & Caicos', 'Jamaica'];
  return (
    <MuiScreenFrame role="client" tab="search" padding={28} scrollable>
      <MuiScreenHeader title="Plan a search" subtitle="Tell us what you're picturing — Gyasi sees results too and curates picks." small />
      <Card sx={{ maxWidth: 720 }}>
        <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
          <Grid container spacing={1.5}>
            <Grid size={12}>
              <Autocomplete
                multiple size="small" options={picked} defaultValue={picked}
                renderInput={(params) => <TextField {...params} label="Destination · multi-select" placeholder="+ add another…" />}
              />
            </Grid>
            <Grid size={6}>
              <C23_MuiFieldLabel>Trip type</C23_MuiFieldLabel>
              <C23_MuiFilterChips items={['All-inclusive ✓','Cruise','Tour','Custom']} />
            </Grid>
            <Grid size={6}>
              <C23_MuiFieldLabel>Flex dates</C23_MuiFieldLabel>
              <FormControlLabel control={<Switch defaultChecked />} label="±3 days" slotProps={{ typography: { variant: 'body2', color: 'text.secondary' } }} />
            </Grid>
            <Grid size={6}><TextField label="Departure date" size="small" fullWidth defaultValue="Aug 12, 2026" /></Grid>
            <Grid size={6}><TextField label="Return date" size="small" fullWidth defaultValue="Aug 19, 2026" /></Grid>
            <Grid size={6}><TextField label="Adults" size="small" fullWidth defaultValue="2" /></Grid>
            <Grid size={6}><TextField label="Children (with ages)" size="small" fullWidth defaultValue="None" /></Grid>
            <Grid size={12}>
              <C23_MuiFieldLabel>Vibe · pick any</C23_MuiFieldLabel>
              <C23_MuiFilterChips items={['Adults-only ✓','Family-friendly','Honeymoon ✓','Spa','Foodie','Adventure','5★','Beachfront ✓']} />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
            <Button variant="text">Clear</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="bookmark" size={14} />}>Save search</Button>
            <Button variant="contained" startIcon={<MuiIcon name="search" size={14} />}>Search</Button>
          </Stack>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

const hotels = [
  { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only', p: 3290, i: 'overwater', tag: 'All-inclusive · 7n', r: 4.9, badges: ['Gyasi pick'] },
  { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family', p: 2640, i: 'turks', tag: 'All-inclusive · 6n', r: 4.8, badges: ['Family'] },
  { t: 'Couples Swept Away', s: 'Negril · Adults-only', p: 2110, i: 'jamaica', tag: 'All-inclusive · 5n', r: 4.9 },
];
const cruises = [
  { t: 'Royal Caribbean · Symphony', s: 'Eastern Caribbean · 7-day', p: 1850, i: 'cruiseShip', tag: 'Cruise · Family', r: 4.7, badges: ['Kids sail free'] },
  { t: 'Carnival Mardi Gras', s: 'Western Caribbean · 7-day', p: 1290, i: 'cruiseShip', tag: 'Cruise · Casual', r: 4.5 },
  { t: 'Princess Caribbean Princess', s: 'Southern Caribbean · 10-day', p: 2640, i: 'cruiseShip', tag: 'Cruise · Premium', r: 4.6 },
];
const tours = [
  { t: 'Rose Island Cay snorkel', s: 'Nassau · 6 hrs', p: 140, i: 'snorkel', tag: 'Tour · Half-day', r: 4.9, badges: ['Top-rated'] },
  { t: 'Zipline + waterfalls', s: 'Negril · 8 hrs', p: 95, i: 'snorkel', tag: 'Tour · Adventure', r: 4.7 },
  { t: 'Sunset catamaran', s: 'Aruba · 4 hrs', p: 75, i: 'sunset', tag: 'Tour · Romantic', r: 4.8 },
];

function ResultsLayout({ kind, rows }) {
  const { Box, Stack, Typography, Button, IconButton, Chip, Card, CardMedia, Slider, Checkbox, FormControlLabel, FormGroup } = MUI;
  const noop = () => {};
  const checkRow = (s, checked) => (
    <FormControlLabel key={s} control={<Checkbox size="small" checked={checked} onChange={noop} sx={{ py: 0.25 }} />} label={s}
                      slotProps={{ typography: { variant: 'body2' } }} sx={{ mr: 0 }} />
  );
  return (
    <MuiScreenFrame role="client" tab="search" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1.25, alignItems: 'center' }}>
          <Typography variant="h5" component="div" dangerouslySetInnerHTML={{ __html: kind }} />
          <Chip variant="outlined" label={`${rows.length * 40} results`} />
          <Stack direction="row" spacing={0.75} sx={{ ml: 'auto' }}>
            {['Hotels','Cruises','Flights','Tours'].map((t) => (
              kind.startsWith(t)
                ? <Chip key={t} label={t} color="secondary" onClick={noop} />
                : <Chip key={t} label={t} variant="outlined" onClick={noop} />
            ))}
          </Stack>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>
          <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>FILTERS</Typography>
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ mb: 0.75 }}>Price</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="caption">$1k</Typography>
                <Slider size="small" defaultValue={[1000, 8000]} min={1000} max={8000} sx={{ flex: 1 }} />
                <Typography variant="caption">$8k</Typography>
              </Stack>
            </Box>
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ mb: 0.75 }}>Star rating</Typography>
              <FormGroup>{['5★', '4★+', '3★+'].map((s) => checkRow(s, s === '5★'))}</FormGroup>
            </Box>
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ mb: 0.75 }}>Amenities</Typography>
              <FormGroup>{['Beachfront ✓','Spa ✓','Adults-only','Kids club','All-inclusive ✓'].map((s) => checkRow(s, s.includes('✓')))}</FormGroup>
            </Box>
          </Box>
          <Box sx={{ overflow: 'auto', p: 2 }}>
            {rows.map((r, i) => (
              <Card key={i} sx={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', mb: 1.25 }}>
                <Box sx={{ position: 'relative' }}>
                  <CardMedia component="img" image={staImg(r.i, 360, 240)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <IconButton size="small" sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.9)', color: 'common.black' }}><MuiIcon name="heart" size={14} /></IconButton>
                </Box>
                <Box sx={{ px: 2, py: 1.75 }}>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mb: 0.5 }}>
                    <C23_MuiTagChip>{r.tag}</C23_MuiTagChip>
                    {(r.badges||[]).map((b) => <Chip key={b} size="small" label={`⭐ ${b}`} sx={{ bgcolor: 'primary.container', color: 'primary.onContainer' }} />)}
                  </Stack>
                  <Typography variant="h5" sx={{ my: 0.25 }}>{r.t}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.s} · <C23_MuiStar /> {r.r}</Typography>
                </Box>
                <Box sx={{ px: 2, py: 1.75, borderLeft: 1, borderColor: 'divider', minWidth: 160, textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>FROM</Typography>
                  <Typography variant="h5" sx={{ my: 0.25 }}>${r.p.toLocaleString()}<Typography component="span" variant="caption"> /pp</Typography></Typography>
                  <Button variant="contained" size="small" sx={{ mt: 'auto' }}>Request quote</Button>
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

function C233_HotelsResults() { return <ResultsLayout kind="Hotels &amp; resorts" rows={hotels}/>; }
function C234_CruisesResults() { return <ResultsLayout kind="Cruises" rows={cruises}/>; }
function C236_ToursResults() { return <ResultsLayout kind="Tours &amp; activities" rows={tours}/>; }

// 2.3.5 — Search Results · Flights
function C235_FlightsResults() {
  const { Box, Stack, Typography, Button, Card, CardContent, Divider, Alert } = MUI;
  const flights = [
    { c: 'American', n: 'AA 1413', dep: '06:40', arr: '09:30', dur: '2h 50m', stops: 'Nonstop', p: 462 },
    { c: 'JetBlue', n: 'B6 521', dep: '08:15', arr: '11:00', dur: '2h 45m', stops: 'Nonstop', p: 388 },
    { c: 'Delta', n: 'DL 1672+2802', dep: '07:20', arr: '13:40', dur: '6h 20m', stops: '1 stop · ATL', p: 312 },
  ];
  return (
    <MuiScreenFrame role="client" tab="search" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5">MIA → NAS · Aug 12 → 19 · 2 adults</Typography>
          <Typography variant="caption" color="text.secondary">Amadeus · display-only · book through Gyasi</Typography>
        </Box>
        <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
          {flights.map((f, i) => (
            <Card key={i}>
              <CardContent sx={{ px: 2.25, py: 1.75, display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 1.75, alignItems: 'center', '&:last-child': { pb: 1.75 } }}>
                <Box>
                  <Typography variant="subtitle1">{f.c}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: (t) => t.typography.mono }}>{f.n}</Typography>
                </Box>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>{f.dep}</Typography>
                    <Typography variant="caption" color="text.secondary">MIA</Typography>
                  </Box>
                  <Box sx={{ flex: 1, textAlign: 'center' }}>
                    <Divider />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{f.dur} · {f.stops}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>{f.arr}</Typography>
                    <Typography variant="caption" color="text.secondary">NAS</Typography>
                  </Box>
                </Stack>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, textAlign: 'right' }}>${f.p}<Typography component="span" variant="caption"> /pp</Typography></Typography>
                <Button variant="outlined" color="secondary" size="small">Add to quote</Button>
              </CardContent>
            </Card>
          ))}
          <Alert severity="info" icon={false}>
            ℹ Flights are <b>display-only</b> at MVP. Add any to your quote — Gyasi books via Inteletravel.
          </Alert>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.3.7 — Property / Cruise / Tour Detail
function C237_PropertyDetail() {
  const { Box, Stack, Grid, Paper, Typography, Button, Chip, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="client" tab="search" padding={0} scrollable>
      <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '280px', height: 280, gap: 0.5, overflow: 'hidden' }}>
        <Box component="img" src={staImg('overwater', 800, 600)} alt="" sx={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }} />
        <Stack spacing={0.5} sx={{ height: 280, minHeight: 0 }}>
          <Box component="img" src={staImg('resortPool', 400, 200)} alt="" sx={{ width: '100%', flex: 1, minHeight: 0, objectFit: 'cover', display: 'block' }} />
          <Box component="img" src={staImg('sunset', 400, 200)} alt="" sx={{ width: '100%', flex: 1, minHeight: 0, objectFit: 'cover', display: 'block' }} />
        </Stack>
        <Box sx={{ position: 'relative', height: 280, overflow: 'hidden' }}>
          <Box component="img" src={staImg('honeymoon', 400, 600)} alt="" sx={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }} />
          <Button variant="contained" size="small" sx={{ position: 'absolute', bottom: 12, right: 12, bgcolor: 'background.paper', color: 'text.primary' }}>All 24 photos</Button>
        </Box>
      </Box>
      <Box sx={{ px: 3.5, pt: 2.5, pb: 3.5, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.75 }}>
        <Box>
          <Stack direction="row" spacing={0.75} sx={{ mb: 1 }}>
            <C23_MuiTagChip>All-inclusive · 7 nights</C23_MuiTagChip>
            <Chip size="small" label="⭐ Gyasi's pick" sx={{ bgcolor: 'primary.container', color: 'primary.onContainer' }} />
          </Stack>
          <Typography variant="h3" component="h1">Sandals Royal Bahamian</Typography>
          <Stack direction="row" spacing={1.75} sx={{ mt: 0.5, color: 'text.secondary' }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Icon name="pin" size={13} /><Typography variant="body2">Nassau, Bahamas</Typography></Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><C23_MuiStar size={13} /><Typography variant="body2">4.9 · 312 reviews</Typography></Stack>
          </Stack>
          <Typography variant="body1" sx={{ mt: 1.75, maxWidth: 640 }}>Over-water bungalows, six pools, twelve dining venues, a Red Lane spa, and a private island day. Adults-only.</Typography>

          <Typography variant="h5" sx={{ mt: 2.25 }}>Room types</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {[{ t: 'Honeymoon Beachfront Walkout', s: 'King · 540 sqft · private patio', p: 3290 }, { t: 'Over-Water Bungalow', s: 'King · 700 sqft · glass floor', p: 3970, recommended: true }, { t: 'Crystal Lagoon Penthouse', s: '2BR · 1,200 sqft · butler', p: 5240 }].map((r) => (
              <Paper key={r.t} variant="outlined" sx={{ p: 1.75, display: 'flex', gap: 1.75, alignItems: 'center', borderColor: r.recommended ? 'primary.main' : 'divider', borderWidth: r.recommended ? 1.5 : 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <Typography variant="subtitle1">{r.t}</Typography>
                    {r.recommended && <Chip size="small" color="primary" label="RECOMMENDED" sx={{ height: 18, fontSize: 9.5, fontWeight: 600 }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{r.s}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h5">${r.p.toLocaleString()}</Typography>
                  <Typography variant="caption" color="text.secondary">/pp · all-in</Typography>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>
        <Stack component="aside" spacing={1.5}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>FROM</Typography>
              <Typography variant="h3" sx={{ my: 0.5 }}>$3,290<Typography component="span" variant="body1" color="text.secondary"> /pp</Typography></Typography>
              <Button variant="contained" fullWidth sx={{ mt: 1.5 }}>Request a quote</Button>
              <Button variant="outlined" color="secondary" fullWidth sx={{ mt: 0.75 }} startIcon={<MuiIcon name="heart" size={14} />}>Favorite</Button>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.3.8 — Quote Request Form
function C238_QuoteRequest() {
  const { Box, Stack, Grid, Typography, Button, IconButton, TextField, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="client" tab="search" padding={28} scrollable>
      <MuiScreenHeader title="Request a quote · Sandals Royal Bahamian" subtitle="Gyasi will reply within 2 hours with a real proposal." small />
      <Card sx={{ maxWidth: 760 }}>
        <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3, mb: 1 }}>PRE-FILLED FROM YOUR SEARCH</Typography>
          <Grid container spacing={1.5}>
            <Grid size={12}><TextField label="Trip name" size="small" fullWidth defaultValue="Hayes honeymoon · Sandals · Aug 2026" /></Grid>
            <Grid size={6}><TextField label="Departure" size="small" fullWidth defaultValue="Aug 12, 2026" /></Grid>
            <Grid size={6}><TextField label="Return" size="small" fullWidth defaultValue="Aug 19, 2026" /></Grid>
            <Grid size={6}><TextField label="Travelers" size="small" fullWidth defaultValue="2 adults · Jordan + Sam" /></Grid>
            <Grid size={6}><TextField label="Budget · per person" size="small" fullWidth defaultValue="$3,000 — $4,000" /></Grid>
            <Grid size={12}>
              <TextField label="Anything Gyasi should know?" size="small" fullWidth multiline minRows={3} defaultValue="Over-water bungalow if it works for budget. Sam is pescatarian. Anniversary Sep 14 — surprise nod welcome 🙂" />
            </Grid>
          </Grid>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mt: 1.5, mb: 0.75 }}>INCLUDED FROM YOUR FAVORITES (3)</Typography>
          <Stack direction="row" spacing={1}>
            {['overwater','snorkel','sunset'].map((k) => (
              <Box key={k} sx={{ width: 80, height: 60, borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                <Box component="img" src={staImg(k, 200, 150)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <IconButton size="small" sx={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, p: 0, bgcolor: 'rgba(0,0,0,0.6)', color: 'common.white' }}><MuiIcon name="close" size={10} /></IconButton>
              </Box>
            ))}
          </Stack>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
            <Button variant="text">Save as draft</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<MuiIcon name="send" size={14} />}>Send to Gyasi</Button>
          </Stack>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 2.3.9 — Quote Request Confirmation
function C239_QuoteConfirmation() {
  const { Box, Stack, Typography, Button, Avatar, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="client" tab="search" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 540, width: '100%', textAlign: 'center' }}>
          <Avatar sx={{ width: 80, height: 80, bgcolor: 'success.container', color: 'success.main', mx: 'auto', mb: 1.75 }}><Icon name="check" size={40} stroke={2.5} /></Avatar>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>QUOTE REQUEST SENT</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, my: 0.5 }}>On its way to Gyasi.</Typography>
          <Typography variant="body1" color="text.secondary">You'll hear back within 2 hours. We'll send you a notification when a proposal lands.</Typography>
          <Card sx={{ mt: 2.25 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left', '&:last-child': { pb: 2 } }}>
              <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 44, height: 44 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">Gyasi Story · Online</Typography>
                <Typography variant="caption" color="text.secondary">Usually replies in under 2 hours</Typography>
              </Box>
              <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="message" size={12} />}>Note</Button>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'center', mt: 2.25 }}>
            <Button variant="outlined">Dashboard</Button>
            <Button variant="contained">Start another search</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.3.10 — Saved Searches & Favorites
function C2310_Saved() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, CardMedia, Tabs, Tab } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame role="client" tab="search" padding={28} scrollable>
      <MuiScreenHeader title="Saved & favorites" subtitle="Pick up where you left off." small />
      <Tabs value={0} onChange={noop} sx={{ borderBottom: 1, borderColor: 'divider', mb: 1.75 }}>
        {['Saved searches · 3', 'Favorites · 12'].map((t) => <Tab key={t} label={t} />)}
      </Tabs>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Saved searches</Typography>
      <Stack spacing={1}>
        {[{ t: 'Caribbean · Aug 12-19 · 2 adults', n: '148 trips · price dropped 18% today', alert: true }, { t: 'Cruise · Dec 22-29 · 4 travelers', n: '52 trips · 3 new' }, { t: 'Aruba honeymoon · Oct', n: '34 trips' }].map((s) => (
          <Card key={s.t}>
            <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
              <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><Icon name="bookmark" size={18} fill="currentColor" /></Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">{s.t}</Typography>
                <Typography variant="caption" sx={{ color: s.alert ? 'error.main' : 'text.secondary' }}>{s.alert && '🔥 '}{s.n}</Typography>
              </Box>
              <Button variant="outlined" color="secondary" size="small">Re-run</Button>
            </CardContent>
          </Card>
        ))}
      </Stack>
      <Typography variant="subtitle1" sx={{ mt: 2.75, mb: 1 }}>Favorites</Typography>
      <Grid container spacing={1.25}>
        {['overwater','cruiseShip','turks','honeymoon','snorkel','jamaica','aruba','resortPool'].map((k, i) => (
          <Grid key={i} size={3}>
            <Card>
              <CardMedia component="img" height="120" image={staImg(k, 320, 240)} alt="" />
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="subtitle2">{['Sandals Royal','Symphony EC','Beaches T&C','Couples SwAway','Rose Island','Negril Cliffs','Aruba Sunset','Atlantis'][i]}</Typography>
                <Typography variant="caption" color="text.secondary">${[3290,1850,2640,2110,140,2110,1890,2480][i].toLocaleString()}/pp</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C231_SearchLanding, C232_SearchForm, C233_HotelsResults, C234_CruisesResults,
  C235_FlightsResults, C236_ToursResults, C237_PropertyDetail, C238_QuoteRequest,
  C239_QuoteConfirmation, C2310_Saved,
});
