package supa

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A rate limit or a timeout on refresh is not a revoked session (review, #178): every
// refresh now leaves from one server, so GoTrue's limit is reachable.
func TestRefreshRateLimitIsUnavailableNotSignedOut(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusRequestTimeout} {
		c, _ := fakeGoTrue(t, status, map[string]any{})
		if _, err := c.Refresh(context.Background(), "r", who); !errors.Is(err, ErrUnavailable) {
			t.Errorf("%d on refresh: err = %v, want ErrUnavailable", status, err)
		}
	}
}

// Following a redirect would copy the apikey and the visitor's bearer token elsewhere.
func TestGoTrueRedirectsAreNotFollowed(t *testing.T) {
	evilHit := false
	evil := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { evilHit = true }))
	t.Cleanup(evil.Close)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, evil.URL+"/auth/v1/user", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	_, err := New(srv.URL, "anon", nil).GetUser(context.Background(), "secret-token", who)
	if evilHit {
		t.Fatal("the client followed a redirect to another host with the token")
	}
	if !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want ErrUnavailable", err)
	}
}
