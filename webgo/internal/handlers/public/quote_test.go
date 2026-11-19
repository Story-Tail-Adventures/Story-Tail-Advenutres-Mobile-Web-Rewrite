package public_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
)

// /quote only redirects: it never renders, never stores and never calls anything. The link
// it builds is search.QuoteRedirect's, which is tested against the TypeScript's own output;
// what matters here is that the route answers 303 with a relative Location and costs nothing.
func TestQuoteRedirects(t *testing.T) {
	h, rec := publicServer(t, config.Production)
	cases := map[string]string{
		"/quote?topic=caribbean":                     "/join?intent=quote",
		"/quote?topic=honeymoons&dest=St.+Lucia":     "/join?intent=quote",
		"/quote":                                     "/explore",
		"/quote?topic=nonsense":                      "/explore",
		"/quote?topic=caribbean&next=//evil.example": "/join?intent=quote",
	}
	for path, wantPrefix := range cases {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusSeeOther {
			t.Errorf("%s: status %d, want 303", path, w.Code)
		}
		loc := w.Header().Get("Location")
		if len(loc) == 0 || loc[0] != '/' {
			t.Errorf("%s: Location %q is not a relative path", path, loc)
		}
		if len(loc) < len(wantPrefix) || loc[:len(wantPrefix)] != wantPrefix {
			t.Errorf("%s: Location %q, want it to start with %q", path, loc, wantPrefix)
		}
	}
	if calls := rec.taken(); len(calls) > 0 {
		t.Errorf("/quote called Supabase: %v", calls)
	}
}
