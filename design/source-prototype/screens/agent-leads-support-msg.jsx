/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.8 Leads — 5 screens · 3.9 Login Support — 7 screens · 3.10 Messaging & Templates — 6 screens. (MUI v9)

// Shared modal shell for this file: scrim + centred Paper, drawn in place.
function A38_MuiModal({ maxWidth, children, padding = 2.75 }) {
  const { Box, Paper } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={8} sx={{ width: '100%', maxWidth, p: padding }}>
          {children}
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// Small text field with optional mono input font.
function A38_MuiField({ label, mono, span2, sx, ...rest }) {
  const { TextField } = MUI;
  return (
    <TextField
      label={label} size="small" fullWidth
      sx={{ gridColumn: span2 ? 'span 2' : undefined, ...(mono ? { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } } : {}), ...sx }}
      {...rest}
    />
  );
}

// Filter chip: selected = filled secondary, otherwise outlined. Labels keep their ✓ where the legacy had one.
function A38_MuiFilterChip({ label, on, ...rest }) {
  const { Chip } = MUI;
  return on
    ? <Chip label={label} color="secondary" onClick={() => {}} {...rest}/>
    : <Chip label={label} variant="outlined" onClick={() => {}} {...rest}/>;
}

// ─── 3.8 LEADS ───────────────────────────────────────────────────────────
// 3.8.1 Leads Inbox
function A381_LeadsInbox() {
  const { Box, Stack, Typography, Button, Chip, Card, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const rows = [
    { n: 'Tasha Whitfield', src: 'Self-guided search', want: 'Aruba honeymoon · Oct 12-19', age: '2h', sla: 'ok', val: 3800 },
    { n: 'Eli Park', src: 'Referral · Maya Carter', want: 'Cruise · 4 pax · Spring break', age: '14h', sla: 'ok', val: 9000 },
    { n: 'Linda Gomez', src: 'Marketing form', want: 'All-inclusive · adults-only · Sep', age: '23h', sla: 'warn', val: 5200 },
    { n: 'Kim Wallace', src: 'Search · saved 3 trips', want: 'Solo · Aruba · Jun', age: '2d', sla: 'late', val: 2400 },
    { n: 'Marin & Joe', src: 'Self-guided search', want: 'Sandals St Lucia · honeymoon · Nov', age: '3d', sla: 'late', val: 6800 },
  ];
  return (
    <MuiScreenFrame role="agent" tab="leads" padding={20} scrollable>
      <MuiScreenHeader title="Leads" subtitle="From self-guided search, referrals, and the marketing site." actions={<><A38_MuiFilterChip label="Unread · 3" on/><Chip variant="outlined" label="All sources"/></>} small/>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Lead</TableCell><TableCell>Wants</TableCell><TableCell>Source</TableCell><TableCell align="right">Est. value</TableCell><TableCell>SLA</TableCell><TableCell/>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell><Typography variant="subtitle2">{r.n}</Typography></TableCell>
                <TableCell>{r.want}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.src}</TableCell>
                <TableCell align="right" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700 }}>${r.val.toLocaleString()}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: r.sla === 'ok' ? 'success.main' : r.sla === 'warn' ? 'warning.main' : 'error.main' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'currentColor' }}/>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>{r.age}{r.sla === 'late' && ' · past SLA'}</Typography>
                  </Stack>
                </TableCell>
                <TableCell><Button variant="contained" size="small">Reach out</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.8.2 Lead Detail
