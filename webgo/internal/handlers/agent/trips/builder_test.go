package trips_test

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

const (
	compA = "0195a2c0-1a00-7000-8000-0000000000a1"
	compB = "0195a2c0-1a00-7000-8000-0000000000a2"
	compC = "0195a2c0-1a00-7000-8000-0000000000a3"
)

const componentsJSON = `[
 {"component_id":"` + compA + `","kind":"flight","display_name":"AA 1413 · MIA → MBJ","supplier_id":"s-aa","supplier_name":"American Airlines","start_date":"2027-01-13","end_date":"2027-01-13","start_time":"06:40:00","end_time":"09:30:00","location":"Miami","confirmation_number":"TLR8QV","cost_cents":"84200","commission_pct":null,"commission_cents":"0","currency":"USD","api_source":null,"payload":{"seat":"14A","notes":"Window"},"order_index":0},
 {"component_id":"` + compB + `","kind":"cruise","display_name":"Symphony","supplier_id":null,"supplier_name":null,"start_date":null,"end_date":null,"start_time":null,"end_time":null,"location":null,"confirmation_number":null,"cost_cents":"498010","commission_pct":10.50,"commission_cents":"49801","currency":"USD","api_source":null,"payload":{"ship":"Symphony of the Seas","gratuities_included":true},"order_index":1},
 {"component_id":"` + compC + `","kind":"insurance","display_name":"Allianz","supplier_id":null,"supplier_name":null,"start_date":"2027-01-13","end_date":"2027-01-20","start_time":"08:00:00","end_time":null,"location":"Anywhere","confirmation_number":"P-1","cost_cents":"24000","commission_pct":null,"commission_cents":"0","currency":"USD","api_source":null,"payload":{},"order_index":2}]`

const suppliersJSON = `[
 {"supplier_id":"s-aa","name":"American Airlines","kind":"airline","default_commission_pct":5,"commission_payment_terms":null,"commission_payment_lag_days":null},
 {"supplier_id":"s-sandals","name":"Sandals <Resorts>","kind":"resort","default_commission_pct":12.50,"commission_payment_terms":"on_travel","commission_payment_lag_days":30}]`

func builderApp(t *testing.T) *app {
	a := detailApp(t)
	a.fake.read("agent_trip_components", componentsJSON)
	a.fake.read("agent_suppliers", suppliersJSON)
	return a
}

func builderURL(q string) string { return "/agent/trips/" + tripID + "/builder" + q }

func TestBuilderCanvas(t *testing.T) {
	a := builderApp(t)
	rec := a.get(builderURL(""))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Trip builder · Story-Tail Adventures</title>",
		`href="/agent/trips/`+tripID+`"`, "Back to the trip", "$12,845", "$1,318", "3 pieces",
		"AA 1413 · MIA → MBJ", "Jan 13 · 06:40 · Miami", "$842", "$4,980",
		`href="/agent/trips/`+tripID+`/builder?edit=`+compB+`"`,
		`href="/agent/trips/`+tripID+`/builder?add=flight"`,
		"Move up — AA 1413 · MIA → MBJ", "Remove from trip — Allianz")
	// The first row cannot move up, the last cannot move down; no sheet is open.
	if strings.Count(rec.Body.String(), `disabled=""`) < 2 {
		t.Error("the end rows' move buttons are not disabled")
	}
	lacks(t, rec, "Nothing in it yet", `action="/agent/trips/`+tripID+`/builder/component"`, "Seeded from a template")

	// Not there: 404 and TripNotFound. A failed read: the retry state.
	a.fake.read("agent_trip_overview", `[]`)
	if rec := a.get(builderURL("")); rec.Code != 404 {
		t.Errorf("not found = %d", rec.Code)
	}
	b := builderApp(t)
	b.fake.reads["agent_suppliers"] = reply{500, `{}`}
	has(t, b.get(builderURL("")), "That didn’t load")

	// Empty, and the seeding receipts.
	c := builderApp(t)
	c.fake.read("agent_trip_components", `[]`)
	has(t, c.get(builderURL("?seeded=6")), "Nothing in it yet", "0 pieces", "Seeded from a template — 6 bookings added.")
	has(t, c.get(builderURL("?seeded=0")), "The template added nothing.")
	has(t, c.get(builderURL("?seeded=failed")), "The template did not apply, but the trip is saved.")
	lacks(t, c.get(builderURL("?seeded=%3Cb%3E")), "Seeded", "template did not apply")
}

