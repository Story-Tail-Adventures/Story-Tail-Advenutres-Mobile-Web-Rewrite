/* global React, MUI, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus, GRP, GRP_OPTIONS, GRP_PARTIES, GRP_WAITLIST, GRP_LEADERS, GMuiStatus, optName */
// Agent · 3.13 Groups (proposed 3.13.1 list · 3.13.2 setup wizard · 3.13.3 dashboard · 3.13.4 party detail). MUI v9.
// Web only. The agent sees everything the leader can't: contacts, money, hidden options, flags.
//
// Ported to MUI from the design project's class-style file (13e01bd3…, synced 2026-10-14).
// The leader-flag example matches group-leader.jsx (no health detail about another traveler).

function GKpi({ label, value, sub, icon }) {
  const { Card, Stack, Typography } = MUI;
  return (
    <Card variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}><MuiIcon name={icon} size={16}/><Typography variant="caption" sx={{ fontWeight: 500, color: 'inherit' }}>{label}</Typography></Stack>
      <Typography sx={{ fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.4px' }}>{value}</Typography>
      {sub && <Typography variant="body2" color="text.secondary">{sub}</Typography>}
    </Card>
  );
}

// Group lifecycle → status chip (brief rule 13).
const G_STATUS_CHIP = { Draft: 'past', Open: 'booked', Full: 'proposal', Closed: 'inquiry', Departed: 'traveling', Archived: 'past' };

function GHeadRow({ cols, labels, px = 2.25 }) {
  const { Box, Typography } = MUI;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px, py: 1.25, bgcolor: 'surface.2' }}>
      {labels.map((h, i) => <Typography key={i} variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>{h}</Typography>)}
    </Box>
  );
}

// ── 3.13.1 Groups list ───────────────────────────────────────────────
function A3131_GroupsList() {
  const { Box, Card, Stack, Typography, Button, Chip } = MUI;
  const rows = [
    { n: GRP.name, d: 'Mar 14 – 21, 2027', s: 'Open', h: '32 / 40', p: 14, w: 2, dl: 'Nov 30, 2026', l: 'Dana Ellis, Marcus Webb' },
    { n: 'Okoro Family Reunion · Jamaica', d: 'Jul 2 – 9, 2027', s: 'Full', h: '30 / 30', p: 9, w: 3, dl: 'Mar 1, 2027', l: 'Ngozi Okoro' },
    { n: "St. Mark's Youth Mission · Dominican Republic", d: 'Jun 12 – 19, 2027', s: 'Closed', h: '22 / 24', p: 22, w: 0, dl: 'Oct 1, 2026', l: 'Rev. Alan Brandt, Kim Osei' },
    { n: "Harbor Lights Women's Retreat · St. Lucia", d: 'Sep 10 – 14, 2027', s: 'Draft', h: '0 / 24', p: 0, w: 0, dl: 'Jun 1, 2027', l: 'Carol Price (invited)' },
    { n: 'Riverbend Choir Tour · Eastern Caribbean', d: 'Oct 8 – 15, 2026', s: 'Departed', h: '38 / 40', p: 21, w: 0, dl: 'Jun 30, 2026', l: 'Doris Lane' },
    { n: 'Northside Fishing Trip · Bahamas', d: 'May 3 – 7, 2026', s: 'Archived', h: '12 / 12', p: 7, w: 0, dl: 'Feb 1, 2026', l: 'Rick Haas' },
  ];
  const cols = 'minmax(0,2.4fr) 140px 100px 110px 70px 80px 110px minmax(0,1.3fr)';
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={24} scrollable>
      <MuiScreenHeader overline="GROUP TRIPS" title="Groups" subtitle="One shared itinerary, a public sign-up link, and a trip for every party."
        actions={<Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={14}/>}>New group</Button>}/>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }}>
        {['All · 6', 'Draft', 'Open', 'Full', 'Closed', 'Departed', 'Archived'].map((f, i) => <Chip key={f} label={f} size="small" {...(i === 0 ? { color: 'secondary' } : { variant: 'outlined' })}/>)}
      </Stack>
      <Card variant="outlined">
        <GHeadRow cols={cols} labels={['Group', 'Dates', 'Status', 'People / cap', 'Parties', 'Waitlist', 'Deadline', 'Leaders']}/>
        {rows.map((r, i) => (
          <Box key={r.n} sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px: 2.25, py: 1.625, alignItems: 'center', borderTop: 1, borderColor: 'divider', bgcolor: i === 0 ? 'surface.1' : 'transparent' }}>
            <Typography variant="subtitle2">{r.n}</Typography>
            <Typography variant="body2">{r.d}</Typography>
            <Box><MuiStaStatus kind={G_STATUS_CHIP[r.s]}>{r.s}</MuiStaStatus></Box>
            <Typography variant="body2">{r.h}</Typography>
            <Typography variant="body2">{r.p}</Typography>
            <Typography variant="body2">{r.w || '—'}</Typography>
            <Typography variant="body2">{r.dl}</Typography>
            <Typography variant="body2" color="text.secondary">{r.l}</Typography>
          </Box>
        ))}
      </Card>
    </MuiScreenFrame>
  );
}

