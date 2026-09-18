/* global React, Icon, IOSDevice */
// Client · 2.5m Mobile · Account & Profile — 11 screens.
// Mobile-native interpretation of the 2.5 desktop artboards in client-account.jsx.
//
// Patterns, per Screen-Inventory §4.4 (lines 1791-1801, verbatim — most of §2.5 is Pattern
// A, the plain form, NOT B): 2.5.1 **D variant** ("Mobile: list of tiles. Tablet/web: grid
// of tiles") · 2.5.2 **A** · 2.5.3 **A** (same chip behaviour as 2.1.11) · 2.5.4 **B**
// (thumbnail grid on tablet/web) · 2.5.5 **J** ("Mobile uses native camera; web is file
// picker only") · 2.5.6 **A** (matrix form — "Mobile: stacked toggles per category") ·
// 2.5.7 **A** · 2.5.8 **A** · 2.5.9 **A** · 2.5.10 **J** (destructive confirmation) ·
// 2.5.11 **I + B** (FAQ list). The recurring translation moves are the same three that
// client-trip-mobile.jsx records: right rails and 2-up grids become stacked cards, the
// 4-column tile grid collapses to a single-column settings list, and the tab bar is a
// SIBLING of the scroll rather than an overlay.
//
// Account is a TAB, not a pushed route — 2.5.1 is the tab root and every other screen in
// this section is pushed on top of it, so only 2.5m.1 carries MClientTabs. The rest carry
// a back bar. That is why the desktop `tab="me"` chrome does not translate one-for-one.
//
// DELIBERATE DEPARTURES from the desktop artboards. Each one is a thing the desktop frame
// draws that the platform cannot currently honour, so drawing it on mobile too would just
// double the promise. Recorded here in the same idiom as client-trip-mobile.jsx's list, and
// mirrored into .claude/skills/sync-design-handoff/SKILL.md under "Known upstream deltas".
//
//   1. NO OCR, and only TWO capture fields on 2.5.5. The desktop frame pre-fills "Number
//      (OCR)", "Expiry" and "Name (OCR)" from a passport scan. Three separate problems:
//        · No OCR service exists anywhere in the stack and none is in the BRD, so nothing
//          can pre-fill anything. What remains is captured by hand and labelled that way.
//        · The NUMBER is not collected at all. `supabase/functions/onboarding-profile` makes
//          this call explicitly and records it (September 2026): Data-Model §18.2 requires
//          column-level encryption under a backend-only key for
//          `document_number_encrypted`, "and nothing implements that yet — there is no
//          crypto helper in _shared/ and no key management". Drawing the field would invite
//          the next builder to collect a passport number into an unencrypted column.
//        · "Name" has no column on `travel_document` at all, and the holder's name already
//          lives on `client`/`companion`. Dropped for the same reason departure 5 declines
//          pronouns — a field with no column is a promise the schema cannot keep.
//      What is left is `expires_on` and `issuing_country`, which is exactly what
//      onboarding-profile collects, and which is what actually drives expiry reminders and
//      supplier verification.
//   2. NO backup codes on 2.5.7. `web/app/(auth)/mfa/setup/actions.ts` says it outright:
//      "Supabase has no backup-code factor, and a home-grown one could not" be trusted.
//      "3 backup codes remaining" is undeliverable. Also dropped: "On · Authy", which names
//      a vendor we do not integrate — the factor is TOTP and any authenticator app works.
//   3. NO Facebook on 2.5.8. `auth_provider` is ENUM ('email','google','apple'). Facebook
//      is not a provider we have, and "available" implied it was one call away.
//   4. NO "Member ID · STA-5839" on 2.5.1. There is no member-id column on `client` or
//      anywhere else, and inventing a customer number is a support burden, not a feature.
//   5. NO pronouns field on 2.5.2. `pronouns` exists on `agent` (Data-Model §7, Agent
//      Domain), not on `client`. Adding it is a Data-Model change and CLAUDE.md requires the
//      doc to move first — so it is left out here rather than drawn as though it exists.
//   6. Card and payment surfaces are handled THREE different ways, deliberately, because
//      §2.4 is unbuilt and the right treatment differs by screen:
//        · 2.5.1's "Payment methods" row and 2.5.6's payment/card notification category
//          render DISABLED with "Coming with the next release" — they are destinations and
//          switches, and a dead one should say so. This matches the BUILT web app, where
//          `web/app/(client)/dashboard/content.ts` carries `authorizeCardComingSoon` and the
//          dashboard CTA is disabled. NOTE it does NOT match the §2.2 ARTBOARD, which under
//          "Kept deliberately" still draws a live "Authorize a card · $4,180 due" CTA. The
//          artboard is the one that is out of step with the shipped app; flagged for the
//          designer rather than copied here.
//        · 2.5.9's danger card DROPS the desktop's "cards revoked" line outright rather than
//          disabling it — it is one clause inside a paragraph, not an affordance, and a
//          greyed-out clause mid-sentence is unreadable.
//        · 2.5.10 states card revocation as a CONSEQUENCE of closure ("Any card you have
//          saved stops being usable"), which is true whether or not §2.4 has shipped.
//   7. Avatars are initials, never stock faces. `web/lib/images.ts` has no avatar entries at
//      all — every staImg('avatar*') in the desktop frames is an Unsplash portrait of a
//      stranger. The client's own initials come from their name; platform_user.avatar_url
//      fills the circle once they upload one.
//   8. "Encrypted at rest" on 2.5.4 becomes "Stored encrypted, and only you and Gyasi can
//      open them" — a claim about the FILE in Storage, which is encrypted at rest and
//      reachable only through the audited `trip-document-url` signer. It deliberately does
//      NOT lean on `travel_document.document_number_encrypted`: that column is not encrypted
//      by anything today (see departure 1), so citing it would be the exact false-assurance
//      this rewrite exists to remove. It also says WHO can open the file, which is the
//      question a traveler is actually asking.
//   9. NO location and NO "Trusted" chip on 2.5.7's sessions. `auth.sessions` holds an `ip`
//      and nothing resolves it to a place; `session.ip_country` has no writer. And the
//      platform cannot know a session is suspicious — the desktop frame's "Atlanta, GA ·
//      suspicious?" has a question mark in it, which is the design telling on itself. Same
//      lesson as §2.2.8's carrier narration: say what is true, say who is on it, stop.
//      "Trusted" is likewise a claim; what it means is "has a current session".
//  10. NO tracking toggles on 2.5.9. The desktop frame draws Analytics and Marketing
//      switches. There is no analytics script, tag manager or advertising pixel anywhere in
//      web/ — and web/content/public/legal/cookies.ts already states in writing that we run
//      none. Three switches over nothing is a control that lies, and a weaker privacy story
//      than the sentence that replaced them.
//  11. 2.5.10 is FULL-SCREEN, not an MSheet. A sheet's grabber means "swipe this away",
//      which is the wrong affordance for an irreversible outcome plus a text field the
//      keyboard covers. 2.5.5 stays a sheet because it is cancellable and reversible.
//  12. 2.5.10 confirms by TYPING THE EMAIL, not by re-entering a password. `auth_provider`
//      is ENUM ('email','google','apple'), so a Google or Apple account has no password and
//      the desktop frame's password field is a wall those accounts cannot pass. The server
//      pairs the typed address with a recent-auth check. 2.5.7's password card carries a
//      drawn VARIANT for the same reason.
//  13. NO master toggle on 2.5.6. Screen-Inventory §2.5.6 lists one under Primary elements;
//      neither the desktop frame nor this one draws it. A single switch that silences every
//      category is at odds with the same screen's promise that trip-critical alerts still
//      reach you — it would either lie or need an exception nobody has specified. Recorded
//      as a gap, not resolved.
//  14. 2.5.11's FAQ list SUBSTITUTES two rows rather than dropping them. The desktop's "How
//      does payment authorization work?" and "Can I revoke a card?" both answer questions
//      about §2.4, which nobody can reach yet; an FAQ answering a question about an
//      unreachable screen is worse than no FAQ. They are replaced by two that are true today
//      ("What if something goes wrong while I am away?", "Can I get a PDF of my itinerary?").
//      Put the card questions back with §2.4.
//  15. NO "Email platform support" button on 2.5.11. There is no `support@` mailbox anywhere
//      in the repo: the app configures exactly one outbound address, `env.inquiryEmail`,
//      which is the "Message Gyasi without an account" destination and is deliberately null
//      when unset so nothing invents one. Story-Tail is one advisor; a second support tier
//      routing somewhere other than Gyasi does not exist, and a button offering it promises
//      a queue nobody staffs.
//  16. 2.5.4's "Add a document" is DISABLED with a reason. `trip-document` is the only insert
//      into `document` anywhere and it hard-requires a `tripId`, keying the object under
//      `trips/<tripId>/`. The MODEL is ready — `document.trip_id` is nullable and both read
//      paths handle a trip-less row — but the WRITE door is trip-only, so an account-level
//      passport cannot be created from anywhere. A trip picker is not the fix: the
//      just-onboarded traveler this screen serves may have no trip to pick, and filing their
//      passport under an arbitrary trip also drops it into that trip's §2.2.6 library.
//
// A NOTE ON DOC PRECEDENCE, because several of the above depart from the Screen Inventory
// rather than merely from the artboard — 9 and 13 especially, and 1 in part. CLAUDE.md's
// hierarchy puts the Screen Inventory above the Design System and says an intentional
// divergence should move the DOC first. These are recorded here because the artboard is
// where they were discovered, but **`docs/Screen-Inventory.md` §2.5.6, §2.6.1 and §2.5.5
// still need amending to match** before the built screens land. This file is not authority
// to skip that step.
//
// GLYPH GAP — sequence this BEFORE any §2.5 screen, on either stack. It is the classic
// discover-it-mid-screen stall, and the mobile half is real drawing work.
//
// Counts below are mechanical — every `Icon name=` and `icon:` in the two mobile files,
// diffed against each icon set. 24 distinct glyphs are used across §2.5m and §2.6m.
//
//   shared/icons.jsx (this file's set) — covers all 24. It has no `camera`, which is why
//     both this frame and the desktop one fall back to a 📷 emoji on 2.5.5 rather than
//     drawing one; a real camera glyph is still owed before 2.5.5 is built.
//   web/components/ui/icon-paths.ts — missing exactly three: `briefcase`, `link`, `lock`
//     (plus `camera`, once it exists). Copy them verbatim from shared/icons.jsx, per that
//     file's own instruction not to draw new glyphs in it.
//   StoryTailGlyph.kt — the hard one, and much bigger than it looks. Mobile has NO Material
//     icons; every mark is a hand-drawn Compose Path and there are exactly ten (PLANE, CARD,
//     MESSAGE, HOME, SEARCH, USER, PASSPORT, ARROW_LEFT, SUN, SHIP). These two sections need
//     **17** more drawn:
//       §2.5m (15): bell, briefcase, chevron_down, chevron_right, close, download, heart,
//                   link, lock, more_vert, phone, question, shield, upload, warning
//       §2.6m  (+3): attach, send (download is shared with §2.5m)
//     Plus camera if 2.5.5's capture button is ever to stop being an emoji. That is a
//     substantial drawing task and it blocks the first §2.5 screen on Android/iOS — do it as
//     a piece of work in its own right, not mid-screen.

