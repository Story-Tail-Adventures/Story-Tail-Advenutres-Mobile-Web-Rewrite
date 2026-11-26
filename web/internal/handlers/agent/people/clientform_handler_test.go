package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// New client and Edit client through the real gate, against a fake Supabase.

func overviewJSON(over map[string]any) string {
	row := map[string]any{
		"client_id": "c-imani", "display_name": "Imani Osei", "first_name": "Imani", "last_name": "Osei",
		"preferred_name": nil, "email": "imani@example.com", "phone": "+13055550199", "date_of_birth": "1991-02-08",
		"status": "active", "tags": []string{"vip"}, "address_country": "CA", "address_city": "Toronto",
		"important_dates": []any{map[string]any{"label": "Anniversary", "date": "2020-06-12", "recurring": true}, "junk", map[string]any{"label": 7}},
		"version":         4, "created_at": "2024-01-01T00:00:00Z", "lifetime_value_cents": "0", "commission_cents": "0",
		"trip_count": 0, "active_trip_count": 0, "note_count": 0, "document_count": 0, "as_of_date": "2026-09-26",
	}
	for k, v := range over {
		row[k] = v
	}
	return mustJSON([]map[string]any{row})
}

func TestNewClientPage(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON
	rec := wd.get("/agent/clients/new")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET = %d\n%s", rec.Code, wd.logs.String())
	}
	body := rec.Body.String()
	has(t, body, "<title>New client · Story-Tail Adventures</title>", ">New client<",
		"Required: a name and an email. Everything else can be added later.", ">+ vip<", ">+ family<",
		">State<", ">ZIP code<", "Send a portal invitation", ">Save &amp; create trip<", `action="/agent/clients/new"`)
	if !optionSelected(body, "US") {
		t.Error("the country is not US by default")
	}
	lacks(t, body, `name="clientId"`, `name="expectedVersion"`, "That isn&#39;t right.")
}

