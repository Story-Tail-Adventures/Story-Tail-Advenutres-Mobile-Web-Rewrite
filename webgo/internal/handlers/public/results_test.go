package public

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/static"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The results page is loaded here the way the server loads it — through the real asset table,
// so a renamed stylesheet, a missing icon or anything the CSP would block fails this test as
// well as the boot — and then driven by URL, which is the only state it has.

// serpKey is the metered credential the page must never let out: not into the HTML, not into
// a link, not into an attribute. The searcher is switched OFF, which is also what stops the
// test from reaching the real provider.
const serpKey = "test-serpapi-key-must-not-leak"

func resultsSite(t *testing.T) (*site, *page.Template) {
	t.Helper()
	assetSet, err := static.Build(assets.FS, static.Bundles)
	if err != nil {
		t.Fatal(err)
	}
	set, err := page.LoadWith(pages.FS, page.Options{Assets: assetSet.Lookup}, resultsSpec)
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := set.Template(resultsSpec.File)
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	s := &site{
		Deps: handlers.Deps{
			Pages: set,
			// No Supabase: a cruise read then fails, which is one of the states under test.
			API:    api.New(api.Config{}, nil, log),
			Config: config.Config{Env: config.Development, SiteURL: "https://app.story-tail.com", SerpAPIKey: serpKey},
			Log:    log,
		},
		cat: content.Get(),
	}
	return s, tmpl
}

// soon is a stay inside the booking horizon, so ParseStay keeps it however long this test
// lives: a fixed date would silently stop being a stay once it passed.
func soon() (checkIn, checkOut string) {
	now := time.Now().AddDate(0, 0, 30)
	return now.Format(time.DateOnly), now.AddDate(0, 0, 4).Format(time.DateOnly)
}

