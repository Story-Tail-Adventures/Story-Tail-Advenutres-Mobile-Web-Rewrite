package hotels

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"
)

// providerResponse is the part of a SerpApi Google Hotels reply the mapper reads
// (https://serpapi.com/google-hotels-api). The TypeScript in web/lib/hotels/types.ts
// typed the whole reply loosely and left the allow-list to the mapper. Here the allow-list
// starts at decode: encoding/json drops every key not named below, so prices[] (one entry
// per booking site, each with its source, logo and link), ads[], brands[], deal and
// deal_description, the property's Google booking link, serpapi_pagination and total_rate
// never exist in memory. Do not add one "for attribution": Free-Travel-APIs §1.3.5 says this
// site promotes the advisor's travel business and nothing else, and §10.2 asks for that to
// be structural.
//
// Every field is one of the json* types below, or a slice, because this is a scrape of
// someone else's page. Absent, null and the wrong JSON type all leave a value unset, which
// the mapper reads as "not given", the same as the TypeScript's typeof checks. A plain
// pointer would not do: encoding/json allocates the pointer before it finds the type is
// wrong, so "overall_rating": "4.5" would arrive as a rating of 0.
type providerResponse struct {
	SearchInformation *struct {
		TotalResults jsonNumber `json:"total_results"`
	} `json:"search_information"`
	Properties []providerProperty `json:"properties"`
	// Error is kept raw: SerpApi answers some failures with HTTP 200 and an error body, and
	// any truthy value there is a failure, whatever its JSON type.
	Error json.RawMessage `json:"error"`
}

// providerProperty is one hotel in the reply, reduced to what the mapper reads.
type providerProperty struct {
	Type                jsonString      `json:"type"`
	Name                jsonString      `json:"name"`
	Description         jsonString      `json:"description"`
	PropertyToken       jsonString      `json:"property_token"`
	PropertyType        jsonString      `json:"property_type"`
	RatePerNight        *providerRate   `json:"rate_per_night"`
	ExtractedHotelClass jsonNumber      `json:"extracted_hotel_class"`
	Images              []providerImage `json:"images"`
	OverallRating       jsonNumber      `json:"overall_rating"`
	Reviews             jsonNumber      `json:"reviews"`
	Amenities           []string        `json:"amenities"`
	Sponsored           jsonTrue        `json:"sponsored"`
	EcoCertified        jsonTrue        `json:"eco_certified"`
}

// providerRate is a property's nightly rate. Only the extracted number is read: "lowest" is
// a display string ("$1,148"), and parsing it means guessing at a currency symbol, a
// thousands separator and a locale.
type providerRate struct {
	// ExtractedLowest is a float in dollars (318.5), which is why the mapper converts it
	// once, to integer cents, and nothing past the mapper sees a float price.
	ExtractedLowest jsonNumber `json:"extracted_lowest"`
}

// providerImage is one photo. Only the thumbnail is read: original_image is full-size and
// unbounded, and a card wants the thumbnail.
type providerImage struct {
	Thumbnail jsonString `json:"thumbnail"`
}

// jsonNumber is set only when the JSON value is a number that fits a float64 (JavaScript's
// typeof value === "number" plus Number.isFinite).
type jsonNumber struct {
	value float64
	set   bool
}

// UnmarshalJSON never fails: a value of another type leaves n unset.
func (n *jsonNumber) UnmarshalJSON(b []byte) error {
	*n = jsonNumber{}
	if len(b) == 0 || b[0] != '-' && (b[0] < '0' || b[0] > '9') {
		return nil
	}
	// A number past float64's range is an error here, as it was Infinity there: unset.
	if f, err := strconv.ParseFloat(string(b), 64); err == nil {
		*n = jsonNumber{value: f, set: true}
	}
	return nil
}

// ptr is the number, or nil when it was not given.
func (n jsonNumber) ptr() *float64 {
	if !n.set {
		return nil
	}
	return &n.value
}

// jsonString is set only when the JSON value is a string.
type jsonString struct {
	value string
	set   bool
	// given is true for any value but null, the test JavaScript's ?? makes: a property_type
	// of the wrong type is no type at all, not a reason to fall back to type.
	given bool
}

// UnmarshalJSON never fails: a value of another type leaves s unset.
func (s *jsonString) UnmarshalJSON(b []byte) error {
	*s = jsonString{given: string(b) != "null"}
	if len(b) == 0 || b[0] != '"' {
		return nil
	}
	var v string
	if err := json.Unmarshal(b, &v); err == nil {
		*s = jsonString{value: v, set: true, given: true}
	}
	return nil
}

// ptr is the string, or nil when it was not given.
func (s jsonString) ptr() *string {
	if !s.set {
		return nil
	}
	return &s.value
}

// jsonTrue is true only for JSON true, the TypeScript's value === true.
type jsonTrue bool

// UnmarshalJSON never fails.
func (t *jsonTrue) UnmarshalJSON(b []byte) error {
	*t = jsonTrue(string(b) == "true")
	return nil
}

// decodeProvider reads a reply body the way response.json() did in client.ts. It returns nil,
// which fetch treats as a failure, when the body is not JSON or is a falsy JSON value (null,
// false, 0, ""), as the TypeScript's `!body` did. Any other JSON is a reply: a top-level
// array or string decodes to an empty one, and a field of the wrong type is skipped rather
// than failing the whole body.
func decodeProvider(raw []byte) *providerResponse {
	// fetch's body.json() decodes as UTF-8 and drops a byte-order mark; encoding/json does not.
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	if jsonFalsy(raw) {
		return nil
	}
	var body providerResponse
	if err := json.Unmarshal(raw, &body); err != nil {
		var typeErr *json.UnmarshalTypeError
		if !errors.As(err, &typeErr) {
			return nil
		}
	}
	return &body
}

// failed reports whether the reply carries a truthy error, which the TypeScript treated as a
// failure whatever the HTTP status.
func (r *providerResponse) failed() bool {
	return len(r.Error) > 0 && !jsonFalsy(r.Error)
}

// errorText is the provider's error sentence, when it sent one as a string.
func (r *providerResponse) errorText() (string, bool) {
	if len(r.Error) == 0 {
		return "", false
	}
	var s string
	if err := json.Unmarshal(r.Error, &s); err != nil {
		return "", false
	}
	return s, true
}

// jsonFalsy reports whether raw is a JSON value JavaScript reads as false: null, false, 0
// or the empty string.
func jsonFalsy(raw []byte) bool {
	v := bytes.TrimSpace(raw)
	switch string(v) {
	case "null", "false", `""`:
		return true
	}
	if len(v) > 0 && (v[0] == '-' || v[0] >= '0' && v[0] <= '9') {
		f, err := strconv.ParseFloat(string(v), 64)
		return err == nil && f == 0
	}
	return false
}
