package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// §3.8's handlers against the fake Supabase: the list and its filters, the lead page's state
// machine and dialogs, every write's body and answer, and Add lead.

const (
	leadID   = "0195a2c0-1a00-7000-8000-0000000000aa"
	leadPath = "/agent/leads/" + leadID
)

func leadsWorld(t *testing.T) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_kpis"] = mustJSON([]map[string]any{{"agent_id": "a1", "as_of_date": "2026-10-21"}})
	wd.fake.rpc["agent_leads"] = mustJSON([]map[string]any{
		{"id": leadID, "first_name": "Dana", "last_name": "Reyes", "email": "dana@example.com", "source": "website", "status": "new",
			"already_client": false, "client_id": nil, "message_count": 2, "latest_preview": "June works.",
			"first_message_at": "2026-10-19T15:00:00Z", "last_message_at": "2026-10-21T15:00:00Z"},
		{"id": "0195a2c0-1a00-7000-8000-0000000000bb", "first_name": "Sam", "last_name": nil, "email": "sam@example.com", "source": "phone", "status": "converted",
			"already_client": true, "client_id": "c1", "message_count": 1, "latest_preview": nil,
			"first_message_at": "2026-10-01T15:00:00Z", "last_message_at": "2026-10-02T15:00:00Z"},
	})
	return wd
}

func leadJSON(status string, over map[string]any) string {
	row := map[string]any{
		"id": leadID, "first_name": "Dana", "last_name": "Reyes", "email": "dana@example.com", "phone": "(555) 201-0101",
		"source": "website", "status": status, "already_client": false, "client_id": nil,
		"utm_source": "instagram", "utm_medium": nil, "utm_campaign": nil,
		"first_contacted_at": nil, "converted_at": nil, "closed_at": nil, "close_reason": nil, "close_note": nil,
		"created_at": "2026-10-19T15:00:00Z", "last_message_at": "2026-10-21T15:00:00Z",
	}
	for k, v := range over {
		row[k] = v
	}
	return mustJSON([]map[string]any{row})
}

func leadWorld(t *testing.T, status string, over map[string]any) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_lead"] = leadJSON(status, over)
	wd.fake.rpc["agent_lead_messages"] = mustJSON([]map[string]any{
		{"id": "m1", "body": "June works.\nTwo of us.", "entered_by_agent": false, "page": "detail", "about_kind": "trip",
			"about_slug": "lisbon", "about_label": "Seven nights in Lisbon", "created_at": "2026-10-19T15:00:00Z"},
	})
	return wd
}

func TestLeadsList(t *testing.T) {
	wd := leadsWorld(t)
	b := wd.get("/agent/leads").Body.String()
	has(t, b, "Dana Reyes", "June works.", "Website form · 2 notes · Oct 21", "Waiting 2 days", ">New<",
		`href="`+leadPath+`"`, ">Open · 1<", ">Became clients · 1<", ">Closed · 0<", ">All · 2<")
	lacks(t, b, "Sam", "No one is waiting on you here.")
	i := strings.Index(b, ">Open · 1<")
	if tag := b[strings.LastIndex(b[:i], "<a"):i]; !strings.Contains(tag, `aria-current="page"`) || !strings.Contains(tag, "chip-primary") {
		t.Errorf("the Open chip is not current: %s", tag)
	}

	b = wd.get("/agent/leads?status=converted").Body.String()
	has(t, b, "Sam", leadAlreadyClient, "status-booked", "Phone · 1 note · Oct 02")
	lacks(t, b, "Dana Reyes", "Waiting")

	b = wd.get("/agent/leads?status=closed").Body.String()
	has(t, b, leadEmptyOther)
	b = wd.get("/agent/leads?status=bogus").Body.String()
	has(t, b, "Dana Reyes") // an unknown filter is Open

	wd.fake.rpc["agent_leads"] = "[]"
	has(t, wd.get("/agent/leads").Body.String(), leadEmptyOpen)

	wd.fake.failing["agent_leads"] = true
	if rec := wd.get("/agent/leads"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("failed read = %d", rec.Code)
	}
}

