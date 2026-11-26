package hotels

// Ported from web/lib/hotels/map.test.ts. Two kinds of failure, and they cost differently:
// a malformed payload that panics takes a public page down for everyone, and a booking-site
// name that survives the mapper breaches the host agency agreement (§1.3.5) without anyone
// noticing until a compliance review. So the compliance checks read every string the mapped
// value carries, not one field at a time.
//
// Not ported: "hasMore is always false" and "the payload carries its version" (both fields
// went with the cache they existed for; nothing in query.go can ask for page two), and
// rateSpread, which only filled the cache row. The spread's two numbers are asserted below
// as the rates themselves.

import (
	"math"
	"slices"
	"strings"
	"testing"
)

func mapFixture(t *testing.T, raw string) hotelPayload {
	t.Helper()
	body := decodeProvider([]byte(raw))
	if body == nil {
		t.Fatalf("fixture did not decode: %.80s", raw)
	}
	return mapSearchResponse(body, "USD")
}

func findHotel(t *testing.T, p hotelPayload, prefix string) hotelResult {
	t.Helper()
	for _, h := range p.results {
		if strings.HasPrefix(h.name, prefix) {
			return h
		}
	}
	t.Fatalf("no mapped hotel named %q", prefix)
	return hotelResult{}
}

func TestNoBookingSiteIdentitySurvivesTheMapper(t *testing.T) {
	// The fixture really contains them: assert that first, or this passes against nothing.
	for _, h := range []string{"Booking.com", "Hotels.com", "Expedia", "booking.com/hotel", "serpapi.com", "google.com/travel", "next_page_token", "deal_description"} {
		if !strings.Contains(searchPage, h) {
			t.Fatalf("the fixture lost %q", h)
		}
	}
	assertAbsent(t, "the mapped payload", hostile, allStrings(mapFixture(t, searchPage))...)
}

func TestASponsoredPropertyIsDropped(t *testing.T) {
	p := mapFixture(t, searchPage)
	for _, h := range p.results {
		if h.name == "Sponsored Beach Club" {
			t.Error("the sponsored property survived")
		}
	}
	if len(p.results) != 3 {
		t.Errorf("results = %d, want 3", len(p.results))
	}
}

func TestAPropertyWithNoExtractedRateIsKeptWithNoRate(t *testing.T) {
	// Dropping it would quietly shrink the page, and "$1,148" is a display string we refuse
	// to parse: a wrong price on a public page is a compliance problem, not a layout one.
	if h := findHotel(t, mapFixture(t, searchPage), "Boardwalk"); h.rate != nil {
		t.Errorf("rate = %+v, want none", *h.rate)
	}
}

func TestRatesConvertToIntegerCentsWithoutARoundingSlip(t *testing.T) {
	p := mapFixture(t, searchPage)
	bucuti := findHotel(t, p, "Bucuti")
	if bucuti.rate == nil || bucuti.rate.amountCents != 41200 || bucuti.rate.currency != "USD" {
		t.Errorf("Bucuti rate = %+v, want 41200 USD", bucuti.rate)
	}
	// 318.5 is 31850, not 31849: float times 100 needs the round. It is also the lowest
	// rate on the page, and Bucuti's the highest, which is what rateSpread reported.
	if r := findHotel(t, p, "Renaissance").rate; r == nil || r.amountCents != 31850 {
		t.Errorf("Renaissance rate = %+v, want 31850", r)
	}
}