function A382_LeadDetail() {
  const { Box, Stack, Typography, Button, Card, CardContent, CardMedia, Paper, Divider } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="leads" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ px: 0, mb: 1 }}>Back to leads</Button>
      <MuiScreenHeader title="Tasha Whitfield · Aruba honeymoon" subtitle="Self-guided search · 2 hours ago · saved 3 trips" actions={<><Button variant="outlined" size="small">Reject</Button><Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="briefcase" size={12}/>}>Convert to trip</Button></>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h5">What they want</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.25, mt: 1.25 }}>
              {[{ l: 'Destination', v: 'Aruba' }, { l: 'Dates', v: 'Oct 12 – 19, 2026' }, { l: 'Travelers', v: '2 adults · honeymoon' }, { l: 'Budget', v: '$3,500 – $4,500 /pp' }, { l: 'Trip type', v: 'All-inclusive · adults-only' }, { l: 'Departure city', v: 'Atlanta (ATL)' }].map((k) => (
                <Box key={k.l}><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{k.l}</Typography><Typography variant="body2" sx={{ mt: 0.25 }}>{k.v}</Typography></Box>
              ))}
            </Box>
            <Divider sx={{ my: 1.75 }}/>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Free-text from form</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, fontStyle: 'italic' }}>"We just got engaged and want something easy + romantic. Both pescatarian. Anniversary is the 14th — anything you can do to make it special would be cool. We've heard great things about Aruba."</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.75 }}>Saved trips · 3</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.25, mt: 0.75 }}>
              {['aruba','sunset','overwater'].map((k, i) => (
                <Card key={i} variant="outlined">
                  <CardMedia component="img" image={staImg(k, 240, 140)} alt="" sx={{ height: 80, objectFit: 'cover' }}/>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Typography variant="subtitle2">{['Aruba Marriott','Bucuti & Tara','Renaissance Aruba'][i]}</Typography>
                    <Typography variant="caption" color="text.secondary">${['3,890','4,210','3,640'][i]}/pp</Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </CardContent>
        </Card>
        <Stack component="aside" spacing={1.5}>
          <Card>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Contact</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>tasha.w@example.com<br/>+1 (404) 555-0192</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }}>
                <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="message" size={12}/>} sx={{ flex: 1 }}>Message</Button>
                <Button variant="outlined" size="small" startIcon={<MuiIcon name="phone" size={12}/>} sx={{ flex: 1 }}>Call</Button>
              </Stack>
            </CardContent>
          </Card>
          <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>No existing account</Typography>
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.5 }}>You can convert to client + trip in one step. Send portal invite afterward.</Typography>
          </Paper>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.8.3 Convert Lead to Trip
function A383_ConvertLead() {
  const { Box, Stack, Typography, Button, Paper, Checkbox, FormControlLabel } = MUI;
  return (
    <A38_MuiModal maxWidth={580}>
      <Typography variant="h5" component="h2">Convert lead to trip · Tasha Whitfield</Typography>
      <Paper variant="outlined" sx={{ p: 1.5, mt: 1.25, bgcolor: 'surface.2' }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>CLIENT</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
          <A38_MuiFilterChip label="Create new client" on/>
          <A38_MuiFilterChip label="Attach to existing"/>
        </Stack>
      </Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A38_MuiField label="First name" defaultValue="Tasha"/>
        <A38_MuiField label="Last name" defaultValue="Whitfield"/>
        <A38_MuiField label="Email" defaultValue="tasha.w@example.com" span2/>
        <A38_MuiField label="Trip name" defaultValue="Whitfield honeymoon · Aruba · Oct 2026" span2/>
        <A38_MuiField label="Trip type" defaultValue="All-inclusive · honeymoon"/>
        <A38_MuiField label="Starting stage" defaultValue="Inquiry"/>
      </Box>
      <FormControlLabel sx={{ mt: 1.5 }} control={<Checkbox defaultChecked size="small"/>} label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Send portal invite with "lead response" template</Typography>}/>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" endIcon={<MuiIcon name="arrow_right" size={12}/>} sx={{ ml: 'auto' }}>Continue to builder</Button>
      </Stack>
    </A38_MuiModal>
  );
}

// 3.8.4 Reject / Archive Lead
function A384_RejectLead() {
  const { Box, Stack, Typography, Button, Checkbox, FormControlLabel } = MUI;
  return (
    <A38_MuiModal maxWidth={480}>
      <Typography variant="h5" component="h2">Archive lead · Linda Gomez</Typography>
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Reason</Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {['Out of region','Budget mismatch ✓','Duplicate','Not responding','Other'].map((t) => <A38_MuiFilterChip key={t} label={t} on={t.includes('✓')}/>)}
        </Stack>
      </Box>
      <Box sx={{ mt: 1.25 }}><A38_MuiField label="Notes (internal)" multiline minRows={2} defaultValue="Budget $1,000/pp · below our supplier minimums."/></Box>
      <FormControlLabel sx={{ mt: 1.25 }} control={<Checkbox size="small"/>} label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Send "thanks but not a fit" template</Typography>}/>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="outlined">Cancel</Button>
        <Button variant="contained" color="error" sx={{ ml: 'auto' }}>Archive lead</Button>
      </Stack>
    </A38_MuiModal>
  );
}

