/* global React, MUI, Icon, MuiIcon, staImg, MuiScreenFrame, MuiScreenHeader, MuiStaStatus */
// Agent · 3.7 Commission Tracking — 7 screens. (MUI v9)

function StatusChip({ t }) {
  const map = { Expected: 'inquiry', Invoiced: 'proposal', Received: 'booked', Disputed: 'due', Lost: 'past' };
  return <MuiStaStatus kind={map[t] || 'past'}>{t}</MuiStaStatus>;
}

// Shared modal shell for this file: scrim + centred Paper, drawn in place.
function A37_MuiModal({ maxWidth, children }) {
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
function A37_MuiField({ label, mono, span2, sx, ...rest }) {
  const { TextField } = MUI;
  return (
    <TextField
      label={label} size="small" fullWidth
      sx={{ gridColumn: span2 ? 'span 2' : undefined, ...(mono ? { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.mono } } : {}), ...sx }}
      {...rest}
    />
  );
}

// 3.7.1 Commission Dashboard
function A371_CommissionDashboard() {
  const { Box, Stack, Typography, Button, Chip, Card, CardContent } = MUI;
  const bars = [2100,2950,3800,2400,3100,4200,5800,4100,3600,4500,4900,4310];
  const labels = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
  const max = 6500;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <MuiScreenHeader title="Commissions" subtitle="Expected → invoiced → received. Reconciled against Inteletravel." actions={<><Button variant="outlined" size="small" startIcon={<MuiIcon name="upload" size={12}/>}>Import CSV</Button><Button variant="outlined" color="secondary" size="small" startIcon={<MuiIcon name="download" size={12}/>}>Export</Button></>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1.25, mb: 1.75 }}>
        {[{ l: 'YTD received', v: '$22,840', d: '+24% LY', tone: 'secondary' }, { l: 'Expected · 90d', v: '$11,420', d: '9 trips', tone: 'primary' }, { l: 'At risk', v: '$1,020', d: '1 disputed', tone: 'surface' }, { l: 'Avg rate', v: '13.6%', d: '+0.4pp LY', tone: 'tertiary' }].map((k) => (
          <Card key={k.l} sx={{ bgcolor: k.tone === 'surface' ? 'surface.2' : `${k.tone}.container`, color: k.tone === 'surface' ? 'text.primary' : `${k.tone}.onContainer`, minHeight: 96 }}>
            <CardContent sx={{ '&:last-child': { pb: 1.75 } }}>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>{k.l}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.75, mb: 0.25 }}>{k.v}</Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontWeight: 600 }}>{k.d}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack direction="row" sx={{ alignItems: 'flex-end', mb: 1.75 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Monthly trend · 12 months</Typography>
            <Chip variant="outlined" label="+24% YoY" sx={{ ml: 'auto' }}/>
          </Stack>
          <Box sx={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 1.25 }}>
            {bars.map((v, i) => (
              <Box key={i} sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                <Box sx={{ width: '70%', height: `${(v/max)*100}%`, bgcolor: i === 11 ? 'brand.main' : 'primary.main', borderRadius: '4px 4px 0 0' }}/>
                <Typography variant="caption" color="text.secondary">{labels[i]}</Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.7.2 Commission List
function A372_CommissionList() {
  const { Stack, Button, Chip, Card, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <MuiScreenHeader title="Commission ledger" subtitle="Every booking, every line." actions={<Button variant="outlined" size="small" startIcon={<MuiIcon name="download" size={12}/>}>Export</Button>} small/>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
        {['All','Expected','Invoiced','Received','Disputed'].map((t, i) => (
          i === 0 ? <Chip key={t} label={t} color="secondary" onClick={() => {}}/> : <Chip key={t} label={t} variant="outlined" onClick={() => {}}/>
        ))}
      </Stack>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Trip · client</TableCell><TableCell>Supplier</TableCell><TableCell>Travel</TableCell><TableCell align="right">Gross</TableCell><TableCell align="right">Rate</TableCell><TableCell align="right">Comm</TableCell><TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { t: 'Sandals · Hayes', sup: 'Sandals', tr: 'Aug 12, 26', g: 6480, r: 15, c: 970, s: 'Expected' },
              { t: 'Symphony · Carter', sup: 'Royal Caribbean', tr: 'Mar 4, 25', g: 5240, r: 13, c: 681, s: 'Received' },
              { t: 'Atlantis · Patel', sup: 'Atlantis', tr: 'May 24, 26', g: 4180, r: 12, c: 502, s: 'Invoiced' },
              { t: 'St Lucia · Reggie', sup: 'Sandals', tr: 'May 18, 26', g: 7920, r: 15, c: 1188, s: 'Expected' },
              { t: 'Atlantis · Westbrook', sup: 'Atlantis', tr: 'Apr 9, 26', g: 5940, r: 12, c: 713, s: 'Received' },
              { t: 'Beaches · Gomez', sup: 'Sandals', tr: 'Jan 14, 26', g: 6800, r: 15, c: 1020, s: 'Disputed' },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontWeight: 500 }}>{r.t}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.sup}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.tr}</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono }}>${r.g.toLocaleString()}</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary' }}>{r.r}%</TableCell>
                <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700, color: 'primary.main' }}>${r.c.toLocaleString()}</TableCell>
                <TableCell><StatusChip t={r.s}/></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.7.3 Commission Detail / Edit
