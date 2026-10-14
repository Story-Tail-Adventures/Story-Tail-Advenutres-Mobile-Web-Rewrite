/* global React, MUI, MuiIcon, staImg, MuiScreenFrame, MuiStaStatus, GRP, GRP_OPTIONS, GRP_ITIN, GRP_LEADERS, GRP_NOTE, GMuiStatus */
// Client · Group trips (proposed 2.8.5 public sign-up · 2.8.6 waitlist offer · 2.8.9 member group card). MUI v9.
// Brief: design/briefs/group-trips.md (settled 2026-10-14). Public page uses the public chrome (2.0),
// is unlisted (noindex, slug link only), never takes a card, and keeps urgency calm.
//
// Ported to MUI from the design project's class-style file (13e01bd3…, synced 2026-10-14).
// Layout and copy follow the drawn artboards, with two deliberate changes:
//  - 2.8.5g no longer promises "Usually within two business days" (nothing backs the number,
//    same class as the reply-time strings in sync-design-handoff delta 6).
//  - 2.8.6c (expired) no longer states a queue position; the brief does not say where an
//    expired offer goes in line.
// The phone artboards stay class-style in group-mobile.jsx, like every other *-mobile.jsx.

const PUBLIC_OPTS = GRP_OPTIONS.filter((o) => o.isPublic);

// Initials avatar for Gyasi (no licensed photo yet, per the 2.2m known deltas).
function GMuiGyasiAvatar({ size = 40 }) {
  const { Avatar } = MUI;
  return <Avatar sx={{ width: size, height: size, fontSize: size * 0.36, fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>GS</Avatar>;
}

// Two-column label/value summary used by review, offer and party panels.
function GSummary({ rows }) {
  const { Box, Typography } = MUI;
  return (
    <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'surface.2', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2.25, rowGap: 1 }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{k}</Typography>
          <Typography variant="body2">{v}</Typography>
        </React.Fragment>
      ))}
    </Box>
  );
}

function GOptionCard({ o, mode = 'open', selected = false }) {
  // mode: open | full | waitlist | closed
  const { Card, Stack, Box, Typography, Button } = MUI;
  const full = mode === 'full';
  return (
    <Card variant="outlined" sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25, borderWidth: selected ? 2 : 1, borderColor: selected ? 'primary.main' : 'divider', opacity: full ? 0.92 : 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>{o.name}</Typography>
        {full && <MuiStaStatus kind="past">Full</MuiStaStatus>}
        {selected && <MuiStaStatus kind="booked">Chosen</MuiStaStatus>}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ minHeight: 38, textWrap: 'pretty' }}>{o.desc}</Typography>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.4px' }}>{o.price}</Typography>
        <Typography variant="body2" color="text.secondary">per person</Typography>
      </Stack>
      <Stack spacing={0.5}>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><MuiIcon name="card" size={14}/> {o.deposit} per person to hold your spot</Typography>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><MuiIcon name="users" size={14}/> {o.occ}</Typography>
      </Stack>
      <Box sx={{ mt: 'auto', pt: 0.5 }}>
        {mode === 'open' && <Button fullWidth variant={selected ? 'contained' : 'outlined'}>{selected ? 'Chosen' : 'Choose'}</Button>}
        {(mode === 'full' || mode === 'waitlist') && <Button fullWidth variant="outlined" color="secondary">Join the waitlist</Button>}
        {mode === 'closed' && <Typography variant="body2" color="text.secondary">Sign-ups are closed.</Typography>}
      </Box>
    </Card>
  );
}

function GStepHead({ n, title, done, active, summary }) {
  const { Stack, Box, Typography, Button } = MUI;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 13,
        bgcolor: done ? 'primary.main' : active ? 'primary.container' : 'surface.3',
        color: done ? 'primary.contrastText' : active ? 'primary.onContainer' : 'text.secondary' }}>
        {done ? <MuiIcon name="check" size={14}/> : n}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: active || done ? 'text.primary' : 'text.secondary' }}>{title}</Typography>
        {summary && <Typography variant="body2" color="text.secondary">{summary}</Typography>}
      </Box>
      {done && <Button variant="text" size="small">Change</Button>}
    </Stack>
  );
}