// ── 3.13.2 Setup wizard ──────────────────────────────────────────────
const G_STEPS = ['Details', 'Master trip', 'Options', 'Public page', 'Leaders', 'Review and open'];

function GWizStep1() {
  const { Box, Stack, Typography, Button, TextField, Switch } = MUI;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 1.75 }}>
      <TextField size="small" label="Group name" defaultValue={GRP.name} sx={{ gridColumn: 'span 2' }}/>
      <TextField size="small" label="Start date" defaultValue="March 14, 2027"/>
      <TextField size="small" label="End date" defaultValue="March 21, 2027"/>
      <TextField size="small" label="Destination" defaultValue="Western Caribbean · from Fort Lauderdale" sx={{ gridColumn: 'span 2' }}/>
      <Box sx={{ gridColumn: 'span 2' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Hero image</Typography>
        <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center', mt: 0.75 }}>
          <Box component="img" src={staImg('cruiseShip', 400, 200)} alt="" sx={{ width: 200, height: 100, borderRadius: 3, objectFit: 'cover' }}/>
          <Button variant="outlined" size="small" startIcon={<MuiIcon name="upload" size={14}/>}>Replace image</Button>
        </Stack>
      </Box>
      <TextField label="Description" multiline minRows={3} sx={{ gridColumn: 'span 2' }} defaultValue="Seven nights in the Western Caribbean with people you already know, and a few you'll be glad to meet. Long mornings on deck, a beach day in Roatán, and dinners where nobody is in a hurry."/>
      <TextField size="small" label="Headcount cap (people)" defaultValue="40" helperText="Leave blank for no cap."/>
      <TextField size="small" label="Sign-up deadline" defaultValue="November 30, 2026" helperText="Optional."/>
      <Stack direction="row" spacing={1.75} sx={{ gridColumn: 'span 2', alignItems: 'center', p: 1.75, borderRadius: 3, bgcolor: 'surface.2' }}>
        <Box sx={{ flex: 1 }}><Typography variant="subtitle2">Waitlist</Typography><Typography variant="body2" color="text.secondary">Turns on by itself when the group or an option fills. Offers last 72 hours.</Typography></Box>
        <Switch checked inputProps={{ 'aria-label': 'Waitlist' }}/>
      </Stack>
    </Box>
  );
}

