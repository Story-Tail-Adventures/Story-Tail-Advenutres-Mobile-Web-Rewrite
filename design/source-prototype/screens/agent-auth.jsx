/* global React, MUI, Icon, MuiIcon, StoryTailMark, staImg, MuiScreenFrame, MuiScreenHeader */
// Agent · 3.1 Authentication & Activation — 10 screens. MUI v9.

function AuthCardAgent({ overline, title, sub, children, footer }) {
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

// 3.1.1 Agent Login
function A311_Login() {
  const { Box, TextField, Button, Link, Alert } = MUI;
  return (
    <AuthCardAgent overline="ADVISOR · SIGN IN" title="Welcome back, Gyasi" sub="MFA is required for advisor accounts.">
      <TextField label="Email" size="small" fullWidth defaultValue="gyasi@story-tail.com"/>
      <Box>
        <TextField label="Password" type="password" size="small" fullWidth defaultValue="••••••••••••"/>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
          <Link href="#" variant="caption" underline="hover" sx={{ fontWeight: 600 }}>Forgot?</Link>
        </Box>
      </Box>
      <Alert severity="info" icon={<MuiIcon name="shield" size={16}/>}>MFA will be required after password.</Alert>
      <Button variant="contained" size="large" fullWidth>Continue</Button>
    </AuthCardAgent>
  );
}

// 3.1.2 Agent MFA Challenge
function A312_MFA() {
  const { Stack, Paper, Button, Link } = MUI;
  return (
    <AuthCardAgent overline="TWO-FACTOR" title="Enter your code" sub="From Authy · expires in 26s">
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        {['4','8','2','1','9','3'].map((d, i) => (
          <Paper key={i} variant="outlined" sx={{
            width: 44, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 22, lineHeight: 1,
            borderColor: i === 5 ? 'primary.main' : 'outline.main', borderWidth: i === 5 ? 2 : 1,
          }}>{d}</Paper>
        ))}
      </Stack>
      <Button variant="contained" size="large" fullWidth>Verify &amp; sign in</Button>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Link href="#" variant="caption" underline="hover">Use backup code</Link>
        <Link href="#" variant="caption" underline="hover">SMS instead</Link>
      </Stack>
    </AuthCardAgent>
  );
}

// 3.1.3 Agent Password Reset
function A313_PasswordReset() {
  const { TextField, Button, Typography } = MUI;
  return (
    <AuthCardAgent overline="ADVISOR RESET" title="Reset your password" sub="We'll email a reset link to your verified advisor address.">
      <TextField label="Email" size="small" fullWidth defaultValue="gyasi@story-tail.com"/>
      <Button variant="contained" size="large" fullWidth>Send reset link</Button>
      <Typography variant="caption" color="text.secondary">Expires in 30 min. Admin actions auto-locked until reset.</Typography>
    </AuthCardAgent>
  );
}

// 3.1.4 Agent Invitation / Activation Link
function A314_Invitation() {
  const { Paper, Typography, Button, Link } = MUI;
  return (
    <AuthCardAgent overline="STORY-TAIL TEAM · INVITATION" title="Aria — you're invited" sub="Gyasi has invited you to join Story-Tail Adventures as an advisor.">
      <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
        <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.3 }}>YOUR INVITATION</Typography>
        <Typography variant="h5" sx={{ my: 0.25 }}>Aria Patel · Advisor</Typography>
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>aria@story-tail.com · invited by Gyasi · expires May 21</Typography>
      </Paper>
      <Typography variant="caption" color="text.secondary">Activating creates your advisor account, sets up MFA, and lets you start managing clients within Story-Tail. <Link href="#" underline="hover">This isn't me</Link>.</Typography>
      <Button variant="contained" size="large" fullWidth>Begin activation</Button>
    </AuthCardAgent>
  );
}

// 3.1.5 Account Activation — Set Password
function A315_SetPassword() {
  const { Box, TextField, Button, LinearProgress, FormControlLabel, Checkbox, Typography, Link } = MUI;
  return (
    <AuthCardAgent overline="ACTIVATION · STEP 1 OF 4" title="Set your password" sub="Use at least 12 characters with a number and symbol.">
      <TextField label="Email (from invite)" size="small" fullWidth defaultValue="aria@story-tail.com" disabled/>
      <Box>
        <TextField label="New password" type="password" size="small" fullWidth defaultValue="••••••••••••"/>
        <LinearProgress variant="determinate" value={90} color="success" sx={{ mt: 0.75 }}/>
      </Box>
      <TextField label="Confirm password" type="password" size="small" fullWidth defaultValue="••••••••••••"/>
      <FormControlLabel
        control={<Checkbox defaultChecked size="small"/>}
        sx={{ alignItems: 'flex-start', mr: 0 }}
        label={<Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>I accept the Story-Tail <Link href="#" underline="hover">advisor policy</Link> and Inteletravel host terms.</Typography>}
      />
      <Button variant="contained" size="large" fullWidth endIcon={<MuiIcon name="arrow_right" size={14}/>}>Activate account</Button>
    </AuthCardAgent>
  );
}