func TestBuilderSheets(t *testing.T) {
	a := builderApp(t)
	// A blank flight sheet: every column shown, none carried; the supplier picker grouped.
	rec := a.get(builderURL("?add=flight"))
	has(t, rec, "Add a flight", "Add to this trip", `placeholder="AA 1413 · MIA → MBJ"`, "Departs from", "Arrives on",
		"Booking reference", "Flight number", "Seat", `name="detail.seat"`,
		`<optgroup label="Airlines"`, `value="s-aa"`, `data-pct="5"`, "Sandals &lt;Resorts&gt;", `data-pct="12.5"`)
	lacks(t, rec, `data-slot="carry-location"`, "Gratuities included", `<optgroup label="Cruise lines"`, `data-slot="s-id"`)

	// Insurance shows three columns and carries the other three.
	rec = a.get(builderURL("?add=insurance"))
	has(t, rec, "Add travel insurance", "Covered from", "Covered to", "Policy number",
		`name="location" value="" data-slot="carry-location"`, `data-slot="carry-start-time"`, `data-slot="carry-end-time"`)
	lacks(t, rec, `id="component-location"`)

	// Editing a cruise: filled, the flag ticked, the rate as JS writes it, the row marked.
	rec = a.get(builderURL("?edit=" + compB))
	has(t, rec, ">Edit<", ">Cruise<", `name="componentId" value="`+compB+`"`, `value="Symphony of the Seas"`,
		`data-slot="f-flag" checked=""`, `value="4980.10"`, `value="10.5"`, `value="498.01"`, `aria-current="true"`)
	// Editing insurance carries its stored hidden columns, so a save cannot clear them.
	has(t, a.get(builderURL("?edit="+compC)), `name="location" value="Anywhere" data-slot="carry-location"`,
		`name="startTime" value="08:00" data-slot="carry-start-time"`)
	// An id that is not on this trip opens nothing; an unknown kind opens nothing.
	lacks(t, a.get(builderURL("?edit=nope")), `/builder/component"`)
	lacks(t, a.get(builderURL("?add=dining")), `/builder/component"`)
}

func TestBuilderSave(t *testing.T) {
	a := builderApp(t)
	a.fake.fn("agent-trip", reply{200, `{"componentId":"x","outcome":"inserted"}`})
	rec := a.post(builderURL("/component"), url.Values{"kind": {"cruise"}, "displayName": {" Symphony "},
		"supplierId": {""}, "location": {""}, "startDate": {"2027-02-01"}, "cost": {"$4,980.10"}, "commissionPct": {"10.5"},
		"commission": {""}, "detail.ship": {"Symphony"}, "detail.gratuities_included": {"on"}, "detail.seat": {"ignored"}})
	if rec.Code != 303 || rec.Header().Get("Location") != builderURL("") {
		t.Fatalf("save = %d %q\n%s", rec.Code, rec.Header().Get("Location"), rec.Body)
	}
	sent := a.fake.calls("agent-trip")[0].body
	jsonEq(t, sent, "op", `"component_upsert"`)
	jsonEq(t, sent, "kind", `"cruise"`)
	jsonEq(t, sent, "displayName", `"Symphony"`)
	jsonEq(t, sent, "costCents", `498010`)
	jsonEq(t, sent, "commissionPct", `"10.5"`)
	jsonEq(t, sent, "startDate", `"2027-02-01"`)
	jsonEq(t, sent, "detail", `{"ship":"Symphony","gratuities_included":true}`)
	for _, k := range []string{"componentId", "supplierId", "location", "commissionCents", "endDate"} {
		if _, ok := sent[k]; ok {
			t.Errorf("%s sent; an empty field is left out", k)
		}
	}

	// A typed commission wins and goes as cents; an id edits.
	a.post(builderURL("/component"), url.Values{"kind": {"flight"}, "componentId": {compA}, "displayName": {"AA"}, "commission": {"0"}})
	jsonEq(t, a.fake.calls("agent-trip")[1].body, "commissionCents", `0`)
	jsonEq(t, a.fake.calls("agent-trip")[1].body, "componentId", `"`+compA+`"`)

	// Field errors: 422, the sheet open with what was typed, nothing sent.
	n := len(a.fake.calls("agent-trip"))
	rec = a.post(builderURL("/component"), url.Values{"kind": {"hotel"}, "displayName": {""}, "cost": {"lots"},
		"commissionPct": {"1000"}, "startDate": {"2027-01-20"}, "endDate": {"2027-01-13"}, "detail.room_type": {"Suite"}})
	if rec.Code != 422 || len(a.fake.calls("agent-trip")) != n {
		t.Errorf("invalid sheet = %d", rec.Code)
	}
	has(t, rec, "Give it a name — it&#39;s the line the client reads.", "That doesn&#39;t look like an amount.",
		"A rate is between 0 and 999.", "That&#39;s before it starts.", `value="Suite"`, `value="lots"`, "Add a hotel or resort")
	// Each error is the field's description, as Next's Field and DateField wire it.
	for _, id := range []string{"component-displayName-error", "component-cost-error", "component-commissionPct-error", "component-endDate-error"} {
		if !strings.Contains(rec.Body.String(), `aria-describedby="`+id+`"`) {
			t.Errorf("no input is described by %s", id)
		}
	}

	// The 409, and the function's own sentence otherwise.
	a.fake.fn("agent-trip", reply{409, `{"detail":"x"}`})
	rec = a.post(builderURL("/component"), url.Values{"kind": {"custom"}, "displayName": {"Bottle"}})
	if rec.Code != 409 {
		t.Errorf("stale = %d", rec.Code)
	}
	has(t, rec, "This trip changed in another tab. Reload and try again.", `value="Bottle"`)
	a.fake.fn("agent-trip", reply{422, `{"detail":"That supplier is not one of yours."}`})
	has(t, a.post(builderURL("/component"), url.Values{"kind": {"custom"}, "displayName": {"Bottle"}}), "That supplier is not one of yours.")
}

