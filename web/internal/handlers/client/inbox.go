package client

import (
	"context"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
)

// Screen Inventory §2.6's reads and its one formatted row, ported from
// web/lib/messages/{queries,inbox,content}.ts.
//
// THE READ SIDE OF THIS SECTION ALREADY EXISTED. conversation and message got policies AND
// column grants in 20260907031255_trip_read_policies.sql, including client_unread_count,
// last_message_preview, subject and archived_at — so §2.6 needs no migration to render.
//
// WHAT IS NOT GRANTED, and therefore cannot appear on any of these screens:
//   - agent_unread_count, so no "Gyasi has N unread" anywhere on the client side.
//   - message.read_by_other_at, so no read receipts. Withheld on purpose.
//   - message.is_internal_note: invisible through a ROW predicate rather than redacted, so
//     naming the column raises 42501.
//
// ARCHIVED THREADS ARE UNREADABLE. conversation_self_select carries archived_at IS NULL, so
// there is no client-side archive view to build and no "Archived" tab to add without a
// policy change. §2.6.1 was amended to drop the archive action for exactly that reason.

// MessagesCopy is MESSAGES, word for word. messages_copy_test.go reads the TypeScript.
var MessagesCopy = struct {
	Title, Subtitle                     string
	AdvisorName, AdvisorInitials        string
	ReplyWindow                         string
	SearchPlaceholder, SearchEmpty      string
	GeneralThreadTitle                  string
	EmptyTitle, EmptyBody, EmptyCta     string
	NewCta, BackToMessages              string
	ThreadEmptyBody                     string
	NewTitle, NewBodyLabel, NewSubtitle string
	NewPlaceholder, NewSend, NewSending string
	NewFailed, AttachDeferred           string
	SelectTitle, SelectBody             string
}{
	Title:    "Messages",
	Subtitle: "You and Gyasi, in one place.",
	// The advisor, everywhere in this section. Initials, never a photograph.
	AdvisorName:       "Gyasi Story",
	AdvisorInitials:   "GS",
	ReplyWindow:       "Usually replies the same day",
	SearchPlaceholder: "Search your messages",
	SearchEmpty:       "Nothing matched that.",
	// A thread with no trip and no subject — what 2.6.3 creates. Named for the person rather
	// than described as "General", because that is what it is: the one conversation you have
	// with your advisor that is not about a particular trip.
	GeneralThreadTitle: "Gyasi Story",
	EmptyTitle:         "No messages yet",
	EmptyBody: "When you or Gyasi start a conversation — about a trip or about anything " +
		"else — it shows up here.",
	EmptyCta: "Send Gyasi a message",
	NewCta:   "New message",
	// "Open trip" is NOT here. It is ThreadMessages.OpenTrip, already pinned for 2.2.7, and
	// both screens render the identical string.
	BackToMessages: "Messages",
	// The empty thread on a conversation with no trip. ThreadMessages.EmptyBody says "you
	// and Gyasi talk about THIS TRIP", which is right on 2.2.7 and wrong on the one thread
	// that has no trip at all. It is reachable: trip-message creates the conversation and
	// inserts the message in two statements and is explicitly NOT atomic.
	ThreadEmptyBody: "This is where you and Gyasi talk. Ask anything — the small questions " +
		"are the ones worth asking.",
	NewTitle: "New message",
	// The field's own label, which must NOT be NewTitle — that is the page heading directly
	// above it, and a form whose only field is labelled the same as its page reads like a
	// rendering bug.
	NewBodyLabel: "Message",
	NewSubtitle: "Anything at all — an idea you can't shake, a date that might work, a " +
		"question about somewhere you've been reading about. There is never a fee for asking.",
	NewPlaceholder: "What's on your mind?",
	NewSend:        "Send to Gyasi",
	NewSending:     "Sending…",
	NewFailed:      "That didn't send — your words are still here. Try again in a moment.",
	// A trip-less thread has nothing it could attach.
	AttachDeferred: "Attaching files arrives with the document upload screen",
	// The right pane before a thread is picked, shown only on the widest layout — below that
	// the list is the whole screen and this never renders.
	SelectTitle: "Pick a conversation",
	SelectBody:  "Choose a thread on the left, or start a new one.",
}

