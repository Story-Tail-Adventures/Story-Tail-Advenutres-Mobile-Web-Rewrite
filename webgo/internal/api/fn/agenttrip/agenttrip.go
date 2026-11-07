// Package agenttrip ports supabase/functions/agent-trip: the trip's own write door. Screens
// 3.4.3 (create), 3.4.4 to 3.4.12 (components), 3.4.15 (the payment schedule) and 3.6.1
// (pay links).
//
// A SEPARATE DOOR FROM agent-trip-status, which is about a trip's STAGE (a version, a stale
// refusal, a history row). Creating a trip has no prior stage, and a component is not the
// trip. Components are one route because seven "add" sheets and an "edit" are eight screens
// over one table.
//
// THE ID IS MINTED HERE for a trip (v7, Data-Model §21.6), NOT for a component:
// agent_upsert_trip_component mints its own, because p_component_id there means "edit this
// one" and nothing else.
//
// MONEY AND PAY LINKS (CLAUDE.md rules 1 to 5, BRD §10). There is no card anywhere: a pay link,
// a confirmation number or a note holding a card number is refused (internal/domain/paylink).
// Pay links are https:// only, written by the advisor only (every op here is behind
// RequireAgentID), and every add, change or removal is audited IN SQL by
// agent_set_milestone_pay_url, in the same transaction as the write, as is every paid mark by
// agent_set_milestone_paid. The other milestone and component writes are audited here, after
// the write, exactly as the Deno function did. Cents are int64 end to end.
package agenttrip

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/component"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/paylink"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

var ops = []string{
	"create",
	"component_upsert",
	"component_archive",
	"component_reorder",
	// payment_paid is separate from payment_upsert: paid_cents, paid_at and status move
	// together and are the only thing that may touch trip.total_paid_cents. A label edit
	// must not be able to reach it.
	"payment_upsert",
	"payment_paid",
	"payment_delete",
	// §3.6.1: the milestone's pay link, set, changed or removed (null). Audited in SQL.
	"payment_link",
}

// tripTypes are trip_type exactly (the prototype's "Honeymoon" tile is not a trip type).
var tripTypes = []string{"cruise", "all_inclusive", "multi_destination", "group", "custom"}

const (
	maxTitle         = 160
	maxTravelers     = 64
	maxComponentName = 200
	maxLocation      = 200
	maxConfirmation  = 80
	// maxReorder: a reorder carries every live component, so this is "how many components
	// can one trip hold".
	maxReorder        = 500
	maxMilestoneLabel = 120
)

var milestoneKinds = []string{"deposit", "interim", "final"}

// milestoneStatuses: waived is not paid (a forgiven milestone must not raise what the client
// has paid), and overdue is stored so an advisor can suppress it.
var milestoneStatuses = []string{"scheduled", "paid", "waived", "overdue"}

// SQLSTATEs the Deno function branched on.
const (
	raiseException   = "P0001" // a bare RAISE EXCEPTION
	checkViolation   = "23514" // a CHECK refused the row; the paylink checks run first
	invalidParameter = "22023" // agent_set_milestone_paid: a date paid after the advisor's today
)

const notOnBoard = "That trip is not on your board."

func oneOf(v js.Value, list []string) (string, bool) {
	s, ok := v.Str()
	if !ok {
		return "", false
	}
	for _, x := range list {
		if x == s {
			return s, true
		}
	}
	return "", false
}

func requireOp(v js.Value) (string, error) {
	op, ok := oneOf(v, ops)
	if !ok {
		return "", problem.BadRequest("op must be one of " + strings.Join(ops, ", ") + ".")
	}
	return op, nil
}

func requireTripID(v js.Value) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a trip id.")
	}
	return s, nil
}

// requireComponentID is also the check the Deno function used for supplier and milestone
// ids, sentence and all.
func requireComponentID(v js.Value) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a component id.")
	}
	return s, nil
}

func isEmptyString(v js.Value) bool {
	s, ok := v.Str()
	return ok && s == ""
}

// blank is `value === undefined || value === null || value === ""`.
func blank(v js.Value) bool { return v.IsNullish() || isEmptyString(v) }

// str is trimmed text, nil when blank; length is counted in UTF-16 units, as JavaScript does.
func str(v js.Value, field string, max int, required bool) (*string, error) {
	if blank(v) {
		if required {
			return nil, problem.BadRequest(field + " is required.")
		}
		return nil, nil
	}
	s, ok := v.Str()
	if !ok {
		return nil, problem.BadRequest(field + " must be text.")
	}
	t := js.Trim(s)
	if required && t == "" {
		return nil, problem.BadRequest(field + " is required.")
	}
	if js.Len(t) > max {
		return nil, problem.BadRequest(field + " is too long.")
	}
	if t == "" {
		return nil, nil
	}
	return &t, nil
}

var dateShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// isoDate is yyyy-mm-dd by shape, or nil; Postgres judges the calendar, as it did for Deno.
func isoDate(v js.Value, field string) (*string, error) {
	if blank(v) {
		return nil, nil
	}
	s, ok := v.Str()
	if !ok || !dateShape.MatchString(s) {
		return nil, problem.BadRequest(field + " must be a date.")
	}
	return &s, nil
}

// orNull is a pointer as JSON: the value, or null (never omitted: Deno sent null).
func orNull[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}

// dbCode is the SQLSTATE of a failed call, for the branches the Deno function took on
// error.code.
func dbCode(err error) string {
	var se *service.Error
	if errors.As(err, &se) {
		return se.Code
	}
	return ""
}

// handler is everything an op needs.
type handler struct {
	d       *edge.Deps
	r       *http.Request
	c       *caller.Context
	agentID string
	tripID  string
	payload js.Value
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
	op, err := requireOp(payload.Get("op"))
	if err != nil {
		return nil, err
	}
	h := &handler{d: d, r: r, c: c, agentID: agentID, payload: payload}
	if op == "create" {
		return h.create()
	}
	if h.tripID, err = requireTripID(payload.Get("tripId")); err != nil {
		return nil, err
	}
	switch op {
	case "component_upsert":
		return h.componentUpsert()
	case "component_archive":
		return h.componentArchive()
	case "payment_upsert":
		return h.paymentUpsert()
	case "payment_paid":
		return h.paymentPaid()
	case "payment_link":
		return h.paymentLink()
	case "payment_delete":
		return h.paymentDelete()
	}
	return h.componentReorder()
}

func (h *handler) audit(eventType, entity, target string, md js.Ordered) error {
	return audit.Write(h.r.Context(), h.d.DB, h.c, audit.Spec{EventType: eventType, TargetEntity: entity, TargetID: target, Metadata: md})
}

// ---- 3.4.3 create ----

// createRequest is the validated create body.
type createRequest struct {
	ClientID  string
	TripType  string
	Title     string
	Travelers int64
}

func parseCreate(p js.Value) (createRequest, error) {
	clientID, ok := p.Get("clientId").Str()
	if !ok || !uuid.IsUUID(clientID) {
		return createRequest{}, problem.BadRequest("Pick a client for this trip.")
	}
	tripType, ok := oneOf(p.Get("tripType"), tripTypes)
	if !ok {
		return createRequest{}, problem.BadRequest("Send a trip type of " + strings.Join(tripTypes, ", ") + ".")
	}
	title, err := str(p.Get("title"), "Trip name", maxTitle, true)
	if err != nil {
		return createRequest{}, err
	}
	// Optional and clamped rather than refused: a starting guess the builder will correct.
	travelers := int64(1)
	if n, ok := p.Get("travelerCount").Num(); ok && js.IsInteger(n) {
		travelers = int64(min(max(n, 1), maxTravelers))
	}
	return createRequest{ClientID: clientID, TripType: tripType, Title: *title, Travelers: travelers}, nil
}

type createResult struct {
	Outcome string `json:"outcome"`
}

func (h *handler) create() (*edge.Reply, error) {
	q, err := parseCreate(h.payload)
	if err != nil {
		return nil, err
	}
	tripID := uuid.NewAt(h.d.Now())
	var res createResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_create_trip", js.O(
		"p_agent_id", h.agentID,
		"p_trip_id", tripID,
		"p_client_id", q.ClientID,
		"p_title", q.Title,
		"p_trip_type", q.TripType,
		"p_traveler_count", q.Travelers,
	), &res)
	if err != nil {
		return nil, fmt.Errorf("trip create failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("That advisor cannot create trips.")
	}
	// A 200 with an outcome rather than a 4xx, so the form can say "pick a client" against
	// the right field.
	if res.Outcome == "no_client" {
		return edge.OK(js.O("outcome", "no_client"))
	}
	// No title: a trip name can carry a client's plans, and audit rows are kept seven years.
	if err := h.audit("trip.created", "trip", tripID,
		js.O("client_id", q.ClientID, "trip_type", q.TripType, "traveler_count", q.Travelers)); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "created", "tripId", tripID))
}

// ---- 3.4.5 to 3.4.12 components ----

