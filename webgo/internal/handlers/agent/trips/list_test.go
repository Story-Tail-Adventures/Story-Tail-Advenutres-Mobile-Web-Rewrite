package trips_test

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
)

const summaryJSON = `[{"inquiry_count":3,"proposal_count":2,"booked_count":5,"in_progress_count":1,"completed_count":13,"cancelled_count":2,"total_count":26,"pipeline_cents":"4820000","pipeline_currency":"USD"}]`

func rosterJSON(total int, rows ...string) string {
	return "[" + strings.Join(rows, ",") + "]"
}

func rosterRow(id, title, status string, total int, extra string) string {
	return fmt.Sprintf(`{"trip_id":%q,"title":%q,"client_id":"c-1","client_display_name":"Jordan Hayes",
		"trip_type":"all_inclusive","status":%q,"start_date":"2026-08-12","end_date":"2026-08-19",
		"destinations":["Negril","Montego Bay"],"traveler_count":2,"total_value_cents":"1284500",
		"total_paid_cents":"0","total_commission_cents":"0","currency":"USD","component_count":4,
		"last_activity_at":null,"version":3,"as_of_date":"2026-09-07","total_count":%d%s}`, id, title, status, total, extra)
}

func TestTripListRendersTheRoster(t *testing.T) {
	a := newApp(t)
	a.fake.read("agent_trip_roster", rosterJSON(2,
		rosterRow("t-1", "Sandals <honeymoon>", "booked", 2, ""),
		rosterRow("t-2", "Kyoto", "inquiry", 2, `,"start_date":null,"end_date":null,"destinations":[],"total_commission_cents":"128450","component_count":0`),
	))
	a.fake.read("agent_trip_roster_summary", summaryJSON)

	rec := a.get("/agent/trips")
	if rec.Code != 200 {
		t.Fatalf("status %d\n%s", rec.Code, rec.Body)
	}
	has(t, rec,
		"<title>Trips · Story-Tail Adventures</title>",
		" · Pipeline <strong", "$48,200",
		"Sandals &lt;honeymoon&gt;", // text, never markup
		`href="/agent/trips/t-1"`, `href="/agent/clients/c-1"`, "Jordan Hayes",
		"Negril +1 · 4", "Aug 12 – 19, 2026", "status-chip status-booked", ">Booked<",
		"$12,845", `value="t-1:booked"`, `aria-label="Select Kyoto"`,
		"No dates yet", "status-inquiry", ">Inquiry<", "$1,285",
		`aria-current="page"`, // the rail lights Trips
	)
	// The default four are not a selection, so no chip reads as ticked; counts show.
	lacks(t, rec, `checked=""`, "Roster pages", "That didn’t load", "Moved ")
	has(t, rec, ">13<", ">5<")

	// The read asked for the live four, the first page, no search.
	args := a.fake.lastRead(t, "agent_trip_roster")
	jsonEq(t, args, "p_status", `["inquiry","proposal","booked","in_progress"]`)
	jsonEq(t, args, "p_limit", `25`)
	jsonEq(t, args, "p_offset", `0`)
	jsonEq(t, args, "p_search", `null`)
	jsonEq(t, args, "p_client_id", `null`)
}

