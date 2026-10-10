/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Client · 2.5 Account & Profile — 11 screens. MUI v9.

// 2.5.1 — Account Overview
function C251_AccountOverview() {
  const { Box, Grid, Card, CardActionArea, Typography, Avatar, Chip } = MUI;
  const tiles = [
    { i: 'user', t: 'Personal info', s: 'Name, email, phone, address' },
    { i: 'heart', t: 'Travel preferences', s: 'Style, dietary, loyalty' },
    { i: 'passport', t: 'Travel documents', s: '5 files · 1 expiring soon' },
    { i: 'bell', t: 'Notifications', s: 'Email · push · SMS' },
    { i: 'shield', t: 'Security & MFA', s: 'MFA on · 1 active session' },
    { i: 'link', t: 'Connected accounts', s: 'Google linked · Apple not' },
    { i: 'lock', t: 'Privacy & data export', s: 'Download a copy of your data' },
    { i: 'question', t: 'Help & support', s: 'FAQ · contact Gyasi' },
  ];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <Card sx={{
        p: 2.75, display: 'flex', gap: 2.25, alignItems: 'center', mb: 2.25,
        background: (t) => `linear-gradient(120deg, ${t.palette.primary.container}, ${t.palette.secondary.container})`,
      }}>
        <Avatar src={staImg('avatarC', 200, 200)} alt="" sx={{ width: 84, height: 84, border: 3, borderColor: 'background.paper' }}/>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Jordan Hayes</Typography>
          <Typography variant="body2" component="div" sx={{ fontWeight: 500, color: 'primary.onContainer', display: 'flex', gap: 1.75, mt: 0.5 }}>
            <span>jordan.hayes@example.com</span><span>·</span><span>Member since Mar 2024</span><span>·</span><span>Miami, FL</span>
          </Typography>
        </Box>
        <Chip variant="outlined" label="Member ID · STA-5839" sx={{ fontFamily: (t) => t.typography.mono, fontSize: 12, color: 'primary.onContainer', borderColor: 'primary.onContainer' }}/>
      </Card>
      <Grid container spacing={1.25}>
        {tiles.map((t) => (
          <Grid key={t.t} size={3}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}><Icon name={t.i} size={18}/></Avatar>
                <Typography variant="subtitle1" sx={{ mt: 1.25 }}>{t.t}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{t.s}</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </MuiScreenFrame>
  );
}

// 2.5.2 — Personal Info Edit
function C252_PersonalInfo() {
  const { Box, Grid, Card, CardContent, Typography, Button, TextField } = MUI;
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Personal info" subtitle="Edit your contact details and emergency contact." actions={<><Button variant="text">Cancel</Button><Button variant="contained">Save</Button></>} small/>
      <Card sx={{ maxWidth: 720 }}>
        <CardContent sx={{ p: 2.75 }}>
          <Grid container spacing={1.5}>
            <Grid size={6}><TextField label="First name" size="small" fullWidth defaultValue="Jordan"/></Grid>
            <Grid size={6}><TextField label="Last name" size="small" fullWidth defaultValue="Hayes"/></Grid>
            <Grid size={6}><TextField label={<>Email <Box component="span" sx={{ color: 'warning.main', fontWeight: 600 }}>· change requires verification</Box></>} size="small" fullWidth defaultValue="jordan.hayes@example.com"/></Grid>
            <Grid size={6}><TextField label="Phone" size="small" fullWidth defaultValue="+1 (305) 555-0184"/></Grid>
            <Grid size={12}><TextField label="Mailing address" size="small" fullWidth defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></Grid>
            <Grid size={6}><TextField label="Date of birth" size="small" fullWidth defaultValue="04 / 22 / 1992"/></Grid>
            <Grid size={6}><TextField label="Pronouns (optional)" size="small" fullWidth defaultValue="she/her"/></Grid>
            <Grid size={12}>
              <Typography variant="subtitle1" sx={{ my: 0.75 }}>Emergency contact</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 1.25 }}>
                <TextField size="small" fullWidth defaultValue="Sam Hayes"/>
                <TextField size="small" fullWidth defaultValue="+1 (305) 555-0186"/>
                <TextField size="small" fullWidth defaultValue="Spouse"/>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 2.5.3 — Travel Preferences Edit
