// Package agentread is the agent read model's one door: a port of callAgentRead in
// web/lib/agent/api.ts. Every agent screen reads through it, and the three agent sub-areas
// (people, trips, money) share it, so it lives here once.
//
// Each read is a named Postgres function (SECURITY DEFINER, Data-Model §3.2's agent read
// surface) called as the visitor, with their own access token, so the database decides
// what an agent may see. The name must be one of Names: a read is never built from request
// input. Results decode into the caller's typed struct, never any, so cents stay int64.
package agentread

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Names is the AgentRead union in web/lib/agent/api.ts, all 67. names_test.go diffs it
// against that file, so a read added there cannot be forgotten here.
var Names = []string{
	"agent_kpis", "agent_trip_roster", "agent_trip_roster_summary", "agent_templates", "agent_template",
	"agent_trip_board", "agent_payments_due", "agent_inbox", "agent_availability_self",
	"agent_trip_overview", "agent_trip_components", "agent_suppliers", "agent_trip_itinerary_meta",
	"agent_trip_itinerary_days", "agent_trip_payments", "agent_trip_payment_history",
	"agent_trip_documents", "agent_trip_messages", "agent_trip_activity",
	"agent_client_roster", "agent_client_roster_summary", "agent_client_overview",
	"agent_client_companions", "agent_client_trips", "agent_client_conversations",
	"agent_client_documents", "agent_client_notes", "agent_client_activity",
	"agent_commission_ledger", "agent_commission_ledger_summary", "agent_commission_ledger_suppliers",
	"agent_commission_dashboard", "agent_commission_monthly", "agent_commission_line",
	"agent_commission_imports", "agent_commission_import", "agent_commission_import_rows",
	"agent_commission_import_candidates", "agent_commission_forecast", "agent_commission_cash_in",
	"agent_trip_open_commission",
	"agent_message_threads", "agent_message_summary", "agent_conversation",
	"agent_conversation_messages", "agent_message_target", "agent_message_templates",
	"agent_message_template", "agent_message_merge_context",
	"agent_client_account_admin", "agent_client_merge_view", "agent_settings_self",
	"agent_report_period", "agent_report_revenue_by_month", "agent_report_commission_by_supplier",
	"agent_report_top_destinations", "agent_report_client_lifetime_value",
	"agent_report_conversion_funnel", "agent_report_pipeline_stages", "agent_report_pipeline_months",
	"agent_export_history",
	"agent_leads", "agent_lead", "agent_lead_messages", "agent_client_lead_origin",
	"agent_report_lead_sources", "agent_report_lead_campaigns",
}

var (
	// ErrUnauthenticated: there is no signed-in visitor. Send them to sign in.
	ErrUnauthenticated = errors.New("agentread: not signed in")
	// ErrUnavailable: the read failed (a privilege, a plan, the network). Say "try again".
	ErrUnavailable = errors.New("agentread: read unavailable")
)

// Call runs one named read as the signed-in visitor and returns its rows. T is the row's
// struct. Like callAgentRead, a failure is logged by name and PostgREST code only, never the
// message (it can carry the statement) or the arguments.
func Call[T any](ctx context.Context, sb *supa.Client, st session.State, name string, args any, log *slog.Logger) ([]T, error) {
	if !slices.Contains(Names, name) {
		// A programming error, never request input: refuse rather than call it.
		return nil, fmt.Errorf("agentread: %q is not a known read", name)
	}
	if !st.SignedIn || st.AccessToken == "" {
		return nil, ErrUnauthenticated
	}
	rows, err := supa.RPC[[]T](ctx, sb, st.AccessToken, name, args)
	if err != nil {
		code := ""
		var se *supa.Error
		if errors.As(err, &se) {
			code = se.Code
		}
		log.Warn("agent read failed", "read", name, "code", code)
		return nil, fmt.Errorf("%w: %s", ErrUnavailable, name)
	}
	return rows, nil
}
