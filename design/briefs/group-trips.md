# Design brief: Group trips with public sign-up and group leaders

**Status:** Design only (P3). Settled in a grilling session with Gyasi on 2026-10-14.
No code, no migrations, and no edits to the five docs in `docs/` yet. When this is
picked up for a build, the rulings below get written into Data-Model §16, Screen
Inventory §2.8 and the BRD first (CLAUDE.md, "Document hierarchy").

**How to use this brief:** Paste it into the Claude Design project
(`https://claude.ai/design/p/019e27d4-5f9f-7c8d-b082-db804374dab3`) to draw the
artboards. Then run the `sync-design-handoff` skill to pull them into
`design/source-prototype/`. Screen numbers marked *proposed* are not in the Screen
Inventory yet.

---

## 1. The idea in one paragraph

The agent creates a group trip, builds the shared itinerary once, and sets up the
options people can sign up for. A public page, reachable only by a shared link, lets
anyone sign up their party. One or more group leaders, picked by the agent, can see
who signed up and add people themselves, but never see anyone's private details.
Every party gets its own trip, so deposits, card authorizations, documents and
commission all run through the flows that already exist.

---

## 2. Settled rulings

### 2.1 Shape of a group

1. **Master trip plus one trip per party.** The group owns a master trip, where the
   agent builds the shared itinerary. Each sign-up creates its own Trip, copied from
   the master.
2. **Master edits push down.** Shared parts (the sailing, group excursions,
   transfers) stay linked to the master. When the agent edits them, every party's
   trip updates and the party gets a notice. Anything the agent adds to one party's
   trip (like extra hotel nights) stays on that trip only.
3. **A party is one Trip.** The person who signs up owns it. The other people in the
   party are travelers on that Trip and don't need accounts.
4. **Sign-up is a request, not a booking.** The party's Trip starts in `inquiry`. The
   agent confirms it. Card authorization happens later through the normal §2.4 flow.
   No card is ever taken on the public page.
5. **Signing up creates an account** with an email confirm link, the same way quote
   requests work. Each account can have **one active party per group**.

### 2.2 Options

6. The agent defines **options**. An option can be any package: a cabin type, a land
   package, day-trip only, cabin plus airfare. Each has a name, description,
   per-person price, per-person deposit, occupancy, and an optional limit (like
   "8 balcony cabins").
7. Money is `bigint` cents, USD only. Prices are fixed and entered by the agent.
   They are not live supplier rates.
8. The agent marks each option **public or hidden**. Visitors and leaders see only
   public options. Only the agent can put a party on a hidden option (a free room
   for the leader, a special family rate).
9. A party picks **exactly one** option. No add-ons for now.
10. When an option reaches its limit, it shows **Full** and the other options stay
    open. A waitlisted party's entry records which option they wanted.

### 2.3 Capacity, deadline, waitlist, lifecycle

11. The group has an optional **headcount cap** (people, not parties), an optional
    **sign-up deadline**, and a **waitlist** that turns on by itself once the group or
    an option is full.
12. When a spot opens, the next party in line gets an **offer** with **72 hours** to
    accept. If they don't, the offer moves to the next party. Nobody is moved in
    automatically. The agent sees every offer and can step in.
13. **Group status:** `draft → open → full / closed → departed → archived`. Sign-ups
    are taken only while `open`. A closed page offers the waitlist only if the agent
    turned that on.

### 2.4 Group leaders

14. The **agent assigns** leaders. A leader doesn't have to travel. A group can have
    a few co-leaders. (This replaces the single `coordinator_user_id` in Data-Model
    §16.1 with a role on a group-member link.)
15. A leader with no account gets a **claim invite**. Until they claim it, the agent
    sees them as "invited" and the public page leaves out the leader's note and photo.
16. A leader who is traveling signs up through the public page like anyone else. Their
    leader access is separate from their own party.
17. **What a leader sees, for every party:** the names of the people in the party,
    party size, chosen option, sign-up date, and status. The status includes a
    **payment milestone with no dollar amounts**: `requested`, `confirmed`,
    `deposit received`, `paid in full`, `cancelled`. Leaders also see the waitlist:
    name, party size and place in line.
