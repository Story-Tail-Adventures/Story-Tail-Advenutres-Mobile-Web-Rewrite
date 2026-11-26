// Package testimonial ports supabase/functions/testimonial: save or submit a traveler's
// reflection on a trip. Screen 2.2.11. Mobile calls it.
//
// WHY A FUNCTION: testimonial has no client write policy. Every mutation needs an audit_event
// (CLAUDE.md rule 3), and a CLIENT MAY ONLY EVER REACH draft AND submitted; approved and
// published are the advisor's, and nothing reaches a public surface without approved_at. The
// table's CHECKs are the backstop.
//
// THE ROW IS FOUND BY TRIP, NOT BY THE ID SENT: testimonial_client_trip is unique on
// (client_id, trip_id), "a second reflection on the same trip is an edit". A device that forgot
// its draft id lands on the existing row; the supplied id is used only when there is none, the
// only case where its recency matters. A reflection with no trip is keyed by id alone.
//
// SUBMITTING IS ONE-WAY: once it leaves draft the body is frozen (Gyasi may have read it, or
// quoted it publicly).
package testimonial

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	maxBody        = 4000
	maxAttribution = 120
)

// request is the parsed body.
type request struct {
	SuppliedID  string
	Body        string
	Attribution *string
	Rating      *int64
	Submit      bool
	// TripID is str(payload.tripId) ?? null: nil, or a string, which may be "" (falsy, so the
	// reflection is read as tripless, yet the write then sends trip_id "" as Deno did).
	TripID *string
}

type testimonialRow struct {
	ID          string  `json:"id"`
	Status      string  `json:"status"`
	SubmittedAt *string `json:"submitted_at"`
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
	clientID, err := trip.RequireClientID(c)
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
	ctx := r.Context()
	hasTrip := req.TripID != nil && *req.TripID != ""

	// When it names a trip, the trip has to be theirs: otherwise this attaches words to a
	// stranger's booking. With none, the advisor comes off the client record (agent_id is NOT
	// NULL: a reflection nobody can approve would sit in submitted forever).
	var agentID string
	if hasTrip {
		t, err := guard.RequireOwnedTrip(ctx, d.DB, clientID, *req.TripID)
		if err != nil {
			return nil, err
		}
		agentID = t.AgentID
	} else {
		var client struct {
			ID      string  `json:"id"`
			AgentID *string `json:"agent_id"`
		}
		found, err := d.DB.From("client").Select("id, agent_id").Eq("id", clientID).MaybeSingle(ctx, &client)
		if err != nil {
			return nil, fmt.Errorf("client lookup failed: %w", err)
		}
		if !found || client.AgentID == nil || *client.AgentID == "" {
			return nil, problem.NotFound("No advisor on record.")
		}
		agentID = *client.AgentID
	}

	// Keyed by trip when there is one, by id otherwise; both scoped to this client, so
	// somebody else's row is not found rather than found and refused (ids stay unprobeable).
	lookup := d.DB.From("testimonial").Select("id, status, submitted_at").Eq("client_id", clientID)
	if hasTrip {
		lookup = lookup.Eq("trip_id", *req.TripID)
	} else {
		lookup = lookup.Eq("id", req.SuppliedID)
	}
	var existing testimonialRow
	found, err := lookup.MaybeSingle(ctx, &existing)
	if err != nil {
		return nil, fmt.Errorf("testimonial lookup failed: %w", err)
	}

	// Immutable once it leaves draft; checked on STATUS, not submitted_at, because an advisor's
	// approval is the case that matters most.
	if found && existing.Status != "draft" {
		return nil, problem.Forbidden("This reflection is already with Gyasi. Message him to change it.")
	}

	// The supplied id is only used for a row that does not exist yet, so only then is its
	// recency asserted: refusing a stale id on an EDIT would lock a returning traveler out of
	// their own draft.
	testimonialID := req.SuppliedID
	if found {
		testimonialID = existing.ID
	} else if msg := recentV7Problem(testimonialID, d.Now()); msg != "" {
		return nil, problem.BadRequest("testimonialId must be a recent UUID v7: " + msg)
	}

	now := js.ISOString(d.Now())
	status := "draft"
	var submittedAt *string
	if req.Submit {
		status = "submitted"
		submittedAt = &now
	}

	var tripCol any // null
	if req.TripID != nil {
		tripCol = *req.TripID
	}
	err = d.DB.From("testimonial").Upsert(ctx, js.O(
		"id", testimonialID,
		"client_id", clientID,
		"trip_id", tripCol,
		"agent_id", agentID,
		"body", req.Body,
		"attribution", req.Attribution,
		"rating", req.Rating,
		"status", status,
		"submitted_at", submittedAt,
		// Never set here, at any input: the advisor's to set, listed so an upsert can never
		// inherit them from a client payload.
		"approved_at", nil,
		"approved_by_user_id", nil,
		"published_at", nil,
		"updated_at", now,
	), service.UpsertOptions{OnConflict: "id"}, nil)
	if err != nil {
		return nil, fmt.Errorf("testimonial write failed: %w", err)
	}

	event := "testimonial.saved"
	if req.Submit {
		event = "testimonial.submitted"
	}
	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    event,
		TargetEntity: "testimonial",
		TargetID:     testimonialID,
		// Not the body: the audit row records that somebody wrote a reflection, not a second
		// copy of what they said.
		Metadata: js.O("tripId", tripCol, "rating", req.Rating, "hasAttribution", req.Attribution != nil),
	}); err != nil {
		return nil, err
	}

	reply := js.O("testimonialId", testimonialID, "status", status)
	if submittedAt != nil {
		reply = reply.Set("submittedAt", *submittedAt)
	}
	return edge.OK(reply)
}

