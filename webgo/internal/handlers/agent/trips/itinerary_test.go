package trips_test

import (
	"net/url"
	"strings"
	"testing"
)

const (
	dayA = "0195a2c0-1a00-7000-8000-0000000000d1"
	dayB = "0195a2c0-1a00-7000-8000-0000000000d2"
	actA = "0195a2c0-1a00-7000-8000-0000000000e1"
	actB = "0195a2c0-1a00-7000-8000-0000000000e2"
)

const itineraryMetaJSON = `[{"itinerary_id":"i","cover_image_url":null,"intro_note":null,"closing_note":null,"published_at":null}]`

// Day 1 holds two entries (the first from a booking), day 2 none and no date.
const itineraryDaysJSON = `[
 {"day_id":"` + dayA + `","day_number":1,"date":"2027-01-13","day_label":"Arrival","day_summary":"Land and rest.","activity_id":"` + actA + `","block":"afternoon","start_time":"15:00:00","end_time":"16:00:00","activity_title":"Check in","activity_body":null,"location":"Sandals Negril","address":"Norman Manley Blvd","phone":"+1 876","confirmation_number":"SN-1","gyasis_tip":"Ask for the sunset side.","component_id":"c-1"},
 {"day_id":"` + dayA + `","day_number":1,"date":"2027-01-13","day_label":"Arrival","day_summary":"Land and rest.","activity_id":"` + actB + `","block":null,"start_time":null,"end_time":null,"activity_title":"Sunset <sail>","activity_body":"Bring a jacket.","location":null,"address":null,"phone":null,"confirmation_number":null,"gyasis_tip":null,"component_id":null},
 {"day_id":"` + dayB + `","day_number":2,"date":null,"day_label":null,"day_summary":null,"activity_id":null}]`

func itineraryApp(t *testing.T) *app {
	a := detailApp(t)
	a.fake.read("agent_trip_itinerary_meta", itineraryMetaJSON)
	a.fake.read("agent_trip_itinerary_days", itineraryDaysJSON)
	return a
}

func itURL(q string) string { return "/agent/trips/" + tripID + "/itinerary" + q }

func TestItineraryPage(t *testing.T) {
	a := itineraryApp(t)
	rec := a.get(itURL(""))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Itinerary · Story-Tail Adventures</title>", `href="/agent/trips/`+tripID+`"`, "Back to the trip",
		"Jordan Hayes", "Anniversary &lt;Week&gt;", ">Draft<", "2 days · 2 entries", "Fill in from the trip",
		"Day 1", "Jan 13", "Arrival", "Land and rest.", "15:00 · afternoon · Sandals Negril", "Ask for the sunset side.",
		"Sunset &lt;sail&gt;", "Bring a jacket.", ">—<", "Day 2", "Nothing on this day yet.", "From a booking",
		`href="/agent/trips/`+tripID+`/itinerary?activity=`+actA+`"`, `href="/agent/trips/`+tripID+`/itinerary?day=`+dayA+`"`,
		`href="/agent/trips/`+tripID+`/itinerary?addTo=`+dayB+`"`, `href="/agent/trips/`+tripID+`/itinerary?addDay=1"`,
		" — Day 2", "Move up — Sunset &lt;sail&gt;", "Remove Check in — Removing an entry takes it off the itinerary.")
	// One booking chip, the two end buttons disabled, no form open, no receipt.
	body := rec.Body.String()
	if n := strings.Count(body, ">From a booking<"); n != 1 {
		t.Errorf("%d booking chips", n)
	}
	if n := strings.Count(body, `data-slot="up-btn" disabled=""`) + strings.Count(body, `data-slot="down-btn" disabled=""`); n != 2 {
		t.Errorf("%d end buttons disabled", n)
	}
	lacks(t, rec, `/itinerary/day"`, `/itinerary/activity"`, "Nothing written yet", "Filled in what was missing", `aria-current="true"`)

	// Published, and the empty itinerary.
	a.fake.read("agent_trip_itinerary_meta", `[{"itinerary_id":"i","cover_image_url":null,"intro_note":null,"closing_note":null,"published_at":"2026-09-01T00:00:00Z"}]`)
	has(t, a.get(itURL("")), ">Published<")
	a.fake.read("agent_trip_itinerary_meta", `[]`)
	a.fake.read("agent_trip_itinerary_days", `[]`)
	has(t, a.get(itURL("")), "Nothing written yet", "Fill it in from the trip to get the days laid out, then make it yours.", "0 days · 0 entries", ">Draft<")

	// Not there: 404. A bad id: 404 without a read. A failed read: the retry state.
	a.fake.read("agent_trip_overview", `[]`)
	if rec := a.get(itURL("")); rec.Code != 404 {
		t.Errorf("not found = %d", rec.Code)
	}
	if rec := a.get("/agent/trips/nope/itinerary"); rec.Code != 404 {
		t.Errorf("bad id = %d", rec.Code)
	}
	b := itineraryApp(t)
	b.fake.reads["agent_trip_itinerary_days"] = reply{500, `{}`}
	has(t, b.get(itURL("")), "That didn’t load", `href="/agent/trips/`+tripID+`/itinerary"`)
}

