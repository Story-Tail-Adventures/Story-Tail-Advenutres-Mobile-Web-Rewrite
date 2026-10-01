/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader */
// Agent · 3.6 Payment & Card Management — 7 screens. (MUI v9)

// Shared modal shell for this file: full-bleed scrim with a centred Paper.
// Drawn in place (no portal) because artboards are static boxes.
function A36_MuiModal({ maxWidth, children }) {
  const { Box, Paper } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={8} sx={{ width: '100%', maxWidth, p: 2.75 }}>
          {children}
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// Small text field with optional mono input font.
function A36_MuiField({ label, mono, span2, sx, ...rest }) {
  const { TextField } = MUI;
  return (
    <TextField
      label={label} size="small" fullWidth
      sx={{ gridColumn: span2 ? 'span 2' : undefined, ...(mono ? { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } } : {}), ...sx }}
      {...rest}
    />
  );
}

// 3.6.1 Card Vault (per trip)
function A361_CardVault() {
  const { Box, Stack, Typography, Card, CardContent, CardActionArea, Button, IconButton, Paper } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader title="Card vault · Sandals · Aug 2026" subtitle="Tokenized cards authorized for this trip. Never raw PANs at rest." actions={<Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>Request new auth</Button>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1.5, maxWidth: 1000 }}>
        {[
          { b: 'VISA', l: '4242', exp: '08/29', client: 'Jordan Hayes', cap: '$4,598', remaining: '$418', used: '$4,180', col: 'linear-gradient(135deg,#1A1F71,#5050E0)', active: true },
          { b: 'MC', l: '8801', exp: '03/27', client: 'Sam Hayes', cap: '$2,000', remaining: '$2,000', used: '$0', col: 'linear-gradient(135deg,#EB001B,#F79E1B)', active: true },
        ].map((c) => (
          <Card key={c.l}>
            {/* Card-network artwork: fixed brand gradient, intentionally not themed. */}
            <Box sx={{ aspectRatio: '8/5', background: c.col, p: 1.75, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1 }}>{c.b}</Typography>
                <Icon name="card" size={20}/>
              </Stack>
              <Box>
                <Typography variant="h6" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 500, letterSpacing: 2, lineHeight: 1 }}>•••• {c.l}</Typography>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, mt: 0.5, opacity: 0.8 }}>{c.client} · exp {c.exp}</Typography>
              </Box>
            </Box>
            <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1 }}>
                <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Cap</Typography><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{c.cap}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Used</Typography><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{c.used}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Left</Typography><Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main' }}>{c.remaining}</Typography></Box>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, alignItems: 'center' }}>
                <Button variant="contained" size="small" startIcon={<MuiIcon name="key" size={12}/>} sx={{ flex: 1 }}>Reveal & use</Button>
                <Button variant="outlined" color="secondary" size="small">Log use</Button>
                <IconButton size="small"><MuiIcon name="more_vert" size={14}/></IconButton>
              </Stack>
            </CardContent>
          </Card>
        ))}
        <Card variant="outlined" sx={{ bgcolor: 'surface.2', borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'outline.main', minHeight: 220, display: 'flex' }}>
          <CardActionArea sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75, color: 'text.secondary', height: '100%' }}>
            <Icon name="plus" size={28}/>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Request a card from client</Typography>
            <Typography variant="caption">Sends a Stripe-secured link</Typography>
          </CardActionArea>
        </Card>
      </Box>
      <Paper elevation={0} sx={{ mt: 1.75, p: 1.5, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Icon name="shield" size={16}/>
        <Typography variant="caption"><b>Every reveal is audited:</b> supplier, amount, reason, timestamp, agent. 60-second auto-clear of clipboard.</Typography>
      </Paper>
    </MuiScreenFrame>
  );
}

