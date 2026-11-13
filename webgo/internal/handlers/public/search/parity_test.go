package search

import (
	"bytes"
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Parity: the Go against what the TypeScript returned for the same inputs
// (parity_data_test.go). The ported unit tests say what each function is for; these say
// the port did not drift from the original on anything else, hostile input included.

const parityToday = "2026-11-07"

func TestParityDates(t *testing.T) {
	for _, c := range parityValidISO {
		if got := IsValidISODate(c.in); got != c.want {
			t.Errorf("IsValidISODate(%q) = %v, want %v", c.in, got, c.want)
		}
	}
	for _, c := range parityAddDays {
		if got, ok := AddDays(c.in, c.days); got != c.want || ok != c.ok {
			t.Errorf("AddDays(%q, %d) = %q, %v; want %q, %v", c.in, c.days, got, ok, c.want, c.ok)
		}
	}
	for _, c := range parityNights {
		if got, ok := NightsBetween(c.a, c.b); got != c.want || ok != c.ok {
			t.Errorf("NightsBetween(%q, %q) = %d, %v; want %d, %v", c.a, c.b, got, ok, c.want, c.ok)
		}
	}
	for _, c := range parityFormatRange {
		if c.today == "" {
			continue // the TypeScript was handed "" itself; to the Go, "" means now
		}
		if got := FormatRange(c.in, c.out, SearchTimeZone, c.today); got != c.want {
			t.Errorf("FormatRange(%q, %q, today %q) = %q, want %q", c.in, c.out, c.today, got, c.want)
		}
	}
	for _, c := range parityDayLong {
		if got := FormatDayLong(c.in); got != c.want {
			t.Errorf("FormatDayLong(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	for _, c := range parityTodayISO {
		at, err := time.Parse(time.RFC3339, c.at)
		if err != nil {
			t.Fatal(err)
		}
		if got, err := TodayISO(c.zone, at); err != nil || got != c.want {
			t.Errorf("TodayISO(%q, %s) = %q, %v; want %q", c.zone, c.at, got, err, c.want)
		}
	}
}

func TestParityMoney(t *testing.T) {
	for _, c := range parityMoney {
		got, err := FormatMoney(content.Money{AmountCents: c.cents, Currency: "USD"}, MoneyOptions{Whole: c.whole})
		if err != nil || got != c.want {
			t.Errorf("FormatMoney(%d, whole %v) = %q, %v; want %q", c.cents, c.whole, got, err, c.want)
		}
	}
}

func TestParityCalendar(t *testing.T) {
	for _, c := range parityAddMonths {
		if got := AddMonths(c.key, c.delta); got != c.want {
			t.Errorf("AddMonths(%q, %d) = %q, want %q", c.key, c.delta, got, c.want)
		}
	}
	for _, c := range parityBuildMonth {
		m, ok := BuildMonth(c.key)
		if ok != c.ok {
			t.Errorf("BuildMonth(%q) ok = %v, want %v", c.key, ok, c.ok)
			continue
		}
		if !ok {
			continue
		}
		cells := slices.Concat(m.Weeks...)
		inMonth := 0
		for _, d := range cells {
			if d.InMonth {
				inMonth++
			}
		}
		leading := slices.IndexFunc(cells, func(d CalendarDay) bool { return d.InMonth })
		if m.Label != c.label || m.Year != c.year || m.Month != c.month || len(m.Weeks) != 6 ||
			cells[0].ISO != c.first || cells[41].ISO != c.last || inMonth != c.inMonth || leading != c.leading || m.Key != c.key {
			t.Errorf("BuildMonth(%q) = %q %d-%d %s..%s in %d lead %d; want %q %d-%d %s..%s in %d lead %d",
				c.key, m.Label, m.Year, m.Month, cells[0].ISO, cells[41].ISO, inMonth, leading,
				c.label, c.year, c.month, c.first, c.last, c.inMonth, c.leading)
		}
		for i, d := range cells {
			if want := ToISODate(mustParse(t, cells[0].ISO).AddDate(0, 0, i)); d.ISO != want || d.Day != mustParse(t, want).Day() {
				t.Errorf("BuildMonth(%q) cell %d = %+v, want %s", c.key, i, d, want)
				break
			}
		}
	}
	for _, c := range parityMoveFocus {
		if got, ok := MoveFocus(c.iso, c.key); got != c.want || ok != c.ok {
			t.Errorf("MoveFocus(%q, %q) = %q, %v; want %q, %v", c.iso, c.key, got, ok, c.want, c.ok)
		}
	}
}

// mustParse reads a grid cell's date, years past 9999 included.
func mustParse(t *testing.T, iso string) time.Time {
	t.Helper()
	y, m, d := 0, 0, 0
	parts := strings.Split(iso, "-")
	for i, p := range parts {
		n := 0
		for _, c := range p {
			n = n*10 + int(c-'0')
		}
		switch i {
		case 0:
			y = n
		case 1:
			m = n
		case 2:
			d = n
		}
	}
	return time.Date(y, time.Month(m), d, 12, 0, 0, 0, time.UTC)
}

// loneSurrogate is how JSON.stringify writes the half of a pair String.prototype.slice
// left behind. Go holds U+FFFD there; both reach a URL and a page as U+FFFD.
var loneSurrogate = regexp.MustCompile(`\\ud[89ab][0-9a-f]{2}`)

// canonical writes a query the way the oracle did: an array in field order, null for
// absent.
func canonical(t *testing.T, q SearchQuery) string {
	t.Helper()
	str := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}
	var travelers *int
	if q.Travelers != 0 {
		travelers = &q.Travelers
	}
	row := []any{str(q.Dest), str(string(q.Topic)), q.Types, q.Vibes, q.Budgets, q.Sort,
		str(q.CheckIn), str(q.CheckOut), str(q.When), travelers, str(string(q.Mode)),
		q.Stars, q.Amenities, q.Rates}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(row); err != nil {
		t.Fatal(err)
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func TestParityQueries(t *testing.T) {
	for _, c := range parityQueries {
		vals := ParseQuery(c.raw)
		want := map[string][]string{}
		for _, kv := range c.entries {
			want[kv[0]] = append(want[kv[0]], kv[1])
		}
		if len(vals) != len(want) {
			t.Errorf("ParseQuery(%q) = %q, want %q", c.raw, vals, want)
		}
		for k, v := range want {
			if !slices.Equal(vals[k], v) {
				t.Errorf("ParseQuery(%q)[%q] = %q, want %q", c.raw, k, vals[k], v)
			}
		}
		q := ParseSearchParams(vals, parityToday)
		wantQuery := loneSurrogate.ReplaceAllString(c.query, string(rune(0xFFFD)))
		if got := canonical(t, q); got != wantQuery {
			t.Errorf("ParseSearchParams(%q)\n got  %s\n want %s", c.raw, got, wantQuery)
		}
		if got := ResultsHref(q); got != c.href {
			t.Errorf("ResultsHref(%q) = %q, want %q", c.raw, got, c.href)
		}
	}
	for _, c := range parityCleanText {
		if got := CleanText(c.in); got != c.want {
			t.Errorf("CleanText(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// fixtures is the catalog the oracle filtered and sorted: trips that exercise diacritics,
// a compatibility ligature, every badge weight, an order past 99, and slugs whose
// localeCompare order is not their byte order.
func fixtures(t *testing.T) []content.Trip {
	t.Helper()
	var trips []content.Trip
	if err := json.Unmarshal([]byte(fixtureJSON), &trips); err != nil {
		t.Fatal(err)
	}
	return trips
}

func slugs(trips []content.Trip) []string {
	out := make([]string, len(trips))
	for i, t := range trips {
		out[i] = t.Slug
	}
	return out
}

func TestParitySearch(t *testing.T) {
	trips := fixtures(t)
	ratings := map[string]float64{"a": 4.5, "ab": 4.9, "a-c": 4.9, "Zed-upper": 4.1, "apple": 4.7}
	lookup := func(slug string) (float64, bool) { r, ok := ratings[slug]; return r, ok }
	for _, c := range paritySearch {
		q := ParseSearchParams(ParseQuery(c.raw), parityToday)
		q.Sort = c.sort
		if got := slugs(SearchTrips(trips, q, lookup)); !slices.Equal(got, c.want) {
			t.Errorf("SearchTrips(%q, %s) = %q, want %q", c.raw, c.sort, got, c.want)
		}
	}
	for _, c := range parityTopics {
		topic := content.Topic(c.topic)
		if got := slugs(TripsForTopic(trips, topic)); !slices.Equal(got, c.want) {
			t.Errorf("TripsForTopic(%s) = %q, want %q", c.topic, got, c.want)
		}
		if got := CountByTopic(trips, topic); got != c.count {
			t.Errorf("CountByTopic(%s) = %d, want %d", c.topic, got, c.count)
		}
	}
	for _, c := range parityDescribe {
		q := ParseSearchParams(ParseQuery(c.raw), parityToday)
		if got := DescribeQuery(q); got != c.want {
			t.Errorf("DescribeQuery(%q) = %q, want %q", c.raw, got, c.want)
		}
		if got := HasActiveFilters(q); got != c.active {
			t.Errorf("HasActiveFilters(%q) = %v, want %v", c.raw, got, c.active)
		}
	}
}

func TestParityLinks(t *testing.T) {
	for _, c := range parityJoin {
		got := JoinHref(JoinLink{Intent: JoinIntent(c.intent), Trip: c.trip, Next: c.next})
		if got != c.want {
			t.Errorf("JoinHref(%q, %q, %q) = %q, want %q", c.intent, c.trip, c.next, got, c.want)
		}
	}
	for _, c := range parityLogin {
		if got := LoginHref(c.next); got != c.want {
			t.Errorf("LoginHref(%q) = %q, want %q", c.next, got, c.want)
		}
	}
	for _, c := range parityTrip {
		if got := TripHref(c.slug); got != c.want {
			t.Errorf("TripHref(%q) = %q, want %q", c.slug, got, c.want)
		}
	}
	for _, c := range parityQuote {
		if got := QuoteHref(c.target); got != c.quote {
			t.Errorf("QuoteHref(%+v)\n got  %s\n want %s", c.target, got, c.quote)
		}
		if got := RequestQuoteHref(c.target); got != c.request {
			t.Errorf("RequestQuoteHref(%+v)\n got  %s\n want %s", c.target, got, c.request)
		}
	}
	for _, c := range parityNumberString {
		if got := numberString(c.in); got != c.want {
			t.Errorf("numberString(%v) = %q, want %q", c.in, got, c.want)
		}
	}
	for _, c := range parityInquiry {
		if got := InquiryHref(c.ctx); got != c.want {
			t.Errorf("InquiryHref(%+v) = %q, want %q", c.ctx, got, c.want)
		}
	}
}

func TestParityQuote(t *testing.T) {
	for _, c := range parityTopicQuote {
		if got := QuoteRedirect(ParseQuery(c.raw), parityToday); got != c.want {
			t.Errorf("QuoteRedirect(%q)\n got  %s\n want %s", c.raw, got, c.want)
		}
	}
	for _, c := range parityTopicLink {
		if got := TopicQuoteLink(content.Topic(c.topic)); got != c.want {
			t.Errorf("TopicQuoteLink(%s) = %q, want %q", c.topic, got, c.want)
		}
	}
}

func TestParityFilters(t *testing.T) {
	// The pill's dates read the year off today, so pin the clock to the oracle's day.
	defer pinClock(t, parityToday)()
	for _, c := range parityChips {
		var ids, labels []string
		for _, chip := range ChipsFor(c.mode) {
			ids = append(ids, chip.ID)
			labels = append(labels, chip.Label)
		}
		if !slices.Equal(ids, c.ids) || !slices.Equal(labels, c.labels) {
			t.Errorf("ChipsFor(%s) = %q %q, want %q %q", c.mode, ids, labels, c.ids, c.labels)
		}
	}
	for _, c := range parityFilters {
		q := ParseSearchParams(ParseQuery(c.raw), parityToday)
		if got := ActiveFilterCount(q); got != c.count {
			t.Errorf("ActiveFilterCount(%q) = %d, want %d", c.raw, got, c.count)
		}
		if got := InquirySummary(q); got != c.summary {
			t.Errorf("InquirySummary(%q) = %q, want %q", c.raw, got, c.summary)
		}
		var fields []string
		for _, f := range InquiryFields(q) {
			fields = append(fields, f.Label+"|"+f.Value+"|"+f.Icon)
		}
		if !slices.Equal(fields, c.fields) {
			t.Errorf("InquiryFields(%q) = %q, want %q", c.raw, fields, c.fields)
		}
		var hrefs []string
		for _, chip := range append(slices.Clone(ChipsFor(EffectiveMode(q))), MobileChips...) {
			h := ChipHref(q, chip)
			if ChipIsOn(q, chip) {
				h += " on"
			}
			hrefs = append(hrefs, h)
		}
		if !slices.Equal(hrefs, c.hrefs) {
			t.Errorf("ChipHref(%q)\n got  %q\n want %q", c.raw, hrefs, c.hrefs)
		}
	}
}

// pinClock makes "now" noon UTC on day, and returns the undo.
func pinClock(t *testing.T, day string) func() {
	t.Helper()
	at, err := time.Parse(time.DateOnly, day)
	if err != nil {
		t.Fatal(err)
	}
	prev := clock
	clock = func() time.Time { return at.Add(12 * time.Hour) }
	return func() { clock = prev }
}

// stricterThanNode are URLs Node's parser takes and this one refuses, each on purpose.
// Refusing is the safe side of the line: the photo or link is dropped, never let through.
var stricterThanNode = map[string]string{
	// The label is "xn--" with a punycode tail x/net/idna (UTS 46) will not decode, where
	// Node's Ada parser keeps it as written.
	"https://xn--zz.com/": "invalid punycode label",
}

func TestParityURLs(t *testing.T) {
	for _, c := range parityURLs {
		if _, ok := stricterThanNode[c.in]; ok {
			if canParseURL(c.in) {
				t.Errorf("%q parses; it is listed as refused", c.in)
			}
			continue
		}
		u, ok := parseWebURL(c.in)
		if ok != c.ok || (ok && (u.scheme != c.scheme || u.hostname != c.host)) {
			t.Errorf("new URL(%q) = %q %q %v; want %q %q %v", c.in, u.scheme, u.hostname, ok, c.scheme, c.host, c.ok)
		}
		if got := isAllowedImage(c.in); got != c.allowed {
			t.Errorf("isAllowedImage(%q) = %v, want %v", c.in, got, c.allowed)
		}
		if got, ok := zodURL(c.in, 500); ok != c.zodOK || got != c.zod {
			t.Errorf("z.string().url().max(500) on %q = %q, %v; want %q, %v", c.in, got, ok, c.zod, c.zodOK)
		}
	}
}

// cruiseJSON writes a result the way JSON.stringify wrote the TypeScript's.
func cruiseJSON(t *testing.T, r CruiseSearchResult) string {
	t.Helper()
	type mirror struct {
		Status   CruiseStatus    `json:"status"`
		Sailings []PublicSailing `json:"sailings,omitempty"`
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(mirror(r)); err != nil {
		t.Fatal(err)
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func TestParityCruise(t *testing.T) {
	for _, c := range parityCruise {
		if got := cruiseJSON(t, ParseCruiseResponse([]byte(c.body))); got != c.want {
			t.Errorf("ParseCruiseResponse(%.120q)\n got  %s\n want %s", c.body, got, c.want)
		}
	}
}

// The oracle never sees NaN as a guest rating; JavaScript's comparator reads it as a tie.
func TestSortTripsNaNRatingIsATie(t *testing.T) {
	trips := fixtures(t)[:3]
	got := slugs(SortTrips(trips, SortRating, func(string) (float64, bool) { return math.NaN(), true }))
	if want := []string{"a", "a-c", "ab"}; !slices.Equal(got, want) {
		t.Errorf("SortTrips with NaN ratings = %q, want slug order %q", got, want)
	}
}
