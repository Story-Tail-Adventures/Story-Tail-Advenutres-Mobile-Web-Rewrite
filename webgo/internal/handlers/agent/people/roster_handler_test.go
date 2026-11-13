package people

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// The roster page and its bulk-tag post through the real gate, against a fake Supabase.

func rosterJSON(n int, total int) string {
	var rows []map[string]any
	for i := range n {
		rows = append(rows, map[string]any{
			"client_id": fmt.Sprintf("c%d", i), "display_name": fmt.Sprintf("Client %d", i),
			"first_name": "Client", "last_name": fmt.Sprint(i), "email": fmt.Sprintf("c%d@example.com", i),
			"status": "active", "tags": []string{"vip", "family"}, "lifetime_value_cents": "1976500",
			"lifetime_currency": "USD", "trip_count": 2, "last_trip_title": "Cabo", "last_trip_end_date": "2024-01-13",
			"next_trip_title": "Negril", "next_trip_start_date": "2026-08-12", "next_trip_status": "booked",
			"as_of_date": "2026-09-26", "total_count": total,
		})
	}
	if len(rows) == 0 {
		return "[]"
	}
	return mustJSON(rows)
}

const rosterSummaryJSON = `[{"active_count":27,"in_motion_count":5,"in_inquiry":0,"inquiry_count":1,"archived_count":2,"tag_facets":[{"tag":"vip","count":4},{"tag":"family","count":2}]}]`

func TestRosterRenders(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster"] = rosterJSON(2, 27)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON
	rec := wd.get("/agent/clients?tag=vip&q=%20cli%20&page=1")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET = %d\n%s", rec.Code, wd.logs.String())
	}
	body := rec.Body.String()
	has(t, body, "<title>Clients · Story-Tail Adventures</title>",
		"27 active · 5 in motion · 1 lead to qualify.", `value="cli"`, ">vip · 4<", ">family · 2<",
		`href="/agent/clients/c0"`, ">Client 0<", ">c0@example.com<", ">$19,765<", ">Negril · Aug 26<", ">Cabo · Jan 24<",
		`aria-label="Select this client Client 0"`, `value="c0"`, ">1–2 of 27<", `href="/agent/clients?q=cli&amp;tag=vip&amp;page=2"`,
		`action="/agent/clients?tag=vip&amp;q=%20cli%20&amp;page=1"`, `data-bulk-bar`)
	lacks(t, body, "No clients yet", "Nothing matches", `data-slot="tag-3"`)
	if got := wd.fake.rpcArgs["agent_client_roster"]; got != `{"p_status":["active"],"p_tags":["vip"],"p_search":"cli","p_limit":25,"p_offset":0}` {
		t.Errorf("roster args = %s", got)
	}
	// The vip facet is ticked, family is not; Active is the status.
	if !strings.Contains(body, `checked="" class="visually-hidden" data-slot="facet-input" name="tag" type="checkbox" value="vip"`) &&
		!checkedInput(body, "vip") {
		t.Error("the vip facet is not checked")
	}
}

// checkedInput reports whether the facet input for tag carries checked (attribute order on
// render is not the file's, so look at the one tag).
func checkedInput(body, tag string) bool {
	i := strings.Index(body, `value="`+tag+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<input")
	end := i + strings.Index(body[i:], ">")
	return strings.Contains(body[start:end], "checked")
}

func TestRosterEmptyStates(t *testing.T) {
	for target, want := range map[string]string{
		"/agent/clients":                 "No clients yet",
		"/agent/clients?q=zz":            "Nothing matches",
		"/agent/clients?tag=vip":         "Nothing matches",
		"/agent/clients?status=archived": "Nothing archived",
	} {
		wd := newWorld(t)
		wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON
		body := wd.get(target).Body.String()
		has(t, body, want)
		lacks(t, body, "<table", "data-bulk-bar", "Roster pages")
	}
}

func TestRosterAFailedReadIsARetry(t *testing.T) {
	for _, failing := range []string{"agent_client_roster", "agent_client_roster_summary"} {
		wd := newWorld(t)
		wd.fake.rpc["agent_client_roster"] = rosterJSON(1, 1)
		wd.fake.failing[failing] = true
		rec := wd.get("/agent/clients?q=x")
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("%s failing = %d", failing, rec.Code)
		}
		has(t, rec.Body.String(), "That didn’t load", ">Try again<", `href="/agent/clients?q=x"`)
		lacks(t, rec.Body.String(), "Back to your trips")
	}
}

