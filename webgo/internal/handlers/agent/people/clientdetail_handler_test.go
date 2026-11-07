package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Client Detail, its notes and archive posts, and the account admin tab, through the real
// gate against a fake Supabase.

const detailPath = "/agent/clients/c-imani"

func detailWorld(t *testing.T) *world {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_overview"] = overviewJSON(map[string]any{
		"trip_count": 2, "document_count": 1, "note_count": 1, "tags": []string{"vip", "<b>x</b>"},
		"preferred_destinations": []string{"Caribbean"}, "loyalty_programs": []any{map[string]any{"program": "AAdvantage", "number": "SECRET9", "tier": "Gold"}},
		"emergency_contact":    map[string]any{"name": "Dominic", "phone": "+1-555-0100", "relationship": "spouse"},
		"lifetime_value_cents": "2480000", "lifetime_currency": "USD", "phone": "+1 (305) 555-0199",
	})
	wd.fake.rpc["agent_client_lead_origin"] = `[{"lead_id":"lead-9","created_at":"2026-09-22T00:30:00+00:00"}]`
	wd.fake.rpc["agent_client_companions"] = `[{"companion_id":"cp1","first_name":"Dominic","last_name":"Osei","relationship":"spouse","passport_expiry":"2099-01-01","invited":false}]`
	wd.fake.rpc["agent_client_trips"] = `[{"trip_id":"t1","title":"Maldives","status":"booked","start_date":"2027-04-24","end_date":"2027-05-04","destinations":["Malé"],"total_value_cents":"2480000","total_commission_cents":"297600","currency":"USD","as_of_date":"2026-09-26"},{"trip_id":"t2","title":"Old one","status":"completed","start_date":"2025-01-06","end_date":"2025-01-13","total_value_cents":"100","total_commission_cents":"0","currency":"USD","as_of_date":"2026-09-26"}]`
	wd.fake.rpc["agent_client_conversations"] = `[{"conversation_id":"cv1","trip_title":"Maldives","subject":null,"last_message_at":"2026-09-26T12:00:00Z","last_message_preview":null,"agent_unread_count":2,"message_count":5}]`
	wd.fake.rpc["agent_client_documents"] = `[{"document_id":"d1","kind":"passport","filename":"passport.pdf","mime_type":"application/pdf","size_bytes":"1153434","is_sensitive":true,"trip_title":null}]`
	wd.fake.rpc["agent_client_notes"] = `[{"note_id":"n1","body":"Wants a <villa>.","author_name":"Gyasi Story","author_is_me":true,"created_at":"2026-09-14T10:00:00Z","updated_at":"2026-09-20T10:00:00Z"},{"note_id":"n2","body":"Not mine.","author_name":"Other","author_is_me":false,"created_at":"2026-09-14T10:00:00Z","updated_at":"2026-09-14T10:00:00Z"}]`
	wd.fake.rpc["agent_client_activity"] = `[{"event_id":"e1","event_type":"client.tag_added","metadata":{"tag":"vip"},"actor_name":"Gyasi Story","created_at":"2026-09-23T10:00:00Z"}]`
	return wd
}

func TestClientDetailOverview(t *testing.T) {
	wd := detailWorld(t)
	rec := wd.get(detailPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET = %d\n%s", rec.Code, wd.logs.String())
	}
	body := rec.Body.String()
	has(t, body, "<title>Client · Story-Tail Adventures</title>", ">Imani Osei<", ">IO<", "&lt;b&gt;x&lt;/b&gt;",
		">Since Jan 2024<", `href="tel:+13055550199"`, `href="/agent/messages/new?client=c-imani"`, ">Message Imani Osei<",
		"First reached out as a lead on ", `href="/agent/leads/lead-9"`, ">Sep 21<",
		">Trips · 2<", ">Documents · 1<", ">Notes · 1<", `href="/agent/clients/c-imani?tab=trips"`,
		">Snapshot<", ">Toronto<", ">Caribbean<", ">AAdvantage · Gold<", ">Dominic · spouse · +1-555-0100<",
		">$24,800<", ">Dominic Osei · spouse<", ">Passport Jan 1, 2099<", `href="/agent/clients/c-imani/edit"`,
		`href="/agent/clients/c-imani/merge"`, `data-dialog-open="archive-dialog"`, "ARCHIVE CLIENT")
	lacks(t, body, "SECRET9", "Archived. They keep", ">Wants a")
	for _, read := range []string{"agent_client_trips", "agent_client_notes", "agent_client_account_admin"} {
		if _, ran := wd.fake.rpcArgs[read]; ran {
			t.Errorf("the overview ran %s", read)
		}
	}
}

