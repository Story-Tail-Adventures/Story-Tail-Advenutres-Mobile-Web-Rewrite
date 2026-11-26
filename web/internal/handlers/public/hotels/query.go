package hotels

// Args to the outbound SerpApi parameter set: the port of web/lib/hotels/input.ts and
// query.ts.
//
// THIS IS AN INTERFACE, NOT AN IMPLEMENTATION DETAIL, because of the bill. SerpApi serves an
// identical parameter set free for an hour and does not count it against the 250-a-month
// tier (Free-Travel-APIs.md:294-296). A default that drifts, a list in a different order or
// a value sent blank instead of omitted presents a different search to that free cache, so
// one visitor question is billed twice. Every literal is copied from the Edge Function's
// parseBody rather than re-decided.
//
// The clamps and allow-lists are input guards, not ceremony: their inputs come from URL
// query parameters nothing upstream bounds. ?travelers=9999 is a real request a crawler can
// make, and adults=9999 is a parameter set of its own that misses the free cache.
//
// Not carried from input.ts: RATING_IDS and PROPERTY_TYPE_IDS (the rail has no control for
// either, so nothing would read them; copy them from there when a chip lands), and query.ts's
// cacheKey, ttlSeconds and nightsBetween, which served the cache that is gone.

import (
	"slices"
	"strconv"
	"strings"

	"golang.org/x/text/unicode/norm"
)

var (
	// amenityIDs are the amenities the Hotels rail offers (Screen Inventory 2.3.3): 6 Pool,
	// 9 Free breakfast, 10 Spa, 11 Beach access, 12 Child-friendly, 19 Pet-friendly,
	// 35 Free Wi-Fi, 52 All-inclusive available, 53 Wheelchair accessible.
	amenityIDs = []string{"6", "9", "10", "11", "12", "19", "35", "52", "53"}
	// sortIDs: "3" lowest price, "8" highest rating, "13" most reviewed.
	sortIDs = []string{"3", "8", "13"}
	// hotelClassIDs are the star classes the rail offers. There is no 1-star chip.
	hotelClassIDs = []string{"2", "3", "4", "5"}
)

// searchInput is SearchInput in query.ts: Args plus the five values the page has no control
// for, at the Edge Function's own defaults.
type searchInput struct {
	destination      string
	checkIn          string
	checkOut         string
	adults           int
	childrenAges     []int
	currency         string
	sortBy           string
	rating           string
	hotelClass       []string
	amenities        []string
	propertyTypes    []string
	minPrice         *int
	maxPrice         *int
	freeCancellation bool
}

// toSearchInput clamps and allow-lists the page's arguments. The page counts travelers, not
// ages, so childrenAges is always empty, and empty is the value that matters: providerParams
// then omits children_ages and children entirely, the parameter set the Edge Function's own
// searches were billed under. Rating, property types and free cancellation are likewise
// left at the values that omit them; currency is always USD, the only one the site formats.
func toSearchInput(a Args) searchInput {
	return searchInput{
		destination: a.Destination,
		checkIn:     a.CheckIn,
		checkOut:    a.CheckOut,
		// 8 is the provider's own ceiling for the field.
		adults:     min(max(a.Adults, 1), 8),
		currency:   "USD",
		sortBy:     allowed(a.SortBy, sortIDs),
		hotelClass: allowedList(a.HotelClass, hotelClassIDs),
		amenities:  allowedList(a.Amenities, amenityIDs),
		minPrice:   bounded(a.MinPriceDollars),
		maxPrice:   bounded(a.MaxPriceDollars),
	}
}

// allowed is one id or none. An unrecognised value becomes "", which providerParams drops.
func allowed(value string, ids []string) string {
	if slices.Contains(ids, value) {
		return value
	}
	return ""
}

