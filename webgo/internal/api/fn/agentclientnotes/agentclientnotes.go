// Package agentclientnotes ports supabase/functions/agent-client-notes: add, edit and delete
// (archive) a client's internal notes. Screen 3.3.7, the Notes tab of Client Detail.
//
// The same skeleton as agent-trip-notes with rows instead of a field: it manages rows in
// client_note, so it carries an explicit `op` and four outcomes.
//
// NO expectedVersion, deliberately: client_note has no version column (Data-Model §20.4).
//
// THE NOTE ID IS GENERATED HERE, as a v7 (Data-Model §21.6), so it is trusted by
// construction and needs no recency check.
//
// WHAT IT REFUSES: not an agent or an archived one, 403; a client that is not this agent's,
// does not exist or is a merged tombstone, 404; a note that is not this client's or not this
// author's, the same 404 (one answer for all, so ids cannot be probed); an empty body on
// create or update, 400.
//
// AN AUDIT ROW ONLY WHEN SOMETHING CHANGED, and never the note BODY: client_note is the
// agent's private prose about a person, and an audit_event is kept seven years.
package agentclientnotes

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// maxBody is the Notes tab's own cap: long enough for a real jotting, short enough to bound
// a write. JavaScript's length (UTF-16 units).
const maxBody = 4000

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
	audit.Inserter
}

// newID mints the note id on create; tests replace it.
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
	return handle(r.Context(), d.DB, c, agentID, payload)
}

// request is the validated request.
type request struct {
	ClientID, Op, NoteID string
	Body                 *string // nil on archive
}

func parse(payload js.Value) (request, error) {
	var q request
	clientID, ok := payload.Get("clientId").Str()
	if !ok || !uuid.IsUUID(clientID) {
		return q, problem.BadRequest("That is not a client id.")
	}
	q.ClientID = clientID

	op, _ := payload.Get("op").Str()
	switch op {
	case "create", "update", "archive":
		q.Op = op
	default:
		return q, problem.BadRequest("op must be create, update or archive.")
	}

	// On create the id is ours; on the other two it names an existing row.
	if q.Op == "create" {
		q.NoteID = newID()
	} else {
		id, ok := payload.Get("noteId").Str()
		if !ok || !uuid.IsUUID(id) {
			return q, problem.BadRequest("That is not a note id.")
		}
		q.NoteID = id
	}

	if q.Op != "archive" {
		// An empty body is not a way to delete a note: `archive` is. Collapsing the two
		// would make a mistyped save silently destructive.
		body, ok := payload.Get("body").Str()
		if !ok || js.Trim(body) == "" {
			return q, problem.BadRequest("A note needs something in it.")
		}
		if js.Len(body) > maxBody {
			return q, problem.BadRequest("That note is too long.")
		}
		q.Body = &body
	}
	return q, nil
}

type noteRow struct {
	Outcome string  `json:"outcome"`
	NoteID  *string `json:"note_id"`
}

func handle(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	q, err := parse(payload)
	if err != nil {
		return nil, err
	}
	var row noteRow
	// p_body is null on archive: a note being removed has no new body.
	found, err := db.RPCRow(ctx, "agent_write_client_note", js.O(
		"p_client_id", q.ClientID,
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_note_id", q.NoteID,
		"p_body", q.Body,
		"p_op", q.Op,
	), &row)
	if err != nil {
		return nil, fmt.Errorf("client note write failed: %w", err)
	}
	// Zero rows covers every refusal the function makes, one answer for all of them.
	if !found {
		return nil, problem.NotFound("No such client or note.")
	}
	if row.Outcome == "noop" {
		return edge.OK(js.O("clientId", q.ClientID, "noteId", row.NoteID, "changed", false))
	}
	switch row.Outcome {
	case "created", "changed", "archived":
	default:
		return nil, fmt.Errorf("unhandled agent_write_client_note outcome")
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType:    "client.note_" + row.Outcome,
		TargetEntity: "client",
		TargetID:     q.ClientID,
		// The note id, never the note.
		Metadata: js.O("note_id", row.NoteID),
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("clientId", q.ClientID, "noteId", row.NoteID, "changed", true, "outcome", row.Outcome))
}
