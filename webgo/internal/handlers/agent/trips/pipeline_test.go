package trips_test

import (
	"net/url"
	"strings"
	"testing"
)

const (
	pipeA = "0195a2c0-1a00-7000-8000-0000000000c1"
	pipeB = "0195a2c0-1a00-7000-8000-0000000000c2"
)

const boardJSON = `[
 {"trip_id":"` + pipeA + `","client_id":"c","client_display_name":"Jordan <Hayes>","title":"Negril","trip_type":"x","status":"inquiry","status_changed_at":"2026-09-01T00:00:00Z","start_date":null,"end_date":null,"destinations":null,"traveler_count":2,"total_value_cents":"1284500","total_paid_cents":"0","total_commission_cents":"0","currency":"USD","notes":null,"version":4,"proposal_sent_at":null},
 {"trip_id":"` + pipeB + `","client_id":"c","client_display_name":"Riley Park","title":"Lisbon","trip_type":"x","status":"booked","status_changed_at":"2026-09-01T00:00:00Z","start_date":null,"end_date":null,"destinations":null,"traveler_count":2,"total_value_cents":"500000","total_paid_cents":"0","total_commission_cents":"0","currency":"USD","notes":null,"version":9,"proposal_sent_at":null},
 {"trip_id":"x","client_id":"c","client_display_name":"Gone","title":"Gone","trip_type":"x","status":"cancelled","status_changed_at":"2026-09-01T00:00:00Z","start_date":null,"end_date":null,"destinations":null,"traveler_count":1,"total_value_cents":"1","total_paid_cents":"0","total_commission_cents":"0","currency":"USD","notes":null,"version":1,"proposal_sent_at":null}]`

func pipelineApp(t *testing.T) *app {
	a := newApp(t)
	a.fake.read("agent_kpis", `[{"agent_id":"a","as_of_date":"2026-09-07","currency":"USD","pipeline_value_cents":"0"}]`)
	a.fake.read("agent_trip_board", boardJSON)
	return a
}

func TestPipelineBoard(t *testing.T) {
	a := pipelineApp(t)
	rec := a.get("/agent/pipeline")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Pipeline · Story-Tail Adventures</title>", "Move a trip with the stage menu. Totals are summed live.",
		`aria-label="Worklist views"`, `class="chip chip-secondary chip-clickable trp-view-link"`,
		"Jordan &lt;Hayes&gt;", "Negril", "$12,845", "Riley Park", "$5,000", "Nothing here.",
		"1 trip · ", "status-traveling", "status-past", ">In progress<", ">Completed<",
		`href="/agent/trips/`+pipeA+`"`, `name="expectedVersion" value="4"`, `name="expectedVersion" value="9"`,
		`value="booked" data-slot="c-opt-booked" selected=""`, `aria-label="Move stage"`,
		"Inquiry · 1", "Proposal · 0", `href="/agent/pipeline?stage=booked"`,
		"1 cancelled trip is not on the board.")
	body := rec.Body.String()
	// The phone shows the first stage when none is chosen; cancelled is not a column or an option.
	if strings.Count(body, `data-selected="true"`) != 1 {
		t.Error("exactly one column is the phone's")
	}
	lacks(t, rec, `value="cancelled"`, "Gone", `role="alert"`)

	// ?stage= picks the phone's column (and its chip); junk falls back to the first.
	rec = a.get("/agent/pipeline?stage=booked")
	has(t, rec, `name="view" value="booked"`)
	lacks(t, a.get("/agent/pipeline?stage=%3Cscript%3E"), "<script>", `name="view" value="&lt;`)

	// A failed read, or no KPI row at all (not an agent), is the retry state.
	b := pipelineApp(t)
	b.fake.read("agent_kpis", `[]`)
	has(t, b.get("/agent/pipeline"), "That didn’t load")
	c := pipelineApp(t)
	c.fake.reads["agent_trip_board"] = reply{500, `{}`}
	has(t, c.get("/agent/pipeline"), "That didn’t load")
}