// ──────────────────────────────────────────────────────────────────────
// Shells
// ──────────────────────────────────────────────────────────────────────

function MFrame({ dark = false, children, footer, scrollable = true, padded = false }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: scrollable ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', padding: padded ? '14px 16px 8px' : 0 }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

// Four tabs, per the prototype's StaMobileTabs. Identical to client-trip-mobile.jsx by
// design — the bar is one component in the built app and must not drift between artboards.
const M_TABS = [
  { id: 'trips', icon: 'home', label: 'Trips' },
  { id: 'discover', icon: 'search', label: 'Discover' },
  { id: 'msg', icon: 'message', label: 'Messages' },
  { id: 'me', icon: 'user', label: 'Account' },
];

function MClientTabs({ active = 'me' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {M_TABS.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56 }}>
            <span style={{
              width: 56, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: on ? 'var(--md-secondary-container)' : 'transparent',
              color: on ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={t.icon} size={19}/>
            </span>
            <span style={{ font: '600 10px/1.2 var(--font-sans)', color: on ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// 56px sticky bar with a back affordance. Every 2.5 screen except the tab root is pushed.
function MAccountTopBar({ title, trailing }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5, height: 56,
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 6px',
      background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)',
    }}>
      <button className="btn-icon" aria-label="Back" style={{ width: 40, height: 40, color: 'var(--md-on-surface)' }}>
        <Icon name="arrow_left" size={19}/>
      </button>
      <div className="t-title-s" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {trailing}
    </div>
  );
}

// Initials, never a stock face — see departure 7. `tone` lets the advisor and the traveler
// sit next to each other without reading as the same person.
//
// `surface` is spelled out rather than run through the `${tone}-container` template: the
// palette has --md-surface and --md-surface-1..5, but NO --md-surface-container. Building
// that name produced an undefined custom property, which CSS drops silently — so the circle
// rendered with no fill at all on the section's own tab root. Only the M3 accent roles have
// a `-container` pair; a template over tone names cannot assume one exists.
const M_AVATAR_TONES = {
  surface: ['var(--md-surface)', 'var(--md-on-surface)'],
  primary: ['var(--md-primary-container)', 'var(--md-on-primary-container)'],
  secondary: ['var(--md-secondary-container)', 'var(--md-on-secondary-container)'],
  tertiary: ['var(--md-tertiary-container)', 'var(--md-on-tertiary-container)'],
};

function MInitialsAvatar({ initials = 'JH', size = 64, tone = 'primary' }) {
  const [bg, fg] = M_AVATAR_TONES[tone] || M_AVATAR_TONES.primary;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: `700 ${Math.round(size * 0.36)}px/1 var(--font-sans)`, letterSpacing: 0.4,
    }}>{initials}</span>
  );
}

