/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, StaMuiTokens, StaMuiThemes */
// Agent · 3.11 Reporting — 8 screens · 3.12 Agent Profile & Settings — 5 screens.
// MUI v9 build. Charts are hand-drawn Box/SVG drawings in theme palette colors
// (no chart library). Copy is unchanged from the legacy version.

// ─── 3.11 REPORTING ──────────────────────────────────────────────────────

// 3.11.1 Reports Hub
function A3111_ReportsHub() {
  const { Box, Typography, Card, CardActionArea, Grid } = MUI;
  const tiles = [
    { i: 'chart', t: 'Revenue by month', s: 'Line · YoY toggle', fav: true },
    { i: 'dollar', t: 'Commission by supplier', s: 'Bar + table' },
    { i: 'pin', t: 'Top destinations', s: 'Map + ranking' },
    { i: 'users', t: 'Client lifetime value', s: 'Cohort analysis' },
    { i: 'trend_up', t: 'Conversion funnel', s: 'Lead → Booked → Travelled', fav: true },
    { i: 'briefcase', t: 'Pipeline value', s: 'Forecast · weighted' },
    { i: 'clock', t: 'Time-to-book', s: 'Inquiry → confirmation' },
    { i: 'download', t: 'Export center', s: 'CSV / Excel for tax' },
  ];
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <MuiScreenHeader title="Reports" subtitle="Snapshot of the business. All exportable." small/>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>FAVORITES &amp; RECENT</Typography>
      <Grid container spacing={1.5}>
        {tiles.map((t) => (
          <Grid key={t.t} size={3}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: t.fav ? 'brand.main' : 'divider', borderWidth: t.fav ? 1.5 : 1 }}>
              <CardActionArea sx={{ p: 2, height: '100%', position: 'relative', alignItems: 'flex-start' }}>
                {t.fav && (
                  <Box sx={{ position: 'absolute', top: 12, right: 12, color: 'brand.main', display: 'inline-flex' }}>
                    <Icon name="star" size={14} color="currentColor" fill="currentColor"/>
                  </Box>
                )}
                <Box sx={{ width: 38, height: 38, borderRadius: 1, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.i} size={18}/>
                </Box>
                <Typography variant="subtitle1" sx={{ mt: 1.25, lineHeight: 1.3 }}>{t.t}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{t.s}</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </MuiScreenFrame>
  );
}

function ReportShell({ title, sub, children }) {
  const { Box, Button, Chip } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <Box sx={{ mb: 0.75 }}>
        <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={12}/>} sx={{ px: 0, minWidth: 0 }}>Reports hub</Button>
      </Box>
      <MuiScreenHeader title={title} subtitle={sub} actions={<>
        <Chip color="secondary" label="YTD" onClick={() => {}}/>
        <Chip variant="outlined" label="12mo" onClick={() => {}}/>
        <Chip variant="outlined" label="QTD" onClick={() => {}}/>
        <Button variant="outlined" size="small" startIcon={<MuiIcon name="download" size={12}/>}>Export</Button>
      </>} small/>
      {children}
    </MuiScreenFrame>
  );
}

