/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.7 Commission Tracking — 7 screens.

function StatusChip({ t }) {
  const map = { Expected: 'inquiry', Invoiced: 'proposal', Received: 'booked', Disputed: 'due', Lost: 'past' };
  return <span className={`chip-status ${map[t] || 'past'}`}>{t}</span>;
}

// 3.7.1 Commission Dashboard
function A371_CommissionDashboard() {
  const bars = [2100,2950,3800,2400,3100,4200,5800,4100,3600,4500,4900,4310];
  const labels = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
  const max = 6500;
  return (
    <ScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <ScreenHeader title="Commissions" subtitle="Expected → invoiced → received. Reconciled against Inteletravel." actions={<><button className="btn btn-outlined btn-sm"><Icon name="upload" size={12}/> Import CSV</button><button className="btn btn-tonal btn-sm"><Icon name="download" size={12}/> Export</button></>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        {[{ l: 'YTD received', v: '$22,840', d: '+24% LY', tone: 'secondary' }, { l: 'Expected · 90d', v: '$11,420', d: '9 trips', tone: 'primary' }, { l: 'At risk', v: '$1,020', d: '1 disputed', tone: 'surface' }, { l: 'Avg rate', v: '13.6%', d: '+0.4pp LY', tone: 'tertiary' }].map((k) => (
          <div key={k.l} style={{ background: `var(--md-${k.tone}-container)`, color: `var(--md-on-${k.tone}-container)`, padding: 14, borderRadius: 14, minHeight: 96 }}>
            <span className="t-label" style={{ opacity: 0.85 }}>{k.l}</span>
            <div className="t-display-s" style={{ margin: '6px 0 2px', fontSize: 24 }}>{k.v}</div>
            <div className="t-body-s" style={{ opacity: 0.85, fontWeight: 600 }}>{k.d}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 14 }}><div className="t-title-s">Monthly trend · 12 months</div><span className="chip" style={{ marginLeft: 'auto' }}>+24% YoY</span></div>
        <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          {bars.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '70%', height: `${(v/max)*100}%`, background: i === 11 ? 'var(--brand-orange)' : 'var(--brand-burgundy)', borderRadius: '4px 4px 0 0' }}/>
              <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>{labels[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.7.2 Commission List
function A372_CommissionList() {
  return (
    <ScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <ScreenHeader title="Commission ledger" subtitle="Every booking, every line." actions={<button className="btn btn-outlined btn-sm"><Icon name="download" size={12}/> Export</button>} small/>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['All','Expected','Invoiced','Received','Disputed'].map((t, i) => <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`}>{t}</span>)}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Trip · client</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Supplier</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Travel</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Gross</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Rate</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Comm</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { t: 'Sandals · Hayes', sup: 'Sandals', tr: 'Aug 12, 26', g: 6480, r: 15, c: 970, s: 'Expected' },
              { t: 'Symphony · Carter', sup: 'Royal Caribbean', tr: 'Mar 4, 25', g: 5240, r: 13, c: 681, s: 'Received' },
              { t: 'Atlantis · Patel', sup: 'Atlantis', tr: 'May 24, 26', g: 4180, r: 12, c: 502, s: 'Invoiced' },
              { t: 'St Lucia · Reggie', sup: 'Sandals', tr: 'May 18, 26', g: 7920, r: 15, c: 1188, s: 'Expected' },
              { t: 'Atlantis · Westbrook', sup: 'Atlantis', tr: 'Apr 9, 26', g: 5940, r: 12, c: 713, s: 'Received' },
              { t: 'Beaches · Gomez', sup: 'Sandals', tr: 'Jan 14, 26', g: 6800, r: 15, c: 1020, s: 'Disputed' },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '500 12.5px/1.3 var(--font-sans)' }}>{r.t}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.sup}</td>
                <td style={{ padding: '10px 14px', color: 'var(--md-on-surface-variant)' }}>{r.tr}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${r.g.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--md-on-surface-variant)' }}>{r.r}%</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--md-primary)' }}>${r.c.toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}><StatusChip t={r.s}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.7.3 Commission Detail / Edit
function A373_CommissionDetail() {
  return (
    <ScreenFrame role="agent" tab="comm" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to ledger</button>
      <ScreenHeader title="Sandals · Hayes honeymoon · $970 expected" subtitle="Edit terms, mark received, link to Inteletravel statement." small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="field-label">Trip</label><input className="input" defaultValue="Sandals · Aug 2026"/></div>
            <div><label className="field-label">Client</label><input className="input" defaultValue="Jordan & Sam Hayes"/></div>
            <div><label className="field-label">Supplier</label><input className="input" defaultValue="Sandals Resorts"/></div>
            <div><label className="field-label">Gross booking</label><input className="input" defaultValue="$6,480.00" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Commission rate</label><input className="input" defaultValue="15%"/></div>
            <div><label className="field-label">Expected amount</label><input className="input" defaultValue="$970.00" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Payment terms</label><input className="input" defaultValue="Paid 60d after travel"/></div>
            <div><label className="field-label">Status</label><input className="input" defaultValue="Expected"/></div>
            <div><label className="field-label">Inteletravel ref</label><input className="input" defaultValue="—" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Received date</label><input className="input" defaultValue="—"/></div>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Notes</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Bungalow upgrade adds $102 to commission projection if final balance clears Aug 28."/></div>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-filled" style={{ width: '100%' }}><Icon name="check" size={12}/> Mark received</button>
          <button className="btn btn-tonal" style={{ width: '100%' }}><Icon name="link" size={12}/> Link Inteletravel row</button>
          <div className="card" style={{ padding: 14, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>
            <div className="t-title-s">Payment expectation</div>
            <div className="t-body-s" style={{ marginTop: 4 }}>Sandals · 60 days after travel. Expected hit: <b>Oct 18, 2026</b>.</div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.7.4 Add Commission Entry
function A374_AddCommission() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 540, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Add commission entry</h2>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>For trips booked outside the platform.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div style={{ gridColumn: 'span 2' }}><label className="field-label">Linked trip</label><input className="input" placeholder="Search trips…"/></div>
            <div><label className="field-label">Supplier</label><input className="input"/></div>
            <div><label className="field-label">Gross</label><input className="input" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Rate</label><input className="input"/></div>
            <div><label className="field-label">Expected</label><input className="input" style={{ fontFamily: 'var(--font-mono)' }}/></div>
            <div><label className="field-label">Terms</label><input className="input" defaultValue="Paid 60d after travel"/></div>
            <div><label className="field-label">Status</label><input className="input" defaultValue="Expected"/></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-text">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Save</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.7.5 Inteletravel CSV Import
function A375_CSVImport() {
  return (
    <ScreenFrame role="agent" tab="comm" padding={28} scrollable>
      <ScreenHeader title="Import Inteletravel statement" subtitle="Upload the monthly CSV. Web-only at MVP." actions={<button className="btn btn-text"><Icon name="question" size={12}/> Where do I get this file?</button>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="t-title-s">Step 1 · Upload</div>
          <div className="card" style={{ padding: 24, marginTop: 10, border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)', textAlign: 'center' }}>
            <Icon name="upload" size={32} color="var(--md-on-surface-variant)"/>
            <div className="t-title-s" style={{ marginTop: 8 }}>Drop your CSV here</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Inteletravel monthly statement · CSV / XLSX · ≤ 10 MB</div>
            <button className="btn btn-tonal btn-sm" style={{ marginTop: 12 }}>Browse files</button>
          </div>
          <div className="card" style={{ padding: 10, marginTop: 10, background: 'var(--md-surface-2)', font: '500 11.5px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>Uploaded: <b>inteletravel-apr-2026.csv</b> · 38 rows detected</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="t-title-s">Step 2 · Map columns</div>
          {[
            { csv: 'BookingRef', mapped: 'Trip reference', conf: 'Auto' },
            { csv: 'SupplierName', mapped: 'Supplier', conf: 'Auto' },
            { csv: 'GrossAmt', mapped: 'Gross booking value', conf: 'Auto' },
            { csv: 'CommissionAmt', mapped: 'Commission received', conf: 'Auto' },
            { csv: 'StatementDate', mapped: 'Received date', conf: 'Auto' },
            { csv: 'PaxName', mapped: '— ignore —', conf: 'Manual' },
          ].map((r) => (
            <div key={r.csv} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
              <span style={{ font: '600 11px/1 var(--font-mono)', color: 'var(--md-on-surface-variant)', minWidth: 130 }}>{r.csv}</span>
              <Icon name="arrow_right" size={12} color="var(--md-on-surface-variant)"/>
              <span className="t-body-s" style={{ flex: 1 }}>{r.mapped}</span>
              <span className="chip" style={{ background: r.conf === 'Auto' ? 'var(--md-success-container)' : 'var(--md-warning-container)', color: 'var(--md-on-surface)', height: 22, fontSize: 11 }}>{r.conf}</span>
            </div>
          ))}
          <button className="btn btn-filled" style={{ width: '100%', marginTop: 14 }}><Icon name="check" size={12}/> Import 38 rows</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.7.6 Reconciliation View
function A376_Reconciliation() {
  return (
    <ScreenFrame role="agent" tab="comm" padding={20} scrollable>
      <ScreenHeader title="Reconcile · April statement" subtitle="38 imported · 35 auto-matched · 3 need attention." actions={<button className="btn btn-filled btn-sm">Mark as reconciled</button>} small/>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Inteletravel row</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Platform match</th><th style={{ textAlign: 'left', padding: '10px 14px' }}>Confidence</th><th style={{ textAlign: 'right', padding: '10px 14px' }}>Amount</th><th></th>
            </tr>
          </thead>
          <tbody>
            {[
              { l: 'SRB-220119 · Sandals · $970', r: 'Sandals · Hayes', c: 'high', a: 970, ok: true },
              { l: 'RCL-99421 · RC · $681', r: 'Symphony · Carter', c: 'high', a: 681, ok: true },
              { l: 'ATL-552 · Atlantis · $502', r: 'Atlantis · Patel', c: 'high', a: 502, ok: true },
              { l: 'GMZ-228 · Sandals · $952', r: 'Beaches · Gomez (rate mismatch)', c: 'med', a: 952, ok: false, warn: 'Expected $1,020 — Sandals applied 14% not 15%' },
              { l: 'UNK-441 · Princess · $284', r: 'No match found', c: 'low', a: 284, ok: false, warn: 'Possible new booking · create entry?' },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                <td style={{ padding: '10px 14px', font: '500 12.5px/1.3 var(--font-mono)', fontSize: 12 }}>{r.l}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div className="t-body-s">{r.r}</div>
                  {r.warn && <div className="t-body-s" style={{ color: 'var(--md-warning)' }}>⚠ {r.warn}</div>}
                </td>
                <td style={{ padding: '10px 14px' }}><span className={`chip-status ${r.c === 'high' ? 'booked' : r.c === 'med' ? 'proposal' : 'due'}`}>{r.c}</span></td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${r.a}</td>
                <td style={{ padding: '10px 14px' }}>{r.ok ? <span className="chip-status booked">Auto ✓</span> : <button className="btn btn-tonal btn-sm">Resolve</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}

// 3.7.7 Forecast
function A377_Forecast() {
  return (
    <ScreenFrame role="agent" tab="comm" padding={24} scrollable>
      <ScreenHeader title="Commission forecast" subtitle="Pipeline-weighted projection by stage." actions={<span className="chip">Next 12 months</span>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Weighted forecast</div>
          <div className="t-display-s" style={{ margin: '8px 0 2px', color: 'var(--md-primary)' }}>$48,920</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Across 26 trips · weights below adjustable</div>
          <hr className="divider" style={{ margin: '12px 0' }}/>
          {[
            { s: 'Inquiry', n: 12, v: 24800, w: 10 },
            { s: 'Qualified', n: 6, v: 28600, w: 30 },
            { s: 'Proposal', n: 3, v: 22080, w: 60 },
            { s: 'Booked', n: 9, v: 32440, w: 95 },
            { s: 'Traveling', n: 2, v: 8900, w: 100 },
          ].map((r) => (
            <div key={r.s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <div className="t-title-s" style={{ flex: '0 0 80px', fontSize: 12.5 }}>{r.s}</div>
              <div style={{ flex: 1, height: 6, background: 'var(--md-surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${r.w}%`, height: '100%', background: 'var(--md-primary)' }}/>
              </div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', minWidth: 30 }}>{r.w}%</div>
              <div style={{ font: '700 12px/1 var(--font-mono)', minWidth: 80, textAlign: 'right' }}>${Math.round(r.v * r.w/100).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-title-s">Cash-in calendar</div>
          {[
            { m: 'May', a: 4310 }, { m: 'Jun', a: 3200 }, { m: 'Jul', a: 2890 }, { m: 'Aug', a: 4100 }, { m: 'Sep', a: 5400 }, { m: 'Oct', a: 6420 },
          ].map((r) => (
            <div key={r.m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--md-outline-variant)' }}>
              <div className="t-title-s" style={{ flex: '0 0 40px' }}>{r.m}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--md-surface-3)', borderRadius: 4 }}>
                <div style={{ width: `${(r.a/7000)*100}%`, height: '100%', background: 'var(--brand-burgundy)', borderRadius: 4 }}/>
              </div>
              <div style={{ font: '700 13px/1 var(--font-mono)', minWidth: 80, textAlign: 'right' }}>${r.a.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { A371_CommissionDashboard, A372_CommissionList, A373_CommissionDetail, A374_AddCommission, A375_CSVImport, A376_Reconciliation, A377_Forecast });
