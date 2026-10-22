/* global React, MUI, MuiIcon, staImg, MuiScreenFrame, MuiStaStatus, GRP, GRP_OPTIONS, GRP_PARTIES, GRP_WAITLIST, GRP_LEADERS, GRP_NOTE, GMuiStatus, leaderOpt, optName */
// Client · Group leader (proposed 2.8.7 roster · 2.8.8 edit welcome note). MUI v9.
// The roster is a working screen: no contact columns, no money columns, no hidden-option names.
// A party on a hidden option reads "Arranged by Gyasi" to leaders (ruling 8; leaderOpt lives
// in group-shared.jsx so the phone artboards can use it too).
//
// Ported to MUI from the design project's class-style file (13e01bd3…, synced 2026-10-14).
// One deliberate change: the flag example no longer carries a health detail about another
// traveler ("Her mom's surgery…"). A leader's note to Gyasi is about logistics, and the sample
// should not model a leader writing down someone else's medical news.

// Overlay dialog drawn in place, so it stays inside the artboard (MUI Dialog portals out).
function GMuiModal({ width = 520, children }) {
  const { Box, Paper } = MUI;
  return (
    <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(10,8,6,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      <Paper elevation={8} sx={{ width, p: 3, borderRadius: 6 }}>{children}</Paper>
    </Box>
  );
}

function GLeaderHeader({ departed }) {
  const { Box, Stack, Typography, Button, LinearProgress } = MUI;
  return (
    <Box sx={{ px: 3.5, pt: 2.75, pb: 2.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'surface.1' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>You're a group leader</Typography>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5, mb: 1, letterSpacing: '-0.3px' }}>{GRP.name}</Typography>
          <Stack direction="row" spacing={2.25} sx={{ alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}>
            <MuiStaStatus kind={departed ? 'traveling' : 'booked'}>{departed ? 'Departed' : 'Sign-ups open'}</MuiStaStatus>
            <Typography variant="body2" sx={{ display: 'flex', gap: 0.75, alignItems: 'center', color: 'inherit' }}><MuiIcon name="calendar" size={14}/> {GRP.dates}</Typography>
            {!departed && <Typography variant="body2" sx={{ display: 'flex', gap: 0.75, alignItems: 'center', color: 'inherit' }}><MuiIcon name="clock" size={14}/> Sign-ups close {GRP.deadline}</Typography>}
          </Stack>
        </Box>
        <Box sx={{ width: 220 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>32 of 40 spots filled</Typography>
          <LinearProgress variant="determinate" value={80} sx={{ height: 8, borderRadius: 999 }}/>
        </Box>
        {!departed && (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" startIcon={<MuiIcon name="edit" size={14}/>}>Welcome note</Button>
            <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={14}/>}>Add someone to the trip</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function GCounts() {
  const { Box, Card, Typography } = MUI;
  const c = [['Requested', 2, 'inquiry'], ['Confirmed', 3, 'proposal'], ['Deposit received', 5, 'booked'], ['Paid in full', 3, 'booked'], ['Invited', 1, 'lead']];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 1.25 }}>
      {c.map(([l, n, k]) => (
        <Card key={l} variant="outlined" sx={{ px: 1.75, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{n}</Typography>
          <MuiStaStatus kind={k}>{l}</MuiStaStatus>
        </Card>
      ))}
    </Box>
  );
}

function GPartyTable({ variant }) {
  const { Box, Card, Stack, Typography, Chip, Button } = MUI;
  const ro = variant === 'departed';
  const parties = GRP_PARTIES.map((p) => (p.id === 14 && variant === 'expired') ? { ...p, status: 'expired', hold: 'Spots released Oct 19' } : p);
  const cols = ro ? 'minmax(0,2.2fr) 70px minmax(0,1.1fr) 90px 150px' : 'minmax(0,2.2fr) 70px minmax(0,1.1fr) 90px 150px 130px';
  const head = ['Party', 'People', 'Option', 'Signed up', 'Status'];
  return (
    <Card variant="outlined">
      <Stack direction="row" spacing={1.25} sx={{ px: 2.25, py: 1.75, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>Who's coming · 14 parties</Typography>
        <Chip label="All" color="secondary" size="small"/>
        <Chip label="Requested" variant="outlined" size="small"/>
        <Chip label="Invited" variant="outlined" size="small"/>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px: 2.25, py: 1.25, bgcolor: 'surface.2' }}>
        {head.map((h) => <Typography key={h} variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>{h}</Typography>)}
        {!ro && <span/>}
      </Box>
      {parties.map((p) => {
        const opt = leaderOpt(p.opt);
        return (
          <Box key={p.id} sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px: 2.25, py: 1.375, alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2">{p.names}</Typography>
              {p.byLeader && <Typography variant="body2" color="text.secondary">Added by {p.byLeader} · {p.hold}</Typography>}
              {p.leader && <Typography variant="body2" color="text.secondary">Group leader</Typography>}
            </Box>
            <Typography variant="body2">{p.n}</Typography>
            <Typography variant="body2" color={opt === 'Arranged by Gyasi' ? 'text.secondary' : 'text.primary'}>{opt}</Typography>
            <Typography variant="body2" color="text.secondary">{p.date}</Typography>
            <Box><GMuiStatus s={p.status}/></Box>
            {!ro && (p.flag
              ? <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ color: 'brand.main', display: 'inline-flex' }}><MuiIcon name="flag" size={14}/></Box> Flagged</Typography>
              : <Button variant="text" size="small" startIcon={<MuiIcon name="flag" size={14}/>} sx={{ justifySelf: 'start' }}>Flag for Gyasi</Button>)}
          </Box>
        );
      })}
    </Card>
  );
}

function GLeaderSide({ variant }) {
  const { Box, Card, Stack, Typography, Switch } = MUI;
  const ro = variant === 'departed';
  return (
    <Stack component="aside" spacing={1.75}>
      <Card variant="outlined">
        <Box sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontSize: 18 }}>Waitlist · 2</Typography>
          <Typography variant="body2" color="text.secondary">Gyasi manages the order and the offers.</Typography>
        </Box>
        {GRP_WAITLIST.map((w) => (
          <Stack key={w.pos} direction="row" spacing={1.5} sx={{ px: 2, py: 1.5, alignItems: 'center', borderTop: w.pos > 1 ? 1 : 0, borderColor: 'divider' }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'surface.3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{w.pos}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2">{w.names}</Typography>
              <Typography variant="body2" color="text.secondary">{w.n} people · {optName(w.opt)}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">{ro ? 'Closed' : w.offer}</Typography>
          </Stack>
        ))}
      </Card>
      {!ro && (
        <Card variant="outlined" sx={{ p: 2, display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Daily email summary</Typography>
            <Typography variant="body2" color="text.secondary">One email a day with new sign-ups.</Typography>
          </Box>
          <Switch checked={false} inputProps={{ 'aria-label': 'Daily email summary' }}/>
        </Card>
      )}
      <Stack direction="row" spacing={1.5} sx={{ p: 2, borderRadius: 4, bgcolor: 'surface.2', color: 'text.secondary' }}>
        <MuiIcon name="lock" size={18}/>
        <Typography variant="body2" sx={{ color: 'inherit' }}>Contact details, documents, and payment amounts stay between each traveler and Gyasi.</Typography>
      </Stack>
    </Stack>
  );
}

// variant: open | expired | departed | add | flag
function GLeaderRoster({ variant = 'open' }) {
  const { Box, Stack, Typography, Button, TextField, IconButton, Radio, FormControlLabel, RadioGroup } = MUI;
  const departed = variant === 'departed';
  return (
    <MuiScreenFrame role="client" tab="home" padding={0} scrollable>
      <Box sx={{ position: 'relative', minHeight: '100%' }}>
        <GLeaderHeader departed={departed}/>
        <Stack spacing={1.75} sx={{ px: 3.5, pt: 2.25, pb: 3.5 }}>
          {departed && (
            <Stack direction="row" spacing={1.5} sx={{ px: 2.25, py: 1.75, borderRadius: 3.5, bgcolor: 'secondary.container', color: 'secondary.onContainer', alignItems: 'center' }}>
              <MuiIcon name="ship" size={20}/>
              <Typography variant="body2" sx={{ color: 'inherit' }}><b>The group has set sail.</b> This list is read-only now. It will close when the trip is archived.</Typography>
            </Stack>
          )}
          {variant === 'expired' && (
            <Stack direction="row" spacing={1.5} sx={{ px: 2.25, py: 1.75, borderRadius: 3.5, bgcolor: 'surface.3', alignItems: 'center' }}>
              <MuiIcon name="info" size={20}/>
              <Typography variant="body2" sx={{ flex: 1 }}>Leah & Ben Carter didn't finish signing up within 7 days, so their 2 spots were released. Gyasi can see this too.</Typography>
              <Button variant="outlined" size="small">Invite again</Button>
            </Stack>
          )}
          <GCounts/>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 1.75, alignItems: 'start' }}>
            <GPartyTable variant={variant}/>
            <GLeaderSide variant={variant}/>
          </Box>
        </Stack>
        {variant === 'add' && (
          <GMuiModal width={540}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Add someone to the trip</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>They'll get an email to finish signing up. We'll hold their spots for 7 days.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2.25 }}>
              <TextField size="small" label="Name" defaultValue="Leah Carter"/>
              <TextField size="small" label="Email" defaultValue="leah.carter@example.com"/>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>How many people?</Typography>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 0.5 }}>
                  <IconButton size="small" sx={{ border: 1, borderColor: 'outline.main' }} aria-label="Fewer"><Typography sx={{ fontWeight: 600, fontSize: 18, lineHeight: 1, width: 16 }}>−</Typography></IconButton>
                  <Typography variant="h6" sx={{ width: 24, textAlign: 'center' }}>2</Typography>
                  <IconButton size="small" sx={{ border: 1, borderColor: 'outline.main' }} aria-label="More"><MuiIcon name="plus" size={16}/></IconButton>
                </Stack>
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500, mt: 1.75 }}>Option</Typography>
            <RadioGroup value="ocean" sx={{ mt: 0.5, px: 1.5, py: 0.75, borderRadius: 3, bgcolor: 'surface.2' }}>
              {[['inside', 'Inside cabin', '$1,240 per person', false], ['ocean', 'Ocean view', '$1,480 per person', false], ['balcony', 'Balcony', 'Full', true]].map(([v, n, s, dis]) => (
                <Stack key={v} direction="row" sx={{ alignItems: 'center' }}>
                  <FormControlLabel value={v} disabled={dis} control={<Radio size="small"/>} label={n} sx={{ flex: 1, m: 0 }}/>
                  <Typography variant="body2" color="text.secondary" sx={{ opacity: dis ? 0.6 : 1 }}>{s}</Typography>
                </Stack>
              ))}
            </RadioGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>They'll add their own travel details after they sign in.</Typography>
            <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end', mt: 2.25 }}>
              <Button variant="text">Cancel</Button>
              <Button variant="contained" startIcon={<MuiIcon name="send" size={14}/>}>Send invite</Button>
            </Stack>
          </GMuiModal>
        )}
        {variant === 'flag' && (
          <GMuiModal width={480}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Flag for Gyasi</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>About <Box component="b" sx={{ color: 'text.primary' }}>Ana & Luis Ortega</Box>. Only Gyasi sees this note.</Typography>
            <TextField label="Note" multiline minRows={4} fullWidth sx={{ mt: 2 }} defaultValue="Ana says they can't make it in March after all. Could you reach out to her about next steps?"/>
            <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end', mt: 2.25 }}>
              <Button variant="text">Cancel</Button>
              <Button variant="contained" startIcon={<MuiIcon name="flag" size={14}/>}>Send to Gyasi</Button>
            </Stack>
          </GMuiModal>
        )}
      </Box>
    </MuiScreenFrame>
  );
}

