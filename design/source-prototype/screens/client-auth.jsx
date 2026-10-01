/* global React, MUI, Icon, MuiIcon, StoryTailMark, staImg, MuiScreenFrame, MuiScreenHeader */
// Client · 2.1 Authentication & Onboarding — 14 screens. MUI v9.

// Shared shell for compact form screens (the split-pane auth pattern).
function AuthCard({ overline, title, sub, children, footer }) {
  const { Box, Typography } = MUI;
  return (
    <MuiScreenFrame chrome="split">
      <Box>
        {overline && <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}>{overline}</Typography>}
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{title}</Typography>
        {sub && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{sub}</Typography>}
      </Box>
      {children}
      {footer && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 'auto' }}>{footer}</Typography>}
    </MuiScreenFrame>
  );
}

// 2.1.1 — Login
function C211_Login() {
  const { Box, Stack, Typography, Button, Divider, TextField, Link } = MUI;
  return (
    <AuthCard
      overline="WELCOME BACK"
      title="Sign in"
      sub={<>New traveler? <Link href="#" sx={{ fontWeight: 600 }}>Create your account</Link>.</>}
      footer={<>By signing in you agree to our <Link href="#">terms</Link> &amp; <Link href="#">privacy policy</Link>.</>}
    >
      <Button variant="outlined" size="large" fullWidth>Continue with Google</Button>
      <Button variant="outlined" size="large" fullWidth>Continue with Apple</Button>
      <Divider><Typography variant="caption" color="text.secondary">OR</Typography></Divider>
      <TextField label="Email" size="small" fullWidth defaultValue="jordan.hayes@example.com" />
      <Box>
        <TextField label="Password" type="password" size="small" fullWidth defaultValue="••••••••••" />
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 0.5 }}>
          <Link href="#" variant="caption">Forgot?</Link>
        </Stack>
      </Box>
      <Button variant="contained" size="large" fullWidth>Continue to my trips</Button>
    </AuthCard>
  );
}

// 2.1.2 — Registration
function C212_Registration() {
  const { Box, Grid, Typography, Button, Divider, TextField, Link, LinearProgress, Checkbox, FormControlLabel } = MUI;
  return (
    <AuthCard
      overline="JOIN STORY-TAIL"
      title="Create your account"
      sub="Takes about 60 seconds. No planning fees, ever."
      footer={<>Already a member? <Link href="#">Sign in</Link></>}
    >
      <Button variant="outlined" size="large" fullWidth>Sign up with Google</Button>
      <Button variant="outlined" size="large" fullWidth>Sign up with Apple</Button>
      <Divider><Typography variant="caption" color="text.secondary">OR EMAIL</Typography></Divider>
      <Grid container spacing={1.25}>
        <Grid size={6}><TextField label="First name" size="small" fullWidth defaultValue="Jordan" /></Grid>
        <Grid size={6}><TextField label="Last name" size="small" fullWidth defaultValue="Hayes" /></Grid>
      </Grid>
      <TextField label="Email" size="small" fullWidth defaultValue="jordan.hayes@example.com" />
      <Box>
        <TextField label="Password" type="password" size="small" fullWidth defaultValue="••••••••••••" />
        <LinearProgress variant="determinate" value={85} color="success" sx={{ mt: 0.75 }} />
        <Typography variant="caption" sx={{ display: 'block', color: 'success.main', mt: 0.5 }}>Strong · 12+ characters · uppercase · number</Typography>
      </Box>
      <FormControlLabel
        control={<Checkbox defaultChecked size="small" />}
        label={<Typography variant="body2" color="text.secondary">I agree to the <Link href="#">Terms</Link> &amp; <Link href="#">Privacy policy</Link></Typography>}
      />
      <Button variant="contained" size="large" fullWidth>Create account</Button>
    </AuthCard>
  );
}

