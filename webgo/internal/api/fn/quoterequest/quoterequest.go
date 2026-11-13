// Package quoterequest ports supabase/functions/quote-request: turn a search result into a trip
// in `inquiry` status. Screen 2.3.8 / 2.0.4. P2. Roles: client.
//
// WHY A TRIP AND NOT A LEAD: Gyasi's decision of 2026-09-09 (BRD §6.5). trip.status already
// defaults to inquiry, so "awaiting a quote" needed no new entity. trip.client_id and the
// client's names are NOT NULL, so there is no anonymous path: the caller is a signed-in client.
//
// WHY THE SERVICE ROLE: client write grants are revoked (a PostgREST insert would match
// nothing and look like it worked). The caller is resolved from their own token and the client
// row read back before anything is written; the service role writes, it does not decide.
//
// MONEY STAYS ZERO. A hotel result's indicative nightly rate is not a quote: cost_cents and
// commission_cents keep their zero defaults (they roll into the trip's totals and commission
// forecasting); the provider's figure rides in trip_component.payload under a name that says
// what it is.
package quoterequest

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/quote"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	// Advisors have their own way into the trip builder (3.4.x); a trip made here belongs to
	// the caller.
	if err := caller.RequireRole(c, caller.RoleClient); err != nil {
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
	input, err := quote.ParseBody(payload, d.Now())
	if err != nil {
		return nil, err
	}
	cuts := denoCuts(payload, input)
	ctx := r.Context()

	// The agent comes off the client, never the request: naming your own agent would put a
	// trip in somebody else's workspace (trip.agent_id is denormalized, Data-Model §19.1).
	var client struct {
		ID        string  `json:"id"`
		AgentID   string  `json:"agent_id"`
		FirstName *string `json:"first_name"`
	}
	found, err := d.DB.From("client").Select("id, agent_id, first_name").Eq("id", clientID).MaybeSingle(ctx, &client)
	if err != nil {
		return nil, fmt.Errorf("client lookup failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("No client record for this account.")
	}

	tripID := input.TripID
	componentID := uuid.New()

	err = d.DB.From("trip").Insert(ctx, js.O(
		"id", tripID,
		"client_id", client.ID,
		"agent_id", client.AgentID,
		"title", cuts.title,
		"trip_type", input.TripType,
		// status is left to its DEFAULT of 'inquiry': that default IS the "awaiting a quote"
		// state, and naming it here would make a second place to change it.
		"start_date", input.CheckIn,
		"end_date", input.CheckOut,
		"destinations", cuts.destinations,
		"traveler_count", input.Travelers,
		"notes", cuts.notes,
	), nil)
	if err != nil {
		// A duplicate id is a retried submission: the trip already exists.
		var se *service.Error
		if errors.As(err, &se) && se.Code == "23505" {
			return nil, problem.BadRequest("That request has already been sent.")
		}
		return nil, fmt.Errorf("trip insert failed: %w", err)
	}

	componentErr := d.DB.From("trip_component").Insert(ctx, js.O(
		"id", componentID,
		"trip_id", tripID,
		"kind", input.Kind,
		"display_name", cuts.displayName,
		"start_date", input.CheckIn,
		"end_date", input.CheckOut,
		"location", cuts.location,
		// cost_cents and commission_cents keep their zero defaults. See the package doc.
		"payload", cuts.snapshot,
		"api_source", input.APISource,
		"api_reference", cuts.apiReference,
	), nil)
	// A missing component is a poorer inquiry, not a failed one: logged, not rolled back (no
	// transaction spans the two round trips, and losing the trip would be worse).
	if componentErr != nil {
		d.Log.Error("quote-request component insert failed", "db_code", dbCode(componentErr))
	}

	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    "trip.inquiry_created",
		TargetEntity: "trip",
		TargetID:     tripID,
		// Not the snapshot: an audit row is a trail, not a copy of the payload.
		Metadata: js.O("kind", input.Kind, "apiSource", input.APISource, "componentWritten", componentErr == nil),
	}); err != nil {
		return nil, err
	}

	// §3.12.3: tell the advisor (push and/or email, by their switches and hours). A failure
	// costs the alert, never the traveler's request.
	if err := d.DB.RPC(ctx, "alert_quote_request", js.O("p_trip_id", tripID), nil); err != nil {
		d.Log.Error("quote-request advisor alert failed", "db_code", dbCode(err))
	}

	return &edge.Reply{Status: http.StatusCreated, Body: js.O("tripId", tripID, "status", "inquiry")}, nil
}

func dbCode(err error) string {
	var se *service.Error
	if errors.As(err, &se) {
		return se.Code
	}
	return ""
}