// 3.1.6 Mandatory MFA Setup
function A316_MandatoryMFA() {
  const { Box, Stack, Grid, Paper, Typography, TextField, Button, Alert, AlertTitle, FormControlLabel, Checkbox } = MUI;
  return (
    <AuthCardAgent overline="ACTIVATION · STEP 2 OF 4" title="Set up MFA — required" sub="Advisors can't access client data without two-factor.">
      <Grid container spacing={1}>
        {[{ i: 'sparkle', t: 'Authenticator app', s: 'Strongly recommended', on: true }, { i: 'phone', t: 'SMS', s: 'Allowed · less secure' }].map((m) => (
          <Grid key={m.t} size={6}>
            <Paper variant="outlined" sx={{
              p: 1.5, height: '100%',
              borderColor: m.on ? 'primary.main' : 'divider',
              bgcolor: m.on ? 'primary.container' : 'background.paper',
              color: m.on ? 'primary.onContainer' : 'text.primary',
            }}>
              <Box sx={{ display: 'inline-flex' }}><Icon name={m.i} size={18}/></Box>
              <Typography variant="subtitle1" sx={{ mt: 0.75, lineHeight: 1.3 }}>{m.t}</Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>{m.s}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'surface.2' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 88, height: 88, bgcolor: 'common.white', borderRadius: 1, p: 0.75, flexShrink: 0 }}>
            <svg viewBox="0 0 12 12" width="100%" height="100%" style={{ shapeRendering: 'crispEdges' }}>
              {Array.from({ length: 144 }).map((_, i) => { const x = i % 12, y = (i/12)|0; return <rect key={i} x={x} y={y} width="1" height="1" fill={(x*7+y*13)%5<2 ? '#000' : 'transparent'}/>; })}
            </svg>
          </Box>
          <Typography variant="caption" color="text.secondary">Scan with Authy, 1Password, or Google Authenticator.</Typography>
        </Stack>
      </Paper>
      <TextField label="Enter 6-digit code" size="small" fullWidth defaultValue="• • •  • • •"
                 sx={{ '& input': { fontFamily: (t) => t.typography.mono, letterSpacing: 8, textAlign: 'center' } }}/>
      <Alert severity="warning" icon={false}>
        <AlertTitle>Backup codes</AlertTitle>
        10 single-use codes generated. <b>Save them before continuing</b> — you won't see them again.
        <Box sx={{ mt: 0.5 }}>
          <FormControlLabel control={<Checkbox defaultChecked size="small"/>} label={<Typography variant="body2">I've saved my backup codes</Typography>}/>
        </Box>
      </Alert>
      <Button variant="contained" size="large" fullWidth>Verify &amp; continue</Button>
    </AuthCardAgent>
  );
}

function ActivationWizard({ step, total = 5, title, sub, children, primary = 'Save & continue' }) {
  const { Box, Stack, Typography, Button, Stepper, Step, StepLabel } = MUI;
  const steps = ['Set password', 'Mandatory MFA', 'Profile', 'Availability', 'Email signature', 'Welcome tour'];
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'grid', gridTemplateColumns: '260px 1fr', bgcolor: 'background.default' }}>
        <Box component="aside" sx={{ px: 2.75, py: 3.5, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>
          <Box className="brand-mark" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, mb: 2.75 }}>
            <StoryTailMark size={26}/>
            <Box component="span" className="mark-script" sx={{ fontSize: 20 }}>Story-Tail</Box>
          </Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1.25 }}>ADVISOR ACTIVATION</Typography>
          <Stepper orientation="vertical" activeStep={step} sx={{ '& .MuiStepConnector-line': { minHeight: 10 } }}>
            {steps.map((s) => (
              <Step key={s}><StepLabel>{s}</StepLabel></Step>
            ))}
          </Stepper>
        </Box>
        <Box component="main" sx={{ px: 5, py: 4, overflow: 'auto' }}>
          <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>STEP {String(step+1).padStart(2,'0')} OF {String(total+1).padStart(2,'0')}</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, my: 0.5 }}>{title}</Typography>
          {sub && <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>{sub}</Typography>}
          {children}
          <Stack direction="row" spacing={1.25} sx={{ mt: 2.75 }}>
            <Button variant="text">Skip for now</Button>
            <Button variant="contained" size="large" endIcon={<MuiIcon name="arrow_right" size={14}/>} sx={{ ml: 'auto' }}>{primary}</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.1.7 Agent Profile Setup