function GWizStep2() {
  const { Box, Card, Stack, Typography, Button, Switch } = MUI;
  const comps = [
    { i: 'ship', t: 'Cruise · 7-night Western Caribbean', s: 'Mar 14 – 21 · Fort Lauderdale round trip', shared: true },
    { i: 'palm', t: 'Group beach day · West Bay, Roatán', s: 'Mar 16 · excursion', shared: true },
    { i: 'utensils', t: 'Group dinner', s: 'Mar 19 · reserved dining', shared: true },
    { i: 'suitcase', t: 'Port transfers', s: 'Mar 14 + Mar 21', shared: true },
    { i: 'shield', t: 'Travel protection', s: 'Offered per party', shared: false },
  ];
  return (
    <Stack spacing={1.75}>
      <Stack direction="row" spacing={1.25}>
        <Button variant="contained" size="small" startIcon={<MuiIcon name="external" size={14}/>}>Open in Trip Builder</Button>
        <Button variant="outlined" size="small">Start from a template</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">Shared parts are copied to every party's trip and stay linked. When you edit them here, every party's trip updates and they get a notice.</Typography>
      <Card variant="outlined">
        {comps.map((c, i) => (
          <Stack key={c.t} direction="row" spacing={1.75} sx={{ alignItems: 'center', px: 2, py: 1.25, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2.5, bgcolor: 'surface.3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><MuiIcon name={c.i} size={18}/></Box>
            <Box sx={{ flex: 1 }}><Typography variant="subtitle2">{c.t}</Typography><Typography variant="body2" color="text.secondary">{c.s}</Typography></Box>
            <Typography variant="body2" color="text.secondary">{c.shared ? 'Shared' : 'Per party'}</Typography>
            <Switch checked={c.shared} inputProps={{ 'aria-label': `${c.t} shared` }}/>
          </Stack>
        ))}
      </Card>
    </Stack>
  );
}

function GWizStep3() {
  const { Box, Card, Stack, Typography, Button, ToggleButtonGroup, ToggleButton } = MUI;
  const cols = 'minmax(0,1.3fr) minmax(0,2fr) 100px 100px 70px 90px 150px';
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">Fixed prices in USD, per person. Visitors and leaders only see public options. Each party picks one.</Typography>
      <Card variant="outlined">
        <GHeadRow cols={cols} px={1.75} labels={['Name', 'Description', 'Price / pp', 'Deposit / pp', 'Sleeps', 'Limit', 'Visibility']}/>
        {GRP_OPTIONS.map((o) => (
          <Box key={o.id} sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px: 1.75, py: 1.5, alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2">{o.name}</Typography>
            <Typography variant="body2" color="text.secondary">{o.desc}</Typography>
            <Typography variant="body2">{o.price}</Typography>
            <Typography variant="body2">{o.deposit}</Typography>
            <Typography variant="body2">{o.occN}</Typography>
            <Typography variant="body2">{o.limit ? `${o.limit} cabins` : '—'}</Typography>
            <ToggleButtonGroup size="small" exclusive value={o.isPublic ? 'public' : 'hidden'}>
              <ToggleButton value="public" sx={{ px: 1.25, py: 0.25 }}>Public</ToggleButton>
              <ToggleButton value="hidden" sx={{ px: 1.25, py: 0.25 }}>Hidden</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        ))}
      </Card>
      <Button variant="outlined" size="small" startIcon={<MuiIcon name="plus" size={14}/>} sx={{ alignSelf: 'flex-start' }}>Add an option</Button>
    </Stack>
  );
}

function GWizStep4() {
  const { Box, Card, Stack, Typography, Button, TextField, InputAdornment, Link } = MUI;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 2.25 }}>
      <Stack spacing={1.75}>
        <Box>
          <Stack direction="row" spacing={1}>
            <TextField size="small" fullWidth label="Page link" defaultValue="grace-community-2027"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">story-tail.com/groups/</InputAdornment> } }}/>
            <Button variant="contained" size="small" startIcon={<MuiIcon name="copy" size={14}/>} sx={{ flexShrink: 0 }}>Copy link</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ color: 'primary.main', display: 'inline-flex' }}><MuiIcon name="check" size={14}/></Box> Available</Typography>
        </Box>
        <Stack direction="row" spacing={1.25} sx={{ p: 1.75, borderRadius: 3, bgcolor: 'surface.2' }}>
          <MuiIcon name="lock" size={18}/>
          <Typography variant="body2">Unlisted. Only people with the link can find it, and search engines are asked not to list it. It doesn't appear anywhere else on the site.</Typography>
        </Stack>
        <Link href="#" variant="body2" underline="hover" sx={{ fontWeight: 600, display: 'flex', gap: 0.75, alignItems: 'center' }}><MuiIcon name="external" size={14}/> Open preview in a new tab</Link>
      </Stack>
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>Live preview</Typography>
        <Card variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', height: 130 }}>
            <Box component="img" src={staImg('cruiseShip', 900, 300)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 20%, rgba(13,33,55,0.85))' }}/>
            <Box sx={{ position: 'absolute', left: 16, bottom: 12, color: 'common.white' }}><Typography variant="h6" sx={{ color: 'inherit' }}>{GRP.name}</Typography><Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9 }}>{GRP.dates}</Typography></Box>
          </Box>
          <Box sx={{ p: 1.75, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1 }}>
            {GRP_OPTIONS.filter((o) => o.isPublic).map((o) => (
              <Box key={o.id} sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ fontSize: 13 }}>{o.name}</Typography>
                <Typography variant="caption">{o.price} per person</Typography>
              </Box>
            ))}
          </Box>
        </Card>
      </Box>
    </Box>
  );
}

