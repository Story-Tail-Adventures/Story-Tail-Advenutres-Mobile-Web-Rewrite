package money

import (
	"encoding/json"
	"testing"
)

// The formatting these screens share, held to the browser's own output: Intl's en-US
// currency, Number.prototype.toFixed and Math.round. A figure that is a tenth of a point out
// is still wrong on a money screen.

func TestMoney(t *testing.T) {
	for _, c := range []struct {
		in    Cents
		whole string
		exact string
	}{
		{0, "$0", "$0"},
		{32400, "$324", "$324"},
		{118950, "$1,190", "$1,189.50"},
		{306818, "$3,068", "$3,068.18"},
		{-2558, "-$26", "-$25.58"},
		{123456789, "$1,234,568", "$1,234,567.89"},
		{40, "$0", "$0.40"},
	} {
		if got := money(c.in); got != c.whole {
			t.Errorf("money(%d) = %q, want %q", c.in, got, c.whole)
		}
		if got := moneyExact(c.in); got != c.exact {
			t.Errorf("moneyExact(%d) = %q, want %q", c.in, got, c.exact)
		}
	}
}

func TestCentsUnmarshal(t *testing.T) {
	var row struct {
		A Cents `json:"a"`
		B Cents `json:"b"`
		C Cents `json:"c"`
		D Cents `json:"d"`
		E Cents `json:"e"`
	}
	// The accessors cast bigint to text; a plain number and null are accepted too, and
	// anything that is not a finite number reads as zero rather than NaN on the screen.
	body := `{"a":"306818","b":306818,"c":null,"d":"","e":"not a number"}`
	if err := json.Unmarshal([]byte(body), &row); err != nil {
		t.Fatal(err)
	}
	if row.A != 306818 || row.B != 306818 || row.C != 0 || row.D != 0 || row.E != 0 {
		t.Fatalf("decoded %+v", row)
	}
	// Past 2^53, where a JSON number would have lost precision.
	var big struct {
		A Cents `json:"a"`
	}
	if err := json.Unmarshal([]byte(`{"a":"9007199254740993"}`), &big); err != nil {
		t.Fatal(err)
	}
	if big.A != 9007199254740993 {
		t.Fatalf("big amount decoded as %d", big.A)
	}
}

func TestRateUnmarshal(t *testing.T) {
	var row struct {
		A Rate `json:"a"`
		B Rate `json:"b"`
		C Rate `json:"c"`
		D Rate `json:"d"`
	}
	if err := json.Unmarshal([]byte(`{"a":12.5,"b":"12.50","c":null,"d":""}`), &row); err != nil {
		t.Fatal(err)
	}
	if !row.A.Set || row.A.Value != 12.5 {
		t.Errorf("a is %+v", row.A)
	}
	if !row.B.Set || row.B.Value != 12.5 {
		t.Errorf("b is %+v", row.B)
	}
	// Null stays null: no rate is not 0%, which on a tile would be a claim.
	if row.C.Set || row.D.Set {
		t.Errorf("an absent rate decoded as a figure: %+v %+v", row.C, row.D)
	}
}

func TestRateLabel(t *testing.T) {
	// Drops trailing zeros and keeps real decimals.
	for in, want := range map[float64]string{12: "12%", 12.5: "12.5%", 13.75: "13.75%", 0: "0%", 12.345: "12.35%"} {
		if got := rateLabel(in); got != want {
			t.Errorf("rateLabel(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestToFixed(t *testing.T) {
	// JS rounds a tie to the LARGER value, and decides on the double's own expansion: 12.25
	// is exactly a tie and goes up, 8.45 is really 8.4499999999999993 and goes down, and
	// 99.95 is a shade over and goes up. Every line here is node's own answer.
	for _, c := range []struct {
		in     float64
		places int
		want   string
	}{
		{12.1, 1, "12.1"},
		{12.25, 1, "12.3"},
		{8.45, 1, "8.4"},
		{0.04, 1, "0.0"},
		{12.04, 2, "12.04"},
		{0, 1, "0.0"},
		{99.95, 1, "100.0"},
		{2.675, 2, "2.67"},
		{1.005, 2, "1.00"},
		{12.1, 0, "12"},
	} {
		if got := toFixed(c.in, c.places); got != c.want {
			t.Errorf("toFixed(%v, %d) = %q, want %q", c.in, c.places, got, c.want)
		}
	}
}

func TestPercentChange(t *testing.T) {
	// No base to change from is no answer, never "+∞%" and never "−100%".
	if _, ok := percentChange(1000, 0); ok {
		t.Error("a zero base produced a change")
	}
	if _, ok := percentChange(0, -5); ok {
		t.Error("a negative base produced a change")
	}
	for _, c := range []struct {
		now, before Cents
		want        int
	}{
		{306818, 81794, 275},
		{50000, 100000, -50},
		{81794, 81794, 0},
	} {
		got, ok := percentChange(c.now, c.before)
		if !ok || got != c.want {
			t.Errorf("percentChange(%d, %d) = %d, %v; want %d", c.now, c.before, got, ok, c.want)
		}
	}
}

func TestDateLabels(t *testing.T) {
	// Read at noon UTC: midnight would land on Dec 31 for any reader west of Greenwich.
	if got := travelDateLabel("2027-01-01"); got != "Jan 1, 2027" {
		t.Errorf("travelDateLabel = %q", got)
	}
	if got := travelDateLabel(""); got != "" {
		t.Errorf("an absent date labelled as %q", got)
	}
	if got := travelDateLabel("2026-02-31"); got != "" {
		t.Errorf("a date that does not exist labelled as %q", got)
	}
	if got := monthShort("2026-06-01"); got != "Jun" {
		t.Errorf("monthShort = %q", got)
	}
	if got := monthLong("2026-10-01"); got != "October 2026" {
		t.Errorf("monthLong = %q", got)
	}
}

func TestCentsToDollars(t *testing.T) {
	for in, want := range map[Cents]string{1140000: "11400.00", 0: "0.00", 40: "0.40", -1250: "-12.50"} {
		if got := centsToDollars(in); got != want {
			t.Errorf("centsToDollars(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestParseIntJS(t *testing.T) {
	// Number.parseInt takes the leading digits and ignores the rest; "two" is NaN.
	for _, c := range []struct {
		in   string
		want int
		ok   bool
	}{
		{"3", 3, true},
		{" 42abc", 42, true},
		{"-3", -3, true},
		{"two", 0, false},
		{"", 0, false},
	} {
		got, ok := parseIntJS(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("parseIntJS(%q) = %d, %v; want %d, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}
