/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Client · 2.4 Payment & Card Authorization — 7 screens. MUI v9.
//
// PCI note: every card shown here is masked to its last 4 (•••• 4242). The
// only full number on this page is the Stripe public test PAN typed into the
// Add Card entry form (2.4.2), exactly as the legacy screen drew it.

// Card-network badge (VISA / MC). The two network colors are third-party brand
// marks, not Story-Tail palette roles, so they are the one deliberate fixed
// color on this page. Everything else reads the theme.
function C24_MuiNetworkBadge({ brand, width = 32 }) {
  const { Box } = MUI;
  const bg = brand === 'VISA' ? '#1A1F71' : '#EB001B';
  return (
    <Box component="span" sx={{
      width, height: 22, borderRadius: 1, bgcolor: bg, color: 'common.white', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9, lineHeight: 1,
    }}>{brand}</Box>
  );
}

// The physical-card artwork at the top of a wallet card (masked number only).
function C24_MuiCardFace({ brand, last4, name, exp, gradient }) {
  const { Box, Stack, Typography } = MUI;
  return (
    <Box sx={{ aspectRatio: '8/5', background: gradient, p: 2, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography component="span" sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{brand}</Typography>
        <Icon name="card" size={20}/>
      </Stack>
      <Box>
        <Typography sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 500, fontSize: 26, lineHeight: 1, letterSpacing: 2, mb: 0.5 }}>•••• {last4}</Typography>
        <Typography sx={{ fontWeight: 500, fontSize: 11, lineHeight: 1, opacity: 0.8 }}>{name} · exp {exp}</Typography>
      </Box>
    </Box>
  );
}

