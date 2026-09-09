/* global React, Icon, staImg, ScreenFrame, ScreenHeader, StoryTailMark */
// Agent · 3.5 Proposal & Itinerary — 7 screens.

// 3.5.1 Proposal Builder
function A351_ProposalBuilder() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={0}>
      <div style={{ padding: '14px 28px', background: 'var(--md-surface-1)', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Proposal builder · Jordan & Sam Hayes</div>
          <h1 className="t-headline" style={{ margin: 0 }}>Sandals honeymoon · 2 option proposal</h1>
        </div>
        <button className="btn btn-text">Auto-save</button>
        <button className="btn btn-tonal"><Icon name="external" size={12}/> Preview</button>
        <button className="btn btn-filled"><Icon name="send" size={12}/> Send to client</button>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr 300px', overflow: 'hidden' }}>
        <aside style={{ borderRight: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)', marginBottom: 6 }}>SECTIONS</div>
          {['Hero', 'Story · the trip', 'Option A · Beachfront', 'Option B · Bungalow', 'What\'s included', 'Day-by-day', 'Investment', 'Next steps'].map((s, i) => (
            <div key={s} style={{ padding: '8px 10px', borderRadius: 8, background: i === 2 ? 'var(--md-secondary-container)' : 'transparent', color: i === 2 ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)', font: '500 12.5px/1.3 var(--font-sans)', marginBottom: 2, cursor: 'pointer' }}>{s}</div>
          ))}
          <button className="btn btn-text btn-sm" style={{ padding: 0, marginTop: 8 }}>+ Add section</button>
        </aside>
        <div style={{ overflow: 'auto', padding: 18 }}>
          <div className="t-label" style={{ color: 'var(--brand-orange)' }}>EDITING · OPTION A</div>
          <input className="input" defaultValue="Option A · Honeymoon Beachfront Walkout" style={{ marginTop: 4, font: '700 22px/1.2 var(--font-sans)', border: 0, padding: '4px 0', background: 'transparent', boxShadow: 'none' }}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <img src={staImg('overwater', 600, 280)} alt="" style={{ width: '100%', height: 130, objectFit: 'cover' }}/>
              <div style={{ padding: 12 }}>
                <div className="t-title-s">Hero photo</div>
                <button className="btn btn-tonal btn-sm" style={{ marginTop: 6 }}>Replace</button>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>HIGHLIGHTS · BULLETS</div>
              <textarea className="input" style={{ height: 100, padding: 10, resize: 'none', marginTop: 6 }} defaultValue="• Beachfront walkout · open patio onto Balmoral Beach&#10;• Red Lane spa credit + couples massage&#10;• Day-trip to Rose Island Cay&#10;• Welcome bottle in room"/>
            </div>
          </div>
          <div className="card" style={{ padding: 14, marginTop: 10 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>WHY THIS WORKS · GYASI'S NOTE</div>
            <textarea className="input" style={{ height: 80, padding: 10, resize: 'none', marginTop: 6 }} defaultValue="You both said you wanted feet-in-the-sand mornings — this gets you that without the upcharge of the over-water bungalow. Save the savings for the spa days."/>
          </div>
          <div className="card" style={{ padding: 14, marginTop: 10, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
            <div className="t-label">INVESTMENT · OPTION A</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <div className="t-display-s" style={{ margin: 0 }}>$3,290</div>
              <div className="t-body-s" style={{ opacity: 0.85 }}>per person · all-in · 7 nights</div>
            </div>
            <div className="t-body-s" style={{ opacity: 0.85, marginTop: 4 }}>Trip total $6,480 · Gyasi's commission $970 (15%)</div>
          </div>
        </div>
        <aside style={{ borderLeft: '1px solid var(--md-outline-variant)', padding: 14, overflow: 'auto', background: 'var(--md-surface)' }}>
          <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>PROPOSAL META</div>
          <div className="card" style={{ padding: 12, marginTop: 6 }}>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Client</div>
            <div className="t-title-s">Jordan & Sam Hayes</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>Send via</div>
            <div className="t-title-s">In-app + email</div>
            <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>Expires</div>
            <div className="t-title-s">May 28 · 14 days</div>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>
            <div className="t-title-s">Brand check</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, font: '500 11.5px/1.55 var(--font-sans)' }}>
              <li>Signature ✓</li>
              <li>Cover photo ✓</li>
              <li>"Story-Tail" tone ✓</li>
              <li>Anniversary nod missing</li>
            </ul>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  );
}

// 3.5.2 Proposal Preview (rendered as client would see)
function A352_ProposalPreview() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', overflow: 'auto', background: 'var(--md-bg)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '10px 28px', background: 'var(--md-on-surface)', color: 'var(--md-surface-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="external" size={14}/>
          <div className="t-body-s">Preview · client view · not yet sent</div>
          <button className="btn btn-tonal btn-sm" style={{ marginLeft: 'auto', background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>Back to editor</button>
          <button className="btn btn-filled btn-sm">Send</button>
        </div>

        <div style={{ position: 'relative', height: 360, overflow: 'hidden' }}>
          <img src={staImg('overwater', 1600, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(13,33,55,0.7))' }}/>
          <div style={{ position: 'absolute', left: 48, right: 48, bottom: 28, color: '#FFF' }}>
            <span className="t-label-s" style={{ color: '#FFC83F' }}>FOR JORDAN & SAM · HONEYMOON · AUG 2026</span>
            <h1 className="t-display" style={{ margin: '6px 0 4px', color: '#FFF' }}>The Story-Tail honeymoon I'd want for you.</h1>
            <div style={{ font: '400 14px/1.5 var(--font-sans)', maxWidth: 600, opacity: 0.92 }}>Two ways to do Sandals Royal Bahamian — both gorgeous, both built around feet-in-the-sand mornings and a quiet anniversary surprise on the back end. 🥂</div>
          </div>
        </div>

        <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 32px' }}>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>OPTION A · BEACHFRONT WALKOUT</span>
          <h2 className="t-display-s" style={{ margin: '4px 0 6px' }}>Feet-in-the-sand mornings</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>Open your patio doors onto Balmoral Beach. Coffee, sand, sunrise. Red Lane spa credit goes a long way at this room category — that's where you'd actually use it.</p>
          <ul style={{ margin: '8px 0', paddingLeft: 18, font: '400 13.5px/1.6 var(--font-sans)' }}>
            <li>Beachfront walkout · open patio</li>
            <li>Red Lane spa credit · ~$300 value</li>
            <li>Day-trip to Rose Island Cay · included</li>
          </ul>
          <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', border: 0 }}>
            <div className="t-display-s" style={{ margin: 0 }}>$3,290<span className="t-body" style={{ opacity: 0.85 }}> /pp</span></div>
            <div style={{ flex: 1 }} className="t-body-s">All-in · 7 nights · flights + transfers</div>
            <button className="btn btn-filled" style={{ background: 'var(--md-on-primary-container)', color: 'var(--md-primary-container)' }}>Choose Option A</button>
          </div>

          <hr className="divider" style={{ margin: '24px 0' }}/>

          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>OPTION B · OVER-WATER BUNGALOW</span>
          <h2 className="t-display-s" style={{ margin: '4px 0 6px' }}>That bucket-list moment</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>Glass-floor bungalow · sunset gin & tonic on the deck · room service breakfast over the water. More money, but if "honeymoon" only happens once, this is it.</p>
          <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="t-display-s" style={{ margin: 0 }}>$3,970<span className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}> /pp</span></div>
            <div style={{ flex: 1 }} className="t-body-s" >All-in · 7 nights · flights + transfers</div>
            <button className="btn btn-outlined">Choose Option B</button>
          </div>

          <div className="card" style={{ marginTop: 24, padding: 16, background: 'var(--md-surface-2)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src={staImg('avatarA', 80, 80)} alt="" style={{ width: 44, height: 44, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}>
              <div className="t-title-s">— Gyasi</div>
              <div className="t-body-s" style={{ color: 'var(--md-on-surface)', fontStyle: 'italic', marginTop: 2 }}>Whichever you pick, Sep 14 is on my calendar 😉</div>
            </div>
            <button className="btn btn-tonal btn-sm"><Icon name="message" size={12}/> Reply</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.5.3 Send Proposal (modal-like)
function A353_SendProposal() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 640, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Send proposal · Sandals · Aug 2026</h2>
          <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>TO</div>
            <div className="t-title-s" style={{ marginTop: 2 }}>Jordan & Sam Hayes · jordan.hayes@example.com</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div><label className="field-label">Subject</label><input className="input" defaultValue="Your honeymoon · two options to choose from"/></div>
            <div><label className="field-label">Template</label><input className="input" defaultValue="Proposal · honeymoon · 2 options"/></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Personal note (pre-fills above the proposal)</label>
            <textarea className="input" style={{ height: 80, padding: 12, resize: 'none' }} defaultValue="Hey J — finally have the two options I love most. Take your time, ping me if you want to ride out loud."/>
          </div>
          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>CHANNELS</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span> In-app · push notification</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span> Email · branded</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)' }}/> SMS · short link only</label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-text">Save draft</button>
            <button className="btn btn-outlined" style={{ marginLeft: 'auto' }}>Preview</button>
            <button className="btn btn-filled"><Icon name="send" size={12}/> Send</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.5.4 Proposal Sent Confirmation
function A354_ProposalSent() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--md-success-container)', color: 'var(--md-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: 'var(--md-shadow-2)' }}><Icon name="send" size={36}/></div>
          <span className="t-label-s" style={{ color: 'var(--brand-orange)' }}>PROPOSAL SENT</span>
          <h1 className="t-headline" style={{ margin: '4px 0 4px' }}>To Jordan & Sam Hayes</h1>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)' }}>They got the in-app push and the branded email. Trip moved to <b>Proposal Sent</b>. We'll nudge if they don't respond in 5 days.</p>
          <div className="card" style={{ padding: 14, marginTop: 14, textAlign: 'left' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>EXPECT</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '400 13px/1.55 var(--font-sans)' }}>
              <li>Read receipt (push)</li>
              <li>Email open tracked</li>
              <li>Auto-nudge in 5 days if no reply</li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn-outlined">View trip</button>
            <button className="btn btn-filled">Back to worklist</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.5.5 Itinerary Auto-Generator
function A355_AutoGenerator() {
  return (
    <ScreenFrame role="agent" tab="trips" padding={28} scrollable>
      <ScreenHeader title="Auto-generate itinerary" subtitle="Builds day-by-day blocks from the trip's components. Always editable after." actions={<><button className="btn btn-text">Cancel</button><button className="btn btn-filled"><Icon name="sparkle" size={12}/> Generate</button></>} small/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 1080 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-title-s">Inputs · 6 components detected</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['AA 1413 · flight','Sun & Fun · transfer','Sandals · check-in','Sandals · 7 nights','Rose Island · tour','AA 1410 · return'].map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--md-surface-2)' }}>
                <Icon name="check" size={12} color="var(--md-success)" stroke={2.5}/><span className="t-body-s">{c}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="t-title-s">Options</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { l: 'Include "Gyasi\'s Tip" callouts', on: true },
              { l: 'Add packing reminder before day 1', on: true },
              { l: 'Auto-pull weather for each day', on: true },
              { l: 'Include emergency contacts page', on: true },
              { l: 'Overwrite manual edits', on: false },
            ].map((o) => (
              <div key={o.l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ width: 32, height: 18, borderRadius: 999, background: o.on ? 'var(--md-primary)' : 'var(--md-surface-3)', padding: 2 }}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 999, background: '#FFF', transform: o.on ? 'translateX(14px)' : 'translateX(0)' }}/></span>
                <div className="t-body-s">{o.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 14, gridColumn: 'span 2', background: 'var(--md-tertiary-container)', color: 'var(--md-on-tertiary-container)' }}>
          <div className="t-title-s">Preview · 7-day itinerary will be generated with 3 morning, 4 afternoon, and 5 evening blocks. 11 "Gyasi's Tip" callouts inferred. Existing manual blocks preserved.</div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.5.6 Itinerary Preview (agent view)
function A356_ItineraryPreviewAgent() {
  const blocks = [
    { time: '06:40', p: 'MORNING', i: 'plane', t: 'AA 1413 · MIA → NAS', s: 'Direct · 2h 50m · seats 14A 14B' },
    { time: '11:20', p: 'AFTERNOON', i: 'trip', t: 'Private transfer · Mercedes Vito', s: '25 min' },
    { time: '13:00', p: 'AFTERNOON', i: 'building', t: 'Check-in · Sandals Royal Bahamian', s: 'Honeymoon Beachfront · Bldg 3' },
    { time: '19:30', p: 'EVENING', i: 'utensils', t: 'Welcome dinner · Bayside', s: 'Reserved · pescatarian flag' },
  ];
  return (
    <ScreenFrame role="agent" tab="trips" padding={0}>
      <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--md-outline-variant)', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Itinerary preview · agent view</div>
          <h1 className="t-headline" style={{ margin: 0 }}>Sandals · Aug 12 – 19, 2026</h1>
        </div>
        <button className="btn btn-tonal"><Icon name="external" size={12}/> Open client view</button>
        <button className="btn btn-filled"><Icon name="send" size={12}/> Publish update</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
          <div className="t-script" style={{ color: 'var(--brand-burgundy)', fontSize: 36 }}>Day 01</div>
          <div><div className="t-title-l" style={{ margin: 0 }}>Miami → Nassau</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Wed Aug 12 · Arrival & sunset welcome</div></div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: 6, bottom: 6, width: 2, background: 'var(--md-outline-variant)' }}/>
          {blocks.map((b, i) => (
            <div key={i} style={{ position: 'relative', paddingLeft: 46, marginBottom: 8 }}>
              <div style={{ position: 'absolute', left: 5, top: 12, width: 24, height: 24, borderRadius: 999, background: 'var(--md-surface-1)', border: '2px solid var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-orange)' }}><Icon name={b.i} size={12}/></div>
              <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ minWidth: 60 }}><div style={{ font: '700 14px/1 var(--font-sans)' }}>{b.time}</div><div className="t-label-s" style={{ color: 'var(--brand-orange)' }}>{b.p}</div></div>
                <div style={{ flex: 1 }}><div className="t-title-s">{b.t}</div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>{b.s}</div></div>
                <span className="chip" style={{ background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}>Visible to client</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

// 3.5.7 Publish Itinerary Update (confirmation)
function A357_PublishUpdate() {
  return (
    <ScreenFrame chrome="plain">
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 520, padding: 22 }}>
          <h2 className="t-title-l" style={{ margin: 0 }}>Publish itinerary update?</h2>
          <p className="t-body" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>The client will receive a push notification with a summary of what changed.</p>
          <div className="card" style={{ padding: 12, marginTop: 8, background: 'var(--md-surface-2)' }}>
            <div className="t-label" style={{ color: 'var(--md-on-surface-variant)' }}>CHANGES · 3</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, font: '400 12.5px/1.55 var(--font-sans)' }}>
              <li>Added: Day 3 · Rose Island Cay snorkel</li>
              <li>Edited: Day 1 dinner reservation · time changed to 7:30 PM</li>
              <li>Removed: Day 4 placeholder block</li>
            </ul>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, font: '500 12.5px/1.4 var(--font-sans)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--md-outline)', background: 'var(--md-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} color="#FFF" stroke={2.5}/></span>
            Send push notification to client
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outlined">Cancel</button>
            <button className="btn btn-filled" style={{ marginLeft: 'auto' }}>Publish</button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { A351_ProposalBuilder, A352_ProposalPreview, A353_SendProposal, A354_ProposalSent, A355_AutoGenerator, A356_ItineraryPreviewAgent, A357_PublishUpdate });
