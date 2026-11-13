package trips_test

import (
	"net/url"
	"strings"
	"testing"
)

const (
	tplA = "0195a2c0-1a00-7000-8000-0000000000f1"
	tplB = "0195a2c0-1a00-7000-8000-0000000000f2"
)

const libraryJSON = `[
 {"template_id":"` + tplA + `","name":"Sandals <Negril> · 7n","description":"Ocean-view suite, transfer","trip_type":"all_inclusive","component_count":6,"day_count":4,"value_cents":"1284500","times_used":14,"created_at":"2026-09-28T00:00:00Z","updated_at":"2026-09-28T00:00:00Z"},
 {"template_id":"` + tplB + `","name":"Lisbon long weekend","description":null,"trip_type":"group_charter","component_count":1,"day_count":0,"value_cents":"0","times_used":0,"created_at":"2026-09-28T00:00:00Z","updated_at":"2026-09-28T00:00:00Z"}]`

func templatesApp(t *testing.T) *app {
	a := newApp(t)
	a.fake.read("agent_templates", libraryJSON)
	return a
}

func TestTemplateLibrary(t *testing.T) {
	a := templatesApp(t)
	rec := a.get("/agent/templates")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Trip templates · Story-Tail Adventures</title>", "Reusable starting points for the trips you build again and again.",
		`href="/agent/trips"`, "All trips", "Sandals &lt;Negril&gt; · 7n", "All-inclusive resort · 6 bookings · 4 days",
		">$12,845<", "Ocean-view suite, transfer", ">14× used<", "group_charter · 1 booking", "Lisbon long weekend",
		`href="/agent/templates?rename=`+tplA+`"`, `href="/agent/templates?retire=`+tplB+`"`, " Lisbon long weekend")
	body := rec.Body.String()
	// The unpriced, unused pattern shows no price and no usage chip; no dialog is open.
	if strings.Count(body, "× used") != 1 || strings.Count(body, `data-slot="t-value"`) != 1 {
		t.Error("price or usage chip on the wrong card")
	}
	lacks(t, rec, "No templates yet", `data-slot="rename-dialog"`, `data-slot="retire-dialog"`)

	rec = a.get("/agent/templates?rename=" + tplA)
	has(t, rec, `data-slot="rename-dialog"`, "Rename Sandals &lt;Negril&gt; · 7n", `value="`+tplA+`"`,
		`value="Sandals &lt;Negril&gt; · 7n"`, `value="Ocean-view suite, transfer"`, "A template is a snapshot of a real trip.")
	rec = a.get("/agent/templates?retire=" + tplB)
	has(t, rec, `data-slot="retire-dialog"`, "Retire Lisbon long weekend", "RETIRE", "It leaves the library.")
	lacks(t, a.get("/agent/templates?rename=nope&retire=%3Cb%3E"), `data-slot="rename-dialog"`, `data-slot="retire-dialog"`)

	// An empty library, and a failed read.
	a.fake.read("agent_templates", `[]`)
	has(t, a.get("/agent/templates"), "No templates yet", "Open a trip you would build again, then use Save as template.")
	a.fake.reads["agent_templates"] = reply{500, `{}`}
	has(t, a.get("/agent/templates"), "That didn’t load", `href="/agent/templates"`)
}

