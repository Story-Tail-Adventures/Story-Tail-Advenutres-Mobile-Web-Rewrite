package public_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/config"
)

// /explore/results and /explore/{slug} overlap. Go's ServeMux prefers the literal, so the
// results page wins, but that is a property of the router rather than of anything written
// here: a later route written as /explore/{anything}, or a move to a different mux, would
// quietly send every search to the trip page's 404 instead. The page's own tests call the
// handler directly, so only this one goes through the mount.
func TestExploreResultsBeatsTheTripSlug(t *testing.T) {
	h, _ := publicServer(t, config.Production)

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/explore/results?dest=Caribbean", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("/explore/results = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "<title>Trip ideas · Story-Tail Adventures</title>") {
		t.Error("/explore/results did not render the results page")
	}

	// And the slug route still has the rest of the space.
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/explore/sandals-royal-bahamian", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("a real trip slug = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Sandals Royal Bahamian") {
		t.Error("the trip page did not render")
	}
}
