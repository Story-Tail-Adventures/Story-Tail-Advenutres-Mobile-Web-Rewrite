package hotels

// Ported from web/lib/public/hotels.test.ts: the boundary where a provider payload becomes
// something a page may render. The checks that matter are about what cannot get through. A
// booking site's name on the page breaches §1.3.5, and an unvetted image host is a URL the
// visitor's browser fetches on our say-so.
//
// The TypeScript pushed a poisoned body through parseSearchResponse, the zod schema. In Go
// the hostile keys have no field to land in at all, so the same assertions run end to end
// instead: the poisoned provider fixture through Search, and every string in the Result
// read. "Degraded but with results is a stale serve" is not ported: with no cache, nothing
// is ever served stale.

import (
	"context"
	"errors"
	"math"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestPublicHotelHasOnlyAllowListedFields(t *testing.T) {
	// HOTEL_KEYS in the TypeScript. Widening this list is a compliance decision; make it here
	// on purpose or not at all.
	want := []string{
		"Amenities", "Currency", "Description", "EcoCertified", "HotelClass", "ID", "Name",
		"NightlyCents", "Photos", "PropertyToken", "PropertyType", "Rating", "ReviewCount",
	}
	typ := reflect.TypeFor[PublicHotel]()
	var got []string
	for i := range typ.NumField() {
		f := typ.Field(i)
		got = append(got, f.Name)
		// A struct, map or interface field could carry the provider's object through
		// whole, which is how a passthrough smuggles a booking site past a key check.
		k := f.Type.Kind()
		if k == reflect.Pointer || k == reflect.Slice {
			k = f.Type.Elem().Kind()
		}
		switch k {
		case reflect.String, reflect.Bool, reflect.Int, reflect.Int64, reflect.Float64:
		default:
			t.Errorf("field %s is a %s, which could carry anything", f.Name, f.Type)
		}
	}
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Errorf("PublicHotel fields = %v, want %v", got, want)
	}
}

