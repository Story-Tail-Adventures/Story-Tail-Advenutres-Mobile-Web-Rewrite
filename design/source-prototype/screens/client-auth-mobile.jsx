/* global React, Icon, StoryTailMark, staImg, IOSDevice */
// Client · 2.1m Mobile · Authentication & Onboarding — 14 screens.
// Mobile-native interpretation of 2.1 auth + onboarding.
// Patterns: brand mark up top, single-column forms, sticky bottom CTA,
// onboarding shows steps as a horizontal progress pill instead of a side rail.

// ──────────────────────────────────────────────────────────────────────
// Shells
// ──────────────────────────────────────────────────────────────────────

function MFrame({ dark = false, children, footer, scrollable = true, padded = true }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', padding: padded ? '18px 22px 8px' : 0 }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

function MBrandMark({ size = 22, light = false }) {
  const fg = light ? '#FFF' : 'var(--md-on-surface)';
  return (
    <div className="brand-mark" style={{ color: fg, marginBottom: 18 }}>
      <StoryTailMark size={size}/>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
        <span className="mark-script" style={{ color: fg, fontSize: 18 }}>Story-Tail</span>
        <span style={{ font: '700 8px/1 var(--font-sans)', letterSpacing: 1.4, color: light ? '#FFC83F' : 'var(--brand-orange)' }}>ADVENTURES</span>
      </span>
    </div>
  );
}

function MAuthHeader({ overline, title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {overline && <div className="t-label-s" style={{ color: 'var(--brand-orange)', marginBottom: 4 }}>{overline}</div>}
      <h1 style={{ font: '800 26px/1.15 var(--font-sans)', margin: 0, letterSpacing: -0.4 }}>{title}</h1>
      {sub && <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>{sub}</p>}
    </div>
  );
}

function MStickyBottom({ children }) {
  return (
    <div style={{
      padding: '12px 18px 22px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {children}
    </div>
  );
}

// Horizontal step progress used by the onboarding wizard.
function MStepPill({ step, total, labels }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>
        STEP {String(step + 1).padStart(2, '0')} OF {String(total).padStart(2, '0')} · {labels[step]?.toUpperCase()}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < step ? 'var(--md-success)' : i === step ? 'var(--md-primary)' : 'var(--md-surface-3)',
          }}/>
        ))}
      </div>
    </div>
  );
}

const ONBOARDING_LABELS = ['Welcome', 'Profile', 'Preferences', 'Companions', 'Existing trips', 'All set'];

function MOnboardShell({ step, total = 6, dark, title, sub, children, primary = 'Save & continue', secondary = 'Skip for now' }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>{primary} <Icon name="arrow_right" size={14}/></button>
        <button className="btn btn-text" style={{ width: '100%' }}>{secondary}</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MStepPill step={step} total={total} labels={ONBOARDING_LABELS}/>
      <h1 style={{ font: '800 24px/1.18 var(--font-sans)', margin: '4px 0 4px', letterSpacing: -0.4 }}>{title}</h1>
      {sub && <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>{sub}</p>}
      {children}
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.1 — Login
// ──────────────────────────────────────────────────────────────────────

function M211_Login({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Continue to my trips</button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center' }}>
          By signing in you agree to our <a href="#" style={{ color: 'var(--md-primary)' }}>terms</a> &amp; <a href="#" style={{ color: 'var(--md-primary)' }}>privacy</a>.
        </div>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="WELCOME BACK"
        title="Sign in"
        sub={<>New traveler? <a href="#" style={{ color: 'var(--md-primary)', fontWeight: 600 }}>Create your account</a>.</>}
      />
      <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 8 }}>Continue with Google</button>
      <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 14 }}>Continue with Apple</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
        <hr className="divider" style={{ flex: 1 }}/>
        <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR</span>
        <hr className="divider" style={{ flex: 1 }}/>
      </div>
      <div style={{ marginBottom: 10 }}><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@gmail.com"/></div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label className="field-label">Password</label>
          <a className="field-label" href="#" style={{ color: 'var(--md-primary)' }}>Forgot?</a>
        </div>
        <input className="input" type="password" defaultValue="••••••••••"/>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.2 — Registration
// ──────────────────────────────────────────────────────────────────────

