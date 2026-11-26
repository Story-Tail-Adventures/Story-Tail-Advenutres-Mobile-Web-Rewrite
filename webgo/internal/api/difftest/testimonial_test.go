//go:build difftest && difftest_traveler

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/testimonial"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["testimonial"] = api.Port{Gate: api.GateUser, Fn: testimonial.Func}
}

// travReflections is every testimonial row the traveler owns, oldest first.
func travReflections(t *testing.T, w *World) string {
	return S.Rows(t, S.DB.From("testimonial").
		Select("id,client_id,trip_id,agent_id,body,attribution,rating,status,submitted_at,approved_at,"+
			"approved_by_user_id,published_at,created_at,updated_at").
		Eq("client_id", w.Traveler.ClientID).Order("created_at", true))
}

func TestTestimonial(t *testing.T) {
	deno, goW := travWorlds(t)
	agent := func(w *World) string { return w.Agent.Token }

	// reflect builds a body from the fields given; "$name" strings are w.Vars values, and
	// "new:<label>" mints a fresh id labelled <label> and keeps it in w.Vars[label].
	reflect := func(kv ...any) func(w *World) string {
		return func(w *World) string {
			o := js.O()
			for i := 0; i+1 < len(kv); i += 2 {
				v := kv[i+1]
				if s, ok := v.(string); ok {
					switch {
					case strings.HasPrefix(s, "$"):
						v = w.Vars[s[1:]]
					case strings.HasPrefix(s, "new:"):
						label := s[len("new:"):]
						w.Vars[label] = w.ID(label, uuid.New())
						v = w.Vars[label]
					}
				}
				o = o.Set(kv[i].(string), v)
			}
			b, _ := js.Marshal(o)
			return string(b)
		}
	}
	trip := func(label string, cols js.Ordered) func(*testing.T, *World) {
		return func(t *testing.T, w *World) { w.Vars["trip"] = travTrip(t, w, w.Traveler.ClientID, label, cols) }
	}
	staleID := func(label string) func(*World) string {
		return func(w *World) string {
			w.Vars[label] = w.ID(label, uuid.NewAt(time.Now().Add(-2*time.Hour)))
			return w.Vars[label]
		}
	}
	snap := func(t *testing.T, w *World) string { return travReflections(t, w) }

	cases := []Case{
		{Name: "GET", Method: "GET", Body: reflect("testimonialId", "new:t", "body", "Rested."), Expect: 400},
		{Name: "an advisor", Token: agent, Body: reflect("testimonialId", "new:t", "body", "Rested."), Expect: 403},
		{Name: "not JSON", Body: travFixed(`{`), Expect: 400},
		{Name: "a string", Body: travFixed(`"hi"`), Expect: 400},
		{Name: "no testimonialId", Body: reflect("body", "Rested."), Expect: 400},
		{Name: "an empty testimonialId", Body: reflect("testimonialId", "", "body", "Rested."), Expect: 400},
		{Name: "not a uuid", Body: reflect("testimonialId", "draft-1", "body", "Rested."), Expect: 400},
		{Name: "no body", Body: reflect("testimonialId", "new:t"), Expect: 400},
		{Name: "a blank body", Body: reflect("testimonialId", "new:t", "body", " \n "), Expect: 400},
		{Name: "a long body", Body: reflect("testimonialId", "new:t", "body", strings.Repeat("a", 4001)), Expect: 400},
		{Name: "a long attribution", Body: reflect("testimonialId", "new:t", "body", "Rested.",
			"attribution", strings.Repeat("\U0001F600", 61)), Expect: 400},
		{Name: "rating 6", Body: reflect("testimonialId", "new:t", "body", "Rested.", "rating", 6), Expect: 400},
		{Name: "rating 2.5", Body: reflect("testimonialId", "new:t", "body", "Rested.", "rating", 2.5), Expect: 400},
		{Name: "rating words", Body: reflect("testimonialId", "new:t", "body", "Rested.", "rating", "five"), Expect: 400},
		{Name: "tripId not a uuid", Body: reflect("testimonialId", "new:t", "body", "Rested.", "tripId", "x"), Expect: 400},
		{Name: "another traveler's trip", Setup: func(t *testing.T, w *World) {
			w.Vars["trip"] = travTrip(t, w, travOther(w), "other.trip", nil)
		}, Body: reflect("testimonialId", "new:t", "body", "Rested.", "tripId", "$trip"), Snap: snap, Expect: 404},
		{Name: "an archived trip of theirs", Setup: trip("trip.archived", js.O("archived_at", "2026-01-01T00:00:00Z")),
			Body: reflect("testimonialId", "new:t", "body", "Rested.", "tripId", "$trip"), Snap: snap, Expect: 404},
		// A new row needs a recent v7; the shape check alone let these through.
		{Name: "a new reflection with a stale id", Body: func(w *World) string {
			return travJSON("testimonialId", staleID("t")(w), "body", "Rested.")
		}, Snap: snap, Expect: 400},
		{Name: "a new reflection with a v4 id", Body: reflect("testimonialId", "0195a2c0-1a00-4000-8000-0000000000f0",
			"body", "Rested."), Snap: snap, Expect: 400},

		// On a trip: found by the trip, not by the id the device carries.
		{Name: "a draft on a trip", Setup: trip("trip", js.O("status", "completed")),
			Body: reflect("testimonialId", "new:t1", "tripId", "$trip", "body", "  The quiet mornings <3 & the sea.  ",
				"rating", 5), Snap: snap, Expect: 200},
		{Name: "the same trip with a forgotten, stale id edits the draft", Body: func(w *World) string {
			return travJSON("testimonialId", staleID("forgotten")(w), "tripId", w.Vars["trip"], "body", "Second thoughts.",
				"attribution", "  The Hayes family ", "rating", "4", "submit", "true")
		}, Snap: snap, Expect: 200},
		{Name: "submitted", Body: reflect("testimonialId", "$t1", "tripId", "$trip", "body", "Final words.", "rating", true,
			"submit", true), Snap: snap, Expect: 200},
		{Name: "frozen once submitted", Body: reflect("testimonialId", "$t1", "tripId", "$trip", "body", "Changed my mind."),
			Snap: snap, Expect: 403},
		{Name: "an approved reflection is the advisor's", Setup: func(t *testing.T, w *World) {
			trip("trip.approved", nil)(t, w)
			id := w.ID("t.approved", uuid.New())
			travMust(t, S.DB.From("testimonial").Insert(t.Context(), js.O("id", id, "client_id", w.Traveler.ClientID,
				"trip_id", w.Vars["trip"], "agent_id", w.Agent.AgentID, "body", "Approved words", "status", "approved",
				"submitted_at", "2026-10-01T00:00:00Z", "approved_at", "2026-10-02T00:00:00Z",
				"approved_by_user_id", w.Agent.PlatformUserID), nil))
		}, Body: reflect("testimonialId", "new:t", "tripId", "$trip", "body", "Sneaky edit"), Snap: snap, Expect: 403},

		// With no trip: keyed by id, and the advisor comes off the client record.
		{Name: "a reflection about no trip", Body: reflect("testimonialId", "new:t2", "body", "Just grateful.",
			"rating", []int{3}, "attribution", "   "), Snap: snap, Expect: 200},
		{Name: "editing it by id, tripId null", Body: reflect("testimonialId", "$t2", "tripId", nil, "body", "Still grateful."),
			Snap: snap, Expect: 200},
		{Name: "an upper-case id edits the same row", Body: func(w *World) string {
			return travJSON("testimonialId", strings.ToUpper(w.Vars["t2"]), "body", "Loudly grateful.", "submit", true)
		}, Snap: snap, Expect: 200},
		// tripId "" is falsy, so it reads as tripless, yet the write sends trip_id "" and
		// Postgres refuses it.
		{Name: "an empty tripId", Body: reflect("testimonialId", "new:t3", "tripId", "", "body", "Hmm."), Snap: snap, Expect: 500},

		// A DENO FLAW, KEPT: the lookup is scoped to the caller, but the upsert is on id alone,
		// so a recent id of ANOTHER traveler's reflection is "not found", passes the recency
		// check, and the upsert moves that row to the caller. Pinned so the port's parity is
		// on the record; fixing it is a change to both.
		{Name: "another traveler's recent reflection id", Setup: func(t *testing.T, w *World) {
			id := w.ID("t.other", uuid.New())
			w.Vars["t.other"] = id
			travMust(t, S.DB.From("testimonial").Insert(t.Context(), js.O("id", id, "client_id", travOther(w),
				"agent_id", w.Agent.AgentID, "body", "Their words", "status", "draft"), nil))
		}, Body: reflect("testimonialId", "$t.other", "body", "Mine now."), Snap: func(t *testing.T, w *World) string {
			return S.Rows(t, S.DB.From("testimonial").Select("id,client_id,trip_id,body,status").Eq("id", w.Vars["t.other"]))
		}, Expect: 200},
	}
	Run(t, deno, goW, travWithAudit("testimonial", cases))
}