func TestASearchReturnsTheMappedHotels(t *testing.T) {
	fake, srv := newFake(t, reply{body: searchPage})
	s, logs := testSearcher(t, srv.URL)
	res := s.Search(context.Background(), arubaArgs())
	if res.Status != StatusOK {
		t.Fatalf("status = %q, want ok; log %q", res.Status, logs.String())
	}
	if !res.AsOf.Equal(testNow) || res.Total == nil || *res.Total != 148 {
		t.Errorf("asOf = %v, total = %v; want %v and 148", res.AsOf, res.Total, testNow)
	}
	var names []string
	for _, h := range res.Hotels {
		names = append(names, h.Name)
	}
	if want := []string{"Bucuti & Tara Beach Resort", "Renaissance Wind Creek Aruba", "Boardwalk Boutique Hotel"}; !slices.Equal(names, want) {
		t.Fatalf("hotels = %v, want %v", names, want)
	}

	b := res.Hotels[0]
	wantB := PublicHotel{
		ID:            "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAE",
		PropertyToken: "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAE",
		Name:          "Bucuti & Tara Beach Resort",
		Description:   "Adults-only beachfront resort on Eagle Beach.",
		PropertyType:  "Resort",
		HotelClass:    ptr(5),
		Rating:        ptr(4.8),
		ReviewCount:   ptr(int64(2140)),
		Amenities:     []string{"Beach access", "Spa", "Free Wi-Fi", "Restaurant"},
		Photos:        []string{"https://lh3.googleusercontent.com/proxy/abc=s287-w287-h192-n-k-no-v1"},
		EcoCertified:  true,
		NightlyCents:  ptr(int64(41200)),
		Currency:      "USD",
	}
	if !reflect.DeepEqual(b, wantB) {
		t.Errorf("Bucuti =\n  %+v\nwant\n  %+v", b, wantB)
	}

	// The wire: only what the page asked for, in the TypeScript's order, and nothing empty.
	// SerpApi reuses an identical parameter set free for an hour, so a blank sort_by=
	// would be a different, billed search.
	q := fake.calls()[0].Query()
	for k, v := range map[string]string{
		"engine": "google_hotels", "q": "aruba", "check_in_date": "2026-12-19",
		"check_out_date": "2026-12-26", "adults": "2", "currency": "USD", "gl": "us", "hl": "en",
	} {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
	for _, k := range []string{"sort_by", "rating", "hotel_class", "amenities", "property_types", "min_price", "max_price", "free_cancellation", "children_ages", "children", "next_page_token"} {
		if q.Has(k) {
			t.Errorf("sent %s=%q, want it omitted", k, q.Get(k))
		}
	}
}

func TestNoBookingSiteReachesTheResultAtAnyDepth(t *testing.T) {
	_, srv := newFake(t, reply{body: searchPage})
	s, _ := testSearcher(t, srv.URL)
	res := s.Search(context.Background(), arubaArgs())
	if res.Status != StatusOK {
		t.Fatalf("status = %q, want ok", res.Status)
	}
	assertAbsent(t, "the result", hostile, allStrings(res)...)
}

func TestTheSecondCheckDropsAnImageHostWeHaveNotVetted(t *testing.T) {
	// Straight past the mapper, which would have dropped these first: this is the belt
	// someone editing the mapper cannot loosen by accident.
	h := hotelResult{id: "abc", name: "Bucuti", images: []string{
		"https://lh3.googleusercontent.com/proxy/abc=s287",
		"https://cdn.some-ota.example/photo.jpg",
		"http://lh3.googleusercontent.com/proxy/abc=s287",
		"javascript:alert(1)",
	}}
	got := toPublicHotel(h, "USD").Photos
	if want := []string{"https://lh3.googleusercontent.com/proxy/abc=s287"}; !slices.Equal(got, want) {
		t.Errorf("photos = %v, want %v", got, want)
	}
}

func TestCentsReachThePageAsIntegers(t *testing.T) {
	h := toPublicHotel(hotelResult{id: "abc", name: "Bucuti", rate: &hotelRate{amountCents: 41200, currency: "USD"}}, "USD")
	if h.NightlyCents == nil || *h.NightlyCents != 41200 || h.Currency != "USD" {
		t.Errorf("nightly = %v %s, want 41200 USD", h.NightlyCents, h.Currency)
	}
	if h := toPublicHotel(hotelResult{id: "x", name: "No rate"}, "USD"); h.NightlyCents != nil || h.Currency != "USD" {
		t.Errorf("no rate = %v %s, want none and USD", h.NightlyCents, h.Currency)
	}
}

func TestAnExhaustedPlanIsDistinctFromAnOutage(t *testing.T) {
	repeat := func(r reply) []reply { return []reply{r, r, r} }
	cases := []struct {
		name    string
		replies []reply
		rt      http.RoundTripper
		want    Status
		log     string
	}{
		{"the provider says the plan is spent", []reply{{status: 401, body: `{"error":"Your account has run out of searches."}`}}, nil, StatusBudgetExhausted, "the provider says the month is spent"},
		{"a monthly-limit phrasing on a 429", []reply{{status: 429, body: `{"error":"You have exceeded your searches per month."}`}}, nil, StatusBudgetExhausted, "status=429"},
		{"a plan-limit phrasing on a 200", repeat(reply{body: `{"error":"Plan limit reached"}`}), nil, StatusBudgetExhausted, "status=200"},
		{"a bad key is an outage, not a spent month", []reply{{status: 401, body: errorBody}}, nil, StatusUnavailable, "code=provider_401"},
		{"a 503 is an outage", repeat(reply{status: 503, body: `{"error":"upstream"}`}), nil, StatusUnavailable, "code=provider_unavailable"},
		// A network error's detail is the runtime's text and can quote the request; a
		// destination that happened to contain a phrase must not read as a spent month.
		{"a network error never reads as a spent month", nil, phraseTransport{}, StatusUnavailable, "code=network_error"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, srv := newFake(t, c.replies...)
			s, logs := testSearcher(t, srv.URL)
			if c.rt != nil {
				s.http = &http.Client{Transport: c.rt}
			}
			if got := s.Search(context.Background(), arubaArgs()); got.Status != c.want {
				t.Errorf("status = %q, want %q", got.Status, c.want)
			}
			if !strings.Contains(logs.String(), c.log) {
				t.Errorf("log %q lacks %q", logs.String(), c.log)
			}
		})
	}
}

