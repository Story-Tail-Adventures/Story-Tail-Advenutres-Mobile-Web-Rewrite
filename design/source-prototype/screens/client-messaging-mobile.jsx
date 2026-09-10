/* global React, Icon, IOSDevice */
// Client · 2.6m Mobile · Messaging — 3 screens.
// Mobile-native interpretation of the 2.6 desktop artboards in client-messaging.jsx.
//
// Patterns, per Screen-Inventory §4.4 (lines 1804-1806, verbatim): 2.6.1 **B**
// (master-detail on tablet landscape and web; on mobile the list only, thread is a push) ·
// 2.6.2 **C** (chat-style; "Mobile is full-screen"), and it is the SAME SCREEN as 2.2m.7 ·
// 2.6.3 **A**.
//
// THE ONE STRUCTURAL POINT. 2.6.2 is not a new screen — it is M227_TripThread with a
// different header. §2.2.7 is that thread scoped to a trip; the inbox thread is the same
// conversation reached from a different list. The bubbles, the day separators, the
// attachment card and the composer are drawn here to MATCH M227_TripThread exactly, so that
// both builds mount one component instead of copying it. `web/app/(client)/trips/[tripId]/
// messages/page.tsx` already commits to this in its own header; this artboard is the design
// side of the same promise. If the two drift visually, the extraction never happens.
//
// Messages is a TAB. 2.6.1 is the tab root and carries MClientTabs; 2.6.2 and 2.6.3 are
// pushed on top of it and carry a back bar.
//
// DELIBERATE DEPARTURES from the desktop artboards. Recorded in the same idiom as
// client-trip-mobile.jsx's list, and mirrored into the sync skill's "Known upstream deltas".
//
//   1. NO "Online" presence dot. §2.2 declined the typing indicator because nothing backs
//      it — there is no Realtime presence in this stack — and a green "Online" is the same
//      claim with a worse failure mode: it says Gyasi is at his desk when the app has no
//      idea. Dropped from 2.6.1's thread header and from 2.6.3's advisor card.
//   2. NO "reply in < 2h" / "within 2 hours during 9–6 ET". The desktop frames carry THREE
//      different promises (lines 9, 59 and 155 of client-messaging.jsx). §2.1/§2.2 settled
//      on "Usually replies the same day", and the competing "< 2h" lives in
//      web/content/public/proof.ts as `avgReplyTime` with `verified: false` — fenced by
//      PUBLIC_CLAIMS_MODE=strict precisely so it cannot ship unexamined. One string, the
//      settled one, everywhere.
//   3. NO "· Read" under your own messages. `message.read_by_other_at` is withheld from
//      `authenticated` ON PURPOSE (20260907031255_trip_read_policies.sql) — it would tell a
//      traveler when Gyasi read their message, which is a promise about his attention that
//      nobody agreed to make.
//   4. NO reactions (the desktop frame's "❤ 1"). There is no reaction entity in the data
//      model and none is specified. Drawing one commits both stacks to building it.
//   5. NO "System" threads. The desktop inbox lists "Card authorization confirmed" and a
//      "post-trip survey" as conversations. `conversation.agent_id` is NOT NULL and
//      `user_role` is ENUM ('client','agent','admin') — there is no system sender. These are
//      notifications, and §2.2.2 already parked the activity feed at "§2.6's notification
//      centre". §2.6 has three screens and none of them is a notification centre, so the
//      feed still has no home. Recorded, not invented.
//   6. NO "Use a template" on 2.6.3. `message_template` belongs to the AGENT (§3.10). A
//      client-side template picker is a different feature nobody has specified.
//   7. Gyasi is initials, never a stock face. web/lib/images.ts has no avatar entries at
//      all — every staImg('avatarA') in the desktop frames is an Unsplash portrait of a
//      stranger.
//   8. 2.6.3's copy must not promise a QUOTE. Per BRD §6.5 (decided 2026-09-09) structured
//      intake goes through quote-request and creates a Trip in `inquiry`. 2.6.3 is prose
//      that lands in the inbox. If it says "get a quote" it becomes a second intake queue
//      bypassing the pipeline that decision consolidated onto.
//   9. Archive is NOT a client action. This is a departure from the SPEC, not from the
//      frame: Screen-Inventory §2.6.1 lists an "archive action" under Primary elements and
//      "archive" under Key actions, but the desktop artboard never drew one (there is no
//      archive control anywhere in client-messaging.jsx), and this file does not either.
//      `conversation_self_select` filters `archived_at IS NULL`, so widening it to let a
//      client read archived threads would silently change what the §2.2 dashboard and
//      trip-detail queries return. Archiving is the agent's filing tool for hundreds of
//      threads; a traveler with three threads and one advisor does not need one.
//  10. ATTACH is disabled on 2.6.3. `trip-message` filters `attachmentDocumentIds` to
//      documents the caller owns, and the only door that creates a `document` row requires a
//      trip — `trip-document` hard-requires a `tripId` and keys the object under
//      `trips/<tripId>/`, and it is the only insert into that table in the repo. A screen
//      whose whole premise is "no trip yet" therefore has nothing it could attach. It turns
//      on with the account-scoped upload endpoint recorded against §2.5.4, not before.
//
// WHAT IS NEW AND REAL: marking a thread read. `conversation.client_unread_count` is
// granted and 2.6.1 renders a badge off it, but nothing zeroes it — so without a
// `conversation-read` write the badge is permanent. That is the one write 2.6.1 needs.

