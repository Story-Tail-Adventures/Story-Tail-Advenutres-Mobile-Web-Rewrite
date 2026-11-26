package people

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// What the go-reviewer pass on the clients PR proved, kept as regression tests. Each case is
// a place Go read a value differently from Next.

func TestReviewJSONNullsReadAsNextReadsThem(t *testing.T) {
	// important_dates: a null date is no date, a null label is "Date", never the last value read.
	got := importantDatesOf(json.RawMessage(`[{"label":"Anniversary","date":null},{"label":null,"date":"2020-06-12"},{"label":null,"date":null},{"label":"Trip","date":"2026-01-01","recurring":1}]`))
	want := []importantDate{{Label: "Anniversary"}, {Label: "Date", Date: "2020-06-12"}, {Label: "Trip", Date: "2026-01-01"}}
	if len(got) != len(want) {
		t.Fatalf("importantDatesOf = %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("importantDatesOf[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	if e := emergencyOf(json.RawMessage(`{"name":null,"phone":"+15550100"}`)); e != nil {
		t.Errorf("a null name is no contact: %+v", *e)
	}
	if e := emergencyOf(json.RawMessage(`{"name":"Sam","phone":null,"relationship":7}`)); e == nil || e.Phone != "" || e.Relationship != "" {
		t.Errorf("emergencyOf = %+v", e)
	}

	for typ, want := range map[string]string{"client.tag_added": "Tag added", "trip.status_changed": "Trip status changed"} {
		if got := describeEvent(typ, json.RawMessage(`{"tag":null,"to":null}`)); got != want {
			t.Errorf("describeEvent(%s, nulls) = %q, want %q", typ, got, want)
		}
	}
}

func TestReviewOverviewWithANullDate(t *testing.T) {
	wd := detailWorld(t)
	wd.fake.rpc["agent_client_overview"] = overviewJSON(map[string]any{
		"important_dates": []any{map[string]any{"label": "Anniversary", "date": nil}},
	})
	if body := wd.get(detailPath).Body.String(); strings.Contains(body, "ersary") && !strings.Contains(body, "Anniversary") || strings.Contains(body, "Anniversary · ersary") {
		t.Error(`the overview shows the label's tail as the date`)
	}
}

func TestReviewToFixedRoundsATieUp(t *testing.T) {
	for raw, want := range map[string]string{"1310720": "1.3 MB", "1153434": "1.1 MB", "1048576": "1.0 MB", "3932160": "3.8 MB"} {
		if got := fileSize(raw); got != want {
			t.Errorf("fileSize(%s) = %q, want %q", raw, got, want)
		}
	}
}

func TestReviewJavaScriptWhitespace(t *testing.T) {
	for raw, want := range map[string]string{"+44\u00a020\u00a07946\u00a00958": "+442079460958", "(305)\u2009555-0199": "+13055550199"} {
		if got, ok := normalizePhone(raw); !ok || got != want {
			t.Errorf("normalizePhone(%q) = %q, %v; want %q", raw, got, ok, want)
		}
	}
	// trim() keeps U+0085 (not JS whitespace) and strips U+FEFF and U+00A0.
	if got := jsTrim("\u0085x\u00a0\ufeff"); got != "\u0085x" {
		t.Errorf("jsTrim = %q", got)
	}
	if emailShaped("a\ufeffb@example.com") || !emailShaped("a\u0085b@example.com") {
		t.Error("emailShaped uses JavaScript's \\s")
	}
}

// An outage during a post: the function fails, then the re-render's read fails too. "Try
// again" must be a page, never the POST-only path (a 405).
func TestReviewRetryAfterAFailedPost(t *testing.T) {
	for _, tc := range []struct {
		path, fn, want string
		form           url.Values
	}{
		{detailPath + "/notes", "agent-client-notes", detailPath + "?tab=notes", url.Values{"op": {"create"}, "body": {"hi"}}},
		{detailPath + "/archive", "agent-client", detailPath, url.Values{"expectedVersion": {"4"}, "archived": {"true"}}},
		{detailPath + "/account", "account-admin", detailPath + "?tab=account", url.Values{"op": {"invite"}}},
	} {
		wd := detailWorld(t)
		wd.fake.functions["POST "+tc.fn] = reply{Status: 503, Body: `{"title":"down"}`}
		wd.fake.failing["agent_client_overview"] = true
		rec := wd.post(tc.path, tc.form)
		if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), `href="`+strings.ReplaceAll(tc.want, "&", "&amp;")+`"`) {
			t.Errorf("%s: %d, retry is not %s", tc.path, rec.Code, tc.want)
		}
	}
}

func TestReviewABlockedTileOpensNoDialog(t *testing.T) {
	wd := detailWorld(t)
	// A duplicate email blocks Invite.
	wd.fake.rpc["agent_client_account_admin"] = `{"needsMfa":false,"firstName":"Imani","clientEmail":"imani@example.com","hasSignIn":false,"signInEmailsLastHour":1,"duplicateEmail":true,"duplicateEmailClientId":"c-dup"}`
	if b := wd.get(detailPath + "?tab=account&confirm=invite").Body.String(); dialogOpen(b, "acc-dlg-invite") {
		t.Error("?confirm=invite opened a refused tile's dialog")
	}
	wd.fake.rpc["agent_client_account_admin"] = `{"needsMfa":false,"firstName":"Imani","clientEmail":"imani@example.com","hasSignIn":false,"signInEmailsLastHour":1}`
	if b := wd.get(detailPath + "?tab=account&confirm=invite").Body.String(); !dialogOpen(b, "acc-dlg-invite") {
		t.Error("?confirm=invite did not open an open tile's dialog")
	}
}

func TestReviewAReceiptShowsOnlyOnItsOwnRecord(t *testing.T) {
	wd := detailWorld(t)
	wd.fake.rpc["agent_client_account_admin"] = `{"needsMfa":false,"firstName":"Imani","clientEmail":"imani@example.com","hasSignIn":false,"signInEmailsLastHour":1}`
	wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"sent"}`}
	c := cookieNamed(wd.post(detailPath+"/account", url.Values{"op": {"invite"}}), receiptCookie)
	if c == nil {
		t.Fatal("no receipt")
	}
	if b := wd.getWith("/agent/clients/c-other?tab=account", c).Body.String(); strings.Contains(b, "acc-status-box") && strings.Contains(b, "alert-success") {
		t.Error("the receipt showed on another client's page")
	}
	if b := wd.getWith(detailPath+"?tab=account", c).Body.String(); !strings.Contains(b, "alert-success") {
		t.Error("the receipt did not show on its own client's page")
	}
}
