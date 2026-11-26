// Package quote ports supabase/functions/_shared/quote.ts: validation and normalisation for
// quote-request (P2; a quote request creates a Trip in `inquiry` status, BRD §6.5).
//
// The Deno version reads the clock itself (Date.now() for the trip id's recency, new Date()
// for the snapshot's capturedAt); here the caller passes now, so tests can pin it.
package quote

import (
	"errors"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// QuoteKinds is what the visitor was looking at, as a component_kind. Narrower than the enum
// on purpose: only the four a public search surface can produce. flight, transfer and
// insurance are things an advisor adds while building the trip, not things a traveler asks
// about from a search result.
var QuoteKinds = []string{"hotel", "cruise", "excursion", "custom"}

// QuoteTripTypes is the trip_type the inquiry becomes. Sent by the caller because the curated
// catalog knows things the component kind does not: a Sandals week and a boutique hotel are
// both hotel components, but only one of them is an all_inclusive trip.
var QuoteTripTypes = []string{"cruise", "all_inclusive", "multi_destination", "group", "custom"}

// QuoteSources is where the thing being asked about came from: trip_component.api_source. An
// ALLOW-LIST rather than free text, because this is provenance: a caller must not be able to
// label its own request as having come from a supplier feed. curated is Gyasi's own catalog,
// which is where anything that is not a live provider result comes from.
var QuoteSources = []string{"curated", "serpapi_google_hotels", "track_cruises"}

// The caps.
const (
	MaxNote  = 2000
	MaxTitle = 120
)

// QuoteInput is a checked quote request. It has NO cost field, on purpose: see Snapshot.
type QuoteInput struct {
	TripID       string   `json:"tripId"`
	Kind         string   `json:"kind"`
	TripType     string   `json:"tripType"`
	Title        string   `json:"title"`
	DisplayName  string   `json:"displayName"`
	Destinations []string `json:"destinations"`
	Location     *string  `json:"location"`
	CheckIn      *string  `json:"checkIn"`
	CheckOut     *string  `json:"checkOut"`
	Travelers    int      `json:"travelers"`
	Note         *string  `json:"note"`
	// Snapshot is the sanitised snapshot, keys in the order the Deno version wrote them. Its
	// numbers are the request's own js.Value numbers, echoed as JSON.stringify would; the
	// indicative rate among them is never read as money (see sanitiseSnapshot).
	Snapshot     js.Ordered `json:"snapshot"`
	APISource    string     `json:"apiSource"`
	APIReference *string    `json:"apiReference"`
}

// ParseBody checks a quote-request body. now stands for Date.now() and new Date().
func ParseBody(payload js.Value, now time.Time) (QuoteInput, error) {
	tripID, ok := payload.Get("tripId").Str()
	if !ok {
		return QuoteInput{}, problem.BadRequest("Send a tripId.")
	}
	// Client-generated v7, validated recent: the same contract every other write here uses,
	// and what makes a retry idempotent rather than a second trip.
	if msg := recentUUIDv7(tripID, now); msg != "" {
		return QuoteInput{}, problem.BadRequest("tripId must be a recent UUID v7: " + msg)
	}

	kind, ok := payload.Get("kind").Str()
	if !ok || !slices.Contains(QuoteKinds, kind) {
		return QuoteInput{}, problem.BadRequest("kind must be one of: " + strings.Join(QuoteKinds, ", ") + ".")
	}

	// Defaulted from the kind rather than required, so a caller that does not know (a future
	// mobile client, say) still produces a coherent trip instead of a rejected request.
	tripType, ok := payload.Get("tripType").Str()
	if !ok || !slices.Contains(QuoteTripTypes, tripType) {
		if kind == "cruise" {
			tripType = "cruise"
		} else {
			tripType = "custom"
		}
	}

	displayName := text(payload.Get("name"), MaxTitle)
	if displayName == nil {
		return QuoteInput{}, problem.BadRequest("Send the name of what you are asking about.")
	}

	location := text(payload.Get("location"), 120)
	// ABSENT AND INVALID ARE DIFFERENT ANSWERS. "I like this place, when could we go?" is a
	// real inquiry, so no dates is allowed. But a date that was SENT and does not parse must
	// be refused rather than quietly dropped: silently recording an undated trip loses the one
	// piece of information the traveler was most deliberate about, and nothing downstream
	// could tell it had happened.
	checkIn, err := optionalDate(payload.Get("checkIn"), "checkIn")
	if err != nil {
		return QuoteInput{}, err
	}
	checkOut, err := optionalDate(payload.Get("checkOut"), "checkOut")
	if err != nil {
		return QuoteInput{}, err
	}
	if (checkIn != nil) != (checkOut != nil) {
		return QuoteInput{}, problem.BadRequest("Send both checkIn and checkOut, or neither.")
	}
	if checkIn != nil && checkOut != nil && *checkOut <= *checkIn {
		return QuoteInput{}, problem.BadRequest("checkOut must be after checkIn.")
	}

	travelers := clamp(payload.Get("travelers"), 1, 20, 2)
	note := text(payload.Get("note"), MaxNote)

	snapshot := payload.Get("snapshot")
	if !snapshot.IsPlainObject() {
		snapshot = js.ObjectValue()
	}

	title := *displayName
	destinations := []string{}
	if location != nil {
		title = js.Slice(*displayName+" \U000000B7 "+*location, 0, MaxTitle)
		destinations = []string{*location}
	}

	apiSource, ok := payload.Get("source").Str()
	if !ok || !slices.Contains(QuoteSources, apiSource) {
		apiSource = "curated"
	}

	return QuoteInput{
		TripID:       tripID,
		Kind:         kind,
		TripType:     tripType,
		Title:        title,
		DisplayName:  *displayName,
		Destinations: destinations,
		Location:     location,
		CheckIn:      checkIn,
		CheckOut:     checkOut,
		Travelers:    travelers,
		Note:         note,
		Snapshot:     sanitiseSnapshot(snapshot, now),
		APISource:    apiSource,
		APIReference: text(payload.Get("apiReference"), 220),
	}, nil
}

// recentUUIDv7 is assertRecentUuidV7's check with its sentences, "" when the id passes. The
// window is uuid.CheckRecent's (an hour each way, Data-Model §21.6), but the words are the
// Deno version's, because they reach the caller inside this 400: "Not a UUID v7: <id>",
// "UUID v7 timestamp is more than 3600000ms old" and "... in the future". now is cut to the
// millisecond first, as Date.now() is.
func recentUUIDv7(id string, now time.Time) string {
	err := uuid.CheckRecent(id, now.Truncate(time.Millisecond))
	switch {
	case err == nil:
		return ""
	case errors.Is(err, uuid.ErrNotV7):
		return "Not a UUID v7: " + id
	case errors.Is(err, uuid.ErrTooOld):
		return "UUID v7 timestamp is more than " + strconv.FormatInt(uuid.MaxAge.Milliseconds(), 10) + "ms old"
	default:
		return "UUID v7 timestamp is more than " + strconv.FormatInt(uuid.MaxSkew.Milliseconds(), 10) + "ms in the future"
	}
}

var (
	controlChars = regexp.MustCompile(`\p{Cc}`)
	spaceRuns    = js.Regexp(`\s+`, "")
	isoDay       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// sanitiseSnapshot treats the snapshot as hostile, because the client echoes it back: an
// allow-list of scalar keys, capped, with no nesting.
//
// indicativeRateCents is named for what it is. It must never be read as a cost: the money
// columns beside it stay zero, and a future reader who wants to price the trip has to decide
// to, rather than inherit a number Google produced. That is why it stays the request's own
// number here and never becomes an int64 cents value.
func sanitiseSnapshot(raw js.Value, now time.Time) js.Ordered {
	out := js.O()
	for _, key := range []string{"propertyType", "photoUrl", "propertyToken"} {
		if v := text(raw.Get(key), 300); v != nil {
			out = out.Set(key, *v)
		}
	}
	for _, key := range []string{"indicativeRateCents", "hotelClass", "rating", "reviewCount"} {
		value := raw.Get(key)
		if v, ok := value.Num(); ok && js.IsFinite(v) && v >= 0 {
			out = out.Set(key, value)
		}
	}
	if items, ok := raw.Get("amenities").Array(); ok {
		amenities := []string{}
		for _, item := range items {
			if a, ok := item.Str(); ok && len(amenities) < 12 {
				amenities = append(amenities, js.Slice(a, 0, 60))
			}
		}
		out = out.Set("amenities", amenities)
	}
	return out.Set("capturedAt", js.ISOString(now))
}

// text is one cleaned line: control characters become spaces, runs of white space one space,
// trimmed, then cut to max UTF-16 units (as .slice does; a cut through an emoji leaves
// U+FFFD where Deno left half a surrogate pair), or nil when nothing is left.
func text(value js.Value, max int) *string {
	s, ok := value.Str()
	if !ok {
		return nil
	}
	cleaned := js.Slice(js.Trim(spaceRuns.ReplaceAllString(controlChars.ReplaceAllString(s, " "), " ")), 0, max)
	if cleaned == "" {
		return nil
	}
	return &cleaned
}

// optionalDate is nil when the field was not sent at all, and a 400 when it was sent and is
// not a date.
func optionalDate(value js.Value, field string) (*string, error) {
	if s, ok := value.Str(); value.IsNullish() || (ok && s == "") {
		return nil, nil
	}
	parsed := isoDate(value)
	if parsed == nil {
		return nil, problem.BadRequest(field + " must be a real date as YYYY-MM-DD.")
	}
	return parsed, nil
}

// isoDate is a real calendar date as YYYY-MM-DD. The Deno version checks it with
// Date.UTC(y, m - 1, d, 12), which reads a year from 0 to 99 as 1900 + y, so such a year
// never round-trips and is refused; that is kept.
func isoDate(value js.Value) *string {
	s, ok := value.Str()
	if !ok || !isoDay.MatchString(s) {
		return nil
	}
	y, _ := strconv.Atoi(s[0:4])
	m, _ := strconv.Atoi(s[5:7])
	d, _ := strconv.Atoi(s[8:10])
	if y <= 99 {
		return nil
	}
	date := time.Date(y, time.Month(m), d, 12, 0, 0, 0, time.UTC)
	if date.Year() != y || int(date.Month()) != m || date.Day() != d {
		return nil
	}
	return &s
}

// clamp is Math.round(value) held to [min, max], or fallback when value is not a finite
// number.
func clamp(value js.Value, min, max, fallback int) int {
	v, ok := value.Num()
	if !ok {
		return fallback
	}
	r := js.Round(v)
	if !js.IsFinite(r) {
		return fallback
	}
	return int(math.Min(float64(max), math.Max(float64(min), r)))
}