function GWizStep5() {
  const { Box, Card, Stack, Avatar, Typography, Button, TextField } = MUI;
  return (
    <Stack spacing={1.75} sx={{ maxWidth: 680 }}>
      <Typography variant="body2" color="text.secondary">Leaders see who signed up, party sizes, options and status. They never see contact details, documents, or money. A leader doesn't have to travel.</Typography>
      <Stack direction="row" spacing={1}>
        <TextField size="small" fullWidth placeholder="Leader's email"/>
        <Button variant="contained" size="small" sx={{ flexShrink: 0 }}>Add leader</Button>
      </Stack>
      <Card variant="outlined">
        {[{ ...GRP_LEADERS[0], st: 'Claimed', k: 'booked' }, { ...GRP_LEADERS[1], st: 'Invited', k: 'lead' }].map((l, i) => (
          <Stack key={l.name} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.75, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
            {l.st === 'Claimed'
              ? <Avatar src={staImg(l.img, 80, 80)} alt="" sx={{ width: 36, height: 36 }}/>
              : <Avatar sx={{ width: 36, height: 36, bgcolor: 'surface.3', color: 'text.secondary', fontSize: 14 }}>MW</Avatar>}
            <Box sx={{ flex: 1 }}><Typography variant="subtitle2">{l.name}</Typography><Typography variant="body2" color="text.secondary">{l.email} · {l.traveling ? 'Traveling' : 'Not traveling'}</Typography></Box>
            <MuiStaStatus kind={l.k}>{l.st}</MuiStaStatus>
            {l.st === 'Invited' && <Button variant="text" size="small">Resend</Button>}
            <Button variant="text" size="small">Remove</Button>
          </Stack>
        ))}
      </Card>
      <Typography variant="body2" color="text.secondary">Until Marcus claims his invite, the public page leaves out his note and photo.</Typography>
    </Stack>
  );
}

