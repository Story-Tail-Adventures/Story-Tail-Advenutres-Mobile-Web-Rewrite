package hotels

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// Test data ported from web/lib/hotels/__fixtures__/provider.ts, written as the raw JSON
// SerpApi sends so every test reads it through the decoder production uses.
//
// The poisoned fixture is the point. searchPage carries a full prices[] with real
// booking-site names, their logos and their links, an ads[] block, a sponsored property and
// a deal_description. Without them, the tests asserting none of it survives would pass
// against a payload that never had it. Keep the hostile fields in anything added here.

// testKey is the credential every test searcher holds. The leak tests assert it never escapes.
const testKey = "test-serpapi-key-do-not-use"

// rotatedKey is a second, different-looking key, to prove the redactor is not only an
// equality check: a rotated credential can come back in a cached upstream error.
const rotatedKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

const searchPage = `{
  "search_metadata": {"id": "68c0f0aa1e3b4a0001b2c3d4", "status": "Success"},
  "search_information": {"total_results": 148},
  "brands": [{"id": 33, "name": "Marriott"}],
  "ads": [{
    "name": "Sponsored - Book on Expedia",
    "source": "Expedia",
    "link": "https://www.expedia.com/h123456.Hotel-Information",
    "logo": "https://www.gstatic.com/travel-hotels/branding/expedia.png"
  }],
  "properties": [
    {
      "type": "hotel",
      "name": "Bucuti & Tara Beach Resort",
      "description": "Adults-only beachfront resort on Eagle Beach.",
      "link": "https://www.google.com/travel/hotels/entity/CgoI...",
      "property_token": "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAE",
      "serpapi_property_details_link": "https://serpapi.com/search.json?engine=google_hotels&property_token=ChkI",
      "gps_coordinates": {"latitude": 12.5567, "longitude": -70.0428},
      "check_in_time": "3:00 PM",
      "check_out_time": "11:00 AM",
      "rate_per_night": {"lowest": "$412", "extracted_lowest": 412, "before_taxes_fees": "$372", "extracted_before_taxes_fees": 372},
      "total_rate": {"lowest": "$2,884", "extracted_lowest": 2884},
      "prices": [
        {
          "source": "Booking.com",
          "logo": "https://www.gstatic.com/travel-hotels/branding/booking.png",
          "link": "https://www.booking.com/hotel/aw/bucuti.html",
          "num_guests": 2,
          "rate_per_night": {"lowest": "$412", "extracted_lowest": 412},
          "free_cancellation": true
        },
        {
          "source": "Hotels.com",
          "logo": "https://www.gstatic.com/travel-hotels/branding/hotels.png",
          "link": "https://www.hotels.com/ho123456",
          "num_guests": 2,
          "rate_per_night": {"lowest": "$429", "extracted_lowest": 429}
        }
      ],
      "hotel_class": "5-star hotel",
      "extracted_hotel_class": 5,
      "images": [
        {"thumbnail": "https://lh3.googleusercontent.com/proxy/abc=s287-w287-h192-n-k-no-v1", "original_image": "https://lh3.googleusercontent.com/proxy/abc"},
        {"thumbnail": "https://cdn.some-ota.example/photo.jpg", "original_image": "https://cdn.some-ota.example/photo.jpg"}
      ],
      "overall_rating": 4.8,
      "reviews": 2140,
      "location_rating": 4.9,
      "amenities": ["Beach access", "Spa", "Free Wi-Fi", "Spa", "Restaurant"],
      "excluded_amenities": ["Kid-friendly"],
      "property_type": "Resort",
      "eco_certified": true,
      "deal": "22% off",
      "deal_description": "Cheaper than usual on Booking.com",
      "nearby_places": [{"name": "Eagle Beach"}]
    },
    {
      "type": "hotel",
      "name": "Renaissance Wind Creek Aruba",
      "property_token": "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAF",
      "gps_coordinates": {"latitude": 12.5186, "longitude": -70.0358},
      "rate_per_night": {"lowest": "$318", "extracted_lowest": 318.5},
      "extracted_hotel_class": 4,
      "overall_rating": 4.4,
      "reviews": 5120,
      "amenities": ["Pool", "Restaurant"],
      "images": [{"thumbnail": "https://lh5.googleusercontent.com/proxy/def=s287"}]
    },
    {
      "type": "hotel",
      "name": "Sponsored Beach Club",
      "sponsored": true,
      "property_token": "ChkSPONSORED",
      "rate_per_night": {"lowest": "$199", "extracted_lowest": 199}
    },
    {
      "type": "hotel",
      "name": "Boardwalk Boutique Hotel",
      "property_token": "ChkNOPRICE",
      "rate_per_night": {"lowest": "$1,148"},
      "extracted_hotel_class": 4,
      "overall_rating": 4.9,
      "reviews": 640,
      "images": [{"thumbnail": "https://lh3.googleusercontent.com/proxy/ghi=s287"}]
    }
  ],
  "serpapi_pagination": {"next_page_token": "eyJwYWdlIjoy"}
}`

