// Package agentlead ports supabase/functions/agent-lead: the advisor's side of leads
// (Screen Inventory §3.8). Add a lead by hand (3.8.5), mark contacted, close (3.8.4), reopen,
// convert to a client, delete as spam. Every write is audited; an outcome the SQL did not
// write (noop) is not.
//
// Zero rows from agent_lead_write is one answer, 404 "No such lead.": no such lead, not this
// advisor's, or (convert) no such client of theirs.
package agentlead

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/lead"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

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
	op, err := lead.RequireLeadOp(payload.Get("op"))
	if err != nil {
		return nil, err
	}

	if op == "create" {
		input, err := lead.ParseManualLead(payload)
		if err != nil {
			return nil, err
		}
		var res struct {
			Outcome  string  `json:"outcome"`
			LeadID   *string `json:"lead_id"`
			ClientID *string `json:"client_id"`
		}
		found, err := d.DB.RPCRow(ctx, "agent_lead_create", js.O(
			"p_agent_id", agentID,
			"p_first_name", input.FirstName,
			"p_last_name", input.LastName,
			"p_email", input.Email,
			"p_phone", input.Phone,
			"p_source", input.Source,
			"p_body", input.Message,
		), &res)
		if err != nil {
			return nil, fmt.Errorf("agent_lead_create failed: %w", err)
		}
		if !found {
			return nil, errors.New("agent_lead_create returned nothing")
		}
		if res.Outcome == "client_exists" {
			return edge.OK(js.O("outcome", "client_exists", "clientId", res.ClientID))
		}
		if res.Outcome != "created" && res.Outcome != "added" {
			return nil, fmt.Errorf("unhandled agent_lead_create outcome: %q", res.Outcome)
		}
		event := "lead.note_added"
		if res.Outcome == "created" {
			event = "lead.created"
		}
		leadID := ""
		if res.LeadID != nil {
			leadID = *res.LeadID
		}
		if err := audit.Write(ctx, d.DB, c, audit.Spec{
			EventType: event, TargetEntity: "lead", TargetID: leadID,
			Metadata: js.O("source", input.Source),
		}); err != nil {
			return nil, err
		}
		return edge.OK(js.O("outcome", res.Outcome, "leadId", res.LeadID))
	}

	leadID, ok := payload.Get("leadId").Str()
	if !ok || !uuid.IsUUID(leadID) {
		return nil, problem.BadRequest("That is not a lead id.")
	}

	var reason, note *string
	if op == "close" {
		cl, err := lead.ParseClose(payload)
		if err != nil {
			return nil, err
		}
		reason, note = &cl.Reason, cl.Note
	}

	var clientID *string
	if op == "convert" {
		id, ok := payload.Get("clientId").Str()
		if !ok || !uuid.IsUUID(id) {
			return nil, problem.BadRequest("That is not a client id.")
		}
		clientID = &id
	}

	var res struct {
		Outcome string  `json:"outcome"`
		Status  *string `json:"status"`
	}
	found, err := d.DB.RPCRow(ctx, "agent_lead_write", js.O(
		"p_agent_id", agentID,
		"p_lead_id", leadID,
		"p_op", op,
		"p_close_reason", reason,
		"p_close_note", note,
		"p_client_id", clientID,
	), &res)
	if err != nil {
		return nil, fmt.Errorf("agent_lead_write failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("No such lead.")
	}

	switch res.Outcome {
	case "noop":
		return edge.OK(js.O("leadId", leadID, "outcome", "noop", "status", res.Status))
	case "refused":
		return nil, problem.Conflict("That lead has moved on since this page loaded. Reload to see where it stands.")
	case "conflict":
		return nil, problem.Conflict("This email already has an open lead. Open that one instead.")
	case "changed", "deleted":
	default:
		return nil, fmt.Errorf("unhandled agent_lead_write outcome: %q", res.Outcome)
	}

	event := "lead.deleted_as_spam"
	if res.Outcome != "deleted" {
		switch op {
		case "mark_contacted":
			event = "lead.contacted"
		case "close":
			event = "lead.closed"
		case "reopen":
			event = "lead.reopened"
		default:
			event = "lead.converted"
		}
	}
	md := js.O()
	if reason != nil && *reason != "" {
		md = append(md, js.Field{Key: "reason", Value: *reason})
	}
	if clientID != nil && *clientID != "" {
		md = append(md, js.Field{Key: "client_id", Value: *clientID})
	}
	md = append(md, js.Field{Key: "status", Value: res.Status})
	if err := audit.Write(ctx, d.DB, c, audit.Spec{EventType: event, TargetEntity: "lead", TargetID: leadID, Metadata: md}); err != nil {
		return nil, err
	}

	var status any = res.Status
	if res.Outcome == "deleted" {
		status = nil
	}
	return edge.OK(js.O("leadId", leadID, "outcome", res.Outcome, "status", status))
}
