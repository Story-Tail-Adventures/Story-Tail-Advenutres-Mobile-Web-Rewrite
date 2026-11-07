// Package agenttripstatus ports supabase/functions/agent-trip-status: move a trip between
// pipeline stages (Screen 3.2.2), one at a time or in bulk (§3.4.1).
//
// THE MUTATION IS IN SQL. A stage change is a trip update plus a trip_status_history row,
// both or neither; losing the history row is unrecoverable (Data-Model §8.8).
// agent_set_trip_status does the pair under FOR UPDATE. This function does auth, validation
// and the audit row, which stays here because it carries the request's address and user
// agent.
//
// Refuses, explicitly (the service role checks nothing): not an agent (403); an archived
// advisor (403); a trip that is not this agent's or does not exist (404, one answer); a
// status outside trip_status; an expectedVersion no board could have rendered (400); a stale
// one (409); cancelled with no reason (the traveler's §2.2.10 screen renders it).
//
// Asking for the stage the trip is already in is a 200 changed:false that writes nothing,
// except cancelled to cancelled with a DIFFERENT reason or refund detail: a real correction
// (this endpoint is the only writer of trip.cancellation_reason), audited under its own event
// type with changed still false. Every cancelled call answers cancellationReasonUpdated.
//
// It creates no commission and touches no milestones. THE ONE COMMISSION WRITE IT MAKES IS
// ASKED FOR (§3.7 Stage 5): a cancellation may name open ledger lines to mark Lost, each at
// the version the dialog showed; that goes through agent_cancel_trip, which closes the ones
// still Expected or Invoiced and audits each in the same transaction. Nothing named takes
// the plain agent_set_trip_status path.
package agenttripstatus

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/commission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// statuses are the five board stages plus cancelled: the whole trip_status enum.
var statuses = []string{"inquiry", "proposal", "booked", "in_progress", "completed", "cancelled"}

func isStatus(v js.Value) bool {
	s, ok := v.Str()
	if !ok {
		return false
	}
	for _, x := range statuses {
		if x == s {
			return true
		}
	}
	return false
}

// maxBulk is what the SQL refuses too; checked here so it comes back in English, not a 500.
const maxBulk = 100

var (
	statusDetail = "Send a status of " + strings.Join(statuses, ", ") + "."
	refundDetail = "refundStatus must be one of " + strings.Join(trip.RefundStatuses, ", ") + "."
)

const (
	cancelOneAtATime = "Cancelling a trip is one at a time \U00002014 it needs a reason and the impact review."
	needsReason      = "A cancelled trip needs a reason \U00002014 the traveler's screen shows it."
)

// bulkRequest is the validated bulk body.
type bulkRequest struct {
	IDs   []string
	Froms []string
	To    string
}

// parseBulk checks a bulk body in the Deno order.
func parseBulk(payload js.Value) (bulkRequest, error) {
	trips, ok := payload.Get("trips").Array()
	if !ok {
		return bulkRequest{}, problem.BadRequest("trips must be a list.")
	}
	if len(trips) == 0 {
		return bulkRequest{}, problem.BadRequest("Pick at least one trip.")
	}
	if len(trips) > maxBulk {
		return bulkRequest{}, problem.BadRequest("That is too many trips.")
	}
	to := payload.Get("status")
	if !isStatus(to) {
		return bulkRequest{}, problem.BadRequest(statusDetail)
	}
	toStatus, _ := to.Str()
	// §3.4.16 owns cancelling: an impact list and a mandatory reason survive no checkbox column.
	if toStatus == "cancelled" {
		return bulkRequest{}, problem.BadRequest(cancelOneAtATime)
	}
	req := bulkRequest{To: toStatus, IDs: []string{}, Froms: []string{}}
	for _, entry := range trips {
		id, ok := entry.Get("tripId").Str()
		if !ok || !uuid.IsUUID(id) {
			return bulkRequest{}, problem.BadRequest("That is not a trip id.")
		}
		from := entry.Get("fromStatus")
		if !isStatus(from) {
			return bulkRequest{}, problem.BadRequest("Each trip needs the status it was showing.")
		}
		f, _ := from.Str()
		req.IDs = append(req.IDs, id)
		req.Froms = append(req.Froms, f)
	}
	return req, nil
}

// movedRow is one row of agent_bulk_set_trip_status: a trip that actually moved.
type movedRow struct {
	TripID     string `json:"trip_id"`
	FromStatus string `json:"from_status"`
	Version    int64  `json:"version"`
}

