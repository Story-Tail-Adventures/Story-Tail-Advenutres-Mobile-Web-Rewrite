/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.6 Supplier Payments: 5 artboards, web only (no phone treatment, like §3.7). MUI v9.
//
// Redrawn 2026-10-16 after the §3.6 ruling: the app never holds a card. Clients pay each
// supplier themselves through an optional pay link on each payment_milestone (the supplier's
// own payment page, or a Travefy invoice link Gyasi makes when the supplier has none). Only the
// advisor adds, changes or removes a link (https only, every change writes an audit_event row),
// and only the advisor marks a milestone paid.
//
//   3.6.1  Trip Payments          A361_TripPayments
//   3.6.1b Add or edit pay link   A361b_EditPayLink
//   3.6.2  Send Payment Link      A362_SendPaymentLink
//   3.6.5  Mark Paid              A365_MarkPaid
//   3.6.6  Payment History        A366_PaymentHistory
//
// Removed with the card vault: 3.6.3 Request sent, 3.6.4 Reveal card number and 3.6.7 Spending
// limit. Their numbers are kept retired so links from other docs still land in the right place.
//
// Sample trip: Sandals Royal Bahamian, Aug 12 to 19, 2026, Jordan + Sam Hayes, the same five
// milestones as the §3.4.15 payment schedule (agent-trip.jsx), so the two read as one record.

// Shared modal shell for this file: full-bleed scrim with a centred Paper.
// Drawn in place (no portal) because artboards are static boxes.
function A36_MuiModal({ maxWidth, children }) {
  const { Box, Paper } = MUI;
  return (
    <MuiScreenFrame chrome="plain">
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'scrim' }}>
        <Paper elevation={8} sx={{ width: '100%', maxWidth, p: 2.75 }}>
          {children}
        </Paper>
      </Box>
    </MuiScreenFrame>
  );
}

// Small text field with optional mono input font.
function A36_MuiField({ label, mono, span2, sx, ...rest }) {
  const { TextField } = MUI;
  return (
    <TextField
      label={label} size="small" fullWidth
      sx={{ gridColumn: span2 ? 'span 2' : undefined, ...(mono ? { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } } : {}), ...sx }}
      {...rest}
    />
  );
}

// Milestone summary strip used at the top of each dialog.
function A36_MilestoneSummary({ label, supplier, amount, due }) {
  const { Paper, Stack, Box, Typography } = MUI;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, bgcolor: 'surface.2' }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Icon name="receipt" size={16}/>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2">{label} · {supplier}</Typography>
          <Typography variant="caption" color="text.secondary">Sandals Royal Bahamian · Aug 12 to 19, 2026 · Jordan + Sam Hayes</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="subtitle1" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 700 }}>{amount}</Typography>
          <Typography variant="caption" color="text.secondary">due {due}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

// status: scheduled | paid | waived | overdue (Screen-Inventory 3.6.1) → the shared chip palette.
const A36_STATUS = {
  scheduled: { kind: 'traveling', label: 'Scheduled' },
  paid: { kind: 'booked', label: 'Paid' },
  waived: { kind: 'past', label: 'Waived' },
  overdue: { kind: 'due', label: 'Overdue' },
};

const A36_MILESTONES = [
  { label: 'Deposit', sup: 'Sandals', due: 'Mar 14', amt: 800, paid: 800, status: 'paid', site: 'sandals.com', url: 'https://www.sandals.com/pay/SRB-220119' },
  { label: 'Mid payment', sup: 'Sandals', due: 'Apr 22', amt: 1500, paid: 1500, status: 'paid', site: 'sandals.com', url: 'https://www.sandals.com/pay/SRB-220119' },
  { label: 'Final balance', sup: 'Sandals', due: 'May 28', amt: 4180, paid: 0, status: 'scheduled', site: 'sandals.com', url: 'https://www.sandals.com/pay/SRB-220119' },
  { label: 'Transfer', sup: 'Sun & Fun Tours', due: 'Jul 29', amt: 180, paid: 0, status: 'scheduled', site: 'travefy.com', url: 'https://www.travefy.com/invoice/st-4471', invoice: true },
  { label: 'Tour · Rose Island', sup: 'Viator', due: 'Aug 1', amt: 280, paid: 0, status: 'scheduled', site: null },
];

