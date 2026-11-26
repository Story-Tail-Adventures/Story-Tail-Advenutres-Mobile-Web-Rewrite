// Package agentitinerary ports supabase/functions/agent-itinerary: the §3.4.14 Itinerary
// Editor's writes.
//
// ITS OWN DOOR, NOT FIVE MORE OPS ON agent-trip: the itinerary is a different entity graph
// (itinerary, day, activity) reached through a different screen.
//
// generate is additive and idempotent in SQL. What matters here is that it AUDITS WHAT IT
// DID rather than that it ran: pressing the button twice writes one audit row, because the
// second press changed nothing.
package agentitinerary

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/component"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

var ops = []string{"generate", "day_upsert", "activity_upsert", "activity_delete", "reorder"}

// blocks are block_kind exactly. Omitted means "work it out from the time": the SQL does.
var blocks = []string{"morning", "afternoon", "evening", "all_day"}

const (
	maxTitle = 200
	maxLabel = 120
	maxBody  = 4000
	maxTip   = 2000
	maxShort = 200
	// maxReorder is one day's activities, far past any real day.
	maxReorder = 200
	// raiseException is Postgres's SQLSTATE for a bare RAISE EXCEPTION.
	raiseException = "P0001"
	notOnBoard     = "That trip is not on your board."
)

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

func requireID(v js.Value, field string) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a " + field + ".")
	}
	return s, nil
}

// blank is `value === undefined || value === null || value === ""`.
func blank(v js.Value) bool {
	if v.IsNullish() {
		return true
	}
	s, ok := v.Str()
	return ok && s == ""
}

// optionalID is an id, or nil when absent, null or "".
func optionalID(v js.Value, field string) (*string, error) {
	if blank(v) {
		return nil, nil
	}
	id, err := requireID(v, field)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

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

// isoDate checks the shape only; Postgres judges the calendar, as it did for Deno.
func isoDate(v js.Value, field string, required bool) (*string, error) {
	if blank(v) {
		if required {
			return nil, problem.BadRequest(field + " is required.")
		}
		return nil, nil
	}
	s, ok := v.Str()
	if !ok || !dateShape.MatchString(s) {
		return nil, problem.BadRequest(field + " must be a date.")
	}
	return &s, nil
}

func block(v js.Value) (*string, error) {
	if blank(v) {
		return nil, nil
	}
	s, ok := oneOf(v, blocks)
	if !ok {
		return nil, problem.BadRequest("block must be one of " + strings.Join(blocks, ", ") + ".")
	}
	return &s, nil
}

// orNull is a *string as JSON: the value, or null (never omitted: Deno sent null).
func orNull(s *string) any {
	if s == nil {
		return nil
	}
	return *s
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
	tripID, err := requireID(payload.Get("tripId"), "trip id")
	if err != nil {
		return nil, err
	}
	h := &handler{d: d, r: r, c: c, agentID: agentID, tripID: tripID, payload: payload}
	switch op {
	case "generate":
		return h.generate()
	case "day_upsert":
		return h.dayUpsert()
	case "activity_upsert":
		return h.activityUpsert()
	case "activity_delete":
		return h.activityDelete()
	}
	return h.reorder()
}

func (h *handler) audit(eventType, entity, target string, md js.Ordered) error {
	return audit.Write(h.r.Context(), h.d.DB, h.c, audit.Spec{EventType: eventType, TargetEntity: entity, TargetID: target, Metadata: md})
}

type generated struct {
	Outcome         string `json:"outcome"`
	DaysAdded       int64  `json:"days_added"`
	ActivitiesAdded int64  `json:"activities_added"`
}

// generate: no_dates IS A 200 WITH AN OUTCOME, not a 4xx, so the screen can say "give the
// trip dates first" against the dates.
func (h *handler) generate() (*edge.Reply, error) {
	var res generated
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_generate_itinerary", js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID), &res)
	if err != nil {
		return nil, fmt.Errorf("itinerary generate failed: %w", err)
	}
	// Zero rows is "no such trip" and "not yours" alike.
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Outcome == "generated" {
		// WHAT IT DID, not that it ran.
		if err := h.audit("itinerary.generated", "trip", h.tripID,
			js.O("days_added", res.DaysAdded, "activities_added", res.ActivitiesAdded)); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "daysAdded", res.DaysAdded, "activitiesAdded", res.ActivitiesAdded))
}

type dayResult struct {
	Outcome string `json:"outcome"`
	DayID   string `json:"day_id"`
}

func (h *handler) dayUpsert() (*edge.Reply, error) {
	p := h.payload
	dayID, err := optionalID(p.Get("dayId"), "day id")
	if err != nil {
		return nil, err
	}
	// Required on a create, optional on an edit: the SQL keeps the existing date on null.
	date, err := isoDate(p.Get("date"), "Date", dayID == nil)
	if err != nil {
		return nil, err
	}
	label, err := str(p.Get("label"), "Label", maxLabel, false)
	if err != nil {
		return nil, err
	}
	summary, err := str(p.Get("summary"), "Summary", maxBody, false)
	if err != nil {
		return nil, err
	}
	var res dayResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_upsert_itinerary_day", js.O(
		"p_trip_id", h.tripID,
		"p_agent_id", h.agentID,
		"p_day_id", orNull(dayID),
		"p_date", orNull(date),
		"p_label", orNull(label),
		"p_summary", orNull(summary),
	), &res)
	if err != nil {
		return nil, fmt.Errorf("itinerary day upsert failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Outcome != "noop" {
		event := "itinerary_day.created"
		if dayID != nil {
			event = "itinerary_day.updated"
		}
		// No label or summary: prose about a client's trip, and audit rows are kept seven years.
		if err := h.audit(event, "itinerary_day", res.DayID, js.O("trip_id", h.tripID)); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "dayId", res.DayID))
}

