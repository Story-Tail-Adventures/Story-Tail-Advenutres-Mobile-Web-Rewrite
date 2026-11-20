package session

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Review hard fail (#178): GoTrue answers an expired token's sign-out with 401, which looks
// like success, so the refreshed session stayed alive. End must use a live token.

func TestEndUsesTheTokenTheGateChecked(t *testing.T) {
	f := newFake()
	stale := supa.Tokens{AccessToken: "stale", RefreshToken: "r0", ExpiresAt: time.Now().Add(-time.Minute).Unix()}
	r := requestWith(&stale, true)
	r = r.WithContext(WithState(r.Context(), State{SignedIn: true, AccessToken: "live-from-gate"}))
	manager(f).End(httptest.NewRecorder(), r)
	if len(f.signedOut) != 1 || f.signedOut[0] != "live-from-gate" {
		t.Errorf("signed out with %v, want the gate's live token", f.signedOut)
	}
}

func TestEndRefreshesAnExpiredCookieTokenFirst(t *testing.T) {
	f := newFake()
	f.refreshable["r0"] = true
	stale := supa.Tokens{AccessToken: "stale", RefreshToken: "r0", ExpiresAt: time.Now().Add(-time.Minute).Unix()}
	rec := httptest.NewRecorder()
	manager(f).End(rec, requestWith(&stale, true))
	if f.refreshCalls != 1 || len(f.signedOut) != 1 || f.signedOut[0] == "stale" {
		t.Errorf("refreshes=%d signedOut=%v, want one refresh then a live token", f.refreshCalls, f.signedOut)
	}
	for _, name := range []string{CookieName, FlagCookie} {
		if c := cookie(rec, name); c == nil || c.MaxAge >= 0 {
			t.Errorf("%s not cleared", name)
		}
	}
}

func TestEndClearsCookiesEvenWhenGoTrueIsDown(t *testing.T) {
	f := newFake()
	f.down = true
	tok := supa.Tokens{AccessToken: "a", RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	manager(f).End(rec, requestWith(&tok, true))
	for _, name := range []string{CookieName, FlagCookie} {
		if c := cookie(rec, name); c == nil || c.MaxAge >= 0 {
			t.Errorf("%s survived an outage at sign-out", name)
		}
	}
}