function A373_CommissionDetail() {
  const { Box, Stack, Typography, Button, Card, CardContent, Paper } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={28} scrollable>
      <Button variant="text" size="small" startIcon={<MuiIcon name="arrow_left" size={14}/>} sx={{ px: 0, mb: 1, alignSelf: 'flex-start' }}>Back to ledger</Button>
      <MuiScreenHeader title="Sandals · Hayes honeymoon · $970 expected" subtitle="Edit terms, mark received, link to Inteletravel statement." small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 2.25, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <A37_MuiField label="Trip" defaultValue="Sandals · Aug 2026"/>
              <A37_MuiField label="Client" defaultValue="Jordan & Sam Hayes"/>
              <A37_MuiField label="Supplier" defaultValue="Sandals Resorts"/>
              <A37_MuiField label="Gross booking" defaultValue="$6,480.00" mono/>
              <A37_MuiField label="Commission rate" defaultValue="15%"/>
              <A37_MuiField label="Expected amount" defaultValue="$970.00" mono/>
              <A37_MuiField label="Payment terms" defaultValue="Paid 60d after travel"/>
              <A37_MuiField label="Status" defaultValue="Expected"/>
              <A37_MuiField label="Inteletravel ref" defaultValue="—" mono/>
              <A37_MuiField label="Received date" defaultValue="—"/>
              <A37_MuiField label="Notes" multiline minRows={2} span2 defaultValue="Bungalow upgrade adds $102 to commission projection if final balance clears Aug 28."/>
            </Box>
          </CardContent>
        </Card>
        <Stack component="aside" spacing={1.25}>
          <Button variant="contained" fullWidth startIcon={<MuiIcon name="check" size={12}/>}>Mark received</Button>
          <Button variant="outlined" color="secondary" fullWidth startIcon={<MuiIcon name="link" size={12}/>}>Link Inteletravel row</Button>
          <Paper elevation={0} sx={{ p: 1.75, bgcolor: 'tertiary.container', color: 'tertiary.onContainer' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Payment expectation</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Sandals · 60 days after travel. Expected hit: <b>Oct 18, 2026</b>.</Typography>
          </Paper>
        </Stack>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.7.4 Add Commission Entry
function A374_AddCommission() {
  const { Box, Stack, Typography, Button } = MUI;
  return (
    <A37_MuiModal maxWidth={540}>
      <Typography variant="h5" component="h2">Add commission entry</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>For trips booked outside the platform.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        <A37_MuiField label="Linked trip" placeholder="Search trips…" span2/>
        <A37_MuiField label="Supplier"/>
        <A37_MuiField label="Gross" mono/>
        <A37_MuiField label="Rate"/>
        <A37_MuiField label="Expected" mono/>
        <A37_MuiField label="Terms" defaultValue="Paid 60d after travel"/>
        <A37_MuiField label="Status" defaultValue="Expected"/>
      </Box>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="text">Cancel</Button>
        <Button variant="contained" sx={{ ml: 'auto' }}>Save</Button>
      </Stack>
    </A37_MuiModal>
  );
}

// 3.7.5 Inteletravel CSV Import
function A375_CSVImport() {
  const { Box, Stack, Typography, Button, Chip, Card, CardContent, Paper } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={28} scrollable>
      <MuiScreenHeader title="Import Inteletravel statement" subtitle="Upload the monthly CSV. Web-only at MVP." actions={<Button variant="text" startIcon={<MuiIcon name="question" size={12}/>}>Where do I get this file?</Button>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75, maxWidth: 1080 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Step 1 · Upload</Typography>
            <Paper variant="outlined" sx={{ p: 3, mt: 1.25, bgcolor: 'surface.2', borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'outline.main', textAlign: 'center' }}>
              <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}><Icon name="upload" size={32}/></Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>Drop your CSV here</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Inteletravel monthly statement · CSV / XLSX · ≤ 10 MB</Typography>
              <Button variant="outlined" color="secondary" size="small" sx={{ mt: 1.5 }}>Browse files</Button>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.25, mt: 1.25, bgcolor: 'surface.2' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Uploaded: <b>inteletravel-apr-2026.csv</b> · 38 rows detected</Typography>
            </Paper>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Step 2 · Map columns</Typography>
            {[
              { csv: 'BookingRef', mapped: 'Trip reference', conf: 'Auto' },
              { csv: 'SupplierName', mapped: 'Supplier', conf: 'Auto' },
              { csv: 'GrossAmt', mapped: 'Gross booking value', conf: 'Auto' },
              { csv: 'CommissionAmt', mapped: 'Commission received', conf: 'Auto' },
              { csv: 'StatementDate', mapped: 'Received date', conf: 'Auto' },
              { csv: 'PaxName', mapped: '— ignore —', conf: 'Manual' },
            ].map((r) => (
              <Stack key={r.csv} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.75, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: (t) => t.typography.mono, fontWeight: 600, minWidth: 130 }}>{r.csv}</Typography>
                <MuiIcon name="arrow_right" size={12} sx={{ color: 'text.secondary' }}/>
                <Typography variant="caption" sx={{ flex: 1 }}>{r.mapped}</Typography>
                <Chip size="small" label={r.conf} sx={{ bgcolor: r.conf === 'Auto' ? 'success.container' : 'warning.container', color: 'text.primary' }}/>
              </Stack>
            ))}
            <Button variant="contained" fullWidth startIcon={<MuiIcon name="check" size={12}/>} sx={{ mt: 1.75 }}>Import 38 rows</Button>
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

// 3.7.6 Reconciliation View
function A376_Reconciliation() {
  const { Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={20} scrollable>
      <MuiScreenHeader title="Reconcile · April statement" subtitle="38 imported · 35 auto-matched · 3 need attention." actions={<Button variant="contained" size="small">Mark as reconciled</Button>} small/>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Inteletravel row</TableCell><TableCell>Platform match</TableCell><TableCell>Confidence</TableCell><TableCell align="right">Amount</TableCell><TableCell/>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { l: 'SRB-220119 · Sandals · $970', r: 'Sandals · Hayes', c: 'high', a: 970, ok: true },
              { l: 'RCL-99421 · RC · $681', r: 'Symphony · Carter', c: 'high', a: 681, ok: true },
              { l: 'ATL-552 · Atlantis · $502', r: 'Atlantis · Patel', c: 'high', a: 502, ok: true },
              { l: 'GMZ-228 · Sandals · $952', r: 'Beaches · Gomez (rate mismatch)', c: 'med', a: 952, ok: false, warn: 'Expected $1,020 — Sandals applied 14% not 15%' },
              { l: 'UNK-441 · Princess · $284', r: 'No match found', c: 'low', a: 284, ok: false, warn: 'Possible new booking · create entry?' },
            ].map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontFamily: mono, fontWeight: 500, fontSize: 12 }}>{r.l}</TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ display: 'block' }}>{r.r}</Typography>
                  {r.warn && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main' }}>⚠ {r.warn}</Typography>}
                </TableCell>
                <TableCell><MuiStaStatus kind={r.c === 'high' ? 'booked' : r.c === 'med' ? 'proposal' : 'due'}>{r.c}</MuiStaStatus></TableCell>
                <TableCell align="right" sx={{ fontFamily: mono, fontWeight: 700 }}>${r.a}</TableCell>
                <TableCell>{r.ok ? <MuiStaStatus kind="booked">Auto ✓</MuiStaStatus> : <Button variant="outlined" color="secondary" size="small">Resolve</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </MuiScreenFrame>
  );
}

