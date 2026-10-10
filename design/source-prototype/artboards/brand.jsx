/* global React, MUI, Icon, MuiIcon, MuiStaStatus */
// Brand foundations artboard — rebuilt as an MUI component gallery.
// Rendered inside <StaMuiScheme>, so everything here reads the current theme.
// Lays out at 1280px wide. Publishes window.BrandArtboard (the only global the
// legacy file exported).
(() => {
  const {
    Box, Stack, Grid, Paper, Typography, Divider, useTheme,
    Button, IconButton, Fab, Chip, Avatar, AvatarGroup, Badge,
    TextField, MenuItem, Checkbox, Radio, RadioGroup, FormControlLabel, FormGroup, Switch, Slider,
    Alert, AlertTitle, Tabs, Tab, Stepper, Step, StepLabel, LinearProgress,
    Card, CardMedia, CardContent, CardActions,
    List, ListItem, ListItemButton, ListItemAvatar, ListItemText, ListSubheader,
    Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  } = window.MUI;

  const noop = () => {};

  // augmentColor() hands back rgb() strings for light/dark; show hex like the tokens.
  function toHex(c) {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(c));
    if (!m) return String(c).toUpperCase();
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // ─── Small layout helpers ───────────────────────────────────────────────
  function SectionLabel({ children, sx }) {
    return (
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1.25, ...sx }}>
        {children}
      </Typography>
    );
  }

  function Swatch({ bg, fg, name, hex, border, height = 56 }) {
    return (
      <Box sx={{
        height, px: 1.25, py: 1, bgcolor: bg, color: fg, borderRadius: 1,
        border: border ? 1 : 0, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{name}</Typography>
        <Typography variant="caption" sx={{ fontFamily: (t) => t.typography.mono, fontSize: 10, opacity: 0.85, lineHeight: 1.2 }}>{hex}</Typography>
      </Box>
    );
  }

  // One palette role: main on top, light / dark halves below.
  function RoleSwatch({ role }) {
    const theme = useTheme();
    const c = theme.palette[role];
    return (
      <Box>
        <Swatch bg={c.main} fg={c.contrastText} name={role} hex={toHex(c.main)} height={64} />
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
          {['light', 'dark'].map((k) => (
            <Box key={k} sx={{ flex: 1, height: 28, borderRadius: 1, bgcolor: c[k], color: theme.palette.getContrastText(c[k]), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ fontFamily: (t) => t.typography.mono, fontSize: 9, lineHeight: 1 }}>{toHex(c[k])}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }

  // ─── Header: wordmarks + the foundations copy (strings kept from legacy) ──
  function Header() {
    return (
      <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}>00 · DESIGN SYSTEM</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Two modes, one Story-Tail.</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 640 }}>
            <b>Light</b> rides the warm burgundy + orange book-and-fox identity. <b>Dark</b> shifts to the tropical island logo — ocean blue + sunset gold on deep navy. The two logos are not interchangeable; they map directly to the two modes.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {/* Light wordmark */}
          <Paper variant="outlined" sx={{ px: 2.25, py: 1.75, bgcolor: '#FBF8F3', borderColor: '#D7C2BD', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <svg width={48} height={48} viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path d="M10 44c4 12 18 14 28 10 6-3 9-9 8-15-2 4-7 6-12 5-6-2-8-7-7-12-4 4-12 4-17 12Z" fill="#E87722"/>
              <path d="M22 6h22c2 0 4 2 4 4v40c0 2-2 4-4 4H26c-4 0-6-2-6-6V8c0-1 1-2 2-2Z" fill="#7A1A1F" stroke="#5C0F13" strokeWidth="1.4"/>
              <circle cx="34" cy="28" r="8" stroke="#F1E7D5" strokeWidth="1.6" fill="none"/>
              <path d="M40 19l3-3M40 19l-1 3M40 19l3 0" stroke="#F1E7D5" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 0.5 }}>
              <Typography variant="script" sx={{ color: '#7A1A1F', fontSize: 28 }}>Story-Tail</Typography>
              <Typography component="span" sx={{ fontWeight: 700, fontSize: 9.5, lineHeight: 1, letterSpacing: '2.2px', color: '#E87722' }}>ADVENTURES</Typography>
            </Box>
          </Paper>
          {/* Dark wordmark */}
          <Paper variant="outlined" sx={{ px: 2.25, py: 1.75, bgcolor: '#050D1A', borderColor: '#25405E', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box component="img" src="brand/logo-tropical-dark.png" alt="" sx={{ width: 48, height: 48, objectFit: 'contain' }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 0.5 }}>
              <Typography variant="script" sx={{ fontSize: 28, background: 'linear-gradient(180deg, #FFE08A 0%, #FF9436 60%, #F26B1A 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Story-Tail</Typography>
              <Typography component="span" sx={{ fontWeight: 700, fontSize: 9.5, lineHeight: 1, letterSpacing: '2.2px', background: 'linear-gradient(180deg, #7CC5FF 0%, #1E92E5 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ADVENTURES</Typography>
            </Box>
          </Paper>
        </Stack>
      </Stack>
    );
  }

  // ─── Palette ────────────────────────────────────────────────────────────
  function PaletteSection() {
    const theme = useTheme();
    const p = theme.palette;
    const roles = ['primary', 'secondary', 'tertiary', 'brand', 'error', 'warning', 'info', 'success'];
    const neutrals = [
      { name: 'bg.default', bg: p.background.default },
      { name: 'bg.paper', bg: p.background.paper },
      { name: 'surface.2', bg: p.surface[2] },
      { name: 'surface.3', bg: p.surface[3] },
      { name: 'surface.4', bg: p.surface[4] },
      { name: 'surface.5', bg: p.surface[5] },
      { name: 'divider', bg: p.divider },
      { name: 'text.secondary', bg: p.text.secondary },
      { name: 'text.primary', bg: p.text.primary },
    ];
    return (
      <Box sx={{ mb: 3 }}>
        <SectionLabel>Palette · {p.mode === 'light' ? 'LIGHT · BURGUNDY + ORANGE' : 'DARK · OCEAN + SUNSET'}</SectionLabel>
        <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
          {roles.map((r) => <Grid key={r} size={1.5}><RoleSwatch role={r} /></Grid>)}
        </Grid>
        <Grid container spacing={1}>
          {neutrals.map((n) => (
            <Grid key={n.name} size={12 / 9}>
              <Swatch bg={n.bg} fg={p.getContrastText(n.bg)} name={n.name} hex={String(n.bg).toUpperCase()} border height={48} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // ─── Type ramp ──────────────────────────────────────────────────────────
  function TypeSection() {
    const rows = [
      ['h1', 'Rest'], ['h2', 'Wonder'], ['h3', 'Next chapter'], ['h4', 'Heading 4'],
      ['h5', 'Heading 5'], ['h6', 'Heading 6'],
      ['subtitle1', 'Subtitle 1 — card titles and list rows'],
      ['subtitle2', 'Subtitle 2 — subheads and row titles'],
      ['body1', 'Body 1 for trip descriptions and itinerary day notes.'],
      ['body2', 'Body 2 for metadata, captions, agent notes.'],
      ['button', 'Button label'], ['caption', 'Caption · 12px'], ['overline', 'Overline · section'],
    ];
    return (
      <Box>
        <SectionLabel>Typography · Poppins + Caveat · MUI ramp</SectionLabel>
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'surface.2' }}>
          <Typography variant="script" sx={{ color: 'primary.main', fontSize: 44, display: 'block' }}>Story-Tail</Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {rows.map(([v, text]) => (
              <Stack key={v} direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
                <Typography variant="caption" color="text.secondary" sx={{ width: 64, flexShrink: 0, fontFamily: (t) => t.typography.mono, fontSize: 10 }}>{v}</Typography>
                <Typography variant={v} noWrap sx={{ minWidth: 0, display: 'block' }}>{text}</Typography>
              </Stack>
            ))}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 64, flexShrink: 0, fontFamily: (t) => t.typography.mono, fontSize: 10 }}>script</Typography>
              <Typography variant="script" sx={{ color: 'secondary.main' }}>Adventures begin</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 64, flexShrink: 0, fontFamily: (t) => t.typography.mono, fontSize: 10 }}>mono</Typography>
              <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono }}>CONF-7Q2M-STA · JetBrains Mono</Typography>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ─── Buttons ────────────────────────────────────────────────────────────
  function ButtonsSection() {
    const colors = ['primary', 'secondary', 'tertiary', 'brand', 'error'];
    const labels = { primary: 'Authorize card', secondary: 'Save trip', tertiary: 'Filter', brand: 'New trip', error: 'Remove card' };
    return (
      <Box>
        <SectionLabel>Buttons · contained / outlined / text</SectionLabel>
        <Stack spacing={1.25}>
          {['contained', 'outlined', 'text'].map((variant) => (
            <Stack key={variant} direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>
              {colors.map((c) => <Button key={c} variant={variant} color={c}>{labels[c]}</Button>)}
            </Stack>
          ))}
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>
            <Button size="small" variant="contained">Small</Button>
            <Button size="medium" variant="contained">Medium</Button>
            <Button size="large" variant="contained">Large</Button>
            <Button variant="contained" color="brand" startIcon={<MuiIcon name="plus" size={16} />}>New trip</Button>
            <Button variant="outlined" endIcon={<MuiIcon name="arrow_right" size={16} />}>Learn more</Button>
            <Button variant="contained" disabled>Disabled</Button>
            <Button variant="outlined" disabled>Disabled</Button>
          </Stack>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>
            <IconButton><MuiIcon name="search" /></IconButton>
            <IconButton color="primary"><MuiIcon name="heart" /></IconButton>
            <IconButton color="secondary"><MuiIcon name="bell" /></IconButton>
            <IconButton color="brand"><MuiIcon name="edit" /></IconButton>
            <IconButton disabled><MuiIcon name="trash" /></IconButton>
            <Divider orientation="vertical" flexItem />
            <Fab size="small" color="primary"><MuiIcon name="plus" size={18} /></Fab>
            <Fab color="secondary"><MuiIcon name="message" size={20} /></Fab>
            <Fab variant="extended" color="primary"><MuiIcon name="plus" size={18} sx={{ mr: 1 }} />New</Fab>
            <Fab variant="extended" color="brand"><MuiIcon name="plane" size={18} sx={{ mr: 1 }} />Plan a trip</Fab>
          </Stack>
        </Stack>
      </Box>
    );
  }

  // ─── Chips ──────────────────────────────────────────────────────────────
  function ChipsSection() {
    const statuses = [
      ['lead', 'Lead'], ['inquiry', 'Inquiry'], ['proposal', 'Proposal Ready'], ['booked', 'Booked'],
      ['due', 'Payment Due'], ['traveling', 'Traveling Now'], ['past', 'Past Trip'], ['cancelled', 'Cancelled'],
    ];
    return (
      <Box>
        <SectionLabel>Chips · status language</SectionLabel>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', '& > *': { flexShrink: 0 }, mb: 1.25 }}>
          {statuses.map(([k, l]) => <MuiStaStatus key={k} kind={k}>{l}</MuiStaStatus>)}
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>
          <Chip label="Tag" />
          <Chip label="Outlined" variant="outlined" />
          <Chip label="Filter" variant="outlined" onClick={noop} />
          <Chip label="Selected" color="secondary" onClick={noop} />
          <Chip label="Primary" color="primary" />
          <Chip label="Tertiary" color="tertiary" variant="outlined" />
          <Chip label="Brand" color="brand" />
          <Chip label="Deletable" onDelete={noop} />
          <Chip avatar={<Avatar>JH</Avatar>} label="Jordan H." />
          <Chip icon={<MuiIcon name="plane" size={16} />} label="Flight" size="small" />
        </Stack>
      </Box>
    );
  }

  // ─── Inputs ─────────────────────────────────────────────────────────────
  function InputsSection() {
    return (
      <Box>
        <SectionLabel>Inputs</SectionLabel>
        <Grid container spacing={1.5}>
          <Grid size={6}><TextField fullWidth size="small" label="Traveler name" defaultValue="Jordan Hale" /></Grid>
          <Grid size={6}><TextField fullWidth size="small" label="Email" placeholder="you@example.com" helperText="We only use this for trip updates." /></Grid>
          <Grid size={6}>
            <TextField fullWidth size="small" select label="Trip type" value="cruise" onChange={noop}>
              <MenuItem value="cruise">Cruise</MenuItem>
              <MenuItem value="resort">All-inclusive resort</MenuItem>
              <MenuItem value="honeymoon">Honeymoon</MenuItem>
            </TextField>
          </Grid>
          <Grid size={6}><TextField fullWidth size="small" label="Confirmation" defaultValue="Need a real code" error helperText="That code doesn't look right yet." /></Grid>
        </Grid>
        <Stack direction="row" spacing={3} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', '& > *': { flexShrink: 0 }, mt: 1 }}>
          <FormGroup row>
            <FormControlLabel control={<Checkbox defaultChecked />} label="Email me" />
            <FormControlLabel control={<Checkbox />} label="Text me" />
          </FormGroup>
          <RadioGroup row defaultValue="window">
            <FormControlLabel value="window" control={<Radio />} label="Window" />
            <FormControlLabel value="aisle" control={<Radio />} label="Aisle" />
          </RadioGroup>
          <FormControlLabel control={<Switch defaultChecked />} label="Travel alerts" />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 0.5, px: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Budget</Typography>
          <Slider defaultValue={[2400, 6800]} min={500} max={12000} step={100} valueLabelDisplay="auto" />
        </Stack>
      </Box>
    );
  }

  // ─── Alerts ─────────────────────────────────────────────────────────────
  function AlertsSection() {
    return (
      <Box>
        <SectionLabel>Alerts</SectionLabel>
        <Stack spacing={1}>
          <Alert severity="success"><AlertTitle>Card saved</AlertTitle>Your card is tucked away safely.</Alert>
          <Alert severity="info">Your itinerary updates the moment Gyasi changes something.</Alert>
          <Alert severity="warning">Final payment is due in 12 days.</Alert>
          <Alert severity="error">We couldn't reach the supplier. Try again in a moment.</Alert>
        </Stack>
      </Box>
    );
  }

  // ─── Tabs + Stepper ─────────────────────────────────────────────────────
  function NavigationSection() {
    return (
      <Box>
        <SectionLabel>Tabs · Stepper</SectionLabel>
        <Paper variant="outlined">
          <Tabs value={1} onChange={noop} variant="fullWidth">
            <Tab label="Overview" />
            <Tab label="Itinerary" />
            <Tab label="Travelers" />
            <Tab label="Documents" />
          </Tabs>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Stepper activeStep={2} alternativeLabel>
              {['Inquiry', 'Proposal', 'Booked', 'Traveling'].map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
            </Stepper>
          </Box>
        </Paper>
        <Box sx={{ mt: 2 }}>
          <SectionLabel sx={{ mb: 0.75 }}>Progress</SectionLabel>
          <Stack spacing={1}>
            <LinearProgress variant="determinate" value={64} />
            <LinearProgress variant="determinate" value={30} color="secondary" />
            <LinearProgress />
          </Stack>
        </Box>
      </Box>
    );
  }

  // ─── Avatars + badges ───────────────────────────────────────────────────
  function AvatarsSection() {
    return (
      <Box>
        <SectionLabel>Avatars · Badges</SectionLabel>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>
          <Avatar sx={{ width: 24, height: 24, fontSize: 10 }}>GS</Avatar>
          <Avatar>GS</Avatar>
          <Avatar sx={{ width: 56, height: 56, fontSize: 18, bgcolor: 'primary.main' }}>JH</Avatar>
          <Avatar sx={{ width: 84, height: 84, fontSize: 26, bgcolor: 'tertiary.main', color: 'tertiary.contrastText' }}>MR</Avatar>
          <AvatarGroup max={4}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>A</Avatar>
            <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>B</Avatar>
            <Avatar sx={{ bgcolor: 'tertiary.main', color: 'tertiary.contrastText' }}>C</Avatar>
            <Avatar sx={{ bgcolor: 'brand.main' }}>D</Avatar>
            <Avatar>E</Avatar>
          </AvatarGroup>
        </Stack>
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center', mt: 2.5, ml: 0.5 }}>
          <Badge badgeContent={3} color="error"><MuiIcon name="bell" size={22} /></Badge>
          <Badge variant="dot" color="error"><MuiIcon name="message" size={22} /></Badge>
          <Badge badgeContent={12} color="primary"><MuiIcon name="inbox" size={22} /></Badge>
          <Badge badgeContent="New" color="secondary"><MuiIcon name="briefcase" size={22} /></Badge>
          <Badge badgeContent={0} showZero color="brand"><MuiIcon name="passport" size={22} /></Badge>
        </Stack>
      </Box>
    );
  }

  // ─── Card ───────────────────────────────────────────────────────────────
  function CardSection() {
    return (
      <Box>
        <SectionLabel>Card</SectionLabel>
        <Card>
          <CardMedia component="img" height="120" image="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&auto=format&fit=crop" alt="" />
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <MuiStaStatus kind="booked">Booked</MuiStaStatus>
              <Typography variant="caption" color="text.secondary">Mar 14 – 21</Typography>
            </Stack>
            <Typography variant="h6">Turks & Caicos, slow week</Typography>
            <Typography variant="body2" color="text.secondary">Seven nights of nothing on the calendar but the tide.</Typography>
          </CardContent>
          <CardActions>
            <Button size="small">View itinerary</Button>
            <Button size="small" color="secondary">Message Gyasi</Button>
          </CardActions>
        </Card>
      </Box>
    );
  }

  // ─── List ───────────────────────────────────────────────────────────────
  function ListSection() {
    const rows = [
      { i: 'JH', t: 'Jordan Hale', s: 'Honeymoon · St. Lucia', m: 'Today', k: 'proposal', l: 'Proposal' },
      { i: 'MR', t: 'The Reyes family', s: 'Spring break cruise', m: '2d', k: 'booked', l: 'Booked' },
      { i: 'AK', t: 'Amara Knight', s: 'Solo reset · Aruba', m: '5d', k: 'due', l: 'Due' },
      { i: 'TB', t: 'Tom & Bea', s: '40th anniversary', m: '1w', k: 'inquiry', l: 'Inquiry' },
    ];
    return (
      <Box>
        <SectionLabel>List</SectionLabel>
        <Paper variant="outlined">
          <List dense disablePadding subheader={<ListSubheader disableSticky>Worklist</ListSubheader>}>
            {rows.map((r, idx) => (
              <ListItem key={r.t} disablePadding divider={idx < rows.length - 1}
                        secondaryAction={<MuiStaStatus kind={r.k}>{r.l}</MuiStaStatus>}>
                <ListItemButton selected={idx === 0}>
                  <ListItemAvatar><Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>{r.i}</Avatar></ListItemAvatar>
                  <ListItemText primary={r.t} secondary={r.s} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    );
  }

  // ─── Table ──────────────────────────────────────────────────────────────
  function TableSection() {
    const rows = [
      ['Hale honeymoon', 'Sandals Grande', '$8,420', 'booked', 'Booked'],
      ['Reyes cruise', 'Royal Caribbean', '$6,150', 'due', 'Due'],
      ['Knight reset', 'Bucuti & Tara', '$3,980', 'proposal', 'Proposal'],
      ['Tom & Bea', 'Viking', '—', 'inquiry', 'Inquiry'],
    ];
    return (
      <Box>
        <SectionLabel>Table</SectionLabel>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trip</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(([t, s, v, k, l]) => (
                <TableRow key={t} hover>
                  <TableCell>{t}</TableCell>
                  <TableCell>{s}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: (th) => th.typography.mono, fontSize: 12 }}>{v}</TableCell>
                  <TableCell><MuiStaStatus kind={k}>{l}</MuiStaStatus></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  // ─── Footer brand rule (copy kept from legacy) ──────────────────────────
  function BrandRule() {
    return (
      <Paper variant="outlined" sx={{ mt: 3, p: 2.25, bgcolor: 'surface.2', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <MuiIcon name="info" size={18} sx={{ color: 'secondary.main' }} />
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 960 }}>
          <Box component="b" sx={{ color: 'text.primary' }}>Brand rule:</Box>{' '}
          The book-and-fox mark only appears in light mode; the tropical island mark only appears on dark surfaces. Wordmark gradient swaps to match (orange→sunset script + blue ADVENTURES on dark). Status &amp; chip language stays consistent in both modes.
        </Typography>
      </Paper>
    );
  }

  // ─── The artboard ───────────────────────────────────────────────────────
  function BrandArtboard() {
    return (
      <Box sx={{ width: '100%', height: '100%', bgcolor: 'surface.main', color: 'text.primary', px: 5, py: 4, overflow: 'hidden' }}>
        <Header />
        <PaletteSection />

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={5}><TypeSection /></Grid>
          <Grid size={7}>
            <Stack spacing={3}>
              <ButtonsSection />
              <ChipsSection />
              <InputsSection />
            </Stack>
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={4}><AlertsSection /></Grid>
          <Grid size={4}><NavigationSection /></Grid>
          <Grid size={4}><AvatarsSection /></Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid size={4}><CardSection /></Grid>
          <Grid size={4}><ListSection /></Grid>
          <Grid size={4}><TableSection /></Grid>
        </Grid>

        <BrandRule />
      </Box>
    );
  }

  Object.assign(window, { BrandArtboard });
})();