func TestTripListFiltersAndPages(t *testing.T) {
	a := newApp(t)
	rows := make([]string, 0, 2)
	for i := range 2 {
		rows = append(rows, rosterRow(fmt.Sprintf("t-%d", i), "Trip", "booked", 27, ""))
	}
	a.fake.read("agent_trip_roster", rosterJSON(27, rows...))
	a.fake.read("agent_trip_roster_summary", summaryJSON)

	rec := a.get("/agent/trips?status=booked&status=bogus&q=+Negril+&page=2")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	args := a.fake.lastRead(t, "agent_trip_roster")
	jsonEq(t, args, "p_status", `["booked"]`)
	jsonEq(t, args, "p_search", `"Negril"`)
	jsonEq(t, args, "p_offset", `25`)
	has(t, rec,
		`value="Negril"`,
		`value="booked" data-slot="stage-input" checked=""`,
		"26–27 of 27",
		`href="/agent/trips?status=booked&amp;q=Negril"`, // Previous keeps the filters, drops page 1
		`data-slot="pager-next-off"`,
	)
	// The bulk form remembers the list it was posted from.
	has(t, rec, `name="return" value="/agent/trips?status=booked&amp;q=Negril&amp;page=2"`)

	// A page that is not a positive integer is page 1, as parseInt reads it.
	a.get("/agent/trips?page=abc")
	jsonEq(t, a.fake.lastRead(t, "agent_trip_roster"), "p_offset", `0`)
	a.get("/agent/trips?page=3xyz")
	jsonEq(t, a.fake.lastRead(t, "agent_trip_roster"), "p_offset", `50`)
}

func TestTripListEmptyAndFailedStates(t *testing.T) {
	a := newApp(t)
	a.fake.read("agent_trip_roster", `[]`)
	a.fake.read("agent_trip_roster_summary", summaryJSON)
	has(t, a.get("/agent/trips"), "No trips yet", "The first one arrives when you build it")
	rec := a.get("/agent/trips?q=zzz")
	has(t, rec, "Nothing matches", "Try a different search, or a different stage.")
	lacks(t, rec, `data-repeat`, "Sandals")

	// A failed read is the retry state, not an empty book.
	a.fake.reads["agent_trip_roster_summary"] = reply{500, `{"code":"42501"}`}
	rec = a.get("/agent/trips?status=booked")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "That didn’t load", `href="/agent/trips?status=booked"`, "Message Gyasi")
	lacks(t, rec, "No trips yet", "Search trips")
}

