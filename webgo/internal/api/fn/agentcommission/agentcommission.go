// Package agentcommission ports supabase/functions/agent-commission: the commission ledger's
// write door. Screens 3.7.3 (edit, mark received, remove), 3.7.4 (add), §3.7.2's export and
// 3.7.7's stage weights (`weights`).
//
// THE AUDIT ROW IS NOT WRITTEN HERE. Each SQL function writes its own audit_event in the same
// transaction as the change (commission_audit(), migration 20261011120000), so a failed audit
// insert can never leave a landed change with no record. This route supplies the row's v7
// id, the actor's platform_user id, and the caller's ip and user agent; nothing about WHAT is
// audited is up to it.
//
// ONLY `stale` IS A 409. Every outcome a form shows against a field comes back 200 with an
// `outcome` (duplicate_reference, supplier_not_found, bad_date, not_removable): a rejection's
// body surfaces only `detail`, which a form cannot attach to a field.
//
// Money stays int64 cents on the way in and a digit-string (gapCents, the export's cells) on
// the way out; no amount passes through a float.
package agentcommission

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/commission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// ops are the operations, in the order the 400 lists them.
var ops = []string{"create", "update", "payment", "remove", "export", "weights"}

func requireOp(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(ops, s) {
		return "", problem.BadRequest("op must be one of: " + strings.Join(ops, ", ") + ".")
	}
	return s, nil
}

// The outcomes each write is known to return, besides stale / not_found (a 409 / 404 before
// this). Anything else is a schema change this route has not caught up with, and is a 500
// rather than a 200 the form would read as success.
var (
	updateOutcomes  = []string{"changed", "noop", "supplier_not_found", "duplicate_reference", "payment_would_clear"}
	paymentOutcomes = []string{"recorded", "noop", "bad_date"}
)

// The sentences the 409s and 404s carry.
const (
	staleLine    = "This line changed since you opened it. Reload and try again."
	noSuchLine   = "No such commission line."
	staleWeights = "These weights were changed somewhere else, so yours weren't saved. Reload the page and try again."
)

// db is what the route needs from the service client, so its tests can fake it.
type db interface {
	RPC(ctx context.Context, fn string, args any, out any) error
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
}

// auditArgs are what every SQL write needs for its own audit row. A fresh v7 per request.
func auditArgs(c *caller.Context, auditID string) js.Ordered {
	return js.O(
		"p_actor_user_id", c.PlatformUserID,
		"p_audit_id", auditID,
		"p_ip", c.IP,
		"p_user_agent", c.UserAgent,
	)
}

// readLine reads the fields the add and edit forms share, in the order the Deno object
// literal evaluated them. Expected is NOT among them: SQL computes it.
func readLine(payload js.Value) (js.Ordered, error) {
	supplierID, err := commission.ReadID(payload.Get("supplierId"), "supplier")
	if err != nil {
		return nil, err
	}
	gross, err := commission.RequireCents(payload.Get("grossCents"), "Gross")
	if err != nil {
		return nil, err
	}
	pct, err := commission.ReadRate(payload.Get("commissionPct"))
	if err != nil {
		return nil, err
	}
	terms, err := commission.ReadTerms(payload.Get("paymentTerms"))
	if err != nil {
		return nil, err
	}
	lag, err := commission.ReadLagDays(payload.Get("paymentLagDays"))
	if err != nil {
		return nil, err
	}
	ref, err := commission.ReadReference(payload.Get("inteletravelReference"))
	if err != nil {
		return nil, err
	}
	notes, err := commission.ReadNotes(payload.Get("notes"))
	if err != nil {
		return nil, err
	}
	return js.O(
		"p_supplier_id", supplierID,
		"p_gross_cents", gross,
		"p_commission_pct", pct,
		"p_payment_terms", terms,
		"p_payment_lag_days", lag,
		"p_inteletravel_reference", ref,
		"p_notes", notes,
	), nil
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
	return run(ctx, d.DB, c, agentID, payload, uuid.New)
}

// run is everything after the caller checks. newID mints the v7 ids (the audit row's, and a
// new line's).
func run(ctx context.Context, d db, c *caller.Context, agentID string, payload js.Value, newID func() string) (*edge.Reply, error) {
	op, err := requireOp(payload.Get("op"))
	if err != nil {
		return nil, err
	}
	audit := auditArgs(c, newID())

	switch op {
	case "create":
		return create(ctx, d, agentID, payload, audit, newID)
	case "export":
		return export(ctx, d, agentID, payload, audit)
	case "weights":
		return weights(ctx, d, agentID, payload, audit)
	}

	// Everything below names one existing line at the version the screen rendered.
	commissionID, err := commission.ReadID(payload.Get("commissionId"), "commission line")
	if err != nil {
		return nil, err
	}
	expectedVersion, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return nil, err
	}
	switch op {
	case "update":
		return update(ctx, d, agentID, commissionID, expectedVersion, payload, audit)
	case "payment":
		return payment(ctx, d, agentID, commissionID, expectedVersion, payload, audit)
	case "remove":
		// Explicit, not the fall-through: a future op without a branch must not land here
		// and remove a line.
		return remove(ctx, d, agentID, commissionID, expectedVersion, audit)
	}
	return nil, errors.New("unhandled op: " + op)
}

