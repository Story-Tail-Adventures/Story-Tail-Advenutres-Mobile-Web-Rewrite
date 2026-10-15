/* global React, Icon, IOSDevice */
// Agent · 3.10m Mobile · Messaging — 5 frames (4 live, 1 drawn-and-deferred).
// Mobile-native interpretation of A3101_AgentInbox / A3102_AgentThread in
// agent-leads-support-msg.jsx, drawn from design/briefs/agent-messages-phone.md (rulings settled
// with Gyasi 2026-10-14). Authored LOCALLY on 2026-10-15, the way §2.2m and §2.5m/§2.6m were,
// because the brief's frames never landed in the canonical design project.
//
// Patterns, per Screen-Inventory §4.4: 3.10.1 **B** (master-detail on the web; on the phone the
// list only, the thread is a push) and 3.10.2 **C** (chat-style, full screen).
//
// THE BUBBLES MATCH THE TRAVELER'S. The thread is drawn to the same shapes as M262 / M227
// (client-messaging-mobile.jsx), with the sides swapped: the advisor's own on the right. The
// Kotlin build mounts ui/components/client/ThreadScreen.kt with an advisor variant, and if the
// two drift visually that extraction never happens.
//
// DELIBERATE DEPARTURES from the web frames (A3101/A3102), each a ruling, not a guess:
//   1. NO PRESENCE. The web header says "client online"; nothing in this stack knows that.
//   2. NO READ RECEIPTS under the advisor's messages. The client's read time is not shown.
//   3. NO REACTIONS. There is no reaction entity.
//   4. NO TEMPLATE PICKER ("Use template ▾") AND NO BULK ARCHIVE. Desk work (§6.6; Gyasi,
//      2026-10-13 and 2026-10-14). 3.10m.4 draws why, rather than leaving the reason unsaid.
//   5. NO MASTER-DETAIL. The inbox is the tab root; the thread is pushed with a back bar.
//   6. NO "By client" / "By trip" CHIPS. On the web they arrive as filters Client Detail and
//      Trip Detail link in with; on the phone those doors open the thread itself.
//   7. INITIALS, NEVER A STOCK PORTRAIT of a stranger standing in for a client.
//   8. ARCHIVE ONLY IN THE THREAD HEADER. No swipe on inbox rows: a swipe is easy to do by
//      accident.
//   9. THE NOTE SWITCH IS A Reply / Note TOGGLE above the box, easier to hit on a phone than
//      the web's small switch beside Send. In Note mode the box takes the web's dashed, tinted
//      look, every time.
//  10. ATTACHMENTS ARE NAMES, NOT DOWNLOADS. Nothing on the advisor's side can open a client's
//      document yet, so the traveler's download button is not drawn.
//  11. "SLA past" IS "Overdue": one business day, Sundays never count (Gyasi, 2026-10-13).
//  12. SIGN-OUT RIDES THE TOP BAR, as on Worklist and Clients (agent-crm-mobile.jsx departure
//      8): More (§3.12) is still unbuilt.
//
// Sample content is the local seed's, so the frames and `supabase db reset` agree.

function MsgMFrame({ dark = false, children, footer }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div className={dark ? 'scheme-dark' : ''} style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--md-bg)', color: 'var(--md-on-surface)',
        paddingTop: 54, position: 'relative',
      }}>
        <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {footer}
      </div>
    </IOSDevice>
  );
}

// §6.6's four, with THREE built: Messages goes live in §3.10 Stage 3.
const MSG_M_TABS = [
  { id: 'work', icon: 'pulse', label: 'Worklist', built: true },
  { id: 'clients', icon: 'users', label: 'Clients', built: true },
  { id: 'msg', icon: 'message', label: 'Messages', built: true },
  { id: 'more', icon: 'more_vert', label: 'More', built: false },
];

/** The Messages tab carries a badge of UNREAD THREADS, refreshed on open and on tab switch. */
function MsgMTabs({ active = 'msg', badge = 0 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '8px 6px 18px', background: 'var(--md-surface-1)',
      borderTop: '1px solid var(--md-outline-variant)',
    }}>
      {MSG_M_TABS.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56,
            opacity: t.built ? 1 : 0.38,
          }}>
            <span style={{
              position: 'relative',
              width: 56, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: on ? 'var(--md-secondary-container)' : 'transparent',
              color: on ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}>
              <Icon name={t.icon} size={19}/>
              {t.id === 'msg' && badge > 0 && (
                <span aria-label={`${badge} unread`} style={{
                  position: 'absolute', top: -2, right: 8, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 999, background: 'var(--md-error)', color: 'var(--md-on-error)',
                  font: '700 10px/16px var(--font-sans)', textAlign: 'center',
                }}>{badge}</span>
              )}
            </span>
            <span style={{ font: '600 10px/1.2 var(--font-sans)', color: on ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Departure 12. */
function MsgMTopBar({ title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderBottom: '1px solid var(--md-outline-variant)',
      background: 'var(--md-surface-1)',
    }}>
      <div style={{ flex: 1, font: '600 17px/1.2 var(--font-sans)' }}>{title}</div>
      <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Sign out</span>
    </div>
  );
}

/** Departure 7. */
function MsgMInitials({ name, size = 38 }) {
  const initials = name.split(/[\s&-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      font: `700 ${Math.round(size * 0.34)}px/1 var(--font-sans)`,
    }}>{initials}</span>
  );
}