// 3.8.5 Lead Source Analytics
function A385_LeadAnalytics() {
  const { Box, Stack, Typography, Card, CardContent, Divider, LinearProgress } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="leads" padding={24} scrollable>
      <MuiScreenHeader title="Lead source · analytics" subtitle="Where leads come from, how well they convert." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.75 }}>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>By source · last 90 days</Typography>
            {[
              { s: 'Self-guided search', n: 28, conv: 32, c: 'primary.main' },
              { s: 'Referrals', n: 14, conv: 50, c: 'brand.main' },
              { s: 'Marketing site', n: 12, conv: 18, c: 'brandSource.ocean' },
              { s: 'Direct', n: 6, conv: 67, c: 'brandSource.sunset' },
            ].map((r) => (
              <Box key={r.s} sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.c }}/>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>{r.s}</Typography>
                  <Typography variant="caption">{r.n} leads · {r.conv}% conv</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={r.conv} sx={{ mt: 0.75, height: 4, borderRadius: 2, bgcolor: 'surface.3', '& .MuiLinearProgress-bar': { bgcolor: r.c } }}/>
              </Box>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Time to first contact</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', my: 1 }}>1h 42m</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Average across 60 leads · target 2h.</Typography>
            <Divider sx={{ my: 1.5 }}/>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Best converting destination</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Caribbean · 42% conversion</Typography>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// ─── 3.9 LOGIN SUPPORT ──────────────────────────────────────────────────
// 3.9.1 Client Account Management
function A391_AccountMgmt() {
  const { Box, Stack, Typography, Button, Card, CardContent, Paper, Avatar, List, ListItemButton, ListItemAvatar, ListItemText } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ px: 0, mb: 1 }}>Jordan & Sam Hayes</Button>
      <MuiScreenHeader title="Account admin · Jordan Hayes" subtitle="Help less-technical clients. Every action audit-logged." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.75, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Quick actions</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.25 }}>
              {[
                { i: 'refresh', t: 'Send password reset' },
                { i: 'mail', t: 'Send magic-link login' },
                { i: 'check', t: 'Verify email manually' },
                { i: 'users', t: 'Merge duplicate accounts' },
                { i: 'lock', t: 'Lock account' },
                { i: 'list', t: 'View login activity' },
              ].map((a) => (
                <Paper key={a.t} variant="outlined">
                  <ListItemButton sx={{ py: 1, px: 1.5, gap: 1.25 }}>
                    <ListItemAvatar sx={{ minWidth: 0 }}><Avatar sx={{ width: 32, height: 32, bgcolor: 'surface.3', color: 'text.primary' }}><Icon name={a.i} size={14}/></Avatar></ListItemAvatar>
                    <ListItemText primary={a.t} slotProps={{ primary: { variant: 'subtitle2' } }} sx={{ my: 0 }}/>
                    <MuiIcon name="chevron_right" size={14} sx={{ color: 'text.secondary' }}/>
                  </ListItemButton>
                </Paper>
              ))}
            </Box>
          </CardContent>
        </Card>
        <Card component="aside" sx={{ alignSelf: 'start' }}>
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>STATUS</Typography>
            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
              {[{ l: 'Account', v: 'Active', tone: 'booked' }, { l: 'Email', v: 'Verified', tone: 'booked' }, { l: 'MFA', v: 'On · Authy', tone: 'booked' }, { l: 'Last sign-in', v: '2h · Miami iPhone' }].map((s, i) => (
                <Stack key={i} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>{s.l}</Typography>
                  {s.tone ? <MuiStaStatus kind={s.tone}>{s.v}</MuiStaStatus> : <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.v}</Typography>}
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

function ConfirmModal({ title, body, primary, danger, extra }) {
  const { Stack, Typography, Button, Paper } = MUI;
  return (
    <A38_MuiModal maxWidth={480}>
      <Typography variant="h5" component="h2">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{body}</Typography>
      {extra}
      <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, bgcolor: 'surface.2', color: 'text.secondary', display: 'flex', gap: 1, alignItems: 'center' }}>
        <Icon name="list" size={13}/>
        <Typography variant="caption" sx={{ fontWeight: 500 }}>This action is audit-logged and visible to admins.</Typography>
      </Paper>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="outlined">Cancel</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} sx={{ ml: 'auto' }}>{primary}</Button>
      </Stack>
    </A38_MuiModal>
  );
}