const C287_RosterOpen = () => <GLeaderRoster variant="open"/>;
const C287_RosterAdd = () => <GLeaderRoster variant="add"/>;
const C287_RosterFlag = () => <GLeaderRoster variant="flag"/>;
const C287_RosterExpired = () => <GLeaderRoster variant="expired"/>;
const C287_RosterDeparted = () => <GLeaderRoster variant="departed"/>;

// ── 2.8.8 Edit welcome note ──────────────────────────────────────────
function C288_WelcomeNote() {
  const { Box, Card, Paper, Stack, Avatar, Typography, Button, TextField } = MUI;
  const l = GRP_LEADERS[0];
  return (
    <MuiScreenFrame role="client" tab="home" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ mb: 1 }}>Back to the group</Button>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>Your welcome note</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>This shows on the group's sign-up page, next to your photo.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 3, alignItems: 'start' }}>
        <Card variant="outlined" sx={{ p: 2.75, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Photo</Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 0.75 }}>
              <Avatar src={staImg(l.img, 160, 160)} alt="" sx={{ width: 80, height: 80 }}/>
              <Button variant="outlined" size="small" startIcon={<MuiIcon name="upload" size={14}/>}>Upload a new photo</Button>
            </Stack>
          </Box>
          <Box>
            <TextField label="Note" multiline minRows={7} fullWidth defaultValue={GRP_NOTE}/>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, textAlign: 'right' }}>238 of 600 characters</Typography>
          </Box>
          <Button variant="contained" sx={{ alignSelf: 'flex-start' }}>Save</Button>
        </Card>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>Preview · how it looks on the page</Typography>
          <Card variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ position: 'relative', height: 120 }}>
              <Box component="img" src={staImg('cruiseShip', 1000, 300)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 20%, rgba(13,33,55,0.8))' }}/>
              <Typography variant="h6" sx={{ position: 'absolute', left: 18, bottom: 12, color: 'common.white' }}>{GRP.name}</Typography>
            </Box>
            <Box sx={{ p: 2.25 }}>
              <Paper elevation={0} sx={{ p: 2.25, bgcolor: 'surface.2', display: 'flex', gap: 1.75 }}>
                <Avatar src={staImg(l.img, 120, 120)} alt="" sx={{ width: 56, height: 56 }}/>
                <Box>
                  <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>A welcome from your group leader</Typography>
                  <Typography variant="body2" sx={{ mt: 0.75, mb: 1, textWrap: 'pretty' }}>{GRP_NOTE}</Typography>
                  <Typography variant="subtitle2">{l.name}</Typography>
                </Box>
              </Paper>
            </Box>
          </Card>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { GMuiModal, GLeaderRoster, C287_RosterOpen, C287_RosterAdd, C287_RosterFlag, C287_RosterExpired, C287_RosterDeparted, C288_WelcomeNote });