// writeResult is one row of a write RPC. version is null on some outcomes.
type writeResult struct {
	Outcome  string  `json:"outcome"`
	Version  *int64  `json:"version"`
	GapCents *string `json:"gap_cents"`
}

// ── 3.7.4 Add ──────────────────────────────────────────────────────────────

func create(ctx context.Context, d db, agentID string, payload js.Value, audit js.Ordered, newID func() string) (*edge.Reply, error) {
	// v7, minted here (Data-Model §21.6), so the redirect target is known before the write.
	commissionID := newID()
	tripID, err := commission.ReadID(payload.Get("tripId"), "trip")
	if err != nil {
		return nil, err
	}
	status := payload.Get("status")
	if status.IsNullish() {
		status = js.StringValue("expected") // payload.status ?? "expected"
	}
	st, err := commission.ReadStatus(status, commission.CreateStatuses, "Status")
	if err != nil {
		return nil, err
	}
	line, err := readLine(payload)
	if err != nil {
		return nil, err
	}
	args := js.O("p_agent_id", agentID, "p_commission_id", commissionID, "p_trip_id", tripID, "p_status", st).
		Spread(line).Spread(audit)

	var res writeResult
	found, err := d.RPCRow(ctx, "agent_create_commission", args, &res)
	if err != nil {
		return nil, fmt.Errorf("commission create failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("That advisor cannot add commission lines.")
	}
	switch res.Outcome {
	case "trip_not_found":
		return nil, problem.NotFound("No such trip on your book.")
	case "duplicate_reference", "supplier_not_found":
		return edge.OK(js.O("outcome", res.Outcome))
	case "created":
		return edge.OK(js.O("outcome", "created", "commissionId", commissionID, "version", res.Version))
	}
	return nil, errors.New("unknown create outcome: " + res.Outcome)
}

// ── §3.7.2 Export ──────────────────────────────────────────────────────────

func export(ctx context.Context, d db, agentID string, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	f, err := commission.ReadLedgerFilters(payload.Get("filters"))
	if err != nil {
		return nil, err
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_status", f.Status,
		"p_supplier_id", f.SupplierID,
		"p_trip_id", f.TripID,
		"p_travel_from", f.TravelFrom,
		"p_travel_to", f.TravelTo,
	).Spread(audit)
	rows, err := exportRows(ctx, d, args)
	if err != nil {
		return nil, err
	}
	csv, err := commission.ToCSV(rows)
	if err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "exported", "rowCount", len(rows), "csv", csv))
}

// exportRows calls agent_export_commission with args and reads its rows. It answers ONE jsonb
// array, not a row set: PostgREST caps row sets at max_rows (1000), and a capped export
// arrived short while its audit row said otherwise. A null reply (the advisor is archived) is
// the 404 "That advisor cannot export."; anything but an array is a 500.
func exportRows(ctx context.Context, d db, args js.Ordered) ([]commission.ExportRow, error) {
	var raw json.RawMessage
	if err := d.RPC(ctx, "agent_export_commission", args, &raw); err != nil {
		return nil, fmt.Errorf("commission export failed: %w", err)
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil, problem.NotFound("That advisor cannot export.")
	}
	if trimmed[0] != '[' {
		return nil, errors.New("export did not return an array")
	}
	var rows []commission.ExportRow
	if err := json.Unmarshal(trimmed, &rows); err != nil {
		return nil, fmt.Errorf("export rows unreadable: %w", err)
	}
	return rows, nil
}

// ── 3.7.7 Adjust weighting ─────────────────────────────────────────────────

