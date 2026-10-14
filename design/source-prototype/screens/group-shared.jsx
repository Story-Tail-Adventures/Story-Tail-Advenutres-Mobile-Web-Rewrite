/* global React, Icon, staImg, MuiStaStatus */
// Group trips (design brief 2026-10-14) · shared sample data + small building blocks.
// One story across every artboard: Grace Community Caribbean Cruise.
// Status chip mapping per brief §3. `cancelled` has no chip kind in app.css yet,
// so cancelled / invite-expired render with `past` (neutral) until MuiStaStatus gains it.
//
// Local deltas from the design project (13e01bd3…, synced 2026-10-14):
//  - GRP_WAITLIST order swapped so the open offer in 2.8.6 goes to #1 in line (brief rule 12).
//  - leaderOpt and the class-style GMemberCard moved here from group-leader.jsx /
//    group-public.jsx, because those two desktop files were ported to MUI and the phone
//    artboards (group-mobile.jsx) still render outside the MUI theme.

const GRP = {
  name: 'Grace Community Caribbean Cruise',
  short: 'Grace Community Cruise',
  slug: 'grace-community-2027',
  dates: 'March 14 – 21, 2027',
  datesShort: 'Mar 14 – 21, 2027',
  route: '7-night Western Caribbean · round trip from Fort Lauderdale',
  deadline: 'November 30, 2026',
  deadlineShort: 'Nov 30, 2026',
  cap: 40, filled: 32, parties: 14,
};

const GRP_OPTIONS = [
  { id: 'inside', name: 'Inside cabin', desc: 'A quiet, comfortable stateroom inside the ship. Sleeps up to 4.', price: '$1,240', deposit: '$250', occ: 'Up to 4 people', occN: 4, isPublic: true, filled: 2 },
  { id: 'ocean', name: 'Ocean view', desc: 'A picture window onto the sea. Wake up to the water. Sleeps up to 4.', price: '$1,480', deposit: '$250', occ: 'Up to 4 people', occN: 4, isPublic: true, filled: 3 },
  { id: 'balcony', name: 'Balcony', desc: 'Your own private veranda for slow mornings and sunsets. Sleeps up to 2.', price: '$1,840', deposit: '$300', occ: 'Up to 2 people', occN: 2, isPublic: true, filled: 8, limit: 8 },
  { id: 'leader', name: 'Leader rate', desc: 'Complimentary cabin for the traveling group leader.', price: '$0', deposit: '$0', occ: 'Up to 2 people', occN: 2, isPublic: false, filled: 1 },
];

