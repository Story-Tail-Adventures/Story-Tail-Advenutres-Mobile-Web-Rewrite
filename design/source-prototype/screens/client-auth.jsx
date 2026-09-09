/* global React, Icon, StoryTailMark, staImg, ScreenFrame, ScreenHeader */
// Client · 2.1 Authentication & Onboarding — 14 screens.

// Shared shell for compact form screens (the split-pane auth pattern).
function AuthCard({ overline, title, sub, children, footer }) {
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

// 2.1.1 — Login
function C211_Login() {
  return (
    <AuthCard
      overline="WELCOME BACK"
      title="Sign in"
      sub={<>New traveler? <a href="#" style={{ color: 'var(--md-primary)', fontWeight: 600 }}>Create your account</a>.</>}
      footer={<>By signing in you agree to our <a href="#" style={{ color: 'var(--md-primary)' }}>terms</a> &amp; <a href="#" style={{ color: 'var(--md-primary)' }}>privacy policy</a>.</>}
    >
      <button className="btn btn-outlined btn-lg" style={{ width: '100%' }}>Continue with Google</button>
      <button className="btn btn-outlined btn-lg" style={{ width: '100%' }}>Continue with Apple</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <hr className="divider" style={{ flex: 1 }}/>
        <span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR</span>
        <hr className="divider" style={{ flex: 1 }}/>
      </div>
      <div><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@example.com"/></div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label className="field-label">Password</label>
          <a className="field-label" href="#" style={{ color: 'var(--md-primary)' }}>Forgot?</a>
        </div>
        <input className="input" type="password" defaultValue="••••••••••"/>
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Continue to my trips</button>
    </AuthCard>
  );
}

// 2.1.2 — Registration
function C212_Registration() {
  return (
    <AuthCard
      overline="JOIN STORY-TAIL"
      title="Create your account"
      sub="Takes about 60 seconds. No planning fees, ever."
      footer={<>Already a member? <a href="#" style={{ color: 'var(--md-primary)' }}>Sign in</a></>}
    >
      <button className="btn btn-outlined btn-lg" style={{ width: '100%' }}>Sign up with Google</button>
      <button className="btn btn-outlined btn-lg" style={{ width: '100%' }}>Sign up with Apple</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <hr className="divider" style={{ flex: 1 }}/><span className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>OR EMAIL</span><hr className="divider" style={{ flex: 1 }}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><label className="field-label">First name</label><input className="input" defaultValue="Jordan"/></div>
        <div><label className="field-label">Last name</label><input className="input" defaultValue="Hayes"/></div>
      </div>
      <div><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@example.com"/></div>
      <div>
        <label className="field-label">Password</label>
        <input className="input" type="password" defaultValue="••••••••••••"/>
        <div style={{ height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ width: '85%', height: '100%', background: 'var(--md-success)' }}/>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-success)', marginTop: 4 }}>Strong · 12+ characters · uppercase · number</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 12px/1.4 var(--font-sans)', color: 'var(--md-on-surface-variant)' }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={10} color="#FFF" stroke={2.5}/>
        </span>
        I agree to the <a href="#" style={{ color: 'var(--md-primary)' }}>Terms</a> &amp; <a href="#" style={{ color: 'var(--md-primary)' }}>Privacy policy</a>
      </label>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Create account</button>
    </AuthCard>
  );
}

// 2.1.3 — Email Verification
function C213_EmailVerification() {
  return (
    <AuthCard overline="ONE MORE STEP" title="Check your email" sub="We sent a verification link to jordan.hayes@example.com." footer={<>Need to update? <a href="#" style={{ color: 'var(--md-primary)' }}>Change email</a> · <a href="#" style={{ color: 'var(--md-primary)' }}>Resend</a></>}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
        <div style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mail" size={36}/>
        </div>
      </div>
      <div className="card" style={{ padding: 14, background: 'var(--md-surface-2)' }}>
        <div className="t-title-s">Why verify?</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>It links any trips Gyasi has already started planning for you, so you'll see them as soon as you sign in.</div>
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Resend verification email</button>
      <button className="btn btn-text btn-sm">Sign out</button>
    </AuthCard>
  );
}

