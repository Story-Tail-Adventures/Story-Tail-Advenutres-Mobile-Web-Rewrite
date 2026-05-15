/* global React, Icon, staImg, ScreenFrame, ScreenHeader */
// Client · 2.6 Messaging — 3 screens.

// 2.6.1 — Messages Inbox
function C261_Inbox() {
  const threads = [
    { who: 'Gyasi', sub: 'Sandals upgrade locked in', preview: 'I added a Red Lane spa credit and locked your bungalow upgrade…', t: '2:14p', unread: 2, trip: 'Sandals · Aug', a: 'avatarA', active: true },
    { who: 'Gyasi', sub: 'New family cruise idea', preview: 'Hey! Found a Royal Caribbean sailing for Christmas dates…', t: 'Tue', unread: 0, trip: 'Family cruise · Dec', a: 'avatarA' },
    { who: 'Gyasi', sub: 'Welcome to Story-Tail', preview: 'So glad to have you. I usually reply in under 2h…', t: 'Mar 14', unread: 0, a: 'avatarA' },
    { who: 'System', sub: 'Card authorization confirmed', preview: 'Your VISA •••• 4242 has been authorized for $4,598…', t: 'Mar 22', unread: 0, system: true },
    { who: 'System', sub: 'Symphony cruise · post-trip survey', preview: 'Thank you for traveling with us! A quick survey…', t: 'Mar 12', unread: 0, system: true },
  ];
  return (
    <ScreenFrame role="client" tab="msg" padding={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: '100%' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 12px' }}>
            <div className="t-headline" style={{ margin: 0, fontSize: 22 }}>Messages</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Threaded by trip.</div>
          </div>
          <div style={{ padding: '0 14px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, background: 'var(--md-surface-3)', height: 36, color: 'var(--md-on-surface-variant)' }}>
              <Icon name="search" size={14}/><span className="t-body-s">Search messages…</span>
            </div>
          </div>
          <div style={{ padding: '0 14px 8px', display: 'flex', gap: 6 }}>
            <span className="chip chip-filter is-on" style={{ height: 26 }}>All</span>
            <span className="chip" style={{ height: 26 }}>Unread · 2</span>
            <span className="chip" style={{ height: 26 }}>By trip</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {threads.map((th, i) => (
              <div key={i} style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', background: th.active ? 'var(--md-secondary-container)' : 'transparent', borderLeft: th.active ? '3px solid var(--brand-orange)' : '3px solid transparent', cursor: 'pointer' }}>
                {th.system ? (
                  <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--md-primary)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={14}/></span>
                ) : (
                  <img src={staImg(th.a, 64, 64)} alt="" style={{ width: 32, height: 32, borderRadius: 999 }}/>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ font: '600 13px/1.2 var(--font-sans)', color: th.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)', flex: 1 }}>{th.who}</span>
                    <span className="t-body-s" style={{ color: th.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)' }}>{th.t}</span>
                  </div>
                  <div style={{ font: '600 12.5px/1.3 var(--font-sans)', color: th.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)' }}>{th.sub}</div>
                  <div className="t-body-s" style={{ color: th.active ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{th.preview}</div>
                  {th.trip && <div style={{ font: '600 9.5px/1 var(--font-sans)', letterSpacing: 0.4, textTransform: 'uppercase', color: th.active ? 'var(--md-on-secondary-container)' : 'var(--brand-orange)', marginTop: 6 }}>· {th.trip}</div>}
                </div>
                {th.unread > 0 && <span style={{ background: 'var(--brand-orange)', color: '#FFF', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', font: '700 11px/1 var(--font-sans)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{th.unread}</span>}
              </div>
            ))}
          </div>
        </aside>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Compact thread preview pane */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">Gyasi · Sandals · Aug 12</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}><span className="dot" style={{ background: 'var(--md-success)' }}/> Online · reply in &lt; 2h</div>
            </div>
            <button className="btn btn-tonal btn-sm">Open trip</button>
          </div>
          <div style={{ flex: 1, padding: '18px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates.' },
              { mine: true, t: '11:32a', b: 'Yes please. Sam will lose it 😍' },
              { mine: false, t: '2:14p', b: 'Locked. Final balance authorization request is in your dashboard.' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '75%', background: m.mine ? 'var(--md-primary)' : 'var(--md-surface-1)', color: m.mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)', padding: '10px 14px', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', border: m.mine ? 0 : '1px solid var(--md-outline-variant)', font: '400 13.5px/1.45 var(--font-sans)' }}>{m.b}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--md-outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
              <Icon name="attach" size={14}/>
              <span style={{ flex: 1, color: 'var(--md-on-surface-variant)', font: '400 13px/1 var(--font-sans)' }}>Reply…</span>
              <button className="btn btn-filled btn-sm"><Icon name="send" size={12}/></button>
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.6.2 — Conversation Thread (full-screen, mobile-leaning)
function C262_ConversationThread() {
  return (
    <ScreenFrame role="client" tab="msg" padding={0}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-icon"><Icon name="arrow_left" size={16}/></button>
        <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 38, height: 38, borderRadius: 999 }}/>
        <div style={{ flex: 1 }}>
          <div className="t-title-s">Gyasi · Sandals upgrade locked in</div>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Sandals Royal Bahamian · Aug 12 – 19, 2026</div>
        </div>
        <button className="btn btn-tonal btn-sm">Open trip</button>
        <button className="btn-icon"><Icon name="more_vert" size={16}/></button>
      </div>
      <div style={{ flex: 1, padding: '18px 28px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center' }}><span className="chip" style={{ background: 'var(--md-surface-2)' }}>Mon, May 12</span></div>
        {[
          { mine: false, t: '11:14a', b: 'Quick win — Sandals just opened up the over-water bungalows for your dates. I held one tentatively. Want me to lock?' },
          { mine: true, t: '11:32a', b: "Yes please. Sam will lose it 😍 — what's the upgrade?" },
          { mine: false, t: '11:33a', b: '$680 over the base. I got Sandals to throw in a Red Lane spa credit + a private island day. Net win.', file: { n: 'sandals-bungalow-deck.pdf', s: '2.4 MB' } },
          { mine: true, t: '11:36a', b: 'Done. Authorize whatever you need on the VISA.' },
          { mine: false, t: '2:14p', b: "Locked. I also flagged your card for the final balance ($4,180) — there's a payment authorization request in your dashboard. No charge from me, just lets me pay Sandals on May 28 when they invoice.", reactions: [{ e: '❤', n: 1 }] },
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', gap: 8 }}>
            {!m.mine && <img src={staImg('avatarA', 48, 48)} alt="" style={{ width: 28, height: 28, borderRadius: 999, alignSelf: 'flex-end' }}/>}
            <div style={{ maxWidth: '70%' }}>
              <div style={{ background: m.mine ? 'var(--md-primary)' : 'var(--md-surface-1)', color: m.mine ? 'var(--md-on-primary)' : 'var(--md-on-surface)', padding: '10px 14px', borderRadius: m.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', border: m.mine ? 0 : '1px solid var(--md-outline-variant)', font: '400 13.5px/1.45 var(--font-sans)' }}>
                {m.b}
                {m.file && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: 'var(--md-surface-2)', color: 'var(--md-on-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 30, height: 38, borderRadius: 4, background: 'var(--brand-burgundy)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 8px/1 var(--font-sans)' }}>PDF</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-title-s" style={{ fontSize: 12 }}>{m.file.n}</div>
                      <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{m.file.s}</div>
                    </div>
                    <button className="btn-icon"><Icon name="download" size={14}/></button>
                  </div>
                )}
              </div>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--md-on-surface-variant)', marginTop: 3, textAlign: m.mine ? 'right' : 'left' }}>{m.t}{m.mine && ' · Read'}</div>
              {m.reactions && <div style={{ marginTop: 4 }}>{m.reactions.map((r) => <span key={r.e} className="chip" style={{ height: 22, padding: '0 8px', fontSize: 11 }}>{r.e} {r.n}</span>)}</div>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 28px 16px', borderTop: '1px solid var(--md-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
          <Icon name="attach" size={16}/>
          <span style={{ flex: 1, color: 'var(--md-on-surface)', font: '400 13px/1 var(--font-sans)' }}>Thanks — go ahead and authorize.</span>
          <button className="btn btn-filled btn-sm"><Icon name="send" size={12}/> Send</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {['👍 Sounds good', 'Add my partner', '📎 Passport', 'Schedule a call'].map((t) => <span key={t} className="chip" style={{ height: 26 }}>{t}</span>)}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 2.6.3 — New Conversation
function C263_NewConversation() {
  return (
    <ScreenFrame role="client" tab="msg" padding={28} scrollable>
      <button className="btn btn-text btn-sm" style={{ padding: 0, marginBottom: 8 }}><Icon name="arrow_left" size={14}/> Back to messages</button>
      <ScreenHeader title="Start a message" subtitle="No trip yet? No problem — Gyasi reads everything." small/>
      <div className="card" style={{ padding: 22, maxWidth: 680 }}>
        <div className="card" style={{ padding: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <img src={staImg('avatarA', 64, 64)} alt="" style={{ width: 36, height: 36, borderRadius: 999 }}/>
          <div className="t-body-s"><b>Gyasi · Online</b> · Typically replies within 2 hours during 9–6 ET.</div>
        </div>
        <div><label className="field-label">Subject (optional)</label><input className="input" placeholder="e.g. Thinking about Aruba in October"/></div>
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Message</label>
          <textarea className="input" style={{ height: 140, padding: 12, resize: 'none' }} placeholder="Hey Gyasi — wondering if there's any availability for an Aruba honeymoon week in mid-October. Budget around $3k pp. Sam is pescatarian, anniversary is Sep 14."/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <button className="btn btn-tonal btn-sm"><Icon name="attach" size={12}/> Attach</button>
          <button className="btn btn-text btn-sm"><Icon name="sparkle" size={12}/> Use a template</button>
          <button className="btn btn-filled" style={{ marginLeft: 'auto' }}><Icon name="send" size={14}/> Send</button>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { C261_Inbox, C262_ConversationThread, C263_NewConversation });