function GTravelerRow({ name, kind }) {
  const { Box, TextField, ToggleButtonGroup, ToggleButton, IconButton } = MUI;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 1.25, alignItems: 'center' }}>
      <TextField size="small" fullWidth label="Full name, as it appears on their ID" defaultValue={name}/>
      <ToggleButtonGroup size="small" exclusive value={kind}>
        <ToggleButton value="Adult" sx={{ px: 2 }}>Adult</ToggleButton>
        <ToggleButton value="Child" sx={{ px: 2 }}>Child</ToggleButton>
      </ToggleButtonGroup>
      <IconButton size="small" aria-label="Remove traveler"><MuiIcon name="close" size={16}/></IconButton>
    </Box>
  );
}

function GSignupForm({ step = 2, waitlist = false }) {
  const { Card, Stack, Box, Typography, Button, Divider } = MUI;
  return (
    <Card variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Box>
        <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3, display: 'block' }}>{waitlist ? 'Waitlist' : 'Sign up'}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{waitlist ? 'Join the waitlist' : 'Save your spot'}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {waitlist ? "If a spot opens, you'll get an email and 72 hours to say yes." : 'Four short steps. Nothing is charged today.'}
        </Typography>
      </Box>
      <Divider/>
      <GStepHead n={1} title="Choose an option" done={step > 1} active={step === 1} summary={step > 1 ? (waitlist ? 'Balcony · $1,840 per person' : 'Ocean view · $1,480 per person') : null}/>
      <Divider/>
      <GStepHead n={2} title="Who's coming" done={step > 2} active={step === 2} summary={step > 2 ? 'Rachel Thompson, Owen Thompson · 2 adults' : null}/>
      {step === 2 && (
        <Stack spacing={1.5} sx={{ pl: 5 }}>
          <GTravelerRow name="Rachel Anne Thompson" kind="Adult"/>
          <GTravelerRow name="Owen James Thompson" kind="Adult"/>
          <Button variant="outlined" startIcon={<MuiIcon name="plus" size={16}/>} sx={{ justifyContent: 'flex-start', borderStyle: 'dashed', py: 1.25 }}>
            Add a traveler
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Ocean view sleeps up to 4</Typography>
          </Button>
          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end' }}>
            <Button variant="text">Back</Button>
            <Button variant="contained">Continue</Button>
          </Stack>
        </Stack>
      )}
      <Divider/>
      <GStepHead n={3} title="Your details" done={step > 3} active={step === 3} summary={step > 3 ? 'Rachel Thompson · rachel.t@example.com · (555) 418-2290' : null}/>
      <Divider/>
      <GStepHead n={4} title={waitlist ? 'Review and join' : 'Review and send'} active={step === 4}/>
      {step === 4 && (
        <Stack spacing={1.75} sx={{ pl: 5 }}>
          <GSummary rows={[
            ['Option', waitlist ? 'Balcony' : 'Ocean view'],
            ['Travelers', 'Rachel Thompson, Owen Thompson'],
            ['Price', waitlist ? '$1,840 per person · $3,680 total' : '$1,480 per person · $2,960 total'],
            ['Deposit', waitlist ? '$300 per person, due once your spot is confirmed' : '$250 per person, due once your spot is confirmed'],
          ]}/>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', p: 2, borderRadius: 3.5, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
            <MuiIcon name="shield" size={20}/>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'inherit' }}>{waitlist ? 'Nothing is charged today. If a spot opens, Gyasi will reach out.' : 'Nothing is charged today. Gyasi will follow up to confirm your spot.'}</Typography>
          </Stack>
          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end' }}>
            <Button variant="text">Back</Button>
            <Button variant="contained" color="brand" size="large">{waitlist ? 'Join the waitlist' : 'Send my sign-up'}</Button>
          </Stack>
        </Stack>
      )}
      <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.75, borderRadius: 3.5, border: 1, borderColor: 'divider' }}>
        <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><MuiIcon name="mail" size={18}/></Box>
        <Typography variant="body2" color="text.secondary">
          <Box component="b" sx={{ color: 'text.primary' }}>What happens next.</Box> You'll get an email to set up your account. Gyasi will {waitlist ? 'let you know if a spot opens' : 'confirm your spot'}. We'll take it from here.
        </Typography>
      </Stack>
    </Card>
  );
}

