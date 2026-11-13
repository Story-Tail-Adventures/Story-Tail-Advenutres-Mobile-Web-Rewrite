package search

import (
	"math"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Search over the curated catalog behind 2.0.3 / 2.0.4 (Screen Inventory §2.0). Ports
// web/lib/public/search.ts.
//
// Everything here is pure and total: ParseSearchParams never panics on hostile input,
// unknown values are dropped, lengths are capped, and sorting breaks ties by slug, so the
// same URL always renders the same order.

// The curated catalog's trip types and vibes. content declares the types; the values are
// the filter vocabulary, so they live here.
const (
	TypeAllInclusive content.TripType = "all-inclusive"
	TypeCruise       content.TripType = "cruise"
	TypeHotel        content.TripType = "hotel"
	TypeTour         content.TripType = "tour"

	VibeAdultsOnly content.Vibe = "adults-only"
	VibeFamily     content.Vibe = "family"
	VibeHoneymoon  content.Vibe = "honeymoon"
	VibeFiveStar   content.Vibe = "five-star"
	VibeCouples    content.Vibe = "couples"
	VibeGroup      content.Vibe = "group"
	VibeBoutique   content.Vibe = "boutique"
	VibeAdventure  content.Vibe = "adventure"
)

// TripTypes is every trip type, in rail order.
var TripTypes = []content.TripType{TypeAllInclusive, TypeCruise, TypeHotel, TypeTour}

// Vibes is every vibe, in rail order.
var Vibes = []content.Vibe{
	VibeAdultsOnly, VibeFamily, VibeHoneymoon, VibeFiveStar, VibeCouples, VibeGroup,
	VibeBoutique, VibeAdventure,
}

// BudgetBands is every budget band, cheapest first.
var BudgetBands = []BudgetBand{BudgetUnder2k, Budget2kTo4k, Budget4kPlus}

// Topics is every topic page, in nav order.
var Topics = []content.Topic{content.Caribbean, content.Cruises, content.Honeymoons}

// SortKey is how the results are ordered.
type SortKey string

// The sort keys.
const (
	SortBestFit   SortKey = "best-fit"
	SortPriceAsc  SortKey = "price-asc"
	SortPriceDesc SortKey = "price-desc"
	SortRating    SortKey = "rating"
)

// SortKeys is every sort key, in menu order.
var SortKeys = []SortKey{SortBestFit, SortPriceAsc, SortPriceDesc, SortRating}

// ResultsMode is which catalog the results page shows.
//
// Picks is Gyasi's curated catalog and stays the default. Hotels is the live provider
// search. It is left out of the URL when it can be derived, as the default sort is, so a
// search carrying dates lands on hotels without a param, and an explicit click on
// "Gyasi's picks" writes mode=picks and survives every later filter click.
type ResultsMode string

// The modes.
const (
	ModePicks   ResultsMode = "picks"
	ModeHotels  ResultsMode = "hotels"
	ModeCruises ResultsMode = "cruises"
)

// Modes is every mode.
var Modes = []ResultsMode{ModePicks, ModeHotels, ModeCruises}

// StarClass is a hotel's star class as Google classifies it. It is not the guest rating
// (the 4.8 on the card); the rail filters on the classification.
type StarClass string

// StarClasses is every star class the rail offers.
var StarClasses = []StarClass{"3", "4", "5"}

// Amenity is one hotel amenity the rail offers. The ids are Google's, not ours
// (Data-Model §24.0 rule 4): a provider's vocabulary is text, and it grows without notice.
type Amenity struct {
	ID    string
	Label string
}

// HotelAmenities are the five Screen Inventory 2.3.3's rail asks for, in rail order.
var HotelAmenities = []Amenity{
	{ID: "11", Label: "Beach access"},
	{ID: "6", Label: "Pool"},
	{ID: "10", Label: "Spa"},
	{ID: "52", Label: "All-inclusive"},
	{ID: "12", Label: "Family-friendly"},
}

// AmenityIDs is the HotelAmenities ids, in order.
var AmenityIDs = []string{"11", "6", "10", "52", "12"}

// RateBand is a nightly rate band's id.
type RateBand string

// RateBandInfo is one nightly rate band. Min and Max are whole dollars a night; nil is no
// bound.
//
// A separate axis from the budget, which is a per-person trip total. Reusing that param
// would make one key mean two things depending on the mode, and a mode switch would
// silently reinterpret the visitor's filter.
type RateBandInfo struct {
	ID    RateBand
	Label string
	Min   *int
	Max   *int
}

func intp(n int) *int { return &n }

// RateBands is every nightly rate band, cheapest first.
var RateBands = []RateBandInfo{
	{ID: "under-150", Label: "Under $150 / night", Min: nil, Max: intp(150)},
	{ID: "150-300", Label: "$150 – $300", Min: intp(150), Max: intp(300)},
	{ID: "300-plus", Label: "$300+", Min: intp(300), Max: nil},
}

// RateBandIDs is the RateBands ids, in order.
var RateBandIDs = []RateBand{"under-150", "150-300", "300-plus"}

// HotelSortKeys are the sort keys hotels mode offers. The provider has no best fit and no
// price descending: best fit maps to leaving sort_by out, which is Google's own relevance,
// and a URL carrying price-desc from picks mode degrades to that rather than silently
// sorting by something else, keeping its value so switching back restores it.
var HotelSortKeys = []SortKey{SortBestFit, SortPriceAsc, SortRating}

// SerpSortBy is SerpApi's sort_by for a sort key, or "" for relevance.
func SerpSortBy(sort SortKey) string {
	switch sort {
	case SortPriceAsc:
		return "3"
	case SortRating:
		return "8"
	}
	return ""
}

// SortKeysFor is the sort menu for a mode. Cruises has none: they come back in departure
// order from our own catalog and there is no public fare to sort by (Free-Travel-APIs
// §4.7), so the menu would offer keys that all do nothing.
func SortKeysFor(mode ResultsMode) []SortKey {
	switch mode {
	case ModeCruises:
		return []SortKey{}
	case ModeHotels:
		return HotelSortKeys
	}
	return SortKeys
}

// SortLabels are the sort menu's labels.
var SortLabels = map[SortKey]string{
	SortBestFit:   "Best fit",
	SortPriceAsc:  "Price · low to high",
	SortPriceDesc: "Price · high to low",
	SortRating:    "Rating",
}

// TripTypeLabels are the rail's trip type labels.
var TripTypeLabels = map[content.TripType]string{
	TypeAllInclusive: "All-inclusive",
	TypeCruise:       "Cruise",
	TypeHotel:        "Hotel",
	TypeTour:         "Tour",
}

// VibeLabels are the rail's vibe labels.
var VibeLabels = map[content.Vibe]string{
	VibeAdultsOnly: "Adults-only",
	VibeFamily:     "Family",
	VibeHoneymoon:  "Honeymoon",
	VibeFiveStar:   "5★",
	VibeCouples:    "Couples",
	VibeGroup:      "Group",
	VibeBoutique:   "Boutique",
	VibeAdventure:  "Adventure",
}

// SearchQuery is a results URL, read. An empty string, a zero Travelers and an empty Mode
// are "not in the URL", which is what undefined was.
type SearchQuery struct {
	// Dest is free-text destination text ("Caribbean", "Nassau"), trimmed, at most 60
	// UTF-16 code units.
	Dest    string
	Topic   content.Topic
	Types   []content.TripType
	Vibes   []content.Vibe
	Budgets []BudgetBand
	Sort    SortKey
	// CheckIn and CheckOut are YYYY-MM-DD, both or neither: half a range cannot be sent to
	// a hotel API and reads as "flexible dates" everywhere it is shown.
	CheckIn  string
	CheckOut string
	// When is the free text from before the picker (?when=Aug 12 – 19), kept so links
	// shared then still show their dates in the header pill. DISPLAY ONLY: it is never
	// parsed and never reaches a provider. New links write in/out instead.
	When string
	// Travelers is 1 to 20, or 0 when not given.
	Travelers int
	// Mode is empty when it can be derived; see EffectiveMode.
	Mode      ResultsMode
	Stars     []StarClass
	Amenities []string
	Rates     []RateBand
}

// EffectiveMode is the catalog to render: dates imply hotels, and an explicit mode always
// wins. Cruises is never derived; a sailing is chosen by where and roughly when, not by the
// exact check-in a hotel needs, so nothing in a query means "they wanted cruises".
func EffectiveMode(q SearchQuery) ResultsMode {
	if q.Mode != "" {
		return q.Mode
	}
	if q.CheckIn != "" && q.CheckOut != "" {
		return ModeHotels
	}
	return ModePicks
}

// MaxStayNights bounds a stay, so a hostile or fat-fingered URL cannot become an expensive
// upstream query: a hotel search is metered per request.
const MaxStayNights = 30

// MaxBookingDaysAhead is about 16 months. It MUST NOT EXCEED MAX_DAYS_AHEAD in
// supabase/functions/hotel-search/index.ts, which is the same number: a stay the UI accepts
// and the function refuses tells the visitor "that search didn't come back" for a date the
// page had taken. The provider-facing bound is the real one.
const MaxBookingDaysAhead = 500

// SearchTimeZone is the zone "today" means on a public page, where there is no signed-in
// visitor's zone to read. Story-Tail operates from Orlando, so the business day is the
// honest default, and one fixed zone rather than the server's, which is UTC and would make
// a late-evening search in the US refuse a stay starting today.
const SearchTimeZone = "America/New_York"

const (
	maxText  = 60
	maxMulti = 8
)

// asList splits a param into its values: repeated keys as given, a single value split on
// commas, each trimmed, empties dropped, at most eight.
func asList(vals []string) []string {
	if len(vals) == 0 {
		return nil
	}
	list := vals
	if len(vals) == 1 {
		list = strings.Split(vals[0], ",")
	}
	out := make([]string, 0, maxMulti)
	for _, v := range list {
		if v = jsTrim(v); v != "" {
			out = append(out, v)
			if len(out) == maxMulti {
				break
			}
		}
	}
	return out
}

// pickAllowed keeps the values in allowed, once each, in the order given.
func pickAllowed[T ~string](values []string, allowed []T) []T {
	out := []T{}
	for _, v := range values {
		t := T(v)
		if slices.Contains(allowed, t) && !slices.Contains(out, t) {
			out = append(out, t)
		}
	}
	return out
}

var (
	ccRun    = regexp.MustCompile(`\p{Cc}`)
	spaceRun = regexp.MustCompile(`[\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+`)
)

// CleanText is one free-text query value: control characters out, whitespace runs made one
// space, trimmed, at most 60 UTF-16 code units, or "" when nothing is left.
func CleanText(raw string) string {
	cleaned := ccRun.ReplaceAllString(decodeUTF8(raw), "")
	cleaned = spaceRun.ReplaceAllString(cleaned, " ")
	return sliceUTF16(jsTrim(cleaned), maxText)
}

// first is the TypeScript's view of one param: the first value of a list.
func first(vals []string) string {
	if len(vals) == 0 {
		return ""
	}
	return vals[0]
}

// ParseSearchParams reads a results URL. today is the visitor's day as YYYY-MM-DD; empty
// means today in SearchTimeZone. The server's own day is the wrong answer: a page rendered
// at 23:00 in Orlando is already tomorrow in UTC, and a stay starting today would be
// dropped as past.
//
// Pass ParseQuery(r.URL.RawQuery) for exactly the TypeScript's reading of the URL;
// r.URL.Query() drops a few hostile pairs that one kept.
func ParseSearchParams(sp url.Values, today string) SearchQuery {
	if today == "" {
		today = todayInSearchZone()
	}
	get := func(key string) []string {
		vals := sp[key]
		out := make([]string, len(vals))
		for i, v := range vals {
			out[i] = decodeUTF8(v)
		}
		return out
	}

	topicRaw := CleanText(first(get("topic")))
	sortRaw := CleanText(first(get("sort")))
	travelersRaw := CleanText(first(get("travelers")))
	modeRaw := CleanText(first(get("mode")))

	q := SearchQuery{
		Dest:      CleanText(first(get("dest"))),
		Types:     pickAllowed(asList(get("type")), TripTypes),
		Vibes:     pickAllowed(asList(get("vibe")), Vibes),
		Budgets:   pickAllowed(asList(get("budget")), BudgetBands),
		Sort:      SortBestFit,
		When:      CleanText(first(get("when"))),
		Stars:     pickAllowed(asList(get("star")), StarClasses),
		Amenities: pickAllowed(asList(get("amenity")), AmenityIDs),
		Rates:     pickAllowed(asList(get("rate")), RateBandIDs),
	}
	if t := content.Topic(topicRaw); slices.Contains(Topics, t) {
		q.Topic = t
	}
	if s := SortKey(sortRaw); slices.Contains(SortKeys, s) {
		q.Sort = s
	}
	if m := ResultsMode(modeRaw); slices.Contains(Modes, m) {
		q.Mode = m
	}
	// Number.isFinite turns away NaN (no digits); 60 characters of digits stay finite.
	if n, ok := parseInt(travelersRaw); ok && !math.IsInf(n, 0) {
		q.Travelers = int(math.Min(20, math.Max(1, n)))
	}
	if in, out, ok := ParseStay(CleanText(first(get("in"))), CleanText(first(get("out"))), today); ok {
		q.CheckIn, q.CheckOut = in, out
	}
	return q
}

// todayInSearchZone is today in SearchTimeZone. The zone database is embedded, so the
// fallback to UTC is unreachable; it is there so this can never panic.
func todayInSearchZone() string {
	t, err := TodayISO(SearchTimeZone, clock())
	if err != nil {
		return clock().UTC().Format(time.DateOnly)
	}
	return t
}

// ParseStay validates a check-in and check-out pair, or returns false.
//
// Total, like everything here: hostile input is dropped, never panicked on. Both dates go
// or neither stays. The rules, cheapest first:
//
//   - both present and both real calendar dates (2026-02-30 is refused, which a shape check
//     alone would wave through)
//   - check-out strictly after check-in; a zero-night stay is not a stay
//   - not in the past, against the CALLER'S day rather than the server's
//   - at most MaxStayNights long and MaxBookingDaysAhead out
func ParseStay(rawIn, rawOut, today string) (checkIn, checkOut string, ok bool) {
	if !IsValidISODate(rawIn) || !IsValidISODate(rawOut) {
		return "", "", false
	}
	nights, ok := NightsBetween(rawIn, rawOut)
	if !ok || nights < 1 || nights > MaxStayNights {
		return "", "", false
	}
	if rawIn < today {
		return "", "", false
	}
	if horizon, ok := AddDays(today, MaxBookingDaysAhead); ok && rawIn > horizon {
		return "", "", false
	}
	return rawIn, rawOut, true
}

// ResultsHref is the canonical results link for a query: the same params in the same order
// every time, the default sort left out, and the bare path for an empty query.
func ResultsHref(q SearchQuery) string {
	var p params
	if q.Dest != "" {
		p.set("dest", q.Dest)
	}
	if q.Topic != "" {
		p.set("topic", string(q.Topic))
	}
	for _, t := range q.Types {
		p.add("type", string(t))
	}
	for _, v := range q.Vibes {
		p.add("vibe", string(v))
	}
	for _, b := range q.Budgets {
		p.add("budget", string(b))
	}
	if q.CheckIn != "" && q.CheckOut != "" {
		p.set("in", q.CheckIn)
		p.set("out", q.CheckOut)
	} else if q.When != "" {
		// Only when there is no real range to carry instead, so a link that has been
		// through the picker never keeps the stale free text beside it.
		p.set("when", q.When)
	}
	if q.Travelers != 0 {
		p.set("travelers", strconv.Itoa(q.Travelers))
	}
	for _, s := range q.Stars {
		p.add("star", string(s))
	}
	for _, a := range q.Amenities {
		p.add("amenity", a)
	}
	for _, r := range q.Rates {
		p.add("rate", string(r))
	}
	// Only when explicit: a dated search derives hotels without polluting the URL, the same
	// way best-fit is left out below.
	if q.Mode != "" {
		p.set("mode", string(q.Mode))
	}
	if q.Sort != "" && q.Sort != SortBestFit {
		p.set("sort", string(q.Sort))
	}
	if qs := p.String(); qs != "" {
		return "/explore/results?" + qs
	}
	return "/explore/results"
}

// normalize folds text for matching: compatibility decomposition, combining marks
// (U+0300 to U+036F) out, lower case. So "Curaçao" matches "curacao".
func normalize(text string) string {
	decomposed := norm.NFKD.String(text)
	stripped := strings.Map(func(r rune) rune {
		if r >= 0x0300 && r <= 0x036F {
			return -1
		}
		return r
	}, decomposed)
	return strings.ToLower(stripped)
}

// placement is a trip's placement on a topic page, and false when it is not on it.
func placement(t content.Trip, topic content.Topic) (content.TopicPlacement, bool) {
	for _, e := range t.Topics {
		if e.Topic == topic {
			return e.Placement, true
		}
	}
	return content.TopicPlacement{}, false
}

// matchesDest reports whether every word of dest appears in the trip's place, region,
// island, name or tagline.
func matchesDest(trip content.Trip, dest string) bool {
	needle := normalize(dest)
	if needle == "" {
		return true
	}
	island := ""
	if trip.Destination.Island != nil {
		island = string(*trip.Destination.Island)
	}
	fields := []string{trip.Destination.Place, trip.Destination.Region, island, trip.Name, trip.Tagline}
	for i, f := range fields {
		fields[i] = normalize(f)
	}
	haystack := strings.Join(fields, " | ")
	for _, word := range strings.Split(needle, " ") {
		if !strings.Contains(haystack, word) {
			return false
		}
	}
	return true
}

// FilterTrips keeps the trips a query matches: OR within a group, AND across groups.
func FilterTrips(trips []content.Trip, q SearchQuery) []content.Trip {
	out := make([]content.Trip, 0, len(trips))
	for _, trip := range trips {
		if q.Topic != "" {
			if _, ok := placement(trip, q.Topic); !ok {
				continue
			}
		}
		if len(q.Types) > 0 && !slices.Contains(q.Types, trip.Type) {
			continue
		}
		if len(q.Vibes) > 0 && !slices.ContainsFunc(q.Vibes, func(v content.Vibe) bool {
			return slices.Contains(trip.Vibes, v)
		}) {
			continue
		}
		if len(q.Budgets) > 0 && !slices.Contains(q.Budgets, BandFromCents(trip.From.AmountCents)) {
			continue
		}
		if q.Dest != "" && !matchesDest(trip, q.Dest) {
			continue
		}
		out = append(out, trip)
	}
	return out
}

// badgeWeight ranks the badges for best fit; any other badge is 2, and none is 3.
var badgeWeight = map[string]int{
	"Gyasi's pick":     0,
	"Great for groups": 1,
	"Off-the-beaten":   1,
}

func bestFitRank(trip content.Trip) int {
	badge := 3
	if trip.Badge != nil && *trip.Badge != "" {
		badge = 2
		if w, ok := badgeWeight[*trip.Badge]; ok {
			badge = w
		}
	}
	// Math.min over the placements' orders, or 99 when the trip is on no topic page.
	best := 99
	for i, e := range trip.Topics {
		if i == 0 || e.Placement.Order < best {
			best = e.Placement.Order
		}
	}
	return badge*100 + best
}

// RatingLookup is a trip's guest rating by slug, and false when there is none (sorted as 0).
type RatingLookup func(slug string) (float64, bool)

// sign is the sign of a comparator's number, with NaN read as 0 the way || reads it.
func sign(d float64) int {
	switch {
	case d < 0:
		return -1
	case d > 0:
		return 1
	}
	return 0
}

// SortTrips returns the trips in a new slice, ordered by sort, ties broken by slug in
// String.prototype.localeCompare's order. It never changes trips. rating may be nil.
func SortTrips(trips []content.Trip, sort SortKey, rating RatingLookup) []content.Trip {
	// A collator is not safe for concurrent use, so each sort has its own.
	col := collate.New(language.English)
	bySlug := func(a, b content.Trip) int { return col.CompareString(a.Slug, b.Slug) }
	rate := func(slug string) float64 {
		if rating == nil {
			return 0
		}
		if r, ok := rating(slug); ok {
			return r
		}
		return 0
	}
	out := slices.Clone(trips)
	var cmp func(a, b content.Trip) int
	switch sort {
	case SortPriceAsc:
		cmp = func(a, b content.Trip) int {
			return orElse(compareInt(a.From.AmountCents, b.From.AmountCents), bySlug(a, b))
		}
	case SortPriceDesc:
		cmp = func(a, b content.Trip) int {
			return orElse(compareInt(b.From.AmountCents, a.From.AmountCents), bySlug(a, b))
		}
	case SortRating:
		cmp = func(a, b content.Trip) int {
			return orElse(sign(rate(b.Slug)-rate(a.Slug)), bySlug(a, b))
		}
	default:
		cmp = func(a, b content.Trip) int {
			return orElse(compareInt(int64(bestFitRank(a)), int64(bestFitRank(b))), bySlug(a, b))
		}
	}
	slices.SortStableFunc(out, cmp)
	return out
}

func compareInt(a, b int64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

// orElse is the comparator's "x || y".
func orElse(x, y int) int {
	if x != 0 {
		return x
	}
	return y
}

// SearchTrips filters, then sorts by the query's sort.
func SearchTrips(trips []content.Trip, q SearchQuery, rating RatingLookup) []content.Trip {
	return SortTrips(FilterTrips(trips, q), q.Sort, rating)
}

// TripsForTopic is the trips featured on a topic page, in the designer's order.
func TripsForTopic(trips []content.Trip, topic content.Topic) []content.Trip {
	out := make([]content.Trip, 0, len(trips))
	for _, t := range trips {
		if _, ok := placement(t, topic); ok {
			out = append(out, t)
		}
	}
	slices.SortStableFunc(out, func(a, b content.Trip) int {
		pa, _ := placement(a, topic)
		pb, _ := placement(b, topic)
		return compareInt(int64(pa.Order), int64(pb.Order))
	})
	return out
}

// CountByTopic is how many trips a topic page features.
func CountByTopic(trips []content.Trip, topic content.Topic) int {
	n := 0
	for _, t := range trips {
		if _, ok := placement(t, topic); ok {
			n++
		}
	}
	return n
}

// DescribeQuery is the results heading's place text: "148 trips · Caribbean".
func DescribeQuery(q SearchQuery) string {
	switch {
	case q.Dest != "":
		return q.Dest
	case q.Topic == content.Cruises:
		return "Cruises"
	case q.Topic == content.Honeymoons:
		return "Honeymoons"
	case q.Topic != "":
		return "Caribbean"
	case len(q.Types) == 1:
		return TripTypeLabels[q.Types[0]]
	case len(q.Vibes) == 1:
		return VibeLabels[q.Vibes[0]]
	}
	return "Everywhere Gyasi plans"
}

// StayLabel is how the Dates cell reads: the picked range in timeZone's year, else the
// pre-picker free text, else false. The caller supplies the fallback ("Flexible dates"), so
// this stays free of copy. An empty timeZone is SearchTimeZone.
func StayLabel(q SearchQuery, timeZone string) (string, bool) {
	if timeZone == "" {
		timeZone = SearchTimeZone
	}
	if q.CheckIn != "" && q.CheckOut != "" {
		return FormatRange(q.CheckIn, q.CheckOut, timeZone, ""), true
	}
	return q.When, q.When != ""
}

// StayNights is the nights in the picked stay, when there is one. It drives "3 nights" in
// the results heading.
func StayNights(q SearchQuery) (int, bool) {
	if q.CheckIn == "" || q.CheckOut == "" {
		return 0, false
	}
	return NightsBetween(q.CheckIn, q.CheckOut)
}

// HasActiveFilters reports whether the visitor has narrowed the search at all.
func HasActiveFilters(q SearchQuery) bool {
	return q.Dest != "" || q.Topic != "" || len(q.Types) > 0 || len(q.Vibes) > 0 || len(q.Budgets) > 0
}
