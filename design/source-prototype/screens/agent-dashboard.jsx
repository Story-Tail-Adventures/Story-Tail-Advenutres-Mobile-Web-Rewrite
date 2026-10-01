/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.2 Dashboard & Pipeline — 3 screens. MUI v9.

function AgentKPI({ label, value, delta, icon, accent }) {
  const { Box, Stack, Card, CardContent, Typography } = MUI;
  const known = ['primary', 'secondary', 'tertiary'];
  const bg = known.includes(accent) ? `${accent}.container` : 'surface.2';
  const fg = known.includes(accent) ? `${accent}.onContainer` : 'text.primary';
  return (
    <Card sx={{ bgcolor: bg, color: fg, minHeight: 100, display: 'flex' }}>
      <CardContent sx={{ flex: 1, py: 1.75, px: 2, '&:last-child': { pb: 1.75 } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 500, letterSpacing: '0.4px', opacity: 0.85 }}>{label}</Typography>
          <Box sx={{ display: 'inline-flex' }}><Icon name={icon} size={16}/></Box>
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: 26, mt: 0.75, mb: 0.25, color: 'inherit' }}>{value}</Typography>
        {delta && <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontWeight: 600 }}>{delta}</Typography>}
      </CardContent>
    </Card>
  );
}

// 3.2.1 — Agent Dashboard / Worklist
function A321_Worklist() {
  const { Box, Stack, Card, CardContent, Typography, Button, Chip, Avatar, Divider, List, ListItem, ListItemAvatar, ListItemText, Paper } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="agent" tab="home" padding={24} scrollable>
      <MuiScreenHeader
        overline="THIS WEEK · MAY 12 – MAY 18"
        title="Morning, Gyasi. 3 things need you today."
        subtitle="One card to chase, two proposals in client court, one new lead from search."
        actions={<>
          <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="filter" size={14}/>}>Filter</Button>
          <Button variant="contained" color="brand" size="small" startIcon={<MuiIcon name="plus" size={14}/>}>New trip</Button>
        </>}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.25, mb: 1.75 }}>
        <AgentKPI label="Pipeline value" value="$148,720" delta="↗ +18% LM" icon="briefcase" accent="primary"/>
        <AgentKPI label="Booked · month" value="$32,440" delta="9 trips · 3 to close" icon="check" accent="secondary"/>
        <AgentKPI label="Commission expected" value="$4,310" delta="71% confidence" icon="dollar" accent="tertiary"/>
        <AgentKPI label="Inquiry → book" value="11 days" delta="−3 d vs LM" icon="clock" accent="surface"/>
        <AgentKPI label="Active clients" value="68" delta="+4 this month" icon="users" accent="surface"/>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 1.5 }}>
        <Card sx={{ overflow: 'hidden' }}>
          <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Proposals awaiting reply</Typography>
            <Chip size="small" variant="outlined" label="3 · $22,080" sx={{ ml: 'auto' }}/>
          </Stack>
          <Divider/>
          <List disablePadding>
            {[
              { c: 'Maya & Daniel Carter', t: 'Sandals honeymoon · Aug 12', v: 6480, due: 'Tomorrow', a: 'avatarA' },
              { c: 'Westbrook family (4)', t: 'Royal Caribbean Symphony · Dec 22', v: 9120, due: '3 days', a: 'avatarB' },
              { c: 'Jordan & Sam Hayes', t: 'Sandals · bungalow upgrade', v: 6480, due: 'Booked', a: 'avatarC' },
            ].map((p, i, arr) => (
              <ListItem key={i} divider={i < arr.length - 1} sx={{ px: 2, py: 1.5, gap: 1.25 }}>
                <ListItemAvatar sx={{ minWidth: 0 }}><Avatar src={staImg(p.a, 80, 80)} sx={{ width: 36, height: 36 }}/></ListItemAvatar>
                <ListItemText primary={p.c} secondary={p.t} slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'caption' } }} sx={{ my: 0 }}/>
                <Typography variant="body2" sx={{ fontFamily: mono, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>${p.v.toLocaleString()}</Typography>
                <MuiStaStatus kind={p.due === 'Booked' ? 'booked' : 'proposal'}>{p.due}</MuiStaStatus>
              </ListItem>
            ))}
          </List>
        </Card>

        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Payments to settle</Typography>
            <Typography variant="caption" color="text.secondary">Supplier-pay due</Typography>
          </Box>
          <Divider/>
          <List disablePadding>
            {[
              { c: 'Jordan Hayes', s: 'Sandals · final', amt: 4180, due: 'May 28', risk: 'med' },
              { c: 'Aisha Patel', s: 'Princess deposit', amt: 850, due: 'May 19', risk: 'low' },
              { c: 'Reggie & Marc', s: 'St. Lucia transfer', amt: 220, due: 'May 16', risk: 'high' },
            ].map((p, i, arr) => (
              <ListItem key={i} divider={i < arr.length - 1} sx={{ px: 2, py: 1.25, display: 'block' }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: p.risk === 'high' ? 'error.main' : p.risk === 'med' ? 'warning.main' : 'success.main' }}/>
                  <Typography variant="subtitle2" sx={{ flex: 1, fontSize: 12.5 }}>{p.c}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: mono, fontWeight: 700, fontSize: 12 }}>${p.amt.toLocaleString()}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{p.s} · due {p.due}</Typography>
              </ListItem>
            ))}
          </List>
        </Card>

        <Card sx={{ overflow: 'hidden', bgcolor: 'secondary.container', color: 'secondary.onContainer' }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Fresh leads · search</Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>3 new today</Typography>
          </Box>
          <List disablePadding>
            {[
              { n: 'Tasha Whitfield', want: 'Aruba honeymoon · Oct', age: '2h', a: 'avatarE' },
              { n: 'Eli Park', want: 'Cruise · 4 pax · Spring', age: '14h', a: 'avatarF' },
              { n: 'Linda Gomez', want: 'Adults-only AI', age: 'Yest', a: 'avatarA' },
            ].map((l, i) => (
              <ListItem key={i} sx={{ px: 2, py: 1.25, gap: 1.25, borderTop: 1, borderColor: 'divider' }}>
                <ListItemAvatar sx={{ minWidth: 0 }}><Avatar src={staImg(l.a, 64, 64)} sx={{ width: 28, height: 28 }}/></ListItemAvatar>
                <ListItemText primary={l.n} secondary={l.want}
                              slotProps={{ primary: { variant: 'subtitle2', noWrap: true, sx: { fontSize: 12.5 } }, secondary: { variant: 'caption', sx: { color: 'inherit', opacity: 0.75 } } }}
                              sx={{ my: 0 }}/>
                <Button variant="contained" size="small">Reply</Button>
              </ListItem>
            ))}
          </List>
        </Card>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 1.5, mt: 1.75 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 1.25 }}>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Travelers in next 30 days</Typography>
              <Chip size="small" variant="outlined" label="5" sx={{ ml: 'auto' }}/>
            </Stack>
            {[
              { d: 'May 18', who: 'Reggie & Marc', t: 'St. Lucia · 5n', a: 'avatarF' },
              { d: 'May 24', who: 'Patel family', t: 'Atlantis · 4 pax', a: 'avatarD' },
              { d: 'Jun 02', who: 'Kim Wallace', t: 'Aruba · solo', a: 'avatarE' },
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 1, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                <Paper elevation={0} sx={{ width: 44, py: 0.5, bgcolor: 'tertiary.container', color: 'tertiary.onContainer', textAlign: 'center', flexShrink: 0 }}>
                  <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.2, fontSize: 10 }}>{t.d.split(' ')[0]}</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1 }}>{t.d.split(' ')[1]}</Typography>
                </Paper>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">{t.who}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.t}</Typography>
                </Box>
                <Avatar src={staImg(t.a, 64, 64)} sx={{ width: 28, height: 28 }}/>
              </Stack>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>Recent messages</Typography>
            {[
              { who: 'Maya Carter', m: '"Yes lock the upgrade!"', t: '2:14p' },
              { who: 'Aisha Patel', m: '"Anything for under $3k?"', t: '11:22a' },
              { who: 'Linda Gomez', m: '"Talk tonight at 7?"', t: 'Yest' },
            ].map((m, i) => (
              <Box key={i} sx={{ py: 1, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                <Stack direction="row">
                  <Typography variant="subtitle2" sx={{ flex: 1, fontSize: 12.5 }}>{m.who}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.t}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic' }}>{m.m}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.2.2 — Pipeline / Funnel View
function A322_Pipeline() {
  const { Box, Stack, Paper, Card, CardContent, Typography, Button, Chip, Divider } = MUI;
  const noop = () => {};
  const stages = [
    { k: 'Inquiry', tone: 'lead', count: 12, val: 24800, items: [{c:'Tasha W.',t:'Aruba honeymoon',v:3800},{c:'Eli Park',t:'Spring cruise',v:9000},{c:'Linda Gomez',t:'AI · Oct',v:5200}] },
    { k: 'Qualified', tone: 'inquiry', count: 6, val: 28600, items: [{c:'Khan family',t:'Beaches T&C',v:7200},{c:'Marin & Joe',t:'Sandals St Lucia',v:6800}] },
    { k: 'Proposal', tone: 'proposal', count: 3, val: 22080, items: [{c:'Maya & Daniel',t:'Sandals · Aug',v:6480},{c:'Westbrook',t:'Symphony · Dec',v:9120},{c:'Hayes',t:'Bungalow upgrade',v:6480}] },
    { k: 'Booked', tone: 'booked', count: 9, val: 32440, items: [{c:'Jordan Hayes',t:'Sandals · Aug',v:6480},{c:'Aisha Patel',t:'Atlantis',v:3200}] },
    { k: 'Traveling', tone: 'traveling', count: 2, val: 8900, items: [{c:'Reggie & Marc',t:'St Lucia · now',v:5800}] },
  ];
  return (
    <MuiScreenFrame role="agent" tab="home" padding={20}>
      <MuiScreenHeader title="Pipeline" subtitle="Drag a card to change its stage. Stage value is summed live."
                       actions={<><Chip variant="outlined" label="All advisors"/><Chip color="secondary" onClick={noop} label="Gyasi"/></>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.25, height: 'calc(100% - 80px)', overflow: 'hidden' }}>
        {stages.map((s) => (
          <Paper key={s.k} elevation={0} sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'surface.2', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1.25 }}>
              <MuiStaStatus kind={s.tone}>{s.k}</MuiStaStatus>
              <Typography variant="subtitle2" sx={{ mt: 0.75, fontSize: 13 }}>
                {s.count} trips · <Typography component="span" variant="subtitle2" color="text.secondary" sx={{ fontWeight: 500, fontSize: 13 }}>${s.val.toLocaleString()}</Typography>
              </Typography>
            </Box>
            <Divider/>
            <Stack spacing={0.75} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
              {s.items.map((it, i) => (
                <Card key={i} sx={{ cursor: 'grab' }}>
                  <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Typography variant="subtitle2" sx={{ fontSize: 12.5 }}>{it.c}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{it.t}</Typography>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" sx={{ fontFamily: (t) => t.typography.mono }}>${it.v.toLocaleString()}</Typography>
                      <Typography variant="caption" color="text.secondary">·</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              <Button variant="text" size="small" sx={{ alignSelf: 'flex-start' }}>+ Add</Button>
            </Stack>
          </Paper>
        ))}
      </Box>
    </MuiScreenFrame>
  );
}

// 3.2.3 — Calendar
function A323_Calendar() {
  const { Box, Stack, Card, CardContent, Typography, Button, IconButton, Chip } = MUI;
  const noop = () => {};
  // Build a simple month grid for May 2026
  const days = Array.from({ length: 35 }, (_, i) => i - 3); // first row offset
  const events = {
    12: { c: 'Hayes · proposal due', t: 'proposal' },
    14: { c: 'Today', t: 'today' },
    16: { c: 'St. Lucia transfer pay', t: 'due' },
    18: { c: 'Reggie & Marc depart', t: 'travel' },
    24: { c: 'Patel family depart', t: 'travel' },
    28: { c: 'Sandals final · Hayes', t: 'due' },
  };
  const evBg = (t) => t === 'today' ? 'primary.main' : t === 'due' ? 'error.container' : t === 'travel' ? 'tertiary.container' : 'warning.container';
  const legend = [
    { c: 'error.main', l: 'Payment due' },
    { c: 'tertiary.main', l: 'Travel day' },
    { c: 'warning.main', l: 'Proposal milestone' },
    { c: 'primary.main', l: 'Today' },
  ];
  return (
    <MuiScreenFrame role="agent" tab="home" padding={20} scrollable>
      <MuiScreenHeader title="Calendar" subtitle="Trips, payments, and availability."
                       actions={<><Chip color="secondary" onClick={noop} label="Month"/><Chip variant="outlined" label="Week"/><Chip variant="outlined" label="Agenda"/></>} small/>
      <Card>
        <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.25 }}>
            <IconButton size="small"><MuiIcon name="chevron_left" size={16}/></IconButton>
            <Typography variant="h5">May 2026</Typography>
            <IconButton size="small"><MuiIcon name="chevron_right" size={16}/></IconButton>
            <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="plus" size={12}/>} sx={{ ml: 'auto !important' }}>Block availability</Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: 1, borderLeft: 1, borderColor: 'divider' }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <Typography key={d} variant="caption" color="text.secondary"
                          sx={{ p: 1, fontWeight: 600, fontSize: 11, lineHeight: 1, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'surface.2' }}>{d}</Typography>
            ))}
            {days.map((dayNum, i) => {
              const inMonth = dayNum >= 1 && dayNum <= 31;
              const ev = events[dayNum];
              const today = dayNum === 14;
              return (
                <Box key={i} sx={{ minHeight: 88, p: 0.75, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: today ? 'primary.container' : 'background.paper', opacity: inMonth ? 1 : 0.35 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: 12, lineHeight: 1, color: today ? 'primary.onContainer' : 'text.primary' }}>{inMonth ? dayNum : ''}</Typography>
                  {ev && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.75, px: 0.75, py: 0.375, borderRadius: 0.5, fontWeight: 600, fontSize: 10, lineHeight: 1.2,
                                                        bgcolor: evBg(ev.t), color: ev.t === 'today' ? 'primary.contrastText' : 'text.primary' }}>{ev.c}</Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
        {legend.map((g) => (
          <Stack key={g.l} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: g.c }}/>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{g.l}</Typography>
          </Stack>
        ))}
      </Stack>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A321_Worklist, A322_Pipeline, A323_Calendar });
