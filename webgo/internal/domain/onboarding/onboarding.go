// Package onboarding ports the pure half of supabase/functions/_shared/onboarding.ts: the
// parts every Screen Inventory §2.1.9-2.1.14 onboarding endpoint needs.
//
// Six screens write through five functions, and every one has to prove the caller is a
// client, find the client row they own, advance the wizard cursor, and refuse anything that
// names somebody else's row. Doing that in five files is how one of them ends up subtly
// different.
//
// The optional* readers take the request body (a js.Value object) and answer an Optional,
// which keeps JavaScript's three states apart: absent (leave it alone), null (clear it), or a
// value. The Deno body was always an object by the time they ran; on a non-object, where
// JavaScript's `key in body` threw, Go reads the key as absent.
//
// Not ported here (needs the database / network; ported with its function):
//   - advanceOnboarding: moves platform_user.onboarding_step on. Completing clears the
//     cursor and stamps onboarding_completed_at (the two are mutually exclusive in the
//     database), and only where onboarding_completed_at is null, so a double-submit does not
//     rewrite when somebody joined.
//   - onboardingDb: serviceClient() under a name. These tables have SELECT-only RLS for
//     authenticated users by design (client is audited, platform_user carries role,
//     travel_document and companion hold encrypted fields), so the scoping RLS would have done
//     is done explicitly by RequireClientID.
//   - readJson: ported elsewhere with the request plumbing (400 "Expected a JSON object.").
package onboarding

