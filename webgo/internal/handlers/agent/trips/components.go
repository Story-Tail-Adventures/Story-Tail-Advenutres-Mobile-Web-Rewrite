package trips

import (
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// The trip builder's seven component kinds and their sheets (§3.4.5 to §3.4.12), ported from
// web/lib/agent/components.ts with BUILDER_COPY's labels word for word.

// componentKinds matches component_kind exactly.
var componentKinds = []string{"flight", "hotel", "cruise", "transfer", "excursion", "insurance", "custom"}

// componentRail is the order the builder's rail offers them.
var componentRail = []string{"flight", "hotel", "cruise", "excursion", "transfer", "insurance", "custom"}

// componentColumns are the six columns an upsert writes beside the name. A sheet that does
// not show one carries it as a hidden field: the upsert replaces the row with what it is
// given, so a column left out would be cleared.
var componentColumns = []string{"location", "startDate", "endDate", "startTime", "endTime", "confirmationNumber"}

// detailField is one payload field a kind's sheet shows.
type detailField struct {
	key, label string
	kind       string // "text", "long" or "flag"
}

var notesField = detailField{"notes", "Notes", "long"}

// componentSpec is ComponentSpec.
type componentSpec struct {
	kind, icon, addLabel, shortLabel, nameLabel, namePlaceholder string
	columns                                                      map[string]string
	detail                                                       []detailField
}

var componentSpecs = map[string]componentSpec{
	"flight": {"flight", "plane", "Add a flight", "Flight", "Flight", "AA 1413 · MIA → MBJ",
		map[string]string{"location": "Departs from", "startDate": "Date", "startTime": "Departs",
			"endDate": "Arrives on", "endTime": "Arrives", "confirmationNumber": "Booking reference"},
		[]detailField{{"flight_number", "Flight number", "text"}, {"cabin", "Cabin", "text"}, {"seat", "Seat", "text"}, notesField}},
	"hotel": {"hotel", "building", "Add a hotel or resort", "Hotel or resort", "Stay", "Ocean-view suite · 7 nights",
		map[string]string{"location": "Where", "startDate": "Check-in", "startTime": "Check-in time",
			"endDate": "Check-out", "endTime": "Check-out time", "confirmationNumber": "Confirmation number"},
		[]detailField{{"room_type", "Room type", "text"}, {"board_basis", "Board basis", "text"}, notesField}},
	"cruise": {"cruise", "ship", "Add a cruise", "Cruise", "Sailing", "Symphony · 7-night Eastern Caribbean",
		map[string]string{"location": "Departs from", "startDate": "Sails", "startTime": "Boarding",
			"endDate": "Returns", "endTime": "Disembark", "confirmationNumber": "Booking number"},
		[]detailField{{"ship", "Ship", "text"}, {"itinerary_name", "Itinerary", "text"}, {"cabin", "Cabin", "text"},
			{"dining_seating", "Dining seating", "text"}, {"gratuities_included", "Gratuities included", "flag"}, notesField}},
	"transfer": {"transfer", "trip", "Add a transfer", "Transfer", "Transfer", "Private transfer · Mercedes Vito",
		map[string]string{"location": "Pickup", "startDate": "Date", "startTime": "Pickup time",
			"endTime": "Arrives", "confirmationNumber": "Confirmation number"},
		[]detailField{{"dropoff", "Drop-off", "text"}, {"vehicle", "Vehicle", "text"}, notesField}},
	"excursion": {"excursion", "sparkle", "Add a tour or activity", "Tour or activity", "Tour or activity", "Catamaran to Booby Cay",
		map[string]string{"location": "Meeting point", "startDate": "Date", "startTime": "Starts",
			"endDate": "Ends on", "endTime": "Ends", "confirmationNumber": "Confirmation number"},
		[]detailField{{"duration", "How long", "text"}, notesField}},
	"insurance": {"insurance", "shield", "Add travel insurance", "Insurance", "Policy", "Allianz OneTrip Prime",
		map[string]string{"startDate": "Covered from", "endDate": "Covered to", "confirmationNumber": "Policy number"},
		[]detailField{{"plan", "Plan", "text"}, {"coverage", "Coverage", "text"}, notesField}},
	"custom": {"custom", "receipt", "Add something else", "Something else", "What is it?", "Welcome bottle · in-room",
		map[string]string{"location": "Where", "startDate": "Date", "startTime": "Time",
			"endDate": "Ends", "endTime": "Ends at", "confirmationNumber": "Confirmation number"},
		[]detailField{notesField}},
}

func isComponentKind(v string) bool {
	_, ok := componentSpecs[v]
	return ok
}

// componentKindFromParam: a kind from ?add=, or "" ("dining" is not one; §23 sends it to custom).
func componentKindFromParam(v string) string {
	if isComponentKind(v) {
		return v
	}
	return ""
}

// componentValues is ComponentValues: the sheet's fields as text.
type componentValues struct {
	componentID, kind, displayName, supplierID string
	cols                                       map[string]string // the six columns
	cost, commissionPct, commission            string
	detail                                     map[string]string
}

func emptyComponent(kind string) componentValues {
	return componentValues{kind: kind, cols: map[string]string{}, detail: map[string]string{}}
}

// componentFromForm ports componentFromFormData: everything trimmed, an unknown kind is
// custom, and only the detail keys the kind declares are read.
func componentFromForm(f url.Values) componentValues {
	kind := f.Get("kind")
	if !isComponentKind(kind) {
		kind = "custom"
	}
	text := func(name string) string { return trimJS(lf(f.Get(name))) }
	v := componentValues{
		componentID: text("componentId"), kind: kind, displayName: text("displayName"),
		supplierID: text("supplierId"), cost: text("cost"), commissionPct: text("commissionPct"),
		commission: text("commission"), cols: map[string]string{}, detail: map[string]string{},
	}
	for _, c := range componentColumns {
		v.cols[c] = text(c)
	}
	for _, field := range componentSpecs[kind].detail {
		if x := text("detail." + field.key); x != "" {
			v.detail[field.key] = x
		}
	}
	return v
}

var moneyAmount = regexp.MustCompile(`^(\d+)(?:\.(\d{1,2}))?$`)

// jsSpace is what JS's \s, trim() and Number() count as white space. Go's \s is ASCII only
// and unicode.IsSpace adds U+0085 and misses U+FEFF, so neither will do.
func jsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	}
	return r >= '\u2000' && r <= '\u200a'
}