// 3.11.2 Revenue by month
function A3112_Revenue() {
  const { Box, Stack, Typography, Card, CardContent, Chip } = MUI;
  const bars = [21,30,38,24,31,42,58,41,36,45,49,43];
  const max = 65;
  return (
    <ReportShell title="Revenue by month" sub="Booked dollars per month · YoY toggle.">
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: 'flex-end', mb: 1.25 }}>
            <Typography variant="h3" sx={{ m: 0 }}>$498,440 <Typography component="span" variant="body2" color="text.secondary">YTD</Typography></Typography>
            <Chip label="+22% vs LY" sx={{ ml: 'auto', bgcolor: 'success.container', color: 'success.main', fontWeight: 600 }}/>
          </Stack>
          <Box sx={{ height: 220, display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
            {bars.map((v, i) => (
              <Box key={i} sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                <Box sx={{ width: '60%', height: `${(v/max)*100}%`, bgcolor: i === 11 ? 'brand.main' : 'primary.main', borderRadius: '4px 4px 0 0' }}/>
                <Typography variant="caption" color="text.secondary">{['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'][i]}</Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// 3.11.3 Commission by supplier
function A3113_CommBySupplier() {
  const { Box, Stack, Typography, Card, CardContent, LinearProgress } = MUI;
  // Supplier colors come from the theme so the dark scheme re-colors the chart.
  const rows = [
    { n: 'Sandals', v: 8420, c: 'primary', p: 38 },
    { n: 'Royal Caribbean', v: 5310, c: 'tertiary', p: 24 },
    { n: 'Atlantis', v: 4180, c: 'brand', p: 18 },
    { n: 'Princess', v: 2210, c: 'secondary', p: 10 },
    { n: 'Carnival', v: 1480, c: 'info', p: 7 },
    { n: 'Other', v: 740, c: 'inherit', p: 3 },
  ];
  return (
    <ReportShell title="Commission by supplier" sub="Where the money's coming from.">
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          {rows.map((r) => (
            <Box key={r.n} sx={{ py: 1.25, borderTop: 1, borderColor: 'divider' }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.c === 'inherit' ? 'outline.main' : `${r.c}.main` }}/>
                <Typography variant="subtitle1" sx={{ flex: 1 }}>{r.n}</Typography>
                <Typography variant="body2" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>${r.v.toLocaleString()}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: 'right' }}>{r.p}%</Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={r.p}
                color={r.c}
                sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: 'surface.3',
                      ...(r.c === 'inherit' ? { '& .MuiLinearProgress-bar': { bgcolor: 'outline.main' } } : {}) }}
              />
            </Box>
          ))}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// 3.11.4 Top destinations
function A3114_TopDestinations() {
  const { Box, Grid, Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell, Paper } = MUI;
  const rows = [
    { n: 'Bahamas', trips: 18, rev: 92400 },
    { n: 'Turks & Caicos', trips: 14, rev: 81200 },
    { n: 'Jamaica', trips: 11, rev: 58400 },
    { n: 'Aruba', trips: 7, rev: 32100 },
    { n: 'St Lucia', trips: 5, rev: 28600 },
    { n: 'Mexico', trips: 4, rev: 19200 },
  ];
  const mono = (t) => t.typography.mono;
  return (
    <ReportShell title="Top destinations" sub="By trip count and revenue.">
      <Grid container spacing={1.75}>
        <Grid size={7}>
          <Card sx={{ position: 'relative', overflow: 'hidden', minHeight: 320, height: '100%' }}>
            <Box component="img" src={staImg('aruba', 800, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, filter: 'saturate(0.8) brightness(0.7)' }}/>
            {/* Fixed navy scrim over the photo so the pins read in both schemes. */}
            <Box sx={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.4)' }}/>
            {rows.map((r, i) => (
              <Paper key={r.n} elevation={1} sx={{
                position: 'absolute', top: `${20 + i*12}%`, left: `${15 + (i%3)*25}%`,
                bgcolor: '#FFF', color: (t) => t.palette.brandSource.burgundy,
                px: 1.25, py: 0.75, borderRadius: 999, fontWeight: 700, fontSize: 11.5, lineHeight: 1,
              }}>{r.n} · {r.trips}</Paper>
            ))}
          </Card>
        </Grid>
        <Grid size={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Destination</TableCell>
                    <TableCell align="right">Trips</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.n} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{r.n}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: mono }}>{r.trips}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700 }}>${r.rev.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </ReportShell>
  );
}