type activityResult struct {
	Outcome    string `json:"outcome"`
	ActivityID string `json:"activity_id"`
}

// activityArgs validates the activity fields in the order the Deno object literal read them.
func activityArgs(p js.Value) (js.Ordered, *string, error) {
	activityID, err := optionalID(p.Get("activityId"), "activity id")
	if err != nil {
		return nil, nil, err
	}
	dayID, err := optionalID(p.Get("dayId"), "day id")
	if err != nil {
		return nil, nil, err
	}
	title, err := str(p.Get("title"), "Title", maxTitle, true)
	if err != nil {
		return nil, nil, err
	}
	blk, err := block(p.Get("block"))
	if err != nil {
		return nil, nil, err
	}
	start, err := component.ReadTime(p.Get("startTime"), "Start time")
	if err != nil {
		return nil, nil, err
	}
	end, err := component.ReadTime(p.Get("endTime"), "End time")
	if err != nil {
		return nil, nil, err
	}
	texts := []struct {
		key, field string
		max        int
	}{
		{"body", "Description", maxBody},
		{"location", "Place", maxShort},
		{"address", "Address", maxShort},
		{"phone", "Phone", 40},
		{"confirmationNumber", "Confirmation number", 80},
		{"gyasisTip", "Tip", maxTip},
	}
	vals := make([]*string, len(texts))
	for i, t := range texts {
		if vals[i], err = str(p.Get(t.key), t.field, t.max, false); err != nil {
			return nil, nil, err
		}
	}
	return js.O(
		"p_activity_id", orNull(activityID),
		"p_day_id", orNull(dayID),
		"p_title", *title,
		"p_block", orNull(blk),
		"p_start_time", orNull(start),
		"p_end_time", orNull(end),
		"p_body", orNull(vals[0]),
		"p_location", orNull(vals[1]),
		"p_address", orNull(vals[2]),
		"p_phone", orNull(vals[3]),
		"p_confirmation_number", orNull(vals[4]),
		"p_gyasis_tip", orNull(vals[5]),
	), activityID, nil
}

func (h *handler) activityUpsert() (*edge.Reply, error) {
	args, activityID, err := activityArgs(h.payload)
	if err != nil {
		return nil, err
	}
	var res activityResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_upsert_itinerary_activity",
		append(js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID), args...), &res)
	if err != nil {
		return nil, fmt.Errorf("itinerary activity upsert failed: %w", err)
	}
	// Also the answer for "that day is not on this itinerary" and "no day on a create".
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Outcome != "noop" {
		event := "itinerary_activity.created"
		if activityID != nil {
			event = "itinerary_activity.updated"
		}
		if err := h.audit(event, "itinerary_activity", res.ActivityID, js.O("trip_id", h.tripID)); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "activityId", res.ActivityID))
}

func (h *handler) activityDelete() (*edge.Reply, error) {
	activityID, err := requireID(h.payload.Get("activityId"), "activity id")
	if err != nil {
		return nil, err
	}
	var res activityResult
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_delete_itinerary_activity",
		js.O("p_trip_id", h.tripID, "p_agent_id", h.agentID, "p_activity_id", activityID), &res)
	if err != nil {
		return nil, fmt.Errorf("itinerary activity delete failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	// A HARD DELETE: the audit row is the only record left that it existed, so it is
	// written unconditionally.
	if err := h.audit("itinerary_activity.deleted", "itinerary_activity", res.ActivityID, js.O("trip_id", h.tripID)); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", res.Outcome, "activityId", res.ActivityID))
}

// reorderIDs validates a reorder: the day, then the list.
func reorderIDs(p js.Value) (string, []string, error) {
	dayID, err := requireID(p.Get("dayId"), "day id")
	if err != nil {
		return "", nil, err
	}
	list, ok := p.Get("activityIds").Array()
	if !ok || len(list) == 0 {
		return "", nil, problem.BadRequest("Send the activities in their new order.")
	}
	if len(list) > maxReorder {
		return "", nil, problem.BadRequest("That is too many activities.")
	}
	ids := make([]string, len(list))
	for i, v := range list {
		if ids[i], err = requireID(v, "activity id"); err != nil {
			return "", nil, err
		}
	}
	// Here rather than left to the UPDATE, which would apply the first occurrence and leave
	// an order nobody chose. new Set compares the strings exactly, case and all.
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return "", nil, problem.BadRequest("That order lists an activity twice.")
		}
		seen[id] = true
	}
	return dayID, ids, nil
}

type reordered struct {
	Outcome string `json:"outcome"`
	Moved   int64  `json:"moved"`
}

func (h *handler) reorder() (*edge.Reply, error) {
	dayID, ids, err := reorderIDs(h.payload)
	if err != nil {
		return nil, err
	}
	var res reordered
	found, err := h.d.DB.RPCRow(h.r.Context(), "agent_reorder_itinerary_activities", js.O(
		"p_trip_id", h.tripID,
		"p_agent_id", h.agentID,
		"p_day_id", dayID,
		"p_activity_ids", ids,
	), &res)
	if err != nil {
		// THE FUNCTION REFUSES A PARTIAL DAY: the day gained or lost an activity since the
		// page rendered. A stale write, so a 409, not a 500.
		var se *service.Error
		if errors.As(err, &se) && se.Code == raiseException {
			return nil, problem.Conflict("This day changed since you opened it. Reload and try again.")
		}
		return nil, fmt.Errorf("itinerary reorder failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound(notOnBoard)
	}
	if res.Moved > 0 {
		if err := h.audit("itinerary_day.reordered", "itinerary_day", dayID,
			js.O("trip_id", h.tripID, "moved", res.Moved, "total", len(ids))); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "moved", res.Moved))
}
