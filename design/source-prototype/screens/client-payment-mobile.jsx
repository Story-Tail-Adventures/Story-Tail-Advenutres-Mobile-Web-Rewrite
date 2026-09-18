/* global React, Icon, IOSDevice */
// Client · 2.4m Mobile · Payment & Card Authorization — 7 screens.
// Mobile-native interpretation of the 2.4 desktop artboards in client-payment.jsx.
//
// Patterns, per Screen-Inventory §4.4: 2.4.1 **B** (card grid on web, stacked rows on
// mobile) · 2.4.2 **A** · 2.4.3 **A** with a right rail that becomes a card ABOVE the form ·
// 2.4.4 **H** (full-screen success) · 2.4.5 **I** (timeline) · 2.4.6 **C** · 2.4.7 **J**
// (destructive confirmation). The three recurring translation moves are the ones
// client-trip-mobile.jsx records: right rails become cards in the scroll, multi-column grids
// collapse to one column, and any bottom bar is a SIBLING of the scroll rather than an
// overlay.
//
// §2.4 IS NOT A TAB ON MOBILE, and that is the one structural difference from the desktop
// frames, which all carry `tab="wallet"`. The mobile bar has four tabs — Trips · Discover ·
// Messages · Account — and Wallet is not one of them; it is rail-only on web, by the same
// 2026-09-06 decision that settled the bar. So every frame here is PUSHED from 2.5.1's
// "Payment methods" row and carries a back bar. None carries MClientTabs.
//
// DELIBERATE DEPARTURES from the desktop artboards. Each is a thing the desktop frame draws
// that the platform cannot honour, verified against the schema and the migrations rather
// than assumed, and each is recorded in docs/Screen-Inventory.md §2.4 as well.
//
//   1. THE CARD FIELDS ON 2.4.2 ARE A STRIPE-HOSTED SHEET, NOT OUR INPUTS. The desktop frame
//      draws the card number as an ordinary first-party `<input className="input">` with a
//      security-code input beside it, under a "Secured by Stripe · PCI DSS · SAQ A" badge.
//      Those two things cannot both be true. Receiving the number in any call to our own
//      backend is Tech-Recommendations §4.6's second rule verbatim and moves the platform
//      from SAQ A to SAQ D — $60K–$180K a year against a stack that runs at $50–150/month.
//      This is the ONE place CLAUDE.md's "visually faithful to the prototype" rule is
//      suspended, and the suspension is the point of the frame.
//   2. 2.4.2 IS DRAWN BUT NOT BUILT. payment_card.stripe_payment_method_id and
//      .stripe_customer_id are both NOT NULL, so no card row exists without a real
//      tokenization, and there is no Stripe account, key, SDK or function. 2.4m.1's "Add a
//      card" renders disabled with a reason. The frame exists so the shape is agreed before
//      the account does.
//   3. NO PER-USE NOTIFICATION PROMISE. The desktop 2.4.4 lists "Notifications · Email +
//      push on every use" and its consent copy says "you'll be notified". No dispatcher
//      exists on either stack — no transactional email, no push — and notification_preference
//      is read and written by nothing. That promise is also FROZEN into
//      card_authorization.consent_payload, which is NOT NULL precisely so wording cannot be
//      rewritten later. Cut until there is something to deliver it.
//   4. NO CSV EXPORT on 2.4.5. It is the one §2.4 surface that persists this data outside
//      the platform, where no revocation reaches it and no audit follows it, and a row dump
//      joined to payment_card would carry both Stripe tokens onto a device. Cut rather than
//      drawn-and-disabled: there is no export precedent in the repo to copy safely.
//   5. NO "FLAG AS UNFAMILIAR" on 2.4.6 — drawn, disabled, with the reason on screen.
//      Data-Model §9.4 declares card_use_event append-only ("no UPDATE, no DELETE") and in
//      the same table defines client_flag_status with three values that only UPDATEs can
//      produce. That contradiction is a ruling, not a screen decision.
//   6. NO RECEIPT DOWNLOAD on 2.4.6. card_use_event.receipt_document_id FKs into `document`,
//      but document_self_select's kind allowlist excludes 'receipt' on purpose
//      (20260907031255_trip_read_policies.sql): a supplier receipt shows what the agency
//      actually paid. Reversing that is a margin decision.
//   7. 2.4.7 REVOKES AN AUTHORIZATION, NOT A CARD. Setting payment_card.status='revoked'
//      locally leaves the PaymentMethod live in Stripe's vault while the screen says the card
//      is gone. The frame is retitled accordingly and the trip is named in the heading.
//   8. NO "WE'LL NOTIFY / Gyasi will receive an in-app alert" panel on 2.4.7 — same missing
//      dispatcher as departure 3. The revoke still writes its audit_event, so the record
//      exists even though the message does not.
//   9. GYASI IS HE/HIM. The desktop 2.4.7 says "She may request a different card". This is
//      the SECOND time the prototype has made this error — client-trip-mobile.jsx:19 records
//      catching it in C228_EmptyState — and `agent.pronouns` is 'he/him' in the seed. The
//      panel carrying it is cut by departure 8 anyway; noted so the desktop frame gets fixed
//      rather than the error simply disappearing.
//  10. 2.4.4 NAMES THE SUPPLIER, NOT "THE INVOICE". The desktop says "Gyasi can settle the
//      May 28 invoice", which reads as a Story-Tail invoice. BRD §10.5 prohibits client-facing
//      billing outright, so the sentence names Sandals as the party being paid.
//  11. NO CARD ART. The desktop draws each card as a gradient plate with a monospace
//      •••• 4242 in 26px. At 400pt two of those fill the screen before any of the
//      information that matters — status, which trip, how much is left. Rows with a small
//      brand chip instead; the plate is a web affordance.
//  12. THE SPENDING-LIMIT PRESETS BECOME A 2×2. Four side-by-side cards at 400pt give each
//      preset about 88pt, which is narrower than the amounts inside them.
//
// WHAT IS REAL BEHIND THESE FRAMES: payment-wallet (read) and card-authorization (create and
// revoke), both on the service role, because 20260917090000_payment_domain_lockdown.sql
// revoked every client-role grant on these tables and added no policy. Neither Stripe column
// is ever selected.

