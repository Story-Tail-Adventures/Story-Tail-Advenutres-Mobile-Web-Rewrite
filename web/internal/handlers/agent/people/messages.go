package people

import (
	"strconv"
	"strings"
	"time"
)

// §3.10 Stage 1's view models, ported from web/lib/agent/messages.ts and the thread clock in
// web/lib/trips/thread.ts: the inbox (3.10.1), a thread (3.10.2) and who a new message is
// for. Formatted in the advisor's own zone, as `queries.ts` does.

// AGENT_MESSAGES_COPY (web/lib/agent/content.ts), the strings Go chooses between. The rest is
// in the page file.
const (
	msgCaughtUp       = "All caught up"
	msgGeneralThread  = "General"
	msgYouPrefix      = "You: "
	msgEmptyInbox     = "No messages yet. When a client writes to you, it shows up here."
	msgEmptyNarrowed  = "No threads match these filters."
	msgEmptyArchived  = "Nothing archived."
	msgViewArchived   = "Archived"
	msgViewInbox      = "Inbox"
	msgTitle          = "Messages"
	msgArchiveFailed  = "That didn't save. Try again in a moment."
	msgSendFailed     = "That didn't send. Try again in a moment."
	msgNotFound       = "That client isn't one of yours, or they've been archived."
	msgArchivedDone   = "Archived"
	msgRestoredDone   = "Moved to inbox"
	msgSent           = "Sent"
	msgNoteAdded      = "Note added"
	msgArchiveThread  = "Archive"
	msgRestoreThread  = "Move to inbox"
	msgArchiveSelect  = "Archive"
	msgRestoreSelect  = "Move to inbox"
	msgReplyLabel     = "Reply"
	msgMessageLabel   = "Message"
	msgReplyPlacehold = "Write a reply…"
	msgMsgPlacehold   = "Write a message…"
	msgNotePlacehold  = "Write a note only you can see…"
	msgSend           = "Send"
	msgAddNote        = "Add note"
)

