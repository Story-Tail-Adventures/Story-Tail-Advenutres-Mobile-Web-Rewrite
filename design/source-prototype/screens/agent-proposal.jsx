/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader */
// Agent · 3.5 Proposal & Itinerary — 7 screens. MUI v9 (stock look, brand theme).

// 3.5.1 Proposal Builder
function A351_ProposalBuilder() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, CardMedia, Paper, TextField, List, ListItemButton, ListItemText } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ px: 3.5, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Proposal builder · Jordan & Sam Hayes</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Sandals honeymoon · 2 option proposal</Typography>
        </Box>
        <Button variant="text">Auto-save</Button>
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="external" size={12} />}>Preview</Button>
        <Button variant="contained" startIcon={<MuiIcon name="send" size={12} />}>Send to client</Button>
      </Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr 300px', overflow: 'hidden' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.75 }}>SECTIONS</Typography>
          <List dense disablePadding>
            {['Hero', 'Story · the trip', 'Option A · Beachfront', 'Option B · Bungalow', 'What\'s included', 'Day-by-day', 'Investment', 'Next steps'].map((s, i) => (
              <ListItemButton key={s} selected={i === 2} sx={{ borderRadius: 1, mb: 0.25, py: 0.75 }}>
                <ListItemText primary={s} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 500, fontSize: 12.5 } } }} />
              </ListItemButton>
            ))}
          </List>
          <Button variant="text" size="small" sx={{ mt: 1 }}>+ Add section</Button>
        </Box>
        <Box sx={{ overflow: 'auto', p: 2.25 }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.3 }}>EDITING · OPTION A</Typography>
          <TextField variant="standard" fullWidth defaultValue="Option A · Honeymoon Beachfront Walkout" sx={{ mt: 0.5, '& .MuiInputBase-input': { fontWeight: 700, fontSize: 22, lineHeight: 1.2 } }} />
          <Grid container spacing={1.25} sx={{ mt: 1.25 }}>
            <Grid size={6}>
              <Card sx={{ height: '100%' }}>
                <CardMedia component="img" image={staImg('overwater', 600, 280)} alt="" sx={{ height: 130, objectFit: 'cover' }} />
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle1">Hero photo</Typography>
                  <Button variant="outlined" color="secondary" size="small" sx={{ mt: 0.75 }}>Replace</Button>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>HIGHLIGHTS · BULLETS</Typography>
                  <TextField fullWidth multiline minRows={4} size="small" sx={{ mt: 0.75 }}
                    defaultValue={'• Beachfront walkout · open patio onto Balmoral Beach\n• Red Lane spa credit + couples massage\n• Day-trip to Rose Island Cay\n• Welcome bottle in room'} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          <Card sx={{ mt: 1.25 }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>WHY THIS WORKS · GYASI'S NOTE</Typography>
              <TextField fullWidth multiline minRows={3} size="small" sx={{ mt: 0.75 }}
                defaultValue="You both said you wanted feet-in-the-sand mornings — this gets you that without the upcharge of the over-water bungalow. Save the savings for the spa days." />
            </CardContent>
          </Card>
          <Paper elevation={0} sx={{ mt: 1.25, p: 1.75, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3 }}>INVESTMENT · OPTION A</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 0.5 }}>
              <Typography variant="h3">$3,290</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>per person · all-in · 7 nights</Typography>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.5 }}>Trip total $6,480 · Gyasi's commission $970 (15%)</Typography>
          </Paper>
        </Box>
        <Box component="aside" sx={{ borderLeft: 1, borderColor: 'divider', p: 1.75, overflow: 'auto', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>PROPOSAL META</Typography>
          <Card sx={{ mt: 0.75 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Client</Typography>
              <Typography variant="subtitle1">Jordan & Sam Hayes</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>Send via</Typography>
              <Typography variant="subtitle1">In-app + email</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>Expires</Typography>
              <Typography variant="subtitle1">May 28 · 14 days</Typography>
            </CardContent>
          </Card>
          <Paper elevation={0} sx={{ mt: 1.25, p: 1.5, bgcolor: 'tertiary.container', color: 'tertiary.onContainer' }}>
            <Typography variant="subtitle1">Brand check</Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, typography: 'caption', fontWeight: 500, lineHeight: 1.55 }}>
              <li>Signature ✓</li>
              <li>Cover photo ✓</li>
              <li>"Story-Tail" tone ✓</li>
              <li>Anniversary nod missing</li>
            </Box>
          </Paper>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.5.2 Proposal Preview (rendered as client would see)
function A352_ProposalPreview() {
  const { Box, Stack, Typography, Button, Card, CardContent, Divider, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
        <Box sx={{ position: 'sticky', top: 0, zIndex: 5, px: 3.5, py: 1.25, bgcolor: 'text.primary', color: 'background.paper', display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <MuiIcon name="external" size={14} />
          <Typography variant="caption">Preview · client view · not yet sent</Typography>
          <Button variant="outlined" color="inherit" size="small" sx={{ ml: 'auto' }}>Back to editor</Button>
          <Button variant="contained" size="small">Send</Button>
        </Box>

        <Box sx={{ position: 'relative', height: 360, overflow: 'hidden' }}>
          <Box component="img" src={staImg('overwater', 1600, 600)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.7))' }} />
          <Box sx={{ position: 'absolute', left: 48, right: 48, bottom: 28, color: 'common.white' }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3, color: (t) => t.palette.brandSource.gold }}>FOR JORDAN & SAM · HONEYMOON · AUG 2026</Typography>
            <Typography variant="h2" component="h1" sx={{ color: 'common.white', mt: 0.75, mb: 0.5 }}>The Story-Tail honeymoon I'd want for you.</Typography>
            <Typography variant="body2" sx={{ maxWidth: 600, opacity: 0.92 }}>Two ways to do Sandals Royal Bahamian — both gorgeous, both built around feet-in-the-sand mornings and a quiet anniversary surprise on the back end. 🥂</Typography>
          </Box>
        </Box>

        <Box sx={{ maxWidth: 920, mx: 'auto', px: 4, py: 3.5 }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.3 }}>OPTION A · BEACHFRONT WALKOUT</Typography>
          <Typography variant="h3" component="h2" sx={{ mt: 0.5, mb: 0.75 }}>Feet-in-the-sand mornings</Typography>
          <Typography variant="body2" color="text.secondary">Open your patio doors onto Balmoral Beach. Coffee, sand, sunrise. Red Lane spa credit goes a long way at this room category — that's where you'd actually use it.</Typography>
          <Box component="ul" sx={{ my: 1, pl: 2.25, typography: 'body2', lineHeight: 1.6 }}>
            <li>Beachfront walkout · open patio</li>
            <li>Red Lane spa credit · ~$300 value</li>
            <li>Day-trip to Rose Island Cay · included</li>
          </Box>
          <Card elevation={0} sx={{ bgcolor: 'primary.container', color: 'primary.onContainer' }}>
            <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.75, '&:last-child': { pb: 2 } }}>
              <Typography variant="h3">$3,290<Typography component="span" variant="body2" sx={{ opacity: 0.85 }}> /pp</Typography></Typography>
              <Typography variant="caption" sx={{ flex: 1 }}>All-in · 7 nights · flights + transfers</Typography>
              <Button variant="contained">Choose Option A</Button>
            </CardContent>
          </Card>

          <Divider sx={{ my: 3 }} />

          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.3 }}>OPTION B · OVER-WATER BUNGALOW</Typography>
          <Typography variant="h3" component="h2" sx={{ mt: 0.5, mb: 0.75 }}>That bucket-list moment</Typography>
          <Typography variant="body2" color="text.secondary">Glass-floor bungalow · sunset gin & tonic on the deck · room service breakfast over the water. More money, but if "honeymoon" only happens once, this is it.</Typography>
          <Card sx={{ mt: 1 }}>
            <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.75, '&:last-child': { pb: 2 } }}>
              <Typography variant="h3">$3,970<Typography component="span" variant="body2" color="text.secondary"> /pp</Typography></Typography>
              <Typography variant="caption" sx={{ flex: 1 }}>All-in · 7 nights · flights + transfers</Typography>
              <Button variant="outlined">Choose Option B</Button>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ mt: 3, bgcolor: 'surface.2' }}>
            <CardContent sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
              <Avatar src={staImg('avatarA', 80, 80)} alt="" sx={{ width: 44, height: 44 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">— Gyasi</Typography>
                <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', mt: 0.25 }}>Whichever you pick, Sep 14 is on my calendar 😉</Typography>
              </Box>
              <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="message" size={12} />}>Reply</Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.5.3 Send Proposal (modal-like)
function A353_SendProposal() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, TextField, Checkbox, FormControlLabel, FormGroup } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Card sx={{ width: '100%', maxWidth: 640 }}>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Typography variant="h5" component="h2">Send proposal · Sandals · Aug 2026</Typography>
            <Card variant="outlined" sx={{ bgcolor: 'surface.2', mt: 1.25 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>TO</Typography>
                <Typography variant="subtitle1" sx={{ mt: 0.25 }}>Jordan & Sam Hayes · jordan.hayes@example.com</Typography>
              </CardContent>
            </Card>
            <Grid container spacing={1.25} sx={{ mt: 1.25 }}>
              <Grid size={6}><TextField label="Subject" size="small" fullWidth defaultValue="Your honeymoon · two options to choose from" /></Grid>
              <Grid size={6}><TextField label="Template" size="small" fullWidth defaultValue="Proposal · honeymoon · 2 options" /></Grid>
            </Grid>
            <TextField label="Personal note (pre-fills above the proposal)" size="small" fullWidth multiline minRows={3} sx={{ mt: 1.25 }}
              defaultValue="Hey J — finally have the two options I love most. Take your time, ping me if you want to ride out loud." />
            <Card sx={{ mt: 1.25 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>CHANNELS</Typography>
                <FormGroup>
                  <FormControlLabel control={<Checkbox defaultChecked size="small" />} label={<Typography variant="body2">In-app · push notification</Typography>} />
                  <FormControlLabel control={<Checkbox defaultChecked size="small" />} label={<Typography variant="body2">Email · branded</Typography>} />
                  <FormControlLabel control={<Checkbox size="small" />} label={<Typography variant="body2">SMS · short link only</Typography>} />
                </FormGroup>
              </CardContent>
            </Card>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
              <Button variant="text">Save draft</Button>
              <Button variant="outlined" sx={{ ml: 'auto !important' }}>Preview</Button>
              <Button variant="contained" startIcon={<MuiIcon name="send" size={12} />}>Send</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.5.4 Proposal Sent Confirmation
function A354_ProposalSent() {
  const { Box, Stack, Typography, Button, Card, CardContent, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <Avatar sx={{ width: 84, height: 84, bgcolor: 'success.container', color: 'success.main', mx: 'auto', mb: 1.75, boxShadow: 2 }}><Icon name="send" size={36} /></Avatar>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.3 }}>PROPOSAL SENT</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 0.5, mb: 0.5 }}>To Jordan & Sam Hayes</Typography>
          <Typography variant="body2" color="text.secondary">They got the in-app push and the branded email. Trip moved to <b>Proposal Sent</b>. We'll nudge if they don't respond in 5 days.</Typography>
          <Card sx={{ mt: 1.75, textAlign: 'left' }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>EXPECT</Typography>
              <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25, typography: 'body2', lineHeight: 1.55 }}>
                <li>Read receipt (push)</li>
                <li>Email open tracked</li>
                <li>Auto-nudge in 5 days if no reply</li>
              </Box>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'center', mt: 2.25 }}>
            <Button variant="outlined">View trip</Button>
            <Button variant="contained">Back to worklist</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.5.5 Itinerary Auto-Generator