// The settings row. 2.5.1 is nine of these and every sub-screen header echoes it, so it is
// the one primitive in this section worth naming — the web build should extract the same.
function MSettingsRow({ icon, title, sub, first = false, danger = false, disabled = false, reason }) {
  return (
    <div style={{
      padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
      borderTop: first ? 0 : '1px solid var(--md-outline-variant)',
      opacity: disabled ? 0.55 : 1,
    }}>
      <span style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: danger ? 'var(--md-error-container)' : 'var(--md-secondary-container)',
        color: danger ? 'var(--md-on-error-container)' : 'var(--md-on-secondary-container)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name={icon} size={17}/></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-title-s" style={{ color: danger ? 'var(--md-error)' : 'var(--md-on-surface)' }}>{title}</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {disabled ? reason : sub}
        </div>
      </div>
      {!disabled && <Icon name="chevron_right" size={16} color="var(--md-on-surface-variant)"/>}
    </div>
  );
}

// A save bar that sits below the scroll, never over it — the structural rule that kept the
// native §2.0 build clear of the sticky-CTA/footer overlap the web side shipped.
function MSaveBar({ primary = 'Save', secondary = 'Cancel' }) {
  return (
    <div style={{
      padding: '10px 16px 20px', display: 'flex', gap: 10,
      background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)',
    }}>
      <button className="btn btn-text" style={{ flex: '0 0 auto' }}>{secondary}</button>
      <button className="btn btn-filled" style={{ flex: 1 }}>{primary}</button>
    </div>
  );
}