// ──────────────────────────────────────────────────────────────────────
// Shells — deliberately identical to client-trip-mobile.jsx's. See the note above: these
// two files draw one component and must not drift.
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

const M_TABS = [
  { id: 'trips', icon: 'home', label: 'Trips' },
  { id: 'discover', icon: 'search', label: 'Discover' },
  { id: 'msg', icon: 'message', label: 'Messages' },
  { id: 'me', icon: 'user', label: 'Account' },
];

function MClientTabs({ active = 'msg' }) {
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

// Initials, never a stock face — departure 7.
function MAdvisorAvatar({ size = 36, tone = 'secondary' }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: `var(--md-${tone}-container)`, color: `var(--md-on-${tone}-container)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: `700 ${Math.round(size * 0.38)}px/1 var(--font-sans)`, letterSpacing: 0.3,
    }}>GS</span>
  );
}

// The thread's back bar. `subtitle` is the trip on a trip thread and the subject on a
// general one; `onOpenTrip` is CONDITIONAL, because a thread started before any trip exists
// has nowhere to go. That nullability is the whole reason 2.6.2 and 2.2.7 can be one screen.
function MThreadBar({ title, subtitle, openTrip = true }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5, minHeight: 56,
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 6px',
      background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)',
    }}>
      <button className="btn-icon" aria-label="Back" style={{ width: 36, height: 36, flexShrink: 0 }}>
        <Icon name="arrow_left" size={19}/>
      </button>
      <MAdvisorAvatar size={34}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
      </div>
      {openTrip && <button className="btn btn-tonal btn-sm" style={{ flexShrink: 0 }}>Trip</button>}
    </div>
  );
}

// One inbox row. No system variant — departure 5.
function MInboxRow({ subject, preview, time, unread = 0, trip, active = false }) {
  return (
    <div style={{
      padding: '13px 16px', display: 'flex', gap: 11, alignItems: 'flex-start',
      background: active ? 'var(--md-secondary-container)' : 'transparent',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      <MAdvisorAvatar size={38} tone={active ? 'primary' : 'secondary'}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, font: '600 13.5px/1.3 var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subject}
          </span>
          <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>{time}</span>
        </div>
        <div className="t-body-s" style={{
          color: 'var(--md-on-surface-variant)', marginTop: 2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{preview}</div>
        {trip && (
          <div style={{ font: '600 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--brand-orange)', marginTop: 7 }}>
            {trip}
          </div>
        )}
      </div>
      {unread > 0 && (
        <span style={{
          background: 'var(--brand-orange)', color: '#FFF', borderRadius: 999, flexShrink: 0,
          minWidth: 20, height: 20, padding: '0 6px', marginTop: 2,
          font: '700 11px/1 var(--font-sans)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{unread}</span>
      )}
    </div>
  );
}

// Bubble + composer, drawn to match M227_TripThread exactly. See the header note.
function MBubble({ mine, body, time, file }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8 }}>
      {!mine && <MAdvisorAvatar size={26}/>}
      <div style={{ maxWidth: '76%' }}>
        <div style={{
          background: mine ? 'var(--md-primary)' : 'var(--md-surface-1)',
          color: mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
          padding: '10px 13px',
          borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          border: mine ? 0 : '1px solid var(--md-outline-variant)',
          font: '400 13.5px/1.45 var(--font-sans)',
        }}>
          {body}
          {file && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: 'var(--md-surface-2)', color: 'var(--md-on-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 28, height: 34, borderRadius: 4, flexShrink: 0, background: 'var(--brand-burgundy)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 8px/1 var(--font-sans)' }}>PDF</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title-s" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.n}</div>
                <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{file.s}</div>
              </div>
              <button className="btn-icon" aria-label="Download"><Icon name="download" size={14}/></button>
            </div>
          )}
        </div>
        {/* No "· Read" — departure 3. */}
        <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
          {time}
        </div>
      </div>
    </div>
  );
}

function MComposer({ value, quickReplies = [] }) {
  return (
    <div style={{ padding: '10px 12px 18px', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
      {quickReplies.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflow: 'auto', paddingBottom: 8 }}>
          {quickReplies.map((q) => (
            <span key={q} className="chip" style={{ height: 30, flexShrink: 0 }}>{q}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-bg)' }}>
        <button className="btn-icon" aria-label="Attach" style={{ width: 30, height: 30 }}><Icon name="attach" size={16}/></button>
        <span style={{ flex: 1, font: '400 13px/1 var(--font-sans)', color: value ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>
          {value || 'Message Gyasi…'}
        </span>
        <button className="btn btn-filled btn-sm" aria-label="Send" style={{ width: 34, height: 34, padding: 0, borderRadius: 999 }}>
          <Icon name="send" size={14}/>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.6m.1 — Messages inbox  (the Messages TAB root; list only, thread is a push)
// ──────────────────────────────────────────────────────────────────────

function M261_Inbox({ dark = false }) {
  const threads = [
    { subject: 'Sandals upgrade locked in', preview: 'Locked. I also flagged your card for the final balance — there is a request waiting in your dashboard.', time: '2:14p', unread: 2, trip: 'Sandals · Aug' },
    { subject: 'New family cruise idea', preview: 'Found a Royal Caribbean sailing over the Christmas dates. Six nights, and the kids’ club is the good one.', time: 'Tue', trip: 'Family cruise · Dec' },
    { subject: 'Welcome to Story-Tail', preview: 'So glad to have you. Anything at all you are wondering about, just send it here.', time: '14 Mar' },
  ];
  return (
    <MFrame dark={dark} footer={<MClientTabs active="msg"/>}>
      <div style={{ padding: '16px 16px 10px' }}>
        <h1 className="t-headline" style={{ margin: 0, fontSize: 24 }}>Messages</h1>
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', margin: '2px 0 0' }}>
          Everything you and Gyasi have talked about.
        </p>
      </div>

      <div style={{ padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, background: 'var(--md-surface-3)', height: 38, color: 'var(--md-on-surface-variant)' }}>
          <Icon name="search" size={15}/>
          <span className="t-body-s">Search messages…</span>
        </div>
      </div>

      {/* All three of the desktop frame's filters. "By trip" is Screen-Inventory §2.6.1's
          "filter by trip" — `conversation.trip_id` is granted to `authenticated` and
          indexed (conversation_trip), so it is backed. Departure 9 is about the spec's
          ARCHIVE action, which is not one of these chips. */}
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, overflow: 'auto' }}>
        <span className="chip chip-filter is-on" style={{ height: 30, flexShrink: 0 }}>All</span>
        <span className="chip" style={{ height: 30, flexShrink: 0 }}>Unread · 1</span>
        <span className="chip" style={{ height: 30, flexShrink: 0 }}>By trip</span>
      </div>

      <div>
        {threads.map((t, i) => <MInboxRow key={t.subject} {...t} active={i === 0}/>)}
      </div>

      <div style={{ padding: '18px 16px 24px' }}>
        <button className="btn btn-tonal" style={{ width: '100%' }}>
          <Icon name="send" size={14}/> Start a new message
        </button>
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.6m.2 — Conversation thread
// This IS 2.2m.7 with a different bar. Same bubbles, same composer, one component.
// ──────────────────────────────────────────────────────────────────────

function M262_ConversationThread({ dark = false }) {
  const messages = [
    { mine: false, time: '11:14a', body: 'Quick win — Sandals just opened the over-water bungalows for your dates. I have one held tentatively. Want me to lock it?' },
    { mine: true, time: '11:32a', body: 'Yes please. Sam will lose it 😍 — what is the upgrade?' },
    { mine: false, time: '11:33a', body: '$680 over the base, and I got them to add a spa credit and a private island day. Worth it.', file: { n: 'sandals-bungalow-deck.pdf', s: '2.4 MB' } },
    { mine: true, time: '11:36a', body: 'Done. Go ahead and book it.' },
    { mine: false, time: '2:14p', body: 'Locked. Nothing is charged by me — Sandals invoices on 28 May and I pay them then. I will walk you through it before anything moves.' },
  ];
  // MFrame's own scroller carries the thread and the composer sits in `footer`, a SIBLING
  // below it — exactly as M227_TripThread does, because these are one component.
  //
  // The earlier shape here was `scrollable={false}` plus an inner `flex: 1; overflow: auto`.
  // That does not scroll: MFrame's content box is a plain block, so `flex: 1` on its child
  // is inert, the child sizes to its content, and `scrollable={false}` turns the only real
  // scroll container into `overflow: hidden`. A long thread was silently clipped.
  return (
    <MFrame dark={dark} footer={
      <MComposer quickReplies={['👍 Sounds good', 'A few questions', 'Add my partner']}/>
    }>
      <MThreadBar title="Sandals upgrade locked in" subtitle="Sandals Royal Bahamian · 12–19 Aug"/>
      <div style={{ padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <span className="chip" style={{ background: 'var(--md-surface-2)', height: 26 }}>Mon, 12 May</span>
        </div>
        {messages.map((m, i) => <MBubble key={i} {...m}/>)}
      </div>
    </MFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.6m.3 — New conversation
// ──────────────────────────────────────────────────────────────────────

function M263_NewConversation({ dark = false }) {
  return (
    <MFrame dark={dark} footer={
      /* Attach is DISABLED here — departure 10. `trip-message` filters
         `attachmentDocumentIds` to documents the caller owns, so attaching needs a `document`
         row to exist first — and the only door that creates one requires a trip (see §2.5.4).
         A screen defined by there being no trip yet cannot produce an attachment. It turns on
         with the account-scoped upload endpoint, not before. */
      <div style={{ padding: '10px 16px 20px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--md-surface-1)', borderTop: '1px solid var(--md-outline-variant)' }}>
        <button className="btn btn-tonal" style={{ flex: '0 0 auto', opacity: 0.45 }} aria-disabled="true">
          <Icon name="attach" size={15}/>
        </button>
        <button className="btn btn-filled" style={{ flex: 1 }}><Icon name="send" size={14}/> Send</button>
      </div>
    }>
      <MThreadBar title="Start a message" subtitle="To Gyasi" openTrip={false}/>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="card" style={{ padding: 14, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <MAdvisorAvatar size={40} tone="primary"/>
          <div className="t-body-s">
            {/* Departures 1 and 2 — no presence dot, and the settled reply-window string. */}
            <b>Gyasi Story</b> · your advisor<br/>
            Usually replies the same day.
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">What is it about? (optional)</label>
          <input className="input" placeholder="Thinking about Aruba in October"/>
        </div>

        <div>
          <label className="field-label">Message</label>
          <textarea
            className="input"
            style={{ height: 190, padding: 12, resize: 'none' }}
            placeholder="No trip yet? That is fine — this is the right place to start. Tell Gyasi roughly when, roughly where, and anything that matters to you, and he will take it from there."
          />
        </div>

        {/* Departure 8 — this is a conversation, not structured intake. It must not
            promise a quote; quote-request owns that path and creates a Trip in `inquiry`. */}
        <p className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 12 }}>
          This goes straight to Gyasi, not to a queue. There is never a fee for asking.
        </p>
      </div>
    </MFrame>
  );
}

Object.assign(window, { M261_Inbox, M262_ConversationThread, M263_NewConversation });