// 3.11.5 Client lifetime value
function A3115_LTV() {
  const { Card, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <ReportShell title="Client lifetime value" sub="Ranked. Click into a client for cohort analysis.">
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Rank</TableCell>
              <TableCell>Client</TableCell>
              <TableCell align="right">Trips</TableCell>
              <TableCell align="right">LTV</TableCell>
              <TableCell align="right">Comm</TableCell>
              <TableCell>Cohort</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { n: 'Maya & Daniel Carter', tr: 4, ltv: 28420, c: 3811, co: '2023 Q4' },
              { n: 'Jordan & Sam Hayes', tr: 3, ltv: 18640, c: 2610, co: '2024 Q1' },
              { n: 'Westbrook family', tr: 3, ltv: 17240, c: 2068, co: '2024 Q2' },
              { n: 'Reggie & Marc', tr: 3, ltv: 15820, c: 2373, co: '2023 Q3' },
              { n: 'Khan family', tr: 2, ltv: 11200, c: 1456, co: '2024 Q4' },
            ].map((r, i) => (
              <TableRow key={r.n} hover>
                <TableCell sx={{ fontFamily: mono, fontWeight: 700 }}>{i + 1}</TableCell>
                <TableCell>{r.n}</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono }}>{r.tr}</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700 }}>${r.ltv.toLocaleString()}</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono, color: 'primary.main' }}>${r.c.toLocaleString()}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.co}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </ReportShell>
  );
}

// 3.11.6 Conversion funnel
function A3116_Funnel() {
  const { Box, Stack, Typography, Card, CardContent } = MUI;
  const stages = [{ s: 'Lead', n: 142, w: 100 }, { s: 'Qualified', n: 96, w: 68 }, { s: 'Proposal', n: 54, w: 38 }, { s: 'Booked', n: 38, w: 27 }, { s: 'Travelled', n: 32, w: 23 }];
  const tone = (i) => i === 0
    ? { bgcolor: 'primary.container', color: 'primary.onContainer' }
    : i === stages.length - 1
      ? { bgcolor: 'success.container', color: 'text.primary' }
      : { bgcolor: 'secondary.container', color: 'secondary.onContainer' };
  return (
    <ReportShell title="Conversion funnel" sub="142 leads → 32 travelled · 22.5% end-to-end.">
      <Card>
        <CardContent sx={{ p: 3.5 }}>
          {stages.map((s, i) => (
            <Stack key={s.s} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }}>
              <Typography variant="subtitle1" sx={{ flex: '0 0 110px' }}>{s.s}</Typography>
              <Box sx={{ flex: 1, position: 'relative' }}>
                <Box sx={{ width: `${s.w}%`, height: 38, ...tone(i), borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.75 }}>
                  <Typography variant="subtitle1" sx={{ color: 'inherit' }}>{s.n} trips</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 600, color: 'inherit' }}>{s.w}%</Typography>
                </Box>
              </Box>
              {i < stages.length - 1 && <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>−{stages[i].n - stages[i+1].n} drop</Typography>}
            </Stack>
          ))}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// 3.11.7 Pipeline value
function A3117_PipelineValue() {
  return <A3116_Funnel/>; // visually similar
}