/** Departure 11: Overdue reads as an error; "Reply by Tue" is a quiet outline. */
function MsgDueChip({ overdue, replyBy }) {
  if (overdue) {
    return (
      <span className="chip" style={{
        height: 22, padding: '0 8px', border: 0, font: '600 10.5px/1 var(--font-sans)',
        background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
      }}>Overdue</span>
    );
  }
  if (replyBy) {
    return <span className="chip" style={{ height: 22, padding: '0 8px', font: '500 10.5px/1 var(--font-sans)' }}>Reply by {replyBy}</span>;
  }
  return null;
}

function MsgInboxRow({ name, trip, preview, time, unread = 0, overdue = false, replyBy = null, first = false }) {
  return (
    <div style={{
      padding: '13px 16px', display: 'flex', gap: 11, alignItems: 'flex-start',
      borderTop: first ? 0 : '1px solid var(--md-outline-variant)',
    }}>
      <MsgMInitials name={name}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            font: `${unread > 0 ? 700 : 600} 13.5px/1.3 var(--font-sans)`,
          }}>{name}</span>
          <span className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>{time}</span>
        </div>
        <div className="t-body-s" style={{
          color: unread > 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)', marginTop: 2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{preview}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{ font: '600 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--brand-orange)' }}>
            {trip}
          </span>
          <MsgDueChip overdue={overdue} replyBy={replyBy}/>
        </div>
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

// ──────────────────────────────────────────────────────────────────────
// 3.10m.1 — Inbox (the Messages TAB root; list only, the thread is a push)
// ──────────────────────────────────────────────────────────────────────

function M3101_Inbox({ dark = false }) {
  const rows = [
    { name: 'Jordan Hayes', trip: 'Anniversary Week in Negril', preview: 'Yes please. What does the upgrade run us?', time: '3:27p', unread: 1, replyBy: 'Fri' },
    { name: 'Maya Carter', trip: 'Saint Lucia · Between Semesters', preview: 'Is the airport transfer included, or do we book that?', time: 'Mon', unread: 2, overdue: true },
    { name: 'Sam Rivera', trip: 'General', preview: 'Thinking about something in the spring. Can we talk?', time: 'Mon', replyBy: 'Tue' },
    { name: 'Pri Raghunathan', trip: 'Lisbon & the Douro Valley', preview: 'You: Your Porto tasting is booked for the 14th.', time: 'Oct 9' },
    { name: 'Tomás Delgado', trip: 'Barcelona, long weekend', preview: 'You: Booked! Details coming tonight.', time: 'Oct 3' },
  ];
  return (
    <MsgMFrame dark={dark} footer={<MsgMTabs active="msg" badge={2}/>}>
      <MsgMTopBar title="Messages"/>
      <div style={{ padding: '14px 16px 0' }}>
        {/* Visible, as on the Clients tab: finding one client's thread by name is the task. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
          borderRadius: 999, background: 'var(--md-surface-3)', color: 'var(--md-on-surface-variant)',
        }}>
          <Icon name="search" size={15}/>
          <span className="t-body-s">Name, trip or message</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <span className="chip chip-filter">Unread</span>
          <span className="chip chip-filter">Overdue</span>
          <span className="t-body-s" style={{ marginLeft: 'auto', color: 'var(--md-primary)', fontWeight: 600 }}>Archived (3)</span>
        </div>
        <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', margin: '12px 0 8px' }}>
          2 unread · 1 overdue
        </div>
      </div>
      <div className="card" style={{ margin: '0 12px 12px', padding: 0, overflow: 'hidden' }}>
        {rows.map((r, i) => <MsgInboxRow key={r.name} first={i === 0} {...r}/>)}
      </div>
      {/* Pull to refresh and load-on-scroll are behaviour, not chrome: nothing is drawn for
          them, the same call the Clients tab made about its paginator. */}
    </MsgMFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.10m.2 — Thread (pushed; reply mode and note mode)
// ──────────────────────────────────────────────────────────────────────

/** Header: client and trip, the due chip, Open trip (or Open client), Archive. Nothing else. */
function MsgThreadBar({ name, trip, overdue = false, replyBy = null, general = false }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      padding: '8px 10px 10px 6px', background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn-icon" aria-label="Back to Messages" style={{ width: 36, height: 36, flexShrink: 0 }}>
          <Icon name="arrow_left" size={19}/>
        </button>
        <MsgMInitials name={name} size={34}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 44 }}>
        <MsgDueChip overdue={overdue} replyBy={replyBy}/>
        <span style={{ flex: 1 }}/>
        <button className="btn btn-tonal btn-sm" style={{ flexShrink: 0, gap: 6 }}>
          <Icon name={general ? 'user' : 'briefcase'} size={13}/> {general ? 'Open client' : 'Open trip'}
        </button>
        <button className="btn btn-text btn-sm" style={{ flexShrink: 0 }}>Archive</button>
      </div>
    </div>
  );
}