// The gate sends a visitor whose session ended mid-post to sign in with next= the POST path.
// Signing in then GETs that path: it must lead back to the page, not to a 405.
func TestPostPathsLeadBackAfterSignIn(t *testing.T) {
	a := builderApp(t)
	trip := "/agent/trips/" + tripID
	for path, want := range map[string]string{
		builderURL("/component"): builderURL(""), builderURL("/remove"): builderURL(""),
		builderURL("/move"): builderURL(""), builderURL("/save-template"): builderURL(""),
		trip + "/stage": trip, trip + "/notes": trip, trip + "/cancel": trip, trip + "/save-template": trip,
		"/agent/trips/not-a-trip/builder/move": "/agent/trips",
	} {
		rec := a.get(path)
		if rec.Code != 303 || rec.Header().Get("Location") != want {
			t.Errorf("GET %s = %d %q, want 303 %q", path, rec.Code, rec.Header().Get("Location"), want)
		}
	}
	// Signed out, the gate's own redirect names the path, and that path now answers.
	req := httptest.NewRequest("POST", builderURL("/component"), strings.NewReader("kind=custom"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	if loc := rec.Header().Get("Location"); rec.Code != 303 || loc != "/login?next="+url.QueryEscape(builderURL("/component")) {
		t.Errorf("signed-out post = %d %q", rec.Code, loc)
	}
	if len(a.fake.calls("agent-trip")) != 0 {
		t.Error("a signed-out post reached the function")
	}
}

// A refused write whose trip is gone on the re-read is "No such trip", answered as a 404.
func TestRefusedWriteOnAGoneTripIs404(t *testing.T) {
	a := builderApp(t)
	a.fake.read("agent_trip_overview", `[]`)
	rec := a.post(builderURL("/component"), url.Values{"kind": {"custom"}, "displayName": {""}})
	if rec.Code != 404 {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, "No such trip")
}

func TestBuilderRemoveAndMove(t *testing.T) {
	a := builderApp(t)
	a.fake.fn("agent-trip", reply{200, `{}`})
	if rec := a.post(builderURL("/remove"), url.Values{"componentId": {compB}}); rec.Code != 303 || rec.Header().Get("Location") != builderURL("") {
		t.Fatalf("remove = %d", rec.Code)
	}
	sent := a.fake.calls("agent-trip")[0].body
	jsonEq(t, sent, "op", `"component_archive"`)
	jsonEq(t, sent, "componentId", `"`+compB+`"`)

	a.post(builderURL("/move"), url.Values{"componentId": {compB}, "direction": {"up"}})
	sent = a.fake.calls("agent-trip")[1].body
	jsonEq(t, sent, "op", `"component_reorder"`)
	jsonEq(t, sent, "componentIds", `["`+compB+`","`+compA+`","`+compC+`"]`)

	// The edge cannot move further, and a bad direction sends nothing.
	n := len(a.fake.calls("agent-trip"))
	for _, f := range []url.Values{{"componentId": {compA}, "direction": {"up"}}, {"componentId": {compC}, "direction": {"down"}},
		{"componentId": {compB}, "direction": {"sideways"}}, {"componentId": {"nope"}, "direction": {"up"}}} {
		if rec := a.post(builderURL("/move"), f); rec.Code != 303 {
			t.Errorf("%v = %d", f, rec.Code)
		}
	}
	if len(a.fake.calls("agent-trip")) != n {
		t.Error("an impossible move was sent")
	}
}

func TestBuilderSaveAsTemplate(t *testing.T) {
	a := builderApp(t)
	a.fake.fn("agent-template", reply{200, `{"componentsSaved":3,"daysSaved":0}`})
	rec := a.post(builderURL("/save-template"), url.Values{"name": {"Negril"}})
	if loc := rec.Header().Get("Location"); loc != builderURL("?bookings=3&days=0&saved=1") {
		t.Fatalf("save template = %q", loc)
	}
	has(t, a.get(builderURL("?bookings=3&days=0&saved=1")), "Saved. 3 bookings captured.")
}