// 2.1.4 — Forgot Password
function C214_ForgotPassword() {
  return (
    <AuthCard overline="PASSWORD HELP" title="Forgot your password?" sub="Tell us your email and we'll send a reset link." footer={<><a href="#" style={{ color: 'var(--md-primary)' }}>← Back to sign in</a></>}>
      <div><label className="field-label">Email</label><input className="input" defaultValue="jordan.hayes@example.com"/></div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Send reset link</button>
      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>You'll receive an email within a minute. Check your spam folder if you don't see it. Links expire after 30 minutes.</div>
    </AuthCard>
  );
}

// 2.1.5 — Reset Password
function C215_ResetPassword() {
  return (
    <AuthCard overline="RESET PASSWORD" title="Set a new password" sub="Use at least 12 characters with a number.">
      <div>
        <label className="field-label">New password</label>
        <input className="input" type="password" defaultValue="••••••••••••"/>
        <div style={{ height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, marginTop: 6 }}>
          <div style={{ width: '85%', height: '100%', background: 'var(--md-success)', borderRadius: 2 }}/>
        </div>
      </div>
      <div><label className="field-label">Confirm new password</label><input className="input" type="password" defaultValue="••••••••••••"/></div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Update password</button>
    </AuthCard>
  );
}

// 2.1.6 — MFA Setup
function C216_MFASetup() {
  return (
    <AuthCard overline="EXTRA SECURITY" title="Set up two-factor auth" sub="Recommended if you'll be storing payment cards.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { i: 'sparkle', t: 'Authenticator app', s: 'Recommended', on: true },
          { i: 'phone', t: 'SMS code', s: 'Backup method' },
        ].map((m) => (
          <div key={m.t} style={{ padding: 12, borderRadius: 12, border: `1.5px solid ${m.on ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`, background: m.on ? 'var(--md-primary-container)' : 'var(--md-surface-1)' }}>
            <Icon name={m.i} size={18} color={m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)'}/>
            <div className="t-title-s" style={{ marginTop: 6, color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>{m.t}</div>
            <div className="t-body-s" style={{ color: m.on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)', opacity: 0.8 }}>{m.s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--md-surface-2)', borderRadius: 12 }}>
        <div style={{ width: 96, height: 96, background: '#FFF', borderRadius: 8, padding: 6, flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ shapeRendering: 'crispEdges' }}>
            {Array.from({ length: 144 }).map((_, i) => {
              const x = i % 12, y = Math.floor(i / 12);
              const on = (x * 7 + y * 13) % 5 < 2;
              return <rect key={i} x={x*2} y={y*2} width="2" height="2" fill={on ? '#000' : 'transparent'}/>;
            })}
          </svg>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Scan with Authy, 1Password, or Google Authenticator. Or paste the secret key into your authenticator app.</div>
      </div>
      <div><label className="field-label">Enter 6-digit code</label><input className="input" defaultValue="• • •  • • •" style={{ fontFamily: 'var(--font-mono)', letterSpacing: 8, textAlign: 'center' }}/></div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify &amp; turn on MFA</button>
    </AuthCard>
  );
}

// 2.1.7 — MFA Challenge
function C217_MFAChallenge() {
  return (
    <AuthCard overline="TWO-FACTOR" title="Enter your code" sub="From your authenticator app · expires in 30s">
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '4px 0 10px' }}>
        {['8','3','1','9','2','4'].map((d, i) => (
          <div key={i} style={{ width: 44, height: 56, borderRadius: 10, border: `1.5px solid ${i === 5 ? 'var(--md-primary)' : 'var(--md-outline)'}`, background: 'var(--md-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 22px/1 var(--font-mono)' }}>{d}</div>
        ))}
      </div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Verify</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)' }}>Use a backup code</a>
        <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)' }}>Resend SMS</a>
      </div>
    </AuthCard>
  );
}

