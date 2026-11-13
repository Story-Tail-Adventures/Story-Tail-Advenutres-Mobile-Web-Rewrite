package search

import (
	"net/url"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Ports web/lib/public/search.test.ts.

const testToday = "2026-11-07"

// trip is the TypeScript test's trip(over): a minimal trip, then the overrides.
func trip(over func(*content.Trip)) content.Trip {
	t := content.Trip{
		Slug: "x", Name: "X", Type: TypeHotel, Vibes: []content.Vibe{},
		Destination:      content.Destination{Place: "Nowhere", Region: "Nowhere"},
		Band:             "$$",
		From:             usd(250_000),
		PriceAsOf:        "2026-01-01",
		PricePlaceholder: true,
		PriceSource:      "illustrative",
		ImageKey:         "turks",
	}
	if over != nil {
		over(&t)
	}
	return t
}

func parse(v url.Values) SearchQuery { return ParseSearchParams(v, testToday) }

func TestParseSearchParams(t *testing.T) {
	t.Run("returns defaults for no input", func(t *testing.T) {
		want := SearchQuery{
			Types: []content.TripType{}, Vibes: []content.Vibe{}, Budgets: []BudgetBand{},
			Sort: SortBestFit, Stars: []StarClass{}, Amenities: []string{}, Rates: []RateBand{},
		}
		if got := parse(nil); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v\nwant %+v", got, want)
		}
	})

	t.Run("accepts repeated keys and comma lists, dropping unknown values", func(t *testing.T) {
		q := parse(url.Values{"type": {"cruise", "spaceship", "hotel"}, "vibe": {"family,adults-only,nope"}})
		if want := []content.TripType{TypeCruise, TypeHotel}; !slices.Equal(q.Types, want) {
			t.Errorf("types = %q, want %q", q.Types, want)
		}
		if want := []content.Vibe{VibeFamily, VibeAdultsOnly}; !slices.Equal(q.Vibes, want) {
			t.Errorf("vibes = %q, want %q", q.Vibes, want)
		}
	})

	t.Run("de-duplicates and caps multi-value lists", func(t *testing.T) {
		vibes := append(slices.Repeat([]string{"family"}, 20), "couples")
		if q := parse(url.Values{"vibe": vibes}); !slices.Equal(q.Vibes, []content.Vibe{VibeFamily}) {
			t.Errorf("vibes = %q, want [family]", q.Vibes)
		}
	})

	t.Run("clamps travelers to 1-20 and ignores garbage", func(t *testing.T) {
		for in, want := range map[string]int{"99": 20, "0": 1, "two": 0} {
			if got := parse(url.Values{"travelers": {in}}).Travelers; got != want {
				t.Errorf("travelers %q = %d, want %d", in, got, want)
			}
		}
	})

	t.Run("strips control characters and truncates free text", func(t *testing.T) {
		q := parse(url.Values{"dest": {"Nas\x00sau\n\t" + strings.Repeat("x", 200)}})
		if strings.ContainsAny(q.Dest, "\x00\n\t") {
			t.Errorf("dest kept a control character: %q", q.Dest)
		}
		if n := utf16Len(q.Dest); n > 60 {
			t.Errorf("dest is %d long, want at most 60", n)
		}
	})

	t.Run("falls back to best-fit for an unknown sort and ignores unknown topics", func(t *testing.T) {
		q := parse(url.Values{"sort": {"cheapest"}, "topic": {"mars"}})
		if q.Sort != SortBestFit || q.Topic != "" {
			t.Errorf("sort %q topic %q, want best-fit and none", q.Sort, q.Topic)
		}
	})

	t.Run("reads a raw query string too", func(t *testing.T) {
		q := parse(ParseQuery("type=cruise&type=tour&budget=under-2k"))
		if !slices.Equal(q.Types, []content.TripType{TypeCruise, TypeTour}) || !slices.Equal(q.Budgets, []BudgetBand{BudgetUnder2k}) {
			t.Errorf("types %q budgets %q", q.Types, q.Budgets)
		}
	})
}

func TestParseSearchParamsNeverPanics(t *testing.T) {
	hostile := []url.Values{
		{"dest": {}}, {"travelers": {"-"}}, {"in": {"9999-12-31"}, "out": {"9999-12-31"}},
		{"in": {"\xff\xfe"}, "out": {"\xe2\x82"}}, {"type": {",,,,,,,,,,,,"}},
		{"dest": {strings.Repeat("\U0001F600", 1000)}}, {"travelers": {strings.Repeat("9", 400)}},
	}
	for _, v := range hostile {
		_ = ResultsHref(ParseSearchParams(v, ""))
		_ = ResultsHref(ParseSearchParams(v, "not a date"))
	}
}