// optionSelected reports whether the country option for code carries selected.
func optionSelected(body, code string) bool {
	i := strings.Index(body, `data-slot="country-`+strings.ToLower(code)+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<option")
	return strings.Contains(body[start:i+strings.Index(body[i:], ">")], "selected")
}

func TestNewClientRefusesWhatIsMissing(t *testing.T) {
	wd := newWorld(t)
	rec := wd.post("/agent/clients/new", url.Values{"firstName": {"  "}, "phone": {"123"}, "tag": {"VIP"}, "addressCountry": {"GB"}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST = %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body, "A first name, so the roster has something to sort by.", "A last name, for the same reason.",
		"An email — it&#39;s how the portal invitation and every update reaches them.",
		"That phone number isn&#39;t one I can dial. US numbers unless you add a country code.",
		`aria-invalid="true"`, `value="vip"`, ">Region<", ">Postal code<")
	if !optionSelected(body, "GB") {
		t.Error("the country typed was not kept")
	}
	if n := len(wd.fake.callsTo("agent-client")); n != 0 {
		t.Errorf("an invalid form reached the function %d times", n)
	}
}

func TestNewClientStepsSaveNothing(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON
	base := url.Values{"firstName": {"Imani"}, "tag": {"vip"}, "dateLabel": {"Anniversary", ""}, "dateValue": {"2020-06-12", ""}, "dateRecurring": {"0"}}
	with := func(k, v string) url.Values {
		f := url.Values{}
		for key, vals := range base {
			f[key] = append([]string(nil), vals...)
		}
		f.Set(k, v)
		return f
	}
	for _, c := range []struct {
		form       url.Values
		want, lack []string
	}{
		{with("addTag", "family"), []string{`aria-label="Remove tag family"`}, nil},
		{with("removeTag", "vip"), []string{">+ vip<"}, []string{`aria-label="Remove tag vip"`}},
		{func() url.Values { f := with("intent", "add-tag"); f.Set("newTag", " Honeymoon "); return f }(), []string{`aria-label="Remove tag honeymoon"`}, nil},
		{with("intent", "add-date"), []string{`value="2"`}, nil}, // a third row (two posted, blank kept)
		{with("removeDate", "0"), nil, []string{`value="Anniversary"`}},
	} {
		rec := wd.post("/agent/clients/new", c.form)
		if rec.Code != http.StatusOK {
			t.Errorf("%v = %d", c.form, rec.Code)
		}
		body := rec.Body.String()
		has(t, body, append(c.want, `value="Imani"`)...)
		lacks(t, body, c.lack...)
		lacks(t, body, "A last name, for the same reason.") // nothing was validated
	}
	if n := len(wd.fake.callsTo("agent-client")); n != 0 {
		t.Errorf("a step reached the function %d times", n)
	}
}

func TestNewClientSaves(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-client"] = reply{200, `{"outcome":"created","clientId":"c-new"}`}
	form := url.Values{"firstName": {" Imani "}, "lastName": {"Osei"}, "email": {"imani@example.com"}, "phone": {"(305) 555-0199"},
		"tag": {"VIP"}, "newTag": {"repeat"}, "addressCountry": {"US"}, "dateLabel": {"Anniversary"}, "dateValue": {"2020-06-12"}}
	rec := wd.post("/agent/clients/new", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/clients/c-new" {
		t.Fatalf("save = %d %q\n%s", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
	call := wd.fake.callsTo("agent-client")[0]
	if string(call.Body["op"]) != `"create"` {
		t.Errorf("op = %s", call.Body["op"])
	}
	client := string(call.Body["client"])
	for _, want := range []string{`"firstName":"Imani"`, `"phone":"+13055550199"`, `"tags":["vip","repeat"]`,
		`"importantDates":[{"label":"Anniversary","date":"2020-06-12","recurring":false}]`, `"preferredName":null`, `"country":"US"`} {
		if !strings.Contains(client, want) {
			t.Errorf("client %s lacks %s", client, want)
		}
	}
	form.Set("then", "trip")
	if rec := wd.post("/agent/clients/new", form); rec.Header().Get("Location") != "/agent/trips/new?client=c-new" {
		t.Errorf("save and trip = %q", rec.Header().Get("Location"))
	}

	// A duplicate email: the field says so and links the record the advisor already has.
	wd.fake.functions["POST agent-client"] = reply{200, `{"outcome":"duplicate_email","existingClientId":"c-old"}`}
	rec = wd.post("/agent/clients/new", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("duplicate = %d", rec.Code)
	}
	has(t, rec.Body.String(), "You already have a client with that email.", `href="/agent/clients/c-old"`, "Open the record you already have")

	// A rejection shows the function's sentence; an outage the form's own.
	wd.fake.functions["POST agent-client"] = reply{422, `{"status":422,"detail":"That email has a typo the post office won't take."}`}
	has(t, wd.post("/agent/clients/new", form).Body.String(), "That email has a typo the post office won&#39;t take.")
	wd.fake.functions["POST agent-client"] = reply{502, `{}`}
	has(t, wd.post("/agent/clients/new", form).Body.String(), "That didn&#39;t save. Nothing&#39;s lost — give it another try.")
}

func TestEditClient(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON

	// Not this advisor's client.
	rec := wd.get("/agent/clients/c-nope/edit")
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown client = %d", rec.Code)
	}
	has(t, rec.Body.String(), "No such client", "It may have been archived, merged, or it belongs to another advisor.")

	wd.fake.rpc["agent_client_overview"] = overviewJSON(nil)
	rec = wd.get("/agent/clients/c-imani/edit")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET edit = %d\n%s", rec.Code, wd.logs.String())
	}
	body := rec.Body.String()
	has(t, body, "<title>Edit client · Story-Tail Adventures</title>", ">Edit · Imani Osei<", ">Imani Osei<",
		`value="c-imani"`, `value="4"`, `value="Anniversary"`, `value="2020-06-12"`, ">Region<", ">Postal code<",
		`aria-label="Remove tag vip"`, `action="/agent/clients/c-imani/edit"`, "Email and phone changes are what the portal and every update use.")
	lacks(t, body, "Send a portal invitation", "Save &amp; create trip", `value="Date"`)
	if !optionSelected(body, "CA") {
		t.Error("the saved country is not selected")
	}
	if got := wd.fake.rpcArgs["agent_client_overview"]; got != `{"p_client_id":"c-imani"}` {
		t.Errorf("overview args = %s", got)
	}

	form := url.Values{"clientId": {"c-imani"}, "expectedVersion": {"4"}, "firstName": {"Imani"}, "lastName": {"Osei"}, "email": {"imani@example.com"}}
	rec = wd.post("/agent/clients/c-imani/edit", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/clients/c-imani" {
		t.Fatalf("save = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	call := wd.fake.callsTo("agent-client")[0]
	if string(call.Body["op"]) != `"update"` || string(call.Body["clientId"]) != `"c-imani"` || string(call.Body["expectedVersion"]) != "4" {
		t.Errorf("update body = %v", call.Body)
	}

	// Someone else saved first: the 409, said plainly.
	wd.fake.functions["POST agent-client"] = reply{409, `{"status":409,"detail":"stale"}`}
	rec = wd.post("/agent/clients/c-imani/edit", form)
	if rec.Code != http.StatusConflict {
		t.Errorf("stale = %d", rec.Code)
	}
	has(t, rec.Body.String(), "This client changed since you opened it. Reload and try again.")

	// A form that names another client than its URL never saves.
	bad := url.Values{"clientId": {"c-other"}, "expectedVersion": {"4"}, "firstName": {"Imani"}, "lastName": {"Osei"}, "email": {"imani@example.com"}}
	before := len(wd.fake.callsTo("agent-client"))
	if rec := wd.post("/agent/clients/c-imani/edit", bad); rec.Code != http.StatusUnprocessableEntity || len(wd.fake.callsTo("agent-client")) != before {
		t.Errorf("mismatched client = %d", rec.Code)
	}
}