function A355_AutoGenerator() {
  const { Stack, Grid, Typography, Button, Card, CardContent, Paper, Switch, FormControlLabel, FormGroup } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader title="Auto-generate itinerary" subtitle="Builds day-by-day blocks from the trip's components. Always editable after." actions={<><Button variant="text">Cancel</Button><Button variant="contained" startIcon={<MuiIcon name="sparkle" size={12} />}>Generate</Button></>} small />
      <Grid container spacing={1.75} sx={{ maxWidth: 1080 }}>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="subtitle1">Inputs · 6 components detected</Typography>
              <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                {['AA 1413 · flight', 'Sun & Fun · transfer', 'Sandals · check-in', 'Sandals · 7 nights', 'Rose Island · tour', 'AA 1410 · return'].map((c) => (
                  <Paper key={c} elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, bgcolor: 'surface.2' }}>
                    <MuiIcon name="check" size={12} stroke={2.5} sx={{ color: 'success.main' }} /><Typography variant="caption">{c}</Typography>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="subtitle1">Options</Typography>
              <FormGroup sx={{ mt: 1 }}>
                {[
                  { l: 'Include "Gyasi\'s Tip" callouts', on: true },
                  { l: 'Add packing reminder before day 1', on: true },
                  { l: 'Auto-pull weather for each day', on: true },
                  { l: 'Include emergency contacts page', on: true },
                  { l: 'Overwrite manual edits', on: false },
                ].map((o) => (
                  <FormControlLabel key={o.l} control={<Switch defaultChecked={o.on} size="small" />} label={<Typography variant="caption">{o.l}</Typography>} sx={{ ml: 0, py: 0.5 }} />
                ))}
              </FormGroup>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={12}>
          <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'tertiary.container', color: 'tertiary.onContainer' }}>
            <Typography variant="subtitle1">Preview · 7-day itinerary will be generated with 3 morning, 4 afternoon, and 5 evening blocks. 11 "Gyasi's Tip" callouts inferred. Existing manual blocks preserved.</Typography>
          </Paper>
        </Grid>
      </Grid>
    </MuiScreenFrame>
  );
}

