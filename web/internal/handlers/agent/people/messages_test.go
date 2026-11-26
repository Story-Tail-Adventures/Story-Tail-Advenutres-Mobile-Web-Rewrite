package people

import (
	"encoding/json"
	"testing"
	"time"
)

// Ported from web/lib/agent/messages.test.ts and the thread-time helpers in
// web/lib/trips/thread.ts (§3.10 Stage 1). The component tests feed already-mapped objects,
// so a renamed column fails here or nowhere.

const msgNY = "America/New_York"

var msgNow = time.Date(2026, 10, 12, 20, 0, 0, 0, time.UTC)

func threadRowFixture(t *testing.T, over map[string]any) msgThreadRow {
	t.Helper()
	row := map[string]any{
		"conversation_id": "c1", "client_id": "k1", "client_display_name": "Maya Carter",
		"trip_id": "t1", "trip_title": "Sandals · Jul", "subject": "Sandals · Jul",
		"last_message_at": "2026-10-12T18:14:00Z", "last_message_preview": "Yes lock the upgrade!",
		"last_sender_role": "client", "agent_unread_count": 2,
		// Ends Tuesday 2026-10-13 in New York: due "end of Tue".
		"reply_due_at": "2026-10-14T04:00:00Z", "overdue": false, "archived": false, "total_count": 1,
	}
	for k, v := range over {
		row[k] = v
	}
	var r msgThreadRow
	if err := json.Unmarshal([]byte(mustJSON(row)), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestInboxThreadRow(t *testing.T) {
	t.Run("names the client, the trip, what was said and when, and the day a reply is due", func(t *testing.T) {
		got := inboxThread(threadRowFixture(t, nil), emptyInboxQuery, msgNY, msgNow)
		want := inboxThread2{
			ID: "c1", Href: "/agent/messages/c1", ClientName: "Maya Carter", TripLabel: "Sandals · Jul",
			Preview: "Yes lock the upgrade!", TimeLabel: "2:14p", Unread: 2, Overdue: false,
			ReplyByLabel: "Reply by Tue", Archived: false,
		}
		if got != want {
			t.Errorf("inboxThread = %+v, want %+v", got, want)
		}
	})

	t.Run("says when the advisor spoke last, calls a tripless thread General, and drops the due day once overdue", func(t *testing.T) {
		row := inboxThread(
			threadRowFixture(t, map[string]any{"last_sender_role": "agent", "trip_title": nil, "overdue": true}),
			inboxQuery{Unread: true, Page: 1}, msgNY, msgNow,
		)
		if row.Preview != "You: Yes lock the upgrade!" || row.TripLabel != "General" || row.ReplyByLabel != "" ||
			row.Href != "/agent/messages/c1?unread=1" {
			t.Errorf("row = %+v", row)
		}
	})

	// Go-only: an empty preview is possible (the column is nullable, and a conversation exists
	// for a moment before its first message), and it must not grow a "You: " of its own.
	t.Run("an empty preview stays empty, whoever spoke last", func(t *testing.T) {
		row := inboxThread(threadRowFixture(t, map[string]any{"last_message_preview": nil, "last_sender_role": "agent"}), emptyInboxQuery, msgNY, msgNow)
		if row.Preview != "" {
			t.Errorf("preview = %q", row.Preview)
		}
	})
}

func TestBuildInbox(t *testing.T) {
	summary := msgSummaryRow{OpenThreads: 3, UnreadThreads: 2, UnreadMessages: 3, OverdueThreads: 1, ArchivedThreads: 4}
	rows := []msgThreadRow{threadRowFixture(t, map[string]any{"total_count": 120})}
	got := buildInbox(summary, rows, inboxQuery{Page: 2}, msgNY, msgNow)
	if got.Headline != "2 unread · 1 overdue" || got.ArchivedThreads != 4 || got.Total != 120 || got.Page != 2 || got.PageCount != 3 {
		t.Errorf("inbox = %+v", got)
	}

	// No threads on the page: the count comes from the caller's second read (the handler), and
	// an empty inbox is one page, never zero.
	empty := buildInbox(msgSummaryRow{}, nil, emptyInboxQuery, msgNY, msgNow)
	if empty.Headline != "All caught up" || empty.PageCount != 1 || len(empty.Threads) != 0 {
		t.Errorf("empty = %+v", empty)
	}

	// The headline counts with thousands separators, as toLocaleString writes them.
	big := buildInbox(msgSummaryRow{UnreadThreads: 1200, OverdueThreads: 0}, nil, emptyInboxQuery, msgNY, msgNow)
	if big.Headline != "1,200 unread" {
		t.Errorf("headline = %q", big.Headline)
	}
}

func TestBuildThread(t *testing.T) {
	conv := msgConversationRow{
		ConversationID: "c1", ClientID: "k1", ClientDisplayName: "Maya Carter", ClientFirstName: "Maya",
		Overdue: true, ClientCanSignIn: false,
	}
	var msgs []conversationMessageRow
	if err := json.Unmarshal([]byte(`[
		{"message_id":"m0","sender_role":"client","body":"hi","is_internal_note":false,"created_at":"2026-10-12T17:00:00.5+00:00","attachments":[],"total_messages":2,"emailed_at":null,"channel":"email"},
		{"message_id":"m1","sender_role":"agent","body":"note","is_internal_note":true,"created_at":"2026-10-12T18:00:00.123456+00:00","attachments":[{"document_id":"d1","filename":"a.pdf","kind":"passport"}],"total_messages":2,"emailed_at":"2026-10-12T18:05:00+00:00","channel":"app"}
	]`), &msgs); err != nil {
		t.Fatal(err)
	}
	got := buildThread(conv, msgs, msgNY)
	if got.Header.ClientFirstName != "Maya" || got.Header.TripLabel != "General" || !got.Header.Overdue ||
		got.Header.ReplyByLabel != "" || got.Header.ClientCanSignIn {
		t.Errorf("header = %+v", got.Header)
	}
	if len(got.Messages) != 2 {
		t.Fatalf("messages = %d", len(got.Messages))
	}
	if m := got.Messages[0]; m.ID != "m0" || m.Sender != "client" || m.InternalNote || !m.ByEmail || m.Emailed {
		t.Errorf("first = %+v", m)
	}
	if m := got.Messages[1]; m.ID != "m1" || m.Sender != "agent" || !m.InternalNote || m.ByEmail || !m.Emailed ||
		len(m.Attachments) != 1 || m.Attachments[0] != (threadAttachment{ID: "d1", Filename: "a.pdf"}) {
		t.Errorf("second = %+v", m)
	}
	if got.TimeZone != msgNY || got.Truncated {
		t.Errorf("thread = %+v", got)
	}
	// The newest message's time as Postgres wrote it, microseconds and all: through a Date it
	// would lose them and the newest message would look newer than itself.
	if got.SeenUpTo != "2026-10-12T18:00:00.123456+00:00" {
		t.Errorf("seenUpTo = %q", got.SeenUpTo)
	}

	t.Run("says a thread is cut short from its real length, not from the row count", func(t *testing.T) {
		rows := make([]conversationMessageRow, 500)
		for i := range rows {
			rows[i] = conversationMessageRow{MessageID: "m", SenderRole: "client", Body: "x", CreatedAt: "2026-10-12T18:00:00Z", TotalMessages: 500}
		}
		if buildThread(conv, rows, msgNY).Truncated {
			t.Error("exactly 500 is the whole thread, nothing hidden")
		}
		for i := range rows {
			rows[i].TotalMessages = 612
		}
		if !buildThread(conv, rows, msgNY).Truncated {
			t.Error("612 of 500 shown is cut short")
		}
	})

	t.Run("an empty thread has no seenUpTo, and a due day shows while it is not overdue", func(t *testing.T) {
		if got := buildThread(conv, nil, msgNY); got.SeenUpTo != "" || len(got.Messages) != 0 {
			t.Errorf("empty = %+v", got)
		}
		due, title := "2026-10-14T04:00:00Z", "Sandals · Jul"
		c := conv
		c.Overdue, c.ReplyDueAt, c.TripTitle = false, &due, &title
		if got := buildThread(c, nil, msgNY); got.Header.ReplyByLabel != "Reply by end of Tue" || got.Header.TripLabel != title {
			t.Errorf("header = %+v", got.Header)
		}
	})
}

func TestMessageTargetView(t *testing.T) {
	row := messageTargetRow{ClientID: "k1", ClientDisplayName: "Nora Nologin", ClientFirstName: "Nora"}
	got := toMessageTarget(row)
	want := messageTarget{ClientID: "k1", ClientName: "Nora Nologin", ClientFirstName: "Nora", TripLabel: "General"}
	if got != want {
		t.Errorf("target = %+v, want %+v", got, want)
	}
	trip, title := "t1", "Sandals · Jul"
	row.TripID, row.TripTitle, row.ConversationID, row.ClientCanSignIn = &trip, &title, &trip, true
	if got := toMessageTarget(row); got.TripLabel != title || got.TripID != "t1" || got.ConversationID != "t1" || !got.ClientCanSignIn {
		t.Errorf("target = %+v", got)
	}
}

// The thread's clock, ported from web/lib/trips/thread.ts.
func TestThreadTimeHelpers(t *testing.T) {
	t.Run("a message's time is the hour, the minute and a bare a or p", func(t *testing.T) {
		for _, c := range []struct{ iso, zone, want string }{
			{"2026-10-12T18:14:00Z", msgNY, "2:14p"},
			{"2026-10-12T16:05:00Z", msgNY, "12:05p"},
			{"2026-10-12T04:30:00Z", msgNY, "12:30a"},
			{"2026-10-12T13:00:00Z", msgNY, "9:00a"},
			{"2026-10-12T18:14:00Z", "Not/AZone", "6:14p"}, // an unusable zone falls back to UTC
			{"not a time", msgNY, ""},
		} {
			if got := formatMessageTime(c.iso, c.zone); got != c.want {
				t.Errorf("formatMessageTime(%q, %q) = %q, want %q", c.iso, c.zone, got, c.want)
			}
		}
	})

	t.Run("a day separator is Today, Yesterday or the month and day in the zone", func(t *testing.T) {
		for _, c := range []struct{ iso, want string }{
			{"2026-10-12T18:14:00Z", "Today"},
			{"2026-10-12T02:00:00Z", "Yesterday"}, // 10pm on the 11th in New York
			{"2026-10-04T18:00:00Z", "Oct 4"},     // no leading zero
			{"2026-03-14T18:00:00Z", "Mar 14"},
			{"nonsense", ""},
		} {
			if got := formatDaySeparator(c.iso, msgNY, msgNow); got != c.want {
				t.Errorf("formatDaySeparator(%q) = %q, want %q", c.iso, got, c.want)
			}
		}
	})

	t.Run("an inbox time is the clock today and the day before that", func(t *testing.T) {
		for _, c := range []struct{ iso, want string }{
			{"2026-10-12T18:14:00Z", "2:14p"},
			{"2026-10-12T02:00:00Z", "Yesterday"},
			{"2026-03-14T18:00:00Z", "Mar 14"},
		} {
			if got := formatInboxTime(c.iso, msgNY, msgNow); got != c.want {
				t.Errorf("formatInboxTime(%q) = %q, want %q", c.iso, got, c.want)
			}
		}
	})

	t.Run("the day a reply falls due is the day the window ENDS", func(t *testing.T) {
		// Midnight ending Tuesday in New York is 04:00Z on Wednesday.
		if got := dueDay("2026-10-14T04:00:00Z", msgNY); got != "Tue" {
			t.Errorf("dueDay = %q", got)
		}
		// A Date has millisecond precision, so a microsecond past midnight is still Tuesday
		// in Next; a whole millisecond past it is Wednesday. Both match here.
		if got := dueDay("2026-10-14T04:00:00.000001Z", msgNY); got != "Tue" {
			t.Errorf("a microsecond past midnight = %q", got)
		}
		if got := dueDay("2026-10-14T04:00:00.001Z", msgNY); got != "Wed" {
			t.Errorf("a millisecond past midnight = %q", got)
		}
	})

	t.Run("messages are grouped by their day in the advisor's zone, in order", func(t *testing.T) {
		msgs := []threadMessageView{
			{ID: "a", CreatedAt: "2026-10-11T23:00:00Z"}, // 7pm on the 11th
			{ID: "b", CreatedAt: "2026-10-12T02:00:00Z"}, // 10pm on the 11th, same day there
			{ID: "c", CreatedAt: "2026-10-12T18:00:00Z"},
			{ID: "d", CreatedAt: "nonsense"},
		}
		days := groupMessagesByDay(msgs, msgNY, msgNow)
		if len(days) != 2 || days[0].Label != "Yesterday" || len(days[0].Messages) != 2 ||
			days[1].Label != "Today" || len(days[1].Messages) != 1 {
			t.Fatalf("days = %+v", days)
		}
		if days[0].Key != "2026-10-11" || days[1].Key != "2026-10-12" {
			t.Errorf("keys = %q %q", days[0].Key, days[1].Key)
		}
	})
}

func TestMessagesCopyHelpers(t *testing.T) {
	for _, c := range []struct{ got, want string }{
		{messagesHeadline(0, 0), "All caught up"},
		{messagesHeadline(3, 0), "3 unread"},
		{messagesHeadline(0, 1), "1 overdue"},
		{messagesHeadline(3, 1), "3 unread · 1 overdue"},
		{messagesSelected(2), "2 selected"},
		{messagesSelected(1200), "1,200 selected"},
		{messagesMoved(2, true), "2 archived"},
		{messagesMoved(1, false), "1 moved to inbox"},
		{messagesNewTo("Maya"), "Message Maya"},
		{messagesNoLogin("Kai"), "Kai hasn't set up a login yet, so this won't be emailed. It will be waiting when they sign in."},
	} {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
}