18. **What a leader never sees:** email, phone, mailing address, birth dates,
    passports or travel documents, dietary or accessibility notes, card details,
    any dollar amount, or commission. This holds even for people the leader added
    themselves.
19. **Leaders can add a party:** name, email, party size and a public option. The
    party shows as `invited` and **holds its spots for 7 days**. If the invite isn't
    claimed, the spots are released and the leader and agent both see that it
    expired. The invited person adds their own private details after they claim the
    account.
20. **Leaders cannot** cancel a party, reorder or promote the waitlist, or choose
    hidden options. They can **flag a party for the agent** with a short note
    ("Ana says they can't make it").
21. **No leader messaging** in this design. No announcements, no group chat.
22. **Notifications:** Leaders see new sign-ups on the roster. There's an optional
    daily email digest, **off by default**. No email per sign-up.
23. At `departed` the leader roster turns **read-only**. At `archived` leader access
    ends.
24. Leaders can edit **only their welcome note and photo** on the public page.

### 2.5 Members (people who signed up)

25. Members see their own trip, plus a **group card** with the group name, leader
    name and headcount ("32 of 40 spots filled"). They **do not see the roster**.
26. To cancel, a member **asks the agent**. There's no self-cancel button, because
    deposits and supplier penalties need a person to look at them.

### 2.6 The public page

27. **Unlisted.** Reachable only by a slug link like `story-tail.com/groups/grace-community-2027`,
    with a `noindex` tag. It isn't listed anywhere on the public site.
28. "**Spots left**" appears only when 10 or fewer remain. Above that, show nothing.

### 2.7 Platforms

29. Agent screens: **web only**. Public page: **web**. Leader and member screens:
    **web and mobile**.

### 2.8 Added after the design pass (2026-10-14)

Gyasi approved these four after the artboards were drawn. They came from the design, not
the grilling session.

30. **Hidden options read "Arranged by Gyasi" to leaders.** A leader sees that a party
    exists and its status, but never the name of a hidden option (ruling 8).
31. **Leaders can invite again.** After an invite expires, the leader can send a new one,
    which starts a new 7-day hold (ruling 19).
32. **The agent can change a party's option and export the roster.** Both are agent-only.
    The export holds contact details and amounts, so it never reaches a leader.
33. **The public link lives on `story-tail.com/groups/<slug>`,** not the app subdomain.

---

## 3. Screens to draw

Every artboard in **light and dark**. The dark scheme is a full tropical rebrand,
not an inverted copy (Design-System §4.2). Use the MUI kit in
`design/source-prototype/shared/mui-kit.jsx` and the existing screen frames.

### Party status chips

Use the existing `MuiStaStatus` kinds (Design-System §4.3). Proposed mapping. `due` is
left out on purpose: it's red, and nothing here should feel urgent (section 5).

| Party status | Chip kind | Who sees it |
|---|---|---|
| Invited (leader added, not claimed) | `lead` | agent, leader |
| Requested | `inquiry` | agent, leader, member |
| Confirmed | `proposal` | agent, leader, member |
| Deposit received | `booked` | agent, leader, member |
| Paid in full | `booked` | agent, leader, member |
| Waitlisted | `inquiry` | agent, leader, member |
| Offer sent (72 hours) | `traveling` | agent, leader, member |
| Cancelled / Invite expired | `cancelled` | agent, leader, member |

### Sample data for every artboard

Use one consistent made-up group so the screens tell one story:

- **Group:** "Grace Community Caribbean Cruise," a 7-night Western Caribbean
  sailing, March 14 to 21, 2027. Sign-up deadline: November 30, 2026.
- **Cap:** 40 people. **Signed up:** 32 people in 14 parties. **Waitlist:** 2 parties.
- **Leaders:** Dana Ellis (traveling) and Marcus Webb (not traveling).
- **Options (public):** Inside cabin, $1,240 per person, $250 deposit. Ocean view,
  $1,480 per person, $250 deposit. Balcony, $1,840 per person, $300 deposit, limit
  8 cabins (shown as **Full**).
- **Option (hidden):** Leader rate, $0, used for Dana's cabin.

All names are fictional.

---

### 3.1 Public group sign-up page (proposed 2.8.5) · web, desktop and phone

Uses the public site chrome from section 2.0, not the signed-in app shell.