function C253_PreferencesEdit() {
  const { Box, Stack, Card, CardContent, Typography, Button, TextField, Chip } = MUI;
  const noop = () => {};
  const groups = [
    { t: 'Preferred destinations', opts: ['Caribbean ✓','Bahamas ✓','Greece','Mexico','Italy','Iceland','Japan'] },
    { t: 'Travel style', opts: ['Resort ✓','Cruise ✓','Adventure','Family','Honeymoon ✓','Group'] },
    { t: 'Dietary', opts: ['No restrictions','Vegetarian','Pescatarian ✓ (Sam)','Gluten-free','Halal'] },
    { t: 'Accessibility', opts: ['None','Mobility-friendly','Quiet rooms','Service animal'] },
  ];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Travel preferences" subtitle="Helps Gyasi plan with all the right context." actions={<><Button variant="text">Cancel</Button><Button variant="contained">Save</Button></>} small/>
      <Card sx={{ maxWidth: 760 }}>
        <CardContent sx={{ p: 2.75 }}>
          {groups.map((g) => (
            <Box key={g.t} sx={{ mb: 1.75 }}>
              <Typography variant="subtitle1" sx={{ mb: 0.75 }}>{g.t}</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {g.opts.map((o) => (
                  o.includes('✓') ? <Chip key={o} label={o} color="secondary" onClick={noop}/> : <Chip key={o} label={o} variant="outlined"/>
                ))}
              </Stack>
            </Box>
          ))}
          <TextField label="Loyalty programs · frequent flyer numbers" size="small" fullWidth multiline minRows={2} defaultValue="AAdvantage 4ZE82Q (Platinum)&#10;IHG Rewards 92214"/>
          <TextField label="Favorite past trips · free text" size="small" fullWidth multiline minRows={2} defaultValue="Beaches T&C 2024 — the kids loved it. Symphony EC 2025 — would do again." sx={{ mt: 1.5 }}/>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 2.5.4 — Travel Documents
function C254_TravelDocs() {
  const { Box, Grid, Card, CardContent, Typography, Button, IconButton, Avatar, Alert } = MUI;
  const groups = [
    { t: 'Passports', docs: [{ n: 'passport-jordan.jpg', s: 'Exp 08/2029 · USA', ok: true }, { n: 'passport-sam.jpg', s: 'Exp 02/2027 · USA', warn: true }] },
    { t: 'Visas & ESTA', docs: [{ n: 'esta-approval-jordan.pdf', s: 'Valid through Mar 2028', ok: true }] },
    { t: 'Insurance', docs: [{ n: 'allianz-policy-987124.pdf', s: 'Sandals trip · expires Aug 26', ok: true }] },
  ];
  return (
    <MuiScreenFrame role="client" tab="docs" padding={28} scrollable>
      <MuiScreenHeader title="Travel documents" subtitle="Passports, visas, insurance certificates. Encrypted at rest." actions={<Button variant="contained" color="brand" startIcon={<MuiIcon name="upload" size={14}/>}>Upload</Button>} small/>
      <Alert severity="warning" icon={<MuiIcon name="warning" size={18}/>} sx={{ mb: 1.75 }}>
        <b>Heads up:</b> Sam's passport expires in 6 months. Some countries require 6 months' validity from re-entry.
      </Alert>
      {groups.map((g) => (
        <Box key={g.t} sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>{g.t}</Typography>
          <Grid container spacing={1.25}>
            {g.docs.map((d) => (
              <Grid key={d.n} size={4}>
                <Card>
                  <CardContent sx={{ p: 1.5, display: 'flex', gap: 1.25, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
                    <Avatar variant="rounded" sx={{ width: 38, height: 46, borderRadius: 1, fontWeight: 800, fontSize: 9, bgcolor: d.n.endsWith('.pdf') ? 'primary.main' : 'brand.main', color: d.n.endsWith('.pdf') ? 'primary.contrastText' : 'brand.contrastText' }}>
                      {d.n.endsWith('.pdf') ? 'PDF' : 'IMG'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap sx={{ fontSize: 12.5 }}>{d.n}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: d.warn ? 'error.main' : 'text.secondary' }}>{d.warn && '⚠ '}{d.s}</Typography>
                    </Box>
                    <IconButton size="small"><MuiIcon name="more_vert" size={14}/></IconButton>
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

// 2.5.5 — Document Upload / Camera Capture
function C255_DocUpload() {
  const { Box, Stack, Grid, Paper, Typography, Button, IconButton, TextField, Chip } = MUI;
  const noop = () => {};
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={4} sx={{ width: '100%', maxWidth: 600, p: 3.25 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.75 }}>
            <Typography variant="h5" component="h2">Upload a document</Typography>
            <IconButton size="small"><MuiIcon name="close" size={18}/></IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.75 }}>Document type</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.5 }}>
            {['Passport ✓','Visa','Insurance','Boarding pass','Confirmation','Other'].map((t) => (
              t.includes('✓') ? <Chip key={t} label={t} color="secondary" onClick={noop}/> : <Chip key={t} label={t} variant="outlined"/>
            ))}
          </Stack>
          <Paper variant="outlined" sx={{ p: 2.75, borderStyle: 'dashed', borderColor: 'outline.main', bgcolor: 'surface.2', textAlign: 'center' }}>
            <MuiIcon name="upload" size={32} sx={{ color: 'text.secondary' }}/>
            <Typography variant="subtitle1" sx={{ mt: 1 }}>Drop a file or take a photo</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>JPG, PNG, PDF · up to 10 MB</Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 1.5 }}>
              <Button size="small" variant="outlined" color="secondary">Browse files</Button>
              <Button size="small" variant="outlined">📷 Take photo</Button>
            </Stack>
          </Paper>
          <Paper elevation={0} sx={{ p: 1.75, mt: 1.75, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3 }}>PREVIEW · jordan-passport.jpg</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
              <Box sx={{ width: 80, height: 100, borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="passport" size={36}/>
              </Box>
              <Grid container spacing={1} sx={{ flex: 1 }}>
                <Grid size={6}><TextField label="Number (OCR)" size="small" fullWidth defaultValue="A123456789" slotProps={{ input: { sx: { fontFamily: (t) => t.typography.mono } } }}/></Grid>
                <Grid size={6}><TextField label="Expiry" size="small" fullWidth defaultValue="08/22/2029"/></Grid>
                <Grid size={12}><TextField label="Name (OCR)" size="small" fullWidth defaultValue="HAYES, JORDAN E"/></Grid>
              </Grid>
            </Stack>
          </Paper>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
            <Button variant="text">Cancel</Button>
            <Button variant="contained" sx={{ ml: 'auto' }}>Save document</Button>
          </Stack>
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.5.6 — Notification Preferences
function C256_Notifications() {
  const { Paper, Button, Switch, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } = MUI;
  const rows = [
    { l: 'Trip status updates', e: true, p: true, s: false },
    { l: 'Itinerary changes', e: true, p: true, s: false },
    { l: 'Payment activity', e: true, p: true, s: true },
    { l: 'Card use · audit', e: true, p: true, s: false },
    { l: 'Pre-trip reminders · 14 days out', e: true, p: true, s: false },
    { l: 'Post-trip follow-up', e: true, p: false, s: false },
    { l: 'New messages from Gyasi', e: true, p: true, s: false },
    { l: 'Marketing · hot deals', e: false, p: false, s: false },
  ];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Notifications" subtitle="Pick how and when we ping you. Trip-critical alerts can't be fully muted." actions={<Button variant="contained" size="small">Save</Button>} small/>
      <TableContainer component={Paper} sx={{ maxWidth: 760 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Notification</TableCell>
              <TableCell align="center">Email</TableCell>
              <TableCell align="center">Push</TableCell>
              <TableCell align="center">SMS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.l}>
                <TableCell>{r.l}</TableCell>
                {['e','p','s'].map((k) => (
                  <TableCell key={k} align="center"><Switch size="small" defaultChecked={r[k]}/></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </MuiScreenFrame>
  );
}

// 2.5.7 — Security Settings
function C257_Security() {
  const { Box, Stack, Grid, Card, CardContent, Typography, Button, List, ListItem, ListItemIcon, ListItemText } = MUI;
  const sessions = [
    { d: 'iPhone 17 · Safari', loc: 'Miami, FL · this device', last: 'Active now', ok: true },
    { d: 'MacBook Pro · Chrome', loc: 'Miami, FL', last: '2 hours ago', ok: true },
    { d: 'Unknown Android', loc: 'Atlanta, GA · suspicious?', last: 'Mar 28', warn: true },
  ];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Security" subtitle="Password, MFA, and active sessions." small/>
      <Grid container spacing={1.75} sx={{ maxWidth: 920 }}>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1">Password</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Last changed Mar 14, 2024</Typography>
              <Button size="small" variant="outlined" color="secondary" sx={{ mt: 1.25 }}>Change password</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="subtitle1">Two-factor auth</Typography><MuiStaStatus kind="booked" sx={{ ml: 'auto' }}>On · Authy</MuiStaStatus></Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>3 backup codes remaining</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }}>
                <Button size="small" variant="outlined">Manage</Button>
                <Button size="small" variant="text">Show backup codes</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Card sx={{ mt: 1.75, maxWidth: 920 }}>
        <Box sx={{ px: 2.25, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1">Active sessions</Typography>
          <Button size="small" variant="text">Sign out of all devices</Button>
        </Box>
        <List disablePadding>
          {sessions.map((s, i) => (
            <ListItem key={i} divider={i < sessions.length - 1} sx={{ px: 2.25, py: 1.5, gap: 1.5 }}>
              <ListItemIcon sx={{ minWidth: 0, color: s.warn ? 'error.main' : 'text.secondary' }}>
                <Icon name={s.d.includes('iPhone') ? 'phone' : s.d.includes('Mac') ? 'briefcase' : 'shield'} size={18}/>
              </ListItemIcon>
              <ListItemText
                primary={s.d}
                secondary={`${s.loc} · ${s.last}`}
                slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'caption', sx: { color: s.warn ? 'error.main' : 'text.secondary' } } }}
                sx={{ my: 0 }}
              />
              {s.ok ? <MuiStaStatus kind="booked">Trusted</MuiStaStatus> : <Button size="small" variant="contained" color="error">Sign out</Button>}
            </ListItem>
          ))}
        </List>
      </Card>
    </MuiScreenFrame>
  );
}

// 2.5.8 — Connected Accounts
function C258_Connected() {
  const { Card, Button, Avatar, List, ListItem, ListItemText } = MUI;
  const accounts = [
    { n: 'Google', email: 'jordan.hayes@example.com', on: true },
    { n: 'Apple', email: 'Not connected', on: false },
    { n: 'Facebook', email: 'Not connected · available', on: false },
  ];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Connected accounts" subtitle="Social logins linked to your Story-Tail account." small/>
      <Card sx={{ maxWidth: 720 }}>
        <List disablePadding>
          {accounts.map((c, i) => (
            <ListItem key={c.n} divider={i < accounts.length - 1} sx={{ px: 2.25, py: 1.75, gap: 1.5 }}>
              <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'surface.3', color: 'text.primary', fontWeight: 700, fontSize: 14 }}>{c.n[0]}</Avatar>
              <ListItemText primary={c.n} secondary={c.email} slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'caption' } }} sx={{ my: 0 }}/>
              {c.on ? <Button size="small" variant="outlined">Disconnect</Button> : <Button size="small" variant="outlined" color="secondary">Connect</Button>}
            </ListItem>
          ))}
        </List>
      </Card>
    </MuiScreenFrame>
  );
}