// componentFields validates a component in the order the Deno function read it: kind, id,
// supplier, name, cost, rate, commission, then the RPC literal's dates, times, place,
// confirmation number and detail. It returns the RPC arguments after p_agent_id, and what the
// audit row needs.
func componentFields(p js.Value) (args js.Ordered, kind string, componentID *string, cost, commission int64, err error) {
	if kind, err = component.RequireKind(p.Get("kind")); err != nil {
		return
	}
	// Present means EDIT; a create never sends one.
	if v := p.Get("componentId"); !v.IsNullish() {
		var id string
		if id, err = requireComponentID(v); err != nil {
			return
		}
		componentID = &id
	}
	var supplierID *string
	if v := p.Get("supplierId"); !blank(v) {
		var id string
		if id, err = requireComponentID(v); err != nil {
			return
		}
		supplierID = &id
	}
	name, err := str(p.Get("displayName"), "Name", maxComponentName, true)
	if err != nil {
		return
	}
	if cost, err = component.ReadCents(p.Get("costCents"), "Cost"); err != nil {
		return
	}
	pct, err := component.ReadCommissionPct(p.Get("commissionPct"))
	if err != nil {
		return
	}
	// Blank plus a rate means "work it out"; anything typed, 0 included, wins.
	if commission, err = component.ResolveCommissionCents(cost, pct, p.Get("commissionCents")); err != nil {
		return
	}
	startDate, err := isoDate(p.Get("startDate"), "Start date")
	if err != nil {
		return
	}
	endDate, err := isoDate(p.Get("endDate"), "End date")
	if err != nil {
		return
	}
	startTime, err := component.ReadTime(p.Get("startTime"), "Start time")
	if err != nil {
		return
	}
	endTime, err := component.ReadTime(p.Get("endTime"), "End time")
	if err != nil {
		return
	}
	location, err := str(p.Get("location"), "Place", maxLocation, false)
	if err != nil {
		return
	}
	confirmation, err := str(p.Get("confirmationNumber"), "Confirmation number", maxConfirmation, false)
	if err != nil {
		return
	}
	detail, err := component.ReadPayload(kind, p.Get("detail"))
	if err != nil {
		return
	}
	args = js.O(
		"p_component_id", orNull(componentID),
		"p_kind", kind,
		"p_display_name", *name,
		"p_supplier_id", orNull(supplierID),
		"p_start_date", orNull(startDate),
		"p_end_date", orNull(endDate),
		"p_start_time", orNull(startTime),
		"p_end_time", orNull(endTime),
		"p_location", orNull(location),
		"p_confirmation_number", orNull(confirmation),
		"p_cost_cents", cost,
		"p_commission_pct", orNull(pct),
		"p_commission_cents", commission,
		// NO CURRENCY: the SQL takes the trip's. One trip, one currency.
		"p_payload", detail,
	)
	return
}

type componentResult struct {
	Outcome     string `json:"outcome"`
	ComponentID string `json:"component_id"`
}

func (h *handler) componentUpsert() (*edge.Reply, error) {
	args, kind, componentID, cost, commission, err := componentFields(h.payload)
	if err != nil {
		return nil, err
	}
	var res componentResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_upsert_trip_component",
		append(js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID), args...), &res)
	if err != nil {
		return nil, fmt.Errorf("component upsert failed: %w", err)
	}
	// Zero rows: no such trip, not yours, or that component is not on this trip. One answer.
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	// noop writes no audit row: the log is a record of what CHANGED.
	if res.Outcome != "noop" {
		event := "trip_component.created"
		if componentID != nil {
			event = "trip_component.updated"
		}
		// Money, and no name (the line a client reads can carry their plans).
		if err := h.audit(event, "trip_component", res.ComponentID, js.O(
			"trip_id", h.tripID,
			"kind", kind,
			"cost_cents", strconv.FormatInt(cost, 10),
			"commission_cents", strconv.FormatInt(commission, 10),
		)); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "componentId", res.ComponentID))
}

func (h *handler) componentArchive() (*edge.Reply, error) {
	componentID, err := requireComponentID(h.payload.Get("componentId"))
	if err != nil {
		return nil, err
	}
	var res componentResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_archive_trip_component",
		js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID, "p_component_id", componentID), &res)
	if err != nil {
		return nil, fmt.Errorf("component archive failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Outcome != "noop" {
		if err := h.audit("trip_component.archived", "trip_component", res.ComponentID, js.O("trip_id", h.tripID)); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "componentId", res.ComponentID))
}