func TestLeadPage(t *testing.T) {
	t.Run("a new lead", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		b := wd.get(leadPath).Body.String()
		has(t, b, "Dana Reyes", "status-lead", `href="mailto:dana@example.com?subject=`, "Mark contacted", "Invite to an account",
			`href="`+leadPath+`?confirm=close"`, "Delete as spam", "Opens your own email app.",
			"Came from", "Website form", "Campaign", "instagram", "First note", "Oct 19",
			"Oct 19 · Sent from the trip page", "About: Seven nights in Lisbon", "June works.\nTwo of us.")
		lacks(t, b, "Reopen", "Open client", "That email already has an open lead")
		if dialogOpen(b, "lead-dlg-close") {
			t.Error("a dialog opened on arrival")
		}
	})

	t.Run("contacted, closed and converted", func(t *testing.T) {
		b := leadWorld(t, "contacted", nil).get(leadPath).Body.String()
		lacks(t, b, "Mark contacted", "Reopen")
		has(t, b, `?confirm=close"`)

		b = leadWorld(t, "closed", map[string]any{"closed_at": "2026-10-22T14:00:00Z", "close_reason": "no_reply"}).get(leadPath).Body.String()
		has(t, b, "Reopen", "status-past", "Oct 22")
		lacks(t, b, "Mark contacted", `?confirm=close"`, "lead-dlg-close")

		b = leadWorld(t, "converted", map[string]any{"client_id": "0195a2c0-1a00-7000-8000-000000000105", "already_client": true}).get(leadPath).Body.String()
		has(t, b, `href="/agent/clients/0195a2c0-1a00-7000-8000-000000000105"`, "Open client", leadAlreadyClient)
		lacks(t, b, "Reply by email", "Delete as spam", "lead-dlg-invite", "Opens your own email app.")
	})

	t.Run("?confirm= opens its dialog, and ?added=1 says the note joined a lead", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		b := wd.get(leadPath + "?confirm=close&added=1").Body.String()
		if !dialogOpen(b, "lead-dlg-close") || dialogOpen(b, "lead-dlg-delete") {
			t.Error("the close dialog is not the open one")
		}
		has(t, b, "That email already has an open lead, so the note was added to it.", "Not a fit", "Went elsewhere")
		if !checkedInput(b, "no_reply") {
			t.Error("No reply is not the default reason")
		}
		b = wd.get(leadPath + "?confirm=invite").Body.String()
		has(t, b, `value="Dana"`, `value="Reyes"`, `value="dana@example.com"`)
	})

	t.Run("no such lead, a malformed id, a failed read", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		wd.fake.rpc["agent_lead"] = "[]"
		rec := wd.get(leadPath)
		if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "No such lead") {
			t.Errorf("missing = %d", rec.Code)
		}
		if rec := wd.get("/agent/leads/nope"); rec.Code != http.StatusNotFound {
			t.Errorf("malformed = %d", rec.Code)
		}
		wd.fake.failing["agent_lead_messages"] = true
		wd.fake.rpc["agent_lead"] = leadJSON("new", nil)
		if rec := wd.get(leadPath); rec.Code != http.StatusServiceUnavailable {
			t.Errorf("failed = %d", rec.Code)
		}
	})
}