function M212_Registration({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Create account</button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center' }}>
          Already a member? <a href="#" style={{ color: 'var(--md-primary)' }}>Sign in</a>
        </div>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="JOIN STORY-TAIL"
        title="Create your account"
        sub="60 seconds. No planning fees, ever."
      />
      <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 8 }}>Sign up with Google</button>
      <button className="btn btn-outlined btn-lg" style={{ width: '100%', marginBottom: 12 }}>Sign up with Apple</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
        <hr className="divider" style={{ flex: 1 }}/>
        <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR EMAIL</span>
        <hr className="divider" style={{ flex: 1 }}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div><label className="field-label">First name</label><input className="input" defaultValue="Jordan"/></div>
        <div><label className="field-label">Last name</label><input className="input" defaultValue="Hayes"/></div>
      </div>
      <div style={{ marginBottom: 10 }}><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@gmail.com"/></div>
      <div style={{ marginBottom: 10 }}>
        <label className="field-label">Password</label>
        <input className="input" type="password" defaultValue="••••••••••••"/>
        <div style={{ height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, marginTop: 6 }}>
          <div style={{ width: '85%', height: '100%', background: 'var(--md-success)', borderRadius: 2 }}/>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-success)', marginTop: 4 }}>Strong · 12+ characters · uppercase · number</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, font: '500 12px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          <Icon name="check" size={10} color="#FFF" stroke={2.5}/>
        </span>
        <span>I agree to the <a href="#" style={{ color: 'var(--md-primary)' }}>Terms</a> &amp; <a href="#" style={{ color: 'var(--md-primary)' }}>Privacy policy</a></span>
      </label>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.3 — Email Verification
// ──────────────────────────────────────────────────────────────────────

function M213_EmailVerification({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Resend verification email</button>
        <button className="btn btn-text" style={{ width: '100%' }}>Sign out</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Icon name="mail" size={36}/>
        </div>
        <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>ONE MORE STEP</div>
        <h1 style={{ font: '800 24px/1.18 var(--font-sans)', margin: '4px 0 4px' }}>Check your email</h1>
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>We sent a verification link to <b>jordan.hayes@gmail.com</b>.</p>
      </div>
      <div className="card" style={{ padding: 14, background: 'var(--md-surface-2)', marginTop: 18 }}>
        <div className="t-title-s">Why verify?</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>It links any trips Gyasi has already started planning for you, so you'll see them as soon as you sign in.</div>
      </div>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 16 }}>
        Need to update? <a href="#" style={{ color: 'var(--md-primary)' }}>Change email</a> · <a href="#" style={{ color: 'var(--md-primary)' }}>Resend</a>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.4 — Forgot Password
// ──────────────────────────────────────────────────────────────────────