// allowedList keeps the recognised ids, once each, in the order given: two copies of "4"
// are the same filter and a different search.
func allowedList(values, ids []string) []string {
	var out []string
	for _, v := range values {
		if slices.Contains(ids, v) && !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// bounded keeps a price bound from 0 to 100000 dollars. The rate bands only ever produce
// values inside it; a hand-edited ?rates= does not have to.
func bounded(v *int) *int {
	if v == nil || *v < 0 || *v > 100_000 {
		return nil
	}
	n := *v
	return &n
}

// canonicalQuery is CanonicalQuery in query.ts: every value as the string that is sent.
type canonicalQuery struct {
	destination      string
	checkIn          string
	checkOut         string
	adults           int
	childrenAges     string
	currency         string
	sortBy           string
	rating           string
	hotelClass       string
	amenities        string
	propertyTypes    string
	minPrice         string
	maxPrice         string
	freeCancellation string
}

// canonicalize turns the input into the strings that are sent, in one fixed form.
func canonicalize(in searchInput) canonicalQuery {
	freeCancellation := "0"
	if in.freeCancellation {
		freeCancellation = "1"
	}
	// Sorted: two adults with an 8- and a 5-year-old is one search however it was typed.
	ages := slices.Sorted(slices.Values(in.childrenAges))
	agesText := make([]string, len(ages))
	for i, a := range ages {
		agesText[i] = strconv.Itoa(a)
	}
	return canonicalQuery{
		destination:      normalizeDestination(in.destination),
		checkIn:          in.checkIn,
		checkOut:         in.checkOut,
		adults:           in.adults,
		childrenAges:     strings.Join(agesText, "-"),
		currency:         strings.ToUpper(in.currency),
		sortBy:           in.sortBy,
		rating:           in.rating,
		hotelClass:       sortedList(in.hotelClass),
		amenities:        sortedList(in.amenities),
		propertyTypes:    sortedList(in.propertyTypes),
		minPrice:         optionalInt(in.minPrice),
		maxPrice:         optionalInt(in.maxPrice),
		freeCancellation: freeCancellation,
	}
}

// providerParams is the query SerpApi receives, in query.ts's order. OMITTED IS NOT EMPTY:
// an empty value is dropped, never sent blank.
func providerParams(c canonicalQuery) []param {
	freeCancellation := ""
	if c.freeCancellation == "1" {
		freeCancellation = "true"
	}
	ages := strings.ReplaceAll(c.childrenAges, "-", ",")
	all := []param{
		{"engine", "google_hotels"},
		{"q", c.destination},
		{"check_in_date", c.checkIn},
		{"check_out_date", c.checkOut},
		{"adults", strconv.Itoa(c.adults)},
		{"children_ages", ages},
		{"currency", c.currency},
		{"gl", "us"},
		{"hl", "en"},
		{"sort_by", c.sortBy},
		{"rating", c.rating},
		{"hotel_class", c.hotelClass},
		{"amenities", c.amenities},
		{"property_types", c.propertyTypes},
		{"min_price", c.minPrice},
		{"max_price", c.maxPrice},
		{"free_cancellation", freeCancellation},
	}
	out := slices.DeleteFunc(all, func(p param) bool { return p.value == "" })
	// children is only meaningful alongside ages, and only when there are any.
	if ages != "" {
		out = append(out, param{"children", strconv.Itoa(strings.Count(ages, ",") + 1)})
	}
	return out
}

// normalizeDestination folds the visitor's text so "Curaçao", "CURACAO" and "  curaçao  "
// are one search: NFKD, combining marks (U+0300 to U+036F) removed, control characters and
// whitespace collapsed, lower-cased, 60 UTF-16 code units.
func normalizeDestination(raw string) string {
	var b strings.Builder
	for _, r := range norm.NFKD.String(raw) {
		if r < 0x300 || r > 0x36f {
			b.WriteRune(r)
		}
	}
	return truncateUTF16(strings.ToLower(collapse(b.String())), 60)
}

// sortedList is a list's distinct, trimmed, non-empty values, sorted and joined with
// commas. Byte order matches JavaScript's default sort for these ASCII ids, so "10" comes
// before "6", as it did.
func sortedList(values []string) string {
	var out []string
	for _, v := range values {
		v = strings.TrimFunc(v, isJSSpace)
		if v != "" && !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	slices.Sort(out)
	return strings.Join(out, ",")
}

func optionalInt(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}