func TestClientDetailTabs(t *testing.T) {
	for tab, want := range map[string][]string{
		"trips":     {">Active · 1<", ">Past · 1<", ">Cancelled · 0<", `href="/agent/trips/t1"`, ">Comm $2,976<", "status-booked", "status-past", ">Apr 24 – May 4, 2027 · Malé<"},
		"messages":  {`href="/agent/messages/cv1"`, ">Maldives<", ">5 messages<", ">2<", " unread"},
		"documents": {">passport.pdf<", ">1.1 MB<", ">Sensitive<", "ppl-badge-pdf"},
		"notes":     {">Wants a &lt;villa&gt;.<", "· edited", `href="/agent/clients/c-imani?tab=notes&amp;edit=n1"`, ">Not mine.<", "NEW NOTE · INTERNAL ONLY"},
		"activity":  {">Tagged &#34;vip&#34;<", " · Gyasi Story", "Sign-ins are on the Account admin tab in the web app."},
	} {
		wd := detailWorld(t)
		rec := wd.get(detailPath + "?tab=" + tab)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d\n%s", tab, rec.Code, wd.logs.String())
		}
		has(t, rec.Body.String(), want...)
		if !strings.Contains(rec.Body.String(), `aria-current="page" class="chip tap-target shrink-0 chip-secondary" data-slot="ctab-`+tab) &&
			!strings.Contains(rec.Body.String(), `aria-current="page"`) {
			t.Errorf("%s: no current tab", tab)
		}
	}
	// Only my own note has Edit; the other advisor's has none.
	wd := detailWorld(t)
	body := wd.get(detailPath + "?tab=notes").Body.String()
	if strings.Count(body, ">Edit<") != 1 {
		t.Errorf("Edit links = %d", strings.Count(body, ">Edit<"))
	}
	// The edit and confirm views.
	has(t, wd.get(detailPath+"?tab=notes&edit=n1").Body.String(), `name="noteId"`, `value="n1"`, "Wants a &lt;villa&gt;.</textarea>", `aria-label="Edit note from Sep 14, 2026"`)
	has(t, wd.get(detailPath+"?tab=notes&confirm=n1").Body.String(), "Delete this note?", `value="archive"`)
	// Someone else's note cannot be put into edit mode by URL.
	lacks(t, wd.get(detailPath+"?tab=notes&edit=n2").Body.String(), "Not mine.</textarea>")
}

func TestClientDetailFailures(t *testing.T) {
	wd := detailWorld(t)
	wd.fake.rpc["agent_client_overview"] = "[]"
	if rec := wd.get(detailPath); rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "No such client") {
		t.Errorf("unknown client = %d", rec.Code)
	}
	wd = detailWorld(t)
	wd.fake.failing["agent_client_overview"] = true
	if rec := wd.get(detailPath); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("overview failing = %d", rec.Code)
	}
	// A tab's read failing is RetryState in the tab, the header still there.
	wd = detailWorld(t)
	wd.fake.failing["agent_client_trips"] = true
	rec := wd.get(detailPath + "?tab=trips")
	has(t, rec.Body.String(), ">Imani Osei<", "That didn’t load", `href="/agent/clients/c-imani?tab=trips"`)
	lacks(t, rec.Body.String(), "No trips yet.")
	// The lead-origin read failing just shows no origin.
	wd = detailWorld(t)
	wd.fake.failing["agent_client_lead_origin"] = true
	rec = wd.get(detailPath)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "First reached out") {
		t.Errorf("origin failing = %d", rec.Code)
	}
	// Empty tabs say so.
	wd = detailWorld(t)
	for read, tab := range map[string]string{"agent_client_trips": "trips", "agent_client_conversations": "messages",
		"agent_client_documents": "documents", "agent_client_notes": "notes", "agent_client_activity": "activity", "agent_client_companions": "overview"} {
		wd.fake.rpc[read] = "[]"
		want := map[string]string{"trips": "No trips yet.", "messages": "No conversations yet.", "documents": "No documents on file for this client.",
			"notes": "No notes yet. This is where you keep what you&#39;d otherwise try to remember.", "activity": "Nothing recorded yet.", "overview": "No one else on file."}[tab]
		has(t, wd.get(detailPath+"?tab="+tab).Body.String(), want)
	}
}

