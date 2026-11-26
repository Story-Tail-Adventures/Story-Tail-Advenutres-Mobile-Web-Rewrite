package cruise

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Provider payload -> row shapes (map.ts). Pure functions, no I/O, no clock beyond what is
// passed in.
//
// This file is where every mismatch between their model and ours is handled, once, in a
// place tests can reach without a network or a key. The four that matter:
//
//  1. SLUGS. Their `company` is not our `slug`. web/content/public/cruise-lines.ts already
//     ships eight URL-stable slugs feeding screen 2.0.9, and a URL that moves because a
//     provider spells a line differently is a regression. See CompanySlug.
//  2. MONEY. They send floats; rule 5 says int64 cents. See ToCents, and read its comment
//     before touching it: the naive multiply is wrong in a way that rounds real money.
//  3. DATES. They send date-times where a date is meant. Parsing and re-formatting those
//     through a time shifts a departure by a day for half the world's offsets.
//  4. ORDERING. `ports_list` day numbers are null for entire cruise lines, so ordering comes
//     from array position instead. See ToPortCalls.

// Provider is the provenance value every synced row carries.
const Provider = "track_cruises"

// CompanySlug is their `company` -> our `slug`.
//
// Four agree, three do not, and the three that do not are the whole reason this map exists:
// `celebrity-cruises`, `disney-cruise-line` and `ncl` would otherwise mint second cruise_line
// rows alongside the slugs screen 2.0.9 already links to.
//
// Three of their lines (`costa`, `msc`, `aida`) are not lines Story-Tail books. They still get
// rows (the catalogue may be wider than the storefront) but arrive with is_booked false, and
// the slug is simply their company value.
//
// Virgin Voyages appears nowhere here BECAUSE THE PROVIDER HAS NO COVERAGE FOR IT. Gyasi
// books it and 2.0.9 lists it, so it exists as a curated row inserted by migration
// 20260909001124 with a null provenance pair: Free-Travel-APIs §10.1's "curated content wins",
// and why sync must never delete a row it did not create.
var CompanySlug = map[string]string{
	"royal-caribbean":    "royal-caribbean",
	"celebrity-cruises":  "celebrity",
	"disney-cruise-line": "disney",
	"princess":           "princess",
	"carnival":           "carnival",
	"ncl":                "norwegian",
	"holland-america":    "holland-america",
	"costa":              "costa",
	"msc":                "msc",
	"aida":               "aida",
}

// BookedSlugs are the lines Story-Tail books, by OUR slug: the is_booked source of truth.
// In BOOKED_SLUGS's insertion order.
var BookedSlugs = []string{
	"royal-caribbean",
	"celebrity",
	"disney",
	"princess",
	"carnival",
	"virgin-voyages",
	"norwegian",
	"holland-america",
}

// IsBooked is BOOKED_SLUGS.has(slug).
func IsBooked(slug string) bool {
	for _, s := range BookedSlugs {
		if s == slug {
			return true
		}
	}
	return false
}

// displayOrder is the editorial order from web/content/public/cruise-lines.ts.
var displayOrder = map[string]int{
	"royal-caribbean": 10,
	"celebrity":       20,
	"disney":          30,
	"princess":        40,
	"carnival":        50,
	"virgin-voyages":  60,
	"norwegian":       70,
	"holland-america": 80,
}

// unbookedOrderBase sorts everything not in displayOrder after the curated eight.
const unbookedOrderBase = 900

// CompanyToSlug is companyToSlug. (The Deno lookup was a plain object, so a company named
// "constructor" or "toString" would have come back as a function; that cannot happen here.)
func CompanyToSlug(company string) string {
	if slug, ok := CompanySlug[company]; ok {
		return slug
	}
	return Slugify(company)
}

// slugRun is one entry of slugRuns (slugtable.go).
type slugRun struct {
	lo, hi rune
	delta  uint8
	out    string
}