type phraseTransport struct{}

func (phraseTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("you ran out of searches per month on your plan limit")
}

func TestAGenuinelyEmptyDestinationIsEmptyNotAFailure(t *testing.T) {
	for _, page := range []string{emptyPage, shapelessPage} {
		_, srv := newFake(t, reply{body: page})
		s, logs := testSearcher(t, srv.URL)
		if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusEmpty {
			t.Errorf("status = %q, want empty", got.Status)
		}
		if logs.Len() != 0 {
			t.Errorf("an empty answer logged %q", logs.String())
		}
	}
}

// The TypeScript's "never throws on a malformed payload". Each body gets the status the
// TypeScript gave it: response.json() treated a falsy value or a parse failure as no body
// (a failure, retried), and any other JSON as a reply with no properties (empty).
func TestAMalformedReplyDegradesWithoutPanicking(t *testing.T) {
	cases := []struct {
		body  string
		want  Status
		calls int
	}{
		{"null", StatusUnavailable, 3},
		{"false", StatusUnavailable, 3},
		{"0", StatusUnavailable, 3},
		{`""`, StatusUnavailable, 3},
		{"", StatusUnavailable, 3},
		{"not json", StatusUnavailable, 3},
		{`{"properties":[`, StatusUnavailable, 3},
		{"{}", StatusEmpty, 1},
		{`{"properties":"nope"}`, StatusEmpty, 1},
		{"[]", StatusEmpty, 1},
		{`"text"`, StatusEmpty, 1},
		{"42", StatusEmpty, 1},
		{`{"properties":[null,"x",{"name":""}]}`, StatusEmpty, 1},
		{"\ufeff" + searchPage, StatusOK, 1}, // fetch's json() drops a byte-order mark
		// Too big to be a real page one: refused once rather than read, or billed thrice.
		{strings.Repeat(" ", maxBodyBytes) + "{}", StatusUnavailable, 1},
	}
	for _, c := range cases {
		replies := slices.Repeat([]reply{{body: c.body}}, c.calls)
		fake, srv := newFake(t, replies...)
		s, _ := testSearcher(t, srv.URL)
		if got := s.Search(context.Background(), arubaArgs()); got.Status != c.want {
			t.Errorf("body %.30q: status = %q, want %q", c.body, got.Status, c.want)
		}
		if got := len(fake.calls()); got != c.calls {
			t.Errorf("body %.30q: calls = %d, want %d", c.body, got, c.calls)
		}
	}
}