// 3.9.2 Send password reset
function A392_SendReset() { return <ConfirmModal title="Send password reset to Jordan?" body="An email goes to jordan.hayes@example.com with a 30-minute link. You won't see the password." primary="Send reset link"/>; }
// 3.9.3 Send magic link
function A393_SendMagic() { return <ConfirmModal title="Send a magic-link sign-in?" body="One-time link valid for 15 minutes. Sent to verified email only." primary="Send magic link"/>; }
// 3.9.4 Verify email manually
function A394_VerifyEmail() {
  return <ConfirmModal title="Manually mark email as verified?" body="Use only after out-of-band confirmation (phone call). Skips standard verification." primary="Mark verified" extra={
    <A38_MuiField label="Confirmation method" defaultValue="Phone call · verified DOB and last 4 of phone" sx={{ mt: 1.5 }}/>
  }/>;
}
// 3.9.5 Lock / unlock
function A395_LockAccount() {
  return <ConfirmModal title="Lock Jordan's account?" body="Prevents new sign-ins. Existing sessions remain. Used for suspected fraud." danger primary="Lock account" extra={
    <A38_MuiField label="Reason" placeholder="e.g. suspicious sign-in from Atlanta" sx={{ mt: 1.5 }}/>
  }/>;
}
// 3.9.6 Client login activity
function A396_LoginActivity() {
  const { Button, Card, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="clients" padding={28} scrollable>
      <MuiScreenHeader title="Login activity · Jordan Hayes" subtitle="Recent sign-ins. Flag anything that looks off." small/>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell><TableCell>Device</TableCell><TableCell>Location</TableCell><TableCell>IP</TableCell><TableCell/>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { d: '2h ago', dev: 'iPhone 17 · Safari', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
              { d: 'Yesterday', dev: 'Mac · Chrome', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
              { d: 'May 6 · 11:42p', dev: 'Android · Chrome', loc: 'Atlanta, GA', ip: '24.117.220.5', warn: true },
              { d: 'May 4 · 7:08p', dev: 'iPhone 17 · Safari', loc: 'Miami, FL', ip: '99.244.18.4', warn: false },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell>{r.d}</TableCell>
                <TableCell>{r.dev}</TableCell>
                <TableCell sx={{ color: r.warn ? 'error.main' : 'text.secondary' }}>{r.warn && '⚠ '}{r.loc}</TableCell>
                <TableCell sx={{ fontFamily: (t) => t.typography.mono, fontSize: 12, color: 'text.secondary' }}>{r.ip}</TableCell>
                <TableCell>{r.warn ? <Button variant="outlined" size="small">Flag</Button> : <MuiStaStatus kind="booked">Trusted</MuiStaStatus>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}
// 3.9.7 Merge duplicate accounts (reuse CRM)
function A397_MergeFromAdmin() {
  return <ConfirmModal title="Merge sam@example.com into jordan.hayes@example.com?" body="The source account becomes inactive; trips & cards roll up to the target. Best done on desktop." primary="Open merge tool →"/>;
}

// ─── 3.10 MESSAGING & TEMPLATES ──────────────────────────────────────────
// 3.10.1 Agent Inbox
function A3101_AgentInbox() {
  const { Box, Stack, Typography, Button, IconButton, Chip, Avatar, Paper, List, ListItemButton, Switch, TextField, InputAdornment } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="msg" padding={0}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ px: 1.75, pt: 1.75, pb: 0.75 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>Inbox</Typography>
            <Typography variant="caption" color="text.secondary">5 unread · 2 past SLA</Typography>
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ px: 1.75, pb: 1, flexWrap: 'wrap' }}>
            {['Unread ✓','By client','By trip','SLA past'].map((t) => <A38_MuiFilterChip key={t} label={t} on={t.includes('✓')} size="small"/>)}
          </Stack>
          <List disablePadding sx={{ flex: 1, overflow: 'auto' }}>
            {[
              { who: 'Maya Carter', m: '"Yes lock the upgrade!"', t: '2:14p', trip: 'Sandals · Jul', u: 2, a: 'avatarA', active: true },
              { who: 'Aisha Patel', m: '"Anything for under $3k?"', t: '11:22a', trip: 'Princess · May', u: 1, a: 'avatarE' },
              { who: 'Tasha Whitfield', m: '"Got your email — when can we…"', t: '10:08a', trip: 'Lead', u: 1, a: 'avatarE', warn: true },
              { who: 'Westbrook fam', m: '"Authorizing today, sorry for delay"', t: 'Yest', trip: 'Symphony · Dec', u: 0, a: 'avatarB' },
              { who: 'Linda Gomez', m: '"Can we talk tonight?"', t: 'May 12', trip: '—', u: 0, a: 'avatarA' },
            ].map((t, i) => (
              <ListItemButton key={i} selected={!!t.active} sx={{ px: 1.75, py: 1.5, gap: 1.25, alignItems: 'flex-start', borderLeft: 3, borderColor: t.active ? 'brand.main' : 'transparent' }}>
                <Avatar src={staImg(t.a, 64, 64)} alt="" sx={{ width: 32, height: 32 }}/>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row">
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>{t.who}</Typography>
                    <Typography variant="caption" sx={{ color: t.warn ? 'error.main' : 'text.secondary' }}>{t.warn && '⚠ '}{t.t}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t.m}</Typography>
                  <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, fontSize: 10, lineHeight: 1, mt: 0.5 }}>· {t.trip}</Typography>
                </Box>
                {t.u > 0 && <Chip size="small" color="brand" label={t.u} sx={{ height: 20, fontWeight: 700, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }}/>}
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack direction="row" spacing={1.25} sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}>
            <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 36, height: 36 }}/>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Maya Carter · Sandals · Jul honeymoon</Typography>
              <Typography variant="caption" color="text.secondary">Last reply 2 min ago · client online</Typography>
            </Box>
            <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="briefcase" size={12}/>}>Open trip</Button>
          </Stack>
          <Stack spacing={1} sx={{ flex: 1, p: 2.25, overflow: 'auto' }}>
            {[
              { mine: false, t: '11:14a', b: "Yes lock the upgrade! 🥹" },
              { mine: true, t: '11:16a', b: 'Done — bungalow is yours. Sending the new proposal with adjusted balance now.' },
            ].map((m, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                <Paper elevation={m.mine ? 0 : 1} sx={{ maxWidth: '70%', px: 1.75, py: 1.25, bgcolor: m.mine ? 'primary.main' : 'background.paper', color: m.mine ? 'primary.contrastText' : 'text.primary', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px' }}>
                  <Typography variant="body2">{m.b}</Typography>
                </Paper>
              </Box>
            ))}
          </Stack>
          <Box sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <TextField
              fullWidth size="small" placeholder="Type a reply…"
              slotProps={{
                input: {
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <MuiIcon name="sparkle" size={14} sx={{ color: 'brand.main' }}/>
                        <Typography variant="caption" color="text.secondary">Use template ▾</Typography>
                      </Stack>
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Internal note</Typography>
                        <Switch size="small"/>
                        <IconButton size="small" color="primary"><MuiIcon name="send" size={14}/></IconButton>
                      </Stack>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.10.2 Conversation Thread (Agent View) — similar to inbox view but full bleed
function A3102_AgentThread() { return <A3101_AgentInbox/>; /* same component; the inbox shows the thread */ }

// 3.10.3 Template Picker
function A3103_TemplatePicker() {
  const { Box, Stack, Typography, Button, IconButton, Paper, List, ListItemButton, ListItemText } = MUI;
  return (
    <A38_MuiModal maxWidth={720} padding={2.5}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.5 }}>
        <MuiIcon name="sparkle" size={18} sx={{ color: 'brand.main' }}/>
        <Typography variant="h5" component="h2">Insert a template</Typography>
        <IconButton size="small" sx={{ ml: 'auto' }}><MuiIcon name="close" size={16}/></IconButton>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 1.5 }}>
        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'surface.2' }}>
          <List dense disablePadding>
            {['Lead response ✓','Proposal · honeymoon','Booking confirmation','Pre-trip · 14 day','Pre-trip · 7 day','Post-trip survey','Payment reminder'].map((t) => (
              <ListItemButton key={t} selected={t.includes('✓')} sx={{ borderRadius: 1, py: 0.75, px: 1.25, mb: 0.25 }}>
                <ListItemText primary={t} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 500 } } }} sx={{ my: 0 }}/>
              </ListItemButton>
            ))}
          </List>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.75 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>PREVIEW · WITH JORDAN HAYES MERGED</Typography>
          <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.55 }}>
            Hey <b>Jordan</b>, thanks for reaching out about <b>Sandals Royal Bahamian</b>. I'd love to put together a couple options for <b>Aug 12 – 19</b> — give me a few hours and I'll come back with two routes I'd actually want for you.
            <br/><br/>— Gyasi
          </Typography>
        </Paper>
      </Box>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="outlined" color="secondary" sx={{ ml: 'auto' }}>Insert & edit</Button>
        <Button variant="contained">Insert as-is</Button>
      </Stack>
    </A38_MuiModal>
  );
}