// 3.6.2 Request Card Authorization
function A362_RequestAuth() {
  const { Box, Stack, Typography, Button, Paper } = MUI;
  return (
    <A36_MuiModal maxWidth={600}>
      <Typography variant="h5" component="h2">Request a card from Jordan</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Sends a Stripe-secured form to the client. The card is tokenized before it leaves their browser.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A36_MuiField label="For trip" defaultValue="Sandals · Aug 2026"/>
        <A36_MuiField label="Spending limit" defaultValue="$4,598" mono/>
        <A36_MuiField label="Authorization expires" defaultValue="Aug 26, 2026 · trip end + 7"/>
        <A36_MuiField label="Notify via" defaultValue="In-app + email"/>
      </Box>
      <Box sx={{ mt: 1.25 }}><A36_MuiField label="Personal note" multiline minRows={2} defaultValue="Hey J — adding the final-balance card here so Sandals invoices me on the 28th."/></Box>
      <Paper variant="outlined" sx={{ p: 1.5, mt: 1.25, bgcolor: 'surface.2' }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>PREVIEW</Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>"Jordan — Gyasi requested authorization for VISA on file (up to $4,598). Tap to confirm."</Typography>
      </Paper>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" startIcon={<MuiIcon name="send" size={12}/>} sx={{ ml: 'auto' }}>Send request</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.3 Authorization Request Sent
function A363_AuthRequestSent() {
  const { Box, Stack, Typography, Button, Card, CardContent, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <Avatar sx={{ width: 84, height: 84, bgcolor: 'success.container', color: 'success.main', mx: 'auto', mb: 1.75 }}><Icon name="send" size={36}/></Avatar>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, my: 0.5 }}>Request sent to Jordan</Typography>
          <Typography variant="body2" color="text.secondary">Status is now <b>Awaiting client</b>. We'll ping you when they authorize.</Typography>
          <Card sx={{ mt: 1.75, textAlign: 'left' }}>
            <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }}/>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Pending authorization</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Auto-nudge in 48 hours if no action.</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                <Button variant="outlined" color="secondary" size="small">Copy invite link</Button>
                <Button variant="text" size="small">Resend</Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.6.4 Reveal Card Number (audited)
function A364_RevealCard() {
  const { Box, Stack, Typography, Button, Paper, Avatar } = MUI;
  return (
    <A36_MuiModal maxWidth={540}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Avatar sx={{ width: 40, height: 40, bgcolor: 'error.container', color: 'error.onContainer' }}><Icon name="key" size={20}/></Avatar>
        <Box>
          <Typography variant="overline" sx={{ display: 'block', color: 'error.main', lineHeight: 1.3 }}>AUDITED ACTION · MFA STEP-UP</Typography>
          <Typography variant="h5" component="h2">Reveal card number</Typography>
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Justify this reveal. The audit log will capture supplier, amount, and reason. Card auto-hides after 60 seconds.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A36_MuiField label="Supplier *" defaultValue="Sandals Resorts"/>
        <A36_MuiField label="Amount *" defaultValue="$4,180" mono/>
        <A36_MuiField label="Reason *" defaultValue="Final balance · per invoice SRB-INV-220119-FINAL" span2/>
        <A36_MuiField label="Your MFA code *" defaultValue="• • •  • • •" mono span2 sx={{ '& .MuiInputBase-input': { letterSpacing: 8, textAlign: 'center' } }}/>
      </Box>
      {/* The audited reveal panel: a fixed dark surface so the PAN reads the same in both schemes. */}
      <Paper elevation={0} sx={{ p: 1.75, mt: 1.5, bgcolor: 'grey.900', color: 'common.white', textAlign: 'center', position: 'relative' }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, lineHeight: 1, opacity: 0.7 }}>VISA •••• 4242 · Jordan Hayes</Typography>
        <Typography variant="h5" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, letterSpacing: 3, mt: 0.75 }}>4242 4242 4242 4242</Typography>
        <Typography variant="caption" sx={{ display: 'block', fontFamily: (t) => t.typography.mono, fontWeight: 500, lineHeight: 1, opacity: 0.7, mt: 0.5 }}>08 / 29 · CVC 314</Typography>
        <Typography variant="caption" sx={{ position: 'absolute', top: 8, right: 12, fontFamily: (t) => t.typography.mono, fontWeight: 600, fontSize: 10.5, lineHeight: 1, color: 'brandSource.gold' }}>auto-clear in 0:58</Typography>
        <Button variant="contained" size="small" startIcon={<MuiIcon name="copy" size={12}/>} sx={{ mt: 1.5, bgcolor: 'common.white', color: 'grey.900', '&:hover': { bgcolor: 'grey.200' } }}>Copy · clipboard clears in 60s</Button>
      </Paper>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="outlined">Close</Button>
        <Button variant="contained" sx={{ ml: 'auto' }}>Log use →</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.5 Log Card Use