// reorderIDs validates a component reorder.
func reorderIDs(p js.Value) ([]string, error) {
	list, ok := p.Get("componentIds").Array()
	if !ok || len(list) == 0 {
		return nil, problem.BadRequest("Send the components in their new order.")
	}
	if len(list) > maxReorder {
		return nil, problem.BadRequest("That is too many components.")
	}
	ids := make([]string, len(list))
	for i, v := range list {
		id, err := requireComponentID(v)
		if err != nil {
			return nil, err
		}
		ids[i] = id
	}
	// Not left to the UPDATE, which would apply the first occurrence. new Set compares the
	// strings exactly.
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return nil, problem.BadRequest("That order lists a component twice.")
		}
		seen[id] = true
	}
	return ids, nil
}

type reordered struct {
	Outcome string `json:"outcome"`
	Moved   int64  `json:"moved"`
}

func (h *handler) componentReorder() (*edge.Reply, error) {
	ids, err := reorderIDs(h.payload)
	if err != nil {
		return nil, err
	}
	var res reordered
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_reorder_trip_components",
		js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID, "p_component_ids", ids), &res)
	if err != nil {
		// THE FUNCTION REFUSES A PARTIAL LIST: the trip gained or lost a component since the
		// page rendered. A stale write, so a 409.
		if dbCode(err) == raiseException {
			return nil, problem.Conflict("This trip changed since you opened it. Reload and try again.")
		}
		return nil, fmt.Errorf("component reorder failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Moved > 0 {
		if err := h.audit("trip.components_reordered", "trip", h.tripID, js.O("moved", res.Moved, "total", len(ids))); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "moved", res.Moved))
}

// ---- 3.4.15 the payment schedule ----

type milestoneResult struct {
	Outcome     string `json:"outcome"`
	MilestoneID string `json:"milestone_id"`
}

// milestoneFields validates payment_upsert in the Deno order: kind, id, then the RPC
// literal's label, amount and due date.
func milestoneFields(p js.Value) (args js.Ordered, kind string, milestoneID *string, amount int64, err error) {
	var ok bool
	if kind, ok = oneOf(p.Get("kind"), milestoneKinds); !ok {
		err = problem.BadRequest("kind must be one of " + strings.Join(milestoneKinds, ", ") + ".")
		return
	}
	if v := p.Get("milestoneId"); !v.IsNullish() {
		var id string
		if id, err = requireComponentID(v); err != nil {
			return
		}
		milestoneID = &id
	}
	label, err := str(p.Get("label"), "Label", maxMilestoneLabel, true)
	if err != nil {
		return
	}
	if amount, err = component.ReadCents(p.Get("amountCents"), "Amount"); err != nil {
		return
	}
	due, err := isoDate(p.Get("dueDate"), "Due date")
	if err != nil {
		return
	}
	args = js.O(
		"p_milestone_id", orNull(milestoneID),
		"p_kind", kind,
		"p_label", *label,
		"p_amount_cents", amount,
		"p_due_date", orNull(due),
	)
	return
}

func (h *handler) paymentUpsert() (*edge.Reply, error) {
	args, kind, milestoneID, amount, err := milestoneFields(h.payload)
	if err != nil {
		return nil, err
	}
	var res milestoneResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_upsert_payment_milestone",
		append(js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID), args...), &res)
	if err != nil {
		return nil, fmt.Errorf("milestone upsert failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Outcome != "noop" {
		event := "payment_milestone.created"
		if milestoneID != nil {
			event = "payment_milestone.updated"
		}
		// No label (the client-facing sentence); the amount is the material fact.
		if err := h.audit(event, "payment_milestone", res.MilestoneID,
			js.O("trip_id", h.tripID, "kind", kind, "amount_cents", strconv.FormatInt(amount, 10))); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "milestoneId", res.MilestoneID))
}

type paidResult struct {
	Outcome     string `json:"outcome"`
	MilestoneID string `json:"milestone_id"`
	// PaidCents is text: agent_set_milestone_paid returns paid_cents::text, and the reply
	// passes it through as the string it is.
	PaidCents *string `json:"paid_cents"`
}

// paidRequest is the validated payment_paid body.
type paidRequest struct {
	Status      string
	MilestoneID string
	PaidCents   *int64
	Reference   *string
	Note        *string
	PaidOn      *string
}