// The expected values are what Node printed for Math.round(dollars * 100), so a provider
// float rounds to the same cent here as it did on the Next site.
func TestCentsFromDollarsMatchesMathRound(t *testing.T) {
	cases := []struct {
		dollars float64
		cents   int64
		ok      bool
	}{
		{318.5, 31850, true},
		{412, 41200, true},
		{1.005, 100, true},  // 100.49999999999999 after the multiply
		{0.125, 13, true},   // an exact half rounds up
		{2.675, 268, true},  // the product rounds to exactly 267.5; a fused multiply would give 267
		{19.99, 1999, true}, // 1998.9999999999998
		{0.005, 1, true},
		{0.015, 2, true},
		{1.115, 112, true},
		{8.345, 835, true},
		{4.35, 435, true},
		{10.075, 1007, true},
		{0.285, 28, true},
		{1234.565, 123457, true},
		{99.995, 10000, true},
		{90071992547409.9, 9007199254740991, true}, // the largest integer a JS number holds exactly
		{0.0049999999999999, 0, false},             // rounds to no cents at all
		{0.004, 0, false},
		{0, 0, false},
		{-1, 0, false},
		{90071992547410, 0, false}, // past 2^53: Node printed 9007199254741000, Go refuses it
		{1e300, 0, false},
	}
	for _, c := range cases {
		cents, ok := centsFromDollars(c.dollars)
		if cents != c.cents || ok != c.ok {
			t.Errorf("centsFromDollars(%v) = %d, %v; want %d, %v", c.dollars, cents, ok, c.cents, c.ok)
		}
	}
}

func TestJSRound(t *testing.T) {
	cases := []struct{ in, want float64 }{
		{0.49999999999999994, 0}, // math.Floor(x+0.5) says 1
		{0.5, 1},
		{1.5, 2},
		{2.5, 3},
		{-0.4, 0},
		{-0.5, 0},
		{-2.5, -2}, // math.Round says -3
		{-2.5000000000000004, -3},
		{4503599627370495.5, 4503599627370496},
		{9007199254740991, 9007199254740991},
	}
	for _, c := range cases {
		if got := jsRound(c.in); got != c.want {
			t.Errorf("jsRound(%v) = %v, want %v", c.in, got, c.want)
		}
	}
	if !math.IsNaN(jsRound(math.NaN())) || !math.IsInf(jsRound(math.Inf(1)), 1) {
		t.Error("jsRound changed a non-finite value")
	}
}

func TestOnlyAllowListedImageHostsSurvive(t *testing.T) {
	bucuti := findHotel(t, mapFixture(t, searchPage), "Bucuti")
	want := []string{"https://lh3.googleusercontent.com/proxy/abc=s287-w287-h192-n-k-no-v1"}
	if !slices.Equal(bucuti.images, want) {
		t.Errorf("images = %v, want %v", bucuti.images, want)
	}
}

func TestIsAllowedImage(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"https://lh3.googleusercontent.com/proxy/abc=s287", true},
		{"https://encrypted-tbn0.gstatic.com/images?q=tbn:x", true},
		{"https://streetviewpixels-pa.googleapis.com/v1/thumbnail?x=1", true},
		{"https://LH3.googleusercontent.com/x", true}, // a browser lower-cases the host too
		{"HTTPS://lh3.googleusercontent.com/x", true},
		{"https://lh3.googleusercontent.com:443/x", true},
		{"http://lh3.googleusercontent.com/x", false},
		{"//lh3.googleusercontent.com/x", false},
		{"https://cdn.some-ota.example/photo.jpg", false},
		{"https://www.gstatic.com/travel-hotels/branding/booking.png", false},
		{"https://lh3.googleusercontent.com.evil.example/x", false},
		{"https://evil.example/lh3.googleusercontent.com", false},
		{"https://user@lh3.googleusercontent.com/x", false},
		{`https://evil.example\@lh3.googleusercontent.com/x`, false}, // a browser reads evil.example
		{"https://lh3.googleusercontent.com/a b", false},
		{" https://lh3.googleusercontent.com/x", false},
		{"https:lh3.googleusercontent.com/x", false},
		{"javascript:alert(1)", false},
		{"data:image/png;base64,AAAA", false},
		{"", false},
	}
	for _, c := range cases {
		if got := isAllowedImage(c.url); got != c.want {
			t.Errorf("isAllowedImage(%q) = %v, want %v", c.url, got, c.want)
		}
	}
}