// 2.1.3 — Email Verification
function C213_EmailVerification() {
  const { Stack, Typography, Button, Avatar, Card, CardContent, Link } = MUI;
  return (
    <AuthCard overline="ONE MORE STEP" title="Check your email" sub="We sent a verification link to jordan.hayes@example.com." footer={<>Need to update? <Link href="#">Change email</Link> · <Link href="#">Resend</Link></>}>
      <Stack direction="row" sx={{ justifyContent: 'center', py: 1.75 }}>
        <Avatar sx={{ width: 84, height: 84, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
          <Icon name="mail" size={36} />
        </Avatar>
      </Stack>
      <Card variant="outlined" sx={{ bgcolor: 'surface.2' }}>
        <CardContent>
          <Typography variant="subtitle1">Why verify?</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>It links any trips Gyasi has already started planning for you, so you'll see them as soon as you sign in.</Typography>
        </CardContent>
      </Card>
      <Button variant="contained" size="large" fullWidth>Resend verification email</Button>
      <Button variant="text" size="small" sx={{ alignSelf: 'center' }}>Sign out</Button>
    </AuthCard>
  );
}

// 2.1.4 — Forgot Password
function C214_ForgotPassword() {
  const { Typography, Button, TextField, Link } = MUI;
  return (
    <AuthCard overline="PASSWORD HELP" title="Forgot your password?" sub="Tell us your email and we'll send a reset link." footer={<><Link href="#">← Back to sign in</Link></>}>
      <TextField label="Email" size="small" fullWidth defaultValue="jordan.hayes@example.com" />
      <Button variant="contained" size="large" fullWidth>Send reset link</Button>
      <Typography variant="caption" color="text.secondary">You'll receive an email within a minute. Check your spam folder if you don't see it. Links expire after 30 minutes.</Typography>
    </AuthCard>
  );
}

// 2.1.5 — Reset Password
function C215_ResetPassword() {
  const { Box, Button, TextField, LinearProgress } = MUI;
  return (
    <AuthCard overline="RESET PASSWORD" title="Set a new password" sub="Use at least 12 characters with a number.">
      <Box>
        <TextField label="New password" type="password" size="small" fullWidth defaultValue="••••••••••••" />
        <LinearProgress variant="determinate" value={85} color="success" sx={{ mt: 0.75 }} />
      </Box>
      <TextField label="Confirm new password" type="password" size="small" fullWidth defaultValue="••••••••••••" />
      <Button variant="contained" size="large" fullWidth>Update password</Button>
    </AuthCard>
  );
}

// 2.1.6 — MFA Setup
function C216_MFASetup() {
  const { Box, Grid, Paper, Typography, Button, TextField } = MUI;
  return (
    <AuthCard overline="EXTRA SECURITY" title="Set up two-factor auth" sub="Recommended if you'll be storing payment cards.">
      <Grid container spacing={1}>
        {[
          { i: 'sparkle', t: 'Authenticator app', s: 'Recommended', on: true },
          { i: 'phone', t: 'SMS code', s: 'Backup method' },
        ].map((m) => (
          <Grid key={m.t} size={6}>
            <Paper variant="outlined" sx={{
              p: 1.5, height: '100%',
              bgcolor: m.on ? 'primary.container' : 'background.paper',
              color: m.on ? 'primary.onContainer' : 'text.primary',
              borderColor: m.on ? 'primary.main' : 'divider',
            }}>
              <Icon name={m.i} size={18} />
              <Typography variant="subtitle1" sx={{ mt: 0.75, color: 'inherit' }}>{m.t}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: m.on ? 'inherit' : 'text.secondary', opacity: 0.8 }}>{m.s}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper elevation={0} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.5, bgcolor: 'surface.2' }}>
        <Box sx={{ width: 96, height: 96, bgcolor: 'common.white', color: 'common.black', borderRadius: 1, p: 0.75, flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ shapeRendering: 'crispEdges' }}>
            {Array.from({ length: 144 }).map((_, i) => {
              const x = i % 12, y = Math.floor(i / 12);
              const on = (x * 7 + y * 13) % 5 < 2;
              return <rect key={i} x={x*2} y={y*2} width="2" height="2" fill={on ? 'currentColor' : 'transparent'}/>;
            })}
          </svg>
        </Box>
        <Typography variant="caption" color="text.secondary">Scan with Authy, 1Password, or Google Authenticator. Or paste the secret key into your authenticator app.</Typography>
      </Paper>
      <TextField
        label="Enter 6-digit code" size="small" fullWidth defaultValue="• • •  • • •"
        slotProps={{ input: { sx: { fontFamily: (t) => t.typography.mono, letterSpacing: 8, '& input': { textAlign: 'center' } } } }}
      />
      <Button variant="contained" size="large" fullWidth>Verify &amp; turn on MFA</Button>
    </AuthCard>
  );
}

// 2.1.7 — MFA Challenge
function C217_MFAChallenge() {
  const { Stack, Paper, Button, Link } = MUI;
  return (
    <AuthCard overline="TWO-FACTOR" title="Enter your code" sub="From your authenticator app · expires in 30s">
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 0.5, mb: 1.25 }}>
        {['8','3','1','9','2','4'].map((d, i) => (
          <Paper key={i} variant="outlined" sx={{
            width: 44, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderColor: i === 5 ? 'primary.main' : 'outline.main',
            fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 22, lineHeight: 1,
          }}>{d}</Paper>
        ))}
      </Stack>
      <Button variant="contained" size="large" fullWidth>Verify</Button>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
        <Link href="#" variant="caption">Use a backup code</Link>
        <Link href="#" variant="caption">Resend SMS</Link>
      </Stack>
    </AuthCard>
  );
}

