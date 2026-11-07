package js

import (
	"math"
	"testing"
	"time"
)

// Every expectation below was printed by Deno 2.9 (V8), the runtime the functions ran on.

func TestTrimMatchesV8(t *testing.T) {
	cases := map[string]string{
		"  a  ":                 "a",
		"\U0000FEFFx\U0000FEFF": "x",
		"\u0085y\u0085":         "\u0085y\u0085", // NEL is not JavaScript whitespace
		"\U000000A0z\U00003000": "z",
		"\U0000200Bq":           "\U0000200Bq", // zero-width space is not either
		"\t\n\v\f\r x \r\n":     "x",
	}
	for in, want := range cases {
		if got := Trim(in); got != want {
			t.Errorf("Trim(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLenCountsUTF16Units(t *testing.T) {
	for in, want := range map[string]int{"abc": 3, "\U000000E9": 1, "\U0001F600": 2, "a\U0001F600b": 4, "": 0} {
		if got := Len(in); got != want {
			t.Errorf("Len(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestSlice(t *testing.T) {
	cases := []struct {
		s          string
		start, end int
		want       string
	}{
		{"hello\U0001F600world", 0, 6, "hello\U0000FFFD"}, // V8 leaves a lone surrogate; Go cannot
		{"hello", -3, 5, "llo"},
		{"hello", 2, 1, ""},
		{"abc", 0, 10, "abc"},
		{"h\U000000E9llo", 1, 3, "\U000000E9l"},
	}
	for _, c := range cases {
		if got := Slice(c.s, c.start, c.end); got != c.want {
			t.Errorf("Slice(%q,%d,%d) = %q, want %q", c.s, c.start, c.end, got, c.want)
		}
	}
}

func TestRound(t *testing.T) {
	in := []float64{-2.5, 2.5, 0.49999999999999994, -0.5, 1.4999, 1234.5}
	want := []float64{-2, 3, 0, 0, 1, 1235}
	for i := range in {
		if got := Round(in[i]); got != want[i] {
			t.Errorf("Round(%v) = %v, want %v", in[i], got, want[i])
		}
	}
}

func TestToFixed(t *testing.T) {
	cases := []struct {
		f    float64
		d    int
		want string
	}{
		{0.125, 2, "0.13"}, {2.5, 0, "3"}, {-2.5, 0, "-3"}, {1.005, 2, "1.00"}, {10, 2, "10.00"},
		{0.0001, 2, "0.00"}, {-0.004, 2, "-0.00"}, {123.456, 1, "123.5"}, {1e21, 2, "1e+21"},
		{0.5, 0, "1"}, {1.45, 1, "1.4"}, {math.Copysign(0, -1), 2, "0.00"},
	}
	for _, c := range cases {
		if got := ToFixed(c.f, c.d); got != c.want {
			t.Errorf("ToFixed(%v,%d) = %q, want %q", c.f, c.d, got, c.want)
		}
	}
}

func TestToNumber(t *testing.T) {
	in := []string{" 12 ", "", "0x1f", "1_0", "1e3", ".5", "5.", "+.5e1", "Infinity", "-0x1", "abc", "1e400", "0b101", "  -3.5e-2\n", "12px"}
	want := []string{"12", "0", "31", "NaN", "1000", "0.5", "5", "5", "Infinity", "NaN", "NaN", "Infinity", "5", "-0.035", "NaN"}
	for i := range in {
		if got := NumberString(ToNumber(in[i])); got != want[i] {
			t.Errorf("Number(%q) = %s, want %s", in[i], got, want[i])
		}
	}
}

func TestNumberString(t *testing.T) {
	tenth, fifth := 0.1, 0.2 // variables, or Go folds the sum exactly to 0.3
	in := []float64{1e21, 1e-7, 1.5e-7, 123456789012345680000, 0.000001, math.Copysign(0, -1), tenth + fifth, 100, 1e300, -1.5}
	want := []string{"1e+21", "1e-7", "1.5e-7", "123456789012345680000", "0.000001", "0", "0.30000000000000004", "100", "1e+300", "-1.5"}
	for i := range in {
		if got := NumberString(in[i]); got != want[i] {
			t.Errorf("String(%v) = %s, want %s", in[i], got, want[i])
		}
	}
}

func TestMarshalIsJSONStringify(t *testing.T) {
	v := O(
		"a", "<&>\U00002028\U00002029\u0000\u001f\b\t\u007f\\\"\U000000E9\U0001F600",
		"n", []any{Num(math.Copysign(0, -1)), Num(1e21), Num(1e-7), Num(math.NaN()), Num(math.Inf(1)), 5},
		"skip", Undef,
	)
	got, err := Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	want := "{\"a\":\"<&>\U00002028\U00002029\\u0000\\u001f\\b\\t\u007f\\\\\\\"\U000000E9\U0001F600\",\"n\":[0,1e+21,1e-7,null,null,5]}"
	if string(got) != want {
		t.Errorf("Marshal =\n %s\nwant\n %s", got, want)
	}
}

// encoding/json's escapes are undone even when a nested value marshalled itself with plain
// json.Marshal, but a literal backslash-u in the text survives.
func TestMarshalUndoesOnlyRealEscapes(t *testing.T) {
	type row struct {
		Name string `json:"name"`
	}
	got, _ := Marshal(map[string]any{"r": row{Name: "<b> & \\u003c"}})
	want := `{"r":{"name":"<b> & \\u003c"}}`
	if string(got) != want {
		t.Errorf("got %s want %s", got, want)
	}
}

func TestParseKeepsJavaScriptSemantics(t *testing.T) {
	v, err := Parse([]byte("\xef\xbb\xbf {\"b\":1,\"a\":2,\"b\":3,\"n\":1e400,\"z\":-0} "))
	if err != nil {
		t.Fatal(err)
	}
	o, _ := v.Object()
	if got := o.Keys(); len(got) != 4 || got[0] != "b" || got[1] != "a" {
		t.Errorf("keys = %v, want b first (first position, last value)", got)
	}
	if n, _ := v.Get("b").Num(); n != 3 {
		t.Errorf("b = %v, want 3", n)
	}
	if n, _ := v.Get("n").Num(); !math.IsInf(n, 1) {
		t.Errorf("1e400 = %v, want Infinity", n)
	}
	if !v.Get("missing").IsUndefined() || v.Get("missing").TypeOf() != "undefined" {
		t.Error("a missing key must be undefined")
	}
	for _, bad := range []string{"", "{", "{} {}", "{'a':1}", "[1,]", "NaN"} {
		if _, err := Parse([]byte(bad)); err == nil {
			t.Errorf("Parse(%q) accepted", bad)
		}
	}
	for _, notObj := range []string{"null", "[]", "1", `"x"`} {
		if _, err := ParseObject([]byte(notObj)); err == nil {
			t.Errorf("ParseObject(%q) accepted", notObj)
		}
	}
	round, _ := Marshal(v)
	if string(round) != `{"b":3,"a":2,"n":null,"z":0}` {
		t.Errorf("round trip = %s", round)
	}
}

func TestSafeInt(t *testing.T) {
	for _, c := range []struct {
		in string
		ok bool
	}{{"1", true}, {"1.0", true}, {"1.5", false}, {"9007199254740991", true}, {"9007199254740992", false}, {"\"1\"", false}, {"-3", true}} {
		v, _ := Parse([]byte(c.in))
		if _, ok := v.SafeInt(); ok != c.ok {
			t.Errorf("SafeInt(%s) ok = %v", c.in, ok)
		}
	}
}

func TestRegexpSpaceIsJavaScriptSpace(t *testing.T) {
	re := Regexp(`[\s().-]`, "")
	if re.ReplaceAllString("(555) 123-4567\U000000A0x\U0000FEFF", "") != "5551234567x" {
		t.Errorf("class \\s missed Unicode space: %q", re.ReplaceAllString("(555) 123-4567\U000000A0x\U0000FEFF", ""))
	}
	if !Regexp(`^\s+$`, "").MatchString("\U00003000\U00002028") || Regexp(`^\s+$`, "").MatchString("\u0085") {
		t.Error("bare \\s must match JavaScript whitespace only")
	}
	if !Regexp(`^re:`, "i").MatchString("RE: hi") {
		t.Error("flags not applied")
	}
}

func TestParseDateMatchesV8(t *testing.T) {
	cases := map[string]string{
		"2026-02-30":                  "2026-03-02T00:00:00.000Z",
		"2026-02-30T00:00:00Z":        "2026-03-02T00:00:00.000Z",
		"2026-02-29":                  "2026-03-01T00:00:00.000Z",
		"2026-01-05T10:00:00.123456Z": "2026-01-05T10:00:00.123Z",
		"2026-01-05T10:00:00+05:30":   "2026-01-05T04:30:00.000Z",
		"2026-01-05T24:00:00Z":        "2026-01-06T00:00:00.000Z",
		"+002026-01-05":               "2026-01-05T00:00:00.000Z",
		"2026":                        "2026-01-01T00:00:00.000Z",
		"2026-01":                     "2026-01-01T00:00:00.000Z",
		"2026-01-05T10:00":            "2026-01-05T10:00:00.000Z", // local time; the Edge runtime ran in UTC
	}
	for in, want := range cases {
		got, ok := ParseDate(in)
		if !ok || ISOString(got) != want {
			t.Errorf("ParseDate(%q) = %v %v, want %s", in, ISOString(got), ok, want)
		}
	}
	for _, bad := range []string{"2026-13-01", "2026-02-32", "nope", "2026-01-05T25:00:00Z"} {
		if _, ok := ParseDate(bad); ok {
			t.Errorf("ParseDate(%q) accepted", bad)
		}
	}
	if ISOString(time.Date(2026, 11, 6, 1, 2, 3, 0, time.FixedZone("x", 3600))) != "2026-11-06T00:02:03.000Z" {
		t.Error("ISOString must be UTC with milliseconds")
	}
}

// JavaScript lists integer-like keys first, ascending, then the rest in insertion order.
func TestObjectKeyOrderIsJavaScripts(t *testing.T) {
	v, _ := Parse([]byte(`{"b":1,"10":2,"a":3,"2":4,"01":5,"4294967295":6}`))
	o, _ := v.Object()
	got := o.Keys()
	want := []string{"2", "10", "b", "a", "01", "4294967295"}
	for i := range want {
		if i >= len(got) || got[i] != want[i] {
			t.Fatalf("keys = %v, want %v", got, want)
		}
	}
	b, _ := Marshal(v)
	if string(b) != `{"2":4,"10":2,"b":1,"a":3,"01":5,"4294967295":6}` {
		t.Errorf("stringify = %s", b)
	}
}

// "İ".toLowerCase() is "i" plus a combining dot in JavaScript, never a plain "i".
func TestToLowerDottedCapitalI(t *testing.T) {
	if got := ToLower("\U00000130STANBUL"); got != "i\U00000307stanbul" {
		t.Errorf("ToLower = %q", got)
	}
	if ToLower("ABC") != "abc" {
		t.Error("plain ASCII")
	}
}