/** The advisor's own on the right in primary; the client's on the left, outlined. */
function MsgBubble({ mine, body, time, file }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: mine ? 'var(--md-primary)' : 'var(--md-surface-1)',
          color: mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
          padding: '10px 13px',
          borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          border: mine ? 0 : '1px solid var(--md-outline-variant)',
          font: '400 13.5px/1.45 var(--font-sans)',
        }}>{body}</div>
        {/* Departure 10: the name, not a download. */}
        {file && (
          <div className="chip" style={{ marginTop: 6, height: 28, gap: 6, maxWidth: '100%' }}>
            <Icon name="attach" size={12}/>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file}</span>
          </div>
        )}
        {/* No "· Read": departure 2. */}
        <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
          {time}
        </div>
      </div>
    </div>
  );
}

/** Every time, so a private note can never be mistaken for a reply. */
function MsgNoteCard({ body, time }) {
  return (
    <div style={{
      border: '1.5px dashed var(--md-outline)', background: 'var(--md-surface-2)',
      borderRadius: 14, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 10px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--md-on-surface-variant)' }}>
        <Icon name="lock" size={11}/> Internal note · only you can see this
      </div>
      <div style={{ font: '400 13px/1.45 var(--font-sans)', marginTop: 6 }}>{body}</div>
      <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 6, textAlign: 'right' }}>{time}</div>
    </div>
  );
}

/**
 * Departure 9: Reply / Note above the box. `allowNote={false}` on a new thread, which cannot
 * start with a note (the client would see an empty thread).
 */
function MsgComposer({ mode = 'reply', value = '', allowNote = true, noLogin = null }) {
  const note = mode === 'note';
  return (
    <div style={{
      padding: '10px 12px 18px',
      background: note ? 'var(--md-surface-2)' : 'var(--md-surface-1)',
      borderTop: note ? '2px dashed var(--md-outline)' : '1px solid var(--md-outline-variant)',
    }}>
      {allowNote && (
        <div role="radiogroup" aria-label="Write a" style={{
          display: 'inline-flex', padding: 3, borderRadius: 999, background: 'var(--md-surface-3)', marginBottom: 8,
        }}>
          {['Reply', 'Note'].map((m) => {
            const on = (m === 'Note') === note;
            return (
              <span key={m} role="radio" aria-checked={on} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 14px', borderRadius: 999,
                font: '600 12px/1 var(--font-sans)',
                background: on ? 'var(--md-secondary-container)' : 'transparent',
                color: on ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
              }}>
                {m === 'Note' && <Icon name="lock" size={11}/>}{m}
              </span>
            );
          })}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '9px 8px 9px 14px', borderRadius: 18,
        border: note ? '1.5px dashed var(--md-outline)' : '1px solid var(--md-outline-variant)',
        background: 'var(--md-bg)', minHeight: 44,
      }}>
        <span style={{
          flex: 1, font: '400 13px/1.4 var(--font-sans)', alignSelf: 'center',
          color: value ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
        }}>
          {value || (note ? 'Write a note only you can see…' : 'Write a reply…')}
        </span>
        <button className={`btn ${note ? 'btn-tonal' : 'btn-filled'} btn-sm`} style={{ flexShrink: 0, gap: 6 }}>
          {note ? 'Add note' : <><Icon name="send" size={13}/> Send</>}
        </button>
      </div>
      {note && (
        <div className="t-body-s" style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, color: 'var(--md-on-surface-variant)' }}>
          <Icon name="lock" size={11}/> Only you can see this note.
        </div>
      )}
      {!note && noLogin && (
        <div className="t-body-s" style={{ marginTop: 6, color: 'var(--md-on-surface-variant)' }}>
          {noLogin} hasn't set up a login yet. This will be waiting for them.
        </div>
      )}
    </div>
  );
}