function GLeaderNote() {
  const { Paper, Box, Avatar, Typography } = MUI;
  const l = GRP_LEADERS[0];
  return (
    <Paper elevation={0} sx={{ p: 2.75, display: 'flex', gap: 2.25, alignItems: 'flex-start', bgcolor: 'surface.2' }}>
      <Avatar src={staImg(l.img, 160, 160)} alt="" sx={{ width: 72, height: 72 }}/>
      <Box>
        <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3, display: 'block' }}>A welcome from your group leader</Typography>
        <Typography variant="body1" sx={{ my: 1, textWrap: 'pretty' }}>{GRP_NOTE}</Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{l.name}</Typography>
      </Box>
    </Paper>
  );
}

function GAgentCard() {
  const { Card, Stack, Box, Typography } = MUI;
  return (
    <Card variant="outlined" sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>Your travel advisor</Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <GMuiGyasiAvatar size={48}/>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Gyasi Story</Typography>
          <Typography variant="body2" color="text.secondary">Story-Tail Adventures</Typography>
        </Box>
      </Stack>
      <Typography variant="body2" sx={{ textWrap: 'pretty' }}>I'm planning every detail of this trip. Ask me anything, big or small.</Typography>
      <Stack spacing={0.75}>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><MuiIcon name="mail" size={14}/> gyasi@story-tail.com</Typography>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><MuiIcon name="phone" size={14}/> (305) 555-0184</Typography>
      </Stack>
    </Card>
  );
}

function GBanner({ tone = 'neutral', icon, title, body, action }) {
  const { Stack, Box, Typography } = MUI;
  const bg = tone === 'info' ? 'secondary.container' : tone === 'primary' ? 'primary.container' : 'surface.3';
  const fg = tone === 'info' ? 'secondary.onContainer' : tone === 'primary' ? 'primary.onContainer' : 'text.primary';
  return (
    <Stack direction="row" spacing={1.75} sx={{ px: 2.5, py: 2, borderRadius: 4, bgcolor: bg, color: fg, alignItems: 'center' }}>
      <MuiIcon name={icon} size={22}/>
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'inherit' }}>{title}</Typography>
        <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9, mt: 0.25 }}>{body}</Typography>
      </Box>
      {action}
    </Stack>
  );
}