func TestBulkTag(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster"] = rosterJSON(2, 2)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON
	wd.fake.functions["POST agent-client"] = reply{200, `{"changedCount":1,"requestedCount":2}`}

	// Success: the function hears the ids and the lower-cased tag, and the visitor goes back
	// to the same filtered list with a receipt.
	rec := wd.post("/agent/clients?tag=vip&page=1", url.Values{"clientId": {"c0", "c1"}, "tag": {"  Anniv "}, "direction": {"add"}})
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/clients?tag=vip" {
		t.Fatalf("bulk tag = %d %q\n%s", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
	calls := wd.fake.callsTo("agent-client")
	if len(calls) != 1 || string(calls[0].Body["op"]) != `"bulk_tag"` || string(calls[0].Body["clientIds"]) != `["c0","c1"]` ||
		string(calls[0].Body["tag"]) != `"anniv"` || string(calls[0].Body["add"]) != "true" {
		t.Fatalf("calls = %+v", calls)
	}
	receipt := cookieNamed(rec, receiptCookie)
	if receipt == nil || !receipt.HttpOnly || receipt.MaxAge != 60 {
		t.Fatalf("receipt cookie = %+v", receipt)
	}
	got := wd.getWith("/agent/clients?tag=vip", receipt)
	has(t, got.Body.String(), `Added &#34;anniv&#34; to 1 client. The other 1 was already tagged.`, "alert-success")
	if c := cookieNamed(got, receiptCookie); c == nil || c.MaxAge >= 0 {
		t.Errorf("the receipt was not cleared: %+v", c)
	}
	// Shown once: without the cookie there is no receipt.
	lacks(t, wd.get("/agent/clients?tag=vip").Body.String(), "anniv")

	// A forged receipt (bad shape, an overlong tag) shows nothing.
	for _, v := range []string{"!!", "eyJ0IjoiIn0", "eyJ0IjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwiYyI6MSwiciI6MX0"} {
		body := wd.getWith("/agent/clients", &http.Cookie{Name: receiptCookie, Value: v}).Body.String()
		lacks(t, body, "alert-success")
	}

	// Remove goes as add=false.
	wd.post("/agent/clients", url.Values{"clientId": {"c0"}, "tag": {"vip"}, "direction": {"remove"}})
	if calls := wd.fake.callsTo("agent-client"); string(calls[len(calls)-1].Body["add"]) != "false" {
		t.Errorf("remove sent add=%s", calls[len(calls)-1].Body["add"])
	}
}

func TestBulkTagRefusals(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_client_roster"] = rosterJSON(2, 2)
	wd.fake.rpc["agent_client_roster_summary"] = rosterSummaryJSON

	for _, c := range []struct {
		form url.Values
		want string
	}{
		{url.Values{"tag": {"vip"}}, "Tick at least one client first."},
		{url.Values{"clientId": {"c0"}, "tag": {"   "}}, "Type a tag first."},
	} {
		rec := wd.post("/agent/clients", c.form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("%v = %d", c.form, rec.Code)
		}
		has(t, rec.Body.String(), c.want, "alert-error")
	}
	if n := len(wd.fake.callsTo("agent-client")); n != 0 {
		t.Errorf("a refused form reached the function %d times", n)
	}

	// The function's own sentence on a rejection; the action's outage sentence on a 5xx.
	wd.fake.functions["POST agent-client"] = reply{422, `{"type":"about:blank","title":"Unprocessable","status":422,"detail":"That tag has a character it can't hold."}`}
	rec := wd.post("/agent/clients", url.Values{"clientId": {"c0"}, "tag": {"v<i>p"}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("rejected = %d", rec.Code)
	}
	has(t, rec.Body.String(), "That tag has a character it can&#39;t hold.")
	wd.fake.functions["POST agent-client"] = reply{500, `{}`}
	rec = wd.post("/agent/clients", url.Values{"clientId": {"c0"}, "tag": {"vip"}})
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("outage = %d", rec.Code)
	}
	has(t, rec.Body.String(), "That didn&#39;t save. Try again in a moment.")
	// A lost session goes to sign in.
	wd.fake.functions["POST agent-client"] = reply{401, `{}`}
	if rec := wd.post("/agent/clients", url.Values{"clientId": {"c0"}, "tag": {"vip"}}); rec.Code != http.StatusSeeOther ||
		!strings.HasPrefix(rec.Header().Get("Location"), "/login?next=") {
		t.Errorf("401 = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// A cross-site post never reaches the handler.
	req := httptest.NewRequest(http.MethodPost, "/agent/clients", strings.NewReader("clientId=c0&tag=vip"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.AddCookie(wd.cookie())
	cross := httptest.NewRecorder()
	wd.h.ServeHTTP(cross, req)
	if cross.Code != http.StatusForbidden {
		t.Errorf("cross-site post = %d", cross.Code)
	}
}