func TestTripListShellDecisions(t *testing.T) {
	a := newApp(t)
	a.fake.role = "client"
	if rec := a.get("/agent/trips"); rec.Code != 303 || rec.Header().Get("Location") != "/dashboard" {
		t.Errorf("client = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	a.fake.role = "admin"
	rec := a.get("/agent/trips")
	has(t, rec, "You don’t have access to this view", "set up as an administrator")
	lacks(t, rec, "Search trips")
	if n := a.fake.readCount(); n != 0 {
		t.Errorf("an admin's page read the book (%d reads)", n)
	}

	// An advisor with no second factor finishes signing in first.
	a.fake.role, a.fake.aal, a.fake.hasFactor = "agent", "aal1", false
	if rec := a.get("/agent/trips"); rec.Code != 303 || rec.Header().Get("Location") != "/mfa/setup?next=%2Fagent" {
		t.Errorf("no factor = %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestBulkStageChange(t *testing.T) {
	a := newApp(t)
	a.fake.read("agent_trip_roster", rosterJSON(1, rosterRow("t-1", "Trip", "booked", 1, "")))
	a.fake.read("agent_trip_roster_summary", summaryJSON)
	back := "/agent/trips?status=booked&status=proposal&q=Negril"

	cases := []struct {
		name string
		form url.Values
		want string
	}{
		{"nothing ticked", url.Values{"return": {back}, "toStatus": {"booked"}}, "Tick at least one trip first."},
		{"no stage", url.Values{"return": {back}, "trip": {"t-1:proposal"}}, "Pick a stage first."},
		{"cancel refused", url.Values{"return": {back}, "trip": {"t-1:proposal"}, "toStatus": {"cancelled"}},
			"Cancelling a trip is one at a time — it needs a reason and the impact review."},
		{"malformed pick", url.Values{"return": {back}, "trip": {"t-1"}, "toStatus": {"booked"}},
			"That didn&#39;t save. Try again in a moment."},
	}
	for _, c := range cases {
		rec := a.post("/agent/trips", c.form)
		if rec.Code != 422 {
			t.Errorf("%s: status %d", c.name, rec.Code)
		}
		has(t, rec, c.want, "alert-error")
		// The list it re-renders is the one the form was posted from.
		jsonEq(t, a.fake.lastRead(t, "agent_trip_roster"), "p_search", `"Negril"`)
	}
	if n := len(a.fake.calls("agent-trip-status")); n != 0 {
		t.Fatalf("a refused form still called the function %d times", n)
	}

	a.fake.fn("agent-trip-status", reply{200, `{"movedCount":2,"requestedCount":3}`})
	rec := a.post("/agent/trips", url.Values{"return": {back},
		"trip": {"t-1:proposal", "t-2:inquiry", "t-3:inquiry"}, "toStatus": {"booked"}})
	if rec.Code != 303 {
		t.Fatalf("success = %d\n%s", rec.Code, rec.Body)
	}
	loc := rec.Header().Get("Location")
	if loc != "/agent/trips?status=booked&status=proposal&q=Negril&asked=3&moved=2&to=booked" {
		t.Errorf("redirect = %q", loc)
	}
	sent := a.fake.calls("agent-trip-status")[0].body
	jsonEq(t, sent, "op", `"bulk"`)
	jsonEq(t, sent, "status", `"booked"`)
	jsonEq(t, sent, "trips", `[{"tripId":"t-1","fromStatus":"proposal"},{"tripId":"t-2","fromStatus":"inquiry"},{"tripId":"t-3","fromStatus":"inquiry"}]`)

	has(t, a.get(loc), "Moved 2 trips to Booked. The other one had already moved on.", "alert-success")

	// The receipt is rebuilt from closed values only: anything else shows nothing.
	for _, junk := range []string{"moved=1&asked=1&to=evil", "moved=-1&asked=1&to=booked", "moved=3&asked=2&to=booked", "moved=x&asked=1&to=booked"} {
		lacks(t, a.get("/agent/trips?"+junk), "Moved ", "Nothing moved")
	}
	has(t, a.get("/agent/trips?moved=0&asked=2&to=in_progress"), "Nothing moved — every trip you picked had already changed stage.")
	has(t, a.get("/agent/trips?moved=1&asked=4&to=in_progress"), "Moved 1 trip to Traveling. The other 3 had already moved on.")

	// A rejection shows the function's own sentence; an outage the page's.
	a.fake.fn("agent-trip-status", reply{422, `{"type":"about:blank","title":"x","status":422,"detail":"That stage is not one a trip can move to."}`})
	rec = a.post("/agent/trips", url.Values{"return": {back}, "trip": {"t-1:proposal"}, "toStatus": {"booked"}})
	if rec.Code != 422 {
		t.Errorf("rejection status %d", rec.Code)
	}
	has(t, rec, "That stage is not one a trip can move to.")
	a.fake.fn("agent-trip-status", reply{502, ``})
	rec = a.post("/agent/trips", url.Values{"return": {back}, "trip": {"t-1:proposal"}, "toStatus": {"booked"}})
	if rec.Code != 503 {
		t.Errorf("outage status %d", rec.Code)
	}
	has(t, rec, "That didn&#39;t save. Try again in a moment.")

	// A lost session goes to sign in, never an error.
	a.fake.fn("agent-trip-status", reply{401, ``})
	rec = a.post("/agent/trips", url.Values{"return": {back}, "trip": {"t-1:proposal"}, "toStatus": {"booked"}})
	if rec.Code != 303 || !strings.HasPrefix(rec.Header().Get("Location"), "/login?next=") {
		t.Errorf("401 = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// "return" cannot point anywhere but the list.
	a.fake.fn("agent-trip-status", reply{200, `{"movedCount":1,"requestedCount":1}`})
	rec = a.post("/agent/trips", url.Values{"return": {"https://evil.example/agent/trips?q=x"}, "trip": {"t-1:proposal"}, "toStatus": {"booked"}})
	if loc := rec.Header().Get("Location"); !strings.HasPrefix(loc, "/agent/trips?") || strings.Contains(loc, "q=") {
		t.Errorf("foreign return = %q", loc)
	}
}
