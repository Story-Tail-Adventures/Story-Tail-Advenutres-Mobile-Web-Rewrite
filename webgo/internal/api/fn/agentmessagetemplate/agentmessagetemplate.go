// Package agentmessagetemplate ports supabase/functions/agent-message-template: §3.10
// Stage 2, the advisor's message templates (Screens 3.10.4 Library and 3.10.5 Editor).
//
// ITS OWN DOOR: not more ops on agent-message, which sends to clients (a template reaches no
// one until an advisor inserts it and sends the result), and not agent-template, which is
// §3.4.13's TRIP templates.
//
// NO AUDIT ROWS (Gyasi, 2026-10-14): a template holds no client data, so it is outside Rule
// 3's sensitive tables, and the message it becomes is recorded when it is sent. The writes
// still go through here rather than an RPC grant, because each SQL write takes the agent id
// as trusted input.
//
// IDS: create and duplicate take an id the browser minted (Data-Model §21.6), so a double
// click or a retry answers `exists` and writes once. `conflict` means the id is someone
// else's, which only a forged request reaches; it says no more than "not yours".
package agentmessagetemplate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/messagetemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
}

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
	return handle(r.Context(), d.DB, agentID, payload, d.Now())
}

const notInLibrary = "That template is not in your library."

func requireID(v js.Value) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a template id.")
	}
	return s, nil
}

// requireNewID is an id the browser minted for a new row: a recent v7.
func requireNewID(v js.Value, now time.Time) (string, error) {
	s, ok := v.Str()
	if !ok {
		return "", problem.BadRequest("Send the new template with its id.")
	}
	if uuid.CheckRecent(s, now) != nil {
		return "", problem.BadRequest("That form is out of date. Reload the page and try again.")
	}
	return s, nil
}

// outcomeOf is `row && typeof row === "object" && "outcome" in row ? String(row.outcome) :
// null`; ok is false for the null.
func outcomeOf(ctx context.Context, db backend, fn string, args js.Ordered) (string, bool, error) {
	var row struct {
		// Raw, so a missing key (nil) reads apart from a JSON null ("null").
		Outcome json.RawMessage `json:"outcome"`
	}
	found, err := db.RPCRow(ctx, fn, args, &row)
	if err != nil || !found || row.Outcome == nil {
		return "", false, err
	}
	raw := row.Outcome
	var s string
	if raw[0] == '"' && json.Unmarshal(raw, &s) == nil {
		return s, true, nil
	}
	// String(x) of a non-string outcome; the SQL only ever returns text, so this is the
	// literal JSON (null, a number) as String() would spell the common cases.
	return string(raw), true, nil
}

func handle(ctx context.Context, db backend, agentID string, payload js.Value, now time.Time) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	switch op {
	case "create", "update":
		var templateID string
		var err error
		if op == "create" {
			templateID, err = requireNewID(payload.Get("templateId"), now)
		} else {
			templateID, err = requireID(payload.Get("templateId"))
		}
		if err != nil {
			return nil, err
		}
		category, err := messagetemplate.ReadCategory(payload.Get("category"))
		if err != nil {
			return nil, err
		}
		name, err := messagetemplate.ReadTemplateName(payload.Get("name"))
		if err != nil {
			return nil, err
		}
		body, err := messagetemplate.ReadTemplateBody(payload.Get("body"))
		if err != nil {
			return nil, err
		}
		tags, err := messagetemplate.ReadTags(payload.Get("tags"))
		if err != nil {
			return nil, err
		}
		fn := "agent_create_message_template"
		if op == "update" {
			fn = "agent_update_message_template"
		}
		outcome, ok, err := outcomeOf(ctx, db, fn, js.O("p_template_id", templateID, "p_agent_id", agentID,
			"p_category", category, "p_name", name, "p_body", body, "p_tags", tags))
		if err != nil {
			return nil, fmt.Errorf("template %s failed: %w", op, err)
		}
		if !ok || outcome == "not_found" || outcome == "conflict" {
			return nil, problem.NotFound(notInLibrary)
		}
		return edge.OK(js.O("outcome", outcome, "templateId", templateID))

	case "duplicate":
		sourceID, err := requireID(payload.Get("templateId"))
		if err != nil {
			return nil, err
		}
		newID, err := requireNewID(payload.Get("newTemplateId"), now)
		if err != nil {
			return nil, err
		}
		outcome, ok, err := outcomeOf(ctx, db, "agent_duplicate_message_template",
			js.O("p_source_id", sourceID, "p_new_id", newID, "p_agent_id", agentID))
		if err != nil {
			return nil, fmt.Errorf("template duplicate failed: %w", err)
		}
		if !ok || outcome == "not_found" || outcome == "conflict" {
			return nil, problem.NotFound(notInLibrary)
		}
		return edge.OK(js.O("outcome", outcome, "templateId", newID))

	case "archive":
		templateID, err := requireID(payload.Get("templateId"))
		if err != nil {
			return nil, err
		}
		archived, isBool := payload.Get("archived").Bool()
		if !isBool {
			return nil, problem.BadRequest("archived must be true or false.")
		}
		outcome, ok, err := outcomeOf(ctx, db, "agent_set_message_template_archived",
			js.O("p_template_id", templateID, "p_agent_id", agentID, "p_archived", archived))
		if err != nil {
			return nil, fmt.Errorf("template archive failed: %w", err)
		}
		if !ok || outcome == "not_found" {
			return nil, problem.NotFound(notInLibrary)
		}
		return edge.OK(js.O("outcome", outcome))
	}
	return nil, problem.BadRequest("Send an op of create, update, duplicate, archive.")
}
