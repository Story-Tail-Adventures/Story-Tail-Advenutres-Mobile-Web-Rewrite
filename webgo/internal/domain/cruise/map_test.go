package cruise

import (
	"math"
	"regexp"
	"slices"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Ported from supabase/functions/_shared/cruise/map_test.ts, one Go test per Deno.test.
//
// These pin rules that are easy to "simplify" into a bug, and every case is a real property
// of the provider's data rather than a hypothetical.

func f(v float64) *float64 { return &v }
func s(v string) *string   { return &v }

func eqPtrInt(t *testing.T, what string, got *int64, want *int64) {
	t.Helper()
	if (got == nil) != (want == nil) || (got != nil && *got != *want) {
		t.Errorf("%s: got %v want %v", what, showInt(got), showInt(want))
	}
}

func showInt(p *int64) any {
	if p == nil {
		return "null"
	}
	return *p
}

func eqPtrStr(t *testing.T, what string, got *string, want *string) {
	t.Helper()
	if (got == nil) != (want == nil) || (got != nil && *got != *want) {
		t.Errorf("%s: got %v want %v", what, showStr(got), showStr(want))
	}
}

func showStr(p *string) string {
	if p == nil {
		return "null"
	}
	return *p
}

func i64(n int64) *int64 { return &n }

func liveCruises(t *testing.T) []ProviderCruise {
	t.Helper()
	items, _ := fixture("LIVE_CRUISES_PAGE").Get("data").Array()
	out := make([]ProviderCruise, len(items))
	for i, it := range items {
		out[i] = DecodeCruise(it)
	}
	return out
}

func coveredSlugs() []string {
	out := make([]string, len(Companies))
	for i, c := range Companies {
		out[i] = CompanyToSlug(c)
	}
	return out
}

// Deno.test("companyToSlug maps the three lines whose names disagree")
func TestCompanyToSlugMapsTheThreeLinesWhoseNamesDisagree(t *testing.T) {
	// The whole reason the map exists: these three would otherwise mint duplicate
	// cruise_line rows next to the slugs screen 2.0.9 already links to.
	for in, want := range map[string]string{"ncl": "norwegian", "celebrity-cruises": "celebrity", "disney-cruise-line": "disney"} {
		if got := CompanyToSlug(in); got != want {
			t.Errorf("%s: got %s want %s", in, got, want)
		}
	}
}

// Deno.test("companyToSlug leaves the four that already agree alone")
func TestCompanyToSlugLeavesTheFourThatAlreadyAgreeAlone(t *testing.T) {
	for _, slug := range []string{"royal-caribbean", "princess", "carnival", "holland-america"} {
		if got := CompanyToSlug(slug); got != slug {
			t.Errorf("%s: got %s", slug, got)
		}
	}
}

// Deno.test("every provider company maps to a slug the slug CHECK accepts")
func TestEveryProviderCompanyMapsToASlugTheSlugCheckAccepts(t *testing.T) {
	// cruise_line has CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'). A company value
	// that fails it would take down the whole reference sync on one bad row.
	check := regexp.MustCompile(`^[a-z0-9-]+$`)
	for _, company := range Companies {
		slug := CompanyToSlug(company)
		if slug != js.ToLower(slug) || !check.MatchString(slug) {
			t.Errorf("bad slug for %s: %s", company, slug)
		}
	}
}

// Deno.test("Virgin Voyages is booked but has no provider company")
func TestVirginVoyagesIsBookedButHasNoProviderCompany(t *testing.T) {
	// The asymmetry that makes "curated wins over synced" concrete. If this ever fails
	// because the provider added Virgin, the migration's curated row needs its provenance
	// pair filled rather than a second row minted.
	if !IsBooked("virgin-voyages") {
		t.Error("virgin-voyages is not booked")
	}
	if slices.Contains(coveredSlugs(), "virgin-voyages") {
		t.Error("virgin-voyages is covered")
	}
}

// Deno.test("the provider covers seven of the eight lines Story-Tail books")
func TestTheProviderCoversSevenOfTheEightLinesStoryTailBooks(t *testing.T) {
	covered := coveredSlugs()
	var missing []string
	n := 0
	for _, slug := range BookedSlugs {
		if slices.Contains(covered, slug) {
			n++
		} else {
			missing = append(missing, slug)
		}
	}
	if !slices.Equal(missing, []string{"virgin-voyages"}) || n != 7 {
		t.Errorf("missing %v, covered %d", missing, n)
	}
}

// Deno.test("toCents rounds half-cents up where the naive multiply rounds them down")
func TestToCentsRoundsHalfCentsUpWhereTheNaiveMultiplyRoundsThemDown(t *testing.T) {
	// Not float panic in general: Math.round(v * 100) is exact for every 2-decimal fare
	// (swept 0..10000). It fails on HALF-CENTS, where the binary residue sits just under the
	// midpoint. price_euro is a cross-market conversion, so a third decimal is routine.
	// (Variables, not constants: Go would multiply constants exactly, at compile time.)
	halfCent, eightish, hundred := 1199.995, 8.165, 100.0
	if halfCent*hundred != 119999.49999999999 {
		t.Errorf("1199.995 * 100 = %v", halfCent*hundred)
	}
	if js.Round(halfCent*hundred) != 119999 {
		t.Errorf("naive round %v", js.Round(halfCent*hundred))
	}
	eqPtrInt(t, "1199.995", ToCents(f(1199.995)), i64(120000))

	if js.Round(eightish*hundred) != 816 {
		t.Errorf("naive round %v", js.Round(eightish*hundred))
	}
	eqPtrInt(t, "8.165", ToCents(f(8.165)), i64(817))

	// And it stays exact on the ordinary 2-decimal case.
	eqPtrInt(t, "1199.99", ToCents(f(1199.99)), i64(119999))
	eqPtrInt(t, "0", ToCents(f(0)), i64(0))
	eqPtrInt(t, "1290", ToCents(f(1290)), i64(129000))
	eqPtrInt(t, "2640.5", ToCents(f(2640.5)), i64(264050))
	eqPtrInt(t, "null", ToCents(nil), nil) // null and undefined are both nil here
	// Rejected rather than stored: the column CHECK refuses negatives, and a NaN fare would
	// fail the whole upsert over one bad provider row.
	eqPtrInt(t, "-1", ToCents(f(-1)), nil)
	eqPtrInt(t, "NaN", ToCents(f(math.NaN())), nil)
	eqPtrInt(t, "Infinity", ToCents(f(math.Inf(1))), nil)
}

// Deno.test("toDate takes the calendar date and does not shift it through a timezone")
func TestToDateTakesTheCalendarDateAndDoesNotShiftIt(t *testing.T) {
	// The bug this prevents: a departure that moves a day depending on where the function
	// ran. Asserted against the naive path so the reason cannot be optimised away.
	naive := func(v string) string {
		d, ok := js.ParseDate(v)
		if !ok {
			t.Fatalf("unparsable %s", v)
		}
		return js.ISOString(d)[:10]
	}
	withOffset := "2026-11-14T00:00:00-05:00"
	eqPtrStr(t, withOffset, ToDate(withOffset), s("2026-11-14"))
	if got := naive(withOffset); got != "2026-11-14" {
		t.Errorf("naive %s", got)
	}
	lateOffset := "2026-11-14T23:30:00-05:00"
	eqPtrStr(t, lateOffset, ToDate(lateOffset), s("2026-11-14"))
	if got := naive(lateOffset); got != "2026-11-15" {
		t.Errorf("naive %s", got)
	}
	eqPtrStr(t, "date only", ToDate("2026-11-14"), s("2026-11-14"))
	eqPtrStr(t, "null", ToDate(""), nil) // "" stands for null
	eqPtrStr(t, "not a date", ToDate("not a date"), nil)
}

// Deno.test("toCurrency normalises to char(3) or drops the value")
func TestToCurrencyNormalisesToChar3OrDropsTheValue(t *testing.T) {
	eqPtrStr(t, "usd", ToCurrency("usd"), s("USD"))
	eqPtrStr(t, " eur ", ToCurrency(" eur "), s("EUR"))
	eqPtrStr(t, "US", ToCurrency("US"), nil)
	eqPtrStr(t, "US$", ToCurrency("US$"), nil)
	eqPtrStr(t, "null", ToCurrency(""), nil)
}

// Deno.test("toPortCalls numbers Holland America's all-null days densely")
func TestToPortCallsNumbersHollandAmericasAllNullDaysDensely(t *testing.T) {
	// Their spec: HAL's feed omits every per-port day number. Ordering by `day` would
	// scramble the itinerary; coalescing it to 0 or 1 would invent facts.
	calls := ToPortCalls([]ProviderPortStop{
		{Port: s("Fort Lauderdale")},
		{Port: s("Half Moon Cay")},
		{Port: s("Grand Turk")},
	})
	var seq []int
	var names []string
	for _, c := range calls {
		seq = append(seq, c.Sequence)
		names = append(names, c.PortName)
		if c.Day != nil {
			t.Errorf("%s: day %d", c.PortName, *c.Day)
		}
	}
	if !slices.Equal(seq, []int{1, 2, 3}) || !slices.Equal(names, []string{"Fort Lauderdale", "Half Moon Cay", "Grand Turk"}) {
		t.Errorf("sequence %v names %v", seq, names)
	}
}

// Deno.test("toPortCalls keeps sequence dense when a stop is dropped")
func TestToPortCallsKeepsSequenceDenseWhenAStopIsDropped(t *testing.T) {
	// A gap would trip the unique index on (sailing_id, sequence) only by luck; the real
	// damage is an itinerary that renders a hole. Filter first, number second.
	calls := ToPortCalls([]ProviderPortStop{
		{Port: s("Miami"), Day: f(1)},
		{Port: s("   "), Day: f(2)},
		{Port: s("Nassau"), Day: f(3)},
	})
	if len(calls) != 2 ||
		calls[0].Sequence != 1 || calls[0].PortName != "Miami" || calls[0].Day == nil || *calls[0].Day != 1 ||
		calls[1].Sequence != 2 || calls[1].PortName != "Nassau" || calls[1].Day == nil || *calls[1].Day != 3 {
		t.Errorf("calls %+v", calls)
	}
}

// Deno.test("toPortCalls tolerates a missing or malformed ports_list")
func TestToPortCallsToleratesAMissingOrMalformedPortsList(t *testing.T) {
	// null and undefined are both a nil list here.
	for _, stops := range [][]ProviderPortStop{nil, {}} {
		if got := ToPortCalls(stops); got == nil || len(got) != 0 {
			t.Errorf("got %v", got)
		}
	}
	if got := DecodeCruise(js.ObjectValue("ports_list", js.StringValue("nope"))).PortsList; len(ToPortCalls(got)) != 0 {
		t.Errorf("malformed: %v", got)
	}
}

// Deno.test("mapSailing drops a sailing with no readable departure date")
func TestMapSailingDropsASailingWithNoReadableDepartureDate(t *testing.T) {
	// departure_date is NOT NULL and is what every search filters on. Everything else on
	// their Cruise schema is nullable and must survive being absent.
	base := ProviderCruise{CruiseID: "Y731", Company: "princess", Locale: "en_US"}
	for _, d := range []string{"", "garbage"} {
		c := base
		c.DepartureDate = d
		if got := MapSailing(c); got != nil {
			t.Errorf("%q: got %+v", d, got)
		}
	}
	c := base
	c.DepartureDate = "2027-01-09T00:00:00Z"
	ok := MapSailing(c)
	if ok == nil {
		t.Fatal("nil row")
	}
	if ok.DepartureDate != "2027-01-09" || ok.Title != nil || ok.ShipName != nil || ok.DurationNights != nil ||
		ok.LeadPriceCents != nil || ok.Destinations == nil || len(ok.Destinations) != 0 {
		t.Errorf("row %+v", ok)
	}
}

// Deno.test("mapSailing keeps the (key, locale) pair that makes the row unique")
func TestMapSailingKeepsTheKeyLocalePairThatMakesTheRowUnique(t *testing.T) {
	// Princess and Holland America share the Y731 voyage-code format, and the same id recurs
	// per locale with different pricing. Both halves have to reach the row or the upsert
	// merges two different sailings.
	one := MapSailing(ProviderCruise{CruiseID: "Y731", Company: "princess", Locale: "en_US",
		DepartureDate: "2027-01-09T00:00:00Z", Price: f(1850), Currency: s("USD")})
	two := MapSailing(ProviderCruise{CruiseID: "Y731", Company: "holland-america", Locale: "en_GB",
		DepartureDate: "2027-01-09T00:00:00Z", Price: f(1490), Currency: s("GBP")})
	if one.ProviderKey != two.ProviderKey || one.ProviderLocale == two.ProviderLocale || one.Company == two.Company {
		t.Errorf("one %+v two %+v", one, two)
	}
	eqPtrInt(t, "one cents", one.LeadPriceCents, i64(185000))
	eqPtrStr(t, "one currency", one.Currency, s("USD"))
	eqPtrInt(t, "two cents", two.LeadPriceCents, i64(149000))
	eqPtrStr(t, "two currency", two.Currency, s("GBP"))
}

// Deno.test("mapSailing drops a fare that arrived without its currency")
func TestMapSailingDropsAFareThatArrivedWithoutItsCurrency(t *testing.T) {
	// cruise_sailing CHECKs that a non-null lead_price_cents has a currency. Dropping the
	// number beats failing the upsert over a provider row that sent one and not the other.
	row := MapSailing(ProviderCruise{CruiseID: "AB12", Company: "carnival", Locale: "en_US",
		DepartureDate: "2027-03-01", Price: f(1290), Currency: nil, PriceEuro: f(1190)})
	eqPtrInt(t, "cents", row.LeadPriceCents, nil)
	eqPtrStr(t, "currency", row.Currency, nil)
	// price_euro is independent of `currency` and survives.
	eqPtrInt(t, "eur cents", row.LeadPriceEurCents, i64(119000))
}

// Deno.test("mapCruiseLine reads cruise_count as the sailing count")
func TestMapCruiseLineReadsCruiseCountAsTheSailingCount(t *testing.T) {
	row := MapCruiseLine(ProviderCruiseLine{
		Company:           "ncl",
		DisplayName:       s("Norwegian Cruise Line"),
		CruiseCount:       f(8421),
		ShipCount:         f(19),
		DestinationCount:  f(42),
		Destinations:      []string{"Caribbean", "Alaska", "Caribbean"},
		Locales:           []string{"en_US", "en_GB"},
		EarliestDeparture: s("2026-09-12T00:00:00Z"),
		LatestDeparture:   s("2028-04-30T00:00:00Z"),
	})
	if row.Slug != "norwegian" || !row.IsBooked || row.ProviderKey != "ncl" {
		t.Errorf("row %+v", row)
	}
	eqPtrInt(t, "sailing count", row.SailingCount, i64(8421))
	eqPtrStr(t, "earliest", row.EarliestDeparture, s("2026-09-12"))
	eqPtrStr(t, "latest", row.LatestDeparture, s("2028-04-30"))
	// Duplicates within one payload are normal; order is preserved because destinations
	// render in the order the provider chose.
	if !slices.Equal(row.Destinations, []string{"Caribbean", "Alaska"}) {
		t.Errorf("destinations %v", row.Destinations)
	}
}

// Deno.test("mapCruiseLine marks a line Story-Tail does not book")
func TestMapCruiseLineMarksALineStoryTailDoesNotBook(t *testing.T) {
	row := MapCruiseLine(ProviderCruiseLine{Company: "aida", DisplayName: s("AIDA Cruises")})
	if row.Slug != "aida" || row.IsBooked {
		t.Errorf("row %+v", row)
	}
	// Sorted after the curated eight rather than interleaved with them.
	if row.DisplayOrder < 900 {
		t.Errorf("display order %d", row.DisplayOrder)
	}
}

// Deno.test("mapCruiseLine falls back to the slug when display_name is empty")
func TestMapCruiseLineFallsBackToTheSlugWhenDisplayNameIsEmpty(t *testing.T) {
	if row := MapCruiseLine(ProviderCruiseLine{Company: "msc", DisplayName: s("")}); row.Name != "msc" {
		t.Errorf("name %q", row.Name)
	}
}

// Deno.test("mapShip keys a ship by company and name, not name alone")
func TestMapShipKeysAShipByCompanyAndNameNotNameAlone(t *testing.T) {
	// /ships returns no id, so the provenance key is composite. Two lines both sailing a
	// "Discovery" would otherwise collide on one row.
	a := MapShip(ProviderShip{ShipName: "Discovery", Company: "princess", SailingCount: f(7)})
	b := MapShip(ProviderShip{ShipName: "Discovery", Company: "carnival", SailingCount: f(9)})
	if a.ProviderKey != "princess:Discovery" || b.ProviderKey != "carnival:Discovery" || a.ProviderKey == b.ProviderKey {
		t.Errorf("keys %q %q", a.ProviderKey, b.ProviderKey)
	}
}

// Deno.test("toCabinPrices normalises an open-ended cabin vocabulary")
func TestToCabinPricesNormalisesAnOpenEndedCabinVocabulary(t *testing.T) {
	// Five documented codes "plus line-specific tiers like CONCIERGE, AQUA, VISTA_SUITE,
	// NEPTUNE_SUITE, HAVEN", so shape is enforced, membership is not. The CHECK on cabin_code
	// is ^[A-Z0-9_]+$, which every output here has to satisfy.
	rows := ToCabinPrices([]CabinPrice{
		{"INTERIOR", f(1199)},
		{"OCEANVIEW", f(1399.99)},
		{"vista suite", f(3499)},
		{"neptune-suite", f(5099)},
		{"HAVEN", f(7200)},
	}, "USD", "en_US")
	byCode := map[string]int64{}
	check := regexp.MustCompile(`^[A-Z0-9_]+$`)
	for _, r := range rows {
		byCode[r.CabinCode] = r.PriceCents
		if !check.MatchString(r.CabinCode) || r.Currency != "USD" {
			t.Errorf("row %+v", r)
		}
	}
	for code, want := range map[string]int64{"INTERIOR": 119900, "OCEANVIEW": 139999, "VISTA_SUITE": 349900, "NEPTUNE_SUITE": 509900, "HAVEN": 720000} {
		if byCode[code] != want {
			t.Errorf("%s: got %d want %d", code, byCode[code], want)
		}
	}
}

// Deno.test("toCabinPrices yields nothing without a currency, and that is normal")
func TestToCabinPricesYieldsNothingWithoutACurrency(t *testing.T) {
	// Costa's cabin source has been unavailable since 2026-04-21 per their spec, and the list
	// endpoint never sends this field at all. Absence is not an error. ("" is null here.)
	interior := []CabinPrice{{"INTERIOR", f(1199)}}
	for _, tc := range []struct {
		prices           []CabinPrice
		currency, locale string
	}{
		{interior, "", "en_US"},
		{nil, "USD", "en_US"}, // null
		{nil, "USD", "en_US"}, // undefined
		// No locale means we cannot say which market the figures belong to, so they are
		// dropped rather than stored ambiguously.
		{interior, "USD", ""},
	} {
		if got := ToCabinPrices(tc.prices, tc.currency, tc.locale); got == nil || len(got) != 0 {
			t.Errorf("%+v: got %v", tc, got)
		}
	}
}

// Deno.test("slugify handles the accented port and ship names the feed contains")
func TestSlugifyHandlesTheAccentedPortAndShipNames(t *testing.T) {
	for in, want := range map[string]string{
		"Cura\U000000E7ao":           "curacao",
		"Wonder of the Seas":         "wonder-of-the-seas",
		"  M\U000000E1laga, Spain  ": "malaga-spain",
		"AIDAnova":                   "aidanova",
	} {
		if got := Slugify(in); got != want {
			t.Errorf("%q: got %q want %q", in, got, want)
		}
	}
}

// Against a real captured page: four things none of the provider's own spec examples show.
//  1. THE SAME cruise_id ACROSS LOCALES, with different prices, currencies, titles,
//     durations and even itinerary_ids. 61020 is 23 nights in en_US and 21 in nl_NL.
//  2. `pt_BR`, WHICH IS NOT IN THEIR PUBLISHED LocaleEnum. Priced in BRL.
//  3. LOCALISED PORT NAMES. "Rhodes, Greece" / "Rodi, Grecia" / "Rodes, Grécia" are the same
//     physical port under three names, and nothing in the payload connects them.
//  4. departure_date at 04:00Z: midnight US Eastern, the exact shape that makes a
//     timezone-naive date conversion move a sailing by a day.

// Deno.test("one cruise_id across locales yields distinct rows, not one merged row")
func TestOneCruiseIDAcrossLocalesYieldsDistinctRows(t *testing.T) {
	// The natural key is (provider, provider_key, provider_locale). Keyed on provider_key
	// alone these collapse into one row whose price and duration depend on which page
	// arrived last.
	var sixtyOne []*SailingRow
	for _, c := range liveCruises(t) {
		if r := MapSailing(c); r != nil && r.ProviderKey == "61020" {
			sixtyOne = append(sixtyOne, r)
		}
	}
	if len(sixtyOne) != 3 {
		t.Fatalf("rows %d", len(sixtyOne))
	}
	keys := map[string]bool{}
	byLocale := map[string]*SailingRow{}
	for _, r := range sixtyOne {
		keys[r.Provider+"|"+r.ProviderKey+"|"+r.ProviderLocale] = true
		byLocale[r.ProviderLocale] = r
	}
	if len(keys) != 3 {
		t.Errorf("all three must be distinguishable: %v", keys)
	}
	eqPtrInt(t, "en_US nights", byLocale["en_US"].DurationNights, i64(23))
	eqPtrInt(t, "nl_NL nights", byLocale["nl_NL"].DurationNights, i64(21))
	eqPtrInt(t, "en_US cents", byLocale["en_US"].LeadPriceCents, i64(436800))
	eqPtrStr(t, "en_US currency", byLocale["en_US"].Currency, s("USD"))
	eqPtrInt(t, "nl_NL cents", byLocale["nl_NL"].LeadPriceCents, i64(342000))
	eqPtrStr(t, "nl_NL currency", byLocale["nl_NL"].Currency, s("EUR"))
}

// Deno.test("a locale outside the published enum still maps")
func TestALocaleOutsideThePublishedEnumStillMaps(t *testing.T) {
	// pt_BR is absent from their LocaleEnum but present in live responses. Had
	// provider_locale been a Postgres enum, this row would have failed the whole page.
	var brazil *ProviderCruise
	for _, c := range liveCruises(t) {
		if c.Locale == "pt_BR" {
			brazil = &c
			break
		}
	}
	row := MapSailing(*brazil)
	if row.ProviderLocale != "pt_BR" {
		t.Errorf("locale %s", row.ProviderLocale)
	}
	eqPtrStr(t, "currency", row.Currency, s("BRL"))
	eqPtrInt(t, "cents", row.LeadPriceCents, i64(1112100))
	// price_euro is a cross-market conversion and lands on a fractional cent: the case
	// ToCents exists for.
	eqPtrInt(t, "eur cents", row.LeadPriceEurCents, i64(189671))
}

// Deno.test("a 04:00Z departure stays on its own calendar day")
func TestA0400ZDepartureStaysOnItsOwnCalendarDay(t *testing.T) {
	// Live departure_date values are midnight US Eastern expressed as 04:00Z. Read as an
	// instant and reformatted in a westward zone, this sailing moves to the 8th.
	if row := MapSailing(liveCruises(t)[0]); row.DepartureDate != "2026-09-09" {
		t.Errorf("departure %s", row.DepartureDate)
	}
}

// Deno.test("localised port names are NOT reconciled, and that is a known limitation")
func TestLocalisedPortNamesAreNotReconciled(t *testing.T) {
	// "Rhodes, Greece" / "Rodi, Grecia" / "Rodes, Grécia" are one physical port under three
	// names, and nothing in the payload connects them. This does not assert a fix: it pins
	// the behaviour so the day someone syncs a non-en_US locale, the duplicate port rows are
	// a documented consequence rather than a surprise. See cruise_port's column comment.
	var names, englishOnly []string
	for _, c := range liveCruises(t) {
		for _, p := range ToPortCalls(c.PortsList) {
			names = append(names, p.PortName)
			if c.Locale == "en_US" {
				englishOnly = append(englishOnly, p.PortName)
			}
		}
	}
	for _, n := range []string{"Rhodes, Greece", "Rodi, Grecia", "Rodes, Gr\U000000E9cia"} {
		if !slices.Contains(names, n) {
			t.Errorf("missing %s", n)
		}
	}
	// Every en_US scope is unaffected, which is why the shipped configuration is en_US only.
	if slices.Contains(englishOnly, "Rodi, Grecia") {
		t.Error("en_US carries Rodi")
	}
}

// Deno.test("mapPort strips the quoting debris in the live port catalogue")
func TestMapPortStripsTheQuotingDebrisInTheLivePortCatalogue(t *testing.T) {
	// Real entries from a live /filter-options response. The apostrophes are encoding debris;
	// leaving them makes the natural key unstable the day the provider fixes it.
	none := js.UndefinedValue()
	for in, want := range map[string]string{
		"'Bucht von Palma'":              "Bucht von Palma",
		"'Ionisches Meer 'darkest spot'": "Ionisches Meer 'darkest spot",
		"  Barcelona, Spain  ":           "Barcelona, Spain",
		// An at-sea position is a real itinerary stop and is kept verbatim: dropping it would
		// put a hole in the port-call sequence of every sailing with a sea day.
		"38.6 N 19.8 E - Ionian Sea": "38.6 N 19.8 E - Ionian Sea",
	} {
		if got := MapPort(in, none).Name; got != want {
			t.Errorf("%q: got %q want %q", in, got, want)
		}
	}
	// A count the caller did not measure is ABSENT, not null, and the distinction is the
	// whole of a live data-destruction bug: an absent key is not named in the upsert, so
	// Postgres leaves the column alone, where an explicit null ERASED the count the /ports
	// pass had measured.
	if MapPort("Nassau, Bahamas", none).SailingCountSet {
		t.Error("sailing_count present without a count")
	}
	counted := MapPort("Nassau, Bahamas", js.NumberValue(5401))
	if !counted.SailingCountSet {
		t.Error("sailing_count absent")
	}
	eqPtrInt(t, "5401", counted.SailingCount, i64(5401))
	// Still never a misleading zero when the provider does answer but with nothing usable.
	nan := MapPort("Nassau, Bahamas", js.NumberValue(math.NaN()))
	if !nan.SailingCountSet || nan.SailingCount != nil {
		t.Errorf("NaN: set %v count %v", nan.SailingCountSet, showInt(nan.SailingCount))
	}
}

// Deno.test("both writers of cruise_ship agree on the provenance key")
func TestBothWritersOfCruiseShipAgreeOnTheProvenanceKey(t *testing.T) {
	// Two code paths write this table: /ships through MapShip, and a sailing naming an
	// unknown ship through sync's stub path. They diverged (the stub built its key from the
	// internal cruise_line UUID); this asserts they cannot drift apart again.
	fromShipsEndpoint := MapShip(ProviderShip{ShipName: "Norwegian Spirit", Company: "ncl", SailingCount: f(42)})
	if fromShipsEndpoint.ProviderKey != ShipProviderKey("ncl", "Norwegian Spirit") || fromShipsEndpoint.ProviderKey != "ncl:Norwegian Spirit" {
		t.Errorf("key %q", fromShipsEndpoint.ProviderKey)
	}
	// The company slug, never a uuid: a provenance key must survive the line row being
	// recreated, and must be reconcilable against the provider.
	if got := ShipProviderKey("ncl", "  Norwegian Spirit  "); got != "ncl:Norwegian Spirit" {
		t.Errorf("trimmed key %q", got)
	}
	if regexp.MustCompile(`^[0-9a-f-]{36}:`).MatchString(fromShipsEndpoint.ProviderKey) {
		t.Error("uuid key")
	}
}

// Deno.test("cabin prices carry the market they came from")
func TestCabinPricesCarryTheMarketTheyCameFrom(t *testing.T) {
	// GET /cruises/{id} answers de_DE/EUR whatever you ask for (it takes no locale parameter
	// and ignores one). So a US sailing's breakdown arrives in euros, and it has to say so:
	// quoting a euro figure as a dollar one is the failure this column prevents. The ratios
	// are still market-independent, which is why the rows are kept.
	rows := ToCabinPrices([]CabinPrice{
		{"INTERIOR", f(1198.3)}, {"OCEANVIEW", f(1398)}, {"BALCONY", f(1698)}, {"DELUXE", f(2498)},
	}, "EUR", "de_DE")
	if len(rows) != 4 {
		t.Fatalf("rows %d", len(rows))
	}
	byCode := map[string]int64{}
	for _, r := range rows {
		byCode[r.CabinCode] = r.PriceCents
		if r.Currency != "EUR" || r.ProviderLocale != "de_DE" {
			t.Errorf("row %+v", r)
		}
	}
	// Ratios survive the currency mismatch, and they are the useful part.
	if !(byCode["BALCONY"] > byCode["INTERIOR"] && byCode["DELUXE"] > byCode["BALCONY"]) {
		t.Errorf("ratios %v", byCode)
	}
}