- Hero image with the group name, dates and ship or destination.
- The agent's description of the trip.
- **Welcome note from the leader**, with their photo and name. Left out if no leader
  has claimed their account yet.
- Day-by-day itinerary summary from the master trip. Day level only, no times or
  confirmation numbers.
- **Option cards:** name, description, "$1,480 per person," deposit, and occupancy.
  A full option shows a **Full** badge and a "Join the waitlist" link instead of
  "Choose."
- Sign-up deadline. "Spots left" only when 10 or fewer remain.
- Agent contact card (Gyasi, photo, a short line, and how to reach him).
- **Sign-up form**, in steps:
  1. Choose an option.
  2. Who's coming: each traveler's full name as it appears on their ID, and adult
     or child. An "Add a traveler" row, capped by the option's occupancy.
  3. Your details: name, email, phone. Filled in if they're already logged in.
  4. Review and send, with this line: *"Nothing is charged today. Gyasi will follow
     up to confirm your spot."*
- A short note on what happens next: you'll get an email to set up your account, and
  Gyasi will confirm your spot. *"We'll take it from here."*

**States to draw:**
- Open (the main artboard)
- One option full
- Group full, waitlist on: the form becomes "Join the waitlist"
- Closed: the deadline passed or the agent closed it, with no form
- Already signed up (logged in): sends them to their existing trip
- Sent: a thank-you confirmation

### 3.2 Waitlist offer (proposed 2.8.6) · web and mobile

Reached from the offer email. Signed in.

- *"A spot opened up for you."* message with the option they asked for and its price and
  deposit.
- A countdown showing the time left in the 72 hours, in plain text, not a ticking
  timer.
- Accept, or "No thanks, take me off the list."
- States: open offer, accepted, expired, declined.

### 3.3 Leader roster (proposed 2.8.7) · web and mobile

The leader's home for the group. It is **not** the agent dashboard. Draw it so you
can tell what's missing: no contact columns and no money columns.

- Header: group name, dates, group status, headcount ("32 of 40 spots filled"),
  deadline.
- Summary counts by status (requested, confirmed, deposit received, paid in full).
- **Party list:** the names of the people in the party, party size, option,
  sign-up date, status chip, and a "Flag for Gyasi" action.
- **Waitlist:** place in line, name, party size, option wanted, offer status.
  Read-only.
- *"Add someone to the trip"* button that opens a form: name, email, *"How many
  people?"*, public option.
  Show the line "They'll get an email to finish signing up. We'll hold their spots
  for 7 days."
- Flag dialog: a short note to the agent.
- Link to edit the welcome note (3.4).
- Settings toggle: *"Daily email summary,"* off, with the helper line *"One email a
  day with new sign-ups."*

**States to draw:**
- Open
- An invited party with "Invite expires in 3 days"
- An expired invite
- Departed: read-only banner, actions hidden
- Phone layout of the party list as stacked cards

### 3.4 Edit welcome note (proposed 2.8.8) · web and mobile

- Photo upload, then a text box for the note with a live preview of how it looks on
  the public page.
- Save. That's the only control.

### 3.5 Member group card (proposed 2.8.9) · web and mobile

Lives on the member's own trip view (2.2.x), not as its own page.

- Group name, leader name and photo, headcount ("32 of 40 spots filled"), and a
  link to the public page.
- If the party is waitlisted or has an open offer, the card shows that status.
- A *"Need to change or cancel? Message Gyasi"* link that opens a message to the agent.
- **No roster.**

### 3.6 Agent: Groups list (proposed 3.13.1) · web

- Table of groups: name, dates, status, headcount against cap, parties, waitlist
  count, deadline, leaders.
- "New group" button.
- Filters by status.

### 3.7 Agent: Group setup wizard (proposed 3.13.2) · web

Steps, with a side progress rail:

1. **Details:** name, dates, destination, hero image, description, cap (people),
   deadline, waitlist on or off.
2. **Master trip:** opens the Trip Builder (3.4) on the master trip, or "start from a
   template." Marks which components are shared.
3. **Options:** a list of option rows. Each has name, description, per-person price,
   per-person deposit, occupancy, optional limit, and a **Public / Hidden** switch.
   Show at least one hidden option.
4. **Public page:** slug field with a preview link, a live preview of the page, and a
   "Copy link" button.
