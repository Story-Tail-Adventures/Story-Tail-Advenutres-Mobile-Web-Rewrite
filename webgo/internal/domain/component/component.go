// Package component ports supabase/functions/_shared/component.ts: §3.4.5 – §3.4.12's forms,
// validated.
//
// THIS PACKAGE IS THE PRICE OF THE JSONB RULING. Data-Model §23 settled on 2026-09-27 that
// trip_component.payload stays jsonb and no subtype tables are added, and stated the cost:
// Postgres will not stop a malformed payload; the validation lives in the Edge Function. This
// is that validation. If it is wrong, nothing downstream is going to catch it.
//
// UNKNOWN KEYS ARE REFUSED, NOT DROPPED. A dropped key is a silent gap: the advisor types a
// cabin number, the save succeeds, the field comes back empty, and nothing says why. A refused
// key is a 400 the first time anybody saves, which keeps this list and the form that feeds it
// in step by construction rather than by a parity script.
//
// WHAT IS A COLUMN AND WHAT IS PAYLOAD. §23's boundary: anything a query needs (filtered,
// sorted, summed, joined) is a column; payload is detail a screen renders and nothing
// aggregates. Dates, times, place, confirmation number, cost and commission are columns on
// trip_component and appear nowhere here. A field that starts here and later needs filtering
// is a migration, not a reinterpretation of the jsonb.
//
// Everything in component.ts is pure, so everything is ported.
package component