// 14 parties, 32 people. Balcony = 8 (full). Amounts are agent-only.
const GRP_PARTIES = [
  { id: 1,  names: 'Dana & Chris Ellis', n: 2, opt: 'leader', status: 'deposit', date: 'Sep 2', owner: 'Dana Ellis', email: 'dana.ellis@example.com', phone: '(555) 201-4410', dep: '$0', bal: '$0', leader: true },
  { id: 2,  names: 'Ana & Luis Ortega', n: 2, opt: 'balcony', status: 'deposit', date: 'Sep 4', owner: 'Ana Ortega', email: 'ana.o@example.com', phone: '(555) 201-7720', dep: '$600', bal: '$3,080', flag: true },
  { id: 3,  names: 'Kevin, Tasha, Mia & Eli Brooks', n: 4, opt: 'inside', status: 'paid', date: 'Sep 4', owner: 'Tasha Brooks', email: 'tbrooks@example.com', phone: '(555) 340-1182', dep: '$1,000', bal: '$0' },
  { id: 4,  names: 'Ruth Adeyemi & June Park', n: 2, opt: 'balcony', status: 'paid', date: 'Sep 6', owner: 'Ruth Adeyemi', email: 'ruth.a@example.com', phone: '(555) 772-0913', dep: '$600', bal: '$0' },
  { id: 5,  names: 'Sam & Priya Nair', n: 2, opt: 'balcony', status: 'deposit', date: 'Sep 9', owner: 'Priya Nair', email: 'priya.nair@example.com', phone: '(555) 410-3361', dep: '$600', bal: '$3,080' },
  { id: 6,  names: 'Henry & Lois Whitfield', n: 2, opt: 'balcony', status: 'confirmed', date: 'Sep 12', owner: 'Lois Whitfield', email: 'lwhitfield@example.com', phone: '(555) 230-8854', dep: '—', bal: '$3,680' },
  { id: 7,  names: 'Grace Kim & Hannah Lee', n: 2, opt: 'balcony', status: 'confirmed', date: 'Sep 15', owner: 'Grace Kim', email: 'gkim@example.com', phone: '(555) 908-2271', dep: '—', bal: '$3,680' },
  { id: 8,  names: 'Tom, Becca & Noah Fischer', n: 3, opt: 'ocean', status: 'deposit', date: 'Sep 18', owner: 'Becca Fischer', email: 'becca.f@example.com', phone: '(555) 615-0047', dep: '$750', bal: '$3,690' },
  { id: 9,  names: 'Marisol & Diego Vega', n: 2, opt: 'balcony', status: 'deposit', date: 'Sep 21', owner: 'Marisol Vega', email: 'mvega@example.com', phone: '(555) 517-6630', dep: '$600', bal: '$3,080' },
  { id: 10, names: 'Calvin & Denise Harper', n: 2, opt: 'balcony', status: 'requested', date: 'Oct 1', owner: 'Denise Harper', email: 'dharper@example.com', phone: '(555) 882-1945', dep: '—', bal: '$3,680' },
  { id: 11, names: 'Emeka, Ada, Chidi & Nneka Okafor', n: 4, opt: 'ocean', status: 'confirmed', date: 'Oct 3', owner: 'Ada Okafor', email: 'ada.okafor@example.com', phone: '(555) 264-7719', dep: '—', bal: '$5,920' },
  { id: 12, names: 'Walt & Peggy Simmons', n: 2, opt: 'balcony', status: 'paid', date: 'Oct 6', owner: 'Peggy Simmons', email: 'psimmons@example.com', phone: '(555) 433-5502', dep: '$600', bal: '$0' },
  { id: 13, names: 'Jess Moreno', n: 1, opt: 'inside', status: 'requested', date: 'Oct 11', owner: 'Jess Moreno', email: 'jess.moreno@example.com', phone: '(555) 309-6628', dep: '—', bal: '$1,240' },
  { id: 14, names: 'Leah & Ben Carter', n: 2, opt: 'ocean', status: 'invited', date: 'Oct 12', owner: 'Leah Carter', email: 'leah.carter@example.com', phone: '—', dep: '—', bal: '$2,960', byLeader: 'Marcus Webb', hold: 'Invite expires in 3 days' },
];

const GRP_WAITLIST = [
  { pos: 1, names: 'Pat & Gene Doyle', n: 2, opt: 'balcony', offer: 'Waiting' },
  { pos: 2, names: 'Tony, Carmen & Sofia Reyes', n: 3, opt: 'balcony', offer: 'Waiting' },
];

const GRP_ITIN = [
  { d: 'Sat, Mar 14', t: 'Board in Fort Lauderdale', s: 'Sail away together in the late afternoon.' },
  { d: 'Sun, Mar 15', t: 'At sea', s: 'A slow day. Nothing on the schedule.' },
  { d: 'Mon, Mar 16', t: 'Roatán, Honduras', s: 'Group beach day at West Bay.' },
  { d: 'Tue, Mar 17', t: 'Costa Maya, Mexico', s: 'Free to explore.' },
  { d: 'Wed, Mar 18', t: 'Cozumel, Mexico', s: 'Optional snorkel trip.' },
  { d: 'Thu, Mar 19', t: 'At sea', s: 'Group dinner in the evening.' },
  { d: 'Fri, Mar 20', t: 'At sea', s: 'Rest up before home.' },
  { d: 'Sat, Mar 21', t: 'Back in Fort Lauderdale', s: 'Morning arrival.' },
];

const GRP_LEADERS = [
  { name: 'Dana Ellis', img: 'avatarE', traveling: true, claimed: true, email: 'dana.ellis@example.com' },
  { name: 'Marcus Webb', img: 'avatarD', traveling: false, claimed: true, email: 'marcus.webb@example.com' },
];

const GRP_NOTE = "We've talked about doing this together for years, and it's finally happening. Bring your family, bring a friend, or come on your own. There's room at our table. I can't wait to watch the sun go down with all of you.";

const GRP_STATUS = {
  invited:   { kind: 'lead', label: 'Invited' },
  requested: { kind: 'inquiry', label: 'Requested' },
  confirmed: { kind: 'proposal', label: 'Confirmed' },
  deposit:   { kind: 'booked', label: 'Deposit received' },
  paid:      { kind: 'booked', label: 'Paid in full' },
  waitlisted:{ kind: 'inquiry', label: 'Waitlisted' },
  offer:     { kind: 'traveling', label: 'Offer sent' },
  cancelled: { kind: 'past', label: 'Cancelled' },
  expired:   { kind: 'past', label: 'Invite expired' },
};

function optName(id) { const o = GRP_OPTIONS.find((x) => x.id === id); return o ? o.name : id; }