// parsePaid validates payment_paid in the Deno order: status, id, amount, then the RPC
// literal's confirmation number, note and date paid. A card number in either text is refused.
func parsePaid(p js.Value, now time.Time) (paidRequest, error) {
	status, ok := oneOf(p.Get("status"), milestoneStatuses)
	if !ok {
		return paidRequest{}, problem.BadRequest("status must be one of " + strings.Join(milestoneStatuses, ", ") + ".")
	}
	milestoneID, err := requireComponentID(p.Get("milestoneId"))
	if err != nil {
		return paidRequest{}, err
	}
	q := paidRequest{Status: status, MilestoneID: milestoneID}
	// Absent means "the whole amount". Zero is NOT absent: nothing landed.
	if v := p.Get("paidCents"); !blank(v) {
		n, err := component.ReadCents(v, "Amount paid")
		if err != nil {
			return paidRequest{}, err
		}
		q.PaidCents = &n
	}
	// §3.6.5 Mark Paid: absent keeps what is stored, "" clears it, so the status toggle,
	// which sends neither, cannot wipe a confirmation number.
	if q.Reference, err = paylink.ReadPaidReference(p.Get("paidReference")); err != nil {
		return paidRequest{}, err
	}
	if q.Note, err = paylink.ReadPaidNote(p.Get("paidNote")); err != nil {
		return paidRequest{}, err
	}
	if q.PaidOn, err = paylink.ReadPaidOn(p.Get("paidOn"), now); err != nil {
		return paidRequest{}, err
	}
	return q, nil
}

func (h *handler) paymentPaid() (*edge.Reply, error) {
	q, err := parsePaid(h.payload, h.d.Now())
	if err != nil {
		return nil, err
	}
	var res paidResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_set_milestone_paid", js.O(
		"p_trip_id", h.tripID,
		"p_agent_id", h.agentID,
		"p_milestone_id", q.MilestoneID,
		"p_status", q.Status,
		"p_paid_cents", orNull(q.PaidCents),
		"p_paid_reference", orNull(q.Reference),
		"p_paid_note", orNull(q.Note),
		"p_paid_on", orNull(q.PaidOn),
		"p_actor_user_id", h.c.PlatformUserID,
		"p_ip", orNull(h.c.IP),
		"p_user_agent", orNull(h.c.UserAgent),
	), &res)
	if err != nil {
		switch dbCode(err) {
		case invalidParameter:
			return nil, problem.BadRequest("The date paid can't be in the future.")
		case checkViolation:
			return nil, problem.BadRequest("That confirmation number or note can't be saved.")
		}
		return nil, fmt.Errorf("milestone paid failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	// NO AUDIT WRITE HERE, on purpose: the SQL writes its own row (marked_paid, marked_waived,
	// payment_cleared, status_changed) in the same transaction, so the money cannot move
	// without its record.
	return edge.OK(js.O("outcome", res.Outcome, "milestoneId", res.MilestoneID, "paidCents", orNull(res.PaidCents)))
}

// ---- 3.6.1 the pay link ----

func (h *handler) paymentLink() (*edge.Reply, error) {
	milestoneID, err := requireComponentID(h.payload.Get("milestoneId"))
	if err != nil {
		return nil, err
	}
	// https only, no user name or password, a named host, no card number, at most 2,048
	// characters; the parsed href comes back, so what is stored is what was checked. null,
	// "" or absent removes the link.
	payURL, err := paylink.ReadPayURL(h.payload.Get("payUrl"))
	if err != nil {
		return nil, err
	}
	var res milestoneResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_set_milestone_pay_url", js.O(
		"p_trip_id", h.tripID,
		"p_agent_id", h.agentID,
		"p_milestone_id", milestoneID,
		"p_pay_url", orNull(payURL),
		"p_actor_user_id", h.c.PlatformUserID,
		"p_ip", orNull(h.c.IP),
		"p_user_agent", orNull(h.c.UserAgent),
	), &res)
	if err != nil {
		if dbCode(err) == checkViolation {
			return nil, problem.BadRequest("That link can't be saved. Check it is the supplier's own https:// address.")
		}
		return nil, fmt.Errorf("milestone pay link failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	// Audited in SQL (link_set, link_changed, link_removed) in the same transaction as the
	// write; a no-op writes nothing. A link swapped without a trace could send a client's
	// money to the wrong place.
	return edge.OK(js.O("outcome", res.Outcome, "milestoneId", res.MilestoneID, "payUrl", orNull(payURL)))
}

func (h *handler) paymentDelete() (*edge.Reply, error) {
	milestoneID, err := requireComponentID(h.payload.Get("milestoneId"))
	if err != nil {
		return nil, err
	}
	var res milestoneResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_delete_payment_milestone",
		js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID, "p_milestone_id", milestoneID), &res)
	if err != nil {
		return nil, fmt.Errorf("milestone delete failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	// A HARD DELETE: the audit row is the only record left that it ever existed.
	if err := h.audit("payment_milestone.deleted", "payment_milestone", res.MilestoneID, js.O("trip_id", h.tripID)); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", res.Outcome, "milestoneId", res.MilestoneID))
}
