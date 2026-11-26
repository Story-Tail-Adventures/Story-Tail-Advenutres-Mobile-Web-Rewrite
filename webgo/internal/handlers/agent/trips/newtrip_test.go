package trips_test

import (
	"net/url"
	"testing"
)

const bookJSON = `[
 {"client_id":"c-1","display_name":"Jordan Hayes","first_name":"Jordan","last_name":"Hayes","email":"jordan.hayes@example.com","as_of_date":"2026-09-07","total_count":3,"lifetime_value_cents":"0"},
 {"client_id":"c-2","display_name":"Sam Rivera","first_name":"Sam","last_name":"Rivera","email":null,"as_of_date":"2026-09-07","total_count":3,"lifetime_value_cents":"0"},
 {"client_id":"c-3","display_name":"Sam Rivera","first_name":"Sam","last_name":"Rivera","email":"sam2@example.com","as_of_date":"2026-09-07","total_count":3,"lifetime_value_cents":"0"}
]`

const templatesJSON = `[{"template_id":"tpl-1","name":"Sandals Negril · 7n","description":null,"trip_type":"all_inclusive","component_count":6,"day_count":4,"value_cents":"1284500","times_used":14,"created_at":"2026-09-28T00:00:00Z","updated_at":"2026-09-28T00:00:00Z"}]`

func newTripApp(t *testing.T) *app {
	a := newApp(t)
	a.fake.read("agent_client_roster", bookJSON)
	a.fake.read("agent_templates", templatesJSON)
	return a
}

func TestNewTripFormRenders(t *testing.T) {
	a := newTripApp(t)
	rec := a.get("/agent/trips/new?client=c-1")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec,
		"<title>New trip · Story-Tail Adventures</title>",
		`value="all_inclusive" checked=""`,
		`value="Jordan Hayes" data-client-id="c-1"`, ">jordan.hayes@example.com<",
		`data-client-id="c-2"`,
		// ?client= pre-selects: the id posts, the name shows.
		`name="clientName" placeholder="Start typing a name…" autocomplete="off" list="trip-client-options" data-trp-client="" data-slot="client-input" value="Jordan Hayes"`,
		`name="clientId" value="c-1"`,
		`>Sandals Negril · 7n — 6 bookings · 4 days<`,
		"Start from a template", `value="2"`,
	)
	lacks(t, rec, "Pick a client first.", "Give the trip a name.", "alert-error")

	// The whole active book in one read, archived clients not offered.
	args := a.fake.lastRead(t, "agent_client_roster")
	jsonEq(t, args, "p_status", `["active"]`)
	jsonEq(t, args, "p_limit", `500`)
	jsonEq(t, args, "p_offset", `0`)

	// A failed template read is an empty library, not a failed page.
	a.fake.reads["agent_templates"] = reply{500, `{}`}
	rec = a.get("/agent/trips/new")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	lacks(t, rec, "Start from a template", "Start from scratch")
	has(t, rec, "Who is it for?")

	// A failed book read is the retry state.
	a.fake.reads["agent_client_roster"] = reply{500, `{}`}
	has(t, a.get("/agent/trips/new"), "That didn’t load")
}

func TestNewTripValidation(t *testing.T) {
	a := newTripApp(t)
	rec := a.post("/agent/trips/new", url.Values{"tripType": {"cruise"}, "title": {"  "}, "travelerCount": {"4"}, "clientName": {"Nobody"}})
	if rec.Code != 422 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "Pick a client first.", "Give the trip a name.", `value="cruise" data-slot="type-cruise" checked=""`, `value="4"`, `value="Nobody"`, `aria-invalid="true"`)
	if n := len(a.fake.calls("agent-trip")); n != 0 {
		t.Errorf("an invalid form called the function %d times", n)
	}

	// A name two clients share never picks one.
	rec = a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientName": {"Sam Rivera"}})
	has(t, rec, "Pick a client first.")
}

