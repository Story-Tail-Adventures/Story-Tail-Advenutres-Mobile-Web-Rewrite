package cruise

import (
	"slices"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// track.cruises response shapes, transcribed from their OpenAPI 3.1 spec
// (https://www.track.cruises/openapi.json, public, unauthenticated). Hand-written rather than
// generated because contracts/ generates OUR api, and pulling a third party's spec into that
// pipeline would put their release cadence on our build. When the spec changes, edit this
// file, types.ts and the fixtures together.
//
// NULLABILITY HERE IS LOAD-BEARING. Almost every field on Cruise is nullable in their schema,
// including `ship_name` and `title`, and the mapper has to survive all of it: a sailing with a
// real date and no ship is still inventory. A nullable field is a pointer here.
//
// Each type is read from the parsed body by its Decode function, never by encoding/json
// (which would match keys case-insensitively, put numbers into float64 behind an `any`, and
// fail a whole page over one field of the wrong type). Raw keeps the object exactly as it
// arrived, for provider_payload.
//
// THE ONE DEVIATION: a field holding a value of a type its schema does not allow (a number
// where a string belongs, an object where a list belongs) reads as absent. Deno handed such a
// value on as it was, and what happened next depended on the line: often the same null, but a
// `.trim()` on a number threw a TypeError that failed the scope. List items of the wrong type
// are dropped, which is what every reader of those lists did anyway (dedupeStrings,
// toPortCalls, the typeof filters in sync.ts).

// Companies are their `company` values, as published in the spec's CompanyEnum.
//
// OBSERVED REALITY DIFFERS: a live GET /cruise-lines returns NINE, not ten; `aida` is in the
// enum but absent from the response, which is why info.description says "9 cruise lines".
// `aida` is kept so a row for it maps cleanly if it ever appears; nothing depends on the
// count.
var Companies = []string{
	"princess",
	"ncl",
	"celebrity-cruises",
	"royal-caribbean",
	"costa",
	"carnival",
	"holland-america",
	"msc",
	"disney-cruise-line",
	"aida",
}

// Locales are their `locale` values, which set pricing currency and source market.
//
// THE PUBLISHED ENUM IS BADLY INCOMPLETE, by five of thirteen: a live GET /coverage reports
// THIRTEEN markets against the spec's eight. That is the failure mode Data-Model §24.0 rule 4
// anticipates, and why cruise_sailing.provider_locale is `text` rather than a Postgres enum.
// So this list is documentation, NOT a validator. Nothing checks membership, and nothing
// should start.
var Locales = []string{
	"de_AT",
	"de_DE",
	"en_AU",
	"en_CA",
	"en_GB",
	"en_US",
	"it_IT",
	"nl_NL",
	// The five below are absent from their published LocaleEnum. Observed live via
	// GET /coverage, which reports 13 markets against the spec's 8.
	"en_IE",
	"es_ES",
	"fr_FR",
	"ja_JP",
	"pt_BR",
}

// ProviderCruiseLine is one GET /cruise-lines row.
type ProviderCruiseLine struct {
	Company          string
	DisplayName      *string
	CruiseCount      *float64
	ShipCount        *float64
	DestinationCount *float64
	Destinations     []string
	Locales          []string
	// date-time in their schema, though it carries a date.
	EarliestDeparture *string
	LatestDeparture   *string
	Raw               js.Value
}

// DecodeCruiseLine reads a ProviderCruiseLine from a parsed body.
func DecodeCruiseLine(v js.Value) ProviderCruiseLine {
	return ProviderCruiseLine{
		Company:           reqString(v.Get("company")),
		DisplayName:       optString(v.Get("display_name")),
		CruiseCount:       optNumber(v.Get("cruise_count")),
		ShipCount:         optNumber(v.Get("ship_count")),
		DestinationCount:  optNumber(v.Get("destination_count")),
		Destinations:      stringList(v.Get("destinations")),
		Locales:           stringList(v.Get("locales")),
		EarliestDeparture: optString(v.Get("earliest_departure")),
		LatestDeparture:   optString(v.Get("latest_departure")),
		Raw:               v,
	}
}

// ProviderShip is one GET /ships row.
type ProviderShip struct {
	ShipName          string
	Company           string
	SailingCount      *float64
	EarliestDeparture *string
	LatestDeparture   *string
	Raw               js.Value
}

// DecodeShip reads a ProviderShip from a parsed body.
func DecodeShip(v js.Value) ProviderShip {
	return ProviderShip{
		ShipName:          reqString(v.Get("ship_name")),
		Company:           reqString(v.Get("company")),
		SailingCount:      optNumber(v.Get("sailing_count")),
		EarliestDeparture: optString(v.Get("earliest_departure")),
		LatestDeparture:   optString(v.Get("latest_departure")),
		Raw:               v,
	}
}

// ProviderPort is one GET /ports row.
type ProviderPort struct {
	// Free text, "Barcelona, Spain": city and country in one field.
	Port string
	// SailingCount is kept as it arrived, because MapPort tells absent (leave the column
	// alone) from null (clear it). See PortRow.
	SailingCount js.Value
	Raw          js.Value
}

// DecodePort reads a ProviderPort from a parsed body.
func DecodePort(v js.Value) ProviderPort {
	return ProviderPort{Port: reqString(v.Get("port")), SailingCount: v.Get("sailing_count"), Raw: v}
}

// ProviderMarket is one entry of ProviderCoverage.Markets.
type ProviderMarket struct {
	Locale     *string
	MarketName *string
	Currency   *string
}

// ProviderCoverage is one GET /coverage row.
type ProviderCoverage struct {
	Company       string
	DisplayName   *string
	TrackedSince  *string
	LastUpdated   *string
	TotalSailings *float64
	// Their spec: "Reserved. Currently always 0". Do not report it as real.
	TotalSnapshots           *float64
	AvgSnapshotFrequencyDays *float64
	Markets                  []ProviderMarket
	Raw                      js.Value
}

// DecodeCoverage reads a ProviderCoverage from a parsed body.
func DecodeCoverage(v js.Value) ProviderCoverage {
	c := ProviderCoverage{
		Company:                  reqString(v.Get("company")),
		DisplayName:              optString(v.Get("display_name")),
		TrackedSince:             optString(v.Get("tracked_since")),
		LastUpdated:              optString(v.Get("last_updated")),
		TotalSailings:            optNumber(v.Get("total_sailings")),
		TotalSnapshots:           optNumber(v.Get("total_snapshots")),
		AvgSnapshotFrequencyDays: optNumber(v.Get("avg_snapshot_frequency_days")),
		Raw:                      v,
	}
	if items, ok := v.Get("markets").Array(); ok {
		c.Markets = make([]ProviderMarket, 0, len(items))
		for _, m := range items {
			c.Markets = append(c.Markets, ProviderMarket{
				Locale:     optString(m.Get("locale")),
				MarketName: optString(m.Get("market_name")),
				Currency:   optString(m.Get("currency")),
			})
		}
	}
	return c
}

// ProviderFilterOptions is GET /filter-options. Their spec does not pin the property names, so
// all are optional; nil is absent, an empty non-nil list was sent empty (sync.ts reads
// `ships ?? ship_names`, which tells the two apart).
type ProviderFilterOptions struct {
	Companies    []string
	Locales      []string
	Destinations []string
	Ships        []string
	ShipNames    []string
	Ports        []string
	Raw          js.Value
}

// DecodeFilterOptions reads a ProviderFilterOptions from a parsed body.
func DecodeFilterOptions(v js.Value) ProviderFilterOptions {
	return ProviderFilterOptions{
		Companies:    stringList(v.Get("companies")),
		Locales:      stringList(v.Get("locales")),
		Destinations: stringList(v.Get("destinations")),
		Ships:        stringList(v.Get("ships")),
		ShipNames:    stringList(v.Get("ship_names")),
		Ports:        stringList(v.Get("ports")),
		Raw:          v,
	}
}

// ProviderPortStop is one itinerary stop.
type ProviderPortStop struct {
	Port *string
	// Day is 1-indexed, and NULL whenever the source feed omitted it: their spec calls out
	// Holland America, whose feed omits every one. Treat nil as "unknown day", never as 0 or
	// 1, and never order by this. See cruise_port_call.sequence.
	Day       *float64
	Arrival   *string
	Departure *string
}

// CabinPrice is one entry of cabin_prices_per_person, in the order Object.entries gives it.
type CabinPrice struct {
	Code string
	// Price is nil when the value was not a number (toCents makes that null too).
	Price *float64
}

// ProviderCruise is one sailing, from GET /cruises or GET /cruises/{id}.
type ProviderCruise struct {
	CruiseID    string
	ItineraryID *string
	Title       *string
	Company     string
	Locale      string
	ShipName    *string
	// DepartureDate is a date-time in their schema.
	DepartureDate string
	Duration      *float64
	// Price is a float in Currency. Money rule 5 means it is cents by the time it lands.
	Price     *float64
	PriceEuro *float64
	Currency  *string
	// CabinPricesPerPerson is ONLY populated by GET /cruises/{id}; the list endpoint omits it
	// to stay lean. Keys are normalised cabin codes and the vocabulary is open.
	CabinPricesPerPerson []CabinPrice
	Destinations         []string
	// PortsList is ordered by day.
	PortsList    []ProviderPortStop
	ItineraryURL *string
	UpdatedAt    *string
	Raw          js.Value
}

// DecodeCruise reads a ProviderCruise from a parsed body.
func DecodeCruise(v js.Value) ProviderCruise {
	c := ProviderCruise{
		CruiseID:             reqString(v.Get("cruise_id")),
		ItineraryID:          optString(v.Get("itinerary_id")),
		Title:                optString(v.Get("title")),
		Company:              reqString(v.Get("company")),
		Locale:               reqString(v.Get("locale")),
		ShipName:             optString(v.Get("ship_name")),
		DepartureDate:        reqString(v.Get("departure_date")),
		Duration:             optNumber(v.Get("duration")),
		Price:                optNumber(v.Get("price")),
		PriceEuro:            optNumber(v.Get("price_euro")),
		Currency:             optString(v.Get("currency")),
		CabinPricesPerPerson: cabinPrices(v.Get("cabin_prices_per_person")),
		Destinations:         stringList(v.Get("destinations")),
		ItineraryURL:         optString(v.Get("itinerary_url")),
		UpdatedAt:            optString(v.Get("updated_at")),
		Raw:                  v,
	}
	if items, ok := v.Get("ports_list").Array(); ok {
		c.PortsList = make([]ProviderPortStop, 0, len(items))
		for _, s := range items {
			// A stop that is not an object has no `port` string, and toPortCalls drops it.
			if !s.IsPlainObject() {
				continue
			}
			c.PortsList = append(c.PortsList, ProviderPortStop{
				Port:      optString(s.Get("port")),
				Day:       optNumber(s.Get("day")),
				Arrival:   optString(s.Get("arrival")),
				Departure: optString(s.Get("departure")),
			})
		}
	}
	return c
}

// cabinPrices is Object.entries(cabin_prices_per_person): array-index keys first in numeric
// order, then the rest as they arrived. An array gives its indexes as keys, as
// Object.entries does; any other value gives nothing (Object.entries of a string or a number
// holds no number, so toCabinPrices made no row of it either).
func cabinPrices(v js.Value) []CabinPrice {
	if items, ok := v.Array(); ok {
		out := make([]CabinPrice, len(items))
		for i, item := range items {
			out[i] = CabinPrice{Code: strconv.Itoa(i), Price: optNumber(item)}
		}
		return out
	}
	o, ok := v.Object()
	if !ok {
		return nil
	}
	keys := slices.Clone(o.Keys())
	slices.SortStableFunc(keys, func(a, b string) int {
		ia, aIndex := arrayIndex(a)
		ib, bIndex := arrayIndex(b)
		switch {
		case aIndex && bIndex:
			return int(ia - ib)
		case aIndex:
			return -1
		case bIndex:
			return 1
		}
		return 0
	})
	out := make([]CabinPrice, len(keys))
	for i, k := range keys {
		out[i] = CabinPrice{Code: k, Price: optNumber(o.Get(k))}
	}
	return out
}

// arrayIndex reports a canonical array index ("0", "17"; not "017" or "-1"), below 2^32 - 1.
func arrayIndex(k string) (int64, bool) {
	if k == "" || len(k) > 10 || (len(k) > 1 && k[0] == '0') {
		return 0, false
	}
	n, err := strconv.ParseInt(k, 10, 64)
	if err != nil || n < 0 || n >= 1<<32-1 || strconv.FormatInt(n, 10) != k {
		return 0, false
	}
	return n, true
}

func reqString(v js.Value) string {
	s, _ := v.Str()
	return s
}

func optString(v js.Value) *string {
	if s, ok := v.Str(); ok {
		return &s
	}
	return nil
}

func optNumber(v js.Value) *float64 {
	if n, ok := v.Num(); ok {
		return &n
	}
	return nil
}

// stringList reads a list of strings: nil when absent or not a list, the string items
// otherwise (an empty list stays non-nil).
func stringList(v js.Value) []string {
	items, ok := v.Array()
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s, ok := item.Str(); ok {
			out = append(out, s)
		}
	}
	return out
}
