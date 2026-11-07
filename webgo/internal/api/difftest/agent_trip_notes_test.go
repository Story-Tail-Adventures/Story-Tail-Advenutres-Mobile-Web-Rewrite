//go:build difftest && difftest_trips

package difftest

import (
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttripnotes"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-trip-notes"] = api.Port{Gate: api.GateUser, Fn: agenttripnotes.Func}
}

func TestAgentTripNotes(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := tripsOther(deno, goW)

	mine := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { w.Vars["trip"] = tripsNewTrip(t, w, w, "trip", cols) }
	}
	theirs := func(t *testing.T, w *World) { w.Vars["trip"] = tripsNewTrip(t, w, other(w), "othertrip", nil) }
	body := func(rest string) func(w *World) string {
		return func(w *World) string { return `{"tripId":"` + w.Vars["trip"] + `"` + rest + `}` }
	}
	snap := func(t *testing.T, w *World) string { return tripsRow(t, w.Vars["trip"]) }
	fixed := func(s string) func(*World) string { return func(*World) string { return s } }

	Run(t, deno, goW, tripsWithAudit([]Case{
		{Name: "GET", Fn: "agent-trip-notes", Method: "GET", Expect: 400},
		{Name: "traveler", Fn: "agent-trip-notes", Token: func(w *World) string { return w.Traveler.Token },
			Body: fixed(`{}`), Expect: 403},
		{Name: "not json", Fn: "agent-trip-notes", Body: fixed(`notes`), Expect: 400},
		{Name: "an array", Fn: "agent-trip-notes", Body: fixed(`[1]`), Expect: 400},
		{Name: "no trip id", Fn: "agent-trip-notes", Body: fixed(`{"notes":"x","expectedVersion":1}`), Expect: 400},
		{Name: "bad trip id", Fn: "agent-trip-notes", Body: fixed(`{"tripId":"banana","notes":"x","expectedVersion":1}`), Expect: 400},
		{Name: "notes not text", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"notes":7,"expectedVersion":3`), Snap: snap, Expect: 400},
		{Name: "notes missing", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"expectedVersion":3`), Snap: snap, Expect: 400},
		{Name: "version missing", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"notes":"x"`), Snap: snap, Expect: 400},
		{Name: "version zero", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"notes":"x","expectedVersion":0`), Snap: snap, Expect: 400},
		{Name: "version past int4", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"notes":"x","expectedVersion":2147483648`), Snap: snap, Expect: 400},
		{Name: "no such trip", Fn: "agent-trip-notes", Body: func(*World) string {
			return `{"tripId":"` + uuid.New() + `","notes":"x","expectedVersion":1}`
		}, Expect: 404},
		{Name: "the seed advisor's trip", Fn: "agent-trip-notes",
			Body: fixed(`{"tripId":"` + tripsSeedTrip + `","notes":"x","expectedVersion":1}`), Expect: 404},
		{Name: "the other world's trip", Fn: "agent-trip-notes", Setup: theirs, Body: body(`,"notes":"x","expectedVersion":3`), Snap: snap, Expect: 404},
		{Name: "an archived trip", Fn: "agent-trip-notes", Setup: mine(js.O("archived_at", "2026-01-01T00:00:00Z")),
			Body: body(`,"notes":"x","expectedVersion":3`), Snap: snap, Expect: 404},
		{Name: "stale", Fn: "agent-trip-notes", Setup: mine(js.O("notes", "old")), Body: body(`,"notes":"new","expectedVersion":2`), Snap: snap, Expect: 409},
		{Name: "noop", Fn: "agent-trip-notes", Setup: mine(js.O("notes", "same")), Body: body(`,"notes":"same","expectedVersion":3`), Snap: snap, Expect: 200},
		{Name: "empty over null", Fn: "agent-trip-notes", Setup: mine(nil), Body: body(`,"notes":"","expectedVersion":3`), Snap: snap, Expect: 200},
		{Name: "changed", Fn: "agent-trip-notes", Setup: mine(js.O("notes", "old")),
			Body: body(`,"notes":"Window seat, ` + "\U000000e9t\U000000e9" + ` \"quoted\"","expectedVersion":3,"extra":true`), Snap: snap, Expect: 200},
		{Name: "cleared", Fn: "agent-trip-notes", Setup: mine(js.O("notes", "old")), Body: body(`,"notes":"","expectedVersion":3`), Snap: snap, Expect: 200},
	}))
}