// A party on a hidden option reads "Arranged by Gyasi" to leaders (ruling 8).
function leaderOpt(id) {
  const o = GRP_OPTIONS.find((x) => x.id === id);
  return o && o.isPublic ? o.name : 'Arranged by Gyasi';
}

function GStatus({ s }) {
  const m = GRP_STATUS[s];
  return <span className={`chip-status ${m.kind}`} style={{ whiteSpace: 'nowrap' }}>{m.label}</span>;
}

// MUI twin of GStatus for the desktop artboards. MuiStaStatus has a real `cancelled`
// kind (Design-System §4.3), so cancelled / expired use it here instead of `past`.
function GMuiStatus({ s, sx }) {
  const m = GRP_STATUS[s];
  const kind = s === 'cancelled' || s === 'expired' ? 'cancelled' : m.kind;
  return <MuiStaStatus kind={kind} sx={{ whiteSpace: 'nowrap', ...sx }}>{m.label}</MuiStaStatus>;
}

// Initials avatar for Gyasi (no licensed photo yet, per the 2.2m known deltas).
function GyasiAvatar({ size = 40 }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--brand-burgundy)', color: '#FFF', fontWeight: 700 }}>GS</span>;
}

function GToggle({ on }) {
  return (
    <span style={{ width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative', display: 'inline-block',
      background: on ? 'var(--md-primary)' : 'var(--md-surface-3)', border: on ? 0 : '2px solid var(--md-outline)', boxSizing: 'border-box' }}>
      <span style={{ position: 'absolute', top: on ? 4 : 3, left: on ? 22 : 4, width: on ? 18 : 16, height: on ? 18 : 16, borderRadius: 999,
        background: on ? 'var(--md-on-primary)' : 'var(--md-outline)' }}/>
    </span>
  );
}

function GModalScrim({ children, width = 520 }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      <div className="card card-elev" style={{ width, padding: 24, background: 'var(--md-surface-1)', borderRadius: 24 }}>{children}</div>
    </div>
  );
}

// Group hero used by public page + leader views.
function GHero({ height = 380, children }) {
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', flexShrink: 0 }}>
      <img src={staImg('cruiseShip', 1800, 700)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,33,55,0.05) 20%, rgba(13,33,55,0.82))' }}/>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, color: '#FFF' }}>{children}</div>
    </div>
  );
}

// ── 2.8.9 Member group card (class-style, for the phone artboards) ──────
// state: member | waitlisted | offer
function GMemberCard({ state = 'member' }) {
  const l = GRP_LEADERS[0];
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="t-label-s" style={{ color: 'var(--md-on-surface-variant)', flex: 1 }}>YOUR GROUP</span>
        {state === 'waitlisted' && <GStatus s="waitlisted"/>}
        {state === 'offer' && <GStatus s="offer"/>}
      </div>
      <div className="t-title">{GRP.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={staImg(l.img, 96, 96)} alt="" style={{ width: 36, height: 36, borderRadius: 999, objectFit: 'cover' }}/>
        <div><div className="t-body-s" style={{ color: 'var(--md-on-surface-variant)' }}>Group leader</div><div className="t-title-s">{l.name}</div></div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="t-body-s">32 of 40 spots filled</span></div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--md-surface-3)' }}><div style={{ width: '80%', height: '100%', borderRadius: 999, background: 'var(--md-primary)' }}/></div>
      </div>
      {state === 'waitlisted' && <div className="t-body-s" style={{ padding: 12, borderRadius: 12, background: 'var(--md-surface-2)' }}>You're #2 in line for a Balcony cabin. If a spot opens, we'll email you and hold it for 72 hours.</div>}
      {state === 'offer' && (
        <div style={{ padding: 12, borderRadius: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="t-title-s">A spot opened up for you.</div>
          <div className="t-body-s">Held for you until Thursday, January 14 at 3:00 PM ET.</div>
          <button className="btn btn-filled btn-sm" style={{ alignSelf: 'flex-start' }}>See the offer</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Icon name="link" size={14}/> View the group page</a>
        <a href="#" className="t-body-s" style={{ color: 'var(--md-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Icon name="message" size={14}/> Need to change or cancel? Message Gyasi</a>
      </div>
    </div>
  );
}

Object.assign(window, { GRP, GRP_OPTIONS, GRP_PARTIES, GRP_WAITLIST, GRP_ITIN, GRP_LEADERS, GRP_NOTE, GRP_STATUS, optName, leaderOpt, GStatus, GMuiStatus, GyasiAvatar, GToggle, GModalScrim, GHero, GMemberCard });