// 2.4.1 — My Cards / Payment Methods List
function C241_MyCards() {
  const { Box, Grid, Paper, Card, CardContent, CardActions, CardActionArea, Typography, Button, Link } = MUI;
  const cards = [
    { b: 'VISA', l: '4242', name: 'Personal Visa', exp: '08/29', trip: 'Sandals · Aug 2026', cap: '$4,598', status: 'Active', col: 'linear-gradient(135deg, #1A1F71, #5050E0)' },
    { b: 'MC', l: '8801', name: 'Chase Mastercard', exp: '03/27', trip: 'Used Mar 2025 · Symphony', cap: '—', status: 'Revoked', col: 'linear-gradient(135deg, #EB001B, #F79E1B)' },
  ];
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <MuiScreenHeader
        overline="WALLET"
        title="Cards on file"
        subtitle="Each card is tokenized by Stripe — we never see the full number. Used only to pay suppliers on your behalf."
        actions={<Button variant="contained" color="brand" startIcon={<MuiIcon name="plus" size={14}/>}>Add a card</Button>}
        small
      />
      <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', gap: 1.25, alignItems: 'center', mb: 1.75 }}>
        <Icon name="shield" size={18}/>
        <Typography variant="caption" sx={{ display: 'block' }}><b>Story-Tail never charges you a service fee.</b> Cards are used only to pay suppliers (Sandals, Royal Caribbean, etc.). <Link href="#" color="inherit" underline="always">Read our security policy →</Link></Typography>
      </Paper>
      <Grid container spacing={1.5}>
        {cards.map((c) => (
          <Grid key={c.l} size={6}>
            <Card>
              <C24_MuiCardFace brand={c.b} last4={c.l} name={c.name} exp={c.exp} gradient={c.col}/>
              <CardContent sx={{ pb: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">{c.trip}</Typography>
                  <MuiStaStatus kind={c.status === 'Active' ? 'booked' : 'past'}>{c.status}</MuiStaStatus>
                </Box>
              </CardContent>
              <CardActions>
                <Button size="small" variant="outlined" color="secondary">Details</Button>
                <Button size="small" variant="outlined">{c.status === 'Active' ? 'Revoke' : 'Re-authorize'}</Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
        <Grid size={6}>
          <Card variant="outlined" sx={{ bgcolor: 'surface.2', borderStyle: 'dashed', borderColor: 'outline.main', height: '100%', minHeight: 200 }}>
            <CardActionArea sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75, color: 'text.secondary' }}>
              <Icon name="plus" size={28}/>
              <Typography variant="subtitle1">Add a new card</Typography>
              <Typography variant="caption">Stripe-secured · 60 seconds</Typography>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </MuiScreenFrame>
  );
}

// 2.4.2 — Add Card
function C242_AddCard() {
  const { Box, Stack, Grid, Paper, Card, CardContent, Typography, Button, TextField, InputAdornment, Checkbox, FormControlLabel } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ mb: 1 }}>Back to wallet</Button>
      <MuiScreenHeader title="Add a new card" subtitle="Tokenized by Stripe — Story-Tail never sees the full number." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25, maxWidth: 920 }}>
        <Card>
          <CardContent sx={{ p: 2.75 }}>
            <Stack spacing={1.5}>
              <TextField
                label="Card number" size="small" fullWidth defaultValue="4242 4242 4242 4242"
                slotProps={{
                  input: {
                    sx: { fontFamily: mono },
                    endAdornment: <InputAdornment position="end"><C24_MuiNetworkBadge brand="VISA"/></InputAdornment>,
                  },
                }}
              />
              <TextField label="Cardholder name" size="small" fullWidth defaultValue="Jordan E. Hayes"/>
              <Grid container spacing={1.25}>
                <Grid size={4}><TextField label="Expiration" size="small" fullWidth defaultValue="08 / 29" slotProps={{ input: { sx: { fontFamily: mono } } }}/></Grid>
                <Grid size={4}><TextField label="CVC" size="small" fullWidth defaultValue="•••" slotProps={{ input: { sx: { fontFamily: mono } } }}/></Grid>
                <Grid size={4}><TextField label="ZIP" size="small" fullWidth defaultValue="33131"/></Grid>
              </Grid>
              <TextField label="Nickname (optional)" size="small" fullWidth defaultValue="Personal Visa" placeholder="e.g. Personal Visa"/>
              <FormControlLabel
                control={<Checkbox size="small" defaultChecked sx={{ py: 0.25 }}/>}
                sx={{ alignItems: 'flex-start', mx: 0, mt: 0.5 }}
                label={<Typography variant="body2" color="text.secondary">I understand this card is stored for <b>supplier payments only</b>. Story-Tail will never charge me a planning or service fee. I'll be notified every time the card is used.</Typography>}
              />
            </Stack>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
              <Button variant="outlined">Cancel</Button>
              <Button variant="contained" sx={{ ml: 'auto' }}>Save card</Button>
            </Stack>
          </CardContent>
        </Card>
        <Stack component="aside" spacing={1.5}>
          <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}><Icon name="lock" size={16}/><Typography variant="subtitle1">Secured by Stripe</Typography></Stack>
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>PCI DSS · SAQ A · TLS 1.3. The card never touches Story-Tail servers in the clear.</Typography>
          </Paper>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">What this card is used for</Typography>
              <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25, typography: 'body2', color: 'text.secondary' }}>
                <li>Paying suppliers (Sandals, cruise lines, tour operators) on your behalf</li>
                <li>Audit-logged with notification on every use</li>
                <li>Revocable any time</li>
              </Box>
              <Typography variant="subtitle1" sx={{ mt: 1.5 }}>What it is <em>not</em></Typography>
              <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25, typography: 'body2', color: 'text.secondary' }}>
                <li>A way for Story-Tail to charge you fees</li>
                <li>Stored as raw PAN on our servers</li>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.4.3 — Card Authorization for Trip