func TestPipelineMove(t *testing.T) {
	a := pipelineApp(t)
	a.fake.fn("agent-trip-status", reply{200, `{}`})
	rec := a.post("/agent/pipeline/stage", url.Values{"tripId": {pipeA}, "status": {"proposal"}, "from": {"inquiry"}, "expectedVersion": {"4"}, "view": {"booked"}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/agent/pipeline?stage=booked" {
		t.Fatalf("move = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	c := a.fake.calls("agent-trip-status")[0].body
	jsonEq(t, c, "tripId", `"`+pipeA+`"`)
	jsonEq(t, c, "status", `"proposal"`)
	jsonEq(t, c, "expectedVersion", `4`)
	if _, sent := c["cancellationReason"]; sent {
		t.Error("a cancellation reason was sent")
	}

	// Nothing to move, not a stage this board offers, a forged id, no version: nothing sent.
	for _, f := range []url.Values{
		{"tripId": {pipeA}, "status": {"inquiry"}, "from": {"inquiry"}, "expectedVersion": {"4"}},
		{"tripId": {pipeA}, "status": {"cancelled"}, "from": {"inquiry"}, "expectedVersion": {"4"}},
		{"tripId": {"x"}, "status": {"booked"}, "from": {"inquiry"}, "expectedVersion": {"4"}},
		{"tripId": {pipeA}, "status": {"booked"}, "from": {"inquiry"}, "expectedVersion": {"v"}},
	} {
		if rec := a.post("/agent/pipeline/stage", f); rec.Code != 303 {
			t.Errorf("%v = %d", f, rec.Code)
		}
	}
	if n := len(a.fake.calls("agent-trip-status")); n != 1 {
		t.Errorf("%d calls", n)
	}

	// The 409: the board again, "moved since" on THAT card, read from the conflict and never
	// from the words (the function's sentence here says something else entirely).
	a.fake.fn("agent-trip-status", reply{409, `{"detail":"Version mismatch."}`})
	rec = a.post("/agent/pipeline/stage", url.Values{"tripId": {pipeB}, "status": {"completed"}, "from": {"booked"}, "expectedVersion": {"8"}})
	if rec.Code != 409 {
		t.Errorf("stale = %d", rec.Code)
	}
	body := rec.Body.String()
	if strings.Count(body, `role="alert"`) != 1 {
		t.Errorf("%d card errors", strings.Count(body, `role="alert"`))
	}
	errAt := strings.Index(body, "This trip moved since the board was loaded. Reload and try again.")
	if errAt < 0 || strings.LastIndex(body[:errAt], `name="tripId" value="`) != strings.LastIndex(body[:errAt], `name="tripId" value="`+pipeB+`"`) {
		t.Error("the stale message is not on the moved card")
	}
	lacks(t, rec, "Version mismatch.")

	// Any other refusal is the function's own sentence; an outage is ours.
	a.fake.fn("agent-trip-status", reply{422, `{"detail":"A completed trip cannot go back to inquiry."}`}, reply{503, `{}`})
	has(t, a.post("/agent/pipeline/stage", url.Values{"tripId": {pipeB}, "status": {"inquiry"}, "from": {"booked"}, "expectedVersion": {"9"}}),
		"A completed trip cannot go back to inquiry.")
	has(t, a.post("/agent/pipeline/stage", url.Values{"tripId": {pipeB}, "status": {"inquiry"}, "from": {"booked"}, "expectedVersion": {"9"}}),
		"Could not move the trip. Try again in a moment.")

	// An admin sends nothing; the sign-in round trip lands on the board.
	b := pipelineApp(t)
	b.fake.role = "admin"
	if rec := b.post("/agent/pipeline/stage", url.Values{"tripId": {pipeA}, "status": {"booked"}, "from": {"inquiry"}, "expectedVersion": {"4"}}); rec.Code != 403 || len(b.fake.calls("agent-trip-status")) != 0 {
		t.Errorf("admin = %d", rec.Code)
	}
	if rec := a.get("/agent/pipeline/stage"); rec.Code != 303 || rec.Header().Get("Location") != "/agent/pipeline" {
		t.Errorf("GET stage = %d", rec.Code)
	}
	b.fake.role = "agent"
	b.fake.fn("agent-trip-status", reply{401, `{}`})
	if rec := b.post("/agent/pipeline/stage", url.Values{"tripId": {pipeA}, "status": {"booked"}, "from": {"inquiry"}, "expectedVersion": {"4"}, "view": {"booked"}}); rec.Header().Get("Location") != "/login?next="+url.QueryEscape("/agent/pipeline?stage=booked") {
		t.Errorf("401 = %q", rec.Header().Get("Location"))
	}
}
