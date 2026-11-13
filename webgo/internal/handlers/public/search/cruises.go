package search

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
)

// The public cruise read, Screen 2.0.4 in Cruises mode. Ports web/lib/public/cruises.ts.
//
// THERE IS NO FARE FIELD, and that is the point. cruise_sailing.lead_price_cents is
// classified Internal (Data-Model §24.4) and Free-Travel-APIs §4.7 launches the public
// surface without a fare. The Edge Function does not select it and these types have
// nowhere to put it.
//
// The response is checked field by field the way the TypeScript's zod schema checked it,
// and refused where zod refused it. Objects are read as map[string]json.RawMessage and
// each value decoded into its own type: encoding/json matches struct keys without regard
// to case, and zod does not.

// imageHosts is the one host a visitor's browser is pointed at for a ship photo.
//
// Repeated from the database ON PURPOSE. The earlier guard is cruise_ship_image_host, a
// CHECK on the column; this is the copy that still holds when a dump is restored around
// that constraint, a row is hotfixed, or the constraint is relaxed.
var imageHosts = map[string]bool{"upload.wikimedia.org": true}

// isAllowedImage reports whether a photo URL is https on an allow-listed host, read the way
// the browser that fetches it reads it.
func isAllowedImage(raw string) bool {
	u, ok := parseWebURL(raw)
	return ok && u.scheme == "https" && imageHosts[u.hostname]
}

// ShipImage is a ship photo and its attribution, which travel together or not at all.
//
// Credit IS REQUIRED. The photos are CC BY / CC BY-SA, so the credit is a licence
// condition; a photo without one is dropped rather than rendered bare.
type ShipImage struct {
	URL       string  `json:"url"`
	Credit    string  `json:"credit"`
	License   *string `json:"license"`
	SourceURL *string `json:"sourceUrl"`
}

// PublicSailing is one sailing a public page may render.
type PublicSailing struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Line          *string  `json:"line"`
	Ship          *string  `json:"ship"`
	DepartureDate string   `json:"departureDate"`
	Nights        *int     `json:"nights"`
	Destinations  []string `json:"destinations"`
	Ports         []string `json:"ports"`
	// ShipImage is nil when the sailing has no photo, or its photo failed a check: the
	// photo is decoration, and one bad photo costs that photo, not the page.
	ShipImage *ShipImage `json:"shipImage"`
}

// CruiseStatus is how a cruise search came back.
type CruiseStatus string

// The statuses.
const (
	CruiseOK          CruiseStatus = "ok"
	CruiseEmpty       CruiseStatus = "empty"
	CruiseUnavailable CruiseStatus = "unavailable"
)

// CruiseSearchResult is a cruise search's outcome. Sailings is set only with CruiseOK.
type CruiseSearchResult struct {
	Status   CruiseStatus
	Sailings []PublicSailing
}

// CruiseSearchArgs is what a cruise search asks. Empty fields are not sent.
type CruiseSearchArgs struct {
	Destination string
	// From and To are YYYY-MM-DD.
	From string
	To   string
}

// cruiseRequestBody is the JSON body cruise-search reads.
type cruiseRequestBody struct {
	Destination string `json:"destination,omitempty"`
	From        string `json:"from,omitempty"`
	To          string `json:"to,omitempty"`
}

// CruiseRequest is the registry call for a search. It is a POST with a JSON body: the
// function refuses every other method ("Use POST to search.").
func CruiseRequest(args CruiseSearchArgs) api.Input {
	return api.Input{
		Method: http.MethodPost,
		Body:   cruiseRequestBody{Destination: args.Destination, From: args.From, To: args.To},
	}
}

// CallFunc runs one function through the registry: a closure over Registry.Call that
// carries the caller's token.
type CallFunc func(ctx context.Context, name string, in api.Input) api.Result

// cruiseTimeout is how long a search may take before the page gives up on it.
const cruiseTimeout = 6 * time.Second