// variant: open | optionFull | groupFull | closed | already | review
function GPublicPage({ variant = 'open' }) {
  const { Box, Stack, Card, Typography, Button, Link } = MUI;
  const waitlist = variant === 'groupFull';
  const closed = variant === 'closed';
  const already = variant === 'already';
  const modeFor = (o) => closed ? 'closed' : waitlist ? 'waitlist' : (variant !== 'open' && o.limit && o.filled >= o.limit) ? 'full' : 'open';
  const spots = waitlist ? 'This trip is full' : closed ? 'Sign-ups are closed' : '8 spots left';
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} scrollable padding={0}>
      <Box sx={{ position: 'relative', height: 400, overflow: 'hidden' }}>
        <Box component="img" src={staImg('cruiseShip', 1800, 700)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.05) 20%, rgba(13,33,55,0.82))' }}/>
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, color: 'common.white' }}>
          <Box sx={{ maxWidth: 1200, mx: 'auto', px: 5, pb: 4.5 }}>
            <Typography variant="overline" sx={{ color: '#FFC83F', fontWeight: 600 }}>Group trip · planned by Story-Tail Adventures</Typography>
            <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mt: 1, mb: 1.25, color: 'common.white', maxWidth: 820 }}>{GRP.name}</Typography>
            <Stack direction="row" spacing={2.5} sx={{ flexWrap: 'wrap', opacity: 0.95 }}>
              <Typography variant="body1" sx={{ display: 'flex', gap: 1, alignItems: 'center', fontWeight: 500, color: 'inherit' }}><MuiIcon name="calendar" size={16}/> {GRP.dates}</Typography>
              <Typography variant="body1" sx={{ display: 'flex', gap: 1, alignItems: 'center', fontWeight: 500, color: 'inherit' }}><MuiIcon name="ship" size={16}/> {GRP.route}</Typography>
            </Stack>
          </Box>
        </Box>
      </Box>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: 5, pt: 3.5, pb: 7, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 4, alignItems: 'start' }}>
        <Stack spacing={3.5} sx={{ minWidth: 0 }}>
          {waitlist && <GBanner tone="info" icon="users" title="This trip is full right now" body="You can still join the waitlist. If a spot opens, you'll hear from us and have 72 hours to decide."/>}
          {closed && <GBanner icon="lock" title="Sign-ups for this trip are closed" body="The sign-up deadline was November 30, 2026. Have a question? Gyasi is happy to help." action={<Button variant="outlined" size="small">Message Gyasi</Button>}/>}
          {already && <GBanner tone="primary" icon="check" title="You're already on this trip" body="You signed up on October 2 for Ocean view, 2 travelers." action={<Button variant="contained" size="small" endIcon={<MuiIcon name="arrow_right" size={14}/>}>Go to your trip</Button>}/>}

          <Box component="section">
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.25 }}>A week at sea together. Time to slow down.</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 700, textWrap: 'pretty' }}>
              Seven nights in the Western Caribbean with people you already know, and a few you'll be glad to meet. Long mornings on deck, a beach day in Roatán, and dinners where nobody is in a hurry. I've planned the shared parts, so all you need to do is pick a cabin and come.
            </Typography>
          </Box>

          <GLeaderNote/>

          <Box component="section">
            <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Day by day</Typography>
            <Card variant="outlined">
              {GRP_ITIN.map((d, i) => (
                <Box key={d.d} sx={{ display: 'grid', gridTemplateColumns: '64px 120px minmax(0,1fr)', gap: 1.5, alignItems: 'center', px: 2.25, py: 1.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                  <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>Day {i + 1}</Typography>
                  <Typography variant="body2" color="text.secondary">{d.d}</Typography>
                  <Typography variant="body2"><b>{d.t}</b> <Box component="span" sx={{ color: 'text.secondary' }}>· {d.s}</Box></Typography>
                </Box>
              ))}
            </Card>
          </Box>

          <Box component="section">
            <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>Choose your cabin</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75 }}>Prices are per person and include the cruise, port fees, and the group activities above.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1.75 }}>
              {PUBLIC_OPTS.map((o) => <GOptionCard key={o.id} o={o} mode={modeFor(o)} selected={!closed && !waitlist && !already && o.id === 'ocean'}/>)}
            </Box>
          </Box>

          {!closed && !already && <GSignupForm step={variant === 'review' ? 4 : 2} waitlist={waitlist}/>}
        </Stack>

        <Stack component="aside" spacing={2}>
          <Card variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>Sign up by</Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>{GRP.deadline}</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}><MuiIcon name="users" size={16}/></Box>
              <Typography variant="body2">{spots}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">From $1,240 per person. Nothing is charged when you sign up.</Typography>
            {!closed && !already && <Button fullWidth variant={waitlist ? 'outlined' : 'contained'} color={waitlist ? 'secondary' : 'brand'}>{waitlist ? 'Join the waitlist' : 'Sign up'}</Button>}
          </Card>
          <GAgentCard/>
        </Stack>
      </Box>
      <Box component="footer" sx={{ px: 5, py: 1.75, display: 'flex', justifyContent: 'space-between', bgcolor: 'surface.1', borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">© 2026 Story-Tail Adventures · Hosted by Inteletravel</Typography>
        <Stack direction="row" spacing={2}>
          {['Privacy', 'Terms', 'Accessibility'].map((t) => <Link key={t} href="#" variant="caption" color="text.secondary">{t}</Link>)}
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

const C285_PublicOpen = () => <GPublicPage variant="open"/>;
const C285_PublicReview = () => <GPublicPage variant="review"/>;
const C285_PublicOptionFull = () => <GPublicPage variant="optionFull"/>;
const C285_PublicGroupFull = () => <GPublicPage variant="groupFull"/>;
const C285_PublicClosed = () => <GPublicPage variant="closed"/>;
const C285_PublicAlready = () => <GPublicPage variant="already"/>;

function C285_PublicSent() {
  const { Box, Card, Stack, Typography } = MUI;
  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0}>
      <Box className="tropical-soft" sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 5 }}>
        <Card elevation={3} sx={{ maxWidth: 560, p: 4.5, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
          <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'primary.container', color: 'primary.onContainer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><MuiIcon name="check" size={28}/></Box>
          <Box>
            <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>Sign-up sent</Typography>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 0.75, mb: 1 }}>Thank you, Rachel.</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ textWrap: 'pretty' }}>You asked for an Ocean view cabin for 2 on the {GRP.name}. Nothing has been charged.</Typography>
          </Box>
          <Stack spacing={1.25} sx={{ width: '100%' }}>
            {[
              { i: 'mail', t: 'Check your email', s: 'We sent a link to rachel.t@example.com to set up your account.' },
              { i: 'user', t: 'Gyasi will confirm your spot', s: "He'll email you once it's confirmed." },
              { i: 'card', t: 'Then the deposit', s: 'Once your spot is confirmed, you can authorize a card for the $500 deposit.' },
            ].map((s) => (
              <Stack key={s.t} direction="row" spacing={1.5} sx={{ px: 1.75, py: 1.5, borderRadius: 3, bgcolor: 'surface.2' }}>
                <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><MuiIcon name={s.i} size={18}/></Box>
                <Box><Typography variant="subtitle2">{s.t}</Typography><Typography variant="body2" color="text.secondary">{s.s}</Typography></Box>
              </Stack>
            ))}
          </Stack>
          <Typography variant="body2">We'll take it from here.</Typography>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// ── 2.8.6 Waitlist offer ─────────────────────────────────────────────