// 2.1.8 — Social Login / Account Linking
function C218_LinkAccount() {
  return (
    <AuthCard overline="ACCOUNT FOUND" title="An account with this email exists" sub="Sign in to your existing account to link Google sign-in, or use a different email.">
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--md-surface-2)' }}>
        <img src={staImg('avatarC', 80, 80)} alt="" style={{ width: 40, height: 40, borderRadius: 999 }}/>
        <div style={{ flex: 1 }}>
          <div className="t-title-s">Jordan Hayes</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>jordan.hayes@example.com · created Mar 2024</div>
        </div>
      </div>
      <div><label className="field-label">Password for the existing account</label><input className="input" type="password" defaultValue="••••••••••••"/></div>
      <button className="btn btn-filled btn-lg" style={{ width: '100%' }}>Sign in &amp; link Google</button>
      <button className="btn btn-text">Use a different email</button>
    </AuthCard>
  );
}

// 2.1.9 — Welcome / First Login
function C219_Welcome() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
          <img src={staImg('overwater', 1600, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(122,26,31,0.4), rgba(13,33,55,0.8))' }}/>
          <div style={{ position: 'absolute', inset: 0, padding: '32px 48px', color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <span className="t-label-s" style={{ color: '#FFC83F' }}>WELCOME · REST WELL</span>
            <h1 className="t-display-s" style={{ margin: '4px 0 4px', color: '#FFF' }}>So glad you're here, Jordan.</h1>
            <p className="t-body" style={{ color: 'rgba(255,255,255,0.92)', margin: 0, fontStyle: 'italic' }}>Here's to a year of trips worth telling — and rest worth taking. — Gyasi</p>
          </div>
        </div>
        <div style={{ flex: 1, padding: '24px 48px', overflow: 'auto', background: 'var(--md-bg)' }}>
          <div className="t-title-l" style={{ marginBottom: 12 }}>Here's what your portal will do for you:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { i: 'plane', t: 'Your trips, always here', s: 'Real-time itinerary updates, downloadable PDFs, offline mobile access at the resort.' },
              { i: 'card', t: 'Securely authorize cards', s: 'Stripe-tokenized. We pay suppliers — never charge you a fee.' },
              { i: 'message', t: 'Talk to me anytime', s: 'In-app messages threaded by trip. Push notifications when something changes.' },
              { i: 'search', t: 'Explore on your time', s: 'Browse trip ideas at your own pace and turn any favorite into a real proposal.' },
              { i: 'passport', t: 'Documents in one place', s: 'Passport scans, visa confirmations, insurance certificates — secure and shareable.' },
            ].map((c) => (
              <div key={c.t} className="card" style={{ padding: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.i} size={18}/>
                </span>
                <div className="t-title-s" style={{ marginTop: 8 }}>{c.t}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.s}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-text">Skip the tour</button>
            <button className="btn btn-filled btn-lg">Get started <Icon name="arrow_right" size={14}/></button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// Onboarding wizard shell (used by 2.1.10–2.1.14)
function OnboardingShell({ step, total, title, sub, children, primary = 'Save & continue', secondary = 'Skip for now' }) {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'var(--md-bg)' }}>
        <aside style={{ padding: '32px 24px', background: 'var(--md-surface-1)', borderRight: '1px solid var(--md-outline-variant)' }}>
          <div className="brand-mark" style={{ marginBottom: 28 }}>
            <StoryTailMark size={28}/>
            <span className="mark-script" style={{ fontSize: 22 }}>Story-Tail</span>
          </div>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 14 }}>WELCOME ABOARD</div>
          {['Welcome', 'Profile basics', 'Travel preferences', 'Travel companions', 'Link existing trips', 'All set!'].map((s, i) => {
            const done = i < step;
            const cur = i === step;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999,
                                background: done ? 'var(--md-success)' : cur ? 'var(--md-primary)' : 'var(--md-surface-3)',
                                color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                font: '700 11px/1 var(--font-sans)' }}>
                  {done ? <Icon name="check" size={12} color="#FFF" stroke={2.5}/> : i+1}
                </span>
                <span style={{ font: cur ? '600 13px/1.3 var(--font-sans)' : '500 13px/1.3 var(--font-sans)',
                                color: cur ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{s}</span>
              </div>
            );
          })}
        </aside>
        <main style={{ padding: '36px 48px', overflow: 'auto' }}>
          <div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>STEP {String(step+1).padStart(2,'0')} OF {String(total).padStart(2,'0')}</div>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>{title}</h1>
          {sub && <p className="t-body-l" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 20px' }}>{sub}</p>}
          {children}
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button className="btn btn-text">{secondary}</button>
            <button className="btn btn-filled btn-lg" style={{ marginLeft: 'auto' }}>{primary} <Icon name="arrow_right" size={14}/></button>
          </div>
        </main>
      </div>
    </ScreenFrame>
  );
}