function M214_ForgotPassword({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Send reset link</button>
        <div className="t-body-s" style={{ textAlign: 'center' }}>
          <a href="#" style={{ color: 'var(--md-primary)' }}>← Back to sign in</a>
        </div>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="PASSWORD HELP"
        title="Forgot your password?"
        sub="Tell us your email and we'll send a reset link."
      />
      <div><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@gmail.com"/></div>
      <div className="card" style={{ padding: 14, background: 'var(--md-surface-2)', marginTop: 16 }}>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>You'll receive an email within a minute. Check your spam folder if you don't see it. Links expire after 30 minutes.</div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.5 — Reset Password
// ──────────────────────────────────────────────────────────────────────

function M215_ResetPassword({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Update password</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="RESET PASSWORD"
        title="Set a new password"
        sub="Use at least 12 characters with a number."
      />
      <div style={{ marginBottom: 12 }}>
        <label className="field-label">New password</label>
        <input className="input" type="password" defaultValue="••••••••••••"/>
        <div style={{ height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, marginTop: 6 }}>
          <div style={{ width: '85%', height: '100%', background: 'var(--md-success)', borderRadius: 2 }}/>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-success)', marginTop: 4 }}>Strong</div>
      </div>
      <div><label className="field-label">Confirm new password</label><input className="input" type="password" defaultValue="••••••••••••"/></div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.6 — MFA Setup
// ──────────────────────────────────────────────────────────────────────

function M216_MFASetup({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify &amp; turn on MFA</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="EXTRA SECURITY"
        title="Set up two-factor auth"
        sub="Recommended if you'll be storing payment cards."
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { i: 'sparkle', t: 'Authenticator app', s: 'Recommended', on: true },
          { i: 'phone', t: 'SMS code', s: 'Backup method' },
        ].map((m) => (
          <div key={m.t} style={{ padding: 12, borderRadius: 12, border: `1.5px solid ${m.on ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: m.on ? 'var(--md-primary-container)' : 'var(--md-surface-1)' }}>
            <Icon name={m.i} size={16} color={m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)'}/>
            <div className="t-title-s" style={{ marginTop: 6, fontSize: 12.5, color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>{m.t}</div>
            <div className="t-body-s" style={{ color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)', opacity: 0.8, fontSize: 11 }}>{m.s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 14px' }}>
        <div style={{ width: 144, height: 144, background: '#FFF', borderRadius: 12, padding: 10, boxShadow: 'var(--md-shadow-2)' }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ shapeRendering: 'crispEdges' }}>
            {Array.from({ length: 144 }).map((_, i) => {
              const x = i % 12, y = Math.floor(i / 12);
              const on = (x * 7 + y * 13) % 5 < 2;
              return <rect key={i} x={x*2} y={y*2} width="2" height="2" fill={on ? '#000' : 'transparent'}/>;
            })}
          </svg>
        </div>
      </div>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginBottom: 14 }}>Scan with Authy, 1Password, or Google Authenticator.</div>
      <div><label className="field-label">Enter 6-digit code</label><input className="input" defaultValue="• • • • • •" style={{ fontFamily: 'var(--font-mono)', letterSpacing: 8, textAlign: 'center' }}/></div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.7 — MFA Challenge
// ──────────────────────────────────────────────────────────────────────

function M217_MFAChallenge({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify</button>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)' }}>Use a backup code</a>
          <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)' }}>Resend SMS</a>
        </div>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="TWO-FACTOR"
        title="Enter your code"
        sub="From your authenticator app · expires in 30s"
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '10px 0 14px' }}>
        {['8','3','1','9','2','4'].map((d, i) => (
          <div key={i} style={{ width: 44, height: 56, borderRadius: 10, border: `1.5px solid ${i === 5 ? 'var(--md-primary)' : 'var(--md-outline)'}`, background: 'var(--md-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 22px/1 var(--font-mono)' }}>{d}</div>
        ))}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--md-outline-variant)', overflow: 'hidden', marginTop: 8 }}>
        <div style={{ width: '40%', height: '100%', background: 'var(--md-primary)' }}/>
      </div>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 6 }}>Expires in 18s</div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.8 — Social Login / Account Linking
// ──────────────────────────────────────────────────────────────────────

function M218_LinkAccount({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Sign in &amp; link Google</button>
        <button className="btn btn-text" style={{ width: '100%' }}>Use a different email</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <MAuthHeader
        overline="ACCOUNT FOUND"
        title="An account with this email exists"
        sub="Sign in to your existing account to link Google, or use a different email."
      />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--md-surface-2)', marginBottom: 14 }}>
        <img src={staImg('avatarC', 80, 80)} alt="" style={{ width: 44, height: 44, borderRadius: 999 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-title-s">Jordan Hayes</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>jordan.hayes@gmail.com · Mar 2024</div>
        </div>
      </div>
      <div><label className="field-label">Password for the existing account</label><input className="input" type="password" defaultValue="••••••••••••"/></div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.9 — Welcome / First Login
// ──────────────────────────────────────────────────────────────────────

function M219_Welcome({ dark = false }) {
  return (
    <MFrame dark={dark} padded={false} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Get started <Icon name="arrow_right" size={14}/></button>
        <button className="btn btn-text" style={{ width: '100%' }}>Skip the tour</button>
      </MStickyBottom>
    }>
      <div style={{ position: 'relative', height: 260, overflow: 'hidden' }}>
        <img src={staImg('overwater', 900, 600)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(122,26,31,0.35), rgba(13,33,55,0.85))' }}/>
        <div style={{ position: 'absolute', inset: 0, padding: '20px 22px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <span className="t-label-s" style={{ color: '#FFC83F' }}>WELCOME · REST WELL</span>
          <h1 style={{ font: '800 26px/1.15 var(--font-sans)', margin: '4px 0 4px', color: '#FFF' }}>So glad you're here, Jordan.</h1>
          <p className="t-body-s" style={{ color: 'rgba(255,255,255,0.92)', margin: 0, fontStyle: 'italic' }}>Here's to a year of trips worth telling — and rest worth taking. — Gyasi</p>
        </div>
      </div>
      <div style={{ padding: '20px 22px 22px' }}>
        <div className="t-title-l" style={{ marginBottom: 10 }}>Here's what your portal does:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { i: 'plane', t: 'Your trips, always here', s: 'Real-time itinerary, PDFs, offline access at the resort.' },
            { i: 'card', t: 'Securely authorize cards', s: 'Stripe-tokenized. We pay suppliers — never charge fees.' },
            { i: 'message', t: 'Talk to me anytime', s: 'Threaded by trip. Push when something changes.' },
            { i: 'passport', t: 'Documents in one place', s: 'Passports, visas, insurance — secure and shareable.' },
          ].map((c) => (
            <div key={c.t} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.i} size={15}/>
              </span>
              <div>
                <div className="t-title-s" style={{ fontSize: 13.5 }}>{c.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 12 }}>{c.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.10 — Profile Completion
// ──────────────────────────────────────────────────────────────────────

function M2110_ProfileCompletion({ dark = false }) {
  return (
    <MOnboardShell step={1} dark={dark}
      title="A few quick details"
      sub="So I can plan with all the right info on hand. Edit any of this later."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div><label className="field-label">Phone</label><input className="input" defaultValue="+1 (305) 555-0184"/></div>
        <div><label className="field-label">Date of birth</label><input className="input" defaultValue="04 / 22 / 1992"/></div>
        <div><label className="field-label">Mailing address</label><input className="input" defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label className="field-label">Emergency · name</label><input className="input" defaultValue="Sam Hayes"/></div>
          <div><label className="field-label">Emergency · phone</label><input className="input" defaultValue="305 555-0186"/></div>
        </div>
        <div>
          <label className="field-label">Passport (optional)</label>
          <input className="input" defaultValue="A123456789" style={{ marginBottom: 6 }}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input className="input" defaultValue="Exp 08/2029"/>
            <input className="input" defaultValue="USA"/>
          </div>
        </div>
      </div>
    </MOnboardShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.11 — Travel Preferences
// ──────────────────────────────────────────────────────────────────────

function M2111_PreferencesCapture({ dark = false }) {
  const groups = [
    { k: 'Destinations', tags: ['Caribbean ✓', 'Bahamas ✓', 'Greece', 'Mexico', 'Costa Rica', 'Italy', 'Iceland', 'Japan'] },
    { k: 'Travel style', tags: ['Resort ✓', 'Cruise ✓', 'Adventure', 'Family', 'Honeymoon ✓', 'Group'] },
    { k: 'Diet', tags: ['No restrictions', 'Vegetarian', 'Pescatarian ✓', 'Gluten-free', 'Halal'] },
    { k: 'Accessibility', tags: ['None', 'Mobility-friendly', 'Quiet rooms', 'Service animal'] },
  ];
  return (
    <MOnboardShell step={2} dark={dark}
      title="How do you travel?"
      sub="Tag what's true. The more, the better."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.k}>
            <div className="t-title-s" style={{ marginBottom: 6, fontSize: 13 }}>{g.k}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {g.tags.map((t) => (
                <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`} style={{ padding: '5px 10px', font: '500 11.5px/1 var(--font-sans)' }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
        <div>
          <label className="field-label">Budget comfort range</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span className="t-body-s">$1k</span>
            <div style={{ flex: 1, height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, position: 'relative' }}>
              <div style={{ position: 'absolute', left: '25%', right: '25%', top: 0, bottom: 0, background: 'var(--md-primary)', borderRadius: 2 }}/>
              <div style={{ position: 'absolute', left: '25%', top: -6, width: 16, height: 16, background: 'var(--md-primary)', borderRadius: 999, transform: 'translateX(-50%)' }}/>
              <div style={{ position: 'absolute', left: '75%', top: -6, width: 16, height: 16, background: 'var(--md-primary)', borderRadius: 999, transform: 'translateX(-50%)' }}/>
            </div>
            <span className="t-body-s">$10k+</span>
          </div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4, fontSize: 11.5 }}>$2,500 — $7,500 per person</div>
        </div>
      </div>
    </MOnboardShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.12 — Travel Companions
// ──────────────────────────────────────────────────────────────────────

function M2112_Companions({ dark = false }) {
  return (
    <MOnboardShell step={3} dark={dark}
      title="Who often travels with you?"
      sub="So we can pre-fill traveler info next time."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { n: 'Sam Hayes', r: 'Spouse', d: '11/03/1990', p: 'B987654321' },
          { n: 'Ava Hayes', r: 'Child', d: '06/12/2019', p: '—' },
        ].map((c) => (
          <div key={c.n} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="avatar lg" style={{ background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)', width: 40, height: 40, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, fontWeight: 700, flexShrink: 0 }}>{c.n[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title-s" style={{ fontSize: 13 }}>{c.n}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', fontSize: 11.5 }}>{c.r} · DOB {c.d} · {c.p}</div>
            </div>
            <button className="btn-icon"><Icon name="more" size={16}/></button>
          </div>
        ))}
        <button className="btn btn-tonal" style={{ alignSelf: 'flex-start', marginTop: 4 }}><Icon name="plus" size={13}/> Add a traveler</button>
      </div>
    </MOnboardShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.13 — Connect with Agent
// ──────────────────────────────────────────────────────────────────────

function M2113_ConnectAgent({ dark = false }) {
  return (
    <MOnboardShell step={4} dark={dark}
      title="Has Gyasi already started planning a trip for you?"
      sub="Paste an invitation code if you have one, or skip — we'll find them automatically by email."
    >
      <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'flex', gap: 10, alignItems: 'flex-start', border: 0, marginBottom: 12 }}>
        <Icon name="sparkle" size={18}/>
        <div className="t-body-s">We found <b>1 trip</b> already linked to <b>jordan.hayes@gmail.com</b>: <b>Sandals Royal Bahamian · Aug 12, 2026</b>. We'll connect it automatically.</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="field-label">Or paste an invite code (optional)</label>
        <input className="input" placeholder="e.g. STA-7HX2J9" style={{ fontFamily: 'var(--font-mono)' }}/>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, background: 'var(--md-surface-2)' }}>
        <Icon name="message" size={14} color="var(--md-primary)"/>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Don't have a code or trip yet? <a href="#" style={{ color: 'var(--md-primary)' }}>Message Gyasi</a> and she'll get you started.</div>
      </div>
    </MOnboardShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.1m.14 — Onboarding Complete
// ──────────────────────────────────────────────────────────────────────

function M2114_OnboardingComplete({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MStickyBottom>
        <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Continue to my dashboard <Icon name="arrow_right" size={14}/></button>
        <button className="btn btn-text" style={{ width: '100%' }}>Fine-tune notifications →</button>
      </MStickyBottom>
    }>
      <MBrandMark/>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 16 }}>
        <div style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--md-shadow-2)' }}>
          <Icon name="check" size={44} stroke={2.5}/>
        </div>
        <span className="t-label-s" style={{ color: 'var(--brand-orange)', marginTop: 18 }}>YOU'RE ALL SET</span>
        <h1 style={{ font: '800 26px/1.15 var(--font-sans)', margin: '4px 0 6px' }}>Welcome to the portal, Jordan.</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Profile, preferences, household, and your Sandals trip — all linked.</p>
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { i: 'plane', t: 'View your upcoming trip', s: 'Sandals · Aug 12', on: true },
          { i: 'search', t: 'Explore the search', s: '148 Caribbean trips' },
          { i: 'message', t: 'Message Gyasi', s: 'Reply usually < 2h' },
        ].map((a, i) => (
          <div key={a.t} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: a.on ? 'var(--md-primary-container)' : 'var(--md-surface-1)', color: a.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)', border: a.on ? 0 : '1px solid var(--md-outline-variant)' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: a.on ? 'rgba(255,255,255,0.25)' : 'var(--md-surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={a.i} size={15}/>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title-s" style={{ fontSize: 13 }}>{a.t}</div>
              <div className="t-body-s" style={{ opacity: 0.8, fontSize: 11.5 }}>{a.s}</div>
            </div>
            <Icon name="chevron_right" size={14}/>
          </div>
        ))}
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  M211_Login, M212_Registration, M213_EmailVerification, M214_ForgotPassword, M215_ResetPassword,
  M216_MFASetup, M217_MFAChallenge, M218_LinkAccount, M219_Welcome, M2110_ProfileCompletion,
  M2111_PreferencesCapture, M2112_Companions, M2113_ConnectAgent, M2114_OnboardingComplete,
});