// state: open | accepted | expired | declined
function C286_WaitlistOffer({ state = 'open' }) {
  const { Box, Card, Stack, Typography, Button } = MUI;
  const head = {
    open: { label: 'A spot opened up', title: 'A spot opened up for you.', body: `Good news. A Balcony cabin on the ${GRP.name} is yours if you'd like it.` },
    accepted: { label: "You're in", title: "You're on the trip.", body: 'Gyasi will confirm the details and send your deposit request. Nothing has been charged.' },
    expired: { label: 'Offer ended', title: 'This offer has ended.', body: "The 72 hours passed, so the spot went to the next person in line. You're still on the waitlist, and we'll reach out if another spot opens." },
    declined: { label: 'Off the list', title: "We've taken you off the list.", body: "Thanks for letting us know. If you change your mind, message Gyasi and he'll see what he can do." },
  }[state];
  const faded = state === 'expired' || state === 'declined';
  return (
    <MuiScreenFrame role="client" tab="home" padding={0} scrollable>
      <Box sx={{ maxWidth: 760, mx: 'auto', px: 4, py: 5 }}>
        <Card variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', height: 160 }}>
            <Box component="img" src={staImg('cruiseShip', 1400, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: faded ? 'grayscale(0.6)' : 'none' }}/>
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.75))' }}/>
            <Box sx={{ position: 'absolute', left: 24, bottom: 16, color: 'common.white' }}>
              <Typography variant="h6" sx={{ color: 'inherit' }}>{GRP.name}</Typography>
              <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9 }}>{GRP.dates}</Typography>
            </Box>
          </Box>
          <Stack spacing={2} sx={{ p: 3.5 }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>{head.label}</Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 700, my: 0.75 }}>{head.title}</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ textWrap: 'pretty' }}>{head.body}</Typography>
            </Box>
            <GSummary rows={[
              ['Option', <><b>Balcony</b> · up to 2 people</>],
              ['Travelers', 'Pat Doyle, Gene Doyle'],
              ['Price', '$1,840 per person · $3,680 total'],
              ['Deposit', '$300 per person, after Gyasi confirms'],
            ]}/>
            {state === 'open' && (
              <>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}><MuiIcon name="clock" size={18}/></Box>
                  <Typography variant="body2">This offer is held for you until <b>Thursday, January 14 at 3:00 PM ET</b>. That's about 2 days from now.</Typography>
                </Stack>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Button variant="contained" color="brand" size="large">Yes, I'll take it</Button>
                  <Button variant="text">No thanks, take me off the list</Button>
                </Stack>
                <Typography variant="body2" color="text.secondary">Saying yes doesn't charge anything. Gyasi will confirm and then ask for the deposit.</Typography>
              </>
            )}
            {state === 'accepted' && <Stack direction="row" spacing={1.25}><Button variant="contained">Go to your trip</Button><Button variant="text">Message Gyasi</Button></Stack>}
            {state === 'expired' && (
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <GMuiStatus s="waitlisted"/>
                <Typography variant="body2" color="text.secondary">Still on the list for Balcony.</Typography>
                <Button variant="text" sx={{ ml: 'auto !important' }}>Message Gyasi</Button>
              </Stack>
            )}
            {state === 'declined' && <Stack direction="row"><Button variant="outlined">Message Gyasi</Button></Stack>}
          </Stack>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}
