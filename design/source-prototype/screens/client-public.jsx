/* global React, MUI, Icon, MuiIcon, StoryTailMark, staImg, MuiScreenFrame */
// Client · 2.0 Public / Pre-Auth Surface — 7 screens. MUI v9.
// All screens here live at app.story-tail.com and complement (not replace)
// the marketing site at adventures.story-tail.com.
//
// Rendered inside <StaMuiScheme>. Fixed white / gold / rgba values appear only
// in overlays drawn over photographs, where the scrim is intentional.

// 2.0.1 — App Subdomain Public Landing
function C201_PublicLanding() {
  const { Box, Stack, Typography, Button, Chip, Link } = MUI;
  const glass = { color: 'common.white', borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.26)' } };
  const glassChip = { color: 'common.white', borderColor: 'rgba(255,255,255,0.2)', bgcolor: 'rgba(255,255,255,0.16)', '& .MuiChip-icon': { color: 'inherit' } };
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <Box component="img" src={staImg('turks', 1600, 900)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(122,26,31,0.72) 0%, rgba(122,26,31,0.2) 55%, transparent)' }} />
          <Box sx={{ position: 'absolute', inset: 0, px: 6, py: 5, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'common.white', maxWidth: 660 }}>
            <Typography variant="overline" sx={{ display: 'block', color: 'brandSource.gold', fontWeight: 600, mb: 1.25 }}>REST IS A GIFT · CREATION IS A GIFT</Typography>
            <Typography variant="h2" component="h1" sx={{ color: 'common.white', fontWeight: 700, lineHeight: 1.05 }}>
              Plan a rest worthy of the <Typography variant="script" component="span" sx={{ color: 'brandSource.gold', fontSize: 60 }}>world He made.</Typography>
            </Typography>
            <Typography variant="body1" sx={{ mt: 1.75, color: 'rgba(255,255,255,0.92)' }}>Your portal for everything Story-Tail — trips in motion, cards authorized for suppliers, and a place to dream up what's next. We believe vacation is rest, and rest is sacred.</Typography>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2.75 }}>
              <Button variant="contained" color="brand" size="large">Sign in</Button>
              <Button variant="outlined" size="large" sx={glass}>Create an account</Button>
              <Button variant="text" size="large" sx={{ color: 'common.white' }}>Take a quick tour →</Button>
            </Stack>
            <Stack direction="row" spacing={2.25} sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.18)', alignItems: 'baseline', color: 'rgba(255,255,255,0.78)' }}>
              <Typography variant="script" sx={{ fontStyle: 'italic', fontWeight: 500, fontSize: 18, lineHeight: 1.4, color: 'brandSource.gold' }}>"On the seventh day God rested."</Typography>
              <Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: 0.7, lineHeight: 1 }}>GEN 2 : 2</Typography>
              <Box component="span" sx={{ opacity: 0.3 }}>·</Box>
              <Typography variant="script" sx={{ fontStyle: 'italic', fontWeight: 500, fontSize: 18, lineHeight: 1.4, color: 'brandSource.gold' }}>"It was very good."</Typography>
              <Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: 0.7, lineHeight: 1 }}>GEN 1 : 31</Typography>
            </Stack>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2.25 }}>
              <Chip variant="outlined" clickable label="Browse trip ideas →" sx={glassChip} />
              <Chip variant="outlined" clickable icon={<MuiIcon name="external" size={12} />} label="adventures.story-tail.com" sx={glassChip} />
            </Stack>
          </Box>
        </Box>
        <Box component="footer" sx={{ px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                       bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', color: 'text.secondary' }}>
          <Typography variant="caption" sx={{ fontWeight: 500 }}>© 2026 Story-Tail Adventures · Hosted by Inteletravel</Typography>
          <Stack direction="row" spacing={2}>
            {['Privacy', 'Terms', 'Cookies', 'Accessibility', 'Marketing site →'].map((l) => (
              <Link key={l} href="#" underline="hover" variant="caption" color="inherit" sx={{ fontWeight: 500 }}>{l}</Link>
            ))}
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.2 — About / How It Works
function C202_About() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, Paper, Avatar, Divider, Accordion, AccordionSummary, AccordionDetails, alpha } = MUI;
  const steps = [
    { i: 'message', t: 'Ask', d: 'Tell me what you\'re craving — beach week, family cruise, honeymoon — by message or a quick call.' },
    { i: 'sparkle', t: 'Plan together', d: 'I come back with a curated proposal: real options, real prices, my honest takes — never a generic search dump.' },
    { i: 'plane', t: 'Go rest', d: 'I book through suppliers, you authorize a card for them to charge, and I keep watch on the details while you receive the rest you came for.' },
  ];
  const faq = [
    { q: 'Do I pay a planning fee?', a: 'No. Inteletravel host-agency policy prohibits it. Gyasi earns commission from suppliers — you pay them, never us.' },
    { q: 'What does Inteletravel mean for me?', a: 'It\'s the host agency that issues bookings. You\'ll see them on supplier invoices. It does not change how you work with Story-Tail.' },
    { q: 'How does payment authorization work?', a: 'You add a card through a Stripe-secured form. Story-Tail uses it only to pay suppliers on your behalf — never to charge you a service fee. Every use is audit-logged and you get notified.' },
    { q: 'Can I plan without an account?', a: 'You can browse and inquire as a guest. To save searches, view a real proposal, or authorize a card, you\'ll create an account.' },
  ];
  function Pillar({ icon, accent, num, title, body, quote, cite }) {
    return (
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.25 }}>
            <Avatar variant="rounded" sx={{ width: 44, height: 44, bgcolor: `${accent}.container`, color: `${accent}.onContainer` }}>
              <Icon name={icon} size={20} />
            </Avatar>
            <Box>
              <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>{num}</Typography>
              <Typography variant="h5">{title}</Typography>
            </Box>
          </Stack>
          <Typography variant="caption" component="p" color="text.secondary">{body}</Typography>
          <Divider sx={{ mt: 1.75, mb: 1.5 }} />
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline' }}>
            <Typography variant="script" sx={{ color: 'primary.main', fontSize: 22, lineHeight: 1 }}>{quote}</Typography>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.2, whiteSpace: 'nowrap', lineHeight: 1 }}>{cite}</Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} scrollable padding={0}>
      <Box sx={{ px: 6, pt: 4, pb: 6, maxWidth: 980, mx: 'auto' }}>
        <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>HOW STORY-TAIL WORKS</Typography>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mt: 0.5, mb: 0.75 }}>You ask. We plan together. You go and rest.</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>Under 90 seconds of reading — promise. No planning fees, ever — Story-Tail earns commission from suppliers, not from you. We exist so you can take the rest you were made for.</Typography>

        <Grid container spacing={2} sx={{ mt: 3 }}>
          {steps.map((s, i) => (
            <Grid key={s.t} size={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.25 }}>
                  <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
                    <Icon name={s.i} size={20} />
                  </Avatar>
                  <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, mt: 1.5, lineHeight: 1.3 }}>STEP {String(i + 1).padStart(2, '0')}</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5, mb: 0.75 }}>{s.t}</Typography>
                  <Typography variant="caption" component="p" color="text.secondary">{s.d}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Our heart — why we do this */}
        <Paper elevation={0} sx={{
          mt: 3.5, px: 3, pt: 3, pb: 3.25, position: 'relative', overflow: 'hidden',
          background: (t) => `linear-gradient(135deg, ${t.palette.surface[2]} 0%, ${t.palette.primary.container} 140%)`,
        }}>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 240, height: 240, borderRadius: '50%',
                     background: (t) => `radial-gradient(circle at 30% 30%, ${alpha(t.palette.brand.main, 0.18)}, transparent 70%)` }} />
          <Box sx={{ position: 'relative' }}>
            <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>OUR HEART · WHY WE DO THIS</Typography>
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mt: 0.5, mb: 0.75, maxWidth: 760 }}>Vacation is <i>rest</i>. Rest is sacred. The world is <i>good</i>, and meant to be enjoyed.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25, maxWidth: 720 }}>Two beliefs sit behind every trip we plan. They're the reason Gyasi answers a 9pm message about sunscreen brands and the reason we cap your card at the invoice — not a penny more.</Typography>

            <Grid container spacing={1.75}>
              {/* Pillar 1 — Rest is a command */}
              <Grid size={6}>
                <Pillar icon="heart" accent="primary" num="PILLAR 01" title="Rest is a command, not a luxury."
                  body="On the seventh day God rested and called it holy — not because He was tired, but because He was making rest a gift to us. When we plan your week away, we plan a Sabbath worth taking. No screens that demand you. No charges that surprise you. Real rest."
                  quote={'"Come to me, all who are weary, and I will give you rest."'} cite="MATT 11:28" />
              </Grid>
              {/* Pillar 2 — Creation is a gift */}
              <Grid size={6}>
                <Pillar icon="palm" accent="secondary" num="PILLAR 02" title="Creation is a gift, meant to be enjoyed."
                  body="God made the reef, the trade wind, the warm rain on a tin roof — and called it very good. We don't sell escape from your life; we help you receive a world that's already waiting for you. The Caribbean is one beautiful answer to that invitation."
                  quote={'"God saw all that he had made, and it was very good."'} cite="GEN 1:31" />
              </Grid>
            </Grid>

            <Paper elevation={0} sx={{ mt: 2, px: 2, py: 1.5, bgcolor: 'background.paper', display: 'flex', gap: 1.25, alignItems: 'center' }}>
              <MuiIcon name="info" size={16} sx={{ color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                <Box component="b" sx={{ color: 'text.primary' }}>Whatever your faith — you're welcome here.</Box> This is just where our hands come from. Every traveler gets the same care, the same honesty, the same Caribbean.
              </Typography>
            </Paper>
          </Box>
        </Paper>

        {/* Gyasi card */}
        <Card sx={{ mt: 3, bgcolor: 'surface.2' }}>
          <CardContent sx={{ p: 2.75, display: 'grid', gridTemplateColumns: '120px 1fr', gap: 2.75, alignItems: 'center', '&:last-child': { pb: 2.75 } }}>
            <Avatar src={staImg('avatarA', 240, 240)} alt="" sx={{ width: 120, height: 120 }} />
            <Box>
              <Typography variant="h5">Meet Gyasi Story · Travel Advisor</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Caribbean specialist hosted by Inteletravel. Family travel, honeymoons, cruises, and the kind of all-inclusive weeks that turn into stories worth retelling.</Typography>
              <Stack direction="row" spacing={1.75} sx={{ mt: 1.25, color: 'text.secondary' }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <MuiIcon name="star" size={12} fill="currentColor" sx={{ color: 'brandSource.sunset' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>4.9 · 138 reviews</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <MuiIcon name="users" size={12} /><Typography variant="caption" sx={{ fontWeight: 500 }}>240+ travelers</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <MuiIcon name="shield" size={12} /><Typography variant="caption" sx={{ fontWeight: 500 }}>CLIA member</Typography>
                </Stack>
              </Stack>
            </Box>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="h5">FAQ</Typography>
          <Stack spacing={1.25} sx={{ mt: 1.25 }}>
            {faq.map((f, i) => (
              <Accordion key={i} defaultExpanded={i === 0} disableGutters>
                <AccordionSummary expandIcon={<MuiIcon name="chevron_down" size={16} />}>
                  <Typography variant="subtitle2">{f.q}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="body2" color="text.secondary">{f.a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ mt: 3.75, p: 2.5, bgcolor: 'primary.container', color: 'primary.onContainer', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ color: 'inherit' }}>Ready to start planning?</Typography>
            <Typography variant="caption" component="p" sx={{ opacity: 0.85, mt: 0.5, color: 'inherit' }}>Create an account in under 60 seconds — or message Gyasi without one.</Typography>
          </Box>
          <Button variant="contained">Create account</Button>
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.3 — Public Search Landing (No Account)
function C203_PublicSearchLanding() {
  const { Box, Stack, Grid, Typography, Button, Card, CardMedia, Paper, Divider, Alert } = MUI;
  const fields = [
    { l: 'Destination', v: 'Caribbean', icon: 'map' },
    { l: 'Dates', v: 'Aug 12 – 19', icon: 'calendar' },
    { l: 'Travelers', v: '2 adults', icon: 'user' },
  ];
  const tiles = [
    { t: 'Caribbean escapes', i: 'turks', tag: '12 active' },
    { t: 'Family cruises', i: 'cruiseShip', tag: '8 active' },
    { t: 'Honeymoons', i: 'honeymoon', tag: '6 active' },
    { t: 'All-inclusive resorts', i: 'resortPool', tag: '15 active' },
    { t: 'Adventure travel', i: 'snorkel', tag: '4 active' },
    { t: 'Group trips · 6+', i: 'overwater', tag: '3 active' },
  ];
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 280, overflow: 'hidden' }}>
        <Box component="img" src={staImg('bahamas', 1600, 500)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,33,55,0.6), rgba(13,33,55,0.2))' }} />
        <Box sx={{ position: 'absolute', inset: 0, px: 6, py: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'common.white', maxWidth: 760 }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brandSource.gold', fontWeight: 600 }}>BROWSE WITHOUT AN ACCOUNT</Typography>
          <Typography variant="h3" component="h1" sx={{ color: 'common.white', fontWeight: 700, mt: 0.5, mb: 1.5 }}>Find your next chapter.</Typography>
          <Paper elevation={2} sx={{ display: 'flex', alignItems: 'center', color: 'text.primary' }}>
            {fields.map((f, i) => (
              <React.Fragment key={f.l}>
                {i > 0 && <Divider orientation="vertical" flexItem />}
                <Box sx={{ flex: 1, px: 2, py: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{f.l}</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
                    <MuiIcon name={f.icon} size={13} sx={{ color: 'brand.main' }} />
                    <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>{f.v}</Typography>
                  </Stack>
                </Box>
              </React.Fragment>
            ))}
            <Button variant="contained" startIcon={<MuiIcon name="search" size={16} />} sx={{ height: 44, m: 0.5, flexShrink: 0 }}>Search</Button>
          </Paper>
        </Box>
      </Box>

      <Alert severity="warning" icon={<MuiIcon name="info" size={16} />}
             action={(
               <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: '100%' }}>
                 <Button variant="text" size="small" color="inherit">Sign in</Button>
                 <Button variant="contained" size="small">Create account</Button>
               </Stack>
             )}
             sx={{ borderRadius: 0, px: 6, alignItems: 'center', borderBottom: 1, borderColor: 'divider', '& .MuiAlert-action': { pt: 0, mr: 0 } }}>
        <Typography variant="caption"><b>Sign in or create an account</b> to save searches, favorite trips, and request a real proposal.</Typography>
      </Alert>

      <Box sx={{ px: 6, pt: 3, pb: 4 }}>
        <Typography variant="h5">Inspiration · curated</Typography>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5, mb: 1.75 }}>Six trip types we live and breathe. Tap any to start a search.</Typography>
        <Grid container spacing={1.75}>
          {tiles.map((s) => (
            <Grid key={s.t} size={4}>
              <Card sx={{ position: 'relative', overflow: 'hidden', aspectRatio: '5/3' }}>
                <CardMedia component="img" image={staImg(s.i, 600, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7))' }} />
                <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 10, color: 'common.white' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{s.t}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, opacity: 0.85, mt: 0.25, lineHeight: 1 }}>{s.tag}</Typography>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper elevation={0} sx={{ display: 'flex', gap: 2, mt: 2.75, p: 2.25, bgcolor: 'surface.2' }}>
          <MuiIcon name="shield" size={20} sx={{ color: 'secondary.main' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1">Trusted</Typography>
            <Typography variant="caption" component="p" color="text.secondary">Hosted by Inteletravel · CLIA member · 4.9★ from 138 travelers</Typography>
          </Box>
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.4 — Public Search Results (Browse Anonymously)
function C204_PublicSearchResults() {
  const { Box, Stack, Typography, Button, Card, CardMedia, Paper, Divider, Chip, Checkbox, FormGroup, FormControlLabel } = MUI;
  const crumbs = [
    { l: 'Caribbean', i: 'map' }, { l: 'Aug 12 – 19', i: 'calendar' },
    { l: '2 adults', i: 'user' }, { l: 'Any', i: 'palm' },
  ];
  const filters = [
    { t: 'Trip type', opts: ['All-inclusive', 'Cruise', 'Hotel', 'Tour'] },
    { t: 'Vibe', opts: ['Adults-only', 'Family', 'Honeymoon', '5★'] },
    { t: 'Budget', opts: ['Under $2k pp', '$2–4k pp', '$4k+ pp'] },
  ];
  const results = [
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only', p: 3290, i: 'overwater', tag: 'All-inclusive · 7n', r: 4.9 },
    { t: 'Royal Caribbean Symphony', s: 'Eastern Caribbean · 7-day', p: 1850, i: 'cruiseShip', tag: 'Cruise · Family', r: 4.7 },
    { t: 'Beaches Turks & Caicos', s: 'Providenciales', p: 2640, i: 'turks', tag: 'All-inclusive · Family', r: 4.8 },
  ];
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 4, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center' }}>
            {crumbs.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Divider orientation="vertical" flexItem />}
                <Stack direction="row" spacing={0.75} sx={{ flex: 1, px: 1.75, py: 1.25, alignItems: 'center' }}>
                  <MuiIcon name={f.i} size={12} sx={{ color: 'brand.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1 }}>{f.l}</Typography>
                </Stack>
              </React.Fragment>
            ))}
            <Button variant="contained" size="small" sx={{ m: 0.5, flexShrink: 0 }}>Update</Button>
          </Paper>
        </Box>

        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
          <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 2, overflow: 'auto', bgcolor: 'surface.main' }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>FILTERS</Typography>
            {filters.map((g) => (
              <Box key={g.t} sx={{ mb: 1.75 }}>
                <Typography variant="subtitle1" sx={{ mb: 0.25 }}>{g.t}</Typography>
                <FormGroup>
                  {g.opts.map((o, i) => (
                    <FormControlLabel key={o} control={<Checkbox size="small" defaultChecked={i === 0} />}
                      label={o} slotProps={{ typography: { variant: 'body2', color: 'text.secondary', sx: { fontWeight: 500 } } }}
                      sx={{ mr: 0, '& .MuiCheckbox-root': { py: 0.5 } }} />
                  ))}
                </FormGroup>
              </Box>
            ))}
          </Box>
          <Box sx={{ overflow: 'auto', p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h5">148 trips · Caribbean</Typography>
              <Chip variant="outlined" clickable label="Sort · Best fit ▾" />
            </Stack>
            {results.map((r, i) => (
              <Card key={i} sx={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', mb: 1.25 }}>
                <CardMedia component="img" image={staImg(r.i, 360, 200)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <Box sx={{ px: 2, py: 1.75 }}>
                  <Chip size="small" color="tertiary" label={r.tag} sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 9.5, letterSpacing: 0.4, height: 20 }} />
                  <Typography variant="h5" sx={{ mt: 0.75, mb: 0.25 }}>{r.t}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <Typography variant="caption">{r.s} ·</Typography>
                    <MuiIcon name="star" size={11} fill="currentColor" sx={{ color: 'brandSource.sunset' }} />
                    <Typography variant="caption">{r.r}</Typography>
                  </Stack>
                </Box>
                <Box sx={{ px: 2, py: 1.75, borderLeft: 1, borderColor: 'divider', textAlign: 'right', minWidth: 170, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>FROM</Typography>
                  <Typography variant="h5" sx={{ my: 0.25 }}>${r.p.toLocaleString()}<Typography variant="caption" component="span" color="text.secondary"> /pp</Typography></Typography>
                  <Button variant="contained" size="small" sx={{ mt: 'auto' }}>Request quote*</Button>
                  <Button variant="text" size="small" startIcon={<MuiIcon name="heart" size={11} />} sx={{ mt: 0.5 }}>Save*</Button>
                </Box>
              </Card>
            ))}
            <Typography variant="caption" component="p" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>* Requires creating an account — takes 60 seconds.</Typography>
          </Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.5 — Public Property / Cruise / Tour Detail
function C205_PublicDetail() {
  const { Box, Stack, Grid, Typography, Button, IconButton, Card, CardContent, Paper, Chip, Avatar } = MUI;
  const features = [
    { i: 'plane', t: 'Flights included from MIA' },
    { i: 'utensils', t: '12 restaurants' },
    { i: 'heart', t: 'Red Lane spa credit' },
    { i: 'ship', t: 'Day-trip to Rose Island' },
  ];
  const days = ['Day 1 · Arrival & sunset welcome', 'Day 2 · Beach + Red Lane spa', 'Day 3 · Rose Island Cay snorkel', 'Day 4 · Resort day'];
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 280, overflow: 'hidden' }}>
        <Box component="img" src={staImg('overwater', 1600, 500)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5))' }} />
        <Stack direction="row" sx={{ position: 'absolute', left: 32, right: 32, bottom: 20, color: 'common.white', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Box>
            <Chip size="small" label="All-inclusive · 7 nights"
                  sx={{ bgcolor: 'rgba(255,255,255,0.92)', color: 'primary.main', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }} />
            <Typography variant="h3" component="h1" sx={{ color: 'common.white', fontWeight: 700, mt: 1, mb: 0.25 }}>Sandals Royal Bahamian</Typography>
            <Stack direction="row" spacing={1.75} sx={{ opacity: 0.92 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <MuiIcon name="pin" size={13} /><Typography variant="body2" sx={{ fontWeight: 500 }}>Nassau, Bahamas</Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <MuiIcon name="star" size={13} fill="currentColor" sx={{ color: 'brandSource.sunset' }} /><Typography variant="body2" sx={{ fontWeight: 500 }}>4.9 · 312 reviews</Typography>
              </Stack>
            </Stack>
          </Box>
          <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.92)', color: 'text.primary', '&:hover': { bgcolor: 'common.white' } }}>
            <MuiIcon name="heart" size={18} />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ px: 4, pt: 2.5, pb: 4, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 2.25 }}>
        <Box>
          <Typography variant="h5">What it is</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1.75 }}>
            Over-water bungalows, six pools, twelve dining venues, a Red Lane spa, and a private island day. Adults-only — built for honeymoons, anniversaries, and "just us" weeks.
          </Typography>

          <Grid container spacing={1} sx={{ mb: 1.75 }}>
            {features.map((f) => (
              <Grid key={f.t} size={3}>
                <Paper elevation={0} sx={{ px: 1.5, py: 1.25, bgcolor: 'surface.2', display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
                  <MuiIcon name={f.i} size={16} sx={{ color: 'brand.main' }} />
                  <Typography variant="caption">{f.t}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Typography variant="h5">Sample itinerary</Typography>
          {days.map((d, i) => (
            <Card key={d} sx={{ mt: 1 }}>
              <CardContent sx={{ px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, '&:last-child': { pb: 1.25 } }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 700, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>{i + 1}</Avatar>
                <Typography variant="body2">{d}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        <Stack component="aside" spacing={1.75}>
          <Card>
            <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>STARTING AT</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, my: 0.5 }}>$3,290<Typography variant="body2" component="span" color="text.secondary"> /person</Typography></Typography>
              <Typography variant="caption" component="p" color="text.secondary">All-in · flights, transfers, all meals, drinks, activities</Typography>
              <Button variant="contained" fullWidth sx={{ mt: 1.75 }}>Request a quote</Button>
              <Button variant="outlined" color="secondary" fullWidth startIcon={<MuiIcon name="heart" size={14} />} sx={{ mt: 1 }}>Favorite</Button>
              <Typography variant="caption" component="p" color="text.secondary" sx={{ textAlign: 'center', mt: 1.25 }}>* Requires an account, or...</Typography>
              <Button variant="text" size="small" fullWidth sx={{ mt: 0.5 }}>Message Gyasi without an account →</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.25, '&:last-child': { pb: 2 } }}>
              <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 36, height: 36 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">Gyasi planned 14 of these</Typography>
                <Typography variant="caption" component="p" color="text.secondary">Caribbean specialist</Typography>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.6 — Sign-up Gate / Quote Request Prompt (modal)
function C206_SignUpGate() {
  const { Box, Stack, Typography, Button, Card, CardContent, Divider, TextField, Link, alpha } = MUI;
  const perks = [
    'Save searches & favorites',
    'View Gyasi\'s curated proposals',
    'Authorize cards securely · paid to suppliers, not us',
  ];
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4,
                 background: (t) => `radial-gradient(circle at 50% 30%, ${alpha(t.palette.primary.main, 0.18)}, transparent), ${t.palette.background.default}` }}>
        <Card elevation={4} sx={{ width: '100%', maxWidth: 520 }}>
          <CardContent sx={{ p: 3.5, '&:last-child': { pb: 3.5 } }}>
            <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>ALMOST THERE</Typography>
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mt: 0.5, mb: 0.75 }}>Create an account to send Gyasi your trip details.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Takes about 60 seconds. You'll get a real proposal back — not a generic search dump.</Typography>

            <Stack spacing={1} sx={{ mb: 1.75 }}>
              {perks.map((b) => (
                <Stack key={b} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <MuiIcon name="check" size={14} stroke={2.5} sx={{ color: 'success.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{b}</Typography>
                </Stack>
              ))}
            </Stack>

            <Button variant="outlined" size="large" fullWidth sx={{ mb: 1 }}
              startIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.2 8.5 9.9V14.9H8V12h2.5V9.7c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7C18.3 21.2 22 17 22 12Z" fill="#1565C0"/></svg>}>
              Continue with Google
            </Button>
            <Button variant="outlined" size="large" fullWidth startIcon={<MuiIcon name="user" size={14} />} sx={{ mb: 1.75 }}>
              Continue with Apple
            </Button>

            <Divider sx={{ mt: 0.5, mb: 1.5 }}>
              <Typography variant="overline" color="text.secondary">OR EMAIL</Typography>
            </Divider>
            <TextField size="small" fullWidth defaultValue="Jordan Hayes" placeholder="Your name" sx={{ mb: 1 }} />
            <TextField size="small" fullWidth defaultValue="jordan.hayes@example.com" placeholder="Email" sx={{ mb: 1 }} />
            <TextField size="small" fullWidth type="password" defaultValue="••••••••••••" placeholder="Password" />

            <Button variant="contained" size="large" fullWidth sx={{ mt: 1.75 }}>Create account &amp; send quote</Button>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1.5 }}>
              <Link href="#" underline="hover" variant="caption" sx={{ fontWeight: 500 }}>Already have an account? Sign in</Link>
              <Link href="#" underline="hover" variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Continue as guest →</Link>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.0.7 — Footer Pages (Privacy/Terms/Cookies/Accessibility)
function C207_FooterPages() {
  const { Box, Stack, Typography, Paper, Link, List, ListItemButton, ListItemText } = MUI;
  const pages = ['Privacy policy', 'Terms of service', 'Cookies', 'Accessibility statement', 'Data processing addendum'];
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <Box sx={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', p: 2.75, bgcolor: 'background.paper' }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>LEGAL &amp; COMPLIANCE</Typography>
          <List dense disablePadding>
            {pages.map((s, i) => (
              <ListItemButton key={s} selected={i === 0} sx={{ borderRadius: 1, mb: 0.25 }}>
                <ListItemText primary={s} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 500 } } }} />
              </ListItemButton>
            ))}
          </List>
          <Paper elevation={0} sx={{ mt: 2.5, p: 1.5, bgcolor: 'surface.2' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Need to print? Click "Printable view" at the top of any page.
            </Typography>
          </Paper>
        </Box>
        <Box sx={{ px: 6, py: 4, maxWidth: 720, overflow: 'auto' }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>LEGAL</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 0.5, mb: 0.5 }}>Privacy policy</Typography>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              Last updated May 14, 2026 · <Link href="#" underline="hover">Printable view</Link> · <Link href="#" underline="hover">Download PDF</Link>
            </Typography>
          </Stack>

          <Box sx={{ mt: 2.25, color: 'text.primary' }}>
            <Typography variant="h5" component="h3" sx={{ mt: 2.25 }}>1. What we collect</Typography>
            <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.65 }}>Story-Tail Adventures collects contact information, trip details, and payment-card data (tokenized via Stripe) only to provide travel advisory services. We do not sell or share your information with marketing third parties.</Typography>
            <Typography variant="h5" component="h3" sx={{ mt: 2.25 }}>2. How payment cards are handled</Typography>
            <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.65 }}>Cards you add through the portal are tokenized by Stripe Elements before they leave your browser. Story-Tail never sees the full card number. Tokenized cards are used solely to pay travel suppliers on your behalf, and every use generates an audit-logged event with a notification to you.</Typography>
            <Typography variant="h5" component="h3" sx={{ mt: 2.25 }}>3. Your data rights</Typography>
            <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.65 }}>You can request a copy of all data we hold about you at any time from your Account → Privacy &amp; Data Export. You can revoke any stored card from your Wallet at any time. Account closure preserves transaction records for tax compliance but anonymizes personal identifiers.</Typography>
          </Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C201_PublicLanding, C202_About, C203_PublicSearchLanding,
  C204_PublicSearchResults, C205_PublicDetail, C206_SignUpGate, C207_FooterPages,
});