function MsgThreadBody() {
  return (
    <div style={{ padding: '16px 14px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ textAlign: 'center' }}>
        <span className="chip" style={{ background: 'var(--md-surface-2)', height: 26 }}>Mon, Oct 12</span>
      </div>
      <MsgBubble mine={false} time="1:20p" body="We saw the over-water suites are open for our dates. Worth it?"/>
      <MsgBubble mine time="1:24p" body="They are, and I can hold one for you while you think it over."/>
      <MsgBubble mine={false} time="1:27p" body="Yes please. What does the upgrade run us?"/>
      <MsgBubble mine time="1:27p" body="$680 over the base, and I got a spa credit and a private island day with it. Net win."/>
      <MsgNoteCard time="2:27p" body="Margin on the suite upgrade is thin, do not discount further."/>
      <div style={{ textAlign: 'center' }}>
        <span className="chip" style={{ background: 'var(--md-surface-2)', height: 26 }}>Today</span>
      </div>
      <MsgBubble mine={false} time="3:27p" file="negril-confirmation.pdf" body="Sending over the confirmation the resort emailed us, just so you have it."/>
    </div>
  );
}

function M3102_ThreadReply({ dark = false }) {
  // MsgMFrame's own scroller carries the thread and the composer sits in `footer`, a sibling
  // below it, as M262 does: the newest message is never behind the box.
  return (
    <MsgMFrame dark={dark} footer={<MsgComposer mode="reply"/>}>
      <MsgThreadBar name="Jordan Hayes" trip="Anniversary Week in Negril" replyBy="Fri"/>
      <MsgThreadBody/>
    </MsgMFrame>
  );
}

function M3102_ThreadNote({ dark = false }) {
  return (
    <MsgMFrame dark={dark} footer={<MsgComposer mode="note" value="Resort confirmation matches ours. Check the transfer time with Sandals."/>}>
      <MsgThreadBar name="Jordan Hayes" trip="Anniversary Week in Negril" replyBy="Fri"/>
      <MsgThreadBody/>
    </MsgMFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.10m.3 — New message (Client Detail's "Message", Trip Detail when no thread exists yet)
// ──────────────────────────────────────────────────────────────────────

function M3103_NewMessage({ dark = false }) {
  return (
    <MsgMFrame dark={dark} footer={<MsgComposer mode="reply" allowNote={false} noLogin="Pri"/>}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 6px',
        background: 'var(--md-bg)', borderBottom: '1px solid var(--md-outline-variant)',
      }}>
        <button className="btn-icon" aria-label="Back" style={{ width: 36, height: 36, flexShrink: 0 }}>
          <Icon name="arrow_left" size={19}/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-title-s">Message Pri</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Pri Raghunathan · Kyoto in the spring</div>
        </div>
      </div>
      <div style={{ padding: '40px 28px', textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>
        <span style={{
          width: 52, height: 52, borderRadius: 999, background: 'var(--md-surface-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="message" size={22}/></span>
        <div className="t-body-m" style={{ marginTop: 12 }}>
          No messages about this trip yet. What you send starts the thread.
        </div>
        {/* No Note toggle here: a thread cannot start with a note. */}
      </div>
    </MsgMFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3.10m.4 — Desk only (drawn-and-deferred: Templates 3.10.3–3.10.5, Bulk Send 3.10.6)
// ──────────────────────────────────────────────────────────────────────

function M3104_DeskOnly({ dark = false }) {
  // NOT a screen the app shows. The house rule: a frame drawn-and-deferred says "considered,
  // and here is why"; a missing one says "not designed". No dimmed buttons anywhere in the
  // real app point here (§6.6's amendment: a read surface says once where the writes live).
  return (
    <MsgMFrame dark={dark} footer={<MsgMTabs active="msg" badge={2}/>}>
      <MsgMTopBar title="Messages"/>
      <div style={{ padding: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--md-on-surface-variant)' }}>
            <Icon name="briefcase" size={16}/>
            <span className="t-label">On the web</span>
          </div>
          <div className="t-title-m" style={{ marginTop: 8 }}>Templates and bulk send live at your desk</div>
          <div className="t-body-m" style={{ marginTop: 8, color: 'var(--md-on-surface-variant)' }}>
            Writing and managing templates, and messaging many clients at once, take room and care.
            On the go, your phone reads every thread, replies, and keeps private notes.
          </div>
          <div className="t-body-s" style={{ marginTop: 12, color: 'var(--md-on-surface-variant)' }}>
            3.10.3 Template picker · 3.10.4 Library · 3.10.5 Editor · 3.10.6 Bulk send (future)
          </div>
        </div>
      </div>
    </MsgMFrame>
  );
}

Object.assign(window, { M3101_Inbox, M3102_ThreadReply, M3102_ThreadNote, M3103_NewMessage, M3104_DeskOnly });