// trimJS is String.prototype.trim.
func trimJS(s string) string { return strings.TrimFunc(s, jsSpace) }

// jsDecimal is the decimal form Number() reads; the other forms are named in numberJS.
var jsDecimal = regexp.MustCompile(`^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$`)

// numberJS is JS's Number(s) for a string. ok is false where JS gives NaN ("NaN", "1_000",
// "0x1p4", "1,5"), which strconv.ParseFloat would read.
func numberJS(s string) (float64, bool) {
	s = trimJS(s)
	switch s {
	case "":
		return 0, true
	case "Infinity", "+Infinity":
		return math.Inf(1), true
	case "-Infinity":
		return math.Inf(-1), true
	}
	if len(s) > 2 && s[0] == '0' {
		base := 0
		switch s[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			n, err := strconv.ParseUint(s[2:], base, 64)
			switch {
			case errors.Is(err, strconv.ErrRange):
				return math.MaxFloat64, true // JS still has a (huge, finite) number
			case err != nil:
				return 0, false
			}
			return float64(n), true
		}
	}
	if !jsDecimal.MatchString(s) {
		return 0, false
	}
	f, _ := strconv.ParseFloat(s, 64) // out of range is ±Inf, as in JS
	return f, true
}

// dollarsToCents ports dollarsToCents: "$4,980.00" is 498000, "" is 0, anything that is not
// an amount (a third decimal, a minus, words) is refused (ok false). Parsed as digits, never
// through a float, so it is exact.
func dollarsToCents(input string) (int64, bool) {
	cleaned := stripMoney(input)
	if cleaned == "" {
		return 0, true
	}
	m := moneyAmount.FindStringSubmatch(cleaned)
	if m == nil {
		return 0, false
	}
	whole, err := strconv.ParseInt(m[1], 10, 64)
	if err != nil || whole > (1<<62)/100 {
		return 0, false
	}
	frac := m[2]
	for len(frac) < 2 {
		frac += "0"
	}
	f, _ := strconv.ParseInt(frac, 10, 64)
	return whole*100 + f, true
}

// stripMoney is dollarsToCents's /[$,\s]/g with JS's \s.
func stripMoney(input string) string {
	return strings.Map(func(r rune) rune {
		if r == '$' || r == ',' || jsSpace(r) {
			return -1
		}
		return r
	}, input)
}

// amountOverflows is a well-formed amount too large for int64 cents. Next's dollarsToCents
// returns a (huge) number for it, which the function then refuses; Go's refuses it outright,
// so a caller must not read that refusal as "not a number" where that changes the meaning.
func amountOverflows(input string) bool {
	if !moneyAmount.MatchString(stripMoney(input)) {
		return false
	}
	_, ok := dollarsToCents(input)
	return !ok
}

