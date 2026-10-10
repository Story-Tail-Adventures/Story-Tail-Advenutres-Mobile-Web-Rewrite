/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader */
// Client · 2.6 Messaging — 3 screens. MUI v9.

// ─── Small shared bits for this file (names prefixed so nothing collides) ───

// Chat bubble.
function C26_MuiBubble({ mine, children, sx }) {
  const { Paper } = MUI;
  return (
    <Paper
      elevation={0}
      variant={mine ? 'elevation' : 'outlined'}
      sx={{
        bgcolor: mine ? 'primary.main' : 'background.paper',
        color: mine ? 'primary.contrastText' : 'text.primary',
        px: 1.75, py: 1.25,
        borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        typography: 'body2', lineHeight: 1.45,
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

// Reply composer: attach icon, text, send button. `value` draws a typed draft.
function C26_MuiComposer({ placeholder, value, sendLabel, iconSize = 16 }) {
  const { TextField, InputAdornment, Button, IconButton } = MUI;
  return (
    <TextField
      size="small"
      fullWidth
      placeholder={placeholder}
      defaultValue={value}
      slotProps={{
        input: {
          readOnly: true,
          startAdornment: <InputAdornment position="start"><MuiIcon name="attach" size={iconSize} /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              {sendLabel
                ? <Button variant="contained" size="small" startIcon={<MuiIcon name="send" size={12} />}>{sendLabel}</Button>
                : <IconButton size="small" color="primary" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}><MuiIcon name="send" size={12} /></IconButton>}
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

// Thread header: back (optional), avatar, title + sub, actions.
function C26_MuiThreadHeader({ back, avatarSize = 36, title, sub, actions, px = 3 }) {
  const { Box, Stack, Typography, IconButton, Avatar } = MUI;
  return (
    <Stack direction="row" spacing={1.5} sx={{ px, py: 1.75, borderBottom: 1, borderColor: 'divider', alignItems: 'center', flexShrink: 0 }}>
      {back && <IconButton size="small"><MuiIcon name="arrow_left" size={16} /></IconButton>}
      <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: avatarSize, height: avatarSize }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>{sub}</Typography>
      </Box>
      {actions}
    </Stack>
  );
}

// 2.6.1 — Messages Inbox
function C261_Inbox() {
  const { Box, Stack, Typography, Button, Chip, Avatar, TextField, InputAdornment, List, ListItem, ListItemButton, ListItemAvatar, ListItemText } = MUI;
  const threads = [
    { who: 'Gyasi', sub: 'Sandals upgrade locked in', preview: 'I added a Red Lane spa credit and locked your bungalow upgrade…', t: '2:14p', unread: 2, trip: 'Sandals · Aug', a: 'avatarA', active: true },
    { who: 'Gyasi', sub: 'New family cruise idea', preview: 'Hey! Found a Royal Caribbean sailing for Christmas dates…', t: 'Tue', unread: 0, trip: 'Family cruise · Dec', a: 'avatarA' },
    { who: 'Gyasi', sub: 'Welcome to Story-Tail', preview: 'So glad to have you. I usually reply in under 2h…', t: 'Mar 14', unread: 0, a: 'avatarA' },
    { who: 'System', sub: 'Card authorization confirmed', preview: 'Your VISA •••• 4242 has been authorized for $4,598…', t: 'Mar 22', unread: 0, system: true },
    { who: 'System', sub: 'Symphony cruise · post-trip survey', preview: 'Thank you for traveling with us! A quick survey…', t: 'Mar 12', unread: 0, system: true },
  ];
  return (
    <MuiScreenFrame role="client" tab="msg" padding={0}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: '100%' }}>
        <Box component="aside" sx={{ borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 2.25, pt: 2.25, pb: 1.5 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>Messages</Typography>
            <Typography variant="caption" color="text.secondary">Threaded by trip.</Typography>
          </Box>
          <Box sx={{ px: 1.75, pb: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search messages…"
              slotProps={{ input: { readOnly: true, startAdornment: <InputAdornment position="start"><MuiIcon name="search" size={14} /></InputAdornment> } }}
            />
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ px: 1.75, pb: 1 }}>
            <Chip label="All" size="small" color="secondary" onClick={() => {}} />
            <Chip label="Unread · 2" size="small" variant="outlined" onClick={() => {}} />
            <Chip label="By trip" size="small" variant="outlined" onClick={() => {}} />
          </Stack>
          <List disablePadding sx={{ flex: 1, overflow: 'auto' }}>
            {threads.map((th, i) => (
              <ListItem key={i} disablePadding>
                <ListItemButton
                  selected={!!th.active}
                  sx={{
                    px: 2, py: 1.5, alignItems: 'flex-start',
                    borderLeft: 3, borderColor: th.active ? 'brand.main' : 'transparent',
                    ...(th.active && { bgcolor: 'secondary.container', color: 'secondary.onContainer', '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'secondary.container' } }),
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 42, mt: 0 }}>
                    {th.system
                      ? <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText' }}><Icon name="shield" size={14} /></Avatar>
                      : <Avatar src={staImg(th.a, 64, 64)} alt="" sx={{ width: 32, height: 32 }} />}
                  </ListItemAvatar>
                  <ListItemText
                    sx={{ my: 0, minWidth: 0 }}
                    primary={
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
                        <Typography variant="subtitle2" sx={{ flex: 1, color: 'inherit' }}>{th.who}</Typography>
                        <Typography variant="caption" sx={{ color: th.active ? 'inherit' : 'text.secondary' }}>{th.t}</Typography>
                      </Stack>
                    }
                    secondary={
                      <>
                        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 600, color: 'inherit' }}>{th.sub}</Typography>
                        <Typography component="span" variant="caption" noWrap sx={{ display: 'block', mt: 0.25, color: th.active ? 'inherit' : 'text.secondary' }}>{th.preview}</Typography>
                        {th.trip && <Typography component="span" variant="overline" sx={{ display: 'block', fontSize: 9.5, lineHeight: 1, mt: 0.75, color: th.active ? 'inherit' : 'brand.main' }}>· {th.trip}</Typography>}
                      </>
                    }
                    slotProps={{ primary: { component: 'div' }, secondary: { component: 'div', sx: { color: 'inherit' } } }}
                  />
                  {th.unread > 0 && <Chip label={th.unread} size="small" color="brand" sx={{ height: 20, minWidth: 20, fontWeight: 700, fontSize: 11, ml: 1, '& .MuiChip-label': { px: 0.75 } }} />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Compact thread preview pane */}
          <C26_MuiThreadHeader
            title="Gyasi · Sandals · Aug 12"
            sub={<><Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', display: 'inline-block' }} /> Online · reply in &lt; 2h</>}
            actions={<Button variant="outlined" color="secondary" size="small">Open trip</Button>}
          />
          <Stack spacing={1.25} sx={{ flex: 1, px: 3, py: 2.25, overflow: 'auto' }}>
            {[
              { mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates.' },
              { mine: true, t: '11:32a', b: 'Yes please. Sam will lose it 😍' },
              { mine: false, t: '2:14p', b: 'Locked. Final balance authorization request is in your dashboard.' },
            ].map((m, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                <C26_MuiBubble mine={m.mine} sx={{ maxWidth: '75%' }}>{m.b}</C26_MuiBubble>
              </Box>
            ))}
          </Stack>
          <Box sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
            <C26_MuiComposer placeholder="Reply…" iconSize={14} />
          </Box>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.6.2 — Conversation Thread (full-screen, mobile-leaning)
function C262_ConversationThread() {
  const { Box, Stack, Typography, Button, IconButton, Avatar, Chip, Paper } = MUI;
  return (
    <MuiScreenFrame role="client" tab="msg" padding={0}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <C26_MuiThreadHeader
          back
          avatarSize={38}
          title="Gyasi · Sandals upgrade locked in"
          sub="Sandals Royal Bahamian · Aug 12 – 19, 2026"
          actions={<>
            <Button variant="outlined" color="secondary" size="small">Open trip</Button>
            <IconButton size="small"><MuiIcon name="more_vert" size={16} /></IconButton>
          </>}
        />
        <Stack spacing={1.5} sx={{ flex: 1, px: 3.5, py: 2.25, overflow: 'auto' }}>
          <Box sx={{ textAlign: 'center' }}><Chip size="small" label="Mon, May 12" /></Box>
          {[
            { mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates. I held one tentatively. Want me to lock?' },
            { mine: true, t: '11:32a', b: "Yes please. Sam will lose it 😍 — what's the upgrade?" },
            { mine: false, t: '11:33a', b: '$680 over the base. I got Sandals to throw in a Red Lane spa credit + a private island day. Net win.', file: { n: 'sandals-bungalow-deck.pdf', s: '2.4 MB' } },
            { mine: true, t: '11:36a', b: 'Done. Authorize whatever you need on the VISA.' },
            { mine: false, t: '2:14p', b: "Locked. I also flagged your card for the final balance ($4,180) — there's a payment authorization request in your dashboard. No charge from me, just lets me pay Sandals on May 28 when they invoice.", reactions: [{ e: '❤', n: 1 }] },
          ].map((m, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
              {!m.mine && <Avatar src={staImg('avatarA', 48, 48)} alt="" sx={{ width: 28, height: 28, alignSelf: 'flex-end' }} />}
              <Box sx={{ maxWidth: '70%' }}>
                <C26_MuiBubble mine={m.mine}>
                  {m.b}
                  {m.file && (
                    <Paper elevation={0} sx={{ mt: 1, p: 1, bgcolor: 'surface.2', color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 30, height: 38, borderRadius: 0.5, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 8, lineHeight: 1 }}>PDF</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontSize: 12 }}>{m.file.n}</Typography>
                        <Typography variant="caption" color="text.secondary">{m.file.s}</Typography>
                      </Box>
                      <IconButton size="small"><MuiIcon name="download" size={14} /></IconButton>
                    </Paper>
                  )}
                </C26_MuiBubble>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500, fontSize: 11, mt: 0.375, textAlign: m.mine ? 'right' : 'left' }}>{m.t}{m.mine && ' · Read'}</Typography>
                {m.reactions && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                    {m.reactions.map((r) => <Chip key={r.e} size="small" variant="outlined" label={`${r.e} ${r.n}`} sx={{ height: 22, fontSize: 11 }} />)}
                  </Stack>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
        <Box sx={{ px: 3.5, pt: 1.5, pb: 2, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <C26_MuiComposer value="Thanks — go ahead and authorize." sendLabel="Send" />
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
            {['👍 Sounds good', 'Add my partner', '📎 Passport', 'Schedule a call'].map((t) => <Chip key={t} label={t} variant="outlined" size="small" onClick={() => {}} />)}
          </Stack>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

// 2.6.3 — New Conversation
function C263_NewConversation() {
  const { Box, Stack, Typography, Button, Card, CardContent, Paper, Avatar, TextField } = MUI;
  return (
    <MuiScreenFrame role="client" tab="msg" padding={28} scrollable>
      <Box>
        <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14} />} sx={{ px: 0, mb: 1 }}>Back to messages</Button>
      </Box>
      <MuiScreenHeader title="Start a message" subtitle="No trip yet? No problem — Gyasi reads everything." small />
      <Card sx={{ maxWidth: 680 }}>
        <CardContent sx={{ p: 2.75, '&:last-child': { pb: 2.75 } }}>
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', gap: 1.25, alignItems: 'center', mb: 1.75 }}>
            <Avatar src={staImg('avatarA', 64, 64)} alt="" sx={{ width: 36, height: 36 }} />
            <Typography variant="caption"><b>Gyasi · Online</b> · Typically replies within 2 hours during 9–6 ET.</Typography>
          </Paper>
          <TextField label="Subject (optional)" size="small" fullWidth placeholder="e.g. Thinking about Aruba in October" />
          <TextField
            label="Message"
            size="small"
            fullWidth
            multiline
            minRows={5}
            placeholder="Hey Gyasi — wondering if there's any availability for an Aruba honeymoon week in mid-October. Budget around $3k pp. Sam is pescatarian, anniversary is Sep 14."
            sx={{ mt: 1.5 }}
          />
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1.5 }}>
            <Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="attach" size={12} />}>Attach</Button>
            <Button variant="text" size="small" startIcon={<MuiIcon name="sparkle" size={12} />}>Use a template</Button>
            <Button variant="contained" startIcon={<MuiIcon name="send" size={14} />} sx={{ ml: 'auto' }}>Send</Button>
          </Stack>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

Object.assign(window, { C261_Inbox, C262_ConversationThread, C263_NewConversation });