// ──────────────────────────────────────────────────────────────────────
// Shells — deliberately identical to client-account-mobile.jsx's, which are themselves
// client-trip-mobile.jsx's. These files draw one app and must not drift.
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

// Every §2.4 screen is pushed, so every one of them has this rather than the tab bar.
function MBackBar({ title, trailing }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderBottom: '1px solid var(--md-outline-variant)',
      background: 'var(--md-surface-1)',
    }}>
      <span style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-on-surface-variant)' }}>
        <Icon name="arrow_left" size={18}/>
      </span>
      <div style={{ flex: 1, font: '600 15px/1.2 var(--font-sans)' }}>{title}</div>
      {trailing}
    </div>
  );
}

/** A small brand plate. Departure 11 — the gradient card art does not translate to 400pt. */
function MCardChip({ brand = 'VISA' }) {
  const bg = brand === 'VISA' ? '#1A1F71' : '#EB001B';
  return (
    <span style={{
      width: 38, height: 24, borderRadius: 4, background: bg, color: '#FFF',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: '800 9px/1 var(--font-sans)', flexShrink: 0,
    }}>{brand}</span>
  );
}

function MBottomBar({ children }) {
  // A SIBLING of the scroll, never an overlay — the rule that kept native §2.0 clear of the
  // sticky-CTA overlap the web side shipped.
  return (
    <div style={{
      padding: '10px 16px 22px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)', display: 'flex', gap: 10,
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.1 — My Cards
// ──────────────────────────────────────────────────────────────────────

function M241_MyCards({ dark = false }) {
  const cards = [
    { brand: 'VISA', last4: '4242', name: 'Personal Visa', exp: '11/29', status: 'Active', trip: 'Negril · Nov 2026', cap: '$9,000 cap · $1,155 left' },
    { brand: 'MC', last4: '4444', name: 'Old joint card', exp: '02/27', status: 'Revoked', trip: 'Revoked Jun 2026', cap: null },
  ];
  return (
    <MFrame dark={dark}>
      <MBackBar title="Payment methods"/>
      <div style={{ padding: '14px 16px 20px' }}>
        <div className="t-headline" style={{ fontSize: 22, margin: 0 }}>Cards on file</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
          Tokenized by Stripe — we never see the full number. Used only to pay suppliers on your behalf.
        </div>

        <div className="card" style={{ padding: 12, marginTop: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 10 }}>
          <Icon name="shield" size={18}/>
          <div className="t-body-s">
            <b>Story-Tail never charges you a service fee.</b> Cards are used only to pay suppliers.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {cards.map((c) => (
            <div key={c.last4} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MCardChip brand={c.brand}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-title-s" style={{ fontFamily: 'var(--font-mono)' }}>•••• {c.last4}</div>
                  <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.name} · exp {c.exp}</div>
                </div>
                <span className={`chip-status ${c.status === 'Active' ? 'booked' : 'past'}`}>{c.status}</span>
              </div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>{c.trip}</div>
              {c.cap && <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{c.cap}</div>}
              {c.status === 'Active' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="btn btn-tonal btn-sm" style={{ minHeight: 44 }}>Activity</button>
                  <button className="btn btn-outlined btn-sm" style={{ minHeight: 44 }}>Remove authorization</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Departure 2: drawn, disabled, with the reason on screen — the §2.5 rule for every
            deferral, so a list does not grow items under the reader's thumb later. */}
        <div className="card" style={{
          padding: 16, marginTop: 10, border: '1.5px dashed var(--md-outline)',
          background: 'var(--md-surface-2)', textAlign: 'center', opacity: 0.6,
        }}>
          <Icon name="plus" size={24}/>
          <div className="t-title-s" style={{ marginTop: 4 }}>Add a card</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Coming with the next release</div>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.2 — Add Card (DRAWN, NOT BUILT — departures 1 and 2)
// ──────────────────────────────────────────────────────────────────────

function M242_AddCard({ dark = false }) {
  return (
    <MFrame dark={dark} footer={<MBottomBar><button className="btn btn-filled" style={{ flex: 1, minHeight: 48 }}>Save card</button></MBottomBar>}>
      <MBackBar title="Add a card"/>
      <div style={{ padding: '14px 16px 20px' }}>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
          Your card is stored by Stripe, not by us. Story-Tail sees the brand, the last four digits and the expiry — nothing else.
        </div>

        {/* DEPARTURE 1, the whole reason this frame exists. The desktop draws first-party
            inputs for the number and the security code. Here that region is a single
            Stripe-hosted surface we do not style the insides of and never read from. The
            dashed edge is the seam: everything inside it belongs to Stripe. */}
        <div style={{ marginTop: 14 }}>
          <div className="field-label">Card details</div>
          <div style={{
            marginTop: 6, padding: 14, borderRadius: 12,
            border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--md-on-surface-variant)' }}>
              <Icon name="lock" size={15}/>
              <div className="t-body-s" style={{ flex: 1 }}>Stripe’s secure card field</div>
            </div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6, opacity: 0.85 }}>
              Number, expiry and security code are entered here and go straight to Stripe. They never reach a Story-Tail server.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="field-label">Nickname (optional)</label>
          <input className="input" defaultValue="Personal Visa"/>
        </div>

        <div className="card" style={{ padding: 12, marginTop: 14, background: 'var(--md-surface-2)' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', font: '500 12.5px/1.5 var(--font-sans)' }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--md-outline)', flexShrink: 0, marginTop: 2 }}/>
            <span>
              I understand this card is stored to pay <b>suppliers</b> for my trips, and that
              Story-Tail never charges me a planning or service fee.
            </span>
          </label>
        </div>
        {/* Departure 3: the desktop consent adds "I'll be notified every time the card is
            used". Nothing delivers that, and the text is frozen into consent_payload. */}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.3 — Authorize a card for a trip
// ──────────────────────────────────────────────────────────────────────

function M243_Authorize({ dark = false }) {
  const presets = [
    { l: 'Exact', v: '$7,845' },
    { l: '+10%', v: '$8,630', sel: true },
    { l: '+20%', v: '$9,414' },
    { l: 'Custom', v: 'Set' },
  ];
  return (
    <MFrame dark={dark} footer={
      <MBottomBar>
        <button className="btn btn-outlined" style={{ minHeight: 48 }}>Cancel</button>
        <button className="btn btn-filled" style={{ flex: 1, minHeight: 48 }}>Authorize $8,630</button>
      </MBottomBar>
    }>
      <MBackBar title="Authorize a card"/>
      <div style={{ padding: '14px 16px 20px' }}>
        {/* The desktop's right rail, moved ABOVE the form rather than below it: on a phone
            the traveler needs to know which trip they are authorizing before they pick a
            card, not after. */}
        <div className="card" style={{ padding: 14 }}>
          <span className="chip-status booked">Booked</span>
          <div className="t-title-s" style={{ marginTop: 6 }}>Anniversary Week in Negril</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Nov 15 – 22, 2026 · Jordan + Sam</div>
          <hr className="divider" style={{ margin: '10px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="t-body-s">
            <span style={{ color: 'var(--md-on-surface-variant)' }}>Balance due</span><span>$7,845</span>
          </div>
        </div>

        <div className="t-title-s" style={{ marginTop: 16 }}>Card</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {[{ brand: 'VISA', last4: '4242', name: 'Personal Visa', sel: true }].map((c) => (
            <label key={c.last4} style={{
              padding: 12, borderRadius: 12, minHeight: 48,
              border: `1.5px solid ${c.sel ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`,
              background: c.sel ? 'var(--md-primary-container)' : 'var(--md-surface-1)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--md-primary)' }}/>
              </span>
              <MCardChip brand={c.brand}/>
              <div style={{ flex: 1 }}>
                <div className="t-title-s" style={{ fontFamily: 'var(--font-mono)' }}>•••• {c.last4}</div>
                <div className="t-body-s" style={{ opacity: 0.8 }}>{c.name}</div>
              </div>
            </label>
          ))}
          {/* Departure 2 again: no "Add new card" branch while 2.4.2 is deferred, because it
              would dead-end. The picker says why rather than offering a route to nowhere. */}
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
            Adding a new card arrives with the next release.
          </div>
        </div>

        <div className="t-title-s" style={{ marginTop: 16 }}>Spending limit</div>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '2px 0 8px' }}>
          The most Gyasi can put on this card for this trip.
        </p>
        {/* Departure 12: 2×2 rather than the desktop's four-across. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {presets.map((o) => (
            <div key={o.l} style={{
              padding: 12, borderRadius: 12, minHeight: 48,
              border: `1.5px solid ${o.sel ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`,
              background: o.sel ? 'var(--md-primary-container)' : 'var(--md-surface-1)',
              color: o.sel ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
            }}>
              <div className="t-label">{o.l}</div>
              <div className="t-title-s" style={{ marginTop: 2 }}>{o.v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="field-label">Expires</label>
          <input className="input" defaultValue="Nov 29, 2026 · 7 days after the trip"/>
        </div>

        <div className="card" style={{ padding: 12, marginTop: 14, background: 'var(--md-surface-2)' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', font: '500 12.5px/1.5 var(--font-sans)' }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
              <Icon name="check" size={12} color="#FFF" stroke={2.5}/>
            </span>
            <span>
              <b>I authorize</b> Story-Tail Adventures to use VISA •••• 4242 to pay suppliers
              for this trip, up to $8,630, until Nov 29, 2026. Story-Tail does not charge me a
              planning or service fee.
            </span>
          </label>
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.4 — Authorization confirmed
// ──────────────────────────────────────────────────────────────────────

function M244_Confirmation({ dark = false }) {
  const rows = [
    { l: 'Trip', v: 'Negril · Nov 15 – 22' },
    { l: 'Card', v: 'VISA •••• 4242' },
    { l: 'Limit', v: '$8,630' },
    { l: 'Expires', v: 'Nov 29, 2026' },
  ];
  return (
    <MFrame dark={dark} footer={
      <MBottomBar>
        <button className="btn btn-outlined" style={{ minHeight: 48 }}>View activity</button>
        <button className="btn btn-filled" style={{ flex: 1, minHeight: 48 }}>Back to trip</button>
      </MBottomBar>
    }>
      <div style={{ padding: '40px 16px 20px', textAlign: 'center' }}>
        <div style={{
          width: 84, height: 84, borderRadius: 999, margin: '0 auto 14px',
          background: 'var(--md-success-container)', color: 'var(--md-success)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="check" size={42} stroke={2.5}/>
        </div>
        <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>AUTHORIZED</span>
        <div className="t-headline" style={{ fontSize: 22, margin: '4px 0 6px' }}>
          Your Visa is ready for Negril.
        </div>
        {/* Departure 10: the supplier is named. "Settle the invoice" reads as a Story-Tail
            invoice, and BRD §10.5 prohibits client-facing billing outright.
            Departure 3: no "you'll be notified" tail. */}
        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
          Gyasi can now pay Sandals directly from this card, up to the limit you set.
        </p>

        <div className="card" style={{ padding: 14, marginTop: 18, textAlign: 'left' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>SUMMARY</div>
          {rows.map((kv) => (
            <div key={kv.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--md-outline-variant)' }} className="t-body-s">
              <span style={{ color: 'var(--md-on-surface-variant)' }}>{kv.l}</span>
              <span>{kv.v}</span>
            </div>
          ))}
        </div>
        {/* The desktop's fifth row — "Notifications · Email + push on every use" — is gone
            with departure 3. */}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.5 — Card use activity
// ──────────────────────────────────────────────────────────────────────

function M245_Activity({ dark = false }) {
  const events = [
    { d: 'Sep 14', supplier: 'NEGRIL TRANSFERS LTD', note: 'Airport transfers', amt: '$316.00', card: '4242' },
    { d: 'Sep 8', supplier: 'Island Routes Adventures', note: 'Catamaran sunset cruise', amt: '$185.00', card: '4242' },
    { d: 'Aug 20', supplier: 'Sandals Resorts', note: 'Deposit · ocean-view suite', amt: '$4,500.00', card: '4242' },
  ];
  return (
    <MFrame dark={dark}>
      <MBackBar title="Card activity"/>
      <div style={{ padding: '14px 16px 20px' }}>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>
          Every time a card on file was used to pay a supplier. Each one is audit-logged.
        </div>

        {/* Departure 4: no Export CSV action in the header. */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '12px 0 4px', paddingBottom: 4 }}>
          {['All cards', 'VISA 4242', 'All trips'].map((t, i) => (
            <span key={t} className={`chip ${i === 0 ? 'chip-filter is-on' : 'chip-filter'}`} style={{ flexShrink: 0, height: 32 }}>{t}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {events.map((e) => (
            <div key={e.supplier} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', minHeight: 48 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="card" size={15}/>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* The supplier NAME comes from supplier_name_snapshot, never a join: a
                    renamed supplier must not rewrite history, and a portal booking names a
                    merchant with no supplier row at all — the first row here is one. */}
                <div className="t-title-s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.supplier}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{e.d} · {e.note}</div>
              </div>
              <div style={{ font: '700 13px/1 var(--font-mono)', textAlign: 'right' }}>{e.amt}</div>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.6 — Card use detail
// ──────────────────────────────────────────────────────────────────────

function M246_UseDetail({ dark = false }) {
  const rows = [
    { l: 'Amount', v: '$4,500.00' },
    { l: 'Card', v: 'VISA •••• 4242' },
    { l: 'Supplier', v: 'Sandals Resorts' },
    { l: 'Paid by', v: 'Gyasi Story' },
    { l: 'Trip', v: 'Negril · Nov 15 – 22, 2026' },
    { l: 'When', v: 'Aug 20, 2026 · 9:14a' },
    { l: 'Reference', v: 'SDL-88213', mono: true },
  ];
  return (
    <MFrame dark={dark}>
      <MBackBar title="Card use"/>
      <div style={{ padding: '14px 16px 20px' }}>
        <div className="t-headline" style={{ fontSize: 22, margin: 0, fontFamily: 'var(--font-mono)' }}>$4,500.00</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
          Sandals Resorts · Aug 20, 2026
        </div>

        <div className="card" style={{ padding: 14, marginTop: 14, background: 'var(--md-success-container)', color: 'var(--md-success)', border: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="check" size={16} stroke={2.5}/>
            <div className="t-title-s">Charged by the supplier</div>
          </div>
          <div className="t-body-s" style={{ opacity: 0.9, marginTop: 4 }}>
            Sandals charged your card directly. Story-Tail never handled the money.
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 10 }}>
          {rows.map((kv, i) => (
            <div key={kv.l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--md-outline-variant)' }} className="t-body-s">
              <span style={{ color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>{kv.l}</span>
              <span style={{ textAlign: 'right', fontFamily: kv.mono ? 'var(--font-mono)' : 'inherit' }}>{kv.v}</span>
            </div>
          ))}
        </div>

        {/* Departures 5 and 6, both drawn disabled with the reason on screen rather than
            omitted — a traveler who remembers the button should find out why it is inert. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <div>
            <button className="btn btn-outlined btn-sm" style={{ minHeight: 48, width: '100%', opacity: 0.55 }}>
              <Icon name="warning" size={13}/> Flag as unfamiliar
            </button>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
              Flagging arrives once the activity log can record it.
            </div>
          </div>
          <button className="btn btn-tonal btn-sm" style={{ minHeight: 48, width: '100%' }}>
            <Icon name="message" size={13}/> Ask Gyasi about this
          </button>
        </div>
        {/* The desktop's "Note from Gyasi" is absent: card_use_event.justification is the
            agent's reason written for the audit trail, classified Internal in Data-Model
            §9.4, and it stays that way. The receipt button is gone with departure 6. */}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.4m.7 — Remove authorization (departure 7)
// ──────────────────────────────────────────────────────────────────────

function M247_RevokeConfirm({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      <MBottomBar>
        <button className="btn btn-outlined" style={{ minHeight: 48 }}>Cancel</button>
        <button className="btn btn-danger" style={{ flex: 1, minHeight: 48 }}>Yes, remove it</button>
      </MBottomBar>
    }>
      {/* A FULL-SCREEN ROUTE, not a sheet — the same call §2.5.10 made. A grabber means
          "swipe this away", which is the wrong affordance on a destructive confirmation. */}
      <MBackBar title="Remove authorization"/>
      <div style={{ padding: '18px 16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="warning" size={20}/>
          </span>
          <div>
            <span className="t-label-s" style={{ color: 'var(--md-error)' }}>CONFIRM</span>
            {/* Departure 7: the authorization is what is removed, and the trip is named so
                it is obvious this is per-trip rather than per-card. */}
            <div className="t-title-l" style={{ margin: 0 }}>Stop using this card for Negril?</div>
          </div>
        </div>

        <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 12 }}>
          Gyasi will not be able to put anything else on VISA •••• 4242 for this trip.
          <b> Charges already made are unaffected</b> — Sandals cannot be refunded through
          Story-Tail.
        </p>

        <div className="card" style={{ padding: 12, marginTop: 14, background: 'var(--md-surface-2)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>THIS AUTHORIZATION</div>
          <div className="t-title-s" style={{ marginTop: 4 }}>Anniversary Week in Negril</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>$1,155 of $9,000 left · expires Nov 29</div>
        </div>

        {/* Departure 7 again, said plainly rather than left for somebody to discover: the
            card itself stays on file, because removing it here would not remove it from
            Stripe. Departures 8 and 9 remove the "WE'LL NOTIFY / She may request another
            card" panel the desktop frame put here. */}
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 12 }}>
          The card stays on file for your other trips. Removing a card entirely arrives with
          the next release.
        </div>
      </div>
    </MFrame>
  );
}

Object.assign(window, {
  M241_MyCards, M242_AddCard, M243_Authorize, M244_Confirmation,
  M245_Activity, M246_UseDetail, M247_RevokeConfirm,
});