func TestTemplateRenameAndRetire(t *testing.T) {
	a := templatesApp(t)
	a.fake.fn("agent-template", reply{200, `{}`})
	rec := a.post("/agent/templates/rename", url.Values{"templateId": {tplA}, "name": {"  Negril, again "}, "description": {"  "}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/agent/templates" {
		t.Fatalf("rename = %d", rec.Code)
	}
	c := a.fake.calls("agent-template")[0].body
	jsonEq(t, c, "op", `"update"`)
	jsonEq(t, c, "templateId", `"`+tplA+`"`)
	jsonEq(t, c, "name", `"Negril, again"`)
	if _, sent := c["description"]; sent {
		t.Error("a blank description was sent")
	}
	a.post("/agent/templates/rename", url.Values{"templateId": {tplA}, "name": {"N"}, "description": {" Suite "}})
	jsonEq(t, a.fake.calls("agent-template")[1].body, "description", `"Suite"`)

	// No name: the dialog again, nothing sent. A forged id: nothing.
	rec = a.post("/agent/templates/rename", url.Values{"templateId": {tplA}, "name": {"   "}})
	if rec.Code != 422 {
		t.Errorf("blank name = %d", rec.Code)
	}
	has(t, rec, "A template needs a name.", `data-slot="rename-dialog"`)
	a.post("/agent/templates/rename", url.Values{"templateId": {"t1"}, "name": {"x"}})
	if n := len(a.fake.calls("agent-template")); n != 2 {
		t.Errorf("%d calls", n)
	}

	// The function's sentence, then ours on an outage; what was typed stays.
	a.fake.fn("agent-template", reply{422, `{"detail":"You already have a template with that name."}`}, reply{503, `{}`})
	rec = a.post("/agent/templates/rename", url.Values{"templateId": {tplA}, "name": {"Lisbon long weekend"}, "description": {"x"}})
	has(t, rec, "You already have a template with that name.", `value="Lisbon long weekend"`, `value="x"`)
	has(t, a.post("/agent/templates/rename", url.Values{"templateId": {tplA}, "name": {"N"}}), "That did not save. Try again in a moment.")

	// Retire.
	a.fake.fn("agent-template", reply{200, `{}`})
	if rec := a.post("/agent/templates/retire", url.Values{"templateId": {tplB}}); rec.Code != 303 {
		t.Errorf("retire = %d", rec.Code)
	}
	calls := a.fake.calls("agent-template")
	jsonEq(t, calls[len(calls)-1].body, "op", `"archive"`)
	jsonEq(t, calls[len(calls)-1].body, "templateId", `"`+tplB+`"`)
	a.fake.fn("agent-template", reply{409, `{"detail":"That template is already retired."}`})
	has(t, a.post("/agent/templates/retire", url.Values{"templateId": {tplB}}), "That template is already retired.", `data-slot="retire-dialog"`)

	// An admin sends nothing; GETs on the POST paths land on the library.
	b := templatesApp(t)
	b.fake.role = "admin"
	for _, p := range []string{"/agent/templates/rename", "/agent/templates/retire"} {
		if rec := b.post(p, url.Values{"templateId": {tplA}, "name": {"x"}}); rec.Code != 403 {
			t.Errorf("admin %s = %d", p, rec.Code)
		}
		if rec := a.get(p); rec.Code != 303 || rec.Header().Get("Location") != "/agent/templates" {
			t.Errorf("GET %s = %d", p, rec.Code)
		}
	}
	if len(b.fake.calls("agent-template")) != 0 {
		t.Error("an admin's post reached the function")
	}
}

// A refusal has to say so even when the row has left the library. Archiving a template takes
// it out of agent_templates, so retiring twice (two tabs, or Back then Retire again) is the
// ordinary way here: the dialog used to be looked up in the library and vanished with it,
// taking the function's sentence — and anything typed — with it.
func TestTemplateRefusalSurvivesAGoneRow(t *testing.T) {
	gone := "0195a2c0-1a00-7000-8000-0000000000f9" // not in libraryJSON
	a := templatesApp(t)
	a.fake.fn("agent-template", reply{404, `{"detail":"That template is not in your library."}`})

	rec := a.post("/agent/templates/retire", url.Values{"templateId": {gone}, "name": {"Retired already"}})
	has(t, rec, "That template is not in your library.", `data-slot="retire-dialog"`,
		"Retire Retired already", `name="templateId" value="`+gone+`"`)
	if rec.Code == 303 {
		t.Error("a refusal redirected instead of saying so")
	}

	rec = a.post("/agent/templates/rename", url.Values{"templateId": {gone}, "name": {"Negril, again"}, "description": {"typed"}})
	has(t, rec, "That template is not in your library.", `data-slot="rename-dialog"`,
		`value="Negril, again"`, `value="typed"`)

	// While the row IS there, the library still names it (another tab may have renamed it),
	// whatever the form posted.
	rec = a.post("/agent/templates/retire", url.Values{"templateId": {tplB}, "name": {"a stale name"}})
	has(t, rec, "Retire Lisbon long weekend")
	lacks(t, rec, "a stale name")
}

// Next held one dialog in client state, so two could not stack.
func TestOnlyOneTemplateDialogOpens(t *testing.T) {
	a := templatesApp(t)
	rec := a.get("/agent/templates?rename=" + tplA + "&retire=" + tplB)
	has(t, rec, `data-slot="rename-dialog"`)
	lacks(t, rec, `data-slot="retire-dialog"`)
	if n := strings.Count(rec.Body.String(), "<dialog"); n != 1 {
		t.Errorf("%d dialogs open", n)
	}
}