// Slugify is slugify: lower-case, fold accents (NFKD, combining marks U+0300-U+036F
// dropped), every run of anything but a-z and 0-9 to one "-", and no "-" at either end.
// Exact for every code point, through the table generated from Deno in slugtable.go.
func Slugify(value string) string {
	var b strings.Builder
	sep := false // a "-" is owed before the next letter or digit
	emit := func(s string) {
		for i := 0; i < len(s); i++ {
			if s[i] == '-' {
				sep = true
				continue
			}
			if sep && b.Len() > 0 {
				b.WriteByte('-')
			}
			sep = false
			b.WriteByte(s[i])
		}
	}
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			emit(string(r))
		case r >= 'A' && r <= 'Z':
			emit(string(r + 'a' - 'A'))
		case r < 0x80:
			sep = true
		default:
			emit(slugOf(r))
		}
	}
	return b.String()
}

// slugOf looks a non-ASCII code point up in slugRuns: its letters and digits, "" when it
// folds away entirely, "-" when nothing of it survives.
func slugOf(r rune) string {
	i := sort.Search(len(slugRuns), func(i int) bool { return slugRuns[i].hi >= r })
	if i == len(slugRuns) || slugRuns[i].lo > r {
		return "-"
	}
	run := slugRuns[i]
	if run.delta == 0 {
		return run.out
	}
	return string(rune(run.out[0]) + (r - run.lo))
}

// ToCents is toCents: a provider float -> integer cents (rule 5), nil for absent.
//
// `Math.round(value * 100)` is exact for every 2-decimal fare (swept from 0 to 10,000), so
// this is NOT the usual float panic. It is wrong specifically on HALF-CENT values, where the
// binary residue lands just below the midpoint and rounds the wrong way: 1199.995 * 100 is
// 119999.49999999999, which rounds DOWN to 119999 instead of up to 120000. Settling the
// residue at four decimal places first gives 119999.5000, and then 120000. Three-decimal
// input is not hypothetical: `price_euro` is a cross-market conversion.
//
// Non-finite and negative values are nil rather than a nonsense fare: the column's CHECK
// would refuse a negative anyway, and a failed run is worse than a missing price on a field
// their spec already marks nullable. A value of 2^63 cents or more is nil too; Deno carried it
// on and the bigint column refused it.
func ToCents(value *float64) *int64 {
	if value == nil {
		return nil
	}
	v := *value
	if !js.IsFinite(v) || v < 0 {
		return nil
	}
	return int64OrNil(js.Round(js.ToNumber(js.ToFixed(v*100, 4))))
}

func int64OrNil(f float64) *int64 {
	if !js.IsFinite(f) || math.Abs(f) >= 1<<63 {
		return nil
	}
	n := int64(f)
	return &n
}

var currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

// ToCurrency is toCurrency: ISO 4217 for a char(3) column. Anything else is dropped, not
// coerced. "" stands for null, which `!value` treats alike.
func ToCurrency(value string) *string {
	if value == "" {
		return nil
	}
	upper := upperCase(js.Trim(value))
	if !currencyCode.MatchString(upper) {
		return nil
	}
	return &upper
}

var leadingDate = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})`)

// ToDate is toDate: date-time string -> `date`, WITHOUT going through a time.
//
// Their schema types `departure_date` as date-time. Converting "2026-11-14T00:00:00-05:00"
// to an instant and back yields 2026-11-14 in one zone and 2026-11-13 in another, so a
// cruise sails a day early depending on where the code ran. The leading ten characters of an
// ISO string are the calendar date the provider meant; take them. "" stands for null.
func ToDate(value string) *string {
	if value == "" {
		return nil
	}
	m := leadingDate.FindStringSubmatch(js.Trim(value))
	if m == nil {
		return nil
	}
	return &m[1]
}

// ToTimestamp is toTimestamp: date-times we DO want as instants (arrival and departure at a
// port) keep their offset, written as toISOString writes them. "" stands for null.
//
// Deviation: Date.parse also reads V8's legacy formats ("Feb 14 2027 17:00", a space for the
// "T"); those are nil here. Every ISO form V8 reads is read (see parseDate).
func ToTimestamp(value string) *string {
	if value == "" {
		return nil
	}
	t, ok := parseDate(value)
	if !ok {
		return nil
	}
	s := js.ISOString(t)
	return &s
}

var (
	isoOffsetNoColon = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})(\d{2})$`)
	isoMidnight24    = regexp.MustCompile(`T24:00:00\.(\d+)`)
)

