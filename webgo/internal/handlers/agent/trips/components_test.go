package trips

import (
	"encoding/json"
	"math"
	"net/url"
	"regexp"
	"slices"
	"testing"
)

// Ported from web/lib/agent/components.test.ts, plus the builder page's editValues.

func TestTheSevenKinds(t *testing.T) {
	if !slices.Equal(componentKinds, []string{"flight", "hotel", "cruise", "transfer", "excursion", "insurance", "custom"}) {
		t.Errorf("kinds = %v", componentKinds)
	}
	rail := slices.Clone(componentRail)
	kinds := slices.Clone(componentKinds)
	slices.Sort(rail)
	slices.Sort(kinds)
	if !slices.Equal(rail, kinds) {
		t.Errorf("the rail is not every kind once: %v", componentRail)
	}
	snake := regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
	for _, k := range componentKinds {
		spec := componentSpecs[k]
		if spec.nameLabel == "" || !slices.ContainsFunc(spec.detail, func(f detailField) bool { return f.key == "notes" }) {
			t.Errorf("%s needs a name label and notes", k)
		}
		seen := map[string]bool{}
		for _, f := range spec.detail {
			if !snake.MatchString(f.key) || seen[f.key] {
				t.Errorf("%s detail key %q", k, f.key)
			}
			seen[f.key] = true
		}
	}
	if componentKindFromParam("dining") != "" || componentKindFromParam("flight") != "flight" || componentKindFromParam("") != "" {
		t.Error("componentKindFromParam")
	}
}

func TestNoColumnCanGoMissing(t *testing.T) {
	cols := slices.Clone(componentColumns)
	slices.Sort(cols)
	if !slices.Equal(cols, []string{"confirmationNumber", "endDate", "endTime", "location", "startDate", "startTime"}) {
		t.Errorf("columns = %v", componentColumns)
	}
	f := url.Values{"kind": {"flight"}, "displayName": {"AA 1413 · MIA → MBJ"}, "location": {"Miami International Airport"},
		"startDate": {"2026-12-04"}, "endDate": {"2026-12-05"}, "startTime": {"23:40"}, "endTime": {"06:30"}, "confirmationNumber": {"TLR8QV"}}
	v := componentFromForm(f)
	for _, c := range componentColumns {
		if v.cols[c] != f.Get(c) {
			t.Errorf("%s = %q", c, v.cols[c])
		}
	}
}

func TestDollarsToCents(t *testing.T) {
	ok := map[string]int64{"4980": 498000, "4980.00": 498000, "4980.5": 498050, "0": 0, "": 0,
		"$4,980.00": 498000, "  4 980 ": 498000, "4980.10": 498010, "0.07": 7, "1.15": 115, "2.67": 267,
		// JS's \s, not Go's: a no-break space, a narrow one, a vertical tab and a BOM.
		"4\u00a0980.00": 498000, "4\u202f980": 498000, "\v12": 1200, "\ufeff12": 1200}
	for in, want := range ok {
		if got, okk := dollarsToCents(in); !okk || got != want {
			t.Errorf("dollarsToCents(%q) = %d %v, want %d", in, got, okk, want)
		}
	}
	for _, bad := range []string{"4980.005", "four thousand", "4.9.8", "-50", "99999999999999999999999"} {
		if _, okk := dollarsToCents(bad); okk {
			t.Errorf("dollarsToCents(%q) accepted", bad)
		}
	}
	for _, c := range []int64{0, 7, 498000, 498010, 999999999} {
		if got, _ := dollarsToCents(centsToDollars(Cents(c), true)); got != c {
			t.Errorf("round trip %d = %d", c, got)
		}
	}
	if centsToDollars(0, false) != "" {
		t.Error("a missing value is blank")
	}
}

func TestValidateComponent(t *testing.T) {
	base := emptyComponent("flight")
	base.displayName = "American Airlines"
	with := func(f func(*componentValues)) componentValues {
		v := base
		v.cols = map[string]string{}
		f(&v)
		return v
	}
	if e := validateComponent(with(func(v *componentValues) { v.cost, v.commissionPct = "462.00", "12" })); len(e) != 0 {
		t.Errorf("a filled-in flight: %v", e)
	}
	cases := map[string]componentValues{
		"displayName":   with(func(v *componentValues) { v.displayName = "" }),
		"cost":          with(func(v *componentValues) { v.cost = "lots" }),
		"commission":    with(func(v *componentValues) { v.commission = "lots" }),
		"commissionPct": with(func(v *componentValues) { v.commissionPct = "1000" }),
		"endDate":       with(func(v *componentValues) { v.cols["startDate"], v.cols["endDate"] = "2026-08-19", "2026-08-12" }),
	}
	for field, v := range cases {
		if e := validateComponent(v); e[field] == "" {
			t.Errorf("%s not caught: %v", field, e)
		}
	}
	if e := validateComponent(with(func(v *componentValues) { v.commissionPct = "-1" })); e["commissionPct"] == "" {
		t.Error("-1 rate")
	}
	if e := validateComponent(with(func(v *componentValues) { v.commissionPct = "999.99" })); len(e) != 0 {
		t.Error("999.99 rate refused")
	}
	// Number(), not strconv.ParseFloat: what JS reads as NaN or Infinity is refused, what it
	// reads as a number is checked as one.
	for _, pct := range []string{"NaN", "nan", "0x1p4", "Infinity", "inf", "1_0", "1,5", "abc", "0x", "+-1"} {
		if e := validateComponent(with(func(v *componentValues) { v.commissionPct = pct })); e["commissionPct"] == "" {
			t.Errorf("rate %q accepted", pct)
		}
	}
	for _, pct := range []string{"0x10", " 12 ", ".5", "5.", "1e2", "+7", "-0", "0b11", "0o7"} {
		if e := validateComponent(with(func(v *componentValues) { v.commissionPct = pct })); len(e) != 0 {
			t.Errorf("rate %q refused", pct)
		}
	}
	if e := validateComponent(with(func(v *componentValues) { v.cols["startDate"], v.cols["endDate"] = "2026-08-12", "2026-08-12" })); len(e) != 0 {
		t.Error("a one-day component")
	}
}