// bulk moves many trips, each guarded by the status its row was showing: a trip somebody
// moved since the page rendered is skipped, not overwritten. The missing ones (not yours,
// already there, moved first) are deliberately indistinguishable.
func bulk(d *edge.Deps, r *http.Request, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	req, err := parseBulk(payload)
	if err != nil {
		return nil, err
	}
	ctx := r.Context()
	var moved []movedRow
	if err := d.DB.RPC(ctx, "agent_bulk_set_trip_status", js.O(
		"p_trip_ids", req.IDs,
		"p_from_statuses", req.Froms,
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_to_status", req.To,
	), &moved); err != nil {
		return nil, fmt.Errorf("bulk trip status failed: %w", err)
	}
	specs := make([]audit.Spec, 0, len(moved))
	for _, m := range moved {
		specs = append(specs, audit.Spec{
			EventType:    "trip.status_changed",
			TargetEntity: "trip",
			TargetID:     m.TripID,
			Metadata:     js.O("from", m.FromStatus, "to", req.To, "version", m.Version, "bulk", true),
		})
	}
	if err := audit.WriteMany(ctx, d.DB, c, specs); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "moved", "status", req.To, "movedCount", len(moved), "requestedCount", len(req.IDs)))
}

// request is the validated single-trip body. The optional fields keep JavaScript's
// undefined apart from a value.
type request struct {
	TripID          string
	Status          string
	ExpectedVersion int64
	Reason          *string // the raw string, when one was sent
	RefundStatus    *string
	RefundDetail    *string // the raw string, when one was sent
	CloseLines      []commission.CloseLine
}

// parse checks a single-trip body in the Deno order.
func parse(payload js.Value) (request, error) {
	tripID, ok := payload.Get("tripId").Str()
	if !ok || !uuid.IsUUID(tripID) {
		return request{}, problem.BadRequest("That is not a trip id.")
	}
	st := payload.Get("status")
	if !isStatus(st) {
		return request{}, problem.BadRequest(statusDetail)
	}
	status, _ := st.Str()
	// Required: a human dragging a card always has a version, and omitting it would turn
	// every drop into last-write-wins.
	version, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return request{}, err
	}
	req := request{TripID: tripID, Status: status, ExpectedVersion: version}

	reason := payload.Get("cancellationReason")
	rs, reasonIsString := reason.Str()
	if status == "cancelled" && (!reasonIsString || js.Trim(rs) == "") {
		return request{}, problem.BadRequest(needsReason)
	}
	if !reason.IsUndefined() && !reasonIsString {
		return request{}, problem.BadRequest("cancellationReason must be text.")
	}
	if reasonIsString {
		req.Reason = &rs
	}

	// Neither refund field is mandatory: NULL means "not stated", a different fact from
	// none_expected.
	refundStatus := payload.Get("refundStatus")
	if !refundStatus.IsUndefined() && !trip.IsRefundStatus(refundStatus) {
		return request{}, problem.BadRequest(refundDetail)
	}
	if s, ok := refundStatus.Str(); ok {
		req.RefundStatus = &s
	}
	detail := payload.Get("refundDetail")
	ds, detailIsString := detail.Str()
	if !detail.IsUndefined() && !detailIsString {
		return request{}, problem.BadRequest("refundDetail must be text.")
	}
	if detailIsString {
		req.RefundDetail = &ds
	}
	// Facts about a cancellation; on a move to booked nothing would render or clear them.
	if status != "cancelled" && (!refundStatus.IsUndefined() || !detail.IsUndefined()) {
		return request{}, problem.BadRequest("Refund details belong to a cancellation.")
	}

	lines, err := commission.ReadCloseLines(payload.Get("closeCommission"))
	if err != nil {
		return request{}, err
	}
	if status != "cancelled" && len(lines) > 0 {
		return request{}, problem.BadRequest("Closing commission lines belongs to a cancellation.")
	}
	req.CloseLines = lines
	return req, nil
}

// trimmed is `typeof x === "string" ? x.trim() : null`.
func trimmed(s *string) any {
	if s == nil {
		return nil
	}
	return js.Trim(*s)
}

// orUndef sends a value or leaves the argument out (undefined), so the SQL DEFAULT applies.
func orUndef(s *string) any {
	if s == nil {
		return js.Undef
	}
	return *s
}

// reasonArg is the trimmed reason, or undefined.
func (q request) reasonArg() any {
	if q.Reason == nil {
		return js.Undef
	}
	return js.Trim(*q.Reason)
}

// refundDetailArg is the trimmed detail, or undefined when absent or blank.
func (q request) refundDetailArg() any {
	if q.RefundDetail == nil || js.Trim(*q.RefundDetail) == "" {
		return js.Undef
	}
	return js.Trim(*q.RefundDetail)
}

// result is one row of agent_set_trip_status or agent_cancel_trip.
type result struct {
	agent.StageWriteResult
	LinesClosed  *int64 `json:"lines_closed"`
	LinesSkipped *int64 `json:"lines_skipped"`
}

func orZero(n *int64) int64 {
	if n == nil {
		return 0
	}
	return *n
}