// emptyPage is a destination that genuinely has nothing.
const emptyPage = `{
  "search_metadata": {"id": "68c0f0aa1e3b4a0001b2c3d5", "status": "Success"},
  "search_information": {"total_results": 0},
  "properties": []
}`

// shapelessPage has no properties key at all, which the docs do not promise but the API does.
const shapelessPage = `{"search_metadata": {"id": "68c0f0aa1e3b4a0001b2c3d6", "status": "Success"}}`

// errorBody is SerpApi's answer to a bad key.
const errorBody = `{"error": "Invalid API key. Your API key should be here: /manage-api-key"}`

// hostile is every string from searchPage that must never reach a Result: booking sites,
// their logos and links, our vendor's URLs, Google's booking module, paid placement, deals.
var hostile = []string{
	"Booking", "booking.com", "Hotels.com", "hotels.com", "Expedia", "expedia.com",
	"gstatic.com/travel-hotels", "serpapi.com", "google.com/travel", "next_page_token",
	"eyJwYWdlIjoy", "serpapi_property_details_link", "Sponsored", "SPONSORED", "22% off",
	"Cheaper than usual", "some-ota.example", "Marriott", "Kid-friendly",
}

// reply is one queued answer from the fake SerpApi.
type reply struct {
	status   int
	body     string
	location string
}

// fakeSerpAPI replays queued replies and records every request it was sent.
type fakeSerpAPI struct {
	t     *testing.T
	mu    sync.Mutex
	queue []reply
	seen  []url.URL
}

func newFake(t *testing.T, replies ...reply) (*fakeSerpAPI, *httptest.Server) {
	t.Helper()
	f := &fakeSerpAPI{t: t, queue: replies}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeSerpAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.seen = append(f.seen, *r.URL)
	if len(f.queue) == 0 {
		f.mu.Unlock()
		f.t.Errorf("fake SerpApi: no reply queued for request %d", len(f.seen))
		w.WriteHeader(http.StatusTeapot)
		return
	}
	next := f.queue[0]
	f.queue = f.queue[1:]
	f.mu.Unlock()

	if next.location != "" {
		w.Header().Set("Location", next.location)
	}
	w.Header().Set("Content-Type", "application/json")
	status := next.status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(next.body))
}

func (f *fakeSerpAPI) calls() []url.URL {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.seen)
}

// testNow is the instant every test searcher reads as now.
var testNow = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

// testSearcher is a configured searcher against base that never waits between attempts and
// writes its log where the test can read it.
func testSearcher(t *testing.T, base string) (*Searcher, *bytes.Buffer) {
	t.Helper()
	logs := &bytes.Buffer{}
	s := New(Config{
		Enabled: true,
		APIKey:  testKey,
		BaseURL: base,
		Log:     slog.New(slog.NewTextHandler(logs, nil)),
	})
	s.sleep = func(context.Context, time.Duration) error { return nil }
	s.now = func() time.Time { return testNow }
	return s, logs
}

// arubaArgs is a plain search, as the results page sends it.
func arubaArgs() Args {
	return Args{Destination: "Aruba", CheckIn: "2026-12-19", CheckOut: "2026-12-26", Adults: 2}
}

// testParams is the provider parameter set for arubaArgs.
func testParams() []param {
	return providerParams(canonicalize(toSearchInput(arubaArgs())))
}

func ptr[T any](v T) *T { return &v }

// allStrings collects every string reachable from v, unexported fields included, so a
// test can assert on everything a value carries rather than on the fields it thought of.
func allStrings(v any) []string {
	var out []string
	timeType := reflect.TypeFor[time.Time]()
	var walk func(reflect.Value)
	walk = func(v reflect.Value) {
		if v.IsValid() && v.Type() == timeType {
			return
		}
		switch v.Kind() {
		case reflect.String:
			out = append(out, v.String())
		case reflect.Pointer, reflect.Interface:
			if !v.IsNil() {
				walk(v.Elem())
			}
		case reflect.Struct:
			for i := range v.NumField() {
				walk(v.Field(i))
			}
		case reflect.Slice, reflect.Array:
			for i := range v.Len() {
				walk(v.Index(i))
			}
		case reflect.Map:
			iter := v.MapRange()
			for iter.Next() {
				walk(iter.Key())
				walk(iter.Value())
			}
		}
	}
	walk(reflect.ValueOf(v))
	return out
}

// assertAbsent fails when any of needles appears in any of haystacks.
func assertAbsent(t *testing.T, where string, needles []string, haystacks ...string) {
	t.Helper()
	joined := strings.Join(haystacks, "\n")
	for _, n := range needles {
		if strings.Contains(joined, n) {
			t.Errorf("%s carries %q", where, n)
		}
	}
}