// 3.10.4 Template Library
function A3104_TemplateLibrary() {
  const { Box, Stack, Typography, Button, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="msg" padding={24} scrollable>
      <MuiScreenHeader title="Templates" subtitle="Reusable email + in-app messages. Grouped by stage." actions={<Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>New template</Button>} small/>
      {[
        { g: 'Lead', items: [{ n: 'Lead response · within 2h', uses: 42 }, { n: 'Lead · not a fit', uses: 8 }] },
        { g: 'Proposal', items: [{ n: 'Proposal · honeymoon · 2 options', uses: 18 }, { n: 'Proposal · family cruise', uses: 11 }] },
        { g: 'Booking', items: [{ n: 'Booking confirmation', uses: 34 }, { n: 'Payment authorization needed', uses: 28 }] },
        { g: 'Pre / post', items: [{ n: 'Pre-trip · 14 day reminder', uses: 24 }, { n: 'Pre-trip · 7 day reminder', uses: 22 }, { n: 'Post-trip · survey', uses: 19 }] },
      ].map((g) => (
        <Box key={g.g} sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{g.g}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.25, mt: 1 }}>
            {g.items.map((t) => (
              <Card key={t.n}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t.n}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>Used {t.uses}× · last edited Apr 22</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                    <Button variant="outlined" color="secondary" size="small" sx={{ flex: 1 }}>Edit</Button>
                    <Button variant="text" size="small" sx={{ minWidth: 0 }}><MuiIcon name="copy" size={12}/></Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      ))}
    </MuiScreenFrame>
  );
}