// 3.11.8 Export Center
function A3118_ExportCenter() {
  const { Box, Stack, Typography, Grid, Card, CardContent, TextField, Checkbox, FormControlLabel, Button, Chip, IconButton } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <MuiScreenHeader title="Export center" subtitle="CSV / Excel exports for tax prep and accounting. Web-only." small/>
      <Grid container spacing={1.75} sx={{ maxWidth: 1080 }}>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1">Generate export</Typography>
              <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                <Grid size={6}><TextField label="Type" size="small" fullWidth defaultValue="Commission ledger"/></Grid>
                <Grid size={6}><TextField label="Format" size="small" fullWidth defaultValue="CSV"/></Grid>
                <Grid size={6}><TextField label="From" size="small" fullWidth defaultValue="Jan 1, 2026"/></Grid>
                <Grid size={6}><TextField label="To" size="small" fullWidth defaultValue="May 14, 2026"/></Grid>
              </Grid>
              <FormControlLabel
                sx={{ mt: 1, ml: 0 }}
                control={<Checkbox defaultChecked size="small" sx={{ p: 0.5, mr: 0.5 }}/>}
                label={<Typography variant="body2" sx={{ fontWeight: 500, fontSize: 12.5 }}>Include PII (client names, emails) · audit-logged</Typography>}
              />
              <Button variant="contained" fullWidth startIcon={<MuiIcon name="download" size={12}/>} sx={{ mt: 1.5 }}>Generate</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1">Recent exports</Typography>
              {[
                { n: 'commission-jan-apr-2026.csv', s: '24 KB · May 12', ok: true },
                { n: 'clients-roster-2026.xlsx', s: '88 KB · May 04', ok: true },
                { n: 'pipeline-q1-2026.csv', s: '14 KB · Apr 01', expired: true },
              ].map((f) => (
                <Stack key={f.n} direction="row" spacing={1} sx={{ alignItems: 'center', py: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ width: 28, height: 34, borderRadius: 0.5, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 8, lineHeight: 1, flexShrink: 0 }}>CSV</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap sx={{ fontSize: 12.5 }}>{f.n}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: f.expired ? 'text.secondary' : 'text.primary' }}>{f.s} {f.expired && '· expired'}</Typography>
                  </Box>
                  {f.expired
                    ? <Chip variant="outlined" size="small" label="Re-generate" onClick={() => {}}/>
                    : <IconButton size="small"><MuiIcon name="download" size={14}/></IconButton>}
                </Stack>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </MuiScreenFrame>
  );
}

// ─── 3.12 AGENT PROFILE & SETTINGS ──────────────────────────────────────