// parseDate is Date.parse for the ISO forms: js.ParseDate's, plus what V8 also takes there,
// a lower-case "t" or "z" and an offset without its colon ("+0000"), and minus one it
// refuses, a 24:00:00 whose fraction has any non-zero digit beyond the milliseconds.
func parseDate(s string) (time.Time, bool) {
	if len(s) > 10 && s[10] == 't' {
		s = s[:10] + "T" + s[11:]
	}
	if strings.HasSuffix(s, "z") {
		s = s[:len(s)-1] + "Z"
	}
	if m := isoMidnight24.FindStringSubmatch(s); m != nil && strings.Trim(m[1], "0") != "" {
		return time.Time{}, false
	}
	if m := isoOffsetNoColon.FindStringSubmatch(s); m != nil {
		s = m[1] + m[2] + ":" + m[3]
	}
	return js.ParseDate(s)
}

// ToIntOrNull is toIntOrNull: a finite number, truncated; nil for anything else. (A value of
// 2^63 or more is nil too, where Deno carried the float on to an integer column that refused
// it.)
func ToIntOrNull(value js.Value) *int64 {
	n, ok := value.Num()
	if !ok {
		return nil
	}
	return intOrNull(&n)
}

func intOrNull(value *float64) *int64 {
	if value == nil || !js.IsFinite(*value) {
		return nil
	}
	return int64OrNil(math.Trunc(*value))
}

func positiveOrNull(value *float64) *int64 {
	n := intOrNull(value)
	if n == nil || *n <= 0 {
		return nil
	}
	return n
}

// CruiseLineRow is a cruise_line row, fields in the order mapCruiseLine wrote them.
type CruiseLineRow struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	DisplayOrder int    `json:"display_order"`
	IsBooked     bool   `json:"is_booked"`
	// Their field is `cruise_count`; ours is `sailing_count`, because a "cruise" in their
	// vocabulary is one dated sailing, and calling it a cruise count invites someone to read
	// it as distinct itineraries.
	SailingCount      *int64   `json:"sailing_count"`
	ShipCount         *int64   `json:"ship_count"`
	DestinationCount  *int64   `json:"destination_count"`
	EarliestDeparture *string  `json:"earliest_departure"`
	LatestDeparture   *string  `json:"latest_departure"`
	Destinations      []string `json:"destinations"`
	Locales           []string `json:"locales"`
	Provider          string   `json:"provider"`
	ProviderKey       string   `json:"provider_key"`
}

// MapCruiseLine is mapCruiseLine.
func MapCruiseLine(line ProviderCruiseLine) CruiseLineRow {
	slug := CompanyToSlug(line.Company)
	name := slug
	if line.DisplayName != nil {
		if t := js.Trim(*line.DisplayName); t != "" {
			name = t
		}
	}
	order, ok := displayOrder[slug]
	if !ok {
		order = unbookedOrderBase
	}
	return CruiseLineRow{
		Slug:              slug,
		Name:              name,
		DisplayOrder:      order,
		IsBooked:          IsBooked(slug),
		SailingCount:      intOrNull(line.CruiseCount),
		ShipCount:         intOrNull(line.ShipCount),
		DestinationCount:  intOrNull(line.DestinationCount),
		EarliestDeparture: ToDate(deref(line.EarliestDeparture)),
		LatestDeparture:   ToDate(deref(line.LatestDeparture)),
		Destinations:      DedupeStrings(line.Destinations),
		Locales:           DedupeStrings(line.Locales),
		Provider:          Provider,
		ProviderKey:       line.Company,
	}
}