// InboxConversation is one row as the database answers it.
type InboxConversation struct {
	ID string
	// Subject is empty on a general thread: nothing sets one.
	Subject            string
	TripID             string
	TripTitle          string
	LastMessageAt      string
	LastMessagePreview string
	UnreadCount        int
}

// InboxRow is one row as the list draws it, already formatted.
//
// THE ROWS ARE FORMATTED ON THE SERVER, which in Next was about hydration and here is about
// something plainer: "is this timestamp today?" is a question whose answer depends on a
// clock AND a zone, and the only zone that is right is the traveler's own.
type InboxRow struct {
	ID   string
	Href string
	// Title is the trip title, else the subject, else the advisor's name.
	Title string
	// TripLabel is the trip's name as the row's kicker, empty on the general thread.
	TripLabel   string
	Preview     string
	Time        string
	UnreadCount int
	Active      bool
}

type inboxRow struct {
	ID                 string  `json:"id"`
	Subject            *string `json:"subject"`
	TripID             *string `json:"trip_id"`
	LastMessageAt      *string `json:"last_message_at"`
	LastMessagePreview *string `json:"last_message_preview"`
	ClientUnreadCount  *int    `json:"client_unread_count"`
	Trip               *struct {
		Title string `json:"title"`
	} `json:"trip"`
}

const inboxColumns = "id,subject,trip_id,last_message_at,last_message_preview," +
	"client_unread_count,trip:trip_id(title)"

func (r inboxRow) view() InboxConversation {
	c := InboxConversation{
		ID: r.ID, Subject: text(r.Subject), TripID: text(r.TripID),
		LastMessageAt: text(r.LastMessageAt), LastMessagePreview: text(r.LastMessagePreview),
	}
	if r.Trip != nil {
		c.TripTitle = r.Trip.Title
	}
	if r.ClientUnreadCount != nil {
		c.UnreadCount = *r.ClientUnreadCount
	}
	return c
}

// loadInbox is Screen 2.6.1's list.
//
// KEYED ON THE CLIENT, NOT A TRIP, which is the whole difference from every conversation
// read §2.2 has: those are single-row lookups by trip, and none of them can see a thread
// with no trip. conversation_self_select already scopes rows to the caller, so this needs no
// filter of its own.
//
// The trip title is EMBEDDED rather than joined in a second pass; trip's own policy still
// applies to the embedded side, so an unreadable trip comes back null and the row falls back
// to its subject.
func (a *area) loadInbox(ctx context.Context, token string) ([]InboxConversation, error) {
	rows, err := supa.Select[inboxRow](ctx, a.Supa, token, "conversation",
		supa.Q().Select(inboxColumns).Order("last_message_at", false))
	if err != nil {
		return nil, err
	}
	out := make([]InboxConversation, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.view())
	}
	return out, nil
}

// InboxTitle is what to call a thread.
//
// subject is set to the trip title when trip-message creates a trip thread, so it is almost
// always there. A GENERAL THREAD HAS NEITHER: 2.6.3 deliberately does not ask for a subject
// line, because a subject field is the first step towards a structured intake form and BRD
// §6.5 consolidated intake onto quote-request precisely so there would not be a second
// queue. So the fallback names the person you are talking to.
//
// The trip title wins over a stale subject when both exist, because a trip can be renamed
// after the thread was created and the header should follow the trip.
func InboxTitle(subject, tripTitle string) string {
	switch {
	case tripTitle != "":
		return tripTitle
	case subject != "":
		return subject
	}
	return MessagesCopy.GeneralThreadTitle
}

// FormatInboxTime is "2:14p" for today, "Yesterday", else "Mar 14".
//
// The desktop frame has a third tier — a bare weekday for the last week — which is dropped.
// It would need seven new strings and a Kotlin twin for each, under CI parity, to save a
// traveler with three threads from reading a date.
func FormatInboxTime(iso string, loc *time.Location, now time.Time) string {
	day := FormatDaySeparator(iso, loc, now)
	if day == ThreadMessages.Today {
		return FormatMessageTime(iso, loc)
	}
	return day
}