func TestLeadWrites(t *testing.T) {
	t.Run("mark contacted and reopen go back to the lead", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		rec := wd.post(leadPath, url.Values{"op": {"mark_contacted"}})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != leadPath {
			t.Fatalf("mark = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-lead")[0]
		if string(c.Body["op"]) != `"mark_contacted"` || string(c.Body["leadId"]) != `"`+leadID+`"` || len(c.Body) != 2 {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("a stale answer, and reopen's own conflict", func(t *testing.T) {
		wd := leadWorld(t, "closed", nil)
		wd.fake.functions["POST agent-lead"] = reply{409, `{"detail":"Dana already has an open lead."}`}
		rec := wd.post(leadPath, url.Values{"op": {"mark_contacted"}})
		has(t, rec.Body.String(), "That lead changed since this page loaded.")
		if rec.Code != http.StatusConflict {
			t.Errorf("stale = %d", rec.Code)
		}
		has(t, wd.post(leadPath, url.Values{"op": {"reopen"}}).Body.String(), "Dana already has an open lead.")
		wd.fake.functions["POST agent-lead"] = reply{422, `{"detail":"That lead is already closed."}`}
		has(t, wd.post(leadPath, url.Values{"op": {"reopen"}}).Body.String(), "That lead is already closed.", "alert-error")
	})

	t.Run("close sends the reason and the note, null when blank", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		wd.post(leadPath, url.Values{"op": {"close"}, "reason": {"went_elsewhere"}, "note": {"  "}})
		c := wd.fake.callsTo("agent-lead")[0]
		if string(c.Body["reason"]) != `"went_elsewhere"` || string(c.Body["note"]) != "null" {
			t.Errorf("body = %v", c.Body)
		}
		wd.fake.functions["POST agent-lead"] = reply{422, `{"detail":"Pick a reason."}`}
		rec := wd.post(leadPath, url.Values{"op": {"close"}, "reason": {"not_a_fit"}, "note": {"Moved on"}})
		b := rec.Body.String()
		if !dialogOpen(b, "lead-dlg-close") || !checkedInput(b, "not_a_fit") {
			t.Error("the close dialog lost its state")
		}
		has(t, b, "Pick a reason.", ">Moved on</textarea>")
	})

	t.Run("delete as spam goes to the list; an unknown op is refused", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		if rec := wd.post(leadPath, url.Values{"op": {"delete_spam"}}); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/leads" {
			t.Errorf("delete = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		if rec := wd.post(leadPath, url.Values{"op": {"convert"}}); rec.Code != http.StatusBadRequest {
			t.Errorf("convert from the page = %d", rec.Code)
		}
		if rec := wd.post("/agent/leads/nope", url.Values{"op": {"reopen"}}); rec.Code != http.StatusNotFound || len(wd.fake.callsTo("agent-lead")) != 1 {
			t.Errorf("malformed = %d", rec.Code)
		}
	})
}

func TestLeadInvite(t *testing.T) {
	form := url.Values{"op": {"invite"}, "firstName": {" Dana "}, "lastName": {"Reyes"}, "email": {" dana@example.com "}}

	t.Run("creates the client, invites, links the lead", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		wd.fake.functions["POST agent-client"] = reply{200, `{"outcome":"created","clientId":"0195a2c0-1a00-7000-8000-0000000000cc"}`}
		wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"sent"}`}
		rec := wd.post(leadPath, form)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != leadPath || cookieNamed(rec, receiptCookie) != nil {
			t.Fatalf("invite = %d", rec.Code)
		}
		cl := wd.fake.callsTo("agent-client")[0]
		if !strings.Contains(string(cl.Body["client"]), `"firstName":"Dana","lastName":"Reyes"`) || !strings.Contains(string(cl.Body["client"]), `"email":"dana@example.com","phone":"+15552010101"`) {
			t.Errorf("client = %s", cl.Body["client"])
		}
		inv := wd.fake.callsTo("account-admin")[0]
		if string(inv.Body["op"]) != `"invite"` || string(inv.Body["clientId"]) != `"0195a2c0-1a00-7000-8000-0000000000cc"` {
			t.Errorf("invite = %v", inv.Body)
		}
		ln := wd.fake.callsTo("agent-lead")[0]
		if string(ln.Body["op"]) != `"convert"` || string(ln.Body["clientId"]) != `"0195a2c0-1a00-7000-8000-0000000000cc"` {
			t.Errorf("link = %v", ln.Body)
		}
	})

	t.Run("an email already on a client links without sending", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		wd.fake.functions["POST agent-client"] = reply{200, `{"outcome":"duplicate_email","existingClientId":"c9"}`}
		rec := wd.post(leadPath, form)
		if c := cookieNamed(rec, receiptCookie); c == nil || len(wd.fake.callsTo("account-admin")) != 0 {
			t.Fatal("a duplicate sent an invite, or left no note")
		}
		b := wd.getWith(leadPath, cookieNamed(rec, receiptCookie)).Body.String()
		has(t, b, "That email is already on a client record, so the lead is now linked to it.", "alert-success")
	})

	t.Run("an invite that did not send says so", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		wd.fake.functions["POST agent-client"] = reply{200, `{"outcome":"created","clientId":"c2"}`}
		wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"failed"}`}
		rec := wd.post(leadPath, form)
		has(t, wd.getWith(leadPath, cookieNamed(rec, receiptCookie)).Body.String(), "the invitation didn&#39;t send")
	})

	t.Run("no last name, or a refusal, stays in the dialog", func(t *testing.T) {
		wd := leadWorld(t, "new", nil)
		b := wd.post(leadPath, url.Values{"op": {"invite"}, "firstName": {"Dana"}, "lastName": {" "}, "email": {"x@y.z"}}).Body.String()
		if !dialogOpen(b, "lead-dlg-invite") || len(wd.fake.callsTo("agent-client")) != 0 {
			t.Fatal("a blank last name reached the function")
		}
		has(t, b, "A client record needs a last name.", `value="x@y.z"`)
		wd.fake.functions["POST agent-client"] = reply{422, `{"detail":"That email doesn't look right."}`}
		has(t, wd.post(leadPath, form).Body.String(), "That email doesn&#39;t look right.")
	})
}