// 2.1.8 — Social Login / Account Linking
function C218_LinkAccount() {
  const { Box, Typography, Button, TextField, Avatar, Card, CardContent } = MUI;
  return (
    <AuthCard overline="ACCOUNT FOUND" title="An account with this email exists" sub="Sign in to your existing account to link Google sign-in, or use a different email.">
      <Card variant="outlined" sx={{ bgcolor: 'surface.2' }}>
        <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
          <Avatar src={staImg('avatarC', 80, 80)} alt="" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1">Jordan Hayes</Typography>
            <Typography variant="caption" color="text.secondary">jordan.hayes@example.com · created Mar 2024</Typography>
          </Box>
        </CardContent>
      </Card>
      <TextField label="Password for the existing account" type="password" size="small" fullWidth defaultValue="••••••••••••" />
      <Button variant="contained" size="large" fullWidth>Sign in &amp; link Google</Button>
      <Button variant="text" sx={{ alignSelf: 'center' }}>Use a different email</Button>
    </AuthCard>
  );
}

// 2.1.9 — Welcome / First Login
function C219_Welcome() {
  const { Box, Stack, Grid, Typography, Button, Avatar, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ position: 'relative', height: 200, overflow: 'hidden' }}>
          <Box component="img" src={staImg('overwater', 1600, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(122,26,31,0.4), rgba(13,33,55,0.8))' }} />
          <Box sx={{ position: 'absolute', inset: 0, px: 6, py: 4, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3, fontWeight: 600, color: (t) => t.palette.brandSource.gold }}>WELCOME · REST WELL</Typography>
            <Typography variant="h3" component="h1" sx={{ my: 0.5, color: 'common.white' }}>So glad you're here, Jordan.</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.92)', fontStyle: 'italic' }}>Here's to a year of trips worth telling — and rest worth taking. — Gyasi</Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, px: 6, py: 3, overflow: 'auto', bgcolor: 'background.default' }}>
          <Typography variant="h5" sx={{ mb: 1.5 }}>Here's what your portal will do for you:</Typography>
          <Grid container spacing={1.5}>
            {[
              { i: 'plane', t: 'Your trips, always here', s: 'Real-time itinerary updates, downloadable PDFs, offline mobile access at the resort.' },
              { i: 'card', t: 'Securely authorize cards', s: 'Stripe-tokenized. We pay suppliers — never charge you a fee.' },
              { i: 'message', t: 'Talk to me anytime', s: 'In-app messages threaded by trip. Push notifications when something changes.' },
              { i: 'search', t: 'Explore on your time', s: 'Browse trip ideas at your own pace and turn any favorite into a real proposal.' },
              { i: 'passport', t: 'Documents in one place', s: 'Passport scans, visa confirmations, insurance certificates — secure and shareable.' },
            ].map((c) => (
              <Grid key={c.t} size={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
                      <Icon name={c.i} size={18} />
                    </Avatar>
                    <Typography variant="subtitle1" sx={{ mt: 1 }}>{c.t}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{c.s}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.5, justifyContent: 'flex-end' }}>
            <Button variant="text">Skip the tour</Button>
            <Button variant="contained" size="large" endIcon={<MuiIcon name="arrow_right" size={14} />}>Get started</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// Onboarding wizard shell (used by 2.1.10–2.1.14)
function OnboardingShell({ step, total, title, sub, children, primary = 'Save & continue', secondary = 'Skip for now' }) {
  const { Box, Stack, Typography, Button, Stepper, Step, StepLabel } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr', bgcolor: 'background.default' }}>
        <Box component="aside" sx={{ px: 3, py: 4, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>
          <Box className="brand-mark" sx={{ mb: 3.5 }}>
            <StoryTailMark size={28} />
            <Box component="span" className="mark-script" sx={{ fontSize: 22 }}>Story-Tail</Box>
          </Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1.75 }}>WELCOME ABOARD</Typography>
          <Stepper orientation="vertical" activeStep={step}>
            {['Welcome', 'Profile basics', 'Travel preferences', 'Travel companions', 'Link existing trips', 'All set!'].map((s) => (
              <Step key={s}><StepLabel>{s}</StepLabel></Step>
            ))}
          </Stepper>
        </Box>
        <Box component="main" sx={{ px: 6, py: 4.5, overflow: 'auto' }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>STEP {String(step+1).padStart(2,'0')} OF {String(total).padStart(2,'0')}</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, my: 0.5 }}>{title}</Typography>
          {sub && <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>{sub}</Typography>}
          {children}
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.75 }}>
            <Button variant="text">{secondary}</Button>
            <Button variant="contained" size="large" sx={{ ml: 'auto' }} endIcon={<MuiIcon name="arrow_right" size={14} />}>{primary}</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.1.10 — Profile Completion