// write runs the stage write, through agent_cancel_trip when lines are named.
func write(d *edge.Deps, r *http.Request, c *caller.Context, agentID string, q request) (result, bool, error) {
	ctx := r.Context()
	var res result
	if q.Status == "cancelled" && len(q.CloseLines) > 0 {
		reason := any("")
		if q.Reason != nil {
			reason = js.Trim(*q.Reason) // checked non-blank above for every cancelled call
		}
		ids := make([]string, len(q.CloseLines)) // one v7 per line, paired in id order in SQL
		for i := range ids {
			ids[i] = uuid.New()
		}
		found, err := d.DB.RPCRow(ctx, "agent_cancel_trip", js.O(
			"p_trip_id", q.TripID,
			"p_agent_id", agentID,
			"p_actor_user_id", c.PlatformUserID,
			"p_expected_version", q.ExpectedVersion,
			"p_reason", reason,
			"p_refund_status", orUndef(q.RefundStatus),
			"p_refund_detail", q.refundDetailArg(),
			"p_close_lines", q.CloseLines,
			"p_audit_ids", ids,
			"p_ip", orUndef(c.IP),
			"p_user_agent", orUndef(c.UserAgent),
		), &res)
		if err != nil {
			return res, false, fmt.Errorf("trip cancel failed: %w", err)
		}
		return res, found, nil
	}
	found, err := d.DB.RPCRow(ctx, "agent_set_trip_status", js.O(
		"p_trip_id", q.TripID,
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_status", q.Status,
		"p_expected_version", q.ExpectedVersion,
		"p_reason", q.reasonArg(),
		"p_refund_status", orUndef(q.RefundStatus),
		"p_refund_detail", q.refundDetailArg(),
	), &res)
	if err != nil {
		return res, false, fmt.Errorf("trip status write failed: %w", err)
	}
	return res, found, nil
}

// answer is the 200 body: stageWriteBody, then on a cancellation what happened to the lines.
func answer(q request, res result) (*edge.Reply, error) {
	body, err := agent.StageWriteBody(q.TripID, q.Status, res.StageWriteResult)
	if err != nil {
		return nil, err
	}
	if q.Status == "cancelled" {
		// skipped is a line that moved since the dialog opened; it is left as is.
		body = body.Spread(js.O("commissionLinesClosed", orZero(res.LinesClosed), "commissionLinesSkipped", orZero(res.LinesSkipped)))
	}
	return edge.OK(body)
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

	// An op rather than a second function, defaulting to the single-trip path: one door onto
	// trip status writes is one place to keep the audit honest.
	if op, _ := payload.Get("op").Str(); op == "bulk" {
		return bulk(d, r, c, agentID, payload)
	}

	q, err := parse(payload)
	if err != nil {
		return nil, err
	}
	res, found, err := write(d, r, c, agentID, q)
	if err != nil {
		return nil, err
	}
	// Zero rows is the answer for both "no such trip" and "not yours".
	if !found {
		return nil, problem.NotFound("No such trip.")
	}
	if res.Outcome == "stale" {
		return nil, problem.Conflict("This trip moved since the board was loaded. Reload and try again.")
	}

	// A correction on a trip ALREADY cancelled: no transition and no history row, but a
	// column moved, so it gets its own event type (the name is a little old: it covers any
	// cancellation detail moving without a transition).
	if res.Outcome == "reason_changed" {
		if err := audit.Write(ctx, d.DB, c, audit.Spec{
			EventType:    "trip.cancellation_reason_changed",
			TargetEntity: "trip",
			TargetID:     q.TripID,
			Metadata: js.O(
				"status", res.ToStatus,
				"version", res.Version,
				"cancellationReason", trimmed(q.Reason),
				"refundStatus", orNull(q.RefundStatus),
				"refundDetail", trimmed(q.RefundDetail),
				"commissionLinesClosed", orZero(res.LinesClosed),
			),
		}); err != nil {
			return nil, err
		}
		return answer(q, res)
	}

	// Already in that stage with nothing to write: no history row, no trip audit row. Lines
	// closed from an already-cancelled trip's dialog were audited one by one in SQL.
	if res.Outcome == "noop" {
		return answer(q, res)
	}

	// THE FALL-THROUGH IS changed AND NOTHING ELSE, tested BEFORE the audit row: a fourth
	// outcome is a deploy-order bug below, and must not leave a trip.status_changed row for
	// an event nobody here can name.
	if res.Outcome != "changed" {
		return nil, fmt.Errorf("unhandled agent_set_trip_status outcome: %s", res.Outcome)
	}

	md := js.O("from", res.FromStatus, "to", res.ToStatus, "version", res.Version)
	if q.Status == "cancelled" && q.Reason != nil {
		md = md.Spread(js.O("cancellationReason", js.Trim(*q.Reason), "commissionLinesClosed", orZero(res.LinesClosed)))
	}
	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    "trip.status_changed",
		TargetEntity: "trip",
		TargetID:     q.TripID,
		Metadata:     md,
	}); err != nil {
		return nil, err
	}
	return answer(q, res)
}

func orNull(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}
