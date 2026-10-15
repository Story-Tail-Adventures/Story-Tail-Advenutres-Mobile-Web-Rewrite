/* global React, Icon, IOSDevice, MUI, MuiScreenFrame, MuiIcon, MsgMFrame, MsgMTopBar, MsgMTabs, MsgInboxRow */
// Agent · 3.10.7 (proposed) · Message notifications, web and phone. §3.10 Stage 3b.
// Settled with Gyasi 2026-10-15 (two grilling rounds). Drawn LOCALLY; the canonical design
// project is out of sync. Loads AFTER agent-messages-mobile.jsx and reuses its phone shell.
//
// THE RULINGS THESE FRAMES DRAW:
//   1. Only a new CLIENT message notifies its advisor. Never an internal note, never the
//      advisor's own reply. Travelers' push comes later on the same plumbing.
//   2. LOCKED: the client's name only ("New message from Jordan Hayes"). UNLOCKED: the trip and
//      the first line of the message. Client messages hold personal details.
//   3. PHONE: reply right in the notification, plus "Mark read". A reply from a notification is
//      always a reply, never a note. WEB: browsers do not reliably offer a reply box in a
//      notification, so clicking opens the thread with the reply box ready; "Mark read" where
//      the browser draws buttons.
//   4. A FAILED REPLY becomes "Didn't send. Tap to try again", and the words wait as a draft in
//      that thread. Nothing typed is lost.
//   5. ONE NOTIFICATION PER THREAD. A second message updates it; reading the thread anywhere
//      clears it everywhere (every signed-in device, phone and laptop).
//   6. REST HOURS: silent 9pm to 7am in the advisor's zone and all day Sunday, then ONE summary
//      at 7am ("3 new messages"). The setting to change it arrives with §3.12.3.
//   7. PERMISSION IS ASKED FROM A CARD in the inbox ("Get notified when clients write" · Turn
//      on), never on launch: a "no" is hard to undo.
//   8. ANDROID AND WEB FIRST (Firebase Cloud Messaging; the browsers' standard Web Push).
//      iOS (Apple's push service, direct) once Xcode is installed. The frames use the iPhone
//      device shell every phone artboard uses; the notification card is drawn platform-neutral.

// ──────────────────────────────────────────────────────────────────────
// Shared pieces
// ──────────────────────────────────────────────────────────────────────

function NtfAppMark({ size = 20 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0, background: 'var(--brand-orange)', color: '#FFF',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: `800 ${Math.round(size * 0.5)}px/1 var(--font-sans)`,
    }}>S</span>
  );
}