func TestClientNotes(t *testing.T) {
	wd := detailWorld(t)
	rec := wd.post(detailPath+"/notes", url.Values{"op": {"create"}, "body": {"   "}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("empty note = %d", rec.Code)
	}
	has(t, rec.Body.String(), "A note needs something in it.")

	rec = wd.post(detailPath+"/notes", url.Values{"op": {"create"}, "body": {"Call about the villa"}})
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != detailPath+"?tab=notes" {
		t.Fatalf("create = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if cookieNamed(rec, "sta-flash") == nil {
		t.Error("no Saved flash")
	}
	c := wd.fake.callsTo("agent-client-notes")[0]
	if string(c.Body["op"]) != `"create"` || string(c.Body["clientId"]) != `"c-imani"` || string(c.Body["body"]) != `"Call about the villa"` {
		t.Errorf("create body = %v", c.Body)
	}
	if _, sent := c.Body["noteId"]; sent {
		t.Error("create sent a noteId")
	}

	wd.post(detailPath+"/notes", url.Values{"op": {"archive"}, "noteId": {"n1"}})
	c = wd.fake.callsTo("agent-client-notes")[1]
	if string(c.Body["op"]) != `"archive"` || string(c.Body["noteId"]) != `"n1"` {
		t.Errorf("archive body = %v", c.Body)
	}
	if _, sent := c.Body["body"]; sent {
		t.Error("archive sent a body")
	}

	// A rejected update stays in its edit form with what was typed.
	wd.fake.functions["POST agent-client-notes"] = reply{403, `{}`}
	if rec := wd.post(detailPath+"/notes", url.Values{"op": {"update"}, "noteId": {"n1"}, "body": {"x"}}); rec.Code != http.StatusSeeOther {
		t.Errorf("403 = %d", rec.Code)
	}
	wd.fake.functions["POST agent-client-notes"] = reply{422, `{"detail":"Only the author can edit a note."}`}
	rec = wd.post(detailPath+"/notes", url.Values{"op": {"update"}, "noteId": {"n1"}, "body": {"my new words"}})
	has(t, rec.Body.String(), "Only the author can edit a note.", "my new words</textarea>")
	if rec := wd.post(detailPath+"/notes", url.Values{"op": {"drop"}}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown op = %d", rec.Code)
	}
}

func TestClientArchive(t *testing.T) {
	wd := detailWorld(t)
	if b := wd.get(detailPath + "?confirm=archive").Body.String(); !dialogOpen(b, "archive-dialog") || !strings.Contains(b, "Archive Imani Osei?") {
		t.Error("?confirm=archive did not open the dialog")
	}
	rec := wd.post(detailPath+"/archive", url.Values{"expectedVersion": {"4"}, "archived": {"true"}, "reason": {" cold lead "}})
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != detailPath {
		t.Fatalf("archive = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	c := wd.fake.callsTo("agent-client")[0]
	if string(c.Body["op"]) != `"archive"` || string(c.Body["archived"]) != "true" || string(c.Body["expectedVersion"]) != "4" || string(c.Body["reason"]) != `"cold lead"` {
		t.Errorf("archive body = %v", c.Body)
	}
	wd.fake.functions["POST agent-client"] = reply{409, `{"detail":"stale"}`}
	rec = wd.post(detailPath+"/archive", url.Values{"expectedVersion": {"3"}, "archived": {"true"}, "reason": {"kept"}})
	if rec.Code != http.StatusConflict {
		t.Errorf("stale = %d", rec.Code)
	}
	has(t, rec.Body.String(), "This client changed since you opened it. Reload and try again.", "kept</textarea>")
	if !dialogOpen(rec.Body.String(), "archive-dialog") {
		t.Error("the archive dialog closed on its error")
	}

	// An archived client offers Restore, with no reason box.
	wd = detailWorld(t)
	wd.fake.rpc["agent_client_overview"] = overviewJSON(map[string]any{"archived_at": "2026-09-01T00:00:00Z"})
	body := wd.get(detailPath).Body.String()
	has(t, body, "RESTORE CLIENT", "Restore Imani Osei?", "Archived. They keep their trips and their history.", `value="false"`)
	lacks(t, body, "Reason (optional)")
}

func TestClientAccountAdmin(t *testing.T) {
	wd := detailWorld(t)
	wd.fake.rpc["agent_client_account_admin"] = `{"needsMfa":true,"agentHasFactor":true}`
	body := wd.get(detailPath + "?tab=account").Body.String()
	has(t, body, "Two-step sign-in first", "These tools need a fresh two-step check.", ">Verify now<",
		`href="/login/mfa?next=%2Fagent%2Fclients%2Fc-imani%3Ftab%3Daccount"`)
	lacks(t, body, "Quick actions", "acc-dlg-reset")

	wd.fake.rpc["agent_client_account_admin"] = `{"needsMfa":false,"firstName":"Imani","clientEmail":"imani@example.com","hasSignIn":false,"signInEmailsLastHour":1,"duplicateEmail":true,"duplicateEmailClientId":"c-dup"}`
	body = wd.get(detailPath + "?tab=account").Body.String()
	has(t, body, "Hasn&#39;t signed in yet", "Imani doesn&#39;t have a sign-in yet.", "Another client record has this email. Merge them first.",
		`href="/agent/clients/c-dup"`, "2 more sign-in emails this hour.", `href="/agent/clients/c-imani/merge"`)

	wd.fake.rpc["agent_client_account_admin"] = mustJSON(map[string]any{"needsMfa": false, "firstName": "Imani", "clientEmail": "imani@example.com",
		"hasSignIn": true, "agentTimeZone": "America/Chicago", "signInEmail": "imani@example.com", "emailVerifiedAt": "2026-01-01T00:00:00Z",
		"hasPassword": true, "providers": []string{"email"}, "signInEmailsLastHour": 3, "lastLoginAt": "2026-10-16T17:00:00Z",
		"activity": []any{map[string]any{"id": "ev1", "at": "2026-10-16T17:00:00Z", "userAgent": "Ktor client", "ip": nil, "flagged": true}}})
	body = wd.get(detailPath + "?tab=account").Body.String()
	has(t, body, "Quick actions", "That&#39;s 3 sign-in emails this hour.", "Already verified.", "Not signed in anywhere right now.",
		">Story-Tail app<", ">Not recorded<", ">Flagged<", ">Clear flag<", `value="unflag"`, `value="ev1"`, "ppl-flagged", ">Lock account<")
	lacks(t, body, "Unlock account")
	if !dialogOpen(wd.get(detailPath+"?tab=account&confirm=lock").Body.String(), "acc-dlg-lock") {
		t.Error("?confirm=lock did not open the lock dialog")
	}

	// A field that is too short stays in its dialog, and the function never hears it.
	rec := wd.post(detailPath+"/account", url.Values{"op": {"lock"}, "reason": {"  "}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("no reason = %d", rec.Code)
	}
	has(t, rec.Body.String(), "Add a short reason.")
	if len(wd.fake.callsTo("account-admin")) != 0 {
		t.Error("a refused field reached the function")
	}

	// A success comes back as the tab's status line, its address from the view.
	wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"sent"}`}
	rec = wd.post(detailPath+"/account", url.Values{"op": {"magic_link"}})
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != detailPath+"?tab=account" {
		t.Fatalf("magic = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if c := wd.fake.callsTo("account-admin")[0]; string(c.Body["op"]) != `"magic_link"` || string(c.Body["clientId"]) != `"c-imani"` {
		t.Errorf("body = %v", c.Body)
	}
	has(t, wd.getWith(detailPath+"?tab=account", cookieNamed(rec, receiptCookie)).Body.String(), "Sent. It&#39;s on its way to imani@example.com.")

	// A stale MFA reads as "verify again", in the dialog.
	wd.fake.functions["POST account-admin"] = reply{403, `{"detail":"MFA was verified too long ago"}`}
	if rec := wd.post(detailPath+"/account", url.Values{"op": {"reset"}}); rec.Code != http.StatusSeeOther {
		t.Errorf("403 = %d (a 403 is a lost session)", rec.Code)
	}
	wd.fake.functions["POST account-admin"] = reply{422, `{"detail":"Action requires multi-factor authentication within 10 minutes"}`}
	rec = wd.post(detailPath+"/account", url.Values{"op": {"reset"}})
	has(t, rec.Body.String(), "Verify your two-step sign-in again, then try once more.")
	if !dialogOpen(rec.Body.String(), "acc-dlg-reset") {
		t.Error("the reset dialog is not open with its error")
	}
	// A flag result is the status line.
	wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"capped"}`}
	rec = wd.post(detailPath+"/account", url.Values{"op": {"flag"}, "authEventId": {"ev1"}})
	has(t, rec.Body.String(), "alert-warning", "That&#39;s 3 sign-in emails this hour.")
	if rec := wd.post(detailPath+"/account", url.Values{"op": {"delete_everything"}}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown op = %d", rec.Code)
	}

	// No such client: the read answers null.
	wd.fake.rpc["agent_client_account_admin"] = "null"
	if rec := wd.get(detailPath + "?tab=account"); rec.Code != http.StatusNotFound {
		t.Errorf("null account = %d", rec.Code)
	}
}

// dialogOpen reports whether the <dialog id=…> carries open (render order is not the file's).
func dialogOpen(body, id string) bool {
	i := strings.Index(body, `id="`+id+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<dialog")
	end := i + strings.Index(body[i:], ">")
	return start >= 0 && strings.Contains(body[start:end], ` open=""`)
}