func FuzzParseSearchParams(f *testing.F) {
	for _, seed := range []string{"", "dest=Nassau&type=cruise,hotel", "in=2026-11-08&out=2026-11-10&travelers=3", "%zz=%", "dest=%FF%E2%82"} {
		f.Add(seed, testToday)
	}
	f.Fuzz(func(t *testing.T, raw, today string) {
		q := ParseSearchParams(ParseQuery(raw), today)
		href := ResultsHref(q)
		// A canonical link reads back as the query it came from.
		_, qs, _ := strings.Cut(href, "?")
		if back := ParseSearchParams(ParseQuery(qs), today); !reflect.DeepEqual(back, q) && q.CheckIn == "" {
			t.Errorf("%q: round trip changed the query\n%+v\n%+v", raw, q, back)
		}
	})
}

func slugsOf(trips []content.Trip) []string { return slugs(trips) }

func TestFilterTrips(t *testing.T) {
	catalog := []content.Trip{
		trip(func(t *content.Trip) {
			t.Slug, t.Type, t.Vibes, t.From = "a", TypeCruise, []content.Vibe{VibeFamily}, usd(150_000)
			t.Destination = content.Destination{Place: "Nassau, Bahamas", Region: "Caribbean"}
		}),
		trip(func(t *content.Trip) {
			t.Slug, t.Type, t.Vibes, t.From = "b", TypeAllInclusive, []content.Vibe{VibeAdultsOnly}, usd(200_000)
			t.Destination = content.Destination{Place: "Negril, Jamaica", Region: "Caribbean"}
		}),
		trip(func(t *content.Trip) {
			t.Slug, t.Type, t.Vibes, t.From = "c", TypeHotel, []content.Vibe{VibeAdultsOnly, VibeFamily}, usd(400_000)
			t.Destination = content.Destination{Place: "Cancún, Mexico", Region: "Mexico"}
			t.Topics = content.Topics{{Topic: content.Honeymoons, Placement: content.TopicPlacement{Order: 1}}}
		}),
	}
	cases := []struct {
		name string
		q    url.Values
		want []string
	}{
		{"ORs within a group", url.Values{"type": {"cruise", "hotel"}}, []string{"a", "c"}},
		{"ANDs across groups", url.Values{"type": {"hotel"}, "vibe": {"family"}}, []string{"c"}},
		{"budget under 2k", url.Values{"budget": {"under-2k"}}, []string{"a"}},
		{"budget 2k to 4k", url.Values{"budget": {"2k-4k"}}, []string{"b"}},
		{"budget 4k plus", url.Values{"budget": {"4k-plus"}}, []string{"c"}},
		{"destination against place", url.Values{"dest": {"jamaica"}}, []string{"b"}},
		{"destination against region", url.Values{"dest": {"Caribbean"}}, []string{"a", "b"}},
		{"destination without diacritics", url.Values{"dest": {"cancun"}}, []string{"c"}},
		{"topic placement", url.Values{"topic": {"honeymoons"}}, []string{"c"}},
	}
	for _, c := range cases {
		if got := slugsOf(FilterTrips(catalog, parse(c.q))); !slices.Equal(got, c.want) {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestSortTrips(t *testing.T) {
	pick := "Gyasi's pick"
	catalog := []content.Trip{
		trip(func(t *content.Trip) { t.Slug, t.From = "b", usd(300_000) }),
		trip(func(t *content.Trip) { t.Slug, t.From, t.Badge = "a", usd(300_000), &pick }),
		trip(func(t *content.Trip) { t.Slug, t.From = "c", usd(100_000) }),
	}
	t.Run("sorts by price with a slug tie-break", func(t *testing.T) {
		if got := slugsOf(SortTrips(catalog, SortPriceAsc, nil)); !slices.Equal(got, []string{"c", "a", "b"}) {
			t.Errorf("price-asc = %q", got)
		}
		if got := slugsOf(SortTrips(catalog, SortPriceDesc, nil)); !slices.Equal(got, []string{"a", "b", "c"}) {
			t.Errorf("price-desc = %q", got)
		}
	})
	t.Run("puts Gyasi's pick first for best-fit", func(t *testing.T) {
		if got := SortTrips(catalog, SortBestFit, nil)[0].Slug; got != "a" {
			t.Errorf("first = %q, want a", got)
		}
	})
	t.Run("sorts by rating when a lookup is supplied", func(t *testing.T) {
		ratings := map[string]float64{"a": 4.5, "b": 4.9, "c": 4.7}
		lookup := func(s string) (float64, bool) { r, ok := ratings[s]; return r, ok }
		if got := slugsOf(SortTrips(catalog, SortRating, lookup)); !slices.Equal(got, []string{"b", "c", "a"}) {
			t.Errorf("rating = %q", got)
		}
	})
	t.Run("does not mutate its input", func(t *testing.T) {
		before := slugsOf(catalog)
		SortTrips(catalog, SortPriceAsc, nil)
		if got := slugsOf(catalog); !slices.Equal(got, before) {
			t.Errorf("input reordered to %q", got)
		}
	})
}

func TestResultsHref(t *testing.T) {
	t.Run("round-trips through ParseSearchParams", func(t *testing.T) {
		q := parse(url.Values{"dest": {"Nassau"}, "type": {"cruise", "hotel"}, "vibe": {"family"}, "budget": {"2k-4k"}, "sort": {"price-desc"}, "travelers": {"3"}})
		href := ResultsHref(q)
		if !strings.HasPrefix(href, "/explore/results?") {
			t.Fatalf("href = %q", href)
		}
		_, qs, _ := strings.Cut(href, "?")
		if back := parse(ParseQuery(qs)); !reflect.DeepEqual(back, q) {
			t.Errorf("round trip\n got %+v\nwant %+v", back, q)
		}
	})
	t.Run("omits the default sort and returns the bare path for an empty query", func(t *testing.T) {
		if got := ResultsHref(SearchQuery{}); got != "/explore/results" {
			t.Errorf("empty = %q", got)
		}
		if got := ResultsHref(SearchQuery{Sort: SortBestFit}); got != "/explore/results" {
			t.Errorf("best-fit = %q", got)
		}
	})
}

func TestCatalogHelpers(t *testing.T) {
	trips := content.Get().Trips

	t.Run("counts and orders trips per topic against the real catalog", func(t *testing.T) {
		for _, topic := range Topics {
			list := TripsForTopic(trips, topic)
			if len(list) != CountByTopic(trips, topic) {
				t.Errorf("%s: %d listed, %d counted", topic, len(list), CountByTopic(trips, topic))
			}
			var orders []int
			for _, tr := range list {
				p, _ := placement(tr, topic)
				orders = append(orders, p.Order)
			}
			if !slices.IsSorted(orders) || len(slices.Compact(slices.Clone(orders))) != len(orders) {
				t.Errorf("%s: orders %v are not ascending and unique", topic, orders)
			}
		}
	})

	t.Run("SearchTrips over the real catalog is deterministic and non-empty", func(t *testing.T) {
		q := parse(url.Values{"type": {"cruise"}})
		a, b := slugsOf(SearchTrips(trips, q, nil)), slugsOf(SearchTrips(trips, q, nil))
		if !slices.Equal(a, b) || len(a) == 0 {
			t.Fatalf("a %q b %q", a, b)
		}
		for _, tr := range SearchTrips(trips, q, nil) {
			if tr.Type != TypeCruise {
				t.Errorf("%s is a %s", tr.Slug, tr.Type)
			}
		}
	})

	t.Run("describes the query for the results heading", func(t *testing.T) {
		if got := DescribeQuery(parse(url.Values{"dest": {"Aruba"}})); got != "Aruba" {
			t.Errorf("dest = %q", got)
		}
		if got := DescribeQuery(parse(url.Values{"topic": {"cruises"}})); got != "Cruises" {
			t.Errorf("topic = %q", got)
		}
		if got := DescribeQuery(parse(nil)); got != "Everywhere Gyasi plans" {
			t.Errorf("empty = %q", got)
		}
		if HasActiveFilters(parse(nil)) {
			t.Error("an empty query has active filters")
		}
		if !HasActiveFilters(parse(url.Values{"vibe": {"family"}})) {
			t.Error("a vibe is not an active filter")
		}
	})
}

func TestEffectiveModeAndSortKeys(t *testing.T) {
	if got := EffectiveMode(SearchQuery{}); got != ModePicks {
		t.Errorf("no dates = %s", got)
	}
	if got := EffectiveMode(SearchQuery{CheckIn: "2026-11-10", CheckOut: "2026-11-12"}); got != ModeHotels {
		t.Errorf("dates = %s", got)
	}
	if got := EffectiveMode(SearchQuery{Mode: ModePicks, CheckIn: "2026-11-10", CheckOut: "2026-11-12"}); got != ModePicks {
		t.Errorf("explicit picks = %s", got)
	}
	if len(SortKeysFor(ModeCruises)) != 0 || !slices.Equal(SortKeysFor(ModeHotels), HotelSortKeys) || !slices.Equal(SortKeysFor(ModePicks), SortKeys) {
		t.Error("SortKeysFor is wrong")
	}
	for sort, want := range map[SortKey]string{SortPriceAsc: "3", SortRating: "8", SortBestFit: "", SortPriceDesc: ""} {
		if got := SerpSortBy(sort); got != want {
			t.Errorf("SerpSortBy(%s) = %q, want %q", sort, got, want)
		}
	}
}

func TestStay(t *testing.T) {
	defer pinClock(t, testToday)()
	q := parse(url.Values{"in": {"2026-11-10"}, "out": {"2026-11-13"}})
	if n, ok := StayNights(q); !ok || n != 3 {
		t.Errorf("StayNights = %d, %v", n, ok)
	}
	if got, ok := StayLabel(q, ""); !ok || got != "Nov 10 – 13" {
		t.Errorf("StayLabel = %q, %v", got, ok)
	}
	if got, ok := StayLabel(SearchQuery{When: "Aug 12 – 19"}, ""); !ok || got != "Aug 12 – 19" {
		t.Errorf("StayLabel(when) = %q, %v", got, ok)
	}
	if _, ok := StayLabel(SearchQuery{}, ""); ok {
		t.Error("StayLabel of nothing is set")
	}
	if _, ok := StayNights(SearchQuery{CheckIn: "2026-11-10"}); ok {
		t.Error("half a stay has nights")
	}
}