import (
	"regexp"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Steps are the wizard's steps, in order. Must match the onboarding_step CHECK constraint:
// the database refuses a typo; this decides what comes next. complete is 2.1.14, the
// summary; reaching it is not the same as finishing.
var Steps = []string{
	"profile",     // 2.1.10
	"preferences", // 2.1.11
	"companions",  // 2.1.12
	"connect",     // 2.1.13
	"complete",    // 2.1.14
}

// IsStep is isOnboardingStep.
func IsStep(value js.Value) bool {
	s, ok := value.Str()
	return ok && indexOf(s) >= 0
}

// NextStep is nextStep: the step after step, or nil when there is none left. Like indexOf, a
// step it does not know counts as -1, so the answer is the first step.
func NextStep(step string) *string {
	i := indexOf(step) + 1
	if i >= len(Steps) {
		return nil
	}
	next := Steps[i]
	return &next
}

func indexOf(step string) int {
	for i, s := range Steps {
		if s == step {
			return i
		}
	}
	return -1
}

// RequireClientID is onboarding.ts's requireClientId: the client row this caller owns, or a
// 403 (a different sentence from trip's).
//
// Every onboarding write is scoped by this and never by an id from the request body. A
// function that accepted a client_id would be an IDOR with a friendly name: these run as the
// service role, so RLS is not there to catch the mistake.
func RequireClientID(c *caller.Context) (string, error) {
	if err := caller.RequireRole(c, caller.RoleClient); err != nil {
		return "", err
	}
	if c.ClientID == nil || *c.ClientID == "" {
		return "", problem.Forbidden("This account is not linked to a traveler record.")
	}
	return *c.ClientID, nil
}

// Optional is a body field's three states, as `string | null | undefined`: Set false is
// absent (leave the column alone), Set with a nil Value is null (clear it), and otherwise the
// value.
type Optional struct {
	Set   bool
	Value *string
}

// OrNull is `?? null`: the value, or nil when absent or null.
func (o Optional) OrNull() *string { return o.Value }

// JS is the field as a patch value: js.Undef when absent (JSON.stringify leaves the key out),
// nil for null, the string otherwise.
func (o Optional) JS() any {
	switch {
	case !o.Set:
		return js.Undef
	case o.Value == nil:
		return nil
	}
	return *o.Value
}

var (
	absent   = Optional{}
	cleared  = Optional{Set: true}
	present  = func(s string) Optional { return Optional{Set: true, Value: &s} }
	isoShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// OptionalText is optionalText: a trimmed string, or null.
//
// The tri-state matters and is easy to lose: a key that is ABSENT means "leave this alone",
// an explicit null means "clear it", and "" is treated as clearing too: an emptied input is a
// person removing a value, not a person sending nothing.
func OptionalText(body js.Value, key string) (Optional, error) {
	if !body.Has(key) {
		return absent, nil
	}
	value := body.Get(key)
	if value.IsNull() {
		return cleared, nil
	}
	s, ok := value.Str()
	if !ok {
		return absent, problem.BadRequest(key + " must be a string or null.")
	}
	trimmed := js.Trim(s)
	if trimmed == "" {
		return cleared, nil
	}
	return present(trimmed), nil
}

// OptionalDate is optionalDate: an ISO date (YYYY-MM-DD), or null. Rejects anything Postgres
// would reject anyway.
func OptionalDate(body js.Value, key string) (Optional, error) {
	o, err := OptionalText(body, key)
	if err != nil || o.Value == nil {
		return o, err
	}
	value := *o.Value
	if !isoShape.MatchString(value) {
		return absent, problem.BadRequest(key + " must be a date in YYYY-MM-DD form.")
	}
	// Catches 2026-02-30, which the shape is happy with.
	parsed, ok := js.ParseDate(value + "T00:00:00Z")
	if !ok || !strings.HasPrefix(js.ISOString(parsed), value) {
		return absent, problem.BadRequest(key + " is not a real date.")
	}
	return o, nil
}

var (
	phoneShape = regexp.MustCompile(`^\+?\d+$`)
	// nanp: area code and exchange code both begin 2-9 in the North American plan.
	nanp = regexp.MustCompile(`^[2-9]\d{2}[2-9]\d{6}$`)
)

// OptionalPhone is optionalPhone: a phone number as E.164, or null. label is what to call the
// field in an error (the Deno default was the key); nested objects reuse the key "phone".
//
// PARALLEL IMPLEMENTATION of normalizePhone in web/lib/validation/profile.ts. This endpoint is
// reachable without the form, so the rule cannot live only there; Data-Model §6.1 specifies
// E.164 and no column enforces it. A number that already carries a + is taken as given, a
// bare North American ten digits is assumed American because the practice is, and anything
// else is refused rather than mangled. If either side changes, change both.
func OptionalPhone(body js.Value, key, label string) (Optional, error) {
	o, err := OptionalText(body, key)
	if err != nil || o.Value == nil {
		return o, err
	}

	// value.replace(/[\s().-]/g, ""), with JavaScript's \s.
	cleaned := strings.Map(func(r rune) rune {
		if js.IsSpace(r) || r == '(' || r == ')' || r == '.' || r == '-' {
			return -1
		}
		return r
	}, *o.Value)
	if !phoneShape.MatchString(cleaned) {
		return absent, problem.BadRequest(label + " does not look like a phone number.")
	}
	// cleaned is ASCII from here on, so len counts what .length counted.

	if strings.HasPrefix(cleaned, "+") {
		digits := cleaned[1:]
		// E.164 caps the whole number at 15 digits; the shortest real one is seven.
		if len(digits) < 7 || len(digits) > 15 {
			return absent, problem.BadRequest(label + " does not look like a phone number.")
		}
		return present("+" + digits), nil
	}

	// The +1 guess is CHECKED, not assumed: "1234567890" is ten digits that cannot ring
	// anywhere and would be stored as a well-formed +11234567890.
	national := cleaned
	if len(cleaned) == 11 && strings.HasPrefix(cleaned, "1") {
		national = cleaned[1:]
	}
	if len(national) != 10 {
		return absent, problem.BadRequest(label + " needs a country code unless it is a US number.")
	}
	if !nanp.MatchString(national) {
		return absent, problem.BadRequest(label + " does not look like a phone number.")
	}
	return present("+1" + national), nil
}

var countryShape = regexp.MustCompile(`^[A-Z]{2}$`)

// OptionalCountry is optionalCountry: a two-letter ISO 3166-1 country code, uppercased, or
// null.
func OptionalCountry(body js.Value, key string) (Optional, error) {
	o, err := OptionalText(body, key)
	if err != nil || o.Value == nil {
		return o, err
	}
	upper := toUpperJS(*o.Value)
	if !countryShape.MatchString(upper) {
		return absent, problem.BadRequest(key + " must be a two-letter country code.")
	}
	return present(upper), nil
}

// specialUpper are toUpperCase's unconditional SpecialCasing mappings that end in Latin
// capitals: ß and the Latin ligatures. strings.ToUpper (and so js.ToUpper) leaves them as
// they are. Every other special mapping yields a non-Latin letter or a combining mark, which
// the [A-Z]{2} test refuses either way, so these are all this file needs.
var specialUpper = strings.NewReplacer(
	"\U000000df", "SS",
	"\U0000fb00", "FF",
	"\U0000fb01", "FI",
	"\U0000fb02", "FL",
	"\U0000fb03", "FFI",
	"\U0000fb04", "FFL",
	"\U0000fb05", "ST",
	"\U0000fb06", "ST",
)

func toUpperJS(s string) string { return js.ToUpper(specialUpper.Replace(s)) }

// DefaultMaxTags and DefaultMaxTagLength are optionalTags' defaults ({ max = 40,
// maxLength = 60 }); a caller that passed only one option kept the other default.
const (
	DefaultMaxTags      = 40
	DefaultMaxTagLength = 60
)

// OptionalTags is optionalTags: a list of short free-text tags, the chip pickers on 2.1.11.
// set is false when the key is absent (undefined); null reads as an empty list.
func OptionalTags(body js.Value, key string, max, maxLength int) (tags []string, set bool, err error) {
	if !body.Has(key) {
		return nil, false, nil
	}
	value := body.Get(key)
	if value.IsNull() {
		return []string{}, true, nil
	}
	items, ok := value.Array()
	if !ok {
		return nil, false, problem.BadRequest(key + " must be an array.")
	}
	if len(items) > max {
		return nil, false, problem.BadRequest(key + " has too many entries.")
	}

	out := []string{}
	for _, entry := range items {
		s, isString := entry.Str()
		if !isString {
			return nil, false, problem.BadRequest(key + " must contain only strings.")
		}
		trimmed := js.Trim(s)
		if trimmed == "" {
			continue
		}
		if js.Len(trimmed) > maxLength {
			return nil, false, problem.BadRequest("An entry in " + key + " is too long.")
		}
		// Deduplicated here rather than in the database: these are text[] columns with no
		// constraint, and a chip list that shows "Caribbean" twice looks broken.
		if !slices.Contains(out, trimmed) {
			out = append(out, trimmed)
		}
	}
	return out, true, nil
}