import (
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Kinds are the seven component_kind values, exactly (COMPONENT_KINDS).
var Kinds = []string{"flight", "hotel", "cruise", "transfer", "excursion", "insurance", "custom"}

// payloadField is one payload key: free text up to max UTF-16 units, or a flag (true or
// absent).
type payloadField struct {
	key  string
	flag bool
	max  int
}

func text(key string, max int) payloadField { return payloadField{key: key, max: max} }

func flag(key string) payloadField { return payloadField{key: key, flag: true} }

// payloadFields is the per-kind payload keys. THE WEB FORM'S FIELD LIST MUST MATCH THIS, kind
// for kind: web/lib/agent/components.ts holds the other copy.
//
// snake_case, matching every other jsonb in this schema. The first draft used camelCase and
// the mismatch was silent in the worst way: the edit sheet showed blank fields over a seeded
// component that HAD the data, and saving would have replaced the payload with the empty set.
//
// notes is on every kind: leaving it off one would push the note into display_name, the row
// title on the proposal a client reads.
//
// dining IS NOT A KIND. §23 ruled a dinner reservation is a custom component, and that ruling
// is honoured by this list's shape: there is no dining entry to fall through to.
//
// Keys deliberately absent because a column already holds the fact: airline/provider
// (supplier_id, display_name), origin/destination/meeting_point (location), policy_number
// (confirmation_number), nights (start_date to end_date), rate_cents_per_night (money belongs
// in a column; this one had already drifted four cents from cost_cents), duration_hours /
// _minutes (one duration, written the way an advisor says it). The 2026-09-28
// normalise_component_payload migration moved existing rows onto this shape.
var payloadFields = map[string][]payloadField{
	"flight": {
		text("flight_number", 20),
		text("cabin", 60),
		text("seat", 80),
		text("notes", 2000),
	},
	"hotel": {
		text("room_type", 160),
		text("board_basis", 80),
		text("notes", 2000),
	},
	"cruise": {
		text("ship", 120),
		text("itinerary_name", 160),
		text("cabin", 60),
		text("dining_seating", 60),
		flag("gratuities_included"),
		text("notes", 2000),
	},
	"transfer": {
		text("dropoff", 200),
		text("vehicle", 120),
		text("notes", 2000),
	},
	"excursion": {
		text("duration", 60),
		text("notes", 2000),
	},
	"insurance": {
		text("plan", 120),
		text("coverage", 160),
		text("notes", 2000),
	},
	"custom": {
		text("notes", 2000),
	},
}

// IsKind is isComponentKind.
func IsKind(value js.Value) bool {
	s, ok := value.Str()
	if !ok {
		return false
	}
	for _, k := range Kinds {
		if k == s {
			return true
		}
	}
	return false
}

// RequireKind is requireComponentKind: the kind, or a 400.
func RequireKind(value js.Value) (string, error) {
	if !IsKind(value) {
		return "", problem.BadRequest("kind must be one of " + strings.Join(Kinds, ", ") + ".")
	}
	s, _ := value.Str()
	return s, nil
}

// ReadPayload is readComponentPayload: the kind's payload, or a 400.
//
// An absent key and an empty string are both "not filled in" and both come back ABSENT, never
// as "". agent_upsert_trip_component compares the whole stored payload against the incoming
// one to decide noop, so {} and {"notes": ""} differing would make every save of an untouched
// form look like a real edit, bump updated_at, and re-run the totals trigger for nothing.
//
// The result holds strings and true, keys in the order the request sent them.
func ReadPayload(kind string, raw js.Value) (js.Ordered, error) {
	if raw.IsNullish() {
		return js.Ordered{}, nil
	}
	obj, ok := raw.Object()
	if !ok {
		return nil, problem.BadRequest("Component detail must be an object.")
	}

	fields := payloadFields[kind]
	out := js.Ordered{}
	for _, key := range propertyOrder(obj) {
		value := obj.Get(key)
		field, known := fieldFor(fields, key)
		if !known {
			// Named, not generic. The advisor cannot act on this (it is a drift between the
			// form and this list), so the sentence is for whoever reads the log.
			return nil, problem.BadRequest(`"` + key + `" is not a field on a ` + kind + ` component.`)
		}

		if field.flag {
			if b, isBool := value.Bool(); value.IsNullish() || (isBool && !b) {
				continue
			}
			if !value.IsTrue() {
				return nil, problem.BadRequest(`"` + key + `" must be true or false.`)
			}
			out = append(out, js.Field{Key: key, Value: true})
			continue
		}

		if value.IsNullish() || isEmptyString(value) {
			continue
		}
		s, isString := value.Str()
		if !isString {
			return nil, problem.BadRequest(`"` + key + `" must be text.`)
		}
		trimmed := js.Trim(s)
		if trimmed == "" {
			continue
		}
		if js.Len(trimmed) > field.max {
			return nil, problem.BadRequest(`"` + key + `" is too long.`)
		}
		out = append(out, js.Field{Key: key, Value: trimmed})
	}
	return out, nil
}

func fieldFor(fields []payloadField, key string) (payloadField, bool) {
	for _, f := range fields {
		if f.key == key {
			return f, true
		}
	}
	return payloadField{}, false
}

// PayloadKeysFor is payloadKeysFor: every payload key a kind accepts. Exported for the test,
// and for nothing else.
func PayloadKeysFor(kind string) []string {
	fields := payloadFields[kind]
	keys := make([]string, len(fields))
	for i, f := range fields {
		keys[i] = f.key
	}
	return keys
}

var timeShape = regexp.MustCompile(`^(\d{2}):(\d{2})(?::(\d{2}))?$`)

// ReadTime is readTime: HH:MM:SS, or nil for blank.
//
// <input type="time"> submits HH:MM, and Postgres accepts both, but it also accepts "25:00" as
// an error rather than a value, so the ranges are checked here where the message can say which
// field. The shape test alone passes "99:99".
func ReadTime(value js.Value, field string) (*string, error) {
	if value.IsNullish() || isEmptyString(value) {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(field + " must be a time.")
	}
	m := timeShape.FindStringSubmatch(js.Trim(s))
	if m == nil {
		return nil, problem.BadRequest(field + " must be a time like 14:30.")
	}
	sec := m[3] // "" when the optional group did not take part, which JavaScript calls undefined
	if sec == "" {
		sec = "00"
	}
	h, _ := strconv.Atoi(m[1])
	mins, _ := strconv.Atoi(m[2])
	secs, _ := strconv.Atoi(sec)
	if h > 23 || mins > 59 || secs > 59 {
		return nil, problem.BadRequest(field + " is not a real time.")
	}
	out := m[1] + ":" + m[2] + ":" + sec
	return &out, nil
}

var centsShape = regexp.MustCompile(`^-?\d{1,10}$`)

// ReadCents is readCents: cents from a JSON number or a digit-string; 0 for blank.
//
// BOTH FORMS ARE ACCEPTED because both are what callers have. The web's cents() hands back
// digit-strings, the convention adopted after PostgREST was caught serialising bigint as a
// JSON number and losing precision. The ceiling removes the precision risk on the way in: ten
// digits is $100,000,000, far under Number.MAX_SAFE_INTEGER and far over any component anyone
// will ever book. A figure above it is a typo or an attack, and either way not a cost.
func ReadCents(value js.Value, field string) (int64, error) {
	if value.IsNullish() || isEmptyString(value) {
		return 0, nil
	}

	var n float64
	if num, ok := value.Num(); ok {
		n = num
	} else if s, ok := value.Str(); ok {
		if !centsShape.MatchString(js.Trim(s)) {
			return 0, problem.BadRequest(field + " must be a number.")
		}
		n = js.ToNumber(js.Trim(s))
	} else {
		return 0, problem.BadRequest(field + " must be a number.")
	}

	if !js.IsSafeInteger(n) {
		return 0, problem.BadRequest(field + " must be a whole number of cents.")
	}
	if n < 0 {
		return 0, problem.BadRequest(field + " cannot be negative.")
	}
	if n > 9_999_999_999 {
		return 0, problem.BadRequest(field + " is too large.")
	}
	return int64(n), nil
}

// ReadCommissionPct is readCommissionPct: numeric(5,2), so 0 through 999.99 rounded to two
// decimals, or nil for blank.
//
// Out of range is a 400 rather than a cast error from Postgres, which arrives as a bodyless
// 500 and reads like the server broke. A non-number goes through String(value) and Number()
// as in JavaScript, so [5] reads as 5 and [] as 0, exactly as the Deno function read them.
func ReadCommissionPct(value js.Value) (*float64, error) {
	if value.IsNullish() || isEmptyString(value) {
		return nil, nil
	}

	n, ok := value.Num()
	if !ok {
		n = js.ToNumber(js.Trim(jsString(value)))
	}
	if !js.IsFinite(n) {
		return nil, problem.BadRequest("Commission % must be a number.")
	}
	if n < 0 {
		return nil, problem.BadRequest("Commission % cannot be negative.")
	}
	if n >= 1000 {
		return nil, problem.BadRequest("Commission % is too large.")
	}
	// Rounded rather than refused: a rate typed as 12.505 is a third decimal nobody meant,
	// and bouncing the whole sheet over it would be pedantic.
	rounded := js.Round(n*100) / 100
	return &rounded, nil
}

// ResolveCommissionCents is resolveCommissionCents: commission_cents, derived from the rate
// ONLY when the advisor left the amount blank.
//
// WHY BOTH COLUMNS EXIST: plenty of supplier commissions are not a clean percentage of what
// the client pays (a flat fee, a rate on the fare but not port charges, a bonus). If the
// amount were always computed, the advisor could not record what they will actually be paid.
//
// WHY IT IS DERIVED ANYWAY WHEN EMPTY: the common case IS the percentage, and asking for
// mental arithmetic on every component leaves commission_cents at 0 on every row.
//
// The rule: TYPE AN AMOUNT AND IT WINS; LEAVE IT BLANK WITH A RATE SET AND THE RATE FILLS IT
// IN. An explicit 0 is an amount and wins too.
func ResolveCommissionCents(costCents int64, commissionPct *float64, explicit js.Value) (int64, error) {
	if !explicit.IsNullish() && !isEmptyString(explicit) {
		return ReadCents(explicit, "Commission")
	}
	if commissionPct == nil || *commissionPct == 0 {
		return 0, nil
	}
	// Rounded to the cent, Math.round as JavaScript does it. Both inputs are non-negative.
	return int64(js.Round(float64(costCents) * *commissionPct / 100)), nil
}

func isEmptyString(v js.Value) bool {
	s, ok := v.Str()
	return ok && s == ""
}

// jsString is String(value). The js package has no ToString for a Value; this is the
// private copy.
func jsString(v js.Value) string {
	switch v.Kind() {
	case js.Undefined:
		return "undefined"
	case js.Null:
		return "null"
	case js.Bool:
		b, _ := v.Bool()
		return strconv.FormatBool(b)
	case js.Number:
		n, _ := v.Num()
		return js.NumberString(n)
	case js.String:
		s, _ := v.Str()
		return s
	case js.Array:
		items, _ := v.Array()
		parts := make([]string, len(items))
		for i, item := range items {
			if !item.IsNullish() {
				parts[i] = jsString(item)
			}
		}
		return strings.Join(parts, ",")
	default:
		return "[object Object]"
	}
}

// propertyOrder is the order Object.entries walks an object's own keys in: array-index keys
// ("0" to "4294967294", written canonically) first in numeric order, then every other key in
// insertion order. js.Obj keeps plain insertion order; the two differ only when a body mixes a
// numeric key in, and then this decides which bad key the 400 names, as it did in Deno.
func propertyOrder(o *js.Obj) []string {
	keys := o.Keys()
	var index, named []string
	for _, k := range keys {
		if isArrayIndex(k) {
			index = append(index, k)
		} else {
			named = append(named, k)
		}
	}
	if len(index) == 0 {
		return keys
	}
	// Canonical indices sort numerically by length first, then text.
	slices.SortFunc(index, func(a, b string) int {
		if len(a) != len(b) {
			return len(a) - len(b)
		}
		return strings.Compare(a, b)
	})
	return append(index, named...)
}

func isArrayIndex(k string) bool {
	if k == "0" {
		return true
	}
	if k == "" || len(k) > 10 || k[0] < '1' || k[0] > '9' {
		return false
	}
	for i := 0; i < len(k); i++ {
		if k[i] < '0' || k[i] > '9' {
			return false
		}
	}
	n, err := strconv.ParseUint(k, 10, 64)
	return err == nil && n <= 4294967294
}