// enUS writes a count the way toLocaleString("en-US") does: 1200 as "1,200".
func enUS(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// messagesHeadline is "3 unread · 1 overdue", or "All caught up".
func messagesHeadline(unreadThreads, overdueThreads int64) string {
	var parts []string
	if unreadThreads > 0 {
		parts = append(parts, enUS(unreadThreads)+" unread")
	}
	if overdueThreads > 0 {
		parts = append(parts, enUS(overdueThreads)+" overdue")
	}
	if len(parts) == 0 {
		return msgCaughtUp
	}
	return strings.Join(parts, " · ")
}

// messagesReplyBy is the thread header's "Reply by end of Mon"; messagesReplyByShort is the
// inbox row's "Reply by Mon".
func messagesReplyBy(day string) string      { return "Reply by end of " + day }
func messagesReplyByShort(day string) string { return "Reply by " + day }

// messagesNoLogin sits under the reply box when the client has no login yet.
func messagesNoLogin(firstName string) string {
	return firstName + " hasn't set up a login yet, so this won't be emailed. It will be waiting when they sign in."
}

// messagesMoved is what a bulk archive (or bring-back) did.
func messagesMoved(n int64, archived bool) string {
	if archived {
		return enUS(n) + " archived"
	}
	return enUS(n) + " moved to inbox"
}

// messagesNewTo is the new-thread page's heading; messagesSelected is the bulk bar's count.
func messagesNewTo(firstName string) string { return "Message " + firstName }
func messagesSelected(n int64) string       { return enUS(n) + " selected" }

// ── The thread's clock ───────────────────────────────────────────────────────────────────

var shortMonthNames = [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

// threadZone is the zone to format in. An unusable zone string from the database should not
// blank the thread, so it falls back to UTC, as thread.ts's FALLBACK_TIME_ZONE does.
func threadZone(name string) *time.Location {
	if loc, ok := loadZone(name); ok {
		return loc
	}
	return time.UTC
}

// dayKeyIn is the day a moment falls on in a zone, "yyyy-mm-dd".
func dayKeyIn(iso, zone string) (string, bool) {
	at, ok := parseInstant(iso)
	if !ok {
		return "", false
	}
	return at.In(threadZone(zone)).Format(time.DateOnly), true
}

// formatMessageTime is a bubble's time: "2:14p". The design wants a bare a/p, not AM/PM.
func formatMessageTime(iso, zone string) string {
	at, ok := parseInstant(iso)
	if !ok {
		return ""
	}
	at = at.In(threadZone(zone))
	hour := at.Hour() % 12
	if hour == 0 {
		hour = 12
	}
	suffix := "a"
	if at.Hour() >= 12 {
		suffix = "p"
	}
	return strconv.Itoa(hour) + ":" + fmtTwo(at.Minute()) + suffix
}

func fmtTwo(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

// formatDaySeparator is "Today", "Yesterday", or "Mar 14" — off the day key rather than off a
// time value, so the month and day are the zone's and not the server's.
func formatDaySeparator(iso, zone string, now time.Time) string {
	key, ok := dayKeyIn(iso, zone)
	if !ok {
		return ""
	}
	if today, ok := dayKeyIn(now.Format(time.RFC3339Nano), zone); ok && key == today {
		return "Today"
	}
	if yday, ok := dayKeyIn(now.Add(-24*time.Hour).Format(time.RFC3339Nano), zone); ok && key == yday {
		return "Yesterday"
	}
	month, _ := strconv.Atoi(key[5:7])
	day, _ := strconv.Atoi(key[8:10])
	if month < 1 || month > 12 {
		return ""
	}
	return shortMonthNames[month-1] + " " + strconv.Itoa(day)
}

// formatInboxTime is a row's time: the clock today, else the day separator's words.
func formatInboxTime(iso, zone string, now time.Time) string {
	day := formatDaySeparator(iso, zone, now)
	if day == "Today" {
		return formatMessageTime(iso, zone)
	}
	return day
}

// dueDay is the weekday a reply falls due: reply_due_at is the midnight that ENDS that day.
func dueDay(dueAt, zone string) string {
	at, ok := parseInstant(dueAt)
	if !ok {
		return ""
	}
	return at.Add(-time.Millisecond).In(threadZone(zone)).Format("Mon")
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────────

// msgSummaryRow is agent_message_summary().
type msgSummaryRow struct {
	OpenThreads     int64 `json:"open_threads"`
	UnreadThreads   int64 `json:"unread_threads"`
	UnreadMessages  int64 `json:"unread_messages"`
	OverdueThreads  int64 `json:"overdue_threads"`
	ArchivedThreads int64 `json:"archived_threads"`
}

// msgThreadRow is one agent_message_threads() row.
type msgThreadRow struct {
	ConversationID     string  `json:"conversation_id"`
	ClientID           string  `json:"client_id"`
	ClientDisplayName  string  `json:"client_display_name"`
	TripID             *string `json:"trip_id"`
	TripTitle          *string `json:"trip_title"`
	Subject            *string `json:"subject"`
	LastMessageAt      string  `json:"last_message_at"`
	LastMessagePreview *string `json:"last_message_preview"`
	LastSenderRole     *string `json:"last_sender_role"`
	AgentUnreadCount   int64   `json:"agent_unread_count"`
	ReplyDueAt         *string `json:"reply_due_at"`
	Overdue            bool    `json:"overdue"`
	Archived           bool    `json:"archived"`
	TotalCount         int64   `json:"total_count"`
}

// msgConversationRow is agent_conversation().
type msgConversationRow struct {
	ConversationID    string  `json:"conversation_id"`
	ClientID          string  `json:"client_id"`
	ClientDisplayName string  `json:"client_display_name"`
	ClientFirstName   string  `json:"client_first_name"`
	TripID            *string `json:"trip_id"`
	TripTitle         *string `json:"trip_title"`
	Subject           *string `json:"subject"`
	AgentUnreadCount  int64   `json:"agent_unread_count"`
	ReplyDueAt        *string `json:"reply_due_at"`
	Overdue           bool    `json:"overdue"`
	Archived          bool    `json:"archived"`
	ClientCanSignIn   bool    `json:"client_can_sign_in"`
}

type messageAttachmentRow struct {
	DocumentID string `json:"document_id"`
	Filename   string `json:"filename"`
	Kind       string `json:"kind"`
}

// conversationMessageRow is one agent_conversation_messages() row.
type conversationMessageRow struct {
	MessageID      string                 `json:"message_id"`
	SenderRole     string                 `json:"sender_role"`
	Body           string                 `json:"body"`
	IsInternalNote bool                   `json:"is_internal_note"`
	CreatedAt      string                 `json:"created_at"`
	Attachments    []messageAttachmentRow `json:"attachments"`
	TotalMessages  int64                  `json:"total_messages"`
	EmailedAt      *string                `json:"emailed_at"`
	Channel        string                 `json:"channel"`
	IsAutoReply    bool                   `json:"is_auto_reply"`
}

// messageTargetRow is agent_message_target().
type messageTargetRow struct {
	ClientID          string  `json:"client_id"`
	ClientDisplayName string  `json:"client_display_name"`
	ClientFirstName   string  `json:"client_first_name"`
	TripID            *string `json:"trip_id"`
	TripTitle         *string `json:"trip_title"`
	ConversationID    *string `json:"conversation_id"`
	ClientCanSignIn   bool    `json:"client_can_sign_in"`
}

// ── 3.10.1 the inbox ─────────────────────────────────────────────────────────────────────

// inboxThread2 is one row of the list. (The worklist's own recent-messages row is
// `inboxRow`, from a different read.)
type inboxThread2 struct {
	ID         string
	Href       string
	ClientName string
	// TripLabel is the trip, or "General" for a thread about no one trip.
	TripLabel string
	// Preview is what was last said, with "You: " in front when it was the advisor.
	Preview   string
	TimeLabel string
	Unread    int64
	Overdue   bool
	// ReplyByLabel is "Reply by Mon" while a reply is owed and not yet late, else "".
	ReplyByLabel string
	Archived     bool
}

type inbox struct {
	Headline        string
	UnreadThreads   int64
	OverdueThreads  int64
	ArchivedThreads int64
	Threads         []inboxThread2
	Total           int64
	Page            int
	PageCount       int
}

func inboxThread(row msgThreadRow, q inboxQuery, zone string, now time.Time) inboxThread2 {
	preview := str(row.LastMessagePreview)
	if str(row.LastSenderRole) == "agent" && preview != "" {
		preview = msgYouPrefix + preview
	}
	t := inboxThread2{
		ID: row.ConversationID, Href: threadLink(row.ConversationID, q),
		ClientName: row.ClientDisplayName, TripLabel: cmpOr(str(row.TripTitle), msgGeneralThread),
		Preview: preview, TimeLabel: formatInboxTime(row.LastMessageAt, zone, now),
		Unread: row.AgentUnreadCount, Overdue: row.Overdue, Archived: row.Archived,
	}
	if due := str(row.ReplyDueAt); due != "" && !row.Overdue {
		t.ReplyByLabel = messagesReplyByShort(dueDay(due, zone))
	}
	return t
}

// buildInbox is loadInbox's shaping. Total comes from the rows; a page past the end carries
// no count, so the handler asks again and passes what it learned.
func buildInbox(s msgSummaryRow, rows []msgThreadRow, q inboxQuery, zone string, now time.Time) inbox {
	in := inbox{
		Headline:      messagesHeadline(s.UnreadThreads, s.OverdueThreads),
		UnreadThreads: s.UnreadThreads, OverdueThreads: s.OverdueThreads, ArchivedThreads: s.ArchivedThreads,
		Page: q.Page, Threads: []inboxThread2{},
	}
	if len(rows) > 0 {
		in.Total = rows[0].TotalCount
	}
	for _, r := range rows {
		in.Threads = append(in.Threads, inboxThread(r, q, zone, now))
	}
	in.PageCount = pageCountOf(in.Total)
	return in
}

// pageCountOf is Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)).
func pageCountOf(total int64) int {
	n := int((total + inboxPageSize - 1) / inboxPageSize)
	if n < 1 {
		return 1
	}
	return n
}

// ── 3.10.2 one thread ────────────────────────────────────────────────────────────────────

type threadAttachment struct{ ID, Filename string }

type threadMessageView struct {
	ID        string
	Sender    string // "agent" or "client"
	Body      string
	CreatedAt string
	// InternalNote is the one thing on this screen the client never sees.
	InternalNote bool
	Attachments  []threadAttachment
	// Emailed: an email carried this reply to the client (Stage 4). Advisor-only.
	Emailed bool
	// ByEmail: the client wrote this by replying to an email.
	ByEmail bool
	// AutoReply: an out-of-office automatic reply (§3.12.2), tagged on both sides.
	AutoReply bool
}

type threadHeader struct {
	ConversationID  string
	ClientID        string
	ClientName      string
	ClientFirstName string
	TripID          string
	TripLabel       string
	Overdue         bool
	ReplyByLabel    string
	Archived        bool
	ClientCanSignIn bool
}

type threadView struct {
	Header   threadHeader
	Messages []threadMessageView
	// TimeZone is the advisor's, for the day separators and the times.
	TimeZone string
	// Truncated: the read returns the newest 500; a thread that long says so.
	Truncated bool
	// SeenUpTo is the newest message's created_at EXACTLY as Postgres wrote it (microseconds
	// included), or "" for an empty thread. Reading and replying clear only up to here;
	// through a time value it would lose the microseconds and the newest message would look
	// newer than itself.
	SeenUpTo string
}

func buildThread(c msgConversationRow, rows []conversationMessageRow, zone string) threadView {
	v := threadView{
		Header: threadHeader{
			ConversationID: c.ConversationID, ClientID: c.ClientID, ClientName: c.ClientDisplayName,
			ClientFirstName: c.ClientFirstName, TripID: str(c.TripID),
			TripLabel: cmpOr(str(c.TripTitle), msgGeneralThread), Overdue: c.Overdue,
			Archived: c.Archived, ClientCanSignIn: c.ClientCanSignIn,
		},
		TimeZone: zone,
	}
	if due := str(c.ReplyDueAt); due != "" && !c.Overdue {
		v.Header.ReplyByLabel = messagesReplyBy(dueDay(due, zone))
	}
	for _, m := range rows {
		sender := "agent"
		if m.SenderRole == "client" {
			sender = "client"
		}
		msg := threadMessageView{
			ID: m.MessageID, Sender: sender, Body: m.Body, CreatedAt: m.CreatedAt,
			InternalNote: m.IsInternalNote, Emailed: m.EmailedAt != nil,
			ByEmail: m.Channel == "email", AutoReply: m.IsAutoReply,
		}
		for _, a := range m.Attachments {
			msg.Attachments = append(msg.Attachments, threadAttachment{ID: a.DocumentID, Filename: a.Filename})
		}
		v.Messages = append(v.Messages, msg)
	}
	if len(rows) > 0 {
		v.Truncated = rows[0].TotalMessages > int64(len(rows))
		v.SeenUpTo = rows[len(rows)-1].CreatedAt
	}
	return v
}

// threadDay is one day's worth of messages under its separator.
type threadDay struct {
	Key      string // yyyy-mm-dd in the advisor's zone
	Label    string
	Messages []threadMessageView
}

func groupMessagesByDay(messages []threadMessageView, zone string, now time.Time) []threadDay {
	var days []threadDay
	for _, m := range messages {
		key, ok := dayKeyIn(m.CreatedAt, zone)
		if !ok {
			continue
		}
		if n := len(days); n > 0 && days[n-1].Key == key {
			days[n-1].Messages = append(days[n-1].Messages, m)
			continue
		}
		days = append(days, threadDay{Key: key, Label: formatDaySeparator(m.CreatedAt, zone, now), Messages: []threadMessageView{m}})
	}
	return days
}

// ── Who a new message is for ─────────────────────────────────────────────────────────────

type messageTarget struct {
	ClientID        string
	ClientName      string
	ClientFirstName string
	TripID          string
	TripLabel       string
	// ConversationID is the live thread this message belongs in, when there already is one.
	ConversationID  string
	ClientCanSignIn bool
}

func toMessageTarget(r messageTargetRow) messageTarget {
	return messageTarget{
		ClientID: r.ClientID, ClientName: r.ClientDisplayName, ClientFirstName: r.ClientFirstName,
		TripID: str(r.TripID), TripLabel: cmpOr(str(r.TripTitle), msgGeneralThread),
		ConversationID: str(r.ConversationID), ClientCanSignIn: r.ClientCanSignIn,
	}
}