// InboxRows formats the list.
//
// An empty preview is possible: last_message_preview is nullable, and a conversation exists
// for a moment before its first message lands. The row still has to render — a thread that
// vanishes because one column is null is worse than a quiet line under it.
func InboxRows(conversations []InboxConversation, loc *time.Location, now time.Time, activeID string) []InboxRow {
	out := make([]InboxRow, 0, len(conversations))
	for _, c := range conversations {
		out = append(out, InboxRow{
			ID:          c.ID,
			Href:        "/messages/" + c.ID,
			Title:       InboxTitle(c.Subject, c.TripTitle),
			TripLabel:   c.TripTitle,
			Preview:     c.LastMessagePreview,
			Time:        FormatInboxTime(c.LastMessageAt, loc, now),
			UnreadCount: c.UnreadCount,
			Active:      c.ID == activeID,
		})
	}
	return out
}

// FilterRows searches over WHAT THE ROW ACTUALLY SHOWS.
//
// NOT A SERVER-SIDE SEARCH OVER MESSAGE BODIES. message.body is readable, so a full-text
// search over the whole history would be possible — but last_message_preview is the only
// message text the inbox has loaded, and a search that matched a message the traveler cannot
// see in the list would return rows whose visible text does not contain what they typed.
// Searching exactly what is on screen is the honest version of this control.
func FilterRows(rows []InboxRow, query string) []InboxRow {
	needle := strings.ToLower(strings.TrimSpace(query))
	if needle == "" {
		return rows
	}
	out := make([]InboxRow, 0, len(rows))
	for _, row := range rows {
		for _, field := range []string{row.Title, row.Preview, row.TripLabel} {
			if strings.Contains(strings.ToLower(field), needle) {
				out = append(out, row)
				break
			}
		}
	}
	return out
}

// ConversationThreadView is Screen 2.6.2, addressed by conversation.
type ConversationThreadView struct {
	ConversationID string
	// Title is what the header shows. Never empty.
	Title string
	// TripID is empty on a general thread, which is what suppresses "Open trip".
	TripID      string
	UnreadCount int
	TimeZone    string
	Messages    []ThreadMessage
}

type conversationHeadRow struct {
	ID                string  `json:"id"`
	Subject           *string `json:"subject"`
	TripID            *string `json:"trip_id"`
	ClientUnreadCount *int    `json:"client_unread_count"`
	Trip              *struct {
		Title string `json:"title"`
	} `json:"trip"`
}

// loadConversationThread reads 2.6.2.
//
// NOT loadTripThread. That one resolves the conversation FROM a trip and cannot reach a
// thread with trip_id IS NULL, so 2.6.2 would 404 on exactly the threads 2.6.3 creates.
//
// No row, not yours, and archived are ONE answer: conversation_self_select makes all three
// invisible, so none of them can be told apart and none of them should be.
func (a *area) loadConversationThread(ctx context.Context, token, conversationID string) (*ConversationThreadView, bool, error) {
	row, found, err := supa.MaybeOne[conversationHeadRow](ctx, a.Supa, token, "conversation",
		supa.Q().Select("id,subject,trip_id,client_unread_count,trip:trip_id(title)").
			Eq("id", conversationID))
	if err != nil {
		return nil, false, err
	}
	if !found {
		return nil, false, nil
	}

	tripTitle := ""
	if row.Trip != nil {
		tripTitle = row.Trip.Title
	}
	view := &ConversationThreadView{
		ConversationID: row.ID,
		Title:          InboxTitle(text(row.Subject), tripTitle),
		TripID:         text(row.TripID),
		TimeZone:       a.travelerZone(ctx, token),
	}
	if row.ClientUnreadCount != nil {
		view.UnreadCount = *row.ClientUnreadCount
	}
	view.Messages, err = a.loadThreadMessages(ctx, token, row.ID)
	if err != nil {
		return nil, false, err
	}
	return view, true, nil
}