// 3.7.7 Forecast
function A377_Forecast() {
  const { Box, Stack, Typography, Chip, Card, CardContent, Divider, LinearProgress } = MUI;
  const mono = (t) => t.typography.mono;
  return (
    <MuiScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <MuiScreenHeader title="Commission forecast" subtitle="Pipeline-weighted projection by stage." actions={<Chip variant="outlined" label="Next 12 months"/>} small/>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Weighted forecast</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', mt: 1, mb: 0.25 }}>$48,920</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Across 26 trips · weights below adjustable</Typography>
            <Divider sx={{ my: 1.5 }}/>
            {[
              { s: 'Inquiry', n: 12, v: 24800, w: 10 },
              { s: 'Qualified', n: 6, v: 28600, w: 30 },
              { s: 'Proposal', n: 3, v: 22080, w: 60 },
              { s: 'Booked', n: 9, v: 32440, w: 95 },
              { s: 'Traveling', n: 2, v: 8900, w: 100 },
            ].map((r) => (
              <Stack key={r.s} direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 0.75 }}>
                <Typography variant="subtitle2" sx={{ flex: '0 0 80px' }}>{r.s}</Typography>
                <LinearProgress variant="determinate" value={r.w} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'surface.3' }}/>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 30 }}>{r.w}%</Typography>
                <Typography variant="caption" sx={{ fontFamily: mono, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>${Math.round(r.v * r.w/100).toLocaleString()}</Typography>
              </Stack>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Cash-in calendar</Typography>
            {[
              { m: 'May', a: 4310 }, { m: 'Jun', a: 3200 }, { m: 'Jul', a: 2890 }, { m: 'Aug', a: 4100 }, { m: 'Sep', a: 5400 }, { m: 'Oct', a: 6420 },
            ].map((r) => (
              <Stack key={r.m} direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ flex: '0 0 40px' }}>{r.m}</Typography>
                <LinearProgress variant="determinate" value={(r.a/7000)*100} sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'surface.3' }}/>
                <Typography variant="body2" sx={{ fontFamily: mono, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>${r.a.toLocaleString()}</Typography>
              </Stack>
            ))}
          </CardContent>
        </Card>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { A371_CommissionDashboard, A372_CommissionList, A373_CommissionDetail, A374_AddCommission, A375_CSVImport, A376_Reconciliation, A377_Forecast });