function GWizStep6() {
  const { Box, Card, Stack, Typography, Button } = MUI;
  const rows = [['Group', GRP.name], ['Dates', GRP.dates], ['Cap', '40 people'], ['Deadline', GRP.deadline], ['Waitlist', 'On'], ['Options', '3 public · 1 hidden'], ['Shared parts', '4 linked to every party trip'], ['Page', 'story-tail.com/groups/grace-community-2027'], ['Leaders', 'Dana Ellis · Marcus Webb (invited)']];
  return (
    <Stack spacing={2} sx={{ maxWidth: 680 }}>
      <Card variant="outlined">
        {rows.map(([k, v], i) => (
          <Box key={k} sx={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 1.5, px: 2, py: 1.25, alignItems: 'center', borderTop: i ? 1 : 0, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{k}</Typography><Typography variant="body2">{v}</Typography><Button variant="text" size="small">Edit</Button>
          </Box>
        ))}
      </Card>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 2, borderRadius: 3.5, bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
        <MuiStaStatus kind="past">Draft</MuiStaStatus><MuiIcon name="arrow_right" size={16}/><MuiStaStatus kind="booked">Open</MuiStaStatus>
        <Typography variant="body2" sx={{ flex: 1, color: 'inherit' }}>Opening starts taking sign-ups at the link right away.</Typography>
      </Stack>
    </Stack>
  );
}

function A3132_GroupWizard({ step = 1 }) {
  const { Box, Stack, Typography, Button, Stepper, Step, StepLabel } = MUI;
  const Body = [GWizStep1, GWizStep2, GWizStep3, GWizStep4, GWizStep5, GWizStep6][step - 1];
  const titles = ['The basics', 'Build the shared itinerary', 'What people can sign up for', 'The sign-up page', 'Group leaders', 'Review and open'];
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0}>
      <Box sx={{ height: '100%', display: 'flex' }}>
        <Box component="aside" sx={{ width: 260, flexShrink: 0, px: 2.25, py: 3, borderRight: 1, borderColor: 'divider', bgcolor: 'surface.1' }}>
          <Typography variant="overline" sx={{ color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>New group</Typography>
          <Typography variant="subtitle2" sx={{ mt: 0.5, mb: 2.25 }}>{GRP.short}</Typography>
          <Stepper activeStep={step - 1} orientation="vertical">
            {G_STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
          </Stepper>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>Step {step} of 6</Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5, mb: 2.25 }}>{titles[step - 1]}</Typography>
            <Body/>
          </Box>
          <Stack direction="row" spacing={1.25} sx={{ px: 4, py: 1.75, borderTop: 1, borderColor: 'divider', bgcolor: 'surface.1' }}>
            <Button variant="text">Save as draft</Button>
            <Box sx={{ flex: 1 }}/>
            {step > 1 && <Button variant="outlined">Back</Button>}
            <Button variant="contained" color={step === 6 ? 'brand' : 'primary'}>{step === 6 ? 'Open sign-ups' : 'Continue'}</Button>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}
const A3132_Step1 = () => <A3132_GroupWizard step={1}/>;
const A3132_Step2 = () => <A3132_GroupWizard step={2}/>;
const A3132_Step3 = () => <A3132_GroupWizard step={3}/>;
const A3132_Step4 = () => <A3132_GroupWizard step={4}/>;
const A3132_Step5 = () => <A3132_GroupWizard step={5}/>;
const A3132_Step6 = () => <A3132_GroupWizard step={6}/>;

// ── 3.13.3 Group dashboard ───────────────────────────────────────────
function A3133_GroupDashboard() {
  const { Box, Card, Stack, Avatar, Typography, Button, Chip, IconButton, Link, LinearProgress, ToggleButtonGroup, ToggleButton } = MUI;
  const cols = 'minmax(0,1.7fr) minmax(0,1.6fr) 54px minmax(0,1fr) 140px 80px 84px 28px';
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={24} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ mb: 0.75 }}>Groups</Button>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end', mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}><MuiStaStatus kind="booked">Open</MuiStaStatus><Typography variant="body2" color="text.secondary">{GRP.dates} · Sign-ups close {GRP.deadline}</Typography></Stack>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, my: 0.75, letterSpacing: '-0.3px' }}>{GRP.name}</Typography>
          <Link href="#" variant="body2" underline="hover" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center', fontWeight: 600 }}><MuiIcon name="link" size={14}/> story-tail.com/groups/grace-community-2027 <MuiIcon name="copy" size={13}/></Link>
        </Box>
        <ToggleButtonGroup size="small" exclusive value="open">
          {[['open', 'Open'], ['close', 'Close sign-ups'], ['departed', 'Mark departed'], ['archive', 'Archive']].map(([v, l]) => <ToggleButton key={v} value={v} sx={{ px: 1.5 }}>{l}</ToggleButton>)}
        </ToggleButtonGroup>
        <Button variant="outlined" size="small" startIcon={<MuiIcon name="edit" size={14}/>}>Edit group</Button>
        <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={14}/>}>Add a party</Button>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 1.25, mb: 1.75 }}>
        <GKpi icon="users" label="People" value="32 / 40" sub="8 spots left"/>
        <GKpi icon="briefcase" label="Parties" value="14" sub="1 invited by a leader"/>
        <GKpi icon="dollar" label="Deposits received" value="$4,750" sub="8 of 14 parties"/>
        <GKpi icon="check" label="Paid in full" value="3" sub="Final balances due Jan 13"/>
        <GKpi icon="clock" label="Waitlist" value="2" sub="5 people · Balcony"/>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 1.75, alignItems: 'start' }}>
        <Card variant="outlined">
          <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.75, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>Roster</Typography>
            <Chip label="All 14" color="secondary" size="small"/><Chip label="Needs me · 3" variant="outlined" size="small"/><Chip label="Flagged · 1" variant="outlined" size="small"/>
            <Button variant="text" size="small" startIcon={<MuiIcon name="download" size={14}/>}>Export</Button>
          </Stack>
          <GHeadRow cols={cols} px={2} labels={['Party', 'Owner contact', 'Ppl', 'Option', 'Status', 'Deposit', 'Balance', '']}/>
          {GRP_PARTIES.map((p) => {
            const o = GRP_OPTIONS.find((x) => x.id === p.opt);
            return (
              <Box key={p.id} sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, px: 2, py: 1.25, alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: 'center' }}>
                  {p.flag && <Box sx={{ color: 'brand.main', display: 'inline-flex' }}><MuiIcon name="flag" size={14}/></Box>}
                  <Typography variant="subtitle2" sx={{ fontSize: 14 }}>{p.names}</Typography>
                </Stack>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{p.owner}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{p.email} · {p.phone}</Typography>
                </Box>
                <Typography variant="body2">{p.n}</Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="body2">{o.name}</Typography>
                  {!o.isPublic && <Chip size="small" icon={<MuiIcon name="lock" size={10}/>} label="Hidden" sx={{ height: 20, fontSize: 10.5 }}/>}
                </Stack>
                <Box><GMuiStatus s={p.status}/></Box>
                <Typography variant="body2">{p.dep}</Typography>
                <Typography variant="body2">{p.bal}</Typography>
                <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}><MuiIcon name="chevron_right" size={16}/></Box>
              </Box>
            );
          })}
        </Card>

        <Stack component="aside" spacing={1.75}>
          <Card variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Box sx={{ color: 'brand.main', display: 'inline-flex' }}><MuiIcon name="flag" size={16}/></Box><Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>Leader flags · 1</Typography></Stack>
            <Stack spacing={0.75} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'surface.2' }}>
              <Typography variant="subtitle2">Ana & Luis Ortega</Typography>
              <Typography variant="body2">"Ana says they can't make it in March after all. Could you reach out to her about next steps?"</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Dana Ellis · Oct 13</Typography>
                <Button variant="text" size="small">Open trip</Button>
                <Button variant="outlined" size="small">Resolve</Button>
              </Stack>
            </Stack>
          </Card>

          <Card variant="outlined">
            <Box sx={{ px: 2, pt: 1.75, pb: 1.25 }}><Typography variant="h6" sx={{ fontSize: 18 }}>Waitlist and offers</Typography><Typography variant="body2" color="text.secondary">Offers last 72 hours, then move to the next in line.</Typography></Box>
            {GRP_WAITLIST.map((w) => (
              <Stack key={w.pos} spacing={1} sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Chip size="small" variant="outlined" label={`#${w.pos}`} sx={{ fontFamily: (t) => t.typography.mono, height: 22 }}/>
                  <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="subtitle2" sx={{ fontSize: 14 }}>{w.names}</Typography><Typography variant="body2" color="text.secondary">{w.n} people · wants {optName(w.opt)} · No offer yet</Typography></Box>
                  <IconButton size="small" aria-label="Move up"><MuiIcon name="chevron_up" size={14}/></IconButton>
                  <IconButton size="small" aria-label="Move down"><MuiIcon name="chevron_down" size={14}/></IconButton>
                </Stack>
                <Stack direction="row" spacing={0.75}><Button variant="outlined" size="small">Send offer now</Button><Button variant="text" size="small">Skip</Button></Stack>
              </Stack>
            ))}
          </Card>

          <Card variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontSize: 18 }}>Options</Typography>
            {GRP_OPTIONS.map((o) => (
              <Box key={o.id}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.625 }}>
                  <Typography variant="subtitle2" sx={{ fontSize: 14, flex: 1 }}>{o.name} {!o.isPublic && <Chip size="small" label="Hidden" sx={{ height: 18, fontSize: 10, ml: 0.5 }}/>}</Typography>
                  <Typography variant="body2" color="text.secondary">{o.limit ? `${o.filled} of ${o.limit} cabins` : `${o.filled} parties`}</Typography>
                  {o.limit && o.filled >= o.limit && <MuiStaStatus kind="past">Full</MuiStaStatus>}
                </Stack>
                <LinearProgress variant="determinate" value={o.limit ? 100 : Math.min(100, o.filled * 12)} sx={{ height: 6, borderRadius: 999 }}/>
              </Box>
            ))}
          </Card>

          <Card variant="outlined">
            <Stack direction="row" sx={{ px: 2, pt: 1.75, pb: 1, alignItems: 'center' }}><Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>Leaders</Typography><Button variant="text" size="small" startIcon={<MuiIcon name="plus" size={13}/>}>Add</Button></Stack>
            {GRP_LEADERS.map((l) => (
              <Stack key={l.name} direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
                <Avatar src={staImg(l.img, 80, 80)} alt="" sx={{ width: 32, height: 32 }}/>
                <Box sx={{ flex: 1 }}><Typography variant="subtitle2" sx={{ fontSize: 14 }}>{l.name}</Typography><Typography variant="body2" color="text.secondary">{l.traveling ? 'Traveling' : 'Not traveling'}</Typography></Box>
                <MuiStaStatus kind="booked">Claimed</MuiStaStatus>
              </Stack>
            ))}
          </Card>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// ── 3.13.4 Party detail ──────────────────────────────────────────────
