# Design brief: the advisor's Messages tab on the phone (§3.10 Stage 3)

**Status:** Artboards first. Settled in a grilling session with Gyasi on 2026-10-14. The web
half of §3.10 is built (Stage 1 inbox and thread, PR #125; Stage 2 templates, PR #128). This
brief asks for the phone frames; the Kotlin build follows once they are synced.

**How to use this brief:** Paste it into the Claude Design project
(`https://claude.ai/design/p/019e27d4-5f9f-7c8d-b082-db804374dab3`) to draw the artboards. Then
run the `sync-design-handoff` skill to pull them into `design/source-prototype/`.

**Where the frames go:** a new file, `screens/agent-messages-mobile.jsx`, beside
`agent-dashboard-mobile.jsx` (3.2m) and `agent-crm-mobile.jsx` (3.3m). Add a `3.10m` group to
`pages/_sections.json` with the five entries in §4. Every frame comes in light AND dark: the
dark scheme is the tropical rebrand (ocean blue primary, sunset gold secondary, deep navy
surfaces), not an inversion.

---

## 1. The idea in one paragraph

Messages becomes the third live tab on the advisor's phone (Worklist, Clients, Messages, More).
An advisor away from the desk can see who is waiting, read a thread, reply, or leave an internal
note. Everything else about messaging (templates, bulk send, bulk archive) stays at the desk.
The frames should feel like the traveler's own phone messaging (2.6m, `client-messaging-mobile.jsx`)
seen from the other side of the conversation.

---

## 2. Settled rulings

### 2.1 Which frames

1. **Four live frames and one deferred frame.** Inbox (3.10m.1), Thread in reply mode and in
   note mode (3.10m.2, two frames), New message (3.10m.3), and one drawn-and-deferred frame
   (3.10m.4) that shows why Templates and Bulk Send are not on the phone. House rule: a frame
   that is drawn and deferred says "considered, and here is why"; a missing one says "not
   designed".

### 2.2 Inbox (3.10m.1)

2. **Search stays visible** at the top, as on the phone Clients tab (3.3m departure 1). Finding
   one client's thread by name is the on-the-go task.
3. **Two chips: Unread and Overdue**, plus an **Archived** link that switches to the archived
   list. No other filters.
4. **No bulk select.** Selecting many threads is desk work.
5. **Each row shows:** client initials (never a stock photo), client name, trip title (or
   "General"), a one-line preview ("You: …" when the advisor spoke last), the time, an unread
   count when there is one, and an **Overdue** chip or a **Reply by Tue** chip when a reply is
   owed.
6. **More threads load as you scroll.** No page buttons.
7. **Pull to refresh**, and the list reloads when you come back to it. There is no live feed.

### 2.3 Thread (3.10m.2)

8. **The header** has the client's name and trip, an Overdue or "Reply by" chip, **Open trip**
   (or **Open client** on a general thread; both open existing phone screens), and **Archive**.
   Nothing else.
9. **Archive lives only in this header.** No swipe-to-archive on inbox rows: a swipe is easy to
   do by accident.
10. **Bubbles swap sides** from the traveler's view: the advisor's own on the right, the client's
    on the left.
11. **An internal note is a dashed, tinted card** labelled "Internal note · only you can see
    this", every time, so it can never be mistaken for a reply.
12. **A Reply / Note toggle sits above the text box.** In Note mode the box takes the same
    dashed, tinted look, the placeholder reads "Write a note only you can see…", a lock line
    says "Only you can see this note.", and the button reads **Add note**. In Reply mode the
    button reads **Send**.
13. **No "Insert template".** Templates stay on the web.
14. **Client attachments are listed by name only**, not openable, matching the web: nothing on
    the advisor's side can open a client's document yet.
15. **Pull to refresh** in the thread too, and it reloads when you return to it.
16. **When the client has no login yet**, a line under the box says "Pri hasn't set up a login
    yet. This will be waiting for them."

### 2.4 New message (3.10m.3)

17. Reached from Client Detail's **Message** button and Trip Detail's Messages tab when no
    thread exists yet. A back bar titled "Message Pri", the client and trip under it, and the
    Reply box alone, with **no Note toggle**, because a thread cannot start with a note (the client
    would see an empty thread).

### 2.5 The tab and its doors

18. **The Messages tab is live** (no longer dimmed) and carries a **badge with the number of
    unread threads**. It refreshes when the app opens and when you switch tabs.
19. **Four doors go live:** the Worklist's "Recent messages" rows, Client Detail's threads tab
    and its Message button, and Trip Detail's Messages tab ("Open in Messages"). Each now opens
    the thread (or New message) instead of the "coming with §3.10" note.

---

## 3. Deliberate departures from the web frames (A3101, A3102)

Draw these as notes in the file header, the way `client-messaging-mobile.jsx` lists its own.

1. **No presence dot, no "Online".** There is no realtime presence in this stack.
2. **No read receipts** under the advisor's messages. The client's read time is not shown to
   anyone.
3. **No reactions.** There is no reaction entity in the data model.
4. **No template picker and no bulk archive.** Desk work, per §6.6 and Gyasi's 2026-10-13 ruling.
5. **No master-detail.** The phone shows one screen at a time: the inbox is the tab root, the
   thread is pushed on top with a back bar.
6. **No "System" threads.** Every thread is between the advisor and one client.

---

## 4. The frames to draw

Use the agent phone shell from `agent-dashboard-mobile.jsx`: `MFrame`, the 56dp top bar,
`MAgentTabs` with Messages now `built: true` and active, `MBackBar` for pushed screens, and
`MInitials`. Match the bubbles, day separators and composer to `client-messaging-mobile.jsx`
(`MBubble`, `MComposer`) so the Kotlin build can share one `ThreadScreen`.

| Entry | Component | What it shows |
|---|---|---|
| 3.10m.1 Inbox | `M3101_Inbox` | Search, Unread / Overdue chips, Archived link, five rows (one unread with a count, one Overdue, one "Reply by Tue", one General thread, one where "You:" spoke last). Tab bar with Messages active and a badge of 2. |
| 3.10m.2 Thread · reply | `M3102_ThreadReply` | Header with chip, Open trip, Archive. Two days of messages with a day separator, one client attachment listed by name, one internal note card. Reply/Note toggle on Reply, Send button. |
| 3.10m.2 Thread · note | `M3102_ThreadNote` | Same thread, toggle on Note, the box dashed and tinted with a draft note, lock line, Add note button. |
| 3.10m.3 New message | `M3103_NewMessage` | Back bar "Message Pri", "Pri Raghunathan · Kyoto in the spring" under it, empty Reply box, the no-login line. |
| 3.10m.4 On the web | `M3104_DeskOnly` | Drawn-and-deferred: a short card saying Templates and Bulk Send live on the web, and why (writing and managing templates is desk work). No dimmed buttons. |

**Sample content** (use these so the frames match the local seed data):

- Jordan Hayes · Anniversary Week in Negril. Client: "Yes please. What does the upgrade run
  us?" Advisor: "$680 over the base, and I got a spa credit and a private island day with it.
  Net win." Internal note: "Margin on the suite upgrade is thin, do not discount further."
  Client attachment: `negril-confirmation.pdf`.
- Maya Carter · Saint Lucia · Between Semesters (Overdue).
- Pri Raghunathan · Lisbon & the Douro Valley, and Kyoto in the spring for New message (no login yet).
- Sam Rivera · General (Reply by Tue).
- Tomás Delgado · Barcelona, long weekend ("You: Booked! Details coming tonight.").

**Copy** comes from the web's `AGENT_MESSAGES_COPY` (`web/lib/agent/content.ts`), so the two
stacks say the same thing: "Messages", "Unread", "Overdue", "Archived", "Search messages",
"Reply", "Internal note", "Send", "Add note", "Write a reply…", "Write a note only you can
see…", "Only you can see this note.", "Open trip", "Open client", "Archive", "General".
Brand voice per Design-System §2: warm, plain, nothing pushy.

---

## 5. What the build will need (for after the sync)

Not part of the drawing, recorded so nothing is rediscovered:

- `contracts/openapi.yaml` gains `agent-message` (send, read, archive), and the Kotlin types are
  regenerated from it instead of hand-written.
- The thread reuses `ui/components/client/ThreadScreen.kt` where it fits, with an advisor
  variant for the swapped sides, the note card and the Reply/Note toggle.
- Reads and writes go through the same SQL the web uses (`agent_message_threads`,
  `agent_conversation`, `agent_conversation_messages`, `agent_message_target`,
  `agent_message_summary` for the badge, and the `agent-message` Edge Function). No new SQL is
  expected.
- `client.functions.invoke` throws on a non-2xx: catch `RestException` and read `rest.error`
  for the Edge Function's sentence (CLAUDE.md, "Local development gotchas").
