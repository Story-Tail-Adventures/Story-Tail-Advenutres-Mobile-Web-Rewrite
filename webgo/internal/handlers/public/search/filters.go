package search

import (
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// View-model helpers for 2.0.4. Ports web/app/(public)/(plain)/explore/results/filters.ts.
// The URL is the only filter state, so every chip is a link to "the same search with one
// value toggled", and the header pill is derived from the parsed query.

// The results page copy these helpers write, from explore/results/content.ts (RESULTS.pill
// and RESULTS.hotels.starClassLabel), word for word.
const (
	pillDestination   = "Destination"
	pillDates         = "Dates"
	pillTravelers     = "Travelers"
	pillTripType      = "Trip type"
	pillAnywhere      = "Anywhere"
	pillFlexibleDates = "Flexible dates"
	pillAnyGroup      = "Any group"
	pillAnyType       = "Any"
)

// travelersCount is RESULTS.pill.travelersCount: "1 traveler", "2 travelers".
func travelersCount(n int) string {
	if n == 1 {
		return strconv.Itoa(n) + " traveler"
	}
	return strconv.Itoa(n) + " travelers"
}

// starClassLabel is RESULTS.hotels.starClassLabel: "5★" for five, "4★+" below it.
func starClassLabel(n int) string {
	if n == 5 {
		return "5★"
	}
	return strconv.Itoa(n) + "★+"
}

// ChipKind is the query param a chip toggles.
type ChipKind string

// The chip kinds.
const (
	ChipType    ChipKind = "type"
	ChipVibe    ChipKind = "vibe"
	ChipStar    ChipKind = "star"
	ChipAmenity ChipKind = "amenity"
	ChipRate    ChipKind = "rate"
)

// FilterChip is one quick filter: a label and the one param value it toggles.
type FilterChip struct {
	ID    string
	Label string
	Kind  ChipKind
	Value string
}

// MobileChips is the mobile and tablet quick-filter strip (M204), in artboard order.
// Budget lives in the sheet.
var MobileChips = []FilterChip{
	{ID: "all-inclusive", Label: TripTypeLabels[TypeAllInclusive], Kind: ChipType, Value: string(TypeAllInclusive)},
	{ID: "cruise", Label: TripTypeLabels[TypeCruise], Kind: ChipType, Value: string(TypeCruise)},
	{ID: "hotel", Label: TripTypeLabels[TypeHotel], Kind: ChipType, Value: string(TypeHotel)},
	{ID: "adults-only", Label: VibeLabels[VibeAdultsOnly], Kind: ChipVibe, Value: string(VibeAdultsOnly)},
	{ID: "family", Label: VibeLabels[VibeFamily], Kind: ChipVibe, Value: string(VibeFamily)},
}

// hotelChips is the same three axes FilterRail gives hotels mode, as chips (Screen
// Inventory 2.3.3).
var hotelChips = func() []FilterChip {
	var out []FilterChip
	for _, s := range StarClasses {
		n, _ := strconv.Atoi(string(s))
		out = append(out, FilterChip{ID: "star-" + string(s), Label: starClassLabel(n), Kind: ChipStar, Value: string(s)})
	}
	for _, a := range HotelAmenities {
		out = append(out, FilterChip{ID: "amenity-" + a.ID, Label: a.Label, Kind: ChipAmenity, Value: a.ID})
	}
	for _, b := range RateBands {
		out = append(out, FilterChip{ID: "rate-" + string(b.ID), Label: b.Label, Kind: ChipRate, Value: string(b.ID)})
	}
	return out
}()

// ChipsFor is the quick-filter strip for a mode.
//
// The strip used to be MobileChips whatever the mode, which put five curated-catalog
// filters above a list of Google hotels; tapping one changed the URL and not the results.
// Cruises has none on purpose: the public cruise catalog is departure-ordered and has no
// filter vocabulary yet.
func ChipsFor(mode ResultsMode) []FilterChip {
	switch mode {
	case ModeHotels:
		return hotelChips
	case ModeCruises:
		return []FilterChip{}
	}
	return MobileChips
}

// ChipIsOn reports whether the chip's value is switched on in the query.
func ChipIsOn(q SearchQuery, chip FilterChip) bool {
	switch chip.Kind {
	case ChipType:
		return slices.Contains(q.Types, content.TripType(chip.Value))
	case ChipVibe:
		return slices.Contains(q.Vibes, content.Vibe(chip.Value))
	case ChipStar:
		return slices.Contains(q.Stars, StarClass(chip.Value))
	case ChipAmenity:
		return slices.Contains(q.Amenities, chip.Value)
	case ChipRate:
		return slices.Contains(q.Rates, RateBand(chip.Value))
	}
	return false
}

// toggle is a new list with value removed when it is there and appended when it is not.
func toggle[T comparable](list []T, value T) []T {
	if !slices.Contains(list, value) {
		return append(slices.Clone(list), value)
	}
	out := make([]T, 0, len(list))
	for _, v := range list {
		if v != value {
			out = append(out, v)
		}
	}
	return out
}

// ToggleChip is the same search with ONE value switched on or off; every other param is
// kept. It never changes q's slices.
func ToggleChip(q SearchQuery, chip FilterChip) SearchQuery {
	switch chip.Kind {
	case ChipType:
		q.Types = toggle(q.Types, content.TripType(chip.Value))
	case ChipVibe:
		q.Vibes = toggle(q.Vibes, content.Vibe(chip.Value))
	case ChipStar:
		q.Stars = toggle(q.Stars, StarClass(chip.Value))
	case ChipAmenity:
		q.Amenities = toggle(q.Amenities, chip.Value)
	case ChipRate:
		q.Rates = toggle(q.Rates, RateBand(chip.Value))
	}
	return q
}

// ChipHref is the results link with the chip toggled.
func ChipHref(q SearchQuery, chip FilterChip) string {
	return ResultsHref(ToggleChip(q, chip))
}

// ActiveFilterCount is how many filter values are switched on, for the "Filters" chip.
// It counts only the axes the CURRENT mode filters by: counting curated filters over hotel
// results would read as "3 filters applied" over results no filter touched.
func ActiveFilterCount(q SearchQuery) int {
	switch EffectiveMode(q) {
	case ModeHotels:
		return len(q.Stars) + len(q.Amenities) + len(q.Rates)
	case ModeCruises:
		return 0
	}
	return len(q.Types) + len(q.Vibes) + len(q.Budgets)
}

// InquiryCell is one display cell of the header pill: what the search says, not an input.
// Icon names the sprite symbol.
type InquiryCell struct {
	Label string
	Value string
	Icon  string
}

// InquiryFields is the header pill's cells (C204: destination, dates, travelers, type).
func InquiryFields(q SearchQuery) []InquiryCell {
	dest := pillAnywhere
	if q.Dest != "" {
		dest = q.Dest
	}
	dates := pillFlexibleDates
	if label, ok := StayLabel(q, SearchTimeZone); ok {
		dates = label
	}
	travelers := pillAnyGroup
	if q.Travelers != 0 {
		travelers = travelersCount(q.Travelers)
	}
	tripType := pillAnyType
	if len(q.Types) == 1 {
		tripType = TripTypeLabels[q.Types[0]]
	}
	return []InquiryCell{
		{Label: pillDestination, Value: dest, Icon: "map"},
		{Label: pillDates, Value: dates, Icon: "calendar"},
		{Label: pillTravelers, Value: travelers, Icon: "user"},
		{Label: pillTripType, Value: tripType, Icon: "palm"},
	}
}

// InquirySummary is the one-line mobile summary ("Caribbean · Aug 12 – 19 · 2 travelers").
func InquirySummary(q SearchQuery) string {
	fields := InquiryFields(q)[:3]
	values := make([]string, len(fields))
	for i, f := range fields {
		values[i] = f.Value
	}
	return strings.Join(values, " · ")
}
