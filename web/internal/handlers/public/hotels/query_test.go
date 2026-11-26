package hotels

// The outbound parameter set (web/lib/hotels/input.ts and query.ts, which had no tests of
// their own on the web side). It is load-bearing for the bill: SerpApi reuses an identical
// parameter set free for an hour, so a default that drifts, an unsorted list or a blank
// value sent instead of omitted turns one question into two billed searches.

import (
	"slices"
	"strings"
	"testing"
)

func TestToSearchInputClampsAndAllowLists(t *testing.T) {
	in := toSearchInput(Args{
		Destination:     "Aruba",
		CheckIn:         "2026-12-19",
		CheckOut:        "2026-12-26",
		Adults:          9999, // ?travelers=9999 is a real request a crawler can make
		HotelClass:      []string{"4", "4", "1", "5", "x"},
		Amenities:       []string{"35", "6", "999", "6"},
		MinPriceDollars: ptr(150),
		MaxPriceDollars: ptr(100001),
		SortBy:          "99",
	})
	if in.adults != 8 {
		t.Errorf("adults = %d, want 8", in.adults)
	}
	if !slices.Equal(in.hotelClass, []string{"4", "5"}) {
		t.Errorf("hotelClass = %v, want [4 5]", in.hotelClass)
	}
	if !slices.Equal(in.amenities, []string{"35", "6"}) {
		t.Errorf("amenities = %v, want [35 6]", in.amenities)
	}
	if in.minPrice == nil || *in.minPrice != 150 || in.maxPrice != nil {
		t.Errorf("prices = %v / %v, want 150 / none", in.minPrice, in.maxPrice)
	}
	if in.sortBy != "" {
		t.Errorf("sortBy = %q, want it dropped", in.sortBy)
	}
	// The five the page has no control for, at the Edge Function's own defaults.
	if in.currency != "USD" || in.rating != "" || len(in.propertyTypes) != 0 || len(in.childrenAges) != 0 || in.freeCancellation {
		t.Errorf("defaults = %+v", in)
	}
}

func TestAdultsClamp(t *testing.T) {
	for in, want := range map[int]int{-5: 1, 0: 1, 1: 1, 2: 2, 8: 8, 9: 8} {
		if got := toSearchInput(Args{Adults: in}).adults; got != want {
			t.Errorf("adults %d = %d, want %d", in, got, want)
		}
	}
}

func TestPriceBounds(t *testing.T) {
	cases := []struct {
		in   *int
		want *int
	}{
		{nil, nil},
		{ptr(-1), nil},
		{ptr(0), ptr(0)},
		{ptr(300), ptr(300)},
		{ptr(100000), ptr(100000)},
		{ptr(100001), nil},
	}
	for _, c := range cases {
		got := bounded(c.in)
		if (got == nil) != (c.want == nil) || got != nil && *got != *c.want {
			t.Errorf("bounded(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestSortIDs(t *testing.T) {
	for in, want := range map[string]string{"3": "3", "8": "8", "13": "13", "": "", "1": "", " 3": ""} {
		if got := toSearchInput(Args{SortBy: in}).sortBy; got != want {
			t.Errorf("sortBy %q = %q, want %q", in, got, want)
		}
	}
}

func TestProviderParamsOrderAndOmissions(t *testing.T) {
	full := canonicalize(searchInput{
		destination: "  Curaçao ", checkIn: "2026-12-19", checkOut: "2026-12-26", adults: 2,
		childrenAges: []int{8, 5}, currency: "usd", sortBy: "3", rating: "8",
		hotelClass: []string{"5", "4"}, amenities: []string{"6", "10", " 9 ", "", "6"},
		propertyTypes: []string{"17"}, minPrice: ptr(150), maxPrice: ptr(300), freeCancellation: true,
	})
	want := []param{
		{"engine", "google_hotels"}, {"q", "curacao"}, {"check_in_date", "2026-12-19"},
		{"check_out_date", "2026-12-26"}, {"adults", "2"}, {"children_ages", "5,8"},
		{"currency", "USD"}, {"gl", "us"}, {"hl", "en"}, {"sort_by", "3"}, {"rating", "8"},
		// JavaScript's default sort compares strings, so "10" sorts before "6".
		{"hotel_class", "4,5"}, {"amenities", "10,6,9"}, {"property_types", "17"},
		{"min_price", "150"}, {"max_price", "300"}, {"free_cancellation", "true"}, {"children", "2"},
	}
	if got := providerParams(full); !slices.Equal(got, want) {
		t.Errorf("full params =\n  %v\nwant\n  %v", got, want)
	}

	// Omitted is not empty: every unset value is left out, never sent blank.
	plain := providerParams(canonicalize(toSearchInput(arubaArgs())))
	want = []param{
		{"engine", "google_hotels"}, {"q", "aruba"}, {"check_in_date", "2026-12-19"},
		{"check_out_date", "2026-12-26"}, {"adults", "2"}, {"currency", "USD"}, {"gl", "us"}, {"hl", "en"},
	}
	if !slices.Equal(plain, want) {
		t.Errorf("plain params =\n  %v\nwant\n  %v", plain, want)
	}
}

// The same visitor question typed three ways must be one search, or the free tier pays
// three times. Expected values are Node's output for the TypeScript normalizeDestination.
func TestNormalizeDestination(t *testing.T) {
	cases := map[string]string{
		"Curaçao":                     "curacao",
		"CURACAO":                     "curacao",
		"  curaçao  ":                 "curacao",
		"\uff23\uff55\uff52\uff41çao": "curacao", // full-width letters fold under NFKD
		"São\tPaulo\n":                "sao paulo",
		"Åland\u00a0Islands":          "aland islands",
		"\ufb01ji":                    "fiji", // the fi ligature
		"Mallorca\u200bx":             "mallorca\u200bx",
		"\ufeffAruba\ufeff":           "aruba",
		"a\x00b":                      "a b",
		strings.Repeat("ab", 40):      strings.Repeat("ab", 30),
		strings.Repeat("É", 70):       strings.Repeat("e", 60),
		"St. John's & Co (USVI)":      "st. john's & co (usvi)",
		"   ":                         "",
		"Ελλάδα":                      "ελλαδα",
		"\U0001F334 Bora Bora":        "\U0001F334 bora bora",
		"Turks\u2003and\u3000Caicos":  "turks and caicos",
	}
	for in, want := range cases {
		if got := normalizeDestination(in); got != want {
			t.Errorf("normalizeDestination(%q) = %q, want %q", in, got, want)
		}
	}
}
