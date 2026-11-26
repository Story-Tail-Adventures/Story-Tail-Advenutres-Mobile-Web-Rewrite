package client

import (
	"context"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Reading a thread, the port of loadTripThread and loadThreadMessages in
// web/lib/trips/queries.ts.
//
// is_internal_note is NOT filtered here, and that is not an omission: it is outside the
// client column grant, so naming it would raise 42501. The filtering happens in
// message_self_select, which carries is_internal_note = false as a ROW predicate — the
// internal notes are invisible rather than redacted. The seed keeps a deliberate internal
// note on Jordan's thread and supabase/tests/rls_trip_graph.sql asserts it never comes back.

// TripThreadView is 2.2.7's whole screen.
type TripThreadView struct {
	TripID    string
	TripTitle string
	// ConversationID is empty on a trip whose thread does not exist yet. That is a real
	// state, not an error: the row is created by trip-message on the first send.
	ConversationID string
	UnreadCount    int
	// TimeZone is the traveler's own IANA zone, for grouping and formatting the timestamps.
	TimeZone string
	Messages []ThreadMessage
}

type messageRow struct {
	ID          string `json:"id"`
	SenderRole  string `json:"sender_role"`
	Body        string `json:"body"`
	CreatedAt   string `json:"created_at"`
	IsAutoReply *bool  `json:"is_auto_reply"`
}

// attachmentRow is the join message_attachment → document.
//
// The embedded document is NULLABLE on purpose, so this is not an inner join: document's own
// policy still applies to the embedded side, and an attachment pointing at something the
// client may not read (a receipt) comes back with a null document. Dropping it is the
// behaviour we want.
type attachmentRow struct {
	MessageID string       `json:"message_id"`
	Document  *documentRow `json:"document"`
}

const attachmentColumns = "message_id,document:document_id(id,owner_user_id,trip_id,kind," +
	"filename,mime_type,size_bytes,created_at)"

// loadThreadMessages reads every readable message on one conversation, with its attachments.
//
// It takes a CONVERSATION id rather than a trip, because §2.6.2 addresses threads that may
// have no trip at all and duplicating this read for them would mean two places to forget the
// attachment behaviour above.
func (a *area) loadThreadMessages(ctx context.Context, token, conversationID string) ([]ThreadMessage, error) {
	rows, err := supa.Select[messageRow](ctx, a.Supa, token, "message",
		supa.Q().Select("id,sender_role,body,created_at,is_auto_reply").
			Eq("conversation_id", conversationID).Order("created_at", true))
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	me := a.platformUserID(ctx, token)
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}

	// One query for the whole thread rather than one per message.
	byMessage := map[string][]Document{}
	attachments, err := supa.Select[attachmentRow](ctx, a.Supa, token, "message_attachment",
		supa.Q().Select(attachmentColumns).In("message_id", ids...))
	if err != nil {
		// The bubbles are worth more than the chips under them, and this read failing is not
		// a reason to show the traveler an error page instead of their conversation.
		a.Log.Warn("client: thread attachments read failed", "err", err)
	} else {
		for _, row := range attachments {
			if row.Document == nil {
				continue
			}
			byMessage[row.MessageID] = append(byMessage[row.MessageID], row.Document.view(me))
		}
	}

	out := make([]ThreadMessage, 0, len(rows))
	for _, r := range rows {
		out = append(out, ThreadMessage{
			ID: r.ID, Sender: r.SenderRole, Body: r.Body, CreatedAt: r.CreatedAt,
			Attachments: byMessage[r.ID], AutoReply: r.IsAutoReply != nil && *r.IsAutoReply,
		})
	}
	return out, nil
}

// loadTripThread reads 2.2.7. A missing trip is reported as not found; everything else that
// fails is reported as an error, so a failed read never renders as an empty conversation.
func (a *area) loadTripThread(ctx context.Context, token, tripID string) (*TripThreadView, bool, error) {
	trip, found, err := supa.MaybeOne[tripTitleRow](ctx, a.Supa, token, "trip",
		supa.Q().Select("id,title").Eq("id", tripID))
	if err != nil {
		return nil, false, err
	}
	if !found {
		return nil, false, nil
	}

	view := &TripThreadView{TripID: trip.ID, TripTitle: trip.Title, TimeZone: a.travelerZone(ctx, token)}

	conversations, err := supa.Select[conversationRow](ctx, a.Supa, token, "conversation",
		supa.Q().Select("id,client_unread_count").Eq("trip_id", tripID).Limit(1))
	if err != nil {
		return nil, false, err
	}
	if len(conversations) == 0 {
		// No conversation yet: the empty thread, not an error.
		return view, true, nil
	}

	view.ConversationID = conversations[0].ID
	if n := conversations[0].ClientUnreadCount; n != nil {
		view.UnreadCount = *n
	}
	view.Messages, err = a.loadThreadMessages(ctx, token, view.ConversationID)
	if err != nil {
		return nil, false, err
	}
	return view, true, nil
}

// tripTitleRow is the trip, named.
type tripTitleRow struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// travelerZone is platform_user.time_zone, or "" for the UTC fallback. A bad or missing zone
// costs a wrong hour, never a blank thread.
func (a *area) travelerZone(ctx context.Context, token string) string {
	row, found, err := supa.MaybeOne[platformUserRow](ctx, a.Supa, token, "platform_user",
		supa.Q().Select("id,time_zone"))
	if err != nil || !found || row.TimeZone == nil {
		return FallbackTimeZone
	}
	return *row.TimeZone
}