// ---- the cuts Deno made in UTF-16 ----
//
// domain/quote's text() cuts a field to so many UTF-16 units with js.Slice, which turns half
// an emoji into U+FFFD. The TypeScript kept the half: JSON.stringify sent it as a lone
// surrogate escape (\ud83d), and Postgres refused the write (the trip insert, a 500; or the
// component insert, componentWritten false). Every written field that can end in such a cut
// is recomputed here in UTF-16, and where Deno's would end in a lone surrogate the same JSON
// is sent, so the database answers the same. Otherwise the domain's values go as they are.

type writeCuts struct {
	title, destinations, notes, displayName, location, apiReference any
	snapshot                                                        js.Ordered
}

func denoCuts(payload js.Value, in quote.QuoteInput) writeCuts {
	name := units(payload.Get("name"), quote.MaxTitle)
	out := writeCuts{
		title:        in.Title,
		destinations: in.Destinations,
		notes:        in.Note,
		displayName:  in.DisplayName,
		location:     in.Location,
		apiReference: in.APIReference,
		snapshot:     in.Snapshot,
	}
	title := name
	if in.Location != nil {
		loc := units(payload.Get("location"), 120)
		joined := append(append(append([]uint16{}, name...), utf16.Encode([]rune(" \U000000B7 "))...), loc...)
		if len(joined) > quote.MaxTitle {
			joined = joined[:quote.MaxTitle]
		}
		title = joined
		if lone(loc) {
			out.location = jsonUnits(loc)
			out.destinations = json.RawMessage("[" + string(jsonUnits(loc)) + "]")
		}
	}
	if lone(title) {
		out.title = jsonUnits(title)
	}
	if lone(name) {
		out.displayName = jsonUnits(name)
	}
	if in.Note != nil {
		if u := units(payload.Get("note"), quote.MaxNote); lone(u) {
			out.notes = jsonUnits(u)
		}
	}
	if in.APIReference != nil {
		if u := units(payload.Get("apiReference"), 220); lone(u) {
			out.apiReference = jsonUnits(u)
		}
	}

	snap := payload.Get("snapshot")
	if !snap.IsPlainObject() {
		return out
	}
	fixed := append(js.Ordered{}, in.Snapshot...)
	changed := false
	for _, key := range []string{"propertyType", "photoUrl", "propertyToken"} {
		if u := units(snap.Get(key), 300); lone(u) {
			fixed, changed = fixed.Set(key, jsonUnits(u)), true
		}
	}
	if items, ok := snap.Get("amenities").Array(); ok {
		var parts []string
		anyLone := false
		for _, it := range items {
			s, ok := it.Str()
			if !ok || len(parts) == 12 {
				continue
			}
			u := utf16.Encode([]rune(s))
			if len(u) > 60 {
				u = u[:60]
			}
			anyLone = anyLone || lone(u)
			parts = append(parts, string(jsonUnits(u)))
		}
		if anyLone {
			fixed, changed = fixed.Set("amenities", json.RawMessage("["+strings.Join(parts, ",")+"]")), true
		}
	}
	if changed {
		out.snapshot = fixed
	}
	return out
}

var (
	controlChars = regexp.MustCompile(`\p{Cc}`)
	spaceRuns    = js.Regexp(`\s+`, "")
)

// units is the TypeScript text() in UTF-16 units: controls to spaces, white-space runs to one
// space, trimmed, cut to max units. nil when the value is not a string.
func units(v js.Value, max int) []uint16 {
	s, ok := v.Str()
	if !ok {
		return nil
	}
	u := utf16.Encode([]rune(js.Trim(spaceRuns.ReplaceAllString(controlChars.ReplaceAllString(s, " "), " "))))
	if len(u) > max {
		u = u[:max]
	}
	return u
}

// lone reports whether a cut left the high half of a pair at the end. A cut from the start
// can strand nothing else.
func lone(u []uint16) bool {
	return len(u) > 0 && u[len(u)-1] >= 0xd800 && u[len(u)-1] <= 0xdbff
}

// jsonUnits is JSON.stringify of a UTF-16 string, a lone surrogate written as \udXXX.
func jsonUnits(u []uint16) json.RawMessage {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(u); i++ {
		c := u[i]
		switch {
		case c >= 0xd800 && c <= 0xdbff && i+1 < len(u) && u[i+1] >= 0xdc00 && u[i+1] <= 0xdfff:
			b.WriteRune(utf16.DecodeRune(rune(c), rune(u[i+1])))
			i++
		case c >= 0xd800 && c <= 0xdfff:
			fmt.Fprintf(&b, `\u%04x`, c)
		default:
			s, _ := js.Marshal(string(rune(c)))
			b.Write(s[1 : len(s)-1])
		}
	}
	b.WriteByte('"')
	return json.RawMessage(b.String())
}