5. **Leaders:** add by email. Shows "invited" until claimed. Remove leader.
6. **Review and open:** moves the group from `draft` to `open`.

### 3.8 Agent: Group dashboard (proposed 3.13.3) · web

The full view, with everything the leader can't see.

- Header with status controls (open, close, mark departed, archive) and the public
  link.
- KPI row: headcount against cap, parties, deposits received, paid in full,
  waitlist.
- **Roster table:** party, owner contact, travelers, option (hidden options show a
  tag), status, deposit and balance amounts, a flag indicator, and a link to the
  party's trip.
- **Leader flags** panel: the note, which leader, and a resolve action.
- **Waitlist and offers:** order, offer timer, and agent actions: send offer now,
  skip, move up, move down.
- **Options** panel: each option's filled count against its limit.
- **Leaders** panel: who, whether they've claimed their account, and whether
  they're traveling.
- An action to add a party on any option, including hidden ones.

### 3.9 Agent: Party detail (proposed 3.13.4) · web

A small group-context header over the existing Trip Detail (3.4.2): group name,
option, status, and links back to the dashboard. Everything else is the normal
Trip Detail.

---

## 3a. Where the artboards are

Drawn in Claude Design (project `13e01bd3-e9c2-422b-ac1e-d77305eac447`) and mirrored on
2026-10-14 into `design/source-prototype/`: `pages/c28-group.html` (2.8.5 to 2.8.9, with the
older 2.8 artboards kept below them) and `pages/a313-groups.html` (3.13.1 to 3.13.4). The
desktop screens were ported to MUI on the way in. The phone screens stay class-style like
every other `*-mobile.jsx`. The local changes are listed in the sync-design-handoff skill,
under delta 8.

## 4. What happens to the existing 2.8 artboards

- **2.8.1 Group overview:** Today it shows every member a cabin-by-cabin roster with
  payment tags. That breaks ruling 25 (members don't see the roster). Rework it into
  the leader roster (3.3) and the member group card (3.5).
- **2.8.3 Group chat:** Out of scope for this design (ruling 21). Leave the artboard
  and mark it "not in this design."
- **2.8.2 Co-traveler invite** and **2.8.4 Limited view:** Not covered by this brief.
  Leave them as they are.

---

## 5. Copy notes (Design-System §2)

- The public page is a **front door**, so the voice can show more here. Lean into
  rest and wonder: *"A week at sea together. Time to slow down."* Never quote
  Scripture at people, and never assume what the group believes. Many groups will be
  churches, but some won't be.
- **No pressure.** No ticking timers, no "Only 3 left, book now!", no red urgency.
  "Spots left" stays calm: *"8 spots left."*
- The "nothing charged today" line matters. Say it plainly on the review step.
- The leader roster is a **working screen**. Keep it short and clear, with no
  worldview copy.
- Write leader actions as things a friend would say: *"Flag for Gyasi,"*
  *"Add someone to the trip."*
- Every string still goes through the five checks in Design-System §2.6.

---

## 6. Data notes for the eventual build (not now)

These come out of the rulings. They are recorded here so they aren't lost, and they
get written into Data-Model §16 when building starts.

- `trip_group` gains: `status`, `slug` (unique), `cap_people`, `signup_deadline`,
  `waitlist_enabled`, `master_trip_id`, `description`, `hero_image`.
- Leaders move off `trip_group.coordinator_user_id` onto a `group_leader` link
  (group, user, `claimed_at`, `welcome_note`, `photo`, `digest_enabled`).
- New `group_option`: name, description, `price_per_person_cents`,
  `deposit_per_person_cents`, `currency char(3)`, occupancy, `limit_count`,
  `is_public`.
- `group_member` (one per party): trip, option, status, `invited_by_leader_id`,
  `hold_expires_at`, waitlist position, offer `expires_at`.
- A `trip_component` needs a link to its master component so edits can push down.
- A **leader read model** (a SECURITY DEFINER function or view, like §3.2's agent
  read surface) that returns only the fields in ruling 17. The rule is about which
  columns, not which rows, so plain RLS isn't enough by itself.
- Party sign-ups, leader adds, flags, offers and option changes go through audit
  middleware (CLAUDE.md rule 3).
