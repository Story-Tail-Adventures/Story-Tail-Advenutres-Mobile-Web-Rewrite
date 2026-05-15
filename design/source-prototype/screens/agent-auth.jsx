/* global React, Icon, StoryTailMark, staImg, ScreenFrame, ScreenHeader */
// Agent · 3.1 Authentication & Activation — 10 screens.

function AuthCardAgent({ overline, title, sub, children, footer }) {
  return (
    <ScreenFrame chrome="split">
      <div>
        {overline && <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginBottom: 4 }}>{overline}</div>}
        <h1 className="t-headline" style={{ margin: 0 }}>{title}</h1>
        {sub && <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {children}
      {footer && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 'auto' }}>{footer}</div>}
    </ScreenFrame>
  );
}

// 3.1.1 Agent Login
function A311_Login() {
  return (
    <AuthCardAgent overline="ADVISOR · SIGN IN" title="Welcome back, Gyasi" sub="MFA is required for advisor accounts.">
      <div><label className="field-label">Email</label><input className="input" defaultValue="gyasi@story-tail.com"/></div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><label className="field-label">Password</label><a className="field-label" href="#" style={{ color: 'var(--md-primary)' }}>Forgot?</a></div>
        <input className="input" type="password" defaultValue="••••••••••••"/>
      </div>
      <div className="card" style={{ padding: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon name="shield" size={16}/>
        <div className="t-body-s">MFA will be required after password.</div>
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Continue</button>
    </AuthCardAgent>
  );
}

// 3.1.2 Agent MFA Challenge
function A312_MFA() {
  return (
    <AuthCardAgent overline="TWO-FACTOR" title="Enter your code" sub="From Authy · expires in 26s">
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {['4','8','2','1','9','3'].map((d, i) => (
          <div key={i} style={{ width: 44, height: 56, borderRadius: 10, border: `1.5px solid ${i === 5 ? 'var(--md-primary)' : 'var(--md-outline)'}`, background: 'var(--md-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 22px/1 var(--font-mono)' }}>{d}</div>
        ))}
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify &amp; sign in</button>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <a className="t-body-s" href="#" style={{ color: 'var(--md-primary)' }}>Use backup code</a>
        <a className="t-body-s" href="#" style={{ color: 'var(--md-primary)' }}>SMS instead</a>
      </div>
    </AuthCardAgent>
  );
}

// 3.1.3 Agent Password Reset
function A313_PasswordReset() {
  return (
    <AuthCardAgent overline="ADVISOR RESET" title="Reset your password" sub="We'll email a reset link to your verified advisor address.">
      <div><label className="field-label">Email</label><input className="input" defaultValue="gyasi@story-tail.com"/></div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Send reset link</button>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Expires in 30 min. Admin actions auto-locked until reset.</div>
    </AuthCardAgent>
  );
}

// 3.1.4 Agent Invitation / Activation Link
function A314_Invitation() {
  return (
    <AuthCardAgent overline="STORY-TAIL TEAM · INVITATION" title="Aria — you're invited" sub="Gyasi has invited you to join Story-Tail Adventures as an advisor.">
      <div className="card" style={{ padding: 14, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
        <div className="t-label-s">YOUR INVITATION</div>
        <div className="t-title-l" style={{ margin: '2px 0' }}>Aria Patel · Advisor</div>
        <div className="t-body-s" style={{ opacity: 0.85 }}>aria@story-tail.com · invited by Gyasi · expires May 21</div>
      </div>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Activating creates your advisor account, sets up MFA, and lets you start managing clients within Story-Tail. <a href="#" style={{ color: 'var(--md-primary)' }}>This isn't me</a>.</div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Begin activation</button>
    </AuthCardAgent>
  );
}

// 3.1.5 Account Activation — Set Password
function A315_SetPassword() {
  return (
    <AuthCardAgent overline="ACTIVATION · STEP 1 OF 4" title="Set your password" sub="Use at least 12 characters with a number and symbol.">
      <div><label className="field-label">Email (from invite)</label><input className="input" defaultValue="aria@story-tail.com" disabled style={{ opacity: 0.7 }}/></div>
      <div>
        <label className="field-label">New password</label>
        <input className="input" type="password" defaultValue="••••••••••••"/>
        <div style={{ height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, marginTop: 6 }}>
          <div style={{ width: '90%', height: '100%', background: 'var(--md-success)', borderRadius: 2 }}/>
        </div>
      </div>
      <div><label className="field-label">Confirm password</label><input className="input" type="password" defaultValue="••••••••••••"/></div>
      <label style={{ display: 'flex', gap: 8, font: '500 12.5px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} color="#FFF" stroke={2.5}/></span>
        I accept the Story-Tail <a href="#" style={{ color: 'var(--md-primary)' }}>advisor policy</a> and Inteletravel host terms.
      </label>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Activate account <Icon name="arrow_right" size={14}/></button>
    </AuthCardAgent>
  );
}

// 3.1.6 Mandatory MFA Setup
function A316_MandatoryMFA() {
  return (
    <AuthCardAgent overline="ACTIVATION · STEP 2 OF 4" title="Set up MFA — required" sub="Advisors can't access client data without two-factor.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[{ i: 'sparkle', t: 'Authenticator app', s: 'Strongly recommended', on: true }, { i: 'phone', t: 'SMS', s: 'Allowed · less secure' }].map((m) => (
          <div key={m.t} style={{ padding: 12, borderRadius: 12, border: `1.5px solid ${m.on ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: m.on ? 'var(--md-primary-container)' : 'var(--md-surface-1)' }}>
            <Icon name={m.i} size={18} color={m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)'}/>
            <div className="t-title-s" style={{ marginTop: 6, color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>{m.t}</div>
            <div className="t-body-s" style={{ color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)', opacity: 0.8 }}>{m.s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--md-surface-2)', borderRadius: 12 }}>
        <div style={{ width: 88, height: 88, background: '#FFF', borderRadius: 8, padding: 6 }}>
          <svg viewBox="0 0 12 12" width="100%" height="100%" style={{ shapeRendering: 'crispEdges' }}>
            {Array.from({ length: 144 }).map((_, i) => { const x = i % 12, y = (i/12)|0; return <rect key={i} x={x} y={y} width="1" height="1" fill={(x*7+y*13)%5<2 ? '#000' : 'transparent'}/>; })}
          </svg>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Scan with Authy, 1Password, or Google Authenticator.</div>
      </div>
      <div><label className="field-label">Enter 6-digit code</label><input className="input" defaultValue="• • •  • • •" style={{ fontFamily: 'var(--font-mono)', letterSpacing: 8, textAlign: 'center' }}/></div>
      <div className="card" style={{ padding: 12, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', border: 0 }}>
        <div className="t-title-s">Backup codes</div>
        <div className="t-body-s">10 single-use codes generated. <b>Save them before continuing</b> — you won't see them again.</div>
        <label style={{ display: 'flex', gap: 8, marginTop: 8, font: '500 12px/1.4 var(--font-sans)' }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span>
          I've saved my backup codes
        </label>
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify &amp; continue</button>
    </AuthCardAgent>
  );
}

function ActivationWizard({ step, total = 5, title, sub, children, primary = 'Save & continue' }) {
  const steps = ['Set password', 'Mandatory MFA', 'Profile', 'Availability', 'Email signature', 'Welcome tour'];
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '260px 1fr', background: 'var(--md-bg)' }}>
        <aside style={{ padding: '28px 22px', background: 'var(--md-surface-1)', borderRight: '1px solid var(--md-outline-variant)' }}>
          <div className="brand-mark" style={{ marginBottom: 22 }}>
            <StoryTailMark size={26}/>
            <span className="mark-script" style={{ fontSize: 20 }}>Story-Tail</span>
          </div>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>ADVISOR ACTIVATION</div>
          {steps.map((s, i) => {
            const done = i < step, cur = i === step;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: done ? 'var(--md-success)' : cur ? 'var(--md-primary)' : 'var(--md-surface-3)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 11px/1 var(--font-sans)' }}>
                  {done ? <Icon name="check" size={12} color="#FFF" stroke={2.5}/> : i+1}
                </span>
                <span style={{ font: cur ? '600 12.5px/1.3 var(--font-sans)' : '500 12.5px/1.3 var(--font-sans)', color: cur ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{s}</span>
              </div>
            );
          })}
        </aside>
        <main style={{ padding: '32px 40px', overflow: 'auto' }}>
          <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>STEP {String(step+1).padStart(2,'0')} OF {String(total+1).padStart(2,'0')}</div>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>{title}</h1>
          {sub && <p className="t-body-l" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 20px' }}>{sub}</p>}
          {children}
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button className="btn btn-text">Skip for now</button>
            <button className="btn btn-filled btn-lg" style={{ marginLeft: 'auto' }}>{primary} <Icon name="arrow_right" size={14}/></button>
          </div>
        </main>
      </div>
    </ScreenFrame>
  );
}

// 3.1.7 Agent Profile Setup
function A317_ProfileSetup() {
  return (
    <ActivationWizard step={2} title="Set up your advisor profile" sub="This appears in client emails and the portal.">
      <div className="card" style={{ padding: 20, maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--md-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Icon name="user" size={32} color="var(--md-on-surface-variant)"/>
          </div>
          <div>
            <div className="t-title-s">Profile photo</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>JPG or PNG · square · 400×400+</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><button className="btn btn-tonal btn-sm">Upload</button><button className="btn btn-text btn-sm">Use Gravatar</button></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="field-label">Display name</label><input className="input" defaultValue="Aria Patel"/></div>
          <div><label className="field-label">Pronouns</label><input className="input" defaultValue="she/her"/></div>
          <div><label className="field-label">Phone (verify)</label><input className="input" defaultValue="+1 (305) 555-0199"/></div>
          <div><label className="field-label">Time zone</label><input className="input" defaultValue="America/New_York · auto-detected"/></div>
          <div style={{ gridColumn: 'span 2' }}><label className="field-label">Short bio · client-facing</label><textarea className="input" style={{ height: 60, padding: 12, resize: 'none' }} defaultValue="Caribbean specialist with a soft spot for family-friendly all-inclusives. Hosted by Inteletravel."/></div>
          <div><label className="field-label">Instagram</label><input className="input" defaultValue="@ariapatel.travel"/></div>
          <div><label className="field-label">LinkedIn</label><input className="input" defaultValue="linkedin.com/in/ariapatel"/></div>
        </div>
      </div>
    </ActivationWizard>
  );
}

// 3.1.8 Availability & Calendar Setup
function A318_Availability() {
  const hours = ['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'];
  return (
    <ActivationWizard step={3} title="When are you available?" sub="Clients see realistic reply windows. You can override per day later.">
      <div className="card" style={{ padding: 20, maxWidth: 760 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <span className="chip chip-filter is-on">9 AM – 6 PM weekdays</span>
          <span className="chip">Evenings &amp; weekends</span>
          <span className="chip">Custom</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(12,1fr)', gap: 2 }}>
          <div/>
          {hours.map((h) => <div key={h} className="t-label" style={{ textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>{h}</div>)}
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, di) => (
            <React.Fragment key={d}>
              <div className="t-title-s" style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>{d}</div>
              {hours.map((h, hi) => {
                const on = di < 5 && hi >= 1 && hi <= 9;
                return <div key={hi} style={{ height: 22, borderRadius: 4, background: on ? 'var(--md-primary)' : 'var(--md-surface-3)' }}/>;
              })}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div><label className="field-label">Response-time expectation</label><input className="input" defaultValue="Within 2 hours during availability"/></div>
          <div><label className="field-label">Calendar sync</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-tonal btn-sm">Connect Google</button>
              <button className="btn btn-outlined btn-sm">Connect Apple</button>
            </div>
          </div>
        </div>
      </div>
    </ActivationWizard>
  );
}

// 3.1.9 Email Signature Setup
function A319_EmailSignature() {
  return (
    <ActivationWizard step={4} title="Your email signature" sub="Appended to every outbound email. Story-Tail brand baked in.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1000 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>EDIT · MERGE TAGS SUPPORTED</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['B','I','U','Link','Image'].map((b) => <button key={b} className="btn btn-text btn-sm" style={{ padding: '0 8px', minHeight: 28 }}>{b}</button>)}
          </div>
          <textarea className="input" style={{ height: 200, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'none' }} defaultValue={`{{agent.name}}, Travel Advisor\nStory-Tail Adventures · Hosted by Inteletravel\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\n— Making travel an adventure —`}/>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {['{{agent.name}}','{{agent.phone}}','{{agent.email}}','{{trip.name}}','{{client.firstName}}'].map((t) => <span key={t} className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, height: 22 }}>{t}</span>)}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 8 }}>LIVE PREVIEW</div>
          <div style={{ padding: 16, border: '1px solid var(--md-outline-variant)', borderRadius: 12, background: 'var(--md-surface-1)' }}>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>From: Aria Patel &lt;aria@story-tail.com&gt;<br/>To: Maya Carter &lt;maya@carterfam.io&gt;</div>
            <hr className="divider" style={{ margin: '10px 0' }}/>
            <div className="t-body" style={{ marginBottom: 14 }}>Hey Maya! Your Sandals proposal is attached…</div>
            <div style={{ borderTop: '1px solid var(--md-outline-variant)', paddingTop: 10, font: '400 13px/1.55 var(--font-sans)', color: 'var(--md-on-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StoryTailMark size={36}/>
                <div>
                  <div style={{ font: '700 14px/1.1 var(--font-sans)' }}>Aria Patel</div>
                  <div style={{ font: '500 11px/1.2 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>Travel Advisor · Story-Tail Adventures</div>
                </div>
              </div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>+1 (305) 555-0199 · aria@story-tail.com<br/>adventures.story-tail.com · Hosted by Inteletravel</div>
              <div className="t-body-s" style={{ color: 'var(--brand-orange)', fontWeight: 600, marginTop: 6 }}>— Making travel an adventure —</div>
            </div>
          </div>
        </div>
      </div>
    </ActivationWizard>
  );
}

// 3.1.10 Welcome Tour / First-Run
function A3110_WelcomeTour() {
  return (
    <ActivationWizard step={5} title="You're all set, Aria 🎉" sub="A 7-step tour gets you oriented. Skip anytime — it's always in Help." primary="Start the tour">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 880 }}>
        {[
          { i: 'pulse', t: 'Worklist', s: 'What needs you today.' },
          { i: 'users', t: 'Clients', s: 'Roster, CRM, login support.' },
          { i: 'briefcase', t: 'Trips & builder', s: 'Build, send, manage.' },
          { i: 'inbox', t: 'Leads', s: 'Self-guided search → inquiries.' },
          { i: 'dollar', t: 'Commission', s: 'Inteletravel reconciliation.' },
          { i: 'message', t: 'Messaging & templates', s: 'Templates, signatures, inbox.' },
        ].map((c) => (
          <div key={c.t} className="card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.i} size={18}/></span>
            <div>
              <div className="t-title-s">{c.t}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16, padding: 16, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0, maxWidth: 880 }}>
        <div className="t-title-s">First-day tasks</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 13px/1.55 var(--font-sans)' }}>
          <li>Import your existing Travefy clients</li>
          <li>Set up your first trip template</li>
          <li>Send a welcome email to your first 3 clients</li>
        </ul>
      </div>
    </ActivationWizard>
  );
}

Object.assign(window, { A311_Login, A312_MFA, A313_PasswordReset, A314_Invitation, A315_SetPassword, A316_MandatoryMFA, A317_ProfileSetup, A318_Availability, A319_EmailSignature, A3110_WelcomeTour });