const C286_OfferOpen = () => <C286_WaitlistOffer state="open"/>;
const C286_OfferAccepted = () => <C286_WaitlistOffer state="accepted"/>;
const C286_OfferExpired = () => <C286_WaitlistOffer state="expired"/>;
const C286_OfferDeclined = () => <C286_WaitlistOffer state="declined"/>;

// ── 2.8.9 Member group card ──────────────────────────────────────────
// state: member | waitlisted | offer
function GMuiMemberCard({ state = 'member' }) {
  const { Card, Stack, Box, Avatar, Typography, Button, Link, LinearProgress } = MUI;
  const l = GRP_LEADERS[0];
  return (
    <Card variant="outlined" sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.3 }}>Your group</Typography>
        {state === 'waitlisted' && <GMuiStatus s="waitlisted"/>}
        {state === 'offer' && <GMuiStatus s="offer"/>}
      </Stack>
      <Typography variant="h6">{GRP.name}</Typography>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Avatar src={staImg(l.img, 96, 96)} alt="" sx={{ width: 36, height: 36 }}/>
        <Box><Typography variant="body2" color="text.secondary">Group leader</Typography><Typography variant="subtitle2">{l.name}</Typography></Box>
      </Stack>
      <Box>
        <Typography variant="body2" sx={{ mb: 0.75 }}>32 of 40 spots filled</Typography>
        <LinearProgress variant="determinate" value={80} sx={{ height: 6, borderRadius: 999 }}/>
      </Box>
      {state === 'waitlisted' && <Typography variant="body2" sx={{ p: 1.5, borderRadius: 3, bgcolor: 'surface.2' }}>You're #2 in line for a Balcony cabin. If a spot opens, we'll email you and hold it for 72 hours.</Typography>}
      {state === 'offer' && (
        <Stack spacing={1} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
          <Typography variant="subtitle2" sx={{ color: 'inherit' }}>A spot opened up for you.</Typography>
          <Typography variant="body2" sx={{ color: 'inherit' }}>Held for you until Thursday, January 14 at 3:00 PM ET.</Typography>
          <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start' }}>See the offer</Button>
        </Stack>
      )}
      <Stack spacing={1}>
        <Link href="#" variant="body2" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}><MuiIcon name="link" size={14}/> View the group page</Link>
        <Link href="#" variant="body2" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}><MuiIcon name="message" size={14}/> Need to change or cancel? Message Gyasi</Link>
      </Stack>
    </Card>
  );
}