func getResults(t *testing.T, target string) *httptest.ResponseRecorder {
	t.Helper()
	s, tmpl := resultsSite(t)
	w := httptest.NewRecorder()
	s.results(tmpl)(w, httptest.NewRequest(http.MethodGet, target, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("%s: status %d, want 200\n%s", target, w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), serpKey) {
		t.Fatalf("%s: the provider key reached the page", target)
	}
	return w
}

func resultsBody(t *testing.T, target string) string {
	t.Helper()
	return getResults(t, target).Body.String()
}

func wantsIn(t *testing.T, where, in string, strs ...string) {
	t.Helper()
	for _, s := range strs {
		if !strings.Contains(in, s) {
			t.Errorf("%s: missing %q", where, s)
		}
	}
}

func rejectsIn(t *testing.T, where, in string, strs ...string) {
	t.Helper()
	for _, s := range strs {
		if strings.Contains(in, s) {
			t.Errorf("%s: should not contain %q", where, s)
		}
	}
}

// A results page is never cached and never indexed: it reads the query string, Hotels mode
// spends a metered request per distinct URL, and /explore is the canonical entry.
func TestResultsIsPrivateAndNotIndexed(t *testing.T) {
	w := getResults(t, "/explore/results?dest=Caribbean")
	if got := w.Header().Get("Cache-Control"); got != web.NoStore {
		t.Errorf("Cache-Control = %q, want %q", got, web.NoStore)
	}
	if len(w.Header().Values("Set-Cookie")) != 0 {
		t.Error("the page set a cookie")
	}
	wantsIn(t, "head", w.Body.String(),
		`<meta name="robots" content="noindex, nofollow"/>`,
		`<link rel="canonical" href="https://app.story-tail.com/explore"/>`,
		`<title>Trip ideas · Story-Tail Adventures</title>`,
	)
}

// Picks is the default mode, and the heading counts what the filter left.
func TestResultsPicks(t *testing.T) {
	all := resultsBody(t, "/explore/results")
	wantsIn(t, "no query", all,
		"trips · Everywhere Gyasi plans",
		"* Requires creating an account — takes 60 seconds.",
		`name="dest"`,
	)
	rejectsIn(t, "no query", all, "Rate on request", "Ports of call")

	// A filter narrows the count and marks its chip and its checkbox.
	one := resultsBody(t, "/explore/results?type=cruise")
	wantsIn(t, "one type", one,
		"· Cruise",
		`value="cruise" checked=""`,
		`aria-current="true"`,
		"Clear all",
	)

	// Nothing matches: the empty state, and no footnote under an empty list.
	none := resultsBody(t, "/explore/results?dest=zzzzzzzz")
	wantsIn(t, "empty", none,
		"No trips match that week yet.",
		"Loosen a filter, or tell Gyasi what you&#39;re after — that&#39;s usually faster.",
		"Clear filters",
		"Message Gyasi",
	)
	rejectsIn(t, "empty", none, "* Requires creating an account")
}

// Dates imply Hotels with no mode in the URL, and the mode switch keeps every other param.
func TestResultsModes(t *testing.T) {
	picks := resultsBody(t, "/explore/results?dest=Aruba")
	wantsIn(t, "picks", picks,
		`href="/explore/results?dest=Aruba&amp;mode=hotels"`,
		`href="/explore/results?dest=Aruba&amp;mode=cruises"`,
		"Gyasi&#39;s picks", "Hotels", "Cruises",
	)

	// A stay in the URL lands on hotels without a mode param.
	in, out := soon()
	hotels := resultsBody(t, "/explore/results?dest=Aruba&in="+in+"&out="+out)
	wantsIn(t, "derived hotels", hotels,
		"Hotels · Aruba",
		`href="/explore/results?dest=Aruba&amp;in=`+in+`&amp;out=`+out+`&amp;mode=picks"`,
	)
	// The provider is off, so the page falls back to the curated catalog rather than
	// implying the site is broken.
	wantsIn(t, "hotels unavailable", hotels, "That search didn’t come back.", "See Gyasi’s picks")
	rejectsIn(t, "hotels unavailable", hotels, "Change your search")
}

// Hotels asks for a destination and dates before it spends a metered request.
func TestResultsHotelsPreconditions(t *testing.T) {
	noDest := resultsBody(t, "/explore/results?mode=hotels")
	wantsIn(t, "no destination", noDest, "Where are you headed?", "Change your search", "#update-search")

	noDates := resultsBody(t, "/explore/results?mode=hotels&dest=Aruba")
	wantsIn(t, "no dates", noDates, "Pick your week.", "Change your search")
}

// The hotel rail replaces the curated groups and echoes them, so a mode switch is lossless.
func TestResultsHotelRailEchoesTheOtherMode(t *testing.T) {
	in := resultsBody(t, "/explore/results?mode=hotels&dest=Aruba&type=cruise&star=4")
	wantsIn(t, "hotel rail", in,
		"Star rating", "Amenities", "Nightly rate",
		`value="4" checked=""`,
		`name="type" value="cruise"`,
	)
	// The curated vocabulary is echoed, never rendered as a second set of boxes.
	rejectsIn(t, "hotel rail", in, "Under $2k pp", "Adults-only")

	// And the other way round.
	out := resultsBody(t, "/explore/results?star=4&type=cruise")
	wantsIn(t, "picks rail", out, "Trip type", "Vibe", "Budget",
		`name="star" value="4"`)
	rejectsIn(t, "picks rail", out, "Nightly rate")
}

// Cruises read our own catalog, so there is no precondition; with no Supabase the read fails
// quietly and the page offers the curated catalog instead.
func TestResultsCruises(t *testing.T) {
	in := resultsBody(t, "/explore/results?mode=cruises&dest=Caribbean")
	wantsIn(t, "cruises", in, "Cruises · Caribbean", "The sailing list didn’t come back.", "See Gyasi’s picks")
	// Cruises have no sort menu and no filter vocabulary: every control would be a no-op.
	rejectsIn(t, "cruises", in, "Sort · ", "Trip type", "Star rating")
}

// Sort offers what the mode can honour, and a key it cannot still keeps its URL value.
func TestResultsSort(t *testing.T) {
	picks := resultsBody(t, "/explore/results?sort=price-desc")
	wantsIn(t, "picks sort", picks, "Sort · Price · high to low", "Price · high to low")

	hotels := resultsBody(t, "/explore/results?mode=hotels&sort=price-desc")
	wantsIn(t, "hotels sort", hotels, "Sort · Best fit")
	rejectsIn(t, "hotels sort", hotels, "Price · high to low")
}

// Both update forms carry everything that is not one of their three fields, so an update
// never silently clears a filter, and mode is written out rather than derived.
func TestResultsUpdateFormCarriesTheRest(t *testing.T) {
	checkIn, checkOut := soon()
	page := resultsBody(t, "/explore/results?dest=Aruba&in="+checkIn+"&out="+checkOut+"&type=hotel&sort=rating&travelers=3")
	wantsIn(t, "update form", page,
		`name="mode" value="hotels"`,
		`name="sort" value="rating"`,
		`name="type" value="hotel"`,
		`value="Aruba"`,
		`value="`+checkIn+`"`,
		`value="3"`,
	)
}

// Hostile and malformed URLs render the page rather than a 500.
func TestResultsSurvivesJunk(t *testing.T) {
	for _, target := range []string{
		"/explore/results?dest=" + strings.Repeat("x", 500),
		"/explore/results?travelers=-9999999999999999999999",
		"/explore/results?mode=%ff%fe&sort=%00&type=,,,,,,,,,,",
		"/explore/results?in=2026-02-30&out=2026-02-31",
		"/explore/results?dest=%3Cscript%3Ealert(1)%3C/script%3E",
	} {
		out := resultsBody(t, target)
		rejectsIn(t, target, out, "<script>alert(1)</script>")
	}
}
