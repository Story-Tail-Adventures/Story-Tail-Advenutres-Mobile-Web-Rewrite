// Package leadmessage ports supabase/functions/lead-message: "Message Gyasi" without an
// account, the public form (Screen Inventory 2.0.12). P2. Rulings: docs/BRD.md §6.5
// (2026-10-21), Data-Model §11.
//
// NO SIGN-IN (GateOpen, verify_jwt was off): the whole point is a visitor who will not make an
// account. Whoever asks for a quote is a client; whoever only messages Gyasi is a lead, and
// this is where a lead is made.
//
// A send goes through, in order: the two checks that store nothing (a filled hidden field, or a
// send under three seconds after the form was drawn; answered like a success); the fields (a
// 400 a person can read; a card number is REFUSED, not masked: CLAUDE.md rule 1); then
// lead_submit (five sends an hour per network address, 429), which makes a new lead, joins an
// open one, or notes "already a client".
//
// THE ANSWER NEVER SAYS WHICH OF THOSE HAPPENED: created, added and already_client all return
// { ok: true }, so the form cannot be used to learn whether an address belongs to a client. No
// email goes to the visitor. Not audited: there is no actor, and the lead row is its own record.
// Nothing is logged but the outcome.
package leadmessage

import (
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/lead"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	automated, err := lead.LooksAutomated(payload, d.Now().UnixMilli())
	if err != nil {
		return nil, err
	}
	if automated {
		d.Log.Info("lead-message dropped as automated")
		return edge.OK(js.O("ok", true))
	}
	input, err := lead.ParseLeadForm(payload)
	if err != nil {
		return nil, err
	}
	// The registry replaced every address header before this ran: X-Forwarded-For holds the
	// one validated visitor address (an IP or nothing; edge.VisitorAddress), Cf-Connecting-Ip
	// is gone, and nothing x-sta-* from the caller survives. So the forwarded-key branch that
	// let the Next.js server vouch for an address has nothing to add in Go: with no key,
	// clientAddress takes X-Forwarded-For, the same address Deno was handed.
	ip := lead.ClientAddress(r.Header, "")

	var row struct {
		Outcome *string `json:"outcome"`
	}
	// Every optional field goes to Postgres as NULL when the visitor left it empty.
	_, err = d.DB.RPCRow(r.Context(), "lead_submit", js.O(
		"p_ip", ip,
		"p_first_name", input.FirstName,
		"p_last_name", input.LastName,
		"p_email", input.Email,
		"p_phone", input.Phone,
		"p_body", input.Message,
		"p_page", input.Page,
		"p_about_kind", input.AboutKind,
		"p_about_slug", input.AboutSlug,
		"p_about_label", input.AboutLabel,
		"p_utm_source", input.UTMSource,
		"p_utm_medium", input.UTMMedium,
		"p_utm_campaign", input.UTMCampaign,
	), &row)
	if err != nil {
		return nil, fmt.Errorf("lead_submit failed: %w", err)
	}
	outcome := ""
	if row.Outcome != nil {
		outcome = *row.Outcome
	}
	d.Log.Info("lead-message", "outcome", outcome)

	switch outcome {
	case "throttled":
		return nil, problem.New(http.StatusTooManyRequests, "Too Many Requests", "Please try again a little later.")
	case "no_advisor":
		// Several active advisors (P3 routing) or none. Ours to fix, not the visitor's.
		return nil, problem.New(http.StatusServiceUnavailable, "Service Unavailable", "Messages can't be sent just now. Please try again later.")
	case "created", "added", "already_client":
		return edge.OK(js.O("ok", true))
	default:
		return nil, fmt.Errorf("unhandled lead_submit outcome: %q", outcome)
	}
}