function A317_ProfileSetup() {
  const { Box, Stack, Grid, Card, CardContent, Avatar, Typography, Button, TextField } = MUI;
  return (
    <ActivationWizard step={2} title="Set up your advisor profile" sub="This appears in client emails and the portal.">
      <Card sx={{ maxWidth: 720 }}>
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.75 }}>
            <Avatar sx={{ width: 84, height: 84, bgcolor: 'surface.3', color: 'text.secondary' }}>
              <Icon name="user" size={32}/>
            </Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Profile photo</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>JPG or PNG · square · 400×400+</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                <Button variant="outlined" color="secondary" size="small">Upload</Button>
                <Button variant="text" size="small">Use Gravatar</Button>
              </Stack>
            </Box>
          </Stack>
          <Grid container spacing={1.5}>
            <Grid size={6}><TextField label="Display name" size="small" fullWidth defaultValue="Aria Patel"/></Grid>
            <Grid size={6}><TextField label="Pronouns" size="small" fullWidth defaultValue="she/her"/></Grid>
            <Grid size={6}><TextField label="Phone (verify)" size="small" fullWidth defaultValue="+1 (305) 555-0199"/></Grid>
            <Grid size={6}><TextField label="Time zone" size="small" fullWidth defaultValue="America/New_York · auto-detected"/></Grid>
            <Grid size={12}><TextField label="Short bio · client-facing" size="small" fullWidth multiline minRows={2} defaultValue="Caribbean specialist with a soft spot for family-friendly all-inclusives. Hosted by Inteletravel."/></Grid>
            <Grid size={6}><TextField label="Instagram" size="small" fullWidth defaultValue="@ariapatel.travel"/></Grid>
            <Grid size={6}><TextField label="LinkedIn" size="small" fullWidth defaultValue="linkedin.com/in/ariapatel"/></Grid>
          </Grid>
        </CardContent>
      </Card>
    </ActivationWizard>
  );
}

// 3.1.8 Availability & Calendar Setup
function A318_Availability() {
  const { Box, Stack, Grid, Card, CardContent, Chip, Typography, TextField, Button } = MUI;
  const noop = () => {};
  const hours = ['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'];
  return (
    <ActivationWizard step={3} title="When are you available?" sub="Clients see realistic reply windows. You can override per day later.">
      <Card sx={{ maxWidth: 760 }}>
        <CardContent>
          <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }}>
            <Chip color="secondary" onClick={noop} label="9 AM – 6 PM weekdays"/>
            <Chip variant="outlined" label="Evenings & weekends"/>
            <Chip variant="outlined" label="Custom"/>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: '60px repeat(12,1fr)', gap: '2px' }}>
            <Box/>
            {hours.map((h) => <Typography key={h} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{h}</Typography>)}
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, di) => (
              <React.Fragment key={d}>
                <Typography variant="subtitle2" sx={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>{d}</Typography>
                {hours.map((h, hi) => {
                  const on = di < 5 && hi >= 1 && hi <= 9;
                  return <Box key={hi} sx={{ height: 22, borderRadius: 0.5, bgcolor: on ? 'primary.main' : 'surface.3' }}/>;
                })}
              </React.Fragment>
            ))}
          </Box>
          <Grid container spacing={1.5} sx={{ mt: 2 }}>
            <Grid size={6}><TextField label="Response-time expectation" size="small" fullWidth defaultValue="Within 2 hours during availability"/></Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Calendar sync</Typography>
              <Stack direction="row" spacing={0.75}>
                <Button variant="outlined" color="secondary" size="small">Connect Google</Button>
                <Button variant="outlined" size="small">Connect Apple</Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </ActivationWizard>
  );
}

