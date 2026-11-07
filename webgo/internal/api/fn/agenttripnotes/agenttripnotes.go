// Package agenttripnotes ports supabase/functions/agent-trip-notes: edit a trip's agent-only
// notes (Screen 3.4.2, Trip Detail, Notes tab).
//
// Same skeleton as agent-trip-status, shorter body. agent_set_trip_notes has three outcomes
// (changed, noop, stale), no reason_changed: notes carry no mandatory companion field.
// expectedVersion is required for the same reason the stage write requires it: two tabs on
// the same trip is exactly what trip.version is for.
//
// Refuses: not an agent or an archived one (403); a trip that is not this agent's or does not
// exist (404, one answer for both); notes that are not a string (400); a stale
// expectedVersion (409).
//
// AN AUDIT ROW IS WRITTEN ONLY WHEN SOMETHING CHANGED. A noop write is not an event.
package agenttripnotes

import (
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// request is the validated body.
type request struct {
	TripID          string
	Notes           string
	ExpectedVersion int64
}

// parse checks the body in the order the Deno function did: trip id, notes, version.
func parse(payload js.Value) (request, error) {
	tripID, ok := payload.Get("tripId").Str()
	if !ok || !uuid.IsUUID(tripID) {
		return request{}, problem.BadRequest("That is not a trip id.")
	}
	// The empty string clears the notes; only a non-string is malformed.
	notes, ok := payload.Get("notes").Str()
	if !ok {
		return request{}, problem.BadRequest("notes must be text.")
	}
	v, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return request{}, err
	}
	return request{TripID: tripID, Notes: notes, ExpectedVersion: v}, nil
}

// result is one row of agent_set_trip_notes.
type result struct {
	Outcome string `json:"outcome"`
	Version int64  `json:"version"`
}

// outcome maps the RPC's answer to the reply. changed reports whether an audit row is owed.
func outcome(tripID string, found bool, res result) (body js.Ordered, changed bool, err error) {
	if !found {
		return nil, false, problem.NotFound("No such trip.")
	}
	switch res.Outcome {
	case "stale":
		return nil, false, problem.Conflict("This trip changed since you opened it. Reload and try again.")
	case "noop":
		return js.O("tripId", tripID, "version", res.Version, "changed", false), false, nil
	case "changed":
		return js.O("tripId", tripID, "version", res.Version, "changed", true), true, nil
	}
	return nil, false, fmt.Errorf("unhandled agent_set_trip_notes outcome: %s", res.Outcome)
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	ctx := r.Context()
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	agentID, err := guard.RequireAgentID(ctx, d.DB, c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	req, err := parse(payload)
	if err != nil {
		return nil, err
	}

	var res result
	found, err := d.DB.RPCRow(ctx, "agent_set_trip_notes", js.O(
		"p_trip_id", req.TripID,
		"p_agent_id", agentID,
		"p_notes", req.Notes,
		"p_expected_version", req.ExpectedVersion,
	), &res)
	if err != nil {
		return nil, fmt.Errorf("trip notes write failed: %w", err)
	}
	body, changed, err := outcome(req.TripID, found, res)
	if err != nil {
		return nil, err
	}
	if changed {
		if err := audit.Write(ctx, d.DB, c, audit.Spec{
			EventType:    "trip.notes_changed",
			TargetEntity: "trip",
			TargetID:     req.TripID,
			Metadata:     js.O("version", res.Version),
		}); err != nil {
			return nil, err
		}
	}
	return edge.OK(body)
}
