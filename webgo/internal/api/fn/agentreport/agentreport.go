// Package agentreport ports supabase/functions/agent-report: §3.11 Reporting's export door
// (P1). `export`: each report's Export button downloads that report's own table as CSV, for
// the period on screen. `center`: the Export Center's four types over a From/To range
// (§3.11.8). Both ruled 2026-10-21.
//
// THE AUDIT ROW IS NOT WRITTEN HERE. agent_report_export (and agent_export_center, and the
// ledger's agent_export_commission) writes it in the same SQL call that returns the rows, so
// no file leaves without its record (Data-Model §18.3). This route supplies the row's v7 id,
// the actor, and the caller's ip and user agent, and shapes the CSV.
//
// Reads for the SCREEN do not come through here: they are the agent_report_* definer
// functions, called with the advisor's own token. Only the audited download needs the service
// role, because only it writes.
//
// The CSV travels inside the JSON reply as a string, so "byte for byte" is that string: CRLF
// line ends, a trailing CRLF, no BOM, exactly as _shared/report.ts and commission.ts wrote
// it. Money in the rows is a digit-string and never becomes a number.
package agentreport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/commission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/report"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// db is what the route needs from the service client, so its tests can fake it.
type db interface {
	RPC(ctx context.Context, fn string, args any, out any) error
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
	return run(ctx, d.DB, c, agentID, payload, uuid.New(), d.Now())
}

// run is everything after the caller checks. now is the clock, read only when the SQL sends
// no `today` for a report that is dated by the day it ran.
func run(ctx context.Context, d db, c *caller.Context, agentID string, payload js.Value, auditID string, now time.Time) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	if !isString(payload.Get("op"), "export") && !isString(payload.Get("op"), "center") {
		return nil, problem.BadRequest("op must be: export, center.")
	}

	// What every audited file needs. A fresh v7 per request.
	audit := js.O(
		"p_actor_user_id", c.PlatformUserID,
		"p_audit_id", auditID,
		"p_ip", c.IP,
		"p_user_agent", c.UserAgent,
	)
	if op == "center" {
		return center(ctx, d, agentID, payload, audit)
	}
	return export(ctx, d, agentID, payload, audit, now)
}

// ── §3.11.8 Export Center ──────────────────────────────────────────────────

func center(ctx context.Context, d db, agentID string, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	typ, err := report.ReadExportType(payload.Get("type"))
	if err != nil {
		return nil, err
	}
	rng, err := report.ReadExportRange(typ, payload.Get("from"), payload.Get("to"))
	if err != nil {
		return nil, err
	}
	withContact, err := report.ReadIncludeContact(typ, payload.Get("includeContact"))
	if err != nil {
		return nil, err
	}

	// The ledger is §3.7.2's own export, unfiltered but for travel dates. It writes its own
	// commission.exported row, which the Export Center's history reads too.
	if typ == "ledger" {
		args := js.O(
			"p_agent_id", agentID,
			"p_status", nil,
			"p_supplier_id", nil,
			"p_trip_id", nil,
			"p_travel_from", rng.From,
			"p_travel_to", rng.To,
		).Spread(audit)
		rows, err := ledgerRows(ctx, d, args)
		if err != nil {
			return nil, err
		}
		csv, err := commission.ToCSV(rows)
		if err != nil {
			return nil, err
		}
		name, err := report.CenterFileName(typ, rng, rng.To, false)
		if err != nil {
			return nil, err
		}
		return edge.OK(js.O("outcome", "exported", "rowCount", len(rows), "csv", csv, "fileName", name))
	}

	var from, to *string
	if rng != nil {
		from, to = &rng.From, &rng.To
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_type", typ,
		"p_from", from,
		"p_to", to,
		"p_include_contact", withContact,
	).Spread(audit)
	out, err := call(ctx, d, "agent_export_center", args, "export center failed")
	if err != nil {
		return nil, err
	}
	rows, ok := out.Get("rows").Array()
	today, isText := out.Get("today").Str()
	if !out.Truthy() || !ok || !isText {
		return nil, errors.New("export center did not return rows")
	}
	csv, err := report.CenterCSV(typ, rows, withContact)
	if err != nil {
		return nil, err
	}
	name, err := report.CenterFileName(typ, rng, today, withContact)
	if err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "exported", "rowCount", len(rows), "csv", csv, "fileName", name))
}