// ShipRow is a cruise_ship row, fields in the order mapShip wrote them.
type ShipRow struct {
	Name              string  `json:"name"`
	Slug              string  `json:"slug"`
	SailingCount      *int64  `json:"sailing_count"`
	EarliestDeparture *string `json:"earliest_departure"`
	LatestDeparture   *string `json:"latest_departure"`
	Provider          string  `json:"provider"`
	ProviderKey       string  `json:"provider_key"`
	// Company is resolved to cruise_line_id by the caller.
	Company string `json:"company"`
}

// ShipProviderKey is shipProviderKey: the provenance key for a ship.
//
// The provider identifies a ship by NAME (/ships returns {ship_name, company, sailing_count}
// with no id), so the key has to be composite: without the company prefix, two lines that
// both sail a "Discovery" collide on one row.
//
// THIS EXISTS AS A FUNCTION BECAUSE TWO CODE PATHS WRITE cruise_ship, and they diverged: when
// sync's stub path built its key from the internal cruise_line UUID instead of the company
// slug, one ship could hold either format depending on which path saw it first. Both paths
// call this.
func ShipProviderKey(company, shipName string) string {
	return company + ":" + js.Trim(shipName)
}

// MapShip is mapShip.
func MapShip(ship ProviderShip) ShipRow {
	return ShipRow{
		Name:              js.Trim(ship.ShipName),
		Slug:              Slugify(ship.ShipName),
		SailingCount:      intOrNull(ship.SailingCount),
		EarliestDeparture: ToDate(deref(ship.EarliestDeparture)),
		LatestDeparture:   ToDate(deref(ship.LatestDeparture)),
		Provider:          Provider,
		ProviderKey:       ShipProviderKey(ship.Company, ship.ShipName),
		Company:           ship.Company,
	}
}

// PortRow is a cruise_port row.
type PortRow struct {
	Name string
	// SailingCount is OMITTED, not null, when the caller did not measure it
	// (SailingCountSet false).
	//
	// This is a live data-destruction fix. Every writer of cruise_port is an upsert on
	// `onConflict: "name"`, and two of the three call sites (a sailing naming a port it saw in
	// an itinerary, and ensurePorts creating one it needed) have no count to give. While the
	// field was always written, those two sent an explicit NULL, so a port carrying a real
	// count from the `/ports` pass had it WIPED the next time any sailing mentioned it. An
	// absent key is not named in the upsert, so Postgres leaves the column alone; a caller
	// that wants to clear it still can, with SailingCountSet and a nil SailingCount.
	SailingCountSet bool
	SailingCount    *int64
	Provider        string
	ProviderKey     string
}

// MarshalJSON writes the row as mapPort's object: name, provider, provider_key, then
// sailing_count only when set.
func (p PortRow) MarshalJSON() ([]byte, error) {
	o := js.O("name", p.Name, "provider", p.Provider, "provider_key", p.ProviderKey)
	if p.SailingCountSet {
		o = append(o, js.Field{Key: "sailing_count", Value: p.SailingCount})
	}
	return o.MarshalJSON()
}

var portDebris = js.Regexp("^['\"`\\s]+|['\"`\\s]+$", "")

// MapPort is mapPort. Port names arrive dirty, and only the unambiguous artifacts are
// cleaned: stray quotes like `'Bucht von Palma'` are encoding debris, and leaving them makes
// the natural key unstable (the day the provider fixes its quoting we would gain a duplicate
// row for the same quay).
//
// WHAT IS DELIBERATELY NOT CLEANED: entries like `38.6 N 19.8 E - Ionian Sea` are at-sea
// positions rather than ports, and they are real itinerary stops. Dropping them would put
// holes in port-call sequences for every sailing with a sea day.
//
// sailingCount is undefined (js.UndefinedValue()) when the caller has no count to give; then
// the row leaves the column alone. Anything else, null included, is written, through
// ToIntOrNull.
func MapPort(name string, sailingCount js.Value) PortRow {
	clean := js.Trim(portDebris.ReplaceAllString(js.Trim(name), ""))
	row := PortRow{Name: clean, Provider: Provider, ProviderKey: clean}
	// Only when the caller actually has one. Writing NULL here is what erased counts the
	// /ports pass had already measured.
	if !sailingCount.IsUndefined() {
		row.SailingCountSet = true
		row.SailingCount = ToIntOrNull(sailingCount)
	}
	return row
}

