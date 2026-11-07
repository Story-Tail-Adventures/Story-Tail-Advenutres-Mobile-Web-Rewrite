// Package agentmessage ports supabase/functions/agent-message: the advisor's side of
// messaging, Screens 3.10.1 (Inbox) and 3.10.2 (Thread), §3.10 Stage 1. MOBILE-CALLED: every
// sentence and status is the phone's contract.
//
// Ops:
//
//	send     a reply or an internal note, into an existing thread or a new one for a client
//	         (and optionally one of their trips): agent_send_message
//	read     opening a thread clears the advisor's unread count, up to the newest message the
//	         page showed: agent_mark_conversation_read
//	archive  archive from, or bring back to, the inbox: agent_set_conversations_archived
//
// WHY THE WRITES ARE SQL: a send is a thread find-or-create, a message insert and a thread
// update that must land together, and an internal note must never touch the preview fields
// the CLIENT reads. One function decides that in one place (20261015120000_agent_messaging).
//
// The audit row for a send matches trip-message's (`message.created`) and is written after
// the commit: messages are not one of rule 3's sensitive tables, and the client path set this
// shape. Email and push go out from the outboxes the database fills, not from here.
package agentmessage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/message"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/messagetemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPC(ctx context.Context, fn string, args any, out any) error
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
	audit.Inserter
}

// newID mints the id of a thread a send may create; tests replace it.
var newID = uuid.New

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	agentID, err := guard.RequireAgentID(r.Context(), d.DB, c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	return handle(r.Context(), d.DB, c, agentID, payload, d.Now())
}

func handle(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value, now time.Time) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	switch op {
	case "send":
		return send(ctx, db, c, agentID, payload, now)
	case "read":
		return read(ctx, db, agentID, payload)
	case "archive":
		return archive(ctx, db, agentID, payload)
	}
	return nil, problem.BadRequest("Send an op of send, read, archive.")
}

var messagePkey = regexp.MustCompile(`message_pkey`)

type sendRow struct {
	Outcome        string  `json:"outcome"`
	ConversationID *string `json:"conversation_id"`
	// Passed through as Postgres wrote it: a Date would drop the microseconds.
	CreatedAt *string `json:"created_at"`
}

func send(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value, now time.Time) (*edge.Reply, error) {
	address, err := message.ReadThreadAddress(payload)
	if err != nil {
		return nil, err
	}
	body, err := message.ReadMessageBody(payload.Get("body"))
	if err != nil {
		return nil, err
	}
	// "Insert & edit" can leave a raw {{token}} in the box. The reply box refuses it too;
	// this is the check a client cannot get around.
	if err := messagetemplate.RefuseUnfilledFields(body); err != nil {
		return nil, err
	}
	internalNote, err := message.ReadInternalNote(payload.Get("internalNote"))
	if err != nil {
		return nil, err
	}
	messageID, err := message.ReadMessageID(payload.Get("messageId"), now)
	if err != nil {
		return nil, err
	}
	// Optional: "new message" has nothing on screen yet.
	seenUpTo, err := message.ReadSeenUpTo(payload.Get("seenUpTo"), false)
	if err != nil {
		return nil, err
	}

	args := js.O("p_agent_id", agentID, "p_actor_user_id", c.PlatformUserID, "p_message_id", messageID,
		"p_body", body, "p_is_internal_note", internalNote)
	if seenUpTo != nil && *seenUpTo != "" {
		args = append(args, js.Field{Key: "p_seen_up_to", Value: *seenUpTo})
	}
	// Left out, not null, for the address not used: the SQL DEFAULTs apply.
	if address.Kind == message.KindThread {
		args = append(args, js.Field{Key: "p_conversation_id", Value: address.ConversationID})
	} else {
		args = append(args, js.Field{Key: "p_client_id", Value: address.ClientID})
		if address.TripID != nil && *address.TripID != "" {
			args = append(args, js.Field{Key: "p_trip_id", Value: *address.TripID})
		}
		// Minted only when a new thread may be needed; the SQL uses it if so.
		args = append(args, js.Field{Key: "p_new_conversation_id", Value: newID()})
	}

	var row sendRow
	found, err := db.RPCRow(ctx, "agent_send_message", args, &row)
	if err != nil {
		var se *service.Error
		if errors.As(err, &se) && se.Code == "23505" && messagePkey.MatchString(se.Message) {
			return nil, problem.BadRequest("That message was already sent.")
		}
		return nil, fmt.Errorf("agent send failed: %w", err)
	}
	// Zero rows: not this advisor's thread, client or trip, or gone. One answer for all.
	if !found {
		return nil, problem.NotFound("That thread or client isn't one of yours, or it's gone.")
	}
	if row.Outcome == "note_needs_thread" {
		return nil, problem.BadRequest("Start the thread with a message they can read. Notes can go in after that.")
	}
	if row.Outcome != "sent" {
		return nil, fmt.Errorf("unhandled agent_send_message outcome")
	}

	metadata := js.O("conversationId", row.ConversationID, "internalNote", internalNote)
	if address.Kind == message.KindClient {
		metadata = append(metadata, js.Field{Key: "clientId", Value: address.ClientID},
			js.Field{Key: "tripId", Value: address.TripID})
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: "message.created", TargetEntity: "message", TargetID: messageID, Metadata: metadata,
	}); err != nil {
		return nil, err
	}
	return &edge.Reply{Status: http.StatusCreated, Body: js.O("messageId", messageID,
		"conversationId", row.ConversationID, "createdAt", row.CreatedAt)}, nil
}

func read(ctx context.Context, db backend, agentID string, payload js.Value) (*edge.Reply, error) {
	conversationID, ok := payload.Get("conversationId").Str()
	if !ok || !uuid.IsUUID(conversationID) {
		return nil, problem.BadRequest("That is not a thread id.")
	}
	seenUpTo, err := message.ReadSeenUpTo(payload.Get("seenUpTo"), true)
	if err != nil {
		return nil, err
	}
	var raw json.RawMessage
	if err := db.RPC(ctx, "agent_mark_conversation_read", js.O("p_agent_id", agentID,
		"p_conversation_id", conversationID, "p_seen_up_to", seenUpTo), &raw); err != nil {
		return nil, fmt.Errorf("mark read failed: %w", err)
	}
	// A thread already read, or not this advisor's, both answer changed: false: opening a
	// page is not a place to learn whether an id exists.
	return edge.OK(js.O("changed", string(raw) == "true"))
}

func archive(ctx context.Context, db backend, agentID string, payload js.Value) (*edge.Reply, error) {
	ids, err := message.ReadConversationIDs(payload.Get("conversationIds"))
	if err != nil {
		return nil, err
	}
	archived, isBool := payload.Get("archived").Bool()
	if !isBool {
		return nil, problem.BadRequest("Say whether to archive or bring back.")
	}
	var raw json.RawMessage
	if err := db.RPC(ctx, "agent_set_conversations_archived", js.O("p_agent_id", agentID,
		"p_conversation_ids", ids, "p_archived", archived), &raw); err != nil {
		return nil, fmt.Errorf("archive failed: %w", err)
	}
	// `typeof data === "number" ? data : 0`.
	moved := js.Num(0)
	if n, err := js.Parse(raw); err == nil {
		if f, ok := n.Num(); ok {
			moved = js.Num(f)
		}
	}
	return edge.OK(js.O("moved", moved, "requested", len(ids)))
}