// SearchCruises runs a search through call and never fails: a read failure on a public
// marketing page is a quiet fallback to the curated catalog, so every failure is
// CruiseUnavailable. Caching the result (30 minutes in the TypeScript) is the caller's.
func SearchCruises(ctx context.Context, call CallFunc, args CruiseSearchArgs) CruiseSearchResult {
	if call == nil {
		return CruiseSearchResult{Status: CruiseUnavailable}
	}
	ctx, cancel := context.WithTimeout(ctx, cruiseTimeout)
	defer cancel()
	res := call(ctx, "cruise-search", CruiseRequest(args))
	if !res.OK {
		return CruiseSearchResult{Status: CruiseUnavailable}
	}
	return ParseCruiseResponse(res.Data)
}

// ParseCruiseResponse checks a cruise-search reply. Anything that does not match is
// CruiseUnavailable, except a bad photo, which only costs that photo.
func ParseCruiseResponse(raw []byte) CruiseSearchResult {
	unavailable := CruiseSearchResult{Status: CruiseUnavailable}
	// response.json() decodes the bytes as UTF-8 first: a BOM goes, bad bytes become U+FFFD.
	body := strings.TrimPrefix(decodeUTF8(string(raw)), string(rune(0xFEFF)))
	top, ok := decodeObject([]byte(body))
	if !ok {
		return unavailable
	}
	results, ok := decodeArray(top["results"])
	if !ok {
		return unavailable
	}
	if len(results) == 0 {
		return CruiseSearchResult{Status: CruiseEmpty}
	}
	sailings := make([]PublicSailing, 0, len(results))
	for _, r := range results {
		s, ok := parseSailing(r)
		if !ok {
			return unavailable
		}
		sailings = append(sailings, s)
	}
	return CruiseSearchResult{Status: CruiseOK, Sailings: sailings}
}

var isoDateShape = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)

// parseSailing is sailingSchema.
func parseSailing(raw json.RawMessage) (PublicSailing, bool) {
	o, ok := decodeObject(raw)
	if !ok {
		return PublicSailing{}, false
	}
	var s PublicSailing
	if s.ID, ok = boundedString(o["id"], 1, 80); !ok {
		return PublicSailing{}, false
	}
	if s.Title, ok = boundedString(o["title"], 1, 200); !ok {
		return PublicSailing{}, false
	}
	if s.Line, ok = nullableString(o["line"], 120); !ok {
		return PublicSailing{}, false
	}
	if s.Ship, ok = nullableString(o["ship"], 120); !ok {
		return PublicSailing{}, false
	}
	if s.DepartureDate, ok = jsonString(o["departureDate"]); !ok || !isoDateShape.MatchString(s.DepartureDate) {
		return PublicSailing{}, false
	}
	if s.Nights, ok = nullableNights(o["nights"]); !ok {
		return PublicSailing{}, false
	}
	if s.Destinations, ok = stringList(o["destinations"], 80, 6); !ok {
		return PublicSailing{}, false
	}
	if s.Ports, ok = stringList(o["ports"], 120, 12); !ok {
		return PublicSailing{}, false
	}
	// .nullable().catch(null): a missing, null or failing photo is no photo, and the
	// sailing still stands.
	if img, ok := parseShipImage(o["shipImage"]); ok {
		s.ShipImage = img
	}
	return s, true
}

// parseShipImage is shipImageSchema.nullable(). False is a failure, which the caller turns
// into no photo.
func parseShipImage(raw json.RawMessage) (*ShipImage, bool) {
	if isNull(raw) {
		return nil, true
	}
	o, ok := decodeObject(raw)
	if !ok {
		return nil, false
	}
	var img ShipImage
	u, ok := jsonString(o["url"])
	if !ok {
		return nil, false
	}
	if img.URL, ok = zodURL(u, 500); !ok || !isAllowedImage(img.URL) {
		return nil, false
	}
	if img.Credit, ok = boundedString(o["credit"], 1, 400); !ok {
		return nil, false
	}
	if img.License, ok = nullableString(o["license"], 60); !ok {
		return nil, false
	}
	src, present := o["sourceUrl"]
	if !present {
		return nil, false
	}
	if !isNull(src) {
		s, ok := jsonString(src)
		if !ok {
			return nil, false
		}
		if s, ok = zodURL(s, 500); !ok {
			return nil, false
		}
		img.SourceURL = &s
	}
	return &img, true
}

