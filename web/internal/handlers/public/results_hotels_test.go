package public

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/hotels"
)

// The rest of the page's tests run with the searcher switched off, which is right for them
// but leaves the rule this area exists to keep — SERPAPI_API_KEY reaches no page and no log —
// asserted over a call that never happens. These tests put a provider in front of the whole
// page instead: a real request goes out, carrying the key in its query string the way SerpApi
// requires, and the provider answers the way a real one does when something goes wrong.
//
// The two channels that can really carry the key back are the ones tested here. The first is
// the metadata SerpApi echoes about the request itself (search_metadata.raw_html_file,
// serpapi_property_details_link and friends all quote the search URL, key included), which
// must never reach the page because the decoder reads an allow-list of fields and ignores
// everything else. The second is an error string, from SerpApi or from Go's own http stack,
// which quotes the whole request URL — that one is redacted.
//
// Deliberately NOT tested: a key echoed inside a hotel's own name, amenity or photo URL.
// Those render, but a provider cannot put our credential in a hotel's name, and redacting
// every string against the key would mangle real content to guard an imagined fault.

// echoKey is the credential under test. It is deliberately a string that would survive being
// copied anywhere: no regex metacharacters to be eaten, long enough not to collide.
const echoKey = "serpapi-live-key-7f3c1a9e-never-publish"

// provider is a fake SerpApi that hands the key back however it can.
type provider struct {
	// reply builds the body from the key it was called with.
	reply func(key string) (status int, body string)
	// calls counts requests, so a test can prove how many searches a render spends.
	calls int
	// lastQuery is the request's raw query, to prove the key really was sent.
	lastQuery string
}

func (p *provider) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p.calls++
	p.lastQuery = r.URL.RawQuery
	status, body := p.reply(r.URL.Query().Get("api_key"))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

// goodReply is a well-formed search that also carries the request metadata SerpApi really
// sends back, every piece of which quotes the search URL with the key in it.
func goodReply(key string) (int, string) {
	echoed := "https://serpapi.com/searches/abc/?engine=google_hotels&api_key=" + key
	b, _ := json.Marshal(map[string]any{
		"search_metadata": map[string]any{
			"json_endpoint": echoed, "raw_html_file": echoed, "status": "Success",
		},
		"search_parameters":  map[string]any{"engine": "google_hotels", "api_key": key},
		"search_information": map[string]any{"total_results": 1},
		"properties": []map[string]any{{
			"type": "hotel", "name": "Sea Glass Resort",
			"description":           "A quiet stretch of sand on the west coast.",
			"property_token":        "ChkIxxxxxxxxxxxxxGA4",
			"property_type":         "Resort",
			"extracted_hotel_class": 4,
			"overall_rating":        4.65,
			"reviews":               1204,
			"amenities":             []string{"Pool", "Free Wi-Fi"},
			"rate_per_night":        map[string]any{"extracted_lowest": 318.5},
			"images": []map[string]any{
				{"thumbnail": "https://lh3.googleusercontent.com/p/photo=s287"},
			},
			// The per-property links SerpApi adds, which also quote the key.
			"serpapi_property_details_link": echoed,
			"link":                          "https://www.google.com/travel/hotels/entity?key=" + key,
		}},
	})
	return http.StatusOK, string(b)
}