// SailingRow is a cruise_sailing row, fields in the order mapSailing wrote them.
type SailingRow struct {
	Provider          string   `json:"provider"`
	ProviderKey       string   `json:"provider_key"`
	ProviderLocale    string   `json:"provider_locale"`
	Title             *string  `json:"title"`
	DepartureDate     string   `json:"departure_date"`
	DurationNights    *int64   `json:"duration_nights"`
	LeadPriceCents    *int64   `json:"lead_price_cents"`
	Currency          *string  `json:"currency"`
	LeadPriceEurCents *int64   `json:"lead_price_eur_cents"`
	Destinations      []string `json:"destinations"`
	ItineraryURL      *string  `json:"itinerary_url"`
	ProviderUpdatedAt *string  `json:"provider_updated_at"`
	// Company and ShipName are resolved to ids by the caller.
	Company  string  `json:"company"`
	ShipName *string `json:"ship_name"`
}

// MapSailing is mapSailing. Nil for a sailing with no usable departure date: that is the one
// field the row cannot do without (`departure_date` is NOT NULL and is what every search
// filters on). Everything else may be absent.
func MapSailing(c ProviderCruise) *SailingRow {
	departure := ToDate(c.DepartureDate)
	if departure == nil || c.CruiseID == "" || c.Locale == "" {
		return nil
	}
	currency := ToCurrency(deref(c.Currency))
	cents := ToCents(c.Price)
	row := &SailingRow{
		Provider:          Provider,
		ProviderKey:       c.CruiseID,
		ProviderLocale:    c.Locale,
		Title:             trimmedOrNull(c.Title),
		DepartureDate:     *departure,
		DurationNights:    positiveOrNull(c.Duration),
		Currency:          currency,
		LeadPriceEurCents: ToCents(c.PriceEuro),
		Destinations:      DedupeStrings(c.Destinations),
		ItineraryURL:      trimmedOrNull(c.ItineraryURL),
		ProviderUpdatedAt: ToTimestamp(deref(c.UpdatedAt)),
		Company:           c.Company,
		ShipName:          trimmedOrNull(c.ShipName),
	}
	// The column's CHECK refuses a fare without a currency, so drop the number rather than
	// fail the whole upsert over a provider row that sent one and not the other.
	if currency != nil {
		row.LeadPriceCents = cents
	}
	return row
}

// PortCallRow is a cruise_port_call row, fields in the order toPortCalls wrote them.
type PortCallRow struct {
	PortName    string  `json:"port_name"`
	Sequence    int     `json:"sequence"`
	Day         *int64  `json:"day"`
	ArrivalAt   *string `json:"arrival_at"`
	DepartureAt *string `json:"departure_at"`
}

// ToPortCalls is toPortCalls: itinerary stops, ordered by ARRAY POSITION rather than by
// `day`.
//
// Their spec: `day` is null whenever the source feed omitted it, and Holland America's feed
// omits every one. Sorting by a null column scrambles an entire cruise line's itineraries,
// and coalescing null to 0 or 1 invents facts. So `sequence` is dense and 1-based from the
// order they sent, `day` is carried through untouched for display, and the ordering
// guarantee lives in a column we control.
//
// Stops with an empty port name are dropped BEFORE numbering, so the sequence stays dense and
// the unique index on (sailing_id, sequence) cannot be tripped by a gap.
func ToPortCalls(stops []ProviderPortStop) []PortCallRow {
	out := []PortCallRow{}
	for _, stop := range stops {
		if stop.Port == nil || js.Trim(*stop.Port) == "" {
			continue
		}
		out = append(out, PortCallRow{
			PortName:    js.Trim(*stop.Port),
			Sequence:    len(out) + 1,
			Day:         positiveOrNull(stop.Day),
			ArrivalAt:   ToTimestamp(deref(stop.Arrival)),
			DepartureAt: ToTimestamp(deref(stop.Departure)),
		})
	}
	return out
}