// ── each report's own Export ───────────────────────────────────────────────

func export(ctx context.Context, d db, agentID string, payload js.Value, audit js.Ordered, now time.Time) (*edge.Reply, error) {
	rep, err := report.ReadReport(payload.Get("report"))
	if err != nil {
		return nil, err
	}
	period, err := report.ReadReportPeriod(rep, payload.Get("period"))
	if err != nil {
		return nil, err
	}
	basis, err := report.ReadBasis(rep, payload.Get("basis"))
	if err != nil {
		return nil, err
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_report", rep,
		"p_period", period,
		"p_basis", basis,
	).Spread(audit)
	// NULL: the advisor is archived (requireAgentId should have caught it first).
	out, err := call(ctx, d, "agent_report_export", args, "report export failed")
	if err != nil {
		return nil, err
	}
	rows, ok := out.Get("rows").Array()
	if !out.Truthy() || !ok {
		return nil, errors.New("export did not return rows")
	}
	csv, err := report.ReportCSV(rep, basis, rows)
	if err != nil {
		return nil, err
	}
	// The advisor's own date names a file with no period. Deno's default parameter, the
	// server's UTC day, applied only when the SQL sent no today at all (`out.today ??
	// undefined`).
	today := js.ISOString(now)[:10]
	if t := out.Get("today"); !t.IsNullish() {
		today = jsText(t)
	}
	name, err := report.ReportFileName(rep, basis, textOrNil(out.Get("from")), textOrNil(out.Get("to")), today)
	if err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "exported", "rowCount", len(rows), "csv", csv, "fileName", name))
}

// call runs one export RPC that answers a jsonb object. A null reply is the 404 "That advisor
// cannot export."; the reply is read with JavaScript's semantics because the CSV writers
// take untyped rows.
func call(ctx context.Context, d db, fn string, args js.Ordered, label string) (js.Value, error) {
	var raw json.RawMessage
	if err := d.RPC(ctx, fn, args, &raw); err != nil {
		return js.Value{}, fmt.Errorf("%s: %w", label, err)
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return js.Value{}, problem.NotFound("That advisor cannot export.")
	}
	v, err := js.Parse(trimmed)
	if err != nil {
		return js.Value{}, fmt.Errorf("%s: unreadable reply", label)
	}
	return v, nil
}

// ledgerRows reads agent_export_commission's one jsonb array (not a row set, which PostgREST
// caps at max_rows).
func ledgerRows(ctx context.Context, d db, args js.Ordered) ([]commission.ExportRow, error) {
	var raw json.RawMessage
	if err := d.RPC(ctx, "agent_export_commission", args, &raw); err != nil {
		return nil, fmt.Errorf("ledger export failed: %w", err)
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil, problem.NotFound("That advisor cannot export.")
	}
	if trimmed[0] != '[' {
		return nil, errors.New("ledger export did not return an array")
	}
	var rows []commission.ExportRow
	if err := json.Unmarshal(trimmed, &rows); err != nil {
		return nil, fmt.Errorf("ledger export rows unreadable: %w", err)
	}
	return rows, nil
}

func isString(v js.Value, want string) bool {
	s, ok := v.Str()
	return ok && s == want
}

// textOrNil is a `string | null` field: a string, or nil for anything else (the filename
// checks refuse a non-string the way the Deno regex test did).
func textOrNil(v js.Value) *string {
	if s, ok := v.Str(); ok {
		return &s
	}
	return nil
}

// jsText is the value a non-null `today` contributes to the filename check: its text, or ""
// (which fails the date test) for anything that is not text. SQL only ever sends a date.
func jsText(v js.Value) string {
	s, _ := v.Str()
	return s
}