function MField({ label, value, placeholder, hint, mono = false, type }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="field-label">{label}</label>
      <input className="input" type={type} defaultValue={value} placeholder={placeholder}
        style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}/>
      {hint && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function MToggle({ on, locked = false }) {
  return (
    <span style={{
      width: 40, height: 24, borderRadius: 999, flexShrink: 0, padding: 2, position: 'relative',
      background: on ? 'var(--md-primary)' : 'var(--md-surface-3)', opacity: locked ? 0.5 : 1,
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 20, height: 20, borderRadius: 999, background: '#FFF', transition: 'left 120ms' }}/>
    </span>
  );
}

function MSectionLabel({ children }) {
  return (
    <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', margin: '18px 0 8px', letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}

// A bottom sheet. Used by 2.5.5 ONLY. Both 2.5.5 and 2.5.10 are desktop modals, but only
// 2.5.5 becomes a sheet here — a sheet's grabber reads as "swipe this away", which is right
// for a cancellable upload and wrong for an irreversible closure with a text field the
// keyboard covers. 2.5.10 is full-screen instead; see departure 11.
function MSheet({ children, height = '78%' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,20,34,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{
        width: '100%', height, background: 'var(--md-surface-1)',
        borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--md-outline-variant)' }}/>
        </div>
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.1 — Account overview  (the Account TAB root)
// ──────────────────────────────────────────────────────────────────────

function M251_AccountOverview({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MClientTabs active="me"/>}>
      <div style={{ padding: '18px 16px 20px', display: 'flex', gap: 14, alignItems: 'center', background: 'linear-gradient(130deg, var(--md-primary-container), var(--md-secondary-container))' }}>
        <MInitialsAvatar initials="JH" size={64} tone="surface"/>
        <div style={{ flex: 1, minWidth: 0, color: 'var(--md-on-primary-container)' }}>
          <div className="t-headline" style={{ margin: 0, fontSize: 21 }}>Jordan Hayes</div>
          <div className="t-body-s" style={{ opacity: 0.85, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            jordan.hayes@example.com
          </div>
          <div className="t-body-s" style={{ opacity: 0.85 }}>Traveling with Gyasi since Mar 2024</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 20px' }}>
        <MSectionLabel>YOU</MSectionLabel>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MSettingsRow first icon="user" title="Personal info" sub="Name, email, phone, address"/>
          <MSettingsRow icon="heart" title="Travel preferences" sub="Style, dietary, loyalty"/>
          {/* 4, not 5 — 2.5m.4 lists exactly four documents. A count on a hub row that the
              destination screen contradicts is the cheapest possible bug to ship. */}
          <MSettingsRow icon="passport" title="Travel documents" sub="4 files · 1 expiring soon"/>
        </div>

        <MSectionLabel>APP</MSectionLabel>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MSettingsRow first icon="bell" title="Notifications" sub="Email · push · SMS"/>
          <MSettingsRow icon="shield" title="Security" sub="Password and two-factor"/>
          <MSettingsRow icon="link" title="Connected accounts" sub="Google linked"/>
          {/* §2.4 is unbuilt. Disabled with the reason, per the §2.2 phase-leak rule. */}
          <MSettingsRow icon="card" title="Payment methods" disabled reason="Coming with the next release"/>
        </div>

        <MSectionLabel>SUPPORT</MSectionLabel>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MSettingsRow first icon="question" title="Help & support" sub="FAQs, or message Gyasi"/>
          <MSettingsRow icon="lock" title="Privacy & data" sub="Download a copy of your data"/>
        </div>

        <button className="btn btn-outlined" style={{ width: '100%', marginTop: 18 }}>Sign out</button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 12 }}>
          Story-Tail Adventures · v1.0
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.2 — Personal info
// ──────────────────────────────────────────────────────────────────────

function M252_PersonalInfo({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MSaveBar/>}>
      <MAccountTopBar title="Personal info"/>
      <div style={{ padding: '16px 16px 20px' }}>
        <MField label="First name" value="Jordan"/>
        <MField label="Last name" value="Hayes"/>
        <MField label="Preferred name" value="Jordan" hint="What Gyasi calls you."/>
        <MField label="Email" value="jordan.hayes@example.com" hint="Changing this sends a verification link to the new address. Your old one keeps working until you confirm."/>
        <MField label="Phone" value="+1 (305) 555-0184"/>
        <MField label="Date of birth" value="04 / 22 / 1992" hint="Airlines and cruise lines need this exactly as it appears on your passport."/>

        <MSectionLabel>MAILING ADDRESS</MSectionLabel>
        <MField label="Street" value="1240 Brickell Bay Dr"/>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          <MField label="City" value="Miami"/>
          <MField label="State" value="FL"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <MField label="ZIP" value="33131"/>
          <MField label="Country" value="United States"/>
        </div>

        <MSectionLabel>EMERGENCY CONTACT</MSectionLabel>
        <div className="card" style={{ padding: 16 }}>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 12px' }}>
            Only used if something goes wrong while you are away.
          </p>
          <MField label="Name" value="Sam Hayes"/>
          <MField label="Phone" value="+1 (305) 555-0186"/>
          <MField label="Relationship" value="Spouse"/>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.3 — Travel preferences
// ──────────────────────────────────────────────────────────────────────

function M253_PreferencesEdit({ dark = false }) {
  const groups = [
    { t: 'Where you like to go', opts: ['Caribbean ✓', 'Bahamas ✓', 'Greece', 'Mexico', 'Italy', 'Iceland', 'Japan'] },
    { t: 'How you like to travel', opts: ['Resort ✓', 'Cruise ✓', 'Adventure', 'Family', 'Honeymoon ✓', 'Group'] },
    { t: 'Dietary', opts: ['No restrictions', 'Vegetarian', 'Pescatarian ✓', 'Gluten-free', 'Halal'] },
    { t: 'Accessibility', opts: ['None', 'Mobility-friendly', 'Quiet rooms', 'Service animal'] },
  ];
  return (
    <MFrame dark={dark} footer={<MSaveBar/>}>
      <MAccountTopBar title="Travel preferences"/>
      <div style={{ padding: '16px 16px 20px' }}>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>
          None of this is required. It just saves Gyasi asking you the same questions twice.
        </p>
        {groups.map((g) => (
          <div key={g.t} style={{ marginBottom: 18 }}>
            <div className="t-title-s" style={{ marginBottom: 8 }}>{g.t}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.opts.map((o) => (
                <span key={o} className={`chip ${o.includes('✓') ? 'chip-filter is-on' : ''}`} style={{ height: 32 }}>{o}</span>
              ))}
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Loyalty programs</label>
          <textarea className="input" style={{ height: 76, padding: 12, resize: 'none' }} defaultValue={'AAdvantage 4ZE82Q (Platinum)\nIHG Rewards 92214'}/>
        </div>
        <div>
          <label className="field-label">Trips you have loved</label>
          <textarea className="input" style={{ height: 88, padding: 12, resize: 'none' }} defaultValue="Beaches T&C 2024 — the kids loved it. Symphony EC 2025 — would do again."/>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.4 — Travel documents
// ──────────────────────────────────────────────────────────────────────

function M254_TravelDocs({ dark = false }) {
  const groups = [
    { t: 'Passports', docs: [
      { n: 'passport-jordan.jpg', s: 'Expires Aug 2029 · USA', kind: 'IMG' },
      { n: 'passport-sam.jpg', s: 'Expires Feb 2027 · USA', kind: 'IMG', warn: true },
    ] },
    { t: 'Visas & ESTA', docs: [{ n: 'esta-approval-jordan.pdf', s: 'Valid through Mar 2028', kind: 'PDF' }] },
    { t: 'Insurance', docs: [{ n: 'allianz-policy-987124.pdf', s: 'Sandals trip · expires Aug 2026', kind: 'PDF' }] },
  ];
  return (
    <MFrame dark={dark} footer={
      /* Disabled, with the reason — departure 16. `trip-document` is the ONLY insert into
         `document` anywhere in the repo and it hard-requires a `tripId`, keying the object
         under `trips/<tripId>/`. `document.trip_id` is nullable and both read paths already
         handle a trip-less row, so the model is ready; the write door is not. A passport that
         belongs to a person rather than a trip cannot be created from anywhere today, and a
         trip picker is not the fix — the just-onboarded traveler this screen serves may have
         no trip to pick. Same treatment §2.2.6 gives its own upload button. */
      <div style={{ padding: '10px 16px 20px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
        <button className="btn btn-orange" style={{ width: '100%', opacity: 0.45 }} aria-disabled="true">
          <Icon name="upload" size={15}/> Add a document
        </button>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 8 }}>
          Coming with the next release — for now, add documents from a trip.
        </div>
      </div>
    }>
      <MAccountTopBar title="Travel documents"/>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="card" style={{ padding: 14, background: 'var(--md-warning-container)', color: 'var(--md-on-surface)', border: 0, marginBottom: 16, display: 'flex', gap: 10 }}>
          <Icon name="warning" size={18}/>
          <div className="t-body-s">
            <b>Worth sorting before August.</b> Sam’s passport expires within six months of your
            return, and a few countries turn you away for that.
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.t} style={{ marginBottom: 18 }}>
            <div className="t-title-s" style={{ marginBottom: 8 }}>{g.t}</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {g.docs.map((d, i) => (
                <div key={d.n} style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
                  <span style={{
                    width: 38, height: 46, borderRadius: 5, flexShrink: 0,
                    background: d.kind === 'PDF' ? 'var(--brand-burgundy)' : 'var(--brand-orange)',
                    color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    font: '800 9px/1 var(--font-sans)',
                  }}>{d.kind}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-title-s" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</div>
                    <div className="t-body-s" style={{ color: d.warn ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}>
                      {d.warn && '⚠ '}{d.s}
                    </div>
                  </div>
                  <button className="btn-icon" aria-label="More"><Icon name="more_vert" size={15}/></button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Departure 8 — says who can open the file, which is the real question. */}
        <div className="card" style={{ padding: 14, display: 'flex', gap: 10, background: 'var(--md-surface-2)' }}>
          <Icon name="lock" size={17} color="var(--md-on-surface-variant)"/>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
            Stored encrypted, and only you and Gyasi can open them. Every time one is opened,
            it is written down.
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.5 — Document upload  (camera-first; no OCR — departure 1)
// ──────────────────────────────────────────────────────────────────────

function M255_DocUpload({ dark = false }) {
  return (
    <MFrame dark={dark} scrollable={false}>
      <MAccountTopBar title="Travel documents"/>
      <MSheet height="88%">
        <div style={{ padding: '4px 18px 0', display: 'flex', alignItems: 'center' }}>
          <h2 className="t-title-l" style={{ margin: 0, flex: 1 }}>Add a document</h2>
          <button className="btn-icon" aria-label="Close"><Icon name="close" size={18}/></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 0' }}>
          <label className="field-label">What is it?</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {['Passport ✓', 'Visa', 'Insurance', 'Boarding pass', 'Confirmation', 'Other'].map((t) => (
              <span key={t} className={`chip ${t.includes('✓') ? 'chip-filter is-on' : ''}`} style={{ height: 32 }}>{t}</span>
            ))}
          </div>

          {/* Camera first on a phone — this is the mobile-only path, not a reflow.
              GLYPH GAP: there is no `camera` in shared/icons.jsx (nor in
              web/components/ui/icon-paths.ts, nor among StoryTailGlyph.kt's ten marks). The
              desktop frame papers over it with a 📷 emoji and so does this one. A real
              camera glyph is a prerequisite for building 2.5.5 on either stack — draw it
              before the screen, not during it. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn btn-filled" style={{ height: 92, flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">📷</span> Take a photo
            </button>
            <button className="btn btn-outlined" style={{ height: 92, flexDirection: 'column', gap: 6 }}>
              <Icon name="upload" size={24}/> Choose a file
            </button>
          </div>
          {/* These constraints are the REAL ones, from supabase/functions/_shared/trip.ts:
              ALLOWED_MIME_TYPES = pdf, jpeg, png, heic, webp and MAX_UPLOAD_BYTES =
              52_428_800 (50 MiB, matching the bucket's file_size_limit). The desktop frame
              says "JPG, PNG, PDF · up to 10 MB", which is wrong twice — and HEIC is what an
              iPhone camera produces by default, so omitting it tells the exact user this
              camera-first screen is built for that their photos will be rejected. */}
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 8 }}>
            Photo or PDF · up to 50 MB
          </div>

          <div className="card" style={{ padding: 14, marginTop: 16, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
            <div className="t-label-s">READY TO SAVE · jordan-passport.jpg</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 68, height: 86, borderRadius: 8, background: 'var(--brand-burgundy)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="passport" size={30}/>
              </div>
              <div className="t-body-s" style={{ flex: 1, opacity: 0.9 }}>
                Add the details below and Gyasi will have what he needs for bookings. You can
                leave them blank and come back to it.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {/* Two fields, not four — see departure 1. The passport NUMBER is deliberately
                not collected until column-level encryption exists (onboarding-profile makes
                and records the same call), and "Name" has no travel_document column. */}
            <MField label="Expires on" value="" placeholder="MM / DD / YYYY"/>
            <MField label="Issuing country" value="" placeholder="United States"/>
          </div>
        </div>

        <MSaveBar primary="Save document" secondary="Cancel"/>
      </MSheet>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.6 — Notifications  (matrix → one card per category)
// ──────────────────────────────────────────────────────────────────────

function M256_Notifications({ dark = false }) {
  // The desktop table is 8 rows x 3 channels. A 3-column table does not survive 375px, so
  // each category becomes a card with its three channels as rows.
  const groups = [
    { l: 'Trip status updates', sub: 'Booked, changed, cancelled', e: true, p: true, s: false },
    { l: 'Itinerary changes', sub: 'Times, places, anything Gyasi edits', e: true, p: true, s: false },
    { l: 'Messages from Gyasi', sub: 'New replies in your threads', e: true, p: true, s: false },
    { l: 'Pre-trip reminders', sub: 'Two weeks out, and the night before', e: true, p: true, s: false },
    { l: 'After you get back', sub: 'A note from Gyasi, and a place to write', e: true, p: false, s: false },
    { l: 'Deals and ideas', sub: 'Only when something is genuinely good', e: false, p: false, s: false },
  ];
  return (
    <MFrame dark={dark} footer={<MSaveBar/>}>
      <MAccountTopBar title="Notifications"/>
      <div style={{ padding: '16px 16px 20px' }}>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>
          Pick how you want to hear from us. Anything urgent about a trip you are already on
          will still reach you.
        </p>

        {groups.map((g) => (
          <div key={g.l} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ padding: '13px 16px 10px' }}>
              <div className="t-title-s">{g.l}</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>{g.sub}</div>
            </div>
            {[{ k: 'Email', on: g.e }, { k: 'Push', on: g.p }, { k: 'Text message', on: g.s }].map((c) => (
              <div key={c.k} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--md-outline-variant)' }}>
                <span style={{ flex: 1, font: '500 13px/1.3 var(--font-sans)' }}>{c.k}</span>
                <MToggle on={c.on}/>
              </div>
            ))}
          </div>
        ))}

        {/* §2.4 is unbuilt — the category exists in the model but has nothing to fire on. */}
        <div className="card" style={{ padding: '13px 16px', opacity: 0.55, marginBottom: 10 }}>
          <div className="t-title-s">Payment and card activity</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
            Coming with the next release
          </div>
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--md-surface-2)' }}>
          <div className="t-title-s">Quiet hours</div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 12px' }}>
            Nothing but genuine trip emergencies between these times.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MField label="From" value="10:00 PM"/>
            <MField label="Until" value="7:00 AM"/>
          </div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.7 — Security  (no backup codes, no vendor name — departure 2)
// ──────────────────────────────────────────────────────────────────────

function M257_Security({ dark = false }) {
  // No location, and no "Trusted" / "suspicious?" chip — departure 9. `auth.sessions` has an
  // `ip` and nothing resolves it to a place; `session.ip_country` has no writer. And the
  // platform cannot know a session is suspicious — the desktop frame's "Atlanta, GA ·
  // suspicious?" question mark is the design telling on itself. Device, when it was last
  // used, which one you are holding, and a way out. That is all we actually know.
  const sessions = [
    { d: 'iPhone · Safari', last: 'Active now', icon: 'phone', here: true },
    { d: 'Mac · Chrome', last: 'Last used 2 hours ago', icon: 'briefcase' },
    { d: 'Android · Chrome', last: 'Last used 28 March', icon: 'phone' },
  ];
  return (
    <MFrame dark={dark}>
      <MAccountTopBar title="Security"/>
      <div style={{ padding: '16px 16px 24px' }}>
        {/* The password card is CONDITIONAL on auth_provider = 'email' — the same OAuth hole
            departure 12 closes on 2.5.10, and it has to be closed here too. An account that
            signed up with Google or Apple has no password at all, so "Last changed 14 March"
            is a fabrication and "Change password" leads nowhere. The Google/Apple variant is
            drawn beneath it; a build renders one or the other, never both. */}
        <div className="card" style={{ padding: 16 }}>
          <div className="t-title-s">Password</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>Last changed 14 March 2024</div>
          <button className="btn btn-tonal" style={{ width: '100%', marginTop: 12 }}>Change password</button>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 12, borderStyle: 'dashed' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>
            VARIANT · auth_provider = google | apple
          </div>
          <div className="t-title-s" style={{ marginTop: 6 }}>How you sign in</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
            You sign in with Google, so there is no password here to change. Manage it in your
            Google account.
          </div>
          <button className="btn btn-outlined" style={{ width: '100%', marginTop: 12 }}>Connected accounts</button>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="t-title-s" style={{ flex: 1 }}>Two-factor authentication</div>
            <span className="chip-status booked">On</span>
          </div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>
            A six-digit code from your authenticator app, on top of your password.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-outlined" style={{ flex: 1 }}>Replace device</button>
            <button className="btn btn-text" style={{ flex: 1 }}>Turn off</button>
          </div>
        </div>

        <MSectionLabel>WHERE YOU ARE SIGNED IN</MSectionLabel>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {sessions.map((s, i) => (
            <div key={s.d} style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
              <Icon name={s.icon} size={18} color="var(--md-on-surface-variant)"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s">{s.d}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{s.last}</div>
              </div>
              {s.here
                ? <span className="chip-status booked">This device</span>
                : <button className="btn btn-text btn-sm">Sign out</button>}
            </div>
          ))}
        </div>
        <button className="btn btn-outlined" style={{ width: '100%', marginTop: 12 }}>Sign out everywhere else</button>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 10 }}>
          Don’t recognise one of these? Sign it out, change your password, and tell Gyasi —
          he would rather hear about it early.
        </p>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.8 — Connected accounts  (Google + Apple only — departure 3)
// ──────────────────────────────────────────────────────────────────────

function M258_Connected({ dark = false }) {
  const providers = [
    { n: 'Google', sub: 'jordan.hayes@example.com', on: true },
    { n: 'Apple', sub: 'Not connected', on: false },
  ];
  return (
    <MFrame dark={dark}>
      <MAccountTopBar title="Connected accounts"/>
      <div style={{ padding: '16px 16px 24px' }}>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '0 0 16px' }}>
          Sign in faster by linking an account you already have. You can always use your
          email and password instead.
        </p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {providers.map((p, i) => (
            <div key={p.n} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--md-surface-3)', color: 'var(--md-on-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 15px/1 var(--font-sans)' }}>{p.n[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s">{p.n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sub}</div>
              </div>
              {p.on
                ? <button className="btn btn-outlined btn-sm">Unlink</button>
                : <button className="btn btn-tonal btn-sm">Link</button>}
            </div>
          ))}
        </div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 14 }}>
          Unlinking never deletes anything. Your trips, documents and messages stay exactly
          where they are.
        </p>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.9 — Privacy & data
// ──────────────────────────────────────────────────────────────────────

function M259_Privacy({ dark = false }) {
  return (
    <MFrame dark={dark}>
      <MAccountTopBar title="Privacy & data"/>
      <div style={{ padding: '16px 16px 24px' }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="download" size={18}/>
            <div className="t-title-s">Download your data</div>
          </div>
          {/* The document-access trail is NOT promised here. Every signature from
              trip-document-url writes an `audit_event` (document.url_signed), but
              audit_event is the AGENCY's table — §2.2 refused to give a client a policy on
              it, which is why 2.2.1's activity feed was dropped. Listing it in an export
              would promise data the client has no path to. Name only what the client can
              already read. */}
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '6px 0 0' }}>
            Your profile, your trips, your documents and your messages. It is yours; take a
            copy whenever you like.
          </p>
          <div className="card" style={{ padding: 12, background: 'var(--md-surface-2)', marginTop: 12 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>LAST EXPORT</div>
            <div className="t-body" style={{ marginTop: 2 }}>14 March 2024 · 14 MB · link expired</div>
          </div>
          <button className="btn btn-filled" style={{ width: '100%', marginTop: 12 }}>Request an export</button>
        </div>

        {/* Departure 10 — the desktop frame draws Analytics and Marketing toggles. There is
            no analytics script, tag manager or advertising pixel anywhere in web/, so those
            switches would control nothing, and web/content/public/legal/cookies.ts already
            tells people in writing that we run none. A toggle over nothing is a worse
            privacy story than the sentence, not a better one. */}
        <MSectionLabel>TRACKING</MSectionLabel>
        <div className="card" style={{ padding: 16, display: 'flex', gap: 12 }}>
          <Icon name="shield" size={18} color="var(--md-on-surface-variant)"/>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
            We don’t run analytics or advertising trackers. The only cookies here are the ones
            that keep you signed in, and you can clear those any time in your browser.
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 18, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', border: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={18}/>
            <div className="t-title-s">Close your account</div>
          </div>
          <p className="t-body-s" style={{ opacity: 0.88, margin: '6px 0 0' }}>
            Your trips are archived and your personal details are anonymized. Some records
            have to be kept for tax reasons — we will show you exactly which before you
            confirm.
          </p>
          <button className="btn" style={{ width: '100%', marginTop: 12, background: 'var(--md-on-error-container)', color: 'var(--md-error-container)' }}>
            Close my account
          </button>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.10 — Account closure  (sheet; card revocation is a CONSEQUENCE — departure 6)
// ──────────────────────────────────────────────────────────────────────

function M2510_Closure({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <div style={{ padding: '10px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
        <button className="btn btn-danger" style={{ width: '100%' }}>Close my account</button>
        <button className="btn btn-text" style={{ width: '100%' }}>Keep my account</button>
      </div>
    }>
      {/* NOT a sheet — departure 11. MSheet carries a grabber, and a grabber means "swipe
          this away". That is the wrong affordance for a screen with an irreversible outcome
          and a text field the keyboard covers. Full-screen, with its own back and an
          explicit Keep. 2.5.5 stays a sheet because it is cancellable and reversible. */}
      <MAccountTopBar title="Close account"/>
      <div style={{ padding: '18px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="warning" size={20}/>
          </span>
          <h2 className="t-title-l" style={{ margin: 0 }}>Close your account?</h2>
        </div>

        <div className="card" style={{ padding: 14, background: 'var(--md-surface-2)' }}>
          <div className="t-label-s" style={{ color: 'var(--md-on-surface-variant)' }}>WHAT HAPPENS</div>
          {/* NO "within 30 days". Data-Model §18.5 describes a 30-day anonymization window,
              but NOTHING implements it — there is no closure scrubber, no pg_cron job and no
              Edge Function anywhere under supabase/. A specific window on a legal screen
              would be the only unbacked retention promise left in this section, and it is
              exactly the class of claim PUBLIC_CLAIMS_MODE=strict exists to stop. State the
              intent; put the number back the day the scrubber ships. */}
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 12.5px/1.7 var(--font-sans)' }}>
            <li>Your 4 past trips are archived — ask for a final PDF first if you want one</li>
            <li>Any card you have saved stops being usable</li>
            <li>Your personal details are anonymized</li>
            <li>Booking and tax records are kept, because the law requires it</li>
          </ul>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
          <div className="t-body-s">
            If something went wrong, Gyasi would rather hear it than lose you.
            <b> Message him first</b> — this page will still be here afterwards.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label className="field-label">Anything you want to tell us? (optional)</label>
          <textarea className="input" style={{ height: 76, padding: 12, resize: 'none' }} placeholder="Only if you feel like it."/>
        </div>

        {/* Type-the-email, NOT a password — departure 12. `auth_provider` is
            ENUM ('email','google','apple'), so an account that signed up with Google or
            Apple has no password at all and a password field is a wall it cannot pass.
            Typing your own address works for every account shape. The server pairs this
            with a recent-auth check. */}
        <div style={{ marginTop: 14 }}>
          <MField
            label="Type your email address to confirm"
            value=""
            placeholder="jordan.hayes@example.com"
            hint="This is the address you sign in with."
          />
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.5m.11 — Help & support
// ──────────────────────────────────────────────────────────────────────

function M2511_Help({ dark = false }) {
  // The card-authorization questions are dropped until §2.4 ships — an FAQ that answers a
  // question about a screen nobody can reach is worse than no FAQ.
  const faqs = [
    'Do I pay you a planning fee?',
    'How do I add someone to a trip?',
    'Is my passport scan safe?',
    'Who is Inteletravel, and why do they appear on my booking?',
    'What if something goes wrong while I am away?',
    'Can I get a PDF of my itinerary?',
  ];
  return (
    <MFrame dark={dark}>
      <MAccountTopBar title="Help & support"/>
      <div style={{ padding: '16px 16px 24px' }}>
        <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--md-surface-2)', marginBottom: 16 }}>
          <Icon name="search" size={17} color="var(--md-on-surface-variant)"/>
          <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Search help…</span>
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <MInitialsAvatar initials="GS" size={40} tone="surface"/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Talk to Gyasi</div>
              {/* "Usually replies the same day" — matches §2.1/§2.2. The "< 2h" claim on the
                  public surface is unverified (web/content/public/proof.ts) and must not
                  spread here. */}
              <div className="t-body-s" style={{ opacity: 0.85 }}>Usually replies the same day</div>
            </div>
          </div>
          <p className="t-body-s" style={{ opacity: 0.88, margin: '10px 0 0' }}>
            Anything about your own trip is quickest this way.
          </p>
          <button className="btn btn-filled" style={{ width: '100%', marginTop: 12, background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>
            <Icon name="message" size={14}/> Message Gyasi
          </button>
        </div>

        <MSectionLabel>COMMON QUESTIONS</MSectionLabel>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {faqs.map((q, i) => (
            <div key={q} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderTop: i === 0 ? 0 : '1px solid var(--md-outline-variant)' }}>
              <span style={{ flex: 1, font: '600 13px/1.4 var(--font-sans)' }}>{q}</span>
              <Icon name="chevron_down" size={15} color="var(--md-on-surface-variant)"/>
            </div>
          ))}
        </div>

        {/* NO "Email platform support" — departure 15. There is no support@ mailbox anywhere:
            the app configures exactly one outbound address, `env.inquiryEmail`, which is the
            "Message Gyasi without an account" destination and is deliberately null when unset
            so nothing invents one. Story-Tail is one advisor; a second tier that routes
            somewhere other than Gyasi does not exist, and a button offering it promises a
            queue nobody staffs. Technical problems go to the same person — said plainly. */}
        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <div className="t-title-s">Something technical?</div>
          <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '4px 0 0' }}>
            Signing in, the app misbehaving, anything that is the software rather than the
            trip — send it to Gyasi too. He gets it to whoever needs it.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 20 }}>
          {['Privacy', 'Terms', 'Cookies'].map((l) => (
            <span key={l} className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', textDecoration: 'underline' }}>{l}</span>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  M251_AccountOverview, M252_PersonalInfo, M253_PreferencesEdit, M254_TravelDocs, M255_DocUpload,
  M256_Notifications, M257_Security, M258_Connected, M259_Privacy, M2510_Closure, M2511_Help,
});