func TestItineraryForms(t *testing.T) {
	a := itineraryApp(t)

	rec := a.get(itURL("?activity=" + actA))
	has(t, rec, "Edit this entry", `action="/agent/trips/`+tripID+`/itinerary/activity"`, `name="activityId" value="`+actA+`"`,
		"Editing it here doesn&#39;t change the booking.", `value="Check in"`, `value="15:00"`, `value="16:00"`,
		`value="Sandals Negril"`, `value="Norman Manley Blvd"`, `value="+1 876"`, `value="SN-1"`, "Ask for the sunset side.</textarea>",
		`aria-current="true"`, "Day 1 · Jan 13", "Day 2</option>", "trp-it-act-editing")
	has(t, rec, `value="afternoon" data-slot="block-opt" selected=""`, `value="`+dayA+`" data-slot="day-opt" selected=""`)
	lacks(t, rec, `/itinerary/day"`)

	rec = a.get(itURL("?addTo=" + dayB))
	has(t, rec, "Add something", `/itinerary/activity"`)
	lacks(t, rec, `data-slot="af-id"`, `data-slot="af-from-booking"`, `aria-current="true"`)
	has(t, rec, `value="`+dayB+`" data-slot="day-opt" selected=""`, `value="" data-slot="block-opt" selected=""`)

	rec = a.get(itURL("?day=" + dayA))
	has(t, rec, "Edit this day", `name="dayId" value="`+dayA+`"`, `value="2027-01-13"`, `value="Arrival"`, "Land and rest.</textarea>", "trp-it-editing")
	lacks(t, rec, `/itinerary/activity"`)

	// The day after the last dated day; the first ?key in the page's order wins.
	has(t, a.get(itURL("?addDay=1")), "Add a day</h2>", `value="2027-01-14"`)
	has(t, a.get(itURL("?addTo=elsewhere&day="+dayA)), "Edit this day")
	lacks(t, a.get(itURL("?activity=gone&day="+dayA)), `/itinerary/day"`, `/itinerary/activity"`)
}