// 3.6.1 Trip Payments
function A361_TripPayments() {
  const { Box, Stack, Typography, Button, IconButton, Paper, Card, Chip, Tooltip, Table, TableHead, TableBody, TableFooter, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  const money = (n) => `$${n.toLocaleString()}`;
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader
        title="Payments · Sandals · Aug 2026"
        subtitle="Jordan and Sam pay each supplier directly, through the link on each payment. You mark it paid once it's done."
        actions={<Button variant="outlined" size="small" startIcon={<MuiIcon name="clock" size={12}/>}>History</Button>}
        small
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25, maxWidth: 1180, mb: 1.75 }}>
        {[
          { l: 'Trip total', v: '$6,940', s: '5 payments, 3 suppliers' },
          { l: 'Paid so far', v: '$2,300', s: 'Deposit and mid payment' },
          { l: 'Still to pay', v: '$4,640', s: 'Next: final balance, May 28' },
        ].map((k) => (
          <Card key={k.l} sx={{ p: 1.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{k.l}</Typography>
            <Typography variant="h5" sx={{ fontFamily: mono, fontWeight: 700, my: 0.25 }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.s}</Typography>
          </Card>
        ))}
      </Box>

      <Card sx={{ maxWidth: 1180 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Payment</TableCell>
              <TableCell>Due</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Pay link</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {A36_MILESTONES.map((m) => {
              const st = A36_STATUS[m.status];
              const open = m.status !== 'paid' && m.status !== 'waived';
              return (
                <TableRow key={m.label} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{m.sup}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{m.due}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700 }}>{money(m.amt)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: mono, color: m.paid ? 'text.primary' : 'text.secondary' }}>{m.paid ? money(m.paid) : '·'}</TableCell>
                  <TableCell><MuiStaStatus kind={st.kind}>{st.label}</MuiStaStatus></TableCell>
                  <TableCell>
                    {m.site ? (
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Tooltip title={m.url}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }} title={m.url}>
                            <MuiIcon name="link" size={13} sx={{ color: 'text.secondary' }}/>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.site}</Typography>
                          </Stack>
                        </Tooltip>
                        {m.invoice && <Chip size="small" variant="outlined" label="Travefy invoice" sx={{ height: 20, fontSize: 10.5 }}/>}
                        <IconButton size="small" aria-label={`Edit the ${m.label} pay link`}><MuiIcon name="edit" size={13}/></IconButton>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">No pay link yet</Typography>
                        <Button variant="text" size="small" startIcon={<MuiIcon name="plus" size={12}/>}>Add a pay link</Button>
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {open ? (
                      <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                        <Button variant="outlined" color="secondary" size="small">Mark paid</Button>
                        <Tooltip title={m.site ? '' : 'Add a pay link first'}>
                          <span>
                            <Button variant="text" size="small" disabled={!m.site} startIcon={<MuiIcon name="send" size={12}/>}>Send link</Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">Paid {m.due}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ bgcolor: 'surface.2' }}>
              <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>Trip total</TableCell>
              <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 800, fontSize: 15, color: 'text.primary' }}>$6,940</TableCell>
              <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: 'text.primary' }}>$2,300</TableCell>
              <TableCell colSpan={3}/>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <Paper elevation={0} sx={{ mt: 1.75, p: 1.5, maxWidth: 1180, bgcolor: 'secondary.container', color: 'secondary.onContainer', display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Icon name="shield" size={16}/>
        <Typography variant="caption">
          <b>Clients pay suppliers directly.</b> Each link opens the supplier's own secure site. Story-Tail never sees a card and never charges a fee.
          Every link you add, change or remove is recorded in History.
        </Typography>
      </Paper>
    </MuiScreenFrame>
  );
}

// 3.6.1b Add or edit a pay link (dialog over Trip Payments)
function A361b_EditPayLink() {
  const { Box, Stack, Typography, Button, Paper, Alert, Radio, RadioGroup, FormControlLabel } = MUI;
  return (
    <A36_MuiModal maxWidth={600}>
      <Typography variant="h5" component="h2">Edit pay link</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Where Jordan goes to pay this one. It opens in a new tab on the supplier's site.</Typography>
      <A36_MilestoneSummary label="Final balance" supplier="Sandals" amount="$4,180" due="May 28"/>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.75, mb: 0.25 }}>Link from</Typography>
      <RadioGroup row value="supplier" onChange={() => {}}>
        <FormControlLabel value="supplier" control={<Radio size="small"/>} label={<Typography variant="body2">The supplier's own payment page</Typography>}/>
        <FormControlLabel value="travefy" control={<Radio size="small"/>} label={<Typography variant="body2">A Travefy invoice I made</Typography>}/>
      </RadioGroup>

      <Box sx={{ mt: 1 }}>
        <A36_MuiField
          label="Pay link"
          mono
          defaultValue="https://www.sandals.com/pay/SRB-220119"
          helperText="Links must start with https://"
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>JORDAN WILL SEE</Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1 }}>
          <Button variant="contained" size="small" endIcon={<MuiIcon name="external" size={12}/>}>Pay final balance</Button>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>sandals.com</Typography>
            <Typography variant="caption" color="text.secondary">Paid directly to Sandals on their secure site.</Typography>
          </Box>
        </Stack>
      </Paper>

      <Alert severity="info" icon={<Icon name="clock" size={14}/>} sx={{ mt: 1.25 }}>
        This change is recorded in the trip's payment history, with your name and the time.
      </Alert>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        A Travefy invoice passes along supplier costs only, never a planning or service fee.
      </Typography>

      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text" color="error" startIcon={<MuiIcon name="trash" size={12}/>}>Remove link</Button>
        <Button variant="text" sx={{ ml: 'auto' }}>Cancel</Button>
        <Button variant="contained">Save link</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.2 Send Payment Link (Payment reminder template, merged with the milestone)
function A362_SendPaymentLink() {
  const { Box, Stack, Typography, Button, Paper, Chip, TextField, MenuItem } = MUI;
  const body = `Hi Jordan,

A quick note on Sandals Royal Bahamian. Your next supplier payment is $4,180 (Final balance), with a due date of May 28. That payment goes to the supplier, not to Story-Tail.

Whenever it suits you, you can pay it here, on Sandals' own secure site:
https://www.sandals.com/pay/SRB-220119

If you've already taken care of it, thank you, and you can ignore this. If you have questions, or want me to check anything with them, just reply here.

Gyasi`;
  return (
    <A36_MuiModal maxWidth={660}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <MuiIcon name="send" size={18} sx={{ color: 'brand.main' }}/>
        <Typography variant="h5" component="h2">Send the pay link to Jordan</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Posts in the Sandals · Aug 2026 thread, like any message. Jordan and Sam both see it.</Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.75 }}>
        <TextField select size="small" label="Payment" value="final" onChange={() => {}}>
          <MenuItem value="final">Final balance · $4,180 · May 28</MenuItem>
          <MenuItem value="transfer">Transfer · $180 · Jul 29</MenuItem>
        </TextField>
        <TextField select size="small" label="Template" value="reminder" onChange={() => {}}>
          <MenuItem value="reminder">Payment reminder</MenuItem>
        </TextField>
      </Box>

      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.25 }}>
        {['{{client.firstName}}', '{{trip.name}}', '{{payment.amount}}', '{{payment.label}}', '{{payment.dueDate}}', '{{payment.link}}'].map((t) => (
          <Chip key={t} size="small" color="success" variant="outlined" icon={<MuiIcon name="check" size={11}/>} label={t}
            sx={{ fontFamily: (th) => th.typography.mono, fontSize: 10.5, height: 22 }}/>
        ))}
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mt: 1.75 }}>MESSAGE · YOU CAN EDIT IT</Typography>
      <Paper variant="outlined" sx={{ mt: 0.75, p: 1.5, bgcolor: 'surface.2' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Paper elevation={0} sx={{ maxWidth: '86%', px: 1.75, py: 1.25, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: '18px 18px 4px 18px' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{body}</Typography>
          </Paper>
        </Box>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        The message in the thread is the record. Nothing else is saved.
      </Typography>

      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" startIcon={<MuiIcon name="send" size={12}/>} sx={{ ml: 'auto' }}>Send</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.5 Mark Paid
function A365_MarkPaid() {
  const { Box, Stack, Typography, Button, Paper, Avatar } = MUI;
  return (
    <A36_MuiModal maxWidth={580}>
      <Typography variant="h5" component="h2">Mark final balance paid</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Check with Sandals first. Once you save, Jordan sees it as paid on the trip.</Typography>
      <A36_MilestoneSummary label="Final balance" supplier="Sandals" amount="$4,180" due="May 28"/>

      <Paper elevation={0} sx={{ mt: 1.25, p: 1.25, bgcolor: 'tertiary.container', color: 'tertiary.onContainer', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Avatar src={staImg('avatarC', 48, 48)} alt="" sx={{ width: 24, height: 24 }}/>
        <Box>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>From the thread · Jordan · May 14, 9:02a</Typography>
          <Typography variant="caption">"I've paid the final balance on sandals.com."</Typography>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A36_MuiField label="Amount paid" defaultValue="$4,180.00" mono/>
        <A36_MuiField label="Date paid" defaultValue="May 14, 2026"/>
        <A36_MuiField label="Confirmation number (optional)" defaultValue="SRB-220119-FINAL" mono span2/>
        <A36_MuiField label="Note (optional)" multiline minRows={2} span2 defaultValue="Paid by Jordan on sandals.com. Sandals confirmed by email."/>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Only you can mark a payment paid. It's recorded in the trip's payment history.
      </Typography>

      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" startIcon={<MuiIcon name="check" size={12}/>} sx={{ ml: 'auto' }}>Mark paid</Button>
      </Stack>
    </A36_MuiModal>
  );
}

// 3.6.6 Payment History (per trip, read from audit_event rows)
function A366_PaymentHistory() {
  const { Stack, Button, Chip, Card, Typography, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  const KIND = {
    paid: { kind: 'booked', label: 'Marked paid' },
    added: { kind: 'traveling', label: 'Link added' },
    changed: { kind: 'proposal', label: 'Link changed' },
    removed: { kind: 'past', label: 'Link removed' },
  };
  const rows = [
    { d: 'May 2 · 4:05p', k: 'changed', m: 'Final balance', detail: <>sandals.com/pay/SRB-220118 <b>→</b> sandals.com/pay/SRB-220119</>, who: 'Gyasi Story' },
    { d: 'Apr 22 · 3:02p', k: 'paid', m: 'Mid payment', detail: '$1,500 · conf. SRB-220119-MID', who: 'Gyasi Story' },
    { d: 'Apr 10 · 10:41a', k: 'added', m: 'Transfer', detail: 'travefy.com (Travefy invoice)', who: 'Gyasi Story' },
    { d: 'Apr 8 · 2:15p', k: 'removed', m: 'Tour · Rose Island', detail: 'viator.com (tour moved to Aug 1, new link to come)', who: 'Gyasi Story' },
    { d: 'Mar 14 · 11:21a', k: 'paid', m: 'Deposit', detail: '$800 · conf. SRB-220119-DEP', who: 'Gyasi Story' },
    { d: 'Mar 2 · 9:10a', k: 'added', m: 'Deposit', detail: 'sandals.com', who: 'Gyasi Story' },
  ];
  return (
    <MuiScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <MuiScreenHeader
        title="Payment history · Sandals · Aug 2026"
        subtitle="Every paid mark and every pay link change, with who and when. Nothing here can be edited."
        actions={<Button variant="outlined" size="small" startIcon={<MuiIcon name="arrow_left" size={12}/>}>Back to payments</Button>}
        small
      />
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
        {['All payments', 'Deposit', 'Mid payment', 'Final balance', 'Transfer', 'Tour · Rose Island'].map((t, i) => (
          i === 0 ? <Chip key={t} label={t} color="secondary" onClick={() => {}}/> : <Chip key={t} label={t} variant="outlined" onClick={() => {}}/>
        ))}
      </Stack>
      <Card sx={{ maxWidth: 1180 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>What</TableCell>
              <TableCell>Payment</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.d}</TableCell>
                <TableCell><MuiStaStatus kind={KIND[r.k].kind}>{KIND[r.k].label}</MuiStaStatus></TableCell>
                <TableCell>{r.m}</TableCell>
                <TableCell sx={{ fontFamily: mono, fontSize: 12, color: 'text.secondary' }}>{r.detail}</TableCell>
                <TableCell>{r.who}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
        A client's "I've paid" note lives in the message thread, not here. Only a paid mark changes the record.
      </Typography>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A361_TripPayments, A361b_EditPayLink, A362_SendPaymentLink, A365_MarkPaid, A366_PaymentHistory });