// parse reads the body in the order the TypeScript checks it.
func parse(p js.Value) (request, error) {
	var req request
	id, _ := p.Get("testimonialId").Str()
	if id == "" {
		return req, problem.BadRequest("Pass testimonialId.")
	}
	// Shape only here (the lookup queries by it); recency comes later, for a new row only.
	if !uuid.IsUUID(id) {
		return req, problem.BadRequest("That is not a reflection id.")
	}
	req.SuppliedID = id

	if s, ok := p.Get("body").Str(); ok {
		req.Body = js.Trim(s)
	}
	if req.Body == "" {
		return req, problem.BadRequest("A reflection needs something in it.")
	}
	if js.Len(req.Body) > maxBody {
		return req, problem.BadRequest("Keep the reflection under " + strconv.Itoa(maxBody) + " characters.")
	}

	if s, ok := p.Get("attribution").Str(); ok {
		if a := js.Trim(s); a != "" {
			req.Attribution = &a
		}
	}
	if req.Attribution != nil && js.Len(*req.Attribution) > maxAttribution {
		return req, problem.BadRequest("Keep the attribution under " + strconv.Itoa(maxAttribution) + " characters.")
	}

	if v := p.Get("rating"); !v.IsNullish() {
		n := jsNumber(v)
		if !js.IsInteger(n) || n < 1 || n > 5 {
			return req, problem.BadRequest("A rating is a whole number from 1 to 5.")
		}
		r := int64(n)
		req.Rating = &r
	}

	req.Submit = p.Get("submit").IsTrue()
	if s, ok := p.Get("tripId").Str(); ok {
		req.TripID = &s
	}
	return req, nil
}

// jsNumber is Number(value) for a parsed body value. An array goes through its string form
// ([3] is 3, [] is 0); an object is NaN.
func jsNumber(v js.Value) float64 {
	switch v.Kind() {
	case js.Number:
		n, _ := v.Num()
		return n
	case js.String:
		s, _ := v.Str()
		return js.ToNumber(s)
	case js.Bool:
		if b, _ := v.Bool(); b {
			return 1
		}
		return 0
	case js.Array:
		return js.ToNumber(arrayString(v))
	default:
		return math.NaN()
	}
}

// arrayString is Array.prototype.toString: elements joined with commas, null and undefined as
// "", nested arrays flattened the same way, an object as "[object Object]".
func arrayString(v js.Value) string {
	items, _ := v.Array()
	parts := make([]string, len(items))
	for i, it := range items {
		switch it.Kind() {
		case js.String:
			parts[i], _ = it.Str()
		case js.Number:
			n, _ := it.Num()
			parts[i] = js.NumberString(n)
		case js.Bool:
			b, _ := it.Bool()
			parts[i] = strconv.FormatBool(b)
		case js.Array:
			parts[i] = arrayString(it)
		case js.Object:
			parts[i] = "[object Object]"
		}
	}
	return strings.Join(parts, ",")
}

// recentV7Problem is the message assertRecentUuidV7 threw, which the function quotes in its
// 400; "" when the id is a recent v7. internal/uuid's errors carry other sentences, so the
// Deno ones are rebuilt here. Judged on a millisecond clock, as Date.now() is.
func recentV7Problem(id string, now time.Time) string {
	err := uuid.CheckRecent(id, now.Truncate(time.Millisecond))
	switch {
	case err == nil:
		return ""
	case errors.Is(err, uuid.ErrTooOld):
		return "UUID v7 timestamp is more than 3600000ms old"
	case errors.Is(err, uuid.ErrInFuture):
		return "UUID v7 timestamp is more than 3600000ms in the future"
	default:
		return "Not a UUID v7: " + id
	}
}