// 3.5.6 Itinerary Preview (agent view)
function A356_ItineraryPreviewAgent() {
  const { Box, Stack, Typography, Button, Card, CardContent, Chip, Avatar } = MUI;
  const blocks = [
    { time: '06:40', p: 'MORNING', i: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Direct · 2h 50m · seats 14A 14B' },
    { time: '11:20', p: 'AFTERNOON', i: 'trip', t: 'Private transfer · Mercedes Vito', s: '25 min' },
    { time: '13:00', p: 'AFTERNOON', i: 'building', t: 'Check-in · Sandals Royal Bahamian', s: 'Honeymoon Beachfront · Bldg 3' },
    { time: '19:30', p: 'EVENING', i: 'utensils', t: 'Welcome dinner · Bayside', s: 'Reserved · pescatarian flag' },
  ];
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ px: 3.5, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Itinerary preview · agent view</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Sandals · Aug 12 – 19, 2026</Typography>
        </Box>
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="external" size={12} />}>Open client view</Button>
        <Button variant="contained" startIcon={<MuiIcon name="send" size={12} />}>Publish update</Button>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 2.5 }}>
        <Stack direction="row" spacing={1.75} sx={{ alignItems: 'baseline', mb: 1.5 }}>
          <Typography variant="script" sx={{ color: 'primary.main', fontSize: 36 }}>Day 01</Typography>
          <Box>
            <Typography variant="h5">Miami → Nassau</Typography>
            <Typography variant="caption" color="text.secondary">Wed Aug 12 · Arrival & sunset welcome</Typography>
          </Box>
        </Stack>
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ position: 'absolute', left: 16, top: 6, bottom: 6, width: 2, bgcolor: 'divider' }} />
          {blocks.map((b, i) => (
            <Box key={i} sx={{ position: 'relative', pl: 5.75, mb: 1 }}>
              <Avatar sx={{ position: 'absolute', left: 5, top: 12, width: 24, height: 24, bgcolor: 'background.paper', color: 'brand.main', border: 2, borderColor: 'brand.main' }}>
                <Icon name={b.i} size={12} />
              </Avatar>
              <Card>
                <CardContent sx={{ py: 1.5, px: 2, display: 'flex', gap: 1.75, alignItems: 'center', '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ minWidth: 60 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1 }}>{b.time}</Typography>
                    <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', lineHeight: 1.6 }}>{b.p}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1">{b.t}</Typography>
                    <Typography variant="caption" color="text.secondary">{b.s}</Typography>
                  </Box>
                  <Chip size="small" label="Visible to client" sx={{ bgcolor: 'secondary.container', color: 'secondary.onContainer' }} />
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.5.7 Publish Itinerary Update (confirmation)
function A357_PublishUpdate() {
  const { Box, Stack, Typography, Button, Card, CardContent, Checkbox, FormControlLabel } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Card sx={{ width: '100%', maxWidth: 520 }}>
          <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
            <Typography variant="h5" component="h2">Publish itinerary update?</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>The client will receive a push notification with a summary of what changed.</Typography>
            <Card variant="outlined" sx={{ bgcolor: 'surface.2', mt: 1 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>CHANGES · 3</Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25, typography: 'body2', lineHeight: 1.55 }}>
                  <li>Added: Day 3 · Rose Island Cay snorkel</li>
                  <li>Edited: Day 1 dinner reservation · time changed to 7:30 PM</li>
                  <li>Removed: Day 4 placeholder block</li>
                </Box>
              </CardContent>
            </Card>
            <FormControlLabel sx={{ mt: 1 }} control={<Checkbox defaultChecked size="small" />}
              label={<Typography variant="body2">Send push notification to client</Typography>} />
            <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
              <Button variant="outlined">Cancel</Button>
              <Button variant="contained" sx={{ ml: 'auto !important' }}>Publish</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A351_ProposalBuilder, A352_ProposalPreview, A353_SendProposal, A354_ProposalSent, A355_AutoGenerator, A356_ItineraryPreviewAgent, A357_PublishUpdate });