function C2110_ProfileCompletion() {
  const { Grid, Typography, TextField } = MUI;
  return (
    <OnboardingShell step={1} total={6} title="A few quick details" sub="So I can plan with all the right info on hand. You can edit any of this later.">
      <Grid container spacing={1.5}>
        <Grid size={6}><TextField label="Phone" size="small" fullWidth defaultValue="+1 (305) 555-0184" /></Grid>
        <Grid size={6}><TextField label="Date of birth" size="small" fullWidth defaultValue="04 / 22 / 1992" /></Grid>
        <Grid size={12}><TextField label="Mailing address" size="small" fullWidth defaultValue="1240 Brickell Bay Dr, Miami, FL 33131" /></Grid>
        <Grid size={6}><TextField label="Emergency contact · name" size="small" fullWidth defaultValue="Sam Hayes (spouse)" /></Grid>
        <Grid size={6}><TextField label="Emergency contact · phone" size="small" fullWidth defaultValue="+1 (305) 555-0186" /></Grid>
        <Grid size={12}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Passport (optional but encouraged for international travel)</Typography>
          <Grid container spacing={1.25}>
            <Grid size={6}><TextField size="small" fullWidth defaultValue="Number · A123456789" /></Grid>
            <Grid size={3}><TextField size="small" fullWidth defaultValue="Expires · 08/2029" /></Grid>
            <Grid size={3}><TextField size="small" fullWidth defaultValue="USA" /></Grid>
          </Grid>
        </Grid>
      </Grid>
    </OnboardingShell>
  );
}

// 2.1.11 — Travel Preferences Capture
function C2111_PreferencesCapture() {
  const { Box, Stack, Typography, TextField, Chip, Slider } = MUI;
  const noop = () => {};
  const tags = (group) => ({
    destinations: ['Caribbean ✓', 'Bahamas ✓', 'Greece', 'Mexico', 'Costa Rica', 'Italy', 'Iceland', 'Japan'],
    style: ['Resort ✓', 'Cruise ✓', 'Adventure', 'Family', 'Honeymoon ✓', 'Group'],
    diet: ['No restrictions', 'Vegetarian', 'Pescatarian ✓', 'Gluten-free', 'Halal'],
    access: ['None', 'Mobility-friendly', 'Quiet rooms', 'Service animal'],
  })[group];
  return (
    <OnboardingShell step={2} total={6} title="How do you travel?" sub="Tag what's true. The more, the better. Anything missing? Tell Gyasi later.">
      {['destinations','style','diet','access'].map((g) => (
        <Box key={g} sx={{ mb: 1.75 }}>
          <Typography variant="subtitle1" sx={{ mb: 0.75, textTransform: 'capitalize' }}>{g === 'access' ? 'Accessibility needs' : g}</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {tags(g).map((t) => (
              t.includes('✓')
                ? <Chip key={t} label={t} color="secondary" onClick={noop} />
                : <Chip key={t} label={t} variant="outlined" onClick={noop} />
            ))}
          </Stack>
        </Box>
      ))}
      <TextField label="Loyalty programs · frequent flyer numbers" size="small" fullWidth defaultValue="AAdvantage 4ZE82Q · IHG Rewards 92214" />
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Budget comfort range</Typography>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Typography variant="caption">$1k</Typography>
          <Slider defaultValue={[2500, 7500]} min={1000} max={10000} step={100} disableSwap sx={{ flex: 1 }} />
          <Typography variant="caption">$10k+</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>$2,500 — $7,500 per person</Typography>
      </Box>
    </OnboardingShell>
  );
}