// zodURL is z.string().url().max(n): the value trimmed, it must parse as a URL, and the
// value kept is the trimmed one with tabs and newlines taken out (zod 4's output), at most
// n code points long.
//
// A sourceUrl may legally be "javascript:…": zod's url() accepts any URL that parses. The
// TypeScript leaned on React to defuse it in an href; here page.SafeURL must pass it before
// it fills one, and refuses it.
func zodURL(value string, n int) (string, bool) {
	trimmed := jsTrim(value)
	if !canParseURL(trimmed) {
		return "", false
	}
	out := strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(trimmed)
	return out, utf8.RuneCountInString(out) <= n
}

// jsonWS trims JSON's own whitespace.
func jsonWS(raw []byte) []byte {
	return []byte(strings.Trim(string(raw), " \t\n\r"))
}

func isNull(raw json.RawMessage) bool {
	return string(jsonWS(raw)) == "null"
}

// decodeObject reads a JSON object; false for anything else, null included.
func decodeObject(raw []byte) (map[string]json.RawMessage, bool) {
	raw = jsonWS(raw)
	if len(raw) == 0 || raw[0] != '{' {
		return nil, false
	}
	var o map[string]json.RawMessage
	if json.Unmarshal(raw, &o) != nil {
		return nil, false
	}
	return o, true
}

// decodeArray reads a JSON array; false for anything else, null and missing included.
func decodeArray(raw json.RawMessage) ([]json.RawMessage, bool) {
	raw = jsonWS(raw)
	if len(raw) == 0 || raw[0] != '[' {
		return nil, false
	}
	var a []json.RawMessage
	if json.Unmarshal(raw, &a) != nil {
		return nil, false
	}
	return a, true
}

// jsonString reads a JSON string; false for anything else, null and missing included.
func jsonString(raw json.RawMessage) (string, bool) {
	raw = jsonWS(raw)
	if len(raw) == 0 || raw[0] != '"' {
		return "", false
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	return s, true
}

// boundedString is z.string().min(lo).max(hi). zod 4 counts code points, not UTF-16 units,
// so an emoji is one; json.Unmarshal has already made a lone surrogate U+FFFD, also one.
func boundedString(raw json.RawMessage, lo, hi int) (string, bool) {
	s, ok := jsonString(raw)
	if !ok {
		return "", false
	}
	n := utf8.RuneCountInString(s)
	return s, n >= lo && n <= hi
}

// nullableString is z.string().max(hi).nullable(): the key must be there, null or a string.
func nullableString(raw json.RawMessage, hi int) (*string, bool) {
	if isNull(raw) {
		return nil, true
	}
	s, ok := boundedString(raw, 0, hi)
	if !ok {
		return nil, false
	}
	return &s, true
}

// nullableNights is z.number().int().min(1).max(120).nullable().
func nullableNights(raw json.RawMessage) (*int, bool) {
	if isNull(raw) {
		return nil, true
	}
	raw = jsonWS(raw)
	if len(raw) == 0 || (raw[0] != '-' && (raw[0] < '0' || raw[0] > '9')) {
		return nil, false
	}
	f, err := strconv.ParseFloat(string(raw), 64)
	if err != nil || f != math.Trunc(f) || f < 1 || f > 120 {
		return nil, false
	}
	n := int(f)
	return &n, true
}

// stringList is z.array(z.string().max(each)).max(count).
func stringList(raw json.RawMessage, each, count int) ([]string, bool) {
	items, ok := decodeArray(raw)
	if !ok || len(items) > count {
		return nil, false
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		s, ok := boundedString(item, 0, each)
		if !ok {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}