func TestNumberJS(t *testing.T) {
	ok := map[string]float64{"": 0, "  ": 0, "12": 12, " 12 ": 12, "\u00a012\ufeff": 12, ".5": 0.5, "5.": 5,
		"1e3": 1000, "-1.5E-1": -0.15, "+7": 7, "0x1F": 31, "0X10": 16, "0b101": 5, "0o17": 15, "007": 7}
	for in, want := range ok {
		if got, okk := numberJS(in); !okk || got != want {
			t.Errorf("numberJS(%q) = %v %v, want %v", in, got, okk, want)
		}
	}
	for _, bad := range []string{"NaN", "inf", "infinity", "0x1p4", "1_000", "-0x10", "0x", "1e", "e5", ".", "1.2.3", "１２"} {
		if _, okk := numberJS(bad); okk {
			t.Errorf("numberJS(%q) is a number", bad)
		}
	}
	if f, okk := numberJS("-Infinity"); !okk || !math.IsInf(f, -1) {
		t.Error("-Infinity")
	}
	if f, okk := numberJS("1e999"); !okk || !math.IsInf(f, 1) {
		t.Error("1e999 is Infinity in JS")
	}
}

func TestComponentFromForm(t *testing.T) {
	v := componentFromForm(url.Values{"kind": {"flight"}, "displayName": {"American Airlines"}, "detail.seat": {"14A, 14B"}, "detail.ship": {"Symphony"}})
	if len(v.detail) != 1 || v.detail["seat"] != "14A, 14B" {
		t.Errorf("detail = %v", v.detail)
	}
	if componentFromForm(url.Values{"kind": {"dining"}}).kind != "custom" {
		t.Error("unknown kind")
	}
	if _, on := componentFromForm(url.Values{"kind": {"cruise"}}).detail["gratuities_included"]; on {
		t.Error("an unticked checkbox was read")
	}
	if componentFromForm(url.Values{"kind": {"cruise"}, "detail.gratuities_included": {"on"}}).detail["gratuities_included"] != "on" {
		t.Error("a ticked checkbox")
	}
	v = componentFromForm(url.Values{"kind": {"custom"}, "displayName": {"  Welcome bottle  "}, "location": {" In-room "}})
	if v.displayName != "Welcome bottle" || v.cols["location"] != "In-room" {
		t.Errorf("not trimmed: %+v", v)
	}
}

func TestEditValues(t *testing.T) {
	pct := json.Number("10.50")
	zero := json.Number("0")
	row := componentRow{ComponentID: "k", Kind: "cruise", DisplayName: "RCL", StartTime: ptr("15:00:00"),
		CostCents: 498010, CommissionPct: &pct, CommissionCents: 49801,
		Payload: json.RawMessage(`{"ship":"Symphony","gratuities_included":true,"cabin":null,"deck":9,"x":false}`)}
	v := editValues(row)
	if v.cost != "4980.10" || v.commissionPct != "10.5" || v.commission != "498.01" || v.cols["startTime"] != "15:00" {
		t.Errorf("values = %+v", v)
	}
	if v.detail["ship"] != "Symphony" || v.detail["gratuities_included"] != "on" || v.detail["deck"] != "9" {
		t.Errorf("detail = %v", v.detail)
	}
	if _, ok := v.detail["cabin"]; ok {
		t.Error("null kept")
	}
	// A zero commission with no rate comes back blank; beside a rate it stays a zero.
	if v := editValues(componentRow{Kind: "flight", CommissionCents: 0}); v.commission != "" {
		t.Errorf("zero with no rate = %q", v.commission)
	}
	if v := editValues(componentRow{Kind: "flight", CommissionCents: 0, CommissionPct: &zero}); v.commission != "" {
		t.Errorf("zero with a zero rate = %q", v.commission)
	}
	if v := editValues(componentRow{Kind: "flight", CommissionCents: 0, CommissionPct: &pct}); v.commission != "0.00" {
		t.Errorf("deliberate zero = %q", v.commission)
	}
	if editValues(componentRow{Kind: "zeppelin"}).kind != "custom" {
		t.Error("unknown kind")
	}
	if seedApplied(6) != "Seeded from a template — 6 bookings added. Adjust anything that does not fit." || seedApplied(0) != "The template added nothing. It has no bookings saved in it." {
		t.Error("seedApplied")
	}
}

func ptr(s string) *string { return &s }