func TestAmenitiesAreDedupedAndCapped(t *testing.T) {
	// The fixture lists "Spa" twice.
	bucuti := findHotel(t, mapFixture(t, searchPage), "Bucuti")
	want := []string{"Beach access", "Spa", "Free Wi-Fi", "Restaurant"}
	if !slices.Equal(bucuti.amenities, want) {
		t.Errorf("amenities = %v, want %v", bucuti.amenities, want)
	}

	many := `{"properties":[{"name":"Many","amenities":["a","b","c","d","e","f","g","h","i","j","k","l","m","n","A"]}]}`
	got := mapFixture(t, many).results[0].amenities
	if len(got) != maxAmenities || got[11] != "l" {
		t.Errorf("amenities = %v, want the first 12", got)
	}
}

func TestAnEmptyDestinationMapsToNoResults(t *testing.T) {
	p := mapFixture(t, emptyPage)
	if len(p.results) != 0 || p.totalAvailable == nil || *p.totalAvailable != 0 {
		t.Errorf("payload = %+v, want no results and a total of 0", p)
	}
}

func TestAResponseWithNoPropertiesKeyDoesNotPanic(t *testing.T) {
	p := mapFixture(t, shapelessPage)
	if len(p.results) != 0 || p.totalAvailable != nil {
		t.Errorf("payload = %+v, want no results and no total", p)
	}
}

func TestAtMostTwentyResults(t *testing.T) {
	props := slices.Repeat([]string{`{"name":"H"}`}, 25)
	p := mapFixture(t, `{"properties":[`+strings.Join(props, ",")+`]}`)
	if len(p.results) != maxResults {
		t.Errorf("results = %d, want %d", len(p.results), maxResults)
	}
}

func TestARatingOutsideZeroToFiveIsDropped(t *testing.T) {
	// A 9.2 out of 10 would render as a star rating that is simply wrong.
	if r := mapFixture(t, `{"properties":[{"name":"Odd","overall_rating":9.2}]}`).results[0].overallRating; r != nil {
		t.Errorf("rating = %v, want none", *r)
	}
}

// Node's Math.round(r * 10) / 10 for each input.
func TestRatingRoundsToOneDecimalLikeTheTypeScript(t *testing.T) {
	cases := []struct {
		in   float64
		want *float64
	}{
		{4.45, ptr(4.5)},
		{4.449, ptr(4.4)},
		{4.25, ptr(4.3)},
		{4.05, ptr(4.1)},
		{4.75, ptr(4.8)},
		{0.05, ptr(0.1)},
		{4.95, ptr(5.0)},
		{4.99, ptr(5.0)},
		{0.04999, ptr(0.0)},
		{0, ptr(0.0)},
		{5, ptr(5.0)},
		{5.01, nil},
		{-0.1, nil},
	}
	for _, c := range cases {
		got := mapRating(&c.in)
		switch {
		case c.want == nil && got != nil:
			t.Errorf("rating %v = %v, want none", c.in, *got)
		case c.want != nil && (got == nil || *got != *c.want):
			t.Errorf("rating %v = %v, want %v", c.in, got, *c.want)
		}
	}
}