func TestAddLead(t *testing.T) {
	form := url.Values{"firstName": {"Ana"}, "lastName": {""}, "email": {"ana@example.com"}, "phone": {""}, "source": {"referral"}, "note": {"Honeymoon in May"}}

	t.Run("lands on the lead, or says the note joined one", func(t *testing.T) {
		wd := newWorld(t)
		has(t, wd.get("/agent/leads/new").Body.String(), "Add a lead", "How they reached you")
		wd.fake.functions["POST agent-lead"] = reply{200, `{"outcome":"created","leadId":"` + leadID + `"}`}
		if rec := wd.post("/agent/leads/new", form); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != leadPath {
			t.Errorf("create = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-lead")[0]
		if string(c.Body["op"]) != `"create"` || string(c.Body["source"]) != `"referral"` || string(c.Body["message"]) != `"Honeymoon in May"` || string(c.Body["lastName"]) != `""` {
			t.Errorf("body = %v", c.Body)
		}
		wd.fake.functions["POST agent-lead"] = reply{200, `{"outcome":"added","leadId":"` + leadID + `"}`}
		if rec := wd.post("/agent/leads/new", form); rec.Header().Get("Location") != leadPath+"?added=1" {
			t.Errorf("added = %q", rec.Header().Get("Location"))
		}
	})

	t.Run("an email on a client offers that client, and the form keeps what was typed", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.functions["POST agent-lead"] = reply{200, `{"outcome":"client_exists","clientId":"0195a2c0-1a00-7000-8000-000000000105"}`}
		b := wd.post("/agent/leads/new", form).Body.String()
		has(t, b, "That email is already on a client record.", `href="/agent/clients/0195a2c0-1a00-7000-8000-000000000105"`,
			`value="ana@example.com"`, ">Honeymoon in May</textarea>")
		i := strings.Index(b, `value="referral"`)
		if i < 0 || !strings.Contains(b[i:i+60], "selected") {
			t.Error("the source was not kept")
		}
		wd.fake.functions["POST agent-lead"] = reply{422, `{"detail":"Leave the card number out."}`}
		has(t, wd.post("/agent/leads/new", form).Body.String(), "Leave the card number out.")
	})
}