// 2.1.10 — Profile Completion
function C2110_ProfileCompletion() {
  return (
    <OnboardingShell step={1} total={6} title="A few quick details" sub="So I can plan with all the right info on hand. You can edit any of this later.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label className="field-label">Phone</label><input className="input" defaultValue="+1 (305) 555-0184"/></div>
        <div><label className="field-label">Date of birth</label><input className="input" defaultValue="04 / 22 / 1992"/></div>
        <div style={{ gridColumn: 'span 2' }}><label className="field-label">Mailing address</label><input className="input" defaultValue="1240 Brickell Bay Dr, Miami, FL 33131"/></div>
        <div><label className="field-label">Emergency contact · name</label><input className="input" defaultValue="Sam Hayes (spouse)"/></div>
        <div><label className="field-label">Emergency contact · phone</label><input className="input" defaultValue="+1 (305) 555-0186"/></div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="field-label">Passport (optional but encouraged for international travel)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <input className="input" defaultValue="Number · A123456789"/>
            <input className="input" defaultValue="Expires · 08/2029"/>
            <input className="input" defaultValue="USA"/>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

// 2.1.11 — Travel Preferences Capture
function C2111_PreferencesCapture() {
  const tags = (group) => ({
    destinations: ['Caribbean ✓', 'Bahamas ✓', 'Greece', 'Mexico', 'Costa Rica', 'Italy', 'Iceland', 'Japan'],
    style: ['Resort ✓', 'Cruise ✓', 'Adventure', 'Family', 'Honeymoon ✓', 'Group'],
    diet: ['No restrictions', 'Vegetarian', 'Pescatarian ✓', 'Gluten-free', 'Halal'],
    access: ['None', 'Mobility-friendly', 'Quiet rooms', 'Service animal'],
  })[group];
  return (
    <OnboardingShell step={2} total={6} title="How do you travel?" sub="Tag what's true. The more, the better. Anything missing? Tell Gyasi later.">
      {['destinations','style','diet','access'].map((g) => (
        <div key={g} style={{ marginBottom: 14 }}>
          <div className="t-title-s" style={{ marginBottom: 6, textTransform: 'capitalize' }}>{g === 'access' ? 'Accessibility needs' : g}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags(g).map((t) => (
              <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`}>{t}</span>
            ))}
          </div>
        </div>
      ))}
      <div>
        <label className="field-label">Loyalty programs · frequent flyer numbers</label>
        <input className="input" defaultValue="AAdvantage 4ZE82Q · IHG Rewards 92214"/>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="field-label">Budget comfort range</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="t-body-s">$1k</span>
          <div style={{ flex: 1, height: 4, background: 'var(--md-outline-variant)', borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '25%', right: '25%', top: 0, bottom: 0, background: 'var(--md-primary)', borderRadius: 2 }}/>
            <div style={{ position: 'absolute', left: '25%', top: -6, width: 16, height: 16, background: 'var(--md-primary)', borderRadius: 999, transform: 'translateX(-50%)' }}/>
            <div style={{ position: 'absolute', left: '75%', top: -6, width: 16, height: 16, background: 'var(--md-primary)', borderRadius: 999, transform: 'translateX(-50%)' }}/>
          </div>
          <span className="t-body-s">$10k+</span>
        </div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>$2,500 — $7,500 per person</div>
      </div>
    </OnboardingShell>
  );
}

// 2.1.12 — Travel Companions / Household
function C2112_Companions() {
  return (
    <OnboardingShell step={3} total={6} title="Who often travels with you?" sub="So we can pre-fill traveler info next time. You can add or skip — totally up to you.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { n: 'Sam Hayes', r: 'Spouse', d: '11/03/1990', p: 'B987654321 · 02/2031' },
          { n: 'Ava Hayes', r: 'Child', d: '06/12/2019', p: '—' },
        ].map((c) => (
          <div key={c.n} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="avatar lg" style={{ background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)', width: 44, height: 44, fontSize: 15 }}>{c.n[0]}</div>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">{c.n}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.r} · DOB {c.d} · Passport {c.p}</div>
            </div>
            <button className="btn-icon"><Icon name="edit" size={16}/></button>
            <button className="btn-icon"><Icon name="trash" size={16}/></button>
          </div>
        ))}
        <button className="btn btn-tonal" style={{ alignSelf: 'flex-start', marginTop: 4 }}><Icon name="plus" size={14}/> Add a traveler</button>
      </div>
    </OnboardingShell>
  );
}

// 2.1.13 — Connect with Agent / Invite Code
function C2113_ConnectAgent() {
  return (
    <OnboardingShell step={4} total={6} title="Has Gyasi already started planning a trip for you?" sub="If you have an invitation code from her, paste it here to link existing trips to your account. Otherwise, skip — we'll find them automatically by email.">
      <div className="card" style={{ padding: 16, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'flex', gap: 12, alignItems: 'center', border: 0 }}>
        <Icon name="sparkle" size={20}/>
        <div className="t-body">We found <b>1 trip</b> already linked to <b>jordan.hayes@example.com</b>: <b>Sandals Royal Bahamian · Aug 12, 2026</b>. We'll connect it automatically.</div>
      </div>
      <div><label className="field-label">Or paste an invite code (optional)</label><input className="input" placeholder="e.g. STA-7HX2J9" style={{ fontFamily: 'var(--font-mono)' }}/></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: 'var(--md-surface-2)' }}>
        <Icon name="message" size={16} color="var(--md-primary)"/>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Don't have a code or trip yet? <a href="#" style={{ color: 'var(--md-primary)' }}>Message Gyasi</a> and she'll get you started.</div>
      </div>
    </OnboardingShell>
  );
}

// 2.1.14 — Onboarding Complete
function C2114_OnboardingComplete() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <div style={{ width: 96, height: 96, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: 'var(--md-shadow-2)' }}>
            <Icon name="check" size={48} stroke={2.5}/>
          </div>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>YOU'RE ALL SET</span>
          <h1 className="t-display-s" style={{ margin: '4px 0 6px' }}>Welcome to the portal, Jordan.</h1>
          <p className="t-body-l" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>Your profile, preferences, household, and existing trip with Sandals are all linked up.</p>

          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { i: 'plane', t: 'View your upcoming trip', s: 'Sandals · Aug 12' },
              { i: 'search', t: 'Explore the search', s: '148 Caribbean trips' },
              { i: 'message', t: 'Message Gyasi', s: 'Reply usually < 2h' },
            ].map((a, i) => (
              <div key={a.t} className="card" style={{ padding: 14, background: i === 0 ? 'var(--md-primary-container)' : 'var(--md-surface-1)', color: i === 0 ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)', border: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
                <Icon name={a.i} size={18}/>
                <div className="t-title-s" style={{ marginTop: 8 }}>{a.t}</div>
                <div className="t-body-s" style={{ opacity: 0.8 }}>{a.s}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-text">Fine-tune notifications →</button>
            <button className="btn btn-filled btn-lg">Continue to my dashboard <Icon name="arrow_right" size={14}/></button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  C211_Login, C212_Registration, C213_EmailVerification, C214_ForgotPassword, C215_ResetPassword,
  C216_MFASetup, C217_MFAChallenge, C218_LinkAccount, C219_Welcome, C2110_ProfileCompletion,
  C2111_PreferencesCapture, C2112_Companions, C2113_ConnectAgent, C2114_OnboardingComplete,
});