// The second belt, mirroring the zod schema: a value the mapper should never produce fails
// the whole reply, so a mapper edit that loosens a bound shows up as "unavailable" in a test
// rather than as a strange card in production.
func TestTheSecondCheckRefusesWhatTheMapperShouldNeverProduce(t *testing.T) {
	good := func() hotelPayload {
		return hotelPayload{currency: "USD", results: []hotelResult{{
			id: "abc", name: "Bucuti", rate: &hotelRate{amountCents: 41200, currency: "USD"},
			images: []string{"https://lh3.googleusercontent.com/a"}, amenities: []string{"Spa"},
		}}}
	}
	cases := []struct {
		name  string
		spoil func(*hotelPayload)
	}{
		// Money is USD only on this site; another currency is a bug to surface, not render.
		{"a currency the app cannot format", func(p *hotelPayload) { p.currency = "EUR" }},
		{"a rate in another currency", func(p *hotelPayload) { p.results[0].rate.currency = "EUR" }},
		{"a negative rate", func(p *hotelPayload) { p.results[0].rate.amountCents = -1 }},
		{"no id", func(p *hotelPayload) { p.results[0].id = "" }},
		{"no name", func(p *hotelPayload) { p.results[0].name = "" }},
		{"a 201-character name", func(p *hotelPayload) { p.results[0].name = strings.Repeat("n", 201) }},
		{"a 221-character token", func(p *hotelPayload) { p.results[0].propertyToken = strings.Repeat("t", 221) }},
		{"a 701-character description", func(p *hotelPayload) { p.results[0].description = strings.Repeat("d", 701) }},
		{"an 81-character type", func(p *hotelPayload) { p.results[0].propertyType = strings.Repeat("p", 81) }},
		{"a six-star class", func(p *hotelPayload) { p.results[0].hotelClass = ptr(6) }},
		{"a zero-star class", func(p *hotelPayload) { p.results[0].hotelClass = ptr(0) }},
		{"a rating over 5", func(p *hotelPayload) { p.results[0].overallRating = ptr(5.5) }},
		{"a NaN rating", func(p *hotelPayload) { p.results[0].overallRating = ptr(math.NaN()) }},
		{"negative reviews", func(p *hotelPayload) { p.results[0].reviewCount = ptr(int64(-1)) }},
		{"13 amenities", func(p *hotelPayload) { p.results[0].amenities = slices.Repeat([]string{"a"}, 13) }},
		{"an 81-character amenity", func(p *hotelPayload) { p.results[0].amenities = []string{strings.Repeat("a", 81)} }},
		{"7 images", func(p *hotelPayload) {
			p.results[0].images = slices.Repeat([]string{"https://lh3.googleusercontent.com/a"}, 7)
		}},
		{"an image that is not a URL", func(p *hotelPayload) { p.results[0].images = []string{"not a url"} }},
		{"the zero value", func(p *hotelPayload) { *p = hotelPayload{} }},
	}
	if got := toResult(good(), testNow); got.Status != StatusOK {
		t.Fatalf("the good payload = %q, want ok", got.Status)
	}
	for _, c := range cases {
		p := good()
		c.spoil(&p)
		if got := toResult(p, testNow); got.Status != StatusUnavailable {
			t.Errorf("%s: status = %q, want unavailable", c.name, got.Status)
		}
	}
	empty := hotelPayload{currency: "USD", totalAvailable: ptr(int64(0))}
	if got := toResult(empty, testNow); got.Status != StatusEmpty {
		t.Errorf("no results = %q, want empty", got.Status)
	}
}

func TestNotConfiguredIsUnavailableAndSaysWhich(t *testing.T) {
	cases := []struct {
		enabled     bool
		key         string
		providerKey string
	}{
		{false, testKey, "providerKey=set"},
		{true, "", `providerKey="MISSING (SERPAPI_API_KEY)"`},
		{false, "", `providerKey="MISSING (SERPAPI_API_KEY)"`},
	}
	for _, c := range cases {
		fake, srv := newFake(t)
		s, logs := testSearcher(t, srv.URL)
		s.enabled, s.apiKey = c.enabled, c.key
		if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusUnavailable {
			t.Errorf("status = %q, want unavailable", got.Status)
		}
		if n := len(fake.calls()); n != 0 {
			t.Errorf("sent %d requests while switched off", n)
		}
		for _, want := range []string{"hotels: search skipped, not configured", c.providerKey} {
			if !strings.Contains(logs.String(), want) {
				t.Errorf("log %q lacks %q", logs.String(), want)
			}
		}
		assertAbsent(t, "the log", secrets, logs.String())
	}
}

func TestNoDestinationOrDatesSpendsNoSearch(t *testing.T) {
	for _, args := range []Args{
		{Destination: " \t\u00a0", CheckIn: "2026-12-19", CheckOut: "2026-12-26", Adults: 2},
		{Destination: "Aruba", CheckOut: "2026-12-26", Adults: 2},
		{Destination: "Aruba", CheckIn: "2026-12-19", Adults: 2},
	} {
		fake, srv := newFake(t)
		s, logs := testSearcher(t, srv.URL)
		if got := s.Search(context.Background(), args); got.Status != StatusUnavailable {
			t.Errorf("%+v: status = %q, want unavailable", args, got.Status)
		}
		if n := len(fake.calls()); n != 0 {
			t.Errorf("%+v: sent %d requests", args, n)
		}
		if !strings.Contains(logs.String(), "no destination or dates") {
			t.Errorf("log %q does not say why", logs.String())
		}
	}
}

func TestAPanicInsideASearchIsUnavailableNotACrash(t *testing.T) {
	_, srv := newFake(t, reply{body: searchPage})
	s, logs := testSearcher(t, srv.URL)
	s.now = func() time.Time { panic("boom") }
	if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
	if !strings.Contains(logs.String(), "code=unexpected") {
		t.Errorf("log %q lacks code=unexpected", logs.String())
	}
}
