//go:build difftest && difftest_trips

package difftest

import (
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttripstatus"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-trip-status"] = api.Port{Gate: api.GateUser, Fn: agenttripstatus.Func}
}

// tripsFill replaces {key} in s by w.Vars[key].
func tripsFill(w *World, s string) string {
	for k, v := range w.Vars {
		s = strings.ReplaceAll(s, "{"+k+"}", v)
	}
	return s
}

func TestAgentTripStatus(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := tripsOther(deno, goW)
	const fn = "agent-trip-status"

	// snap reads back every trip named in Vars["trips"] (or Vars["trip"]), its history rows
	// and its commission lines.
	snap := func(t *testing.T, w *World) string {
		ids := strings.Split(w.Vars["trips"], ",")
		if w.Vars["trips"] == "" {
			ids = []string{w.Vars["trip"]}
		}
		var b strings.Builder
		for _, id := range ids {
			b.WriteString(tripsRow(t, id))
			b.WriteString(S.Rows(t, S.DB.From("trip_status_history").Select("trip_id,from_status,to_status,changed_by_user_id").Eq("trip_id", id)))
			b.WriteString(S.Rows(t, S.DB.From("commission").Select("id,status,version,updated_at,on_record_at").Eq("trip_id", id).
				Order("status", true).Order("version", true).Order("expected_commission_cents", true)))
		}
		return b.String()
	}

	mine := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			w.Vars["trips"] = ""
			w.Vars["trip"] = tripsNewTrip(t, w, w, "trip", cols)
		}
	}
	cancelled := js.O("status", "cancelled", "cancellation_reason", "Storm", "refund_status", "none_expected")
	// withLines: a trip with three lines: one to close, one the dialog saw at an old version,
	// one already lost.
	withLines := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			w.Vars["trips"] = ""
			id := tripsNewTrip(t, w, w, "trip", cols)
			w.Vars["trip"] = id
			w.Vars["line1"] = tripsNewLine(t, w, w, id, "line1", nil)
			w.Vars["line2"] = tripsNewLine(t, w, w, id, "line2", js.O("gross_booking_cents", 200000, "expected_commission_cents", 20000))
			w.Vars["line3"] = tripsNewLine(t, w, w, id, "line3", js.O("status", "lost", "gross_booking_cents", 300000, "expected_commission_cents", 30000))
		}
	}
	theirs := func(t *testing.T, w *World) {
		w.Vars["trips"] = ""
		o := other(w)
		id := tripsNewTrip(t, w, o, "othertrip", nil)
		w.Vars["trip"] = id
		w.Vars["line1"] = tripsNewLine(t, w, o, id, "otherline", nil)
	}
	body := func(s string) func(w *World) string { return func(w *World) string { return tripsFill(w, s) } }
	c := func(name string, setup func(*testing.T, *World), b string, expect int) Case {
		cs := Case{Name: name, Fn: fn, Setup: setup, Body: body(b), Expect: expect}
		if setup != nil {
			cs.Snap = snap
		}
		return cs
	}

	const head = `{"tripId":"{trip}","expectedVersion":3,`
	lines := `"closeCommission":[{"id":"{line1}","version":1},{"id":"{line2}","version":2},{"id":"{line3}","version":1}]`
	Run(t, deno, goW, tripsWithAudit([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: body(`{}`), Expect: 403},
		c("not json", nil, `{`, 400),
		c("op is case-sensitive", nil, `{"op":"BULK","trips":[]}`, 400),
		c("no trip id", nil, `{"status":"booked","expectedVersion":1}`, 400),
		c("bad status", mine(nil), head+`"status":"traveling"}`, 400),
		c("no version", mine(nil), `{"tripId":"{trip}","status":"booked"}`, 400),
		c("version a string", mine(nil), `{"tripId":"{trip}","status":"booked","expectedVersion":"3"}`, 400),
		c("cancel without a reason", mine(nil), head+`"status":"cancelled"}`, 400),
		c("cancel with a blank reason", mine(nil), head+`"status":"cancelled","cancellationReason":"   "}`, 400),
		c("reason null on a move", mine(nil), head+`"status":"booked","cancellationReason":null}`, 400),
		c("reason a number on a move", mine(nil), head+`"status":"booked","cancellationReason":4}`, 400),
		c("bad refund status", mine(nil), head+`"status":"cancelled","cancellationReason":"r","refundStatus":"some"}`, 400),
		c("refund detail a number", mine(nil), head+`"status":"cancelled","cancellationReason":"r","refundDetail":1}`, 400),
		c("refund on a move", mine(nil), head+`"status":"booked","refundStatus":"full"}`, 400),
		c("close lines not a list", mine(nil), head+`"status":"cancelled","cancellationReason":"r","closeCommission":"all"}`, 400),
		c("close line bad id", mine(nil), head+`"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"x","version":1}]}`, 400),
		c("close line bad version", withLines(nil), head+`"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"{line1}","version":0}]}`, 400),
		c("close line twice", withLines(nil), head+`"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"{line1}","version":1},{"id":"{line1}","version":1}]}`, 400),
		c("close lines on a move", withLines(nil), head+`"status":"booked","closeCommission":[{"id":"{line1}","version":1}]}`, 400),

		{Name: "no such trip", Fn: fn, Body: func(*World) string {
			return `{"tripId":"` + uuid.New() + `","status":"booked","expectedVersion":1}`
		}, Expect: 404},
		c("the seed advisor's trip", nil, `{"tripId":"`+tripsSeedTrip+`","status":"booked","expectedVersion":1}`, 404),
		c("the other world's trip", theirs, head+`"status":"booked"}`, 404),
		c("the other world's trip with lines", theirs, head+`"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"{line1}","version":1}]}`, 404),
		c("an archived trip", mine(js.O("archived_at", "2026-01-01T00:00:00Z")), head+`"status":"booked"}`, 404),
		c("stale", mine(nil), `{"tripId":"{trip}","expectedVersion":2,"status":"booked"}`, 409),
		c("stale with lines", withLines(js.O("status", "booked")), `{"tripId":"{trip}","expectedVersion":2,"status":"cancelled","cancellationReason":"r",`+lines+`}`, 409),

		c("noop", mine(nil), head+`"status":"proposal"}`, 200),
		c("moved", mine(nil), head+`"status":"booked","extra":1}`, 200),
		c("cancelled", mine(js.O("status", "booked")),
			head+`"status":"cancelled","cancellationReason":"  Storm closed the port  ","refundStatus":"pending","refundDetail":"  Waiting on the resort  "}`, 200),
		c("cancelled with a blank refund detail", mine(js.O("status", "booked", "refund_detail", "kept")),
			head+`"status":"cancelled","cancellationReason":"Storm","refundDetail":"   "}`, 200),
		c("cancelled again, same reason", mine(cancelled), head+`"status":"cancelled","cancellationReason":" Storm "}`, 200),
		c("reason corrected", mine(cancelled), head+`"status":"cancelled","cancellationReason":"Hurricane"}`, 200),
		c("refund corrected", mine(cancelled), head+`"status":"cancelled","cancellationReason":"Storm","refundStatus":"full","refundDetail":"  "}`, 200),
		c("cancelled closing lines", withLines(js.O("status", "booked")),
			head+`"status":"cancelled","cancellationReason":"Storm",`+lines+`}`, 200),
		c("already cancelled, closing a line", withLines(cancelled),
			head+`"status":"cancelled","cancellationReason":"Storm","closeCommission":[{"id":"{line1}","version":1}]}`, 200),
		c("reason corrected, closing a line", withLines(cancelled),
			head+`"status":"cancelled","cancellationReason":"Flood","refundDetail":" Credit ","closeCommission":[{"id":"{line1}","version":1}]}`, 200),
		c("a line of another trip is skipped", func(t *testing.T, w *World) {
			id := tripsNewTrip(t, w, w, "trip", js.O("status", "booked"))
			side := tripsNewTrip(t, w, w, "sidetrip", nil)
			w.Vars["trip"], w.Vars["side"] = id, side
			w.Vars["line1"] = tripsNewLine(t, w, w, side, "sideline", nil)
			w.Vars["trips"] = id + "," + side
		}, head+`"status":"cancelled","cancellationReason":"Storm","closeCommission":[{"id":"{line1}","version":1}]}`, 200),
	}))

	// ---- bulk ----
	bulkMany := make([]string, 101)
	for i := range bulkMany {
		bulkMany[i] = `{"tripId":"` + tripsSeedTrip + `","fromStatus":"booked"}`
	}
	mixed := func(t *testing.T, w *World) {
		ids := []string{
			tripsNewTrip(t, w, w, "t1", js.O("status", "inquiry")),
			tripsNewTrip(t, w, w, "t2", js.O("status", "proposal")),
			tripsNewTrip(t, w, w, "t3", js.O("status", "booked")),
			tripsNewTrip(t, w, other(w), "t4", js.O("status", "proposal")),
			tripsNewTrip(t, w, w, "t5", js.O("status", "inquiry", "archived_at", "2026-01-01T00:00:00Z")),
		}
		for i, id := range ids {
			w.Vars["t"+string(rune('1'+i))] = id
		}
		w.Vars["trips"] = strings.Join(ids, ",")
	}
	two := func(t *testing.T, w *World) {
		ids := tripsSorted(2)
		tripsNewTrip(t, w, w, "t1", js.O("id", ids[0], "status", "inquiry"))
		tripsNewTrip(t, w, w, "t2", js.O("id", ids[1], "status", "proposal", "version", 9))
		w.Vars["t1"], w.Vars["t2"] = ids[0], ids[1]
		w.Vars["trips"] = strings.Join(ids, ",")
	}
	bulk := func(name string, setup func(*testing.T, *World), b string, expect int) Case {
		cs := c(name, setup, b, expect)
		return cs
	}
	Run(t, deno, goW, tripsWithAudit([]Case{
		bulk("bulk without trips", nil, `{"op":"bulk","status":"booked"}`, 400),
		bulk("bulk trips an object", nil, `{"op":"bulk","trips":{"a":1},"status":"booked"}`, 400),
		bulk("bulk empty", nil, `{"op":"bulk","trips":[],"status":"booked"}`, 400),
		bulk("bulk too many", nil, `{"op":"bulk","trips":[`+strings.Join(bulkMany, ",")+`],"status":"booked"}`, 400),
		bulk("bulk bad status", nil, `{"op":"bulk","trips":[1],"status":"qualified"}`, 400),
		bulk("bulk cancelled", nil, `{"op":"bulk","trips":[1],"status":"cancelled"}`, 400),
		bulk("bulk entry not an object", nil, `{"op":"bulk","trips":["x"],"status":"booked"}`, 400),
		bulk("bulk entry bad id", nil, `{"op":"bulk","trips":[{"tripId":"x","fromStatus":"inquiry"}],"status":"booked"}`, 400),
		bulk("bulk entry no from", nil, `{"op":"bulk","trips":[{"tripId":"`+tripsSeedTrip+`"}],"status":"booked"}`, 400),
		bulk("bulk mixed", mixed, `{"op":"bulk","status":"booked","trips":[`+
			`{"tripId":"{t1}","fromStatus":"inquiry"},{"tripId":"{t2}","fromStatus":"inquiry"},`+
			`{"tripId":"{t3}","fromStatus":"booked"},{"tripId":"{t4}","fromStatus":"proposal"},`+
			`{"tripId":"{t5}","fromStatus":"inquiry"},{"tripId":"`+tripsSeedTrip+`","fromStatus":"booked"}]}`, 200),
		bulk("bulk two moved", two, `{"op":"bulk","status":"completed","trips":[{"tripId":"{t2}","fromStatus":"proposal"},{"tripId":"{t1}","fromStatus":"inquiry"}]}`, 200),
		bulk("bulk nothing moved", two, `{"op":"bulk","status":"inquiry","trips":[{"tripId":"{t1}","fromStatus":"inquiry"},{"tripId":"{t2}","fromStatus":"booked"}]}`, 200),
	}))
}
