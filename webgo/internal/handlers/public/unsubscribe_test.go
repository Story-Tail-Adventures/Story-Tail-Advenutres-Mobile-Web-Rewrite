package public

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Ported from web/app/(public)/(plain)/email/unsubscribe/{actions,page}.test.ts and the
// token rule in lib/email/unsubscribe.ts.

// token is a token shaped like the one an email carries.
const token = "abcdefghijklmnopqrstuvwxyz"

func TestIsEmailToken(t *testing.T) {
	cases := map[string]bool{
		token:                        true,
		strings.ToUpper(token):       true,
		"abcdefghijklmnopqrstuvwxy":  false, // 25
		"abcdefghijklmnopqrstuvwxy7": true,  // digits 2-7 are base32 too
		"":                           false,
		"../../etc":                  false,
		"abcdefghijklmnopqrstuvwxy1": false, // base32 has no 1
		"abcdefghijklmnopqrstuvwx y": false,
	}
	for in, want := range cases {
		if got := isEmailToken(in); got != want {
			t.Errorf("isEmailToken(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestReadUnsubStatus(t *testing.T) {
	cases := map[string]unsubStatus{
		`{"status":"on"}`:      unsubOn,
		`{"status":"off"}`:     unsubOff,
		`{"status":"invalid"}`: unsubInvalid,
		// Anything else is "unavailable": a page that guessed would tell somebody their
		// emails were off when nothing had changed.
		`{"status":"maybe"}`: unsubUnavailable,
		`{}`:                 unsubUnavailable,
		`null`:               unsubUnavailable,
		`"on"`:               unsubUnavailable,
		`not json`:           unsubUnavailable,
	}
	for in, want := range cases {
		if got := readUnsubStatus([]byte(in)); got != want {
			t.Errorf("readUnsubStatus(%s) = %q, want %q", in, got, want)
		}
	}
}

func TestUnsubscribeViewByState(t *testing.T) {
	cases := []struct {
		name          string
		view          unsubscribeView
		title, body   string
		label         string
		on, hasAction bool
		signIn        bool
		failed        bool
	}{
		{
			name: "on asks, with one button", view: unsubscribeView{Status: unsubOn, Token: token},
			title: unsubOnTitle, body: unsubOnBody, label: unsubStop, hasAction: true,
		},
		{
			name:  "back on says so and still offers to stop",
			view:  unsubscribeView{Status: unsubOn, Token: token, Done: "on"},
			title: unsubBackOnTitle, body: unsubOnBody, label: unsubStop, hasAction: true,
		},
		{
			name:  "off offers to turn them back on",
			view:  unsubscribeView{Status: unsubOff, Token: token, Done: "off"},
			title: unsubOffTitle, body: unsubOffBody, label: unsubTurnBackOn, on: true, hasAction: true,
		},
		{
			name:  "an invalid link offers sign-in instead",
			view:  unsubscribeView{Status: unsubInvalid},
			title: unsubInvalidTitle, body: unsubInvalidBody, signIn: true,
		},
		{
			name:  "a failed read offers nothing rather than guessing",
			view:  unsubscribeView{Status: unsubUnavailable, Token: token},
			title: unsubUnavailableTitle, body: unsubUnavailableBody,
		},
		{
			name:  "a press that failed says so above the same question",
			view:  unsubscribeView{Status: unsubOn, Token: token, Done: "error"},
			title: unsubOnTitle, body: unsubOnBody, label: unsubStop, hasAction: true, failed: true,
		},
		{
			// There is no question to put it above, so the note would be about nothing.
			name:  "done=error on a link that does not work shows no note",
			view:  unsubscribeView{Status: unsubInvalid, Done: "error"},
			title: unsubInvalidTitle, body: unsubInvalidBody, signIn: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.view.title(); got != c.title {
				t.Errorf("title = %q, want %q", got, c.title)
			}
			if got := c.view.body(); got != c.body {
				t.Errorf("body = %q, want %q", got, c.body)
			}
			label, on, ok := c.view.action()
			if ok != c.hasAction || label != c.label || on != c.on {
				t.Errorf("action = (%q, %v, %v), want (%q, %v, %v)", label, on, ok, c.label, c.on, c.hasAction)
			}
			if got := c.view.signIn(); got != c.signIn {
				t.Errorf("signIn = %v, want %v", got, c.signIn)
			}
			if got := c.view.failed(); got != c.failed {
				t.Errorf("failed = %v, want %v", got, c.failed)
			}
		})
	}
}

func TestUnsubscribeOpeningTheLinkChangesNothing(t *testing.T) {
	s, fake := formSite(t)
	fake.answer(http.StatusOK, `{"status":"on"}`)
	rec := get(t, s.unsubscribe(s.template(t, unsubscribeSpec)), "/email/unsubscribe?t="+token)

	body := rec.Body.String()
	if !strings.Contains(body, htmlEscape(unsubOnTitle)) {
		t.Errorf("the question is missing:\n%s", body)
	}
	if !strings.Contains(body, unsubStop) || !strings.Contains(body, `type="submit"`) {
		t.Error("the one button is missing")
	}
	calls := fake.taken()
	if len(calls) != 1 {
		t.Fatalf("calls = %+v", calls)
	}
	if calls[0].Method != http.MethodGet {
		t.Errorf("the page read the switch with %s; a link scanner must change nothing", calls[0].Method)
	}
	if got := calls[0].Query.Get("t"); got != token {
		t.Errorf("token = %q", got)
	}
	if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Errorf("Referrer-Policy = %q, want no-referrer: the URL carries a token", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if !strings.Contains(body, `<meta name="robots" content="noindex, nofollow"/>`) {
		t.Error("a per-person link is indexed or followed")
	}
}

func TestUnsubscribeMalformedTokenIsNeverSentAnywhere(t *testing.T) {
	s, fake := formSite(t)
	rec := get(t, s.unsubscribe(s.template(t, unsubscribeSpec)), "/email/unsubscribe?t=../../etc")
	if len(fake.taken()) != 0 {
		t.Error("a token that cannot be one was sent to the function")
	}
	body := rec.Body.String()
	if !strings.Contains(body, htmlEscape(unsubInvalidTitle)) {
		t.Errorf("the dead-link page is missing:\n%s", body)
	}
	if !strings.Contains(body, `href="/login"`) {
		t.Error("the sign-in link is missing")
	}
	if strings.Contains(body, `type="submit"`) {
		t.Error("a link that does not work still offers a button")
	}
}

func TestUnsubscribeOffShowsTheWayBack(t *testing.T) {
	s, fake := formSite(t)
	fake.answer(http.StatusOK, `{"status":"off"}`)
	rec := get(t, s.unsubscribe(s.template(t, unsubscribeSpec)), "/email/unsubscribe?t="+token+"&done=off")
	body := rec.Body.String()
	if !strings.Contains(body, htmlEscape(unsubOffTitle)) || !strings.Contains(body, unsubTurnBackOn) {
		t.Errorf("the off state is wrong:\n%s", body)
	}
	if !strings.Contains(body, `name="on" value="true"`) {
		t.Error("the button does not post the switch it offers")
	}
	if !strings.Contains(body, "btn-outlined") {
		t.Error("turning them back on is drawn as the quieter button")
	}
}

func TestUnsubscribePressGoesBackToReadItFresh(t *testing.T) {
	s, fake := formSite(t)
	h := s.unsubscribePost()
	cases := []struct {
		name, status, wantDone string
		on                     string
		wantOn                 bool
	}{
		{"stopping them", `{"status":"off"}`, "off", "false", false},
		{"turning them back on", `{"status":"on"}`, "on", "true", true},
		{"a failed update says so", `{"status":"nope"}`, "error", "false", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fake.answer(http.StatusOK, c.status)
			rec := post(t, h, "/email/unsubscribe", url.Values{"t": {token}, "on": {c.on}})
			if rec.Code != http.StatusSeeOther {
				t.Fatalf("status = %d, want 303", rec.Code)
			}
			loc, err := url.Parse(rec.Header().Get("Location"))
			if err != nil || loc.Path != unsubscribePath {
				t.Fatalf("Location = %q", rec.Header().Get("Location"))
			}
			if got := loc.Query().Get("done"); got != c.wantDone {
				t.Errorf("done = %q, want %q", got, c.wantDone)
			}
			if got := loc.Query().Get("t"); got != token {
				t.Errorf("the token did not come back: %q", got)
			}
			calls := fake.taken()
			if len(calls) != 1 || calls[0].Method != http.MethodPost {
				t.Fatalf("calls = %+v", calls)
			}
			var body unsubscribeBody
			if err := json.Unmarshal([]byte(calls[0].Body), &body); err != nil {
				t.Fatal(err)
			}
			if body.Token != token || body.On != c.wantOn {
				t.Errorf("body = %+v, want token %q on %v", body, token, c.wantOn)
			}
			if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
				t.Errorf("Referrer-Policy = %q", got)
			}
		})
	}
}

func TestUnsubscribePressWithAMalformedTokenGoesNowhere(t *testing.T) {
	s, fake := formSite(t)
	rec := post(t, s.unsubscribePost(), "/email/unsubscribe", url.Values{"t": {"nope"}, "on": {"false"}})
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != unsubscribePath {
		t.Errorf("status %d to %q, want 303 to %s", rec.Code, rec.Header().Get("Location"), unsubscribePath)
	}
	if len(fake.taken()) != 0 {
		t.Error("the function was called with a token that cannot be one")
	}
}
