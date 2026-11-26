//go:build difftest && difftest_trips

package difftest

import (
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentitinerary"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-itinerary"] = api.Port{Gate: api.GateUser, Fn: agentitinerary.Func}
}

func TestAgentItinerary(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := tripsOther(deno, goW)
	const fn = "agent-itinerary"
	dates := js.O("start_date", "2027-03-01", "end_date", "2027-03-03")

	// trip makes a dated trip of w's with an itinerary of the given days and activities (on
	// day 1); days == nil means no itinerary at all.
	trip := func(cols js.Ordered, days []string, acts ...string) func(*testing.T, *World) {
		return func(t *testing.T, w *World) {
			id := tripsNewTrip(t, w, w, "trip", append(js.O("start_date", "2027-03-01", "end_date", "2027-03-03"), cols...))
			w.Vars["trip"] = id
			if days != nil {
				tripsNewItinerary(t, w, id, days, acts)
			}
		}
	}
	threeDays := []string{"2027-03-01", "2027-03-02", "2027-03-03"}
	// theirs: the trip and itinerary belong to the other world's advisor.
	theirs := func(t *testing.T, w *World) {
		id := tripsNewTrip(t, w, other(w), "trip", dates)
		w.Vars["trip"] = id
		tripsNewItinerary(t, w, id, threeDays, []string{"Breakfast"})
	}
	// foreignDay: my trip with an itinerary, and a second trip of mine whose day and activity
	// are named instead.
	foreignDay := func(t *testing.T, w *World) {
		side := tripsNewTrip(t, w, w, "sidetrip", dates)
		tripsNewItinerary(t, w, side, []string{"2027-03-01"}, []string{"Elsewhere"})
		w.Vars["sideday"], w.Vars["sideact"] = w.Vars["day1"], w.Vars["act1"]
		w.ID("sideday", w.Vars["day1"])
		w.ID("sideact", w.Vars["act1"])
		trip(nil, threeDays, "Breakfast", "Swim")(t, w)
	}
	generateFixture := func(t *testing.T, w *World) {
		trip(nil, nil)(t, w)
		id := w.Vars["trip"]
		tripsNewComponent(t, w, id, "c1", js.O("kind", "flight", "display_name", "AA 100", "start_date", "2027-03-01", "start_time", "07:15", "location", "MIA"))
		tripsNewComponent(t, w, id, "c2", js.O("display_name", "Reef snorkel", "start_date", "2027-03-02", "start_time", "14:00", "confirmation_number", "RS-1"))
		tripsNewComponent(t, w, id, "c3", js.O("display_name", "A dinner", "kind", "custom", "start_date", "2027-03-02"))
		tripsNewComponent(t, w, id, "c4", js.O("kind", "insurance", "display_name", "Cover", "start_date", "2027-03-01"))
		tripsNewComponent(t, w, id, "c5", js.O("display_name", "Gone", "start_date", "2027-03-01", "archived_at", "2026-01-01T00:00:00Z"))
		tripsNewComponent(t, w, id, "c6", js.O("display_name", "Later", "start_date", "2027-04-01"))
	}
	snap := func(t *testing.T, w *World) string { return tripsItinerary(t, w.Vars["trip"]) }
	c := func(name string, setup func(*testing.T, *World), b string, expect int) Case {
		cs := Case{Name: name, Fn: fn, Setup: setup, Body: func(w *World) string { return tripsFill(w, b) }, Expect: expect}
		if setup != nil {
			cs.Snap = snap
		}
		return cs
	}
	const h = `"tripId":"{trip}"`
	long := strings.Repeat("x", 121)

	Run(t, deno, goW, tripsWithAudit([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: func(*World) string { return `{}` }, Expect: 403},
		c("not json", nil, `[]`, 400),
		c("no op", nil, `{"tripId":"`+tripsSeedTrip+`"}`, 400),
		c("an unknown op", nil, `{"op":"publish","tripId":"`+tripsSeedTrip+`"}`, 400),
		c("no trip id", nil, `{"op":"generate"}`, 400),
		c("bad trip id", nil, `{"op":"reorder","tripId":"abc"}`, 400),

		// generate
		{Name: "generate: no such trip", Fn: fn, Body: func(*World) string { return `{"op":"generate","tripId":"` + uuid.New() + `"}` }, Expect: 404},
		c("generate: the seed advisor's trip", nil, `{"op":"generate","tripId":"`+tripsSeedTrip+`"}`, 404),
		c("generate: the other world's trip", theirs, `{"op":"generate",`+h+`}`, 404),
		c("generate: archived", trip(js.O("archived_at", "2026-01-01T00:00:00Z"), nil), `{"op":"generate",`+h+`}`, 404),
		c("generate: no dates", trip(js.O("start_date", nil, "end_date", nil), nil), `{"op":"generate",`+h+`}`, 200),
		c("generate", generateFixture, `{"op":"generate",`+h+`}`, 200),
		c("generate: nothing to add", trip(nil, threeDays), `{"op":"generate",`+h+`}`, 200),

		// day_upsert
		c("day: bad day id", trip(nil, nil), `{"op":"day_upsert",`+h+`,"dayId":"d1"}`, 400),
		c("day: create without a date", trip(nil, nil), `{"op":"day_upsert",`+h+`,"label":"Arrival"}`, 400),
		c("day: a date of the wrong shape", trip(nil, nil), `{"op":"day_upsert",`+h+`,"date":"03/01/2027"}`, 400),
		c("day: label not text", trip(nil, nil), `{"op":"day_upsert",`+h+`,"date":"2027-03-01","label":[]}`, 400),
		c("day: label too long", trip(nil, nil), `{"op":"day_upsert",`+h+`,"date":"2027-03-01","label":"`+long+`"}`, 400),
		c("day: an impossible date", trip(nil, nil), `{"op":"day_upsert",`+h+`,"date":"2027-02-30"}`, 500),
		c("day: create", trip(nil, nil), `{"op":"day_upsert",`+h+`,"date":"2027-03-02","label":"  Reef day ","summary":""}`, 200),
		c("day: create before the trip starts", trip(nil, threeDays), `{"op":"day_upsert",`+h+`,"date":"2027-02-27"}`, 200),
		c("day: update", trip(nil, threeDays), `{"op":"day_upsert",`+h+`,"dayId":"{day2}","label":"Rest","summary":"Nothing planned."}`, 200),
		c("day: noop", trip(nil, threeDays), `{"op":"day_upsert",`+h+`,"dayId":"{day1}","date":"2027-03-01","label":" "}`, 200),
		c("day: another itinerary's day", foreignDay, `{"op":"day_upsert",`+h+`,"dayId":"{sideday}","label":"x"}`, 404),
		c("day: the other world's trip", theirs, `{"op":"day_upsert",`+h+`,"dayId":"{day1}","label":"x"}`, 404),

		// activity_upsert
		c("activity: bad activity id", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"activityId":"a"}`, 400),
		c("activity: no title", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":"  "}`, 400),
		c("activity: bad block", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":"x","block":"noon"}`, 400),
		c("activity: bad time", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":"x","startTime":"25:00"}`, 400),
		c("activity: phone too long", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":"x","phone":"`+long+`"}`, 400),
		c("activity: create without a day", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"title":"Swim"}`, 404),
		c("activity: create", trip(nil, threeDays, "Breakfast"), `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":" Swim ",`+
			`"startTime":"15:05","endTime":"16:00:30","body":"Bring fins","location":"Reef","address":"1 Beach Rd","phone":"555-0100",`+
			`"confirmationNumber":"C-9","gyasisTip":"Go early."}`, 200),
		c("activity: create, block from the time", trip(nil, threeDays), `{"op":"activity_upsert",`+h+`,"dayId":"{day2}","title":"Dinner","startTime":"19:30"}`, 200),
		c("activity: update", trip(nil, threeDays, "Breakfast"), `{"op":"activity_upsert",`+h+`,"activityId":"{act1}","title":"Late breakfast","block":"all_day"}`, 200),
		c("activity: move to another day", trip(nil, threeDays, "Breakfast"), `{"op":"activity_upsert",`+h+`,"activityId":"{act1}","dayId":"{day3}","title":"Breakfast","block":"morning"}`, 200),
		c("activity: noop", trip(nil, threeDays, "Breakfast"), `{"op":"activity_upsert",`+h+`,"activityId":"{act1}","title":"Breakfast","block":"morning","body":""}`, 200),
		c("activity: another itinerary's day", foreignDay, `{"op":"activity_upsert",`+h+`,"dayId":"{sideday}","title":"x"}`, 404),
		c("activity: another itinerary's activity", foreignDay, `{"op":"activity_upsert",`+h+`,"activityId":"{sideact}","title":"x"}`, 404),
		c("activity: the other world's trip", theirs, `{"op":"activity_upsert",`+h+`,"dayId":"{day1}","title":"x"}`, 404),

		// activity_delete
		c("delete: no activity id", trip(nil, threeDays, "Breakfast"), `{"op":"activity_delete",`+h+`}`, 400),
		c("delete", trip(nil, threeDays, "Breakfast", "Swim"), `{"op":"activity_delete",`+h+`,"activityId":"{act1}"}`, 200),
		c("delete: no such activity", trip(nil, threeDays, "Breakfast"), `{"op":"activity_delete",`+h+`,"activityId":"`+tripsSeedTrip+`"}`, 404),
		c("delete: no itinerary", trip(nil, nil), `{"op":"activity_delete",`+h+`,"activityId":"`+tripsSeedTrip+`"}`, 404),
		c("delete: another itinerary's activity", foreignDay, `{"op":"activity_delete",`+h+`,"activityId":"{sideact}"}`, 404),
		c("delete: the other world's trip", theirs, `{"op":"activity_delete",`+h+`,"activityId":"{act1}"}`, 404),

		// reorder
		c("reorder: bad day id", trip(nil, threeDays), `{"op":"reorder",`+h+`,"dayId":null}`, 400),
		c("reorder: no list", trip(nil, threeDays), `{"op":"reorder",`+h+`,"dayId":"{day1}"}`, 400),
		c("reorder: an empty list", trip(nil, threeDays), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":[]}`, 400),
		c("reorder: a bad id", trip(nil, threeDays, "A"), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act1}","x"]}`, 400),
		c("reorder: twice", trip(nil, threeDays, "A", "B"), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act1}","{act1}"]}`, 400),
		c("reorder: part of the day", trip(nil, threeDays, "A", "B", "C"), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act2}","{act1}"]}`, 409),
		c("reorder", trip(nil, threeDays, "A", "B", "C"), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act3}","{act1}","{act2}"]}`, 200),
		c("reorder: unchanged", trip(nil, threeDays, "A", "B"), `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act1}","{act2}"]}`, 200),
		c("reorder: a foreign id in the list", foreignDay, `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act2}","{sideact}"]}`, 200),
		c("reorder: another itinerary's day", foreignDay, `{"op":"reorder",`+h+`,"dayId":"{sideday}","activityIds":["{sideact}"]}`, 404),
		c("reorder: no itinerary", trip(nil, nil), `{"op":"reorder",`+h+`,"dayId":"`+tripsSeedTrip+`","activityIds":["`+tripsSeedTrip+`"]}`, 404),
		c("reorder: the other world's trip", theirs, `{"op":"reorder",`+h+`,"dayId":"{day1}","activityIds":["{act1}"]}`, 404),
	}))
}