// centsToDollars ports centsToDollars: "4980.00". "" for a missing value.
func centsToDollars(c Cents, present bool) string {
	if !present {
		return ""
	}
	n := int64(c)
	sign := ""
	if n < 0 {
		sign, n = "-", -n
	}
	return sign + strconv.FormatInt(n/100, 10) + "." + leftPad2(n%100)
}

func leftPad2(n int64) string {
	if n < 10 {
		return "0" + strconv.FormatInt(n, 10)
	}
	return strconv.FormatInt(n, 10)
}

// The sheet's field errors (BUILDER_COPY).
const (
	copyNameRequired  = "Give it a name — it's the line the client reads."
	copyCostNotNumber = "That doesn't look like an amount."
	copyPctRange      = "A rate is between 0 and 999."
	copyEndBefore     = "That's before it starts."
	copyBuilderFailed = "That didn't save. Try again in a moment."
	copyBuilderStale  = "This trip changed in another tab. Reload and try again."
)

// validateComponent ports validateComponent; the map is field name to sentence.
func validateComponent(v componentValues) map[string]string {
	errs := map[string]string{}
	if v.displayName == "" {
		errs["displayName"] = copyNameRequired
	}
	if _, ok := dollarsToCents(v.cost); !ok {
		errs["cost"] = copyCostNotNumber
	}
	if _, ok := dollarsToCents(v.commission); !ok {
		errs["commission"] = copyCostNotNumber
	}
	if v.commissionPct != "" {
		pct, ok := numberJS(v.commissionPct)
		if !ok || math.IsInf(pct, 0) || pct < 0 || pct >= 1000 {
			errs["commissionPct"] = copyPctRange
		}
	}
	if s, e := v.cols["startDate"], v.cols["endDate"]; s != "" && e != "" && e < s {
		errs["endDate"] = copyEndBefore
	}
	return errs
}

// jsNumberString is String(Number(x)) for a numeric column: "10.50" reads "10.5".
func jsNumberString(n json.Number) string {
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil {
		return string(n)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// editValues ports the builder page's editValues: the stored row as the sheet wants it.
// The payload is jsonb with no schema: true is the "on" a checkbox posts, false and null are
// left out, a string is itself, anything else is shown as its JSON text.
func editValues(c componentRow) componentValues {
	kind := c.Kind
	if !isComponentKind(kind) {
		kind = "custom" // an enum value this form does not know: the shared columns and notes
	}
	v := componentValues{
		componentID: c.ComponentID, kind: kind, displayName: c.DisplayName,
		supplierID: deref(c.SupplierID), cols: map[string]string{}, detail: map[string]string{},
		cost: centsToDollars(c.CostCents, true),
	}
	v.cols["location"] = deref(c.Location)
	v.cols["startDate"] = deref(c.StartDate)
	v.cols["endDate"] = deref(c.EndDate)
	v.cols["startTime"] = hhmm(deref(c.StartTime))
	v.cols["endTime"] = hhmm(deref(c.EndTime))
	v.cols["confirmationNumber"] = deref(c.ConfirmationNumber)
	if c.CommissionPct != nil {
		v.commissionPct = jsNumberString(*c.CommissionPct)
	}
	// A zero commission with no rate behind it comes back blank, so the rate can still fill
	// it in on the next save; a deliberate zero beside a rate survives.
	if !(c.CommissionCents == 0 && (c.CommissionPct == nil || jsNumberString(*c.CommissionPct) == "0")) {
		v.commission = centsToDollars(c.CommissionCents, true)
	}
	var payload map[string]json.RawMessage
	if json.Unmarshal(c.Payload, &payload) == nil {
		for key, raw := range payload {
			switch s := strings.TrimSpace(string(raw)); {
			case s == "true":
				v.detail[key] = "on"
			case s == "false" || s == "null" || s == "":
			case strings.HasPrefix(s, `"`):
				var str string
				if json.Unmarshal(raw, &str) == nil {
					v.detail[key] = str
				}
			default:
				v.detail[key] = s
			}
		}
	}
	return v
}

// seedApplied is BUILDER_COPY.seedApplied.
func seedApplied(n int) string {
	if n > 0 {
		return "Seeded from a template — " + plural(n, "booking", "bookings") + " added. Adjust anything that does not fit."
	}
	return "The template added nothing. It has no bookings saved in it."
}