// 2.1.12 — Travel Companions / Household
function C2112_Companions() {
  const { Box, Stack, Typography, Button, IconButton, Avatar, Card, CardContent } = MUI;
  return (
    <OnboardingShell step={3} total={6} title="Who often travels with you?" sub="So we can pre-fill traveler info next time. You can add or skip — totally up to you.">
      <Stack spacing={1} sx={{ alignItems: 'stretch' }}>
        {[
          { n: 'Sam Hayes', r: 'Spouse', d: '11/03/1990', p: 'B987654321 · 02/2031' },
          { n: 'Ava Hayes', r: 'Child', d: '06/12/2019', p: '—' },
        ].map((c) => (
          <Card key={c.n}>
            <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
              <Avatar sx={{ width: 44, height: 44, fontSize: 15, bgcolor: 'tertiary.container', color: 'tertiary.onContainer' }}>{c.n[0]}</Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">{c.n}</Typography>
                <Typography variant="caption" color="text.secondary">{c.r} · DOB {c.d} · Passport {c.p}</Typography>
              </Box>
              <IconButton size="small"><MuiIcon name="edit" size={16} /></IconButton>
              <IconButton size="small"><MuiIcon name="trash" size={16} /></IconButton>
            </CardContent>
          </Card>
        ))}
        <Button variant="outlined" color="secondary" startIcon={<MuiIcon name="plus" size={14} />} sx={{ alignSelf: 'flex-start', mt: 0.5 }}>Add a traveler</Button>
      </Stack>
    </OnboardingShell>
  );
}

// 2.1.13 — Connect with Agent / Invite Code
function C2113_ConnectAgent() {
  const { Stack, Paper, Typography, TextField, Link, Box } = MUI;
  return (
    <OnboardingShell step={4} total={6} title="Has Gyasi already started planning a trip for you?" sub="If you have an invitation code from her, paste it here to link existing trips to your account. Otherwise, skip — we'll find them automatically by email.">
      <Stack spacing={1.75}>
        <Paper elevation={0} sx={{ p: 2, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Icon name="sparkle" size={20} />
          <Typography variant="body2" sx={{ color: 'inherit' }}>We found <b>1 trip</b> already linked to <b>jordan.hayes@example.com</b>: <b>Sandals Royal Bahamian · Aug 12, 2026</b>. We'll connect it automatically.</Typography>
        </Paper>
        <TextField
          label="Or paste an invite code (optional)" size="small" fullWidth placeholder="e.g. STA-7HX2J9"
          slotProps={{ input: { sx: { fontFamily: (t) => t.typography.mono } } }}
        />
        <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'surface.2', display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ color: 'primary.main', display: 'inline-flex' }}><Icon name="message" size={16} /></Box>
          <Typography variant="caption" color="text.secondary">Don't have a code or trip yet? <Link href="#">Message Gyasi</Link> and she'll get you started.</Typography>
        </Paper>
      </Stack>
    </OnboardingShell>
  );
}

// 2.1.14 — Onboarding Complete
function C2114_OnboardingComplete() {
  const { Box, Stack, Grid, Paper, Typography, Button, Avatar } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Box sx={{ maxWidth: 640, width: '100%' }}>
          <Avatar sx={{ width: 96, height: 96, bgcolor: 'success.container', color: 'success.main', mb: 2, boxShadow: 2 }}>
            <Icon name="check" size={48} stroke={2.5} />
          </Avatar>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>YOU'RE ALL SET</Typography>
          <Typography variant="h3" component="h1" sx={{ mt: 0.5, mb: 0.75 }}>Welcome to the portal, Jordan.</Typography>
          <Typography variant="body1" color="text.secondary">Your profile, preferences, household, and existing trip with Sandals are all linked up.</Typography>

          <Grid container spacing={1.25} sx={{ mt: 2.5 }}>
            {[
              { i: 'plane', t: 'View your upcoming trip', s: 'Sandals · Aug 12' },
              { i: 'search', t: 'Explore the search', s: '148 Caribbean trips' },
              { i: 'message', t: 'Message Gyasi', s: 'Reply usually < 2h' },
            ].map((a, i) => (
              <Grid key={a.t} size={4}>
                <Paper variant={i === 0 ? 'elevation' : 'outlined'} elevation={0} sx={{
                  p: 1.75, height: '100%',
                  bgcolor: i === 0 ? 'primary.container' : 'background.paper',
                  color: i === 0 ? 'primary.onContainer' : 'text.primary',
                }}>
                  <Icon name={a.i} size={18} />
                  <Typography variant="subtitle1" sx={{ mt: 1, color: 'inherit' }}>{a.t}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: 'inherit', opacity: 0.8 }}>{a.s}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'space-between', mt: 3 }}>
            <Button variant="text">Fine-tune notifications →</Button>
            <Button variant="contained" size="large" endIcon={<MuiIcon name="arrow_right" size={14} />}>Continue to my dashboard</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, {
  C211_Login, C212_Registration, C213_EmailVerification, C214_ForgotPassword, C215_ResetPassword,
  C216_MFASetup, C217_MFAChallenge, C218_LinkAccount, C219_Welcome, C2110_ProfileCompletion,
  C2111_PreferencesCapture, C2112_Companions, C2113_ConnectAgent, C2114_OnboardingComplete,
});