/** A phone notification card. `state`: locked | open | reply | failed | summary. */
function NtfCard({ state = 'open', dark = false }) {
  const glass = dark ? 'rgba(40,44,52,0.86)' : 'rgba(255,255,255,0.86)';
  const ink = dark ? '#F2F2F7' : '#111';
  const sub = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.7)';
  const head = (when) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: '500 11.5px/1 var(--font-sans)', color: sub }}>
      <NtfAppMark size={18}/><span style={{ flex: 1 }}>Story-Tail · Messages</span><span>{when}</span>
    </div>
  );
  return (
    <div style={{ background: glass, color: ink, borderRadius: 22, padding: '12px 14px', backdropFilter: 'blur(20px)', boxShadow: '0 6px 24px rgba(0,0,0,0.18)' }}>
      {state === 'locked' && (
        <>
          {head('now')}
          <div style={{ font: '600 14px/1.35 var(--font-sans)', marginTop: 8 }}>New message from Jordan Hayes</div>
          <div style={{ font: '400 12.5px/1.4 var(--font-sans)', color: sub, marginTop: 2 }}>Unlock to read it.</div>
        </>
      )}
      {state === 'summary' && (
        <>
          {head('7:00 AM')}
          <div style={{ font: '600 14px/1.35 var(--font-sans)', marginTop: 8 }}>3 new messages while you rested</div>
          <div style={{ font: '400 12.5px/1.4 var(--font-sans)', color: sub, marginTop: 2 }}>Jordan Hayes, Maya Carter and Sam Rivera wrote overnight.</div>
        </>
      )}
      {(state === 'open' || state === 'reply' || state === 'failed') && (
        <>
          {head('now')}
          <div style={{ font: '600 14px/1.35 var(--font-sans)', marginTop: 8 }}>Jordan Hayes · Anniversary Week in Negril</div>
          <div style={{ font: '400 13px/1.4 var(--font-sans)', marginTop: 2 }}>
            {state === 'failed' ? "Didn't send. Tap to try again." : 'Sending over the confirmation the resort emailed us, just so you have it.'}
          </div>
          {state === 'failed' && (
            <div style={{ font: '400 12px/1.4 var(--font-sans)', color: sub, marginTop: 4 }}>Your reply is saved as a draft in this thread.</div>
          )}
          {state === 'open' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {['Reply', 'Mark read'].map((a) => (
                <span key={a} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', font: '600 13px/1 var(--font-sans)' }}>{a}</span>
              ))}
            </div>
          )}
          {state === 'reply' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '6px 6px 6px 12px', borderRadius: 18, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
              <span style={{ flex: 1, font: '400 13px/1.3 var(--font-sans)' }}>Got it, thank you! I'll file it with the trip.</span>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--md-primary)', color: 'var(--md-on-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="send" size={13}/>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A lock / home screen behind the cards, so the frames read as the system, not the app. */
function NtfScreen({ dark = false, clock = true, children, caption }) {
  return (
    <IOSDevice width={400} height={860} dark={dark}>
      <div style={{
        height: '100%', padding: '70px 14px 20px', display: 'flex', flexDirection: 'column', gap: 10,
        background: dark ? 'linear-gradient(180deg,#0B1B33 0%,#123B5C 60%,#1C5E77 100%)' : 'linear-gradient(180deg,#F6D7B0 0%,#E9A57E 55%,#B65A4A 100%)',
      }}>
        {clock && (
          <div style={{ textAlign: 'center', color: '#FFF', marginBottom: 18 }}>
            <div style={{ font: '500 15px/1 var(--font-sans)', opacity: 0.9 }}>Thursday, October 15</div>
            <div style={{ font: '300 76px/1 var(--font-sans)', marginTop: 4 }}>3:27</div>
          </div>
        )}
        {children}
        {caption && (
          <div style={{ marginTop: 'auto', textAlign: 'center', font: '500 12px/1.4 var(--font-sans)', color: 'rgba(255,255,255,0.85)' }}>{caption}</div>
        )}
      </div>
    </IOSDevice>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Phone
// ──────────────────────────────────────────────────────────────────────

function M3105_NotifyLocked({ dark = false }) {
  return (
    <NtfScreen dark={dark} caption="Locked: the client's name only (ruling 2).">
      <NtfCard state="locked" dark={dark}/>
    </NtfScreen>
  );
}

function M3106_NotifyReply({ dark = false }) {
  return (
    <NtfScreen dark={dark} clock={false} caption="Unlocked: the trip and first line, Reply and Mark read. Replying types right in the notification, always as a reply, never a note.">
      <NtfCard state="open" dark={dark}/>
      <NtfCard state="reply" dark={dark}/>
    </NtfScreen>
  );
}

function M3107_NotifyStates({ dark = false }) {
  return (
    <NtfScreen dark={dark} caption="A failed reply keeps its words as a draft. Overnight and on Sunday: silence, then one summary at 7am.">
      <NtfCard state="failed" dark={dark}/>
      <NtfCard state="summary" dark={dark}/>
    </NtfScreen>
  );
}

function M3108_InboxTurnOn({ dark = false }) {
  return (
    <MsgMFrame dark={dark} footer={<MsgMTabs active="msg" badge={2}/>}>
      <MsgMTopBar title="Messages"/>
      <div style={{ padding: '14px 16px 0' }}>
        {/* Ruling 7: asked from here, until it is answered. Never on launch. */}
        <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', border: 0 }}>
          <Icon name="bell" size={18}/>
          <div style={{ flex: 1 }}>
            <div className="t-title-s">Get notified when clients write</div>
            <div className="t-body-s" style={{ marginTop: 3 }}>Quiet overnight and on Sundays. You'll get one summary in the morning instead.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-filled btn-sm">Turn on</button>
              <button className="btn btn-text btn-sm">Not now</button>
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ margin: '12px 12px', padding: 0, overflow: 'hidden' }}>
        <MsgInboxRow first name="Jordan Hayes" trip="Anniversary Week in Negril" preview="Sending over the confirmation the resort emailed us, just so you have it." time="3:27p" unread={1} replyBy="Fri"/>
        <MsgInboxRow name="Maya Carter" trip="Saint Lucia · Between Semesters" preview="Is the airport transfer included, or do we book that?" time="Mon" unread={2} overdue/>
      </div>
    </MsgMFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Web
// ──────────────────────────────────────────────────────────────────────

function A3107_WebNotifications() {
  const { Box, Stack, Typography, Button, Paper, Card, CardContent } = MUI;
  return (
    <MuiScreenFrame role="agent" tab="msg" padding={0}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: '100%' }}>
        <Box sx={{ borderRight: 1, borderColor: 'divider', p: 1.75 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>Messages</Typography>
          <Typography variant="caption" color="text.secondary">2 unread · 1 overdue</Typography>
          {/* Ruling 7: the same card as the phone's, until it is answered. */}
          <Card sx={{ mt: 1.5, bgcolor: 'secondary.container', color: 'secondary.onContainer', boxShadow: 'none' }}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1.25}>
                <MuiIcon name="bell" size={18}/>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Get notified when clients write</Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>Quiet overnight and on Sundays, with one summary in the morning.</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                    <Button variant="contained" size="small">Turn on</Button>
                    <Button variant="text" size="small">Not now</Button>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ position: 'relative', bgcolor: 'surface.main' }}>
          <Typography variant="overline" color="text.secondary" sx={{ position: 'absolute', left: 24, top: 20 }}>
            THE BROWSER'S OWN NOTIFICATION · drawn by the system, not the page
          </Typography>
          {/* Ruling 3: no reply box on the web. Clicking opens the thread, reply box ready. */}
          <Paper elevation={8} sx={{ position: 'absolute', right: 24, top: 56, width: 360, p: 1.75, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <NtfAppMark size={20}/>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Story-Tail · app.story-tail.com</Typography>
              <Typography variant="caption" color="text.secondary">now</Typography>
            </Stack>
            <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 600 }}>Jordan Hayes · Anniversary Week in Negril</Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>Sending over the confirmation the resort emailed us, just so you have it.</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
              <Button variant="outlined" size="small" sx={{ flex: 1 }}>Open thread</Button>
              <Button variant="outlined" size="small" sx={{ flex: 1 }}>Mark read</Button>
            </Stack>
          </Paper>
          <Typography variant="body2" color="text.secondary" sx={{ position: 'absolute', right: 24, top: 240, width: 360 }}>
            Clicking anywhere on it opens this thread with the reply box focused. Browsers that draw no
            buttons show the card alone. Reading the thread here clears it on the phone too.
          </Typography>
        </Box>
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { M3105_NotifyLocked, M3106_NotifyReply, M3107_NotifyStates, M3108_InboxTurnOn, A3107_WebNotifications });