// renderHotelSearch drives the real page against p and returns the HTML and the log.
func renderHotelSearch(t *testing.T, p *provider, target string) (html, logged string) {
	t.Helper()
	s, tmpl := resultsSite(t)
	fake := httptest.NewServer(p)
	t.Cleanup(fake.Close)

	var logs bytes.Buffer
	s.Log = slog.New(slog.NewJSONHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	s.hotelFinder = hotels.New(hotels.Config{
		Enabled: true, APIKey: echoKey, BaseURL: fake.URL, Log: s.Log,
	})

	w := httptest.NewRecorder()
	s.results(tmpl)(w, httptest.NewRequest(http.MethodGet, target, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("%s: status %d, want 200", target, w.Code)
	}
	return w.Body.String(), logs.String()
}

// hotelSearchURL is a search complete enough to be sent: a destination and a real stay.
func hotelSearchURL(t *testing.T) string {
	t.Helper()
	in, out := soon()
	return "/explore/results?mode=hotels&dest=Aruba&in=" + in + "&out=" + out
}

// The key goes out in the query string, because SerpApi takes it no other way. It must come
// back in nothing: not the HTML, not an attribute, not a photo URL, not the log.
func TestTheProviderKeyNeverComesBack(t *testing.T) {
	p := &provider{reply: goodReply}
	html, logged := renderHotelSearch(t, p, hotelSearchURL(t))

	if p.calls != 1 {
		t.Fatalf("the render spent %d provider searches, want exactly 1", p.calls)
	}
	if !strings.Contains(p.lastQuery, "api_key="+echoKey) {
		t.Fatalf("the key never reached the provider, so this test proves nothing: %q", p.lastQuery)
	}
	// The search really did render, so the assertions below are not passing over an error card.
	if !strings.Contains(html, "Sea Glass Resort") {
		t.Fatal("the hotel did not render, so the leak checks below would pass vacuously")
	}
	if strings.Contains(html, echoKey) {
		t.Error("the key reached the page")
	}
	if strings.Contains(logged, echoKey) {
		t.Errorf("the key reached the log: %s", logged)
	}
}

// Every way the provider can refuse, including the ones that put the key in an error string
// and the one that would make Go quote the whole request URL.
func TestTheKeySurvivesNoFailureMode(t *testing.T) {
	cases := []struct {
		name  string
		reply func(string) (int, string)
	}{
		{"401 quoting the key", func(k string) (int, string) {
			return http.StatusUnauthorized, `{"error":"Invalid API key: ` + k + `"}`
		}},
		{"200 with an error", func(k string) (int, string) {
			return http.StatusOK, `{"error":"Your account ` + k + ` has run out of searches"}`
		}},
		{"a redirect carrying the key", func(k string) (int, string) {
			return http.StatusFound, `{"moved":"https://evil.example.com/?api_key=` + k + `"}`
		}},
		{"500 with the key in the body", func(k string) (int, string) {
			return http.StatusInternalServerError, `{"error":"upstream ` + k + `"}`
		}},
		{"a body that is not JSON", func(k string) (int, string) {
			return http.StatusBadGateway, "<html>gateway error for " + k + "</html>"
		}},
		{"an enormous error", func(k string) (int, string) {
			return http.StatusInternalServerError, `{"error":"` + strings.Repeat(k+" ", 400) + `"}`
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &provider{reply: c.reply}
			html, logged := renderHotelSearch(t, p, hotelSearchURL(t))
			if p.calls == 0 {
				t.Fatal("no request was sent, so nothing was tested")
			}
			if strings.Contains(html, echoKey) {
				t.Error("the key reached the page")
			}
			if strings.Contains(logged, echoKey) {
				t.Errorf("the key reached the log: %s", logged)
			}
			// The visitor is told something rather than shown a blank page. Which card it
			// is varies on purpose — a reply about a spent account becomes the quieter
			// "resting today" state — so this asks only that one was drawn.
			if !strings.Contains(html, `data-slot="state-title"`) {
				t.Error("a failed search showed no state card")
			}
		})
	}
}

// One failure may not write the provider's whole reply to the log: the body is read up to
// 8 MiB and a retryable failure is tried three times.
func TestAFailureDoesNotFloodTheLog(t *testing.T) {
	p := &provider{reply: func(string) (int, string) {
		return http.StatusInternalServerError, `{"error":"` + strings.Repeat("x", 2_000_000) + `"}`
	}}
	_, logged := renderHotelSearch(t, p, hotelSearchURL(t))
	if len(logged) > 8_000 {
		t.Errorf("one failed search wrote %d bytes of log", len(logged))
	}
}