function A3134_PartyDetail() {
  const { Box, Card, Stack, Typography, Button, Chip } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={0} scrollable>
      <Stack direction="row" spacing={1.75} sx={{ px: 3, py: 1.5, bgcolor: 'secondary.container', color: 'secondary.onContainer', alignItems: 'center' }}>
        <MuiIcon name="users" size={18}/>
        <Typography variant="body2" sx={{ color: 'inherit' }}>Part of <b>{GRP.name}</b></Typography>
        <Typography variant="body2" sx={{ color: 'inherit' }}>· Option: <b>Ocean view</b></Typography>
        <GMuiStatus s="deposit"/>
        <Box sx={{ flex: 1 }}/>
        <Button variant="text" size="small" sx={{ color: 'inherit' }}>Change option</Button>
        <Button variant="contained" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ bgcolor: 'secondary.onContainer', color: 'secondary.container' }}>Group dashboard</Button>
      </Stack>
      <Box sx={{ p: 3 }}>
        <MuiScreenHeader overline="TRIP · ST-2027-0418" title="Fischer family · Western Caribbean Cruise" subtitle={`${GRP.dates} · Tom, Becca & Noah Fischer · Owner: Becca Fischer`}
          actions={<><Button variant="outlined" size="small" startIcon={<MuiIcon name="message" size={14}/>}>Message</Button><Button variant="contained" size="small" startIcon={<MuiIcon name="edit" size={14}/>}>Open in builder</Button></>}/>
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.75 }}>
          {['Overview', 'Itinerary', 'Travelers', 'Documents', 'Payments', 'Commission', 'Activity'].map((t, i) => <Chip key={t} label={t} size="small" {...(i === 0 ? { color: 'secondary' } : { variant: 'outlined' })}/>)}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 1.75 }}>
          <Card variant="outlined">
            <Typography variant="h6" sx={{ px: 2, py: 1.75, fontSize: 18 }}>Components</Typography>
            {[
              { i: 'ship', t: 'Cruise · Ocean view stateroom', s: 'Mar 14 – 21', linked: true },
              { i: 'palm', t: 'Group beach day · West Bay', s: 'Mar 16', linked: true },
              { i: 'utensils', t: 'Group dinner', s: 'Mar 19', linked: true },
              { i: 'suitcase', t: 'Port transfers', s: 'Mar 14 + 21', linked: true },
              { i: 'building', t: 'Hotel · 1 night before sailing', s: 'Mar 13 · Fort Lauderdale', linked: false },
            ].map((c) => (
              <Stack key={c.t} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <MuiIcon name={c.i} size={18}/>
                <Box sx={{ flex: 1 }}><Typography variant="subtitle2" sx={{ fontSize: 14 }}>{c.t}</Typography><Typography variant="body2" color="text.secondary">{c.s}</Typography></Box>
                <Chip size="small" icon={c.linked ? <MuiIcon name="link" size={11}/> : undefined} label={c.linked ? 'From group' : 'This party only'} sx={{ height: 22, fontSize: 11 }}/>
              </Stack>
            ))}
          </Card>
          <Stack component="aside" spacing={1.75}>
            <Card variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="h6" sx={{ fontSize: 18 }}>Payments</Typography>
              {[['Total', '$4,440'], ['Deposit · received Sep 20', '$750'], ['Balance · due Jan 13', '$3,690']].map(([k, v]) => (
                <Stack key={k} direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{k}</Typography><Typography variant="subtitle2" sx={{ fontSize: 14 }}>{v}</Typography></Stack>
              ))}
            </Card>
            <Card variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography variant="h6" sx={{ fontSize: 18 }}>Travelers</Typography>
              {['Becca Fischer · adult', 'Tom Fischer · adult', 'Noah Fischer · child'].map((t) => <Typography key={t} variant="body2">{t}</Typography>)}
            </Card>
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A3131_GroupsList, A3132_Step1, A3132_Step2, A3132_Step3, A3132_Step4, A3132_Step5, A3132_Step6, A3133_GroupDashboard, A3134_PartyDetail });