// CabinPriceRow is a cruise_cabin_price row.
type CabinPriceRow struct {
	CabinCode  string `json:"cabin_code"`
	PriceCents int64  `json:"price_cents"`
	Currency   string `json:"currency"`
	// ProviderLocale is the market the provider answered in, often not the sailing's. See the
	// column comment.
	ProviderLocale string `json:"provider_locale"`
}

var (
	notCodeChars = regexp.MustCompile(`[^A-Z0-9]+`)
	edgeUnders   = regexp.MustCompile(`^_+|_+$`)
)

// ToCabinPrices is toCabinPrices: `cabin_prices_per_person` -> rows. Only ever present on
// GET /cruises/{id}.
//
// The cabin vocabulary is open (their spec lists five normalised codes "plus line-specific
// tiers like CONCIERGE, AQUA, VISTA_SUITE, NEPTUNE_SUITE, HAVEN"), so codes are normalised in
// shape (upper, underscored) but never checked against a list. A tier a line invents next
// month must land as a row, not fail a sync. "" stands for a null currency or locale.
func ToCabinPrices(cabinPrices []CabinPrice, currency, providerLocale string) []CabinPriceRow {
	rows := []CabinPriceRow{}
	if len(cabinPrices) == 0 || currency == "" || providerLocale == "" {
		return rows
	}
	for _, p := range cabinPrices {
		code := upperCase(js.Trim(p.Code))
		code = edgeUnders.ReplaceAllString(notCodeChars.ReplaceAllString(code, "_"), "")
		cents := ToCents(p.Price)
		if code == "" || cents == nil {
			continue
		}
		rows = append(rows, CabinPriceRow{CabinCode: code, PriceCents: *cents, Currency: currency, ProviderLocale: providerLocale})
	}
	return rows
}

// DedupeStrings is dedupeStrings: trimmed, blanks and repeats dropped, order kept. Ship and
// port names arrive from several endpoints for the same entity, so duplicates within one
// payload are normal; destination arrays render in the order the provider chose.
func DedupeStrings(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		clean := js.Trim(v)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	return out
}

func trimmedOrNull(p *string) *string {
	if p == nil {
		return nil
	}
	t := js.Trim(*p)
	if t == "" {
		return nil
	}
	return &t
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// specialUpper are the toUpperCase mappings (SpecialCasing.txt) that yield ASCII letters,
// which Go's per-character strings.ToUpper does not apply ("ß" stays "ß" there; JavaScript
// gives "SS"). Only ASCII letters survive ToCurrency and ToCabinPrices, so these are the
// ones that change an answer; the rest of SpecialCasing (Greek with iota, Armenian
// ligatures) maps non-ASCII to non-ASCII, which both callers turn into the same thing.
var specialUpper = strings.NewReplacer(
	"\U000000DF", "SS",
	"\U0000FB00", "FF",
	"\U0000FB01", "FI",
	"\U0000FB02", "FL",
	"\U0000FB03", "FFI",
	"\U0000FB04", "FFL",
	"\U0000FB05", "ST",
	"\U0000FB06", "ST",
	"\U00000149", "\U000002BCN",
	"\U000001F0", "J\U0000030C",
	"\U00001E96", "H\U00000331",
	"\U00001E97", "T\U00000308",
	"\U00001E98", "W\U0000030A",
	"\U00001E99", "Y\U0000030A",
	"\U00001E9A", "A\U000002BE",
)

// upperCase is toUpperCase as far as ToCurrency and ToCabinPrices can tell.
func upperCase(s string) string {
	return strings.Map(unicode.ToUpper, specialUpper.Replace(s))
}