// 3.10.5 Template Editor
function A3105_TemplateEditor() {
  const { Box, Stack, Typography, Button, Chip, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="msg" padding={0}>
      <Stack direction="row" spacing={1.25} sx={{ px: 3.5, py: 1.75, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Templates · Proposal</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Proposal · honeymoon · 2 options</Typography>
        </Box>
        <Button variant="text">Auto-save</Button>
        <Button variant="outlined" color="secondary">Preview</Button>
        <Button variant="contained">Save</Button>
      </Stack>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', minHeight: 0 }}>
        <Box sx={{ p: 2.25, overflow: 'auto', borderRight: 1, borderColor: 'divider' }}>
          <A38_MuiField label="Subject" defaultValue="Your honeymoon · two options to choose from"/>
          <Box sx={{ mt: 1.25 }}>
            <A38_MuiField label="Body · rich text" multiline minRows={11} mono sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} defaultValue={`Hey {{client.firstName}},\n\nFinally have the two honeymoon options I love most for {{trip.destination}} ({{trip.dates}}). Take your time — I'll be around to chat through them.\n\nOption A · {{option.A.title}} — {{option.A.price}}\nOption B · {{option.B.title}} — {{option.B.price}}\n\nPing me whenever.\n— Gyasi`}/>
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
            {['{{client.firstName}}','{{trip.destination}}','{{trip.dates}}','{{option.A.title}}','{{option.A.price}}','{{agent.name}}'].map((t) => <Chip key={t} size="small" variant="outlined" label={t} sx={{ fontFamily: (th) => th.typography.mono, fontSize: 10.5, height: 22 }}/>)}
          </Stack>
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Tags</Typography>
            <Stack direction="row" spacing={0.75}>{['Honeymoon','Proposal','Sandals','2 options'].map((t) => <Chip key={t} variant="outlined" label={t}/>)}</Stack>
          </Box>
        </Box>
        <Box sx={{ p: 2.25, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>LIVE PREVIEW · WITH SAMPLE DATA</Typography>
          <Card sx={{ mt: 0.75 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Your honeymoon · two options to choose from</Typography>
              <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.55 }}>
                Hey <b>Jordan</b>,<br/><br/>
                Finally have the two honeymoon options I love most for <b>Nassau, Bahamas</b> (<b>Aug 12 – 19, 2026</b>). Take your time — I'll be around to chat through them.<br/><br/>
                <b>Option A</b> · Beachfront Walkout — <b>$3,290 / pp</b><br/>
                <b>Option B</b> · Over-water bungalow — <b>$3,970 / pp</b><br/><br/>
                Ping me whenever.<br/>— Gyasi
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.10.6 Bulk Send
function A3106_BulkSend() {
  const { Box, Stack, Typography, Button, Card, CardContent, Paper } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="msg" padding={28} scrollable>
      <MuiScreenHeader title="Bulk send · monthly hot deals" subtitle="Web-only. Segment + template + send." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Segment</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
              {['Active clients ✓','Caribbean travelers ✓','Past honeymooners','VIP','Inactive 6mo'].map((t) => <A38_MuiFilterChip key={t} label={t} on={t.includes('✓')}/>)}
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1.25, bgcolor: 'surface.2' }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>MATCHES</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>34 clients</Typography>
            </Paper>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Template</Typography>
            <A38_MuiField sx={{ mt: 1 }} defaultValue="Hot deals · May 2026 · Caribbean focus"/>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mt: 1.5 }}>SCHEDULE</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
              <A38_MuiFilterChip label="Send now" on/>
              <A38_MuiFilterChip label="Schedule for…"/>
            </Stack>
          </CardContent>
        </Card>
        <Card sx={{ gridColumn: 'span 2' }}>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Preview · merged for first 3 recipients</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, mt: 1 }}>
              {['Jordan Hayes','Maya Carter','Aisha Patel'].map((n) => (
                <Paper key={n} variant="outlined" sx={{ p: 1.5, bgcolor: 'surface.2' }}>
                  <Typography variant="subtitle2">To: {n}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>"Hey {n.split(' ')[0]} — 6 Caribbean trips just dropped 18%…"</Typography>
                </Paper>
              ))}
            </Box>
            <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
              <Button variant="text">Cancel</Button>
              <Button variant="outlined" color="secondary" sx={{ ml: 'auto' }}>Save draft</Button>
              <Button variant="contained" startIcon={<MuiIcon name="send" size={12}/>}>Send to 34</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  A381_LeadsInbox, A382_LeadDetail, A383_ConvertLead, A384_RejectLead, A385_LeadAnalytics,
  A391_AccountMgmt, A392_SendReset, A393_SendMagic, A394_VerifyEmail, A395_LockAccount, A396_LoginActivity, A397_MergeFromAdmin,
  A3101_AgentInbox, A3102_AgentThread, A3103_TemplatePicker, A3104_TemplateLibrary, A3105_TemplateEditor, A3106_BulkSend,
});