// The TypeScript guarded every field with a typeof check. encoding/json skips a value of
// the wrong type and leaves the pointer nil, which the mapper reads the same way. One
// difference, on purpose: a null entry in properties made the TypeScript throw (it read
// null.sponsored) and the whole search went unavailable; here it is one dropped entry.
func TestFieldsOfTheWrongTypeReadAsAbsent(t *testing.T) {
	raw := `{"search_information":{"total_results":"148"},"properties":[
		"x", 42, {"name": 5},
		{"name": "Typed Wrong", "overall_rating": "4.5", "reviews": "10", "extracted_hotel_class": "4",
		 "sponsored": "true", "eco_certified": 1, "property_token": ["x"], "description": {"a": 1},
		 "images": ["https://lh3.googleusercontent.com/a", {"thumbnail": 7}, {"thumbnail": "https://lh3.googleusercontent.com/b"}],
		 "amenities": [5, "Pool", null, {"x": 1}, "pool"],
		 "rate_per_night": "$100"},
		{"name": "Rate Wrong", "rate_per_night": {"extracted_lowest": "412"}},
		null
	]}`
	p := mapFixture(t, raw)
	if p.totalAvailable != nil {
		t.Errorf("total = %d, want none", *p.totalAvailable)
	}
	if len(p.results) != 2 {
		t.Fatalf("results = %d, want 2: %+v", len(p.results), p.results)
	}
	h := p.results[0]
	if h.name != "Typed Wrong" || h.id != "p3" || h.propertyToken != "" || h.description != "" {
		t.Errorf("identity = %q %q %q %q", h.name, h.id, h.propertyToken, h.description)
	}
	if h.overallRating != nil || h.reviewCount != nil || h.hotelClass != nil || h.ecoCertified || h.rate != nil {
		t.Errorf("a wrongly typed number or flag survived: %+v", h)
	}
	if !slices.Equal(h.images, []string{"https://lh3.googleusercontent.com/b"}) {
		t.Errorf("images = %v", h.images)
	}
	if !slices.Equal(h.amenities, []string{"Pool"}) {
		t.Errorf("amenities = %v", h.amenities)
	}
	if p.results[1].rate != nil {
		t.Error("a price given as a string became a rate")
	}
}

func TestPropertyTypeFallsBackToType(t *testing.T) {
	p := mapFixture(t, searchPage)
	if got := findHotel(t, p, "Bucuti").propertyType; got != "Resort" {
		t.Errorf("Bucuti type = %q, want Resort", got)
	}
	if got := findHotel(t, p, "Renaissance").propertyType; got != "hotel" {
		t.Errorf("Renaissance type = %q, want hotel", got)
	}
	// JavaScript's ?? falls back only on null or absent. A property_type of the wrong type
	// was text(5), which is no type at all.
	for raw, want := range map[string]string{
		`{"properties":[{"name":"T","type":"hotel","property_type":null}]}`: "hotel",
		`{"properties":[{"name":"T","type":"hotel","property_type":5}]}`:    "",
		`{"properties":[{"name":"T","type":"hotel","property_type":" "}]}`:  "",
	} {
		if got := mapFixture(t, raw).results[0].propertyType; got != want {
			t.Errorf("%s: type = %q, want %q", raw, got, want)
		}
	}
}

// Node's output for the TypeScript text(): control characters out, whitespace collapsed
// (JavaScript's \s, which includes U+FEFF and the Unicode spaces), trimmed, then cut by
// UTF-16 length.
func TestText(t *testing.T) {
	cases := []struct {
		in   string
		max  int
		want string
	}{
		{"  Beach\taccess \n", 60, "Beach access"},
		{"Spa\u00a0\u00a0resort", 60, "Spa resort"},
		{"\ufeffPool\ufeff", 60, "Pool"},
		{"\u0007bell", 60, "bell"},
		{"\u2028line\u2029", 60, "line"},
		{"a\u200bb", 60, "a\u200bb"}, // a zero-width space is not whitespace in either language
		{"   ", 60, ""},
		{"", 60, ""},
		{"abc def", 4, "abc "},
		{"ab\U0001F600cd", 4, "ab\U0001F600"},
		// JavaScript cuts the emoji in half here and keeps a lone surrogate; Go cannot hold
		// one in a string, so the whole emoji goes.
		{"ab\U0001F600cd", 3, "ab"},
		{strings.Repeat("a", 200), 160, strings.Repeat("a", 160)},
	}
	for _, c := range cases {
		if got := text(&c.in, c.max); got != c.want {
			t.Errorf("text(%q, %d) = %q, want %q", c.in, c.max, got, c.want)
		}
	}
	if text(nil, 10) != "" {
		t.Error("text(nil) is not empty")
	}
}