// weights saves the four open stages' weights. `expected` is the weights the screen showed:
// if the stored ones differ, someone changed them since, and the save is a 409 rather than a
// silent overwrite.
func weights(ctx context.Context, d db, agentID string, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	expected, err := commission.ReadWeights(payload.Get("expected"), "Expected weights")
	if err != nil {
		return nil, err
	}
	w, err := commission.ReadWeights(payload.Get("weights"), "Weights")
	if err != nil {
		return nil, err
	}
	args := js.O("p_agent_id", agentID, "p_expected", expected, "p_weights", w).Spread(audit)

	var res writeResult
	found, err := d.RPCRow(ctx, "agent_set_pipeline_weights", args, &res)
	if err != nil {
		return nil, fmt.Errorf("pipeline weights failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("Your forecast weights couldn't be found.")
	}
	if res.Outcome == "stale" {
		// The web's own sentence (FORECAST_COPY.stale), so any client reads the same words.
		return nil, problem.Conflict(staleWeights)
	}
	if res.Outcome != "saved" && res.Outcome != "noop" {
		return nil, errors.New("unknown weights outcome: " + res.Outcome)
	}
	return edge.OK(js.O("outcome", res.Outcome))
}

// ── 3.7.3 Edit ─────────────────────────────────────────────────────────────

func update(ctx context.Context, d db, agentID, commissionID string, expectedVersion int64, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	st, err := commission.ReadStatus(payload.Get("status"), commission.CommissionStatuses, "Status")
	if err != nil {
		return nil, err
	}
	// An explicit yes, never a default: moving a paid line back wipes its payment.
	clear := payload.Get("clearPayment").IsTrue()
	line, err := readLine(payload)
	if err != nil {
		return nil, err
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_commission_id", commissionID,
		"p_expected_version", expectedVersion,
		"p_status", st,
		"p_clear_payment", clear,
	).Spread(line).Spread(audit)

	var res writeResult
	found, err := d.RPCRow(ctx, "agent_update_commission", args, &res)
	if err != nil {
		return nil, fmt.Errorf("commission update failed: %w", err)
	}
	if !found || res.Outcome == "not_found" {
		return nil, problem.NotFound(noSuchLine)
	}
	switch res.Outcome {
	case "stale":
		return nil, problem.Conflict(staleLine)
	case "needs_payment":
		// The form never offers this; a hand-built request gets the reason.
		return nil, problem.BadRequest("Use Mark received to record money against a line.")
	}
	if !slices.Contains(updateOutcomes, res.Outcome) {
		return nil, errors.New("unknown update outcome: " + res.Outcome)
	}
	return edge.OK(js.O("outcome", res.Outcome, "commissionId", commissionID, "version", res.Version))
}

// ── 3.7.3 Mark received ────────────────────────────────────────────────────

func payment(ctx context.Context, d db, agentID, commissionID string, expectedVersion int64, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	st, err := commission.ReadStatus(payload.Get("status"), commission.PaymentStatuses, "Status")
	if err != nil {
		return nil, err
	}
	received, err := commission.RequireCents(payload.Get("receivedCents"), "Amount received")
	if err != nil {
		return nil, err
	}
	if st == "received" && received == 0 {
		return nil, problem.BadRequest("A line marked received needs the amount that arrived. Nothing arrived? Record it as disputed.")
	}
	fee, err := commission.ReadCents(payload.Get("feeCents"), "Processing fee")
	if err != nil {
		return nil, err
	}
	receivedAt, err := commission.ReadDate(payload.Get("receivedAt"), "Received on")
	if err != nil {
		return nil, err
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_commission_id", commissionID,
		"p_expected_version", expectedVersion,
		"p_status", st,
		"p_received_cents", received,
		"p_fee_cents", fee,
		"p_received_at", receivedAt,
	).Spread(audit)

	var res writeResult
	found, err := d.RPCRow(ctx, "agent_record_commission_payment", args, &res)
	if err != nil {
		return nil, fmt.Errorf("commission payment failed: %w", err)
	}
	if !found || res.Outcome == "not_found" {
		return nil, problem.NotFound(noSuchLine)
	}
	if res.Outcome == "stale" {
		return nil, problem.Conflict(staleLine)
	}
	if !slices.Contains(paymentOutcomes, res.Outcome) {
		return nil, errors.New("unknown payment outcome: " + res.Outcome)
	}
	// gap_cents is text in SQL (expected - fee - received), so it stays a digit-string.
	return edge.OK(js.O("outcome", res.Outcome, "commissionId", commissionID, "version", res.Version,
		"gapCents", res.GapCents))
}

// ── 3.7.3 Remove ───────────────────────────────────────────────────────────

func remove(ctx context.Context, d db, agentID, commissionID string, expectedVersion int64, audit js.Ordered) (*edge.Reply, error) {
	args := js.O(
		"p_agent_id", agentID,
		"p_commission_id", commissionID,
		"p_expected_version", expectedVersion,
	).Spread(audit)

	var res writeResult
	found, err := d.RPCRow(ctx, "agent_remove_commission", args, &res)
	if err != nil {
		return nil, fmt.Errorf("commission remove failed: %w", err)
	}
	if !found || res.Outcome == "not_found" {
		return nil, problem.NotFound(noSuchLine)
	}
	if res.Outcome == "stale" {
		return nil, problem.Conflict(staleLine)
	}
	if res.Outcome != "removed" && res.Outcome != "not_removable" {
		return nil, errors.New("unknown remove outcome: " + res.Outcome)
	}
	return edge.OK(js.O("outcome", res.Outcome, "commissionId", commissionID, "version", res.Version))
}