// 3.12.1 Agent Profile / My Account
function A3121_AgentProfile() {
  const { Box, Stack, Typography, Grid, Card, CardContent, Paper, TextField, Button, Avatar } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <MuiScreenHeader title="My profile" subtitle="What clients see in emails and the portal." actions={<><Button variant="text">Cancel</Button><Button variant="contained">Save</Button></>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center', mb: 1.75 }}>
              <Avatar src={staImg('avatarA', 200, 200)} alt="" sx={{ width: 84, height: 84 }}/>
              <Box>
                <Typography variant="subtitle1">Profile photo</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>JPG / PNG · 400×400+</Typography>
                <Button variant="outlined" color="secondary" size="small" sx={{ mt: 0.75 }}>Upload new</Button>
              </Box>
            </Stack>
            <Grid container spacing={1.25}>
              <Grid size={6}><TextField label="Name" size="small" fullWidth defaultValue="Gyasi Story"/></Grid>
              <Grid size={6}><TextField label="Pronouns" size="small" fullWidth defaultValue="she/her"/></Grid>
              <Grid size={6}><TextField label="Email" size="small" fullWidth defaultValue="gyasi@story-tail.com"/></Grid>
              <Grid size={6}><TextField label="Phone" size="small" fullWidth defaultValue="+1 (305) 555-0184"/></Grid>
              <Grid size={12}><TextField label="Bio · client-facing" size="small" fullWidth multiline minRows={2} defaultValue="Caribbean specialist hosted by Inteletravel. Honeymoons, family cruises, and that one all-inclusive week you'll talk about for years."/></Grid>
              <Grid size={6}><TextField label="Instagram" size="small" fullWidth defaultValue="@story.tail.gyasi"/></Grid>
              <Grid size={6}><TextField label="LinkedIn" size="small" fullWidth defaultValue="linkedin.com/in/gyasistory"/></Grid>
            </Grid>
          </CardContent>
        </Card>
        <Card component="aside">
          <CardContent sx={{ p: 1.75 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>HOW YOU APPEAR</Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'surface.2' }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Avatar src={staImg('avatarA', 80, 80)} alt="" sx={{ width: 44, height: 44 }}/>
                <Box>
                  <Typography variant="subtitle1">Gyasi · Travel Advisor</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Online · reply in &lt; 2h</Typography>
                </Box>
              </Stack>
            </Paper>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.12.2 Calendar / Availability
function A3122_AgentCalendar() {
  const { Box, Stack, Typography, Card, CardContent, Paper, Button, Divider, Switch } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <MuiScreenHeader title="Availability" subtitle="Working hours, time zone, OOO, calendar sync." actions={<Button variant="contained" size="small">Save</Button>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.75 }}>
        <Card>
          <CardContent sx={{ p: 2.25 }}>
            <Typography variant="subtitle1">Working hours</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Time zone · America/New_York</Typography>
            <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '60px repeat(12,1fr)', gap: '2px' }}>
              <Box/>
              {['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'].map((h) => <Typography key={h} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{h}</Typography>)}
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, di) => (
                <React.Fragment key={d}>
                  <Typography variant="subtitle2" sx={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>{d}</Typography>
                  {Array.from({ length: 12 }).map((_, hi) => {
                    const on = di < 5 && hi >= 1 && hi <= 9;
                    return <Box key={hi} sx={{ height: 22, borderRadius: 0.5, bgcolor: on ? 'primary.main' : 'surface.3' }}/>;
                  })}
                </React.Fragment>
              ))}
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.25 }}>
            <Typography variant="subtitle1">Out of office</Typography>
            <Paper elevation={0} sx={{ p: 1.5, mt: 1, bgcolor: 'warning.container', color: 'text.primary' }}>
              <Typography variant="subtitle1">Jul 4 – Jul 7</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>Auto-reply enabled · Aria covering</Typography>
            </Paper>
            <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="plus" size={12}/>} sx={{ mt: 1.25 }}>Schedule OOO</Button>
            <Divider sx={{ my: 1.75 }}/>
            <Typography variant="subtitle1">Calendar sync</Typography>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {[{ n: 'Google Calendar', on: true }, { n: 'Apple Calendar', on: false }].map((c) => (
                <Stack key={c.n} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{c.n}</Typography>
                  <Switch size="small" checked={c.on} onChange={() => {}}/>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.12.3 Agent Notification Preferences
function A3123_AgentNotifs() {
  const { Card, TableContainer, Table, TableHead, TableBody, TableRow, TableCell, Button, Switch } = MUI;
  const rows = [
    { l: 'New lead', e: true, p: true, s: true },
    { l: 'Client message', e: true, p: true, s: false },
    { l: 'Status change · auto', e: true, p: false, s: false },
    { l: 'Payment activity · client', e: true, p: true, s: false },
    { l: 'Commission received', e: true, p: false, s: false },
    { l: 'SLA approaching', e: true, p: true, s: true },
  ];
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={24} scrollable>
      <MuiScreenHeader title="Notifications · you" subtitle="When and how you get pinged." actions={<Button variant="contained" size="small">Save</Button>} small/>
      <TableContainer component={Card} sx={{ maxWidth: 720 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Trigger</TableCell>
              <TableCell align="center">Email</TableCell>
              <TableCell align="center">Push</TableCell>
              <TableCell align="center">SMS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.l} hover>
                <TableCell sx={{ fontWeight: 500, py: 1 }}>{r.l}</TableCell>
                {['e','p','s'].map((k) => (
                  <TableCell key={k} align="center" sx={{ py: 1 }}>
                    <Switch size="small" checked={r[k]} onChange={() => {}}/>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </MuiScreenFrame>
  );
}

// 3.12.4 Email Signature Configuration
function A3124_AgentSignature() {
  const { Box, Typography, Card, CardContent, Paper, TextField, Button, Divider } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <MuiScreenHeader title="Email signature" subtitle="Appended to every outbound email. Story-Tail brand baked in." actions={<Button variant="contained" size="small">Save</Button>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>EDIT</Typography>
            <TextField
              multiline minRows={10} fullWidth size="small"
              sx={{ mt: 0.75, '& textarea': { fontFamily: (t) => t.typography.mono, fontSize: 12 } }}
              defaultValue={`{{agent.name}}, Travel Advisor\nStory-Tail Adventures · Hosted by Inteletravel\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\n— Making travel an adventure —`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>RENDERED · DESKTOP &amp; MOBILE EMAIL</Typography>
            <Paper variant="outlined" sx={{ p: 1.75, mt: 1, bgcolor: 'background.paper' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>From: Gyasi Story &lt;gyasi@story-tail.com&gt;</Typography>
              <Divider sx={{ my: 1 }}/>
              <Typography variant="body2" sx={{ mb: 1.5 }}>Hey Maya, here's your proposal…</Typography>
              <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25 }}>
                <Typography variant="subtitle1">Gyasi Story, Travel Advisor</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Story-Tail Adventures · Hosted by Inteletravel</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>+1 (305) 555-0184 · gyasi@story-tail.com</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'brand.main', fontWeight: 700, mt: 0.5 }}>— Making travel an adventure —</Typography>
              </Box>
            </Paper>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.12.5 Branding Settings
function A3125_Branding() {
  const { Box, Stack, Typography, Card, CardContent, Paper, Chip, Divider, FormLabel, ButtonGroup, IconButton } = MUI;
  // The master palette is content, not theming: it stays the same in both
  // schemes, so the swatches read from the raw brand token tables.
  const { BRAND, TOKENS } = StaMuiTokens;
  const tropicalBlue = StaMuiThemes.dark.palette.info.main;
  const master = [BRAND.burgundy, BRAND.orange, BRAND.gold, tropicalBlue, BRAND.navy];
  const accents = [BRAND.burgundy, BRAND.orange, tropicalBlue, TOKENS.dark.tertiary];
  return (
    <MuiScreenFrame role="agent" tab="reports" padding={28} scrollable>
      <MuiScreenHeader title="Branding · multi-agent (future)" subtitle="When other advisors join under Story-Tail, allow tasteful per-agent variants." actions={<Chip label="Phase 3+ · preview" sx={{ bgcolor: 'warning.container', color: 'text.primary' }}/>} small/>
      <Card sx={{ maxWidth: 720 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Typography variant="subtitle1">Master brand · locked</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {master.map((c) => <Box key={c} sx={{ width: 48, height: 48, borderRadius: 1, bgcolor: c }}/>)}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>Story-Tail Adventures master palette. Read-only.</Typography>

          <Divider sx={{ my: 2.25 }}/>

          <Typography variant="subtitle1">Per-agent overrides</Typography>
          <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'surface.2' }}>
            <Typography variant="caption" sx={{ display: 'block' }}>Allowed:</Typography>
            <Box component="ul" sx={{ m: '4px 0 0', pl: 2.25, fontSize: 12.5, lineHeight: 1.55 }}>
              <li>Personal headshot &amp; bio</li>
              <li>Phone &amp; email merge fields</li>
              <li>Optional accent color from approved sub-palette</li>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>Not allowed:</Typography>
            <Box component="ul" sx={{ m: '4px 0 0', pl: 2.25, fontSize: 12.5, lineHeight: 1.55, color: 'text.secondary' }}>
              <li>Logo replacement</li>
              <li>Off-brand fonts</li>
              <li>Removing "Hosted by Inteletravel" footer</li>
            </Box>
          </Paper>
          <Box sx={{ mt: 1.75 }}>
            <FormLabel sx={{ display: 'block', mb: 0.75, fontSize: 12 }}>Your accent color (from approved sub-palette)</FormLabel>
            <Stack direction="row" spacing={0.75}>
              {accents.map((c, i) => (
                <IconButton key={c} aria-label={c} sx={{
                  width: 42, height: 42, borderRadius: 1, bgcolor: c,
                  border: i === 0 ? 3 : 1, borderStyle: 'solid', borderColor: i === 0 ? 'text.primary' : 'divider',
                  '&:hover': { bgcolor: c },
                }}/>
              ))}
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  A3111_ReportsHub, A3112_Revenue, A3113_CommBySupplier, A3114_TopDestinations,
  A3115_LTV, A3116_Funnel, A3117_PipelineValue, A3118_ExportCenter,
  A3121_AgentProfile, A3122_AgentCalendar, A3123_AgentNotifs, A3124_AgentSignature, A3125_Branding,
});