func TestItinerarySaveDay(t *testing.T) {
	a := itineraryApp(t)
	a.fake.fn("agent-itinerary", reply{200, `{}`})
	rec := a.post(itURL("/day"), url.Values{"date": {"2027-01-14"}, "label": {" Seven Mile "}, "summary": {""}})
	if rec.Code != 303 || rec.Header().Get("Location") != itURL("") {
		t.Fatalf("save = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	c := a.fake.calls("agent-itinerary")[0].body
	jsonEq(t, c, "op", `"day_upsert"`)
	jsonEq(t, c, "tripId", `"`+tripID+`"`)
	jsonEq(t, c, "date", `"2027-01-14"`)
	jsonEq(t, c, "label", `"Seven Mile"`)
	for _, k := range []string{"dayId", "summary"} {
		if _, sent := c[k]; sent {
			t.Errorf("empty %s was sent", k)
		}
	}

	// A new day needs a date: 422, the form open, nothing sent.
	rec = a.post(itURL("/day"), url.Values{"label": {"Beach"}})
	if rec.Code != 422 || len(a.fake.calls("agent-itinerary")) != 1 {
		t.Errorf("no date = %d", rec.Code)
	}
	has(t, rec, "A day needs a date.", `aria-describedby="day-date-error"`, `value="Beach"`, "Add a day</h2>")

	// An edit may leave the date out; the function's sentence, then an outage's.
	a.fake.fn("agent-itinerary", reply{422, `{"detail":"That day is already on the itinerary."}`}, reply{503, `{}`})
	rec = a.post(itURL("/day"), url.Values{"dayId": {dayA}, "summary": {"Slow\r\nday"}})
	has(t, rec, "That day is already on the itinerary.", "Edit this day", "Slow\nday</textarea>")
	jsonEq(t, a.fake.calls("agent-itinerary")[1].body, "summary", `"Slow\nday"`)
	has(t, a.post(itURL("/day"), url.Values{"dayId": {dayA}}), "That didn&#39;t save. Try again in a moment.")
}

func TestItinerarySaveActivity(t *testing.T) {
	a := itineraryApp(t)
	a.fake.fn("agent-itinerary", reply{200, `{}`})
	rec := a.post(itURL("/activity"), url.Values{"dayId": {dayB}, "title": {" Catamaran "}, "block": {"night"},
		"startTime": {"10:00"}, "body": {"Snorkel\r\nstop"}, "gyasisTip": {"Sit at the back."}, "confirmationNumber": {""}})
	if rec.Code != 303 || rec.Header().Get("Location") != itURL("") {
		t.Fatalf("save = %d", rec.Code)
	}
	c := a.fake.calls("agent-itinerary")[0].body
	jsonEq(t, c, "op", `"activity_upsert"`)
	jsonEq(t, c, "title", `"Catamaran"`)
	jsonEq(t, c, "dayId", `"`+dayB+`"`)
	jsonEq(t, c, "startTime", `"10:00"`)
	jsonEq(t, c, "body", `"Snorkel\nstop"`)
	jsonEq(t, c, "gyasisTip", `"Sit at the back."`)
	for _, k := range []string{"activityId", "block", "endTime", "location", "address", "phone", "confirmationNumber"} {
		if _, sent := c[k]; sent {
			t.Errorf("empty %s was sent", k)
		}
	}

	// No title: 422, nothing sent, the error tied to the field.
	rec = a.post(itURL("/activity"), url.Values{"dayId": {dayA}, "title": {"  "}, "location": {"Rick's Café"}})
	if rec.Code != 422 || len(a.fake.calls("agent-itinerary")) != 1 {
		t.Errorf("no title = %d", rec.Code)
	}
	has(t, rec, "Give it a name — it&#39;s the line the client reads.", `aria-describedby="act-title-error"`, `value="Rick&#39;s Café"`, "Add something")

	// A 409 is the stale sentence; an edit of a booked entry keeps its note on the way back.
	a.fake.fn("agent-itinerary", reply{409, `{"detail":"x"}`})
	rec = a.post(itURL("/activity"), url.Values{"activityId": {actA}, "dayId": {dayA}, "title": {"Check in late"}})
	if rec.Code != 409 {
		t.Errorf("stale = %d", rec.Code)
	}
	has(t, rec, "This day changed in another tab. Reload and try again.", `value="Check in late"`, "Edit this entry",
		"Editing it here doesn&#39;t change the booking.", `aria-current="true"`)
	a.fake.fn("agent-itinerary", reply{422, `{"detail":"That day is not on this trip."}`})
	has(t, a.post(itURL("/activity"), url.Values{"dayId": {"x"}, "title": {"A"}}), "That day is not on this trip.")
}

func TestItineraryDeleteAndMove(t *testing.T) {
	a := itineraryApp(t)
	a.fake.fn("agent-itinerary", reply{200, `{}`})
	if rec := a.post(itURL("/delete"), url.Values{"activityId": {actB}}); rec.Code != 303 || rec.Header().Get("Location") != itURL("") {
		t.Errorf("delete = %d", rec.Code)
	}
	jsonEq(t, a.fake.calls("agent-itinerary")[0].body, "op", `"activity_delete"`)
	jsonEq(t, a.fake.calls("agent-itinerary")[0].body, "activityId", `"`+actB+`"`)
	a.post(itURL("/delete"), url.Values{"activityId": {"not-an-id"}})
	if len(a.fake.calls("agent-itinerary")) != 1 {
		t.Error("a forged id was sent")
	}

	// Up on the second entry: the day's whole order, swapped.
	if rec := a.post(itURL("/move"), url.Values{"dayId": {dayA}, "activityId": {actB}, "direction": {"up"}}); rec.Code != 303 {
		t.Errorf("move = %d", rec.Code)
	}
	c := a.fake.calls("agent-itinerary")[1].body
	jsonEq(t, c, "op", `"reorder"`)
	jsonEq(t, c, "dayId", `"`+dayA+`"`)
	jsonEq(t, c, "activityIds", `["`+actB+`","`+actA+`"]`)

	// Off either end, another day, a made-up direction: back, nothing sent.
	for _, f := range []url.Values{
		{"dayId": {dayA}, "activityId": {actA}, "direction": {"up"}},
		{"dayId": {dayA}, "activityId": {actB}, "direction": {"down"}},
		{"dayId": {dayB}, "activityId": {actA}, "direction": {"down"}},
		{"dayId": {dayA}, "activityId": {actA}, "direction": {"sideways"}},
	} {
		if rec := a.post(itURL("/move"), f); rec.Code != 303 {
			t.Errorf("%v = %d", f, rec.Code)
		}
	}
	if len(a.fake.calls("agent-itinerary")) != 2 {
		t.Errorf("%d calls", len(a.fake.calls("agent-itinerary")))
	}
}

func TestItineraryGenerate(t *testing.T) {
	a := itineraryApp(t)
	a.fake.fn("agent-itinerary", reply{200, `{"outcome":"generated","days_added":3}`}, reply{200, `{"outcome":"noop"}`},
		reply{200, `{"outcome":"no_dates"}`}, reply{422, `{"detail":"This trip is cancelled."}`}, reply{503, `{}`})
	rec := a.post(itURL("/generate"), nil)
	if rec.Code != 303 || rec.Header().Get("Location") != itURL("?generated=some") {
		t.Errorf("generated = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	jsonEq(t, a.fake.calls("agent-itinerary")[0].body, "op", `"generate"`)
	has(t, a.get(itURL("?generated=some")), "Filled in what was missing.")
	if rec := a.post(itURL("/generate"), nil); rec.Header().Get("Location") != itURL("?generated=nothing") {
		t.Errorf("noop = %q", rec.Header().Get("Location"))
	}
	has(t, a.get(itURL("?generated=nothing")), "Already up to date — nothing to add.")
	rec = a.post(itURL("/generate"), nil)
	if rec.Code != 422 {
		t.Errorf("no dates = %d", rec.Code)
	}
	has(t, rec, "Give the trip a start and end date first, then this can lay out the days.")
	has(t, a.post(itURL("/generate"), nil), "This trip is cancelled.")
	has(t, a.post(itURL("/generate"), nil), "That didn&#39;t run. Try again in a moment.")
	lacks(t, a.get(itURL("?generated=%3Cb%3Ehi")), "Filled in", "Already up to date", "hi<")
}

func TestItineraryAccess(t *testing.T) {
	a := itineraryApp(t)
	a.fake.role = "admin"
	for _, p := range []string{"/generate", "/day", "/activity", "/delete", "/move"} {
		if rec := a.post(itURL(p), url.Values{"title": {"x"}, "date": {"2027-01-01"}}); rec.Code != 403 {
			t.Errorf("admin %s = %d", p, rec.Code)
		}
	}
	if len(a.fake.calls("agent-itinerary")) != 0 {
		t.Error("an admin's post reached the function")
	}
	b := itineraryApp(t)
	for _, p := range []string{"/generate", "/day", "/activity", "/delete", "/move"} {
		if rec := b.get(itURL(p)); rec.Code != 303 || rec.Header().Get("Location") != itURL("") {
			t.Errorf("GET %s = %d %q", p, rec.Code, rec.Header().Get("Location"))
		}
	}
	// The function's 401 sends the advisor to sign in, back to this page.
	b.fake.fn("agent-itinerary", reply{401, `{}`})
	if rec := b.post(itURL("/generate"), nil); rec.Header().Get("Location") != "/login?next="+url.QueryEscape(itURL("")) {
		t.Errorf("401 = %q", rec.Header().Get("Location"))
	}
}