function C243_AuthorizeForTrip() {
  const { Box, Stack, Grid, Paper, Card, CardContent, CardMedia, Typography, Button, TextField, Divider, Radio, RadioGroup, Checkbox, FormControlLabel } = MUI;
  const cards = [
    { b: 'VISA', l: '4242', exp: '08/29', name: 'Personal Visa', sel: true },
    { b: 'MC', l: '8801', exp: '03/27', name: 'Chase Mastercard' },
  ];
  const caps = [{ l: 'Exact', v: '$4,180' }, { l: 'Balance + 10%', v: '$4,598', sel: true }, { l: 'Balance + 20%', v: '$5,016' }, { l: 'Custom', v: 'Set' }];
  const selSx = (sel) => ({
    borderColor: sel ? 'primary.main' : 'divider',
    bgcolor: sel ? 'primary.container' : 'background.paper',
    color: sel ? 'primary.onContainer' : 'text.primary',
  });
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <MuiScreenHeader overline="STEP 1 OF 2" title="Authorize a card for Sandals" subtitle="Pick a card, set a cap, and consent. We'll send Sandals the balance on May 28." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25, maxWidth: 980 }}>
        <Card>
          <CardContent sx={{ p: 2.75 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Card</Typography>
            <RadioGroup defaultValue="4242">
              <Stack spacing={1} sx={{ alignItems: 'stretch' }}>
                {cards.map((c) => (
                  <Paper key={c.l} variant="outlined" sx={selSx(c.sel)}>
                    <FormControlLabel
                      value={c.l}
                      control={<Radio size="small"/>}
                      sx={{ m: 0, px: 1, py: 0.75, width: '100%', gap: 0.5 }}
                      label={
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <C24_MuiNetworkBadge brand={c.b} width={36}/>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontFamily: (t) => t.typography.mono, lineHeight: 1.3 }}>•••• {c.l}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>{c.name} · exp {c.exp}</Typography>
                          </Box>
                        </Stack>
                      }
                    />
                  </Paper>
                ))}
                <Button size="small" variant="outlined" color="secondary" startIcon={<MuiIcon name="plus" size={14}/>} sx={{ alignSelf: 'flex-start' }}>Add new card</Button>
              </Stack>
            </RadioGroup>

            <Divider sx={{ my: 2.5 }}/>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Spending limit</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>Max we can charge. We'll ask before going over.</Typography>
            <Grid container spacing={1}>
              {caps.map((o) => (
                <Grid key={o.l} size={3}>
                  <Paper variant="outlined" sx={{ p: 1.25, ...selSx(o.sel) }}>
                    <Typography variant="caption" sx={{ display: 'block' }}>{o.l}</Typography>
                    <Typography variant="subtitle1" sx={{ mt: 0.5 }}>{o.v}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <TextField label="Authorization expires" size="small" fullWidth defaultValue="Aug 26, 2026 · 7 days after trip end" sx={{ mt: 1.75, maxWidth: 320, display: 'block', '& .MuiInputBase-root': { width: '100%' } }}/>

            <Paper elevation={0} sx={{ mt: 2, p: 1.75, bgcolor: 'surface.2' }}>
              <FormControlLabel
                control={<Checkbox size="small" defaultChecked sx={{ py: 0.25 }}/>}
                sx={{ alignItems: 'flex-start', mx: 0 }}
                label={<Typography variant="body2"><b>I authorize</b> Story-Tail Adventures to use VISA •••• 4242 to pay Sandals Resorts on my behalf, up to $4,598, until Aug 26, 2026. Story-Tail does not charge me a planning or service fee.</Typography>}
              />
            </Paper>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
              <Button variant="outlined">Cancel</Button>
              <Button variant="contained" endIcon={<MuiIcon name="arrow_right" size={14}/>} sx={{ ml: 'auto' }}>Authorize $4,598</Button>
            </Stack>
          </CardContent>
        </Card>
        <Stack component="aside" spacing={1.5}>
          <Card>
            <CardMedia component="img" image={staImg('overwater', 600, 180)} alt="" sx={{ height: 110, objectFit: 'cover' }}/>
            <CardContent>
              <MuiStaStatus kind="booked">Booked</MuiStaStatus>
              <Typography variant="subtitle1" sx={{ mt: 0.75 }}>Sandals Royal Bahamian</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Aug 12 – 19 · Jordan + Sam</Typography>
              <Divider sx={{ my: 1.25 }}/>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Trip total</Typography><Typography variant="body2">$6,480</Typography></Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Paid to date</Typography><Typography variant="body2">–$2,300</Typography></Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}><Typography variant="subtitle2">Authorizing for</Typography><Typography variant="subtitle2" color="primary.main">$4,180</Typography></Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.4.4 — Authorization Confirmation
function C244_AuthConfirmation() {
  const { Box, Stack, Card, CardContent, Typography, Button, Avatar, Divider } = MUI;
  const summary = [{ l: 'Trip', v: 'Sandals Royal Bahamian · Aug 12 – 19' }, { l: 'Cap', v: '$4,598' }, { l: 'Expires', v: 'Aug 26, 2026' }, { l: 'Notifications', v: 'Email + push on every use' }];
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
          <Avatar sx={{ width: 96, height: 96, bgcolor: 'success.container', color: 'success.main', mx: 'auto', mb: 1.75, boxShadow: 2 }}><Icon name="check" size={48} stroke={2.5}/></Avatar>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>AUTHORIZED</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, my: 0.5 }}>VISA •••• 4242 is locked in for Sandals.</Typography>
          <Typography variant="body1" color="text.secondary">Spending cap $4,598 · expires Aug 26, 2026. Gyasi can settle the May 28 invoice — you'll be notified.</Typography>
          <Card sx={{ mt: 2.25, textAlign: 'left' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>SUMMARY</Typography>
              <Stack divider={<Divider/>}>
                {summary.map((kv) => (
                  <Stack key={kv.l} direction="row" sx={{ justifyContent: 'space-between', py: 0.75 }}>
                    <Typography variant="body2" color="text.secondary">{kv.l}</Typography>
                    <Typography variant="body2">{kv.v}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'center', mt: 2.25 }}>
            <Button variant="outlined">View activity</Button>
            <Button variant="contained">Back to trip</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.4.5 — Card Use History
function C245_CardUseHistory() {
  const { Box, Stack, Card, CardContent, Typography, Button, Chip, Avatar } = MUI;
  const noop = () => {};
  const events = [
    { d: 'Today · 9:14a', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Final balance', amt: 4180, card: 'VISA 4242', tone: 'primary' },
    { d: 'Mar 22 · 3:02p', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Mid-payment', amt: 1500, card: 'VISA 4242' },
    { d: 'Mar 14 · 11:21a', who: 'Gyasi', supplier: 'Sandals Resorts', t: 'Sandals · Aug 2026 · Deposit', amt: 800, card: 'VISA 4242' },
    { d: 'Mar 02 · 2:14p', who: 'Gyasi', supplier: 'AT Tours', t: 'St. Lucia transfer · Reggie + Marc', amt: 220, card: 'MC 8801' },
    { d: 'Feb 28 · 8:00a', who: 'Gyasi', supplier: 'Royal Caribbean', t: 'Symphony cruise · final', amt: 3120, card: 'MC 8801' },
  ];
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <MuiScreenHeader title="Card use · activity" subtitle="Every time a card on file was used to pay a supplier. Audit-logged. Export anytime." actions={<Button variant="outlined" size="small" startIcon={<MuiIcon name="download" size={14}/>}>Export CSV</Button>} small/>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {['All cards', 'VISA 4242', 'MC 8801', 'All trips'].map((t, i) => (
          i === 0 ? <Chip key={t} label={t} color="secondary" onClick={noop}/> : <Chip key={t} label={t} variant="outlined" onClick={noop}/>
        ))}
      </Stack>
      <Stack spacing={0.75}>
        {events.map((e, i) => (
          <Card key={i} variant="outlined" sx={i === 0 ? { borderColor: 'primary.main', borderWidth: 1.5 } : null}>
            <CardContent sx={{ px: 2, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
              <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'primary.container', color: 'primary.onContainer' }}><Icon name="card" size={16}/></Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{e.t}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{e.d} · {e.supplier} · by {e.who}</Typography>
              </Box>
              <Chip size="small" variant="outlined" label={e.card} sx={{ fontFamily: (t) => t.typography.mono, fontSize: 11, height: 20 }}/>
              <Typography sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 14, lineHeight: 1, minWidth: 80, textAlign: 'right' }}>${e.amt.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </MuiScreenFrame>
  );
}

// 2.4.6 — Card Use Detail / Event Detail
function C246_CardUseDetail() {
  const { Box, Stack, Grid, Card, CardContent, Typography, Button, Divider, Alert, AlertTitle } = MUI;
  const details = [
    { l: 'Amount', v: '$4,180.00' },
    { l: 'Card', v: 'VISA •••• 4242' },
    { l: 'Supplier', v: 'Sandals Resorts' },
    { l: 'Agent', v: 'Gyasi Story' },
    { l: 'Trip', v: 'Sandals · Aug 12 – 19, 2026' },
    { l: 'Date / time', v: 'May 14, 2026 · 9:14 AM ET' },
    { l: 'Reference', v: 'SRB-INV-220119-FINAL', mono: true },
    { l: 'Method', v: 'Reveal-and-use via supplier portal' },
  ];
  return (
    <MuiScreenFrame role="client" tab="wallet" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ mb: 1 }}>Back to activity</Button>
      <MuiScreenHeader title="Card use · $4,180" subtitle="Sandals Resorts · Final balance · Today 9:14 AM" small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2.25, maxWidth: 960 }}>
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h5" sx={{ mb: 1.5 }}>Details</Typography>
            <Grid container spacing={1.75}>
              {details.map((kv) => (
                <Grid key={kv.l} size={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{kv.l}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, fontFamily: kv.mono ? (t) => t.typography.mono : 'inherit' }}>{kv.v}</Typography>
                </Grid>
              ))}
            </Grid>
            <Divider sx={{ my: 2 }}/>
            <Typography variant="subtitle1">Note from Gyasi</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>"Final balance to Sandals — over-water bungalow upgrade included. Receipt attached."</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }}>
              <Button size="small" variant="outlined" color="secondary" startIcon={<MuiIcon name="download" size={12}/>}>Receipt</Button>
              <Button size="small" variant="outlined" startIcon={<MuiIcon name="warning" size={12}/>}>Flag as unfamiliar</Button>
            </Stack>
          </CardContent>
        </Card>
        <Stack component="aside" spacing={1.5}>
          <Alert severity="success" icon={<MuiIcon name="check" size={16} stroke={2.5}/>}>
            <AlertTitle>Successful charge</AlertTitle>
            Charged by Sandals on your card. Story-Tail did not handle funds.
          </Alert>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>NEXT</Typography>
              <Typography variant="subtitle1" sx={{ mt: 0.5 }}>You're paid in full.</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Trip starts in 90 days. We'll send pre-trip reminders 14 days out.</Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.4.7 — Revoke Card Authorization Confirmation
function C247_RevokeConfirm() {
  const { Box, Stack, Paper, Typography, Button, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={4} sx={{ width: '100%', maxWidth: 540, p: 3.25 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Avatar sx={{ width: 44, height: 44, bgcolor: 'error.container', color: 'error.onContainer' }}><Icon name="warning" size={20}/></Avatar>
            <Box>
              <Typography variant="overline" sx={{ display: 'block', color: 'error.main', fontWeight: 600, lineHeight: 1.3 }}>CONFIRM REVOCATION</Typography>
              <Typography variant="h5" component="h2">Revoke VISA •••• 4242?</Typography>
            </Box>
          </Stack>
          <Typography variant="body2" color="text.secondary">This stops Gyasi from using the card for future supplier payments. <b>Past charges are unaffected</b> — Sandals can't be refunded through Story-Tail.</Typography>

          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'surface.2', mt: 1.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>CURRENTLY USING THIS CARD</Typography>
            <Typography variant="subtitle1" sx={{ mt: 0.5 }}>Sandals Royal Bahamian · Aug 12 – 19</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>$418 cap remaining · expires Aug 26</Typography>
          </Paper>
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'surface.2', mt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>WE'LL NOTIFY</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Gyasi will receive an in-app alert. She may request a different card.</Typography>
          </Paper>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
            <Button variant="outlined">Cancel</Button>
            <Button variant="contained" color="error" sx={{ ml: 'auto' }}>Yes, revoke</Button>
          </Stack>
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C241_MyCards, C242_AddCard, C243_AuthorizeForTrip, C244_AuthConfirmation,
  C245_CardUseHistory, C246_CardUseDetail, C247_RevokeConfirm,
});
