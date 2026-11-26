package onboarding

import (
	"regexp"
	"slices"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/onboarding_test.ts, one Go test per Deno.test. (That
// file has seven; `grep -c 'Deno.test'` says eight because its header comment reads "The first
// Deno test in the repo", which the unescaped dot matches.)
//
// OptionalPhone is a PARALLEL IMPLEMENTATION of normalizePhone in
// web/lib/validation/profile.ts, and a rule written twice is a rule that will eventually be
// two rules. The vectors below are the ones web/lib/validation/profile.test.ts asserts.

// phone is the Deno helper: optionalPhone({ phone: value }, "phone").
func phone(t *testing.T, value js.Value) (Optional, error) {
	t.Helper()
	return OptionalPhone(js.ObjectValue("phone", value), "phone", "phone")
}

// rejection is the detail of the 400 a call returned. The detail, not the title: the title is
// "Bad Request" for every one of these, so matching on it would pass whichever rule fired.
func rejection(t *testing.T, err error) string {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("want an HttpError, got %v", err)
	}
	return p.Detail
}

func value(t *testing.T, o Optional, err error) string {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	switch {
	case !o.Set:
		return "<undefined>"
	case o.Value == nil:
		return "<null>"
	}
	return *o.Value
}

// Deno.test("the tri-state survives: absent, null and empty are all distinct")
func TestTriStateSurvives(t *testing.T) {
	o, err := OptionalPhone(js.ObjectValue(), "phone", "phone")
	if got := value(t, o, err); got != "<undefined>" {
		t.Errorf("absent: %s", got)
	}
	o, err = phone(t, js.NullValue())
	if got := value(t, o, err); got != "<null>" {
		t.Errorf("null: %s", got)
	}
	o, err = phone(t, js.StringValue("   "))
	if got := value(t, o, err); got != "<null>" {
		t.Errorf("blank: %s", got)
	}
}

// Deno.test("normalises the formats people actually type")
func TestNormalisesFormats(t *testing.T) {
	for _, c := range [][2]string{
		{"+1 (305) 555-0184", "+13055550184"},
		{"(305) 555-0184", "+13055550184"},
		{"305.555.0184", "+13055550184"},
		{"1 305 555 0184", "+13055550184"},
		{"+44 20 7946 0958", "+442079460958"},
	} {
		o, err := phone(t, js.StringValue(c[0]))
		if got := value(t, o, err); got != c[1] {
			t.Errorf("%s: got %s, want %s", c[0], got, c[1])
		}
	}
}

// Deno.test("refuses ten digits that cannot ring anywhere")
func TestRefusesTenDigitsThatCannotRing(t *testing.T) {
	// A NANP area code and exchange code both begin 2-9. Guessing +1 at these would store a
	// well-formed number nobody could tell from a real one.
	notAPhone := regexp.MustCompile(`does not look like a phone number`)
	for _, in := range []string{"1234567890", "0234567890", "3050550184", "3051550184"} {
		_, err := phone(t, js.StringValue(in))
		if d := rejection(t, err); !notAPhone.MatchString(d) || d != "phone does not look like a phone number." {
			t.Errorf("%s: %q", in, d)
		}
	}
}

// Deno.test("asks for a country code rather than guessing at a foreign number")
func TestAsksForCountryCode(t *testing.T) {
	_, err := phone(t, js.StringValue("020 7946 0958"))
	if d := rejection(t, err); d != "phone needs a country code unless it is a US number." {
		t.Errorf("%q", d)
	}
}

// Deno.test("refuses what is not a phone number at all")
func TestRefusesWhatIsNotAPhone(t *testing.T) {
	for _, in := range []string{"not a phone", "+", "+1234", "+1234567890123456"} {
		_, err := phone(t, js.StringValue(in))
		if d := rejection(t, err); d != "phone does not look like a phone number." {
			t.Errorf("%s: %q", in, d)
		}
	}
}

// Deno.test("takes an explicit country code at its word")
func TestTakesExplicitCountryCode(t *testing.T) {
	// We guess only for North America; a +1 somebody typed is their claim to make.
	o, err := phone(t, js.StringValue("+11234567890"))
	if got := value(t, o, err); got != "+11234567890" {
		t.Errorf("got %s", got)
	}
}

// Deno.test("names the field it is complaining about")
func TestNamesTheField(t *testing.T) {
	// The nested emergency contact reuses the key `phone`, so the label is what tells a
	// traveler which of the two numbers on Screen 2.1.10 was rejected.
	_, err := OptionalPhone(js.ObjectValue("phone", js.StringValue("abc")), "phone", "The emergency contact's phone")
	if d := rejection(t, err); !regexp.MustCompile(`^The emergency contact's phone `).MatchString(d) {
		t.Errorf("%q", d)
	}
}

// Go-only (no Deno.test): the rest of the pure exports, which onboarding_test.ts does not
// cover. Every expected answer is what deno gave for onboarding.ts.
func TestGoOnlyOtherValidators(t *testing.T) {
	body := func(v js.Value) js.Value { return js.ObjectValue("c", v) }

	// toUpperCase's special casing: ß is SS and the Latin ligatures are two capitals, so
	// JavaScript accepted them as country codes. Go's strings.ToUpper keeps them as they are.
	for in, want := range map[string]string{
		"\U000000df": "SS", "\U0000fb00": "FF", "\U0000fb01": "FI", "\U0000fb02": "FL",
		"\U0000fb05": "ST", "\U0000fb06": "ST", "us": "US", "\U00000131s": "IS",
		"\U0000017fe": "SE", " gb ": "GB",
	} {
		o, err := OptionalCountry(body(js.StringValue(in)), "c")
		if got := value(t, o, err); got != want {
			t.Errorf("OptionalCountry(%q) = %s, want %s", in, got, want)
		}
	}
	for _, in := range []string{"\U0000fb03", "usa", "u"} {
		_, err := OptionalCountry(body(js.StringValue(in)), "c")
		if d := rejection(t, err); d != "c must be a two-letter country code." {
			t.Errorf("OptionalCountry(%q): %q", in, d)
		}
	}

	// JavaScript whitespace inside a phone number is dropped, U+00A0 and U+2003 included.
	o, err := phone(t, js.StringValue("+1\U000000a0305\U00002003555 0184"))
	if got := value(t, o, err); got != "+13055550184" {
		t.Errorf("phone with Unicode spaces: %s", got)
	}

	_, err = OptionalText(body(js.NumberValue(5)), "c")
	if d := rejection(t, err); d != "c must be a string or null." {
		t.Errorf("OptionalText(5): %q", d)
	}
	o, err = OptionalText(body(js.StringValue("\U0000feff hi \U000000a0")), "c")
	if got := value(t, o, err); got != "hi" {
		t.Errorf("OptionalText trims as JavaScript does: %q", got)
	}

	for in, want := range map[string]string{"2024-02-29": "2024-02-29", "0000-01-01": "0000-01-01"} {
		o, err := OptionalDate(body(js.StringValue(in)), "c")
		if got := value(t, o, err); got != want {
			t.Errorf("OptionalDate(%s) = %s", in, got)
		}
	}
	for in, want := range map[string]string{
		"2026-2-01":  "c must be a date in YYYY-MM-DD form.",
		"2026-02-30": "c is not a real date.",
		"2026-13-01": "c is not a real date.",
	} {
		_, err := OptionalDate(body(js.StringValue(in)), "c")
		if d := rejection(t, err); d != want {
			t.Errorf("OptionalDate(%s): %q", in, d)
		}
	}

	tags, set, err := OptionalTags(js.ObjectValue("t", js.ArrayValue(
		js.StringValue(" a "), js.StringValue("a"), js.StringValue(""), js.StringValue("b"))), "t", DefaultMaxTags, DefaultMaxTagLength)
	if err != nil || !set || !slices.Equal(tags, []string{"a", "b"}) {
		t.Errorf("OptionalTags dedupe: %v %v %v", tags, set, err)
	}
	tags, set, err = OptionalTags(js.ObjectValue("t", js.NullValue()), "t", DefaultMaxTags, DefaultMaxTagLength)
	if err != nil || !set || tags == nil || len(tags) != 0 {
		t.Errorf("OptionalTags(null) = %#v %v %v, want []", tags, set, err)
	}
	if _, set, err = OptionalTags(js.ObjectValue(), "t", DefaultMaxTags, DefaultMaxTagLength); err != nil || set {
		t.Errorf("OptionalTags(absent): set %v, %v", set, err)
	}
	for _, c := range []struct {
		v         js.Value
		max, maxL int
		want      string
	}{
		{js.StringValue("x"), 40, 60, "t must be an array."},
		{js.ArrayValue(js.StringValue("a"), js.NumberValue(1)), 40, 60, "t must contain only strings."},
		{js.ArrayValue(js.StringValue("a"), js.StringValue("b"), js.StringValue("c")), 2, 60, "t has too many entries."},
		{js.ArrayValue(js.StringValue("abc")), 40, 2, "An entry in t is too long."},
	} {
		_, _, err := OptionalTags(js.ObjectValue("t", c.v), "t", c.max, c.maxL)
		if d := rejection(t, err); d != c.want {
			t.Errorf("OptionalTags: %q, want %q", d, c.want)
		}
	}

	if got := NextStep("profile"); got == nil || *got != "preferences" {
		t.Errorf("NextStep(profile) = %v", got)
	}
	if got := NextStep("complete"); got != nil {
		t.Errorf("NextStep(complete) = %s", *got)
	}
	// indexOf answers -1 for a step it does not know, and STEPS[0] is next.
	if got := NextStep("bogus"); got == nil || *got != "profile" {
		t.Errorf("NextStep(bogus) = %v", got)
	}
	if !IsStep(js.StringValue("connect")) || IsStep(js.StringValue("Connect")) || IsStep(js.NullValue()) {
		t.Error("IsStep")
	}

	id := "0195a2c0-1a00-7000-8000-000000000013"
	if got, err := RequireClientID(&caller.Context{Role: caller.RoleClient, ClientID: &id}); err != nil || got != id {
		t.Errorf("RequireClientID(client) = %q, %v", got, err)
	}
	_, err = RequireClientID(&caller.Context{Role: caller.RoleAgent})
	if d := rejection(t, err); d != "Requires role: client." {
		t.Errorf("agent: %q", d)
	}
	_, err = RequireClientID(&caller.Context{Role: caller.RoleClient})
	if d := rejection(t, err); d != "This account is not linked to a traveler record." {
		t.Errorf("unlinked client: %q", d)
	}
}