// 2.5.9 — Privacy & Data Export
function C259_Privacy() {
  const { Box, Stack, Grid, Paper, Card, CardContent, Typography, Button, Switch, Divider } = MUI;
  const tracking = [{ l: 'Essential cookies', sub: 'Required for login', on: true, locked: true }, { l: 'Analytics', sub: 'Helps us improve', on: true }, { l: 'Marketing', sub: 'Personalize offers', on: false }];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Privacy & data" subtitle="Download your data, manage tracking, or close your account." small/>
      <Grid container spacing={1.75} sx={{ maxWidth: 920 }}>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Icon name="download" size={18}/><Typography variant="h5">Download my data</Typography></Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Includes profile, trips, messages, card metadata (not full PANs), and audit log. JSON + PDF.</Typography>
              <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'surface.2', mt: 1.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>LAST EXPORT</Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>Mar 14, 2024 · 14 MB · expired</Typography>
              </Paper>
              <Button variant="contained" sx={{ mt: 1.5 }}>Request export</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Icon name="shield" size={18}/><Typography variant="h5">Tracking preferences</Typography></Stack>
              <Stack divider={<Divider/>} sx={{ mt: 1.25 }}>
                {tracking.map((p) => (
                  <Stack key={p.l} direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1">{p.l}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{p.sub}{p.locked && ' · always on'}</Typography>
                    </Box>
                    <Switch size="small" defaultChecked={p.on} disabled={p.locked}/>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Paper elevation={0} sx={{ mt: 1.75, p: 2.25, bgcolor: 'error.container', color: 'error.onContainer', maxWidth: 920 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Icon name="warning" size={18}/><Typography variant="h5">Close my account</Typography></Stack>
        <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.75 }}>Trips are archived, cards revoked, personal identifiers anonymized. Transaction records retained for tax compliance.</Typography>
        <Button variant="contained" color="error" sx={{ mt: 1.25 }}>Close my account</Button>
      </Paper>
    </MuiScreenFrame>
  );
}

// 2.5.10 — Account Closure (modal confirmation)
function C2510_Closure() {
  const { Box, Stack, Paper, Typography, Button, Avatar, TextField } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={8} sx={{ width: '100%', maxWidth: 520, p: 3.25 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Avatar sx={{ width: 44, height: 44, bgcolor: 'error.container', color: 'error.onContainer' }}><Icon name="warning" size={20}/></Avatar>
            <Box>
              <Typography variant="overline" sx={{ display: 'block', color: 'error.main', fontWeight: 600, lineHeight: 1.3 }}>CONFIRM CLOSURE</Typography>
              <Typography variant="h5" component="h2">Close your Story-Tail account?</Typography>
            </Box>
          </Stack>
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'surface.2', mt: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>WHAT THIS DOES</Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25, typography: 'body2' }}>
              <li>All cards revoked immediately</li>
              <li>5 past trips archived (you can request a final PDF)</li>
              <li>Personal identifiers anonymized in 30 days</li>
              <li>Transaction records retained for tax compliance</li>
            </Box>
          </Paper>
          <TextField label="Reason (optional)" size="small" fullWidth multiline minRows={2} placeholder="Tell us why — helps Gyasi follow up if you reconsider." sx={{ mt: 1.5 }}/>
          <TextField label="Confirm your password" size="small" fullWidth type="password" placeholder="Password" sx={{ mt: 1.25 }}/>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
            <Button variant="outlined">Cancel</Button>
            <Button variant="contained" color="error" sx={{ ml: 'auto' }}>Close my account</Button>
          </Stack>
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.5.11 — Help & Support
function C2511_Help() {
  const { Box, Stack, Paper, Card, CardContent, Typography, Button, TextField, InputAdornment, Accordion, AccordionSummary, AccordionDetails } = MUI;
  const faqs = ['Do I pay a planning fee?', 'How does payment authorization work?', 'Can I revoke a card?', 'How do I add a co-traveler?', 'Is my passport scan safe?', 'How does Inteletravel fit in?'];
  return (
    <MuiScreenFrame role="client" tab="me" padding={28} scrollable>
      <MuiScreenHeader title="Help & support" subtitle="Quick answers, or message Gyasi directly." small/>
      <TextField
        fullWidth placeholder="Search: 'reset password', 'authorize card'…"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={18}/></InputAdornment> } }}
        sx={{ mb: 1.75, '& .MuiInputBase-root': { bgcolor: 'surface.2' } }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1.75 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Popular FAQs</Typography>
          <Stack spacing={0.75}>
            {faqs.map((q) => (
              <Accordion key={q} disableGutters>
                <AccordionSummary expandIcon={<MuiIcon name="chevron_down" size={14}/>}>
                  <Typography variant="subtitle2">{q}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="body2" color="text.secondary">Short answer here — links to the relevant section of the privacy/terms or to Gyasi.</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Box>
        <Stack component="aside" spacing={1.5}>
          <Paper elevation={0} sx={{ p: 2, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
            <Typography variant="subtitle1">Talk to Gyasi</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>Quickest path for anything trip-specific.</Typography>
            <Button variant="contained" size="small" startIcon={<MuiIcon name="message" size={12}/>} sx={{ mt: 1.25 }}>Message Gyasi</Button>
          </Paper>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle1">Platform support</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>For login, payments, or account issues.</Typography>
              <Button variant="outlined" color="secondary" size="small" sx={{ mt: 1.25 }}>support@story-tail.com</Button>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C251_AccountOverview, C252_PersonalInfo, C253_PreferencesEdit, C254_TravelDocs, C255_DocUpload,
  C256_Notifications, C257_Security, C258_Connected, C259_Privacy, C2510_Closure, C2511_Help,
});