function C289_MemberTripWithCard() {
  const { Box, Stack, Card, Paper, Typography, Chip } = MUI;
  return (
    <MuiScreenFrame role="client" tab="home" padding={0} scrollable>
      <Box sx={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <Box component="img" src={staImg('cruiseShip', 1600, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.82))' }}/>
        <Box sx={{ position: 'absolute', left: 28, bottom: 18, color: 'common.white' }}>
          <GMuiStatus s="deposit"/>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mt: 1, mb: 0.25, color: 'common.white' }}>Western Caribbean Cruise</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.92, color: 'inherit' }}>{GRP.dates} · Ocean view · 2 travelers</Typography>
        </Box>
      </Box>
      <Box sx={{ px: 3.5, py: 2.5, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 2.25 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.75}>
            {['Overview', 'Itinerary', 'Documents', 'Payments'].map((t, i) => <Chip key={t} label={t} {...(i === 0 ? { color: 'secondary' } : { variant: 'outlined' })}/>)}
          </Stack>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Your itinerary</Typography>
            <Stack spacing={0.75} sx={{ mt: 1.25 }}>
              {GRP_ITIN.slice(0, 5).map((d, i) => (
                <Paper key={d.d} elevation={0} sx={{ px: 1.5, py: 1, bgcolor: 'surface.2', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Chip size="small" variant="outlined" label={`Day ${i + 1}`} sx={{ fontFamily: (t) => t.typography.mono, fontSize: 11, height: 20 }}/>
                  <Typography variant="body2" sx={{ flex: 1 }}>{d.t}</Typography>
                  {i === 2 && <Chip size="small" label="With your group" sx={{ height: 22, fontSize: 11 }}/>}
                </Paper>
              ))}
            </Stack>
          </Card>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Payments</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Deposit of $500 received Oct 4. Final balance of $2,460 due January 13, 2027.</Typography>
          </Card>
        </Stack>
        <Box component="aside"><GMuiMemberCard state="member"/></Box>
      </Box>
    </MuiScreenFrame>
  );
}

function C289_CardStates() {
  const { Box, Stack, Typography } = MUI;
  return (
    <Box sx={{ height: '100%', bgcolor: 'background.default', p: 4, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 2.5, alignItems: 'start' }}>
      {[['member', 'Signed up'], ['waitlisted', 'Waitlisted'], ['offer', 'Open offer']].map(([s, l]) => (
        <Stack key={s} spacing={1.25}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>{l}</Typography>
          <GMuiMemberCard state={s}/>
        </Stack>
      ))}
    </Box>
  );
}

Object.assign(window, {
  GOptionCard, GSignupForm, GLeaderNote, GAgentCard, GBanner, GSummary, GMuiMemberCard, GMuiGyasiAvatar,
  C285_PublicOpen, C285_PublicReview, C285_PublicOptionFull, C285_PublicGroupFull, C285_PublicClosed, C285_PublicAlready, C285_PublicSent,
  C286_OfferOpen, C286_OfferAccepted, C286_OfferExpired, C286_OfferDeclined,
  C289_MemberTripWithCard, C289_CardStates,
});