func TestNewTripCreates(t *testing.T) {
	a := newTripApp(t)
	a.fake.fn("agent-trip", reply{200, `{"tripId":"0195a2c0-1a00-7000-8000-00000000abcd"}`})
	rec := a.post("/agent/trips/new", url.Values{"tripType": {"honeymoon"}, "title": {" Negril again "},
		"travelerCount": {"3.7"}, "clientId": {""}, "clientName": {"jordan hayes"}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/agent/trips/0195a2c0-1a00-7000-8000-00000000abcd/builder" {
		t.Fatalf("create = %d %q\n%s", rec.Code, rec.Header().Get("Location"), rec.Body)
	}
	sent := a.fake.calls("agent-trip")[0].body
	jsonEq(t, sent, "op", `"create"`)
	jsonEq(t, sent, "clientId", `"c-1"`) // resolved from the typed name (no JS)
	jsonEq(t, sent, "tripType", `"all_inclusive"`)
	jsonEq(t, sent, "title", `"Negril again"`)
	jsonEq(t, sent, "travelerCount", `3`)
	if n := len(a.fake.calls("agent-template")); n != 0 {
		t.Errorf("no template picked, yet apply ran %d times", n)
	}

	// An empty traveler count is 1, as Number.parseInt's NaN is.
	a.fake.fn("agent-trip", reply{200, `{"tripId":"t-2"}`})
	a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-2"}, "travelerCount": {""}})
	jsonEq(t, a.fake.calls("agent-trip")[1].body, "travelerCount", `1`)
}

func TestNewTripAppliesTheTemplate(t *testing.T) {
	a := newTripApp(t)
	a.fake.fn("agent-trip", reply{200, `{"tripId":"t-9"}`})
	a.fake.fn("agent-template", reply{200, `{"componentsAdded":6,"daysAdded":4}`})
	rec := a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}, "templateId": {"tpl-1"}})
	if rec.Header().Get("Location") != "/agent/trips/t-9/builder?seeded=6" {
		t.Errorf("seeded = %q", rec.Header().Get("Location"))
	}
	sent := a.fake.calls("agent-template")[0].body
	jsonEq(t, sent, "op", `"apply"`)
	jsonEq(t, sent, "templateId", `"tpl-1"`)
	jsonEq(t, sent, "tripId", `"t-9"`)

	// A failed apply does not fail the create, but it is not silent either.
	a.fake.fn("agent-trip", reply{200, `{"tripId":"t-10"}`})
	a.fake.fn("agent-template", reply{500, ``})
	rec = a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}, "templateId": {"tpl-1"}})
	if rec.Header().Get("Location") != "/agent/trips/t-10/builder?seeded=failed" {
		t.Errorf("failed apply = %q", rec.Header().Get("Location"))
	}
}

func TestNewTripRefusals(t *testing.T) {
	a := newTripApp(t)
	// no_client is a FIELD error.
	a.fake.fn("agent-trip", reply{200, `{"outcome":"no_client"}`})
	rec := a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-gone"}})
	if rec.Code != 422 {
		t.Errorf("no_client status %d", rec.Code)
	}
	has(t, rec, "That client is not on your book any more. Pick another.", `value="T"`)

	a.fake.fn("agent-trip", reply{400, `{"type":"about:blank","title":"Bad Request","status":400,"detail":"A trip title can be at most 160 characters."}`})
	rec = a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}})
	has(t, rec, "A trip title can be at most 160 characters.", "alert-error")

	a.fake.fn("agent-trip", reply{503, ``})
	rec = a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}})
	if rec.Code != 503 {
		t.Errorf("outage status %d", rec.Code)
	}
	has(t, rec, "That didn&#39;t save. Try again in a moment.")

	// A reply with no trip id is a failure, not a redirect to nowhere.
	a.fake.fn("agent-trip", reply{200, `{}`})
	rec = a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}})
	if rec.Code != 422 {
		t.Errorf("no id status %d", rec.Code)
	}
}

// Review finding (PR 1): with JS off, a stale hidden id (from a 422 re-render or ?client=)
// must not beat the name the advisor retyped.
func TestNewTripTypedNameBeatsAStaleHiddenID(t *testing.T) {
	a := newApp(t)
	a.fake.read("agent_client_roster", `[{"client_id":"c-1","display_name":"Jordan Hayes","email":null},{"client_id":"c-4","display_name":"Alex Kim","email":null}]`)
	a.fake.read("agent_templates", `[]`)
	rec := a.post("/agent/trips/new", url.Values{"clientId": {""}, "clientName": {"Jordan Hayes"}, "title": {""}})
	has(t, rec, `name="clientId" value="c-1"`) // the re-render carries the resolved id
	a.fake.fn("agent-trip", reply{200, `{"tripId":"t-1"}`}, reply{200, `{"tripId":"t-2"}`})
	a.post("/agent/trips/new", url.Values{"clientId": {"c-1"}, "clientName": {"Alex Kim"}, "title": {"Kim anniversary"}})
	jsonEq(t, a.fake.calls("agent-trip")[0].body, "clientId", `"c-4"`)

	// The posted id is kept when the typed name is its own.
	a.post("/agent/trips/new", url.Values{"clientId": {"c-1"}, "clientName": {"jordan hayes"}, "title": {"T"}})
	jsonEq(t, a.fake.calls("agent-trip")[1].body, "clientId", `"c-1"`)

	// A name that resolves to no one posts no id, whatever the hidden field held.
	rec = a.post("/agent/trips/new", url.Values{"clientId": {"c-1"}, "clientName": {"Nobody Here"}, "title": {"T"}})
	if rec.Code != 422 {
		t.Errorf("unknown name with a stale id = %d", rec.Code)
	}
	has(t, rec, "Pick a client first.")
}

func TestAnAdminPostSendsNothing(t *testing.T) {
	a := newTripApp(t)
	a.fake.role = "admin"
	rec := a.post("/agent/trips/new", url.Values{"title": {"T"}, "clientId": {"c-1"}})
	if rec.Code != 403 || len(a.fake.calls("agent-trip")) != 0 {
		t.Errorf("admin post = %d, calls %d", rec.Code, len(a.fake.calls("agent-trip")))
	}
	rec = a.post("/agent/trips", url.Values{"trip": {"t-1:inquiry"}, "toStatus": {"booked"}})
	if rec.Code != 403 || len(a.fake.calls("agent-trip-status")) != 0 {
		t.Errorf("admin bulk = %d", rec.Code)
	}
	has(t, rec, "You don’t have access to this view")
}