// 3.1.9 Email Signature Setup
function A319_EmailSignature() {
  const { Box, Stack, Card, CardContent, Paper, Typography, TextField, Button, ButtonGroup, Chip, Divider } = MUI;
  return (
    <ActivationWizard step={4} title="Your email signature" sub="Appended to every outbound email. Story-Tail brand baked in.">
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, maxWidth: 1000 }}>
        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.75 }}>EDIT · MERGE TAGS SUPPORTED</Typography>
            <ButtonGroup variant="text" size="small" sx={{ mb: 1 }}>
              {['B','I','U','Link','Image'].map((b) => <Button key={b}>{b}</Button>)}
            </ButtonGroup>
            <TextField fullWidth multiline minRows={8} size="small"
                       sx={{ '& textarea': { fontFamily: (t) => t.typography.mono, fontSize: 12 } }}
                       defaultValue={`{{agent.name}}, Travel Advisor\nStory-Tail Adventures · Hosted by Inteletravel\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\n— Making travel an adventure —`}/>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {['{{agent.name}}','{{agent.phone}}','{{agent.email}}','{{trip.name}}','{{client.firstName}}'].map((t) => (
                <Chip key={t} size="small" variant="outlined" label={t} sx={{ fontFamily: (th) => th.typography.mono, fontSize: 10.5, height: 22 }}/>
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>LIVE PREVIEW</Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>From: Aria Patel &lt;aria@story-tail.com&gt;<br/>To: Maya Carter &lt;maya@example.com&gt;</Typography>
              <Divider sx={{ my: 1.25 }}/>
              <Typography variant="body2" sx={{ mb: 1.75 }}>Hey Maya! Your Sandals proposal is attached…</Typography>
              <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25 }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <StoryTailMark size={36}/>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontSize: 14, lineHeight: 1.1 }}>Aria Patel</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, fontWeight: 500, lineHeight: 1.2 }}>Travel Advisor · Story-Tail Adventures</Typography>
                  </Box>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>+1 (305) 555-0199 · aria@story-tail.com<br/>adventures.story-tail.com · Hosted by Inteletravel</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, mt: 0.75 }}>— Making travel an adventure —</Typography>
              </Box>
            </Paper>
          </CardContent>
        </Card>
      </Box>
    </ActivationWizard>
  );
}

// 3.1.10 Welcome Tour / First-Run
function A3110_WelcomeTour() {
  const { Box, Stack, Grid, Card, CardContent, Paper, Avatar, Typography, List, ListItem } = MUI;
  return (
    <ActivationWizard step={5} title="You're all set, Aria 🎉" sub="A 7-step tour gets you oriented. Skip anytime — it's always in Help." primary="Start the tour">
      <Grid container spacing={1.5} sx={{ maxWidth: 880 }}>
        {[
          { i: 'pulse', t: 'Worklist', s: 'What needs you today.' },
          { i: 'users', t: 'Clients', s: 'Roster, CRM, login support.' },
          { i: 'briefcase', t: 'Trips & builder', s: 'Build, send, manage.' },
          { i: 'inbox', t: 'Leads', s: 'Self-guided search → inquiries.' },
          { i: 'dollar', t: 'Commission', s: 'Inteletravel reconciliation.' },
          { i: 'message', t: 'Messaging & templates', s: 'Templates, signatures, inbox.' },
        ].map((c) => (
          <Grid key={c.t} size={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}><Icon name={c.i} size={18}/></Avatar>
                  <Box>
                    <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{c.t}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{c.s}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Paper elevation={0} sx={{ mt: 2, p: 2, bgcolor: 'primary.container', color: 'primary.onContainer', maxWidth: 880 }}>
        <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>First-day tasks</Typography>
        <List dense disablePadding sx={{ listStyle: 'disc', pl: 2.25, mt: 0.75 }}>
          <ListItem disablePadding sx={{ display: 'list-item', py: 0.25 }}><Typography variant="body2">Import your existing Travefy clients</Typography></ListItem>
          <ListItem disablePadding sx={{ display: 'list-item', py: 0.25 }}><Typography variant="body2">Set up your first trip template</Typography></ListItem>
          <ListItem disablePadding sx={{ display: 'list-item', py: 0.25 }}><Typography variant="body2">Send a welcome email to your first 3 clients</Typography></ListItem>
        </List>
      </Paper>
    </ActivationWizard>
  );
}

Object.assign(window, { A311_Login, A312_MFA, A313_PasswordReset, A314_Invitation, A315_SetPassword, A316_MandatoryMFA, A317_ProfileSetup, A318_Availability, A319_EmailSignature, A3110_WelcomeTour });