function A365_LogUse() {
  const { Box, Stack, Typography, Button, Paper } = MUI;
  return (
    <A36_MuiModal maxWidth={560}>
      <Typography variant="h5" component="h2">Log card use</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Records this charge in the trip's audit log and notifies the client.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A36_MuiField label="Card" defaultValue="VISA •••• 4242"/>
        <A36_MuiField label="Supplier" defaultValue="Sandals Resorts"/>
        <A36_MuiField label="Amount" defaultValue="$4,180.00" mono/>
        <A36_MuiField label="Date" defaultValue="May 14, 2026"/>
        <A36_MuiField label="Reference" defaultValue="SRB-INV-220119-FINAL" mono span2/>
        <A36_MuiField label="Note (visible to client)" multiline minRows={2} span2 defaultValue="Final balance to Sandals — bungalow upgrade included. Receipt attached."/>
      </Box>
      <Paper variant="outlined" sx={{ p: 1.5, mt: 1.25, bgcolor: 'surface.2', display: 'flex', gap: 1, alignItems: 'center' }}>
        <Icon name="upload" size={14}/>
        <Typography variant="caption">Attach receipt (optional) · supplier-portal screenshot, PDF</Typography>
        <Button variant="outlined" color="secondary" size="small" sx={{ ml: 'auto', flexShrink: 0 }}>Choose file</Button>
      </Paper>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" sx={{ ml: 'auto' }}>Log use</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.6 Card Use Log (per trip / per card)
function A366_CardUseLog() {
  const { Stack, Button, IconButton, Chip, Card, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader title="Card use log · Sandals · Aug 2026" subtitle="Append-only audit. Export for tax. Filter by card or trip." actions={<Button variant="outlined" size="small" startIcon={<MuiIcon name="download" size={12}/>}>Export CSV</Button>} small/>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
        {['All cards','VISA 4242','MC 8801','All suppliers'].map((t, i) => (
          i === 0 ? <Chip key={t} label={t} color="secondary" onClick={() => {}}/> : <Chip key={t} label={t} variant="outlined" onClick={() => {}}/>
        ))}
      </Stack>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Card</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell/>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { d: 'Today · 9:14a', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-FINAL', a: 4180 },
              { d: 'Apr 22 · 3:02p', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-MID', a: 1500 },
              { d: 'Mar 14 · 11:21a', c: 'VISA 4242', s: 'Sandals Resorts', r: 'SRB-INV-220119-DEP', a: 800 },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontWeight: 500 }}>{r.d}</TableCell>
                <TableCell sx={{ fontFamily: mono, fontSize: 12 }}>{r.c}</TableCell>
                <TableCell>{r.s}</TableCell>
                <TableCell sx={{ fontFamily: mono, fontSize: 12, color: 'text.secondary' }}>{r.r}</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700 }}>${r.a.toLocaleString()}</TableCell>
                <TableCell padding="checkbox"><IconButton size="small"><MuiIcon name="more_vert" size={14}/></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.6.7 Set or Update Spending Limit
function A367_UpdateLimit() {
  const { Box, Stack, Typography, Button, Alert } = MUI;
  return (
    <A36_MuiModal maxWidth={520}>
      <Typography variant="h5" component="h2">Update spending limit</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Client re-consent is required for any increase.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A36_MuiField label="Current" defaultValue="$4,598" disabled mono/>
        <A36_MuiField label="New" defaultValue="$5,200" mono/>
        <A36_MuiField label="Reason for change" defaultValue="Added Day 6 spa treatment · $602" span2/>
      </Box>
      <Alert severity="warning" icon={<Icon name="shield" size={14}/>} sx={{ mt: 1.25 }}>Re-consent will be requested. The card is paused for new charges until Jordan approves.</Alert>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" sx={{ ml: 'auto' }}>Request re-consent</Button>
      </Stack>
    </A36_MuiModal>
  );
}

Object.assign(window, { A361_CardVault, A362_RequestAuth, A363_AuthRequestSent, A364_RevealCard, A365_LogUse, A366_CardUseLog, A367_UpdateLimit });
