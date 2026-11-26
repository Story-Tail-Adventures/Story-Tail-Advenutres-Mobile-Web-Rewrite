package component

import (
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/component_test.ts, one Go test per Deno.test.
//
// Data-Model §23 traded database-level validation of trip_component.payload for one table and
// no seven-arm unions, and named the Edge Function as the place the validation would live
// instead. This file is the whole of the enforcement the trade gave up: there is no CHECK
// constraint behind it and no type to fall back on.

func parse(t *testing.T, src string) js.Value {
	t.Helper()
	v, err := js.Parse([]byte(src))
	if err != nil {
		t.Fatalf("bad test JSON %s: %v", src, err)
	}
	return v
}

// want400 is assertThrows(fn, HttpError), pinned to the sentence the source throws.
func want400(t *testing.T, err error, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("want a 400 %q, got %v", detail, err)
	}
	if p.Status != 400 || p.Detail != detail {
		t.Fatalf("want 400 %q, got %d %q", detail, p.Status, p.Detail)
	}
}

func payloadJSON(t *testing.T, kind string, raw js.Value) string {
	t.Helper()
	out, err := ReadPayload(kind, raw)
	if err != nil {
		t.Fatalf("ReadPayload(%s): %v", kind, err)
	}
	b, err := js.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func cents(t *testing.T, v js.Value, field string) int64 {
	t.Helper()
	n, err := ReadCents(v, field)
	if err != nil {
		t.Fatalf("ReadCents: %v", err)
	}
	return n
}

func resolve(t *testing.T, cost int64, pct *float64, explicit js.Value) int64 {
	t.Helper()
	n, err := ResolveCommissionCents(cost, pct, explicit)
	if err != nil {
		t.Fatalf("ResolveCommissionCents: %v", err)
	}
	return n
}

func pct(f float64) *float64 { return &f }

// Deno.test("seven kinds, matching component_kind exactly")
func TestSevenKinds(t *testing.T) {
	want := []string{"flight", "hotel", "cruise", "transfer", "excursion", "insurance", "custom"}
	if !slices.Equal(Kinds, want) {
		t.Fatalf("Kinds = %v", Kinds)
	}
}

// Deno.test("dining is not a kind — §23 sends it to custom")
func TestDiningIsNotAKind(t *testing.T) {
	// The prototype draws A3410_AddDining and the builder rail lists "Dining · manual". If
	// anyone ever adds it here without adding the enum value, this is where it stops.
	_, err := RequireKind(js.StringValue("dining"))
	want400(t, err, "kind must be one of flight, hotel, cruise, transfer, excursion, insurance, custom.")
}

// Deno.test("every kind carries notes")
func TestEveryKindCarriesNotes(t *testing.T) {
	for _, kind := range Kinds {
		if !slices.Contains(PayloadKeysFor(kind), "notes") {
			t.Errorf("%s has no notes field: a note with nowhere to go lands in display_name, "+
				"which is the row title a client reads on the proposal", kind)
		}
	}
}

// Deno.test("every payload key is snake_case, like every other jsonb here")
func TestPayloadKeysAreSnakeCase(t *testing.T) {
	// The first draft was camelCase and did not match the rows already in the table. The
	// edit sheet rendered blank over a component that had the data, and a save would have
	// written the empty set over it.
	snake := regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
	for _, kind := range Kinds {
		for _, key := range PayloadKeysFor(kind) {
			if !snake.MatchString(key) {
				t.Errorf("%s.%s is not snake_case", kind, key)
			}
		}
	}
}

// Deno.test("no payload key duplicates a column")
func TestNoPayloadKeyDuplicatesAColumn(t *testing.T) {
	// §23's boundary, executable: anything a QUERY needs is a column. A payload key by the
	// same name as a trip_component column would mean two places holding one fact.
	columns := []string{
		"kind", "display_name", "supplier_id", "start_date", "end_date", "start_time",
		"end_time", "location", "confirmation_number", "cost_cents", "commission_pct",
		"commission_cents", "currency", "order_index", "api_source", "api_reference",
	}
	for _, kind := range Kinds {
		for _, key := range PayloadKeysFor(kind) {
			if slices.Contains(columns, key) {
				t.Errorf("%s.%s is already a column on trip_component", kind, key)
			}
		}
	}
}

// Deno.test("an unknown key is refused, not dropped")
func TestUnknownKeyIsRefused(t *testing.T) {
	// The whole reason unknown keys throw: a dropped key saves clean and comes back empty.
	_, err := ReadPayload("flight", parse(t, `{"flight_number":"AA 1413","cabin2":"x"}`))
	want400(t, err, `"cabin2" is not a field on a flight component.`)
	// And a key that is real for a DIFFERENT kind is still not real for this one.
	_, err = ReadPayload("flight", parse(t, `{"ship":"Symphony"}`))
	want400(t, err, `"ship" is not a field on a flight component.`)
}

// Deno.test("empty and absent both come back absent")
func TestEmptyAndAbsentComeBackAbsent(t *testing.T) {
	// agent_upsert_trip_component decides noop by comparing the whole stored payload to the
	// incoming one. If "" and absent differed, every save of an untouched form would read as
	// a real edit, bump updated_at, and re-run the totals trigger for nothing.
	for _, raw := range []js.Value{
		parse(t, `{}`),
		parse(t, `{"notes":""}`),
		parse(t, `{"notes":"   "}`),
		js.UndefinedValue(),
		js.NullValue(),
	} {
		if got := payloadJSON(t, "custom", raw); got != "{}" {
			t.Errorf("got %s, want {}", got)
		}
	}
}

// Deno.test("text is trimmed, and length is capped")
func TestTextIsTrimmedAndCapped(t *testing.T) {
	if got := payloadJSON(t, "flight", parse(t, `{"seat":"  14A, 14B  "}`)); got != `{"seat":"14A, 14B"}` {
		t.Fatalf("got %s", got)
	}
	_, err := ReadPayload("flight", js.ObjectValue("seat", js.StringValue(strings.Repeat("A", 81))))
	want400(t, err, `"seat" is too long.`)
}

// Deno.test("a flag is true or absent — never the string \"false\"")
func TestFlagIsTrueOrAbsent(t *testing.T) {
	if got := payloadJSON(t, "cruise", parse(t, `{"gratuities_included":true}`)); got != `{"gratuities_included":true}` {
		t.Fatalf("got %s", got)
	}
	if got := payloadJSON(t, "cruise", parse(t, `{"gratuities_included":false}`)); got != `{}` {
		t.Fatalf("got %s", got)
	}
	// A string here means the form sent a raw field value instead of a boolean, and "false"
	// is truthy, which is exactly the bug this refuses.
	_, err := ReadPayload("cruise", parse(t, `{"gratuities_included":"false"}`))
	want400(t, err, `"gratuities_included" must be true or false.`)
}

// Deno.test("a payload is an object, not an array")
func TestPayloadIsAnObject(t *testing.T) {
	_, err := ReadPayload("custom", parse(t, `["notes"]`))
	want400(t, err, "Component detail must be an object.")
	_, err = ReadPayload("custom", js.StringValue("notes"))
	want400(t, err, "Component detail must be an object.")
}

// Deno.test("times are range-checked, not just shape-checked")
func TestTimesAreRangeChecked(t *testing.T) {
	for in, want := range map[string]string{"14:30": "14:30:00", "14:30:15": "14:30:15"} {
		got, err := ReadTime(js.StringValue(in), "Start time")
		if err != nil || got == nil || *got != want {
			t.Errorf("ReadTime(%q) = %v, %v; want %q", in, got, err, want)
		}
	}
	for _, blank := range []js.Value{js.StringValue(""), js.NullValue()} {
		if got, err := ReadTime(blank, "Start time"); err != nil || got != nil {
			t.Errorf("ReadTime(blank) = %v, %v; want nil", got, err)
		}
	}
	// /^\d{2}:\d{2}$/ passes the first two. Postgres would reject them as an error, not a
	// value, and the 500 would read as the server breaking.
	_, err := ReadTime(js.StringValue("25:00"), "Start time")
	want400(t, err, "Start time is not a real time.")
	_, err = ReadTime(js.StringValue("14:99"), "Start time")
	want400(t, err, "Start time is not a real time.")
	_, err = ReadTime(js.StringValue("2:30 PM"), "Start time")
	want400(t, err, "Start time must be a time like 14:30.")
}

// Deno.test("cents accept both a number and a digit-string")
func TestCentsAcceptNumberAndDigitString(t *testing.T) {
	if got := cents(t, js.NumberValue(498000), "Cost"); got != 498000 {
		t.Errorf("number: %d", got)
	}
	if got := cents(t, js.StringValue("498000"), "Cost"); got != 498000 {
		t.Errorf("string: %d", got)
	}
	if got := cents(t, js.StringValue(""), "Cost"); got != 0 {
		t.Errorf("blank: %d", got)
	}
	if got := cents(t, js.UndefinedValue(), "Cost"); got != 0 {
		t.Errorf("absent: %d", got)
	}
	_, err := ReadCents(js.NumberValue(-1), "Cost")
	want400(t, err, "Cost cannot be negative.")
	_, err = ReadCents(js.NumberValue(4980.5), "Cost")
	want400(t, err, "Cost must be a whole number of cents.")
	_, err = ReadCents(js.StringValue("4,980"), "Cost")
	want400(t, err, "Cost must be a number.")
	// Ten digits is $100,000,000. Above that is a typo or an attack, not a cost.
	_, err = ReadCents(js.NumberValue(10_000_000_000), "Cost")
	want400(t, err, "Cost is too large.")
}

// Deno.test("commission % fits numeric(5,2)")
func TestCommissionPctFitsNumeric52(t *testing.T) {
	for _, c := range []struct {
		in   js.Value
		want float64
	}{
		{js.NumberValue(15), 15},
		{js.StringValue("12.5"), 12.5},
		// Rounded, not refused: a third decimal is nobody's intent.
		{js.NumberValue(12.505), 12.51},
	} {
		got, err := ReadCommissionPct(c.in)
		if err != nil || got == nil || *got != c.want {
			t.Errorf("ReadCommissionPct(%v) = %v, %v; want %v", c.in, got, err, c.want)
		}
	}
	for _, blank := range []js.Value{js.StringValue(""), js.NullValue()} {
		if got, err := ReadCommissionPct(blank); err != nil || got != nil {
			t.Errorf("ReadCommissionPct(blank) = %v, %v; want nil", got, err)
		}
	}
	_, err := ReadCommissionPct(js.NumberValue(-1))
	want400(t, err, "Commission % cannot be negative.")
	// 1000 does not fit numeric(5,2). Refusing here makes it a 400 instead of SQLSTATE
	// 22003 arriving as a bodyless 500.
	_, err = ReadCommissionPct(js.NumberValue(1000))
	want400(t, err, "Commission % is too large.")
	_, err = ReadCommissionPct(js.StringValue("fifteen"))
	want400(t, err, "Commission % must be a number.")
}

// Deno.test("a typed commission amount wins over the rate")
func TestTypedCommissionAmountWins(t *testing.T) {
	if got := resolve(t, 498000, pct(12), js.NumberValue(50000)); got != 50000 {
		t.Errorf("number: %d", got)
	}
	if got := resolve(t, 498000, pct(12), js.StringValue("50000")); got != 50000 {
		t.Errorf("string: %d", got)
	}
	// An explicit 0 is an amount, not a blank: how an advisor records a component they earn
	// nothing on without having to clear the rate as well.
	if got := resolve(t, 498000, pct(12), js.NumberValue(0)); got != 0 {
		t.Errorf("zero: %d", got)
	}
}

// Deno.test("a blank commission amount is derived from the rate")
func TestBlankCommissionIsDerived(t *testing.T) {
	for _, blank := range []js.Value{js.UndefinedValue(), js.StringValue(""), js.NullValue()} {
		if got := resolve(t, 498000, pct(12), blank); got != 59760 {
			t.Errorf("blank %v: %d", blank, got)
		}
	}
	// Rounded to the cent rather than truncated.
	if got := resolve(t, 333, pct(10), js.StringValue("")); got != 33 {
		t.Errorf("333 @ 10%%: %d", got)
	}
	if got := resolve(t, 335, pct(10), js.StringValue("")); got != 34 {
		t.Errorf("335 @ 10%%: %d", got)
	}
}

// Deno.test("no rate and no amount is zero, not a guess")
func TestNoRateNoAmountIsZero(t *testing.T) {
	if got := resolve(t, 498000, nil, js.StringValue("")); got != 0 {
		t.Errorf("no rate: %d", got)
	}
	if got := resolve(t, 498000, pct(0), js.StringValue("")); got != 0 {
		t.Errorf("zero rate: %d", got)
	}
	if got := resolve(t, 0, pct(12), js.StringValue("")); got != 0 {
		t.Errorf("zero cost: %d", got)
	}
}

// Go-only (no Deno.test): JavaScript behaviour the port keeps that no Deno test pins.
// Verified with deno against component.ts. A numeric key is walked first, as Object.entries
// does, so it is the one the 400 names; a non-number rate goes through String() and Number().
func TestGoOnlyJavaScriptCoercions(t *testing.T) {
	_, err := ReadPayload("custom", parse(t, `{"notes":5,"7":"x"}`))
	want400(t, err, `"7" is not a field on a custom component.`)

	for src, want := range map[string]float64{`[]`: 0, `[5]`: 5, `[[7]]`: 7, `[null]`: 0, `" 12.5 "`: 12.5, `"1e1"`: 10} {
		got, err := ReadCommissionPct(parse(t, src))
		if err != nil || got == nil || *got != want {
			t.Errorf("ReadCommissionPct(%s) = %v, %v; want %v", src, got, err, want)
		}
	}
	for _, src := range []string{`["1","2"]`, `true`, `{}`} {
		_, err := ReadCommissionPct(parse(t, src))
		want400(t, err, "Commission % must be a number.")
	}
}
