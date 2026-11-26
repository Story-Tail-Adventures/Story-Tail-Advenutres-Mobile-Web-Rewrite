package money

import (
	"testing"
)

// The line and payment forms' parsing and validation — a port of what
// web/lib/agent/commissionForm.test.ts pins, plus the cases the TypeScript gets right only
// because JavaScript rounds for it.

func TestDollarsToCents(t *testing.T) {
	for _, c := range []struct {
		in    string
		want  Cents
		valid bool
	}{
		{"", 0, true}, // a blank is ZERO here; validateLine is what refuses it
		{"0", 0, true},
		{"6480.00", 648000, true},
		{"$6,480.00", 648000, true},
		{" 6480 ", 648000, true},
		{"0.07", 7, true}, // Number("0.07")*100 is 7.000000000000001 in JS
		{"1189.5", 118950, true},
		{"1189.50", 118950, true},
		{"6480.001", 0, false},
		{"007.00", 700, true}, // leading zeros are digits the value does not have
		// AN AMOUNT THAT WOULD NOT FIT IS REFUSED, which the TypeScript never has to do: a JS
		// number keeps growing and the Edge Function rejects it, where an int64 WRAPS. These
		// two came out as 0 and as a negative, and a $0 line saved as a deliberate one.
		{"184467440737095516.16", 0, false},
		{"92233720368547758.08", 0, false},
		{"9223372036854775807", 0, false},
		{"999999999999999.99", 99999999999999999, true}, // fifteen whole digits still fits
		{"-5", 0, false},
		{"abc", 0, false},
		{".5", 0, false},
		{"5.", 0, false},
	} {
		got, ok := dollarsToCents(c.in)
		if ok != c.valid || (ok && got != c.want) {
			t.Errorf("dollarsToCents(%q) = %d, %v; want %d, %v", c.in, got, ok, c.want, c.valid)
		}
	}
}

func TestParseRateAndLag(t *testing.T) {
	for _, c := range []struct {
		in    string
		want  float64
		valid bool
	}{
		{"12", 12, true},
		{"12.5", 12.5, true},
		{"12.50", 12.5, true},
		{"12.5%", 12.5, true},
		{" 12.5 ", 12.5, true},
		{"100", 100, true},
		{"0", 0, true},
		{"100.01", 0, false},
		{"101", 0, false},
		{"12.555", 0, false},
		{"-1", 0, false},
		{"", 0, false},
	} {
		got, ok := parseRate(c.in)
		if ok != c.valid || (ok && got != c.want) {
			t.Errorf("parseRate(%q) = %v, %v; want %v, %v", c.in, got, ok, c.want, c.valid)
		}
	}
	for _, c := range []struct {
		in    string
		want  int
		valid bool
	}{
		{"0", 0, true}, {"60", 60, true}, {"365", 365, true}, {" 60 ", 60, true},
		{"366", 0, false}, {"", 0, false}, {"-1", 0, false}, {"1.5", 0, false}, {"1000", 0, false},
	} {
		got, ok := parseLagDays(c.in)
		if ok != c.valid || (ok && got != c.want) {
			t.Errorf("parseLagDays(%q) = %d, %v; want %d, %v", c.in, got, ok, c.want, c.valid)
		}
	}
}

func TestValidateLine(t *testing.T) {
	good := lineValues{SupplierID: "s1", Gross: "6480.00", Rate: "12.5", PaymentLagDays: "60", PaymentTerms: "after_travel", Status: "expected"}
	if errs := validateLine(good); errs != nil {
		t.Fatalf("a complete line was refused: %v", errs)
	}

	// A BLANK gross is refused rather than saved as a deliberate $0, which is the whole
	// reason dollarsToCents("") answering 0 is not enough on its own.
	blank := good
	blank.Gross = ""
	if errs := validateLine(blank); errs == nil || errs["gross"] == "" {
		t.Error("a blank gross was accepted as $0")
	}
	// A TYPED zero is still a real line: a booking can earn nothing.
	zero := good
	zero.Gross = "0"
	if errs := validateLine(zero); errs != nil {
		t.Errorf("a typed $0 was refused: %v", errs)
	}

	bad := lineValues{}
	errs := validateLine(bad)
	for _, f := range []string{"supplierId", "gross", "rate", "paymentLagDays"} {
		if errs[f] == "" {
			t.Errorf("an empty form said nothing about %q", f)
		}
	}
}

func TestValidatePayment(t *testing.T) {
	good := paymentValues{Status: "received", Received: "1190.00", Fee: "12.00", ReceivedAt: "2027-02-21"}
	if errs := validatePayment(good); errs != nil {
		t.Fatalf("a complete payment was refused: %v", errs)
	}

	// Received with nothing received is a Disputed line wearing the wrong status.
	none := good
	none.Received = "0"
	if errs := validatePayment(none); errs["received"] != copyReceivedNeedsAmount {
		t.Errorf("a $0 Received said %q", errs["received"])
	}
	none.Status = "disputed"
	if errs := validatePayment(none); errs != nil {
		t.Errorf("a $0 Disputed was refused: %v", errs)
	}

	blank := good
	blank.Received = ""
	if errs := validatePayment(blank); errs["received"] != copyAmountInvalid {
		t.Error("a blank amount was read as $0")
	}

	for _, date := range []string{"", "2027-2-21", "21/02/2027", "2027-02-21T00:00:00Z"} {
		bad := good
		bad.ReceivedAt = date
		if errs := validatePayment(bad); errs["receivedAt"] == "" {
			t.Errorf("%q passed as a date", date)
		}
	}
}

func TestPreviews(t *testing.T) {
	// Expected is gross × rate, rounded once, in cents.
	for _, c := range []struct {
		gross, rate string
		want        Cents
		ok          bool
	}{
		{"6480.00", "12.5", 81000, true},
		{"1095.00", "12.5", 13688, true}, // 136875 hundredths of a cent: half rounds UP
		{"0", "12.5", 0, true},
		{"6480.00", "", 0, false},
		{"", "12.5", 0, true}, // a blank gross is $0, which multiplies to $0
	} {
		got, ok := previewExpectedCents(c.gross, c.rate)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("previewExpectedCents(%q, %q) = %d, %v; want %d, %v", c.gross, c.rate, got, ok, c.want, c.ok)
		}
	}

	// The gap is expected − fee − received, the expression §3.7.6 reconciles on.
	for _, c := range []struct {
		received, fee string
		want          Cents
	}{
		{"1190.00", "12.00", 81000 - 1200 - 119000},
		{"810.00", "0", 0},
		{"900.00", "0", -9000},
	} {
		got, ok := previewGapCents(81000, c.received, c.fee)
		if !ok || got != c.want {
			t.Errorf("previewGapCents(81000, %q, %q) = %d, %v; want %d", c.received, c.fee, got, ok, c.want)
		}
	}
	if _, ok := previewGapCents(81000, "lots", "0"); ok {
		t.Error("a gap was worked out from something that is not a number")
	}
}

func TestEditStatusOptions(t *testing.T) {
	values := func(opts []option) []string {
		out := make([]string, len(opts))
		for i, o := range opts {
			out[i] = o.Value
		}
		return out
	}
	base := []string{"expected", "invoiced", "lost"}
	for _, c := range []struct {
		current string
		want    []string
	}{
		{"expected", base},
		{"invoiced", base},
		{"lost", base},
		// A paid line KEEPS its status as an option, so editing its notes cannot move it.
		{"received", append(append([]string{}, base...), "received")},
		{"disputed", append(append([]string{}, base...), "disputed")},
	} {
		got := values(editStatusOptions(c.current))
		if len(got) != len(c.want) {
			t.Fatalf("editStatusOptions(%q) = %v", c.current, got)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("editStatusOptions(%q) = %v, want %v", c.current, got, c.want)
				break
			}
		}
	}
	// Moving TO a paid status is the payment form's job, never this picker's.
	for _, o := range editStatusOptions("expected") {
		if o.Value == "received" || o.Value == "disputed" {
			t.Errorf("the edit picker offers %q", o.Value)
		}
	}
}

func TestGroupAndFlattenSuppliers(t *testing.T) {
	rows := []supplierCatalogRow{
		{SupplierID: "a1", Name: "Delta", Kind: "airline"},
		{SupplierID: "a2", Name: "United", Kind: "airline"},
		{SupplierID: "r1", Name: "Sandals", Kind: "resort"},
		{SupplierID: "x1", Name: "Something", Kind: "newfangled"},
	}
	groups := groupSuppliers(rows)
	if len(groups) != 3 {
		t.Fatalf("%d groups", len(groups))
	}
	// The accessor's own order is kept, not the label map's.
	if groups[0].KindLabel != "Airlines" || groups[1].KindLabel != "Resorts" {
		t.Errorf("groups are %q, %q", groups[0].KindLabel, groups[1].KindLabel)
	}
	// A kind the map does not know shows up as itself rather than as a crash.
	if groups[2].KindLabel != "newfangled" {
		t.Errorf("an unknown kind is labelled %q", groups[2].KindLabel)
	}

	picks := flattenSuppliers(groups)
	want := []supplierPick{
		{Label: "Airlines", Header: true},
		{Value: "a1", Label: "Delta"},
		{Value: "a2", Label: "United"},
		{Label: "Resorts", Header: true},
		{Value: "r1", Label: "Sandals"},
		{Label: "newfangled", Header: true},
		{Value: "x1", Label: "Something"},
	}
	if len(picks) != len(want) {
		t.Fatalf("%d options, want %d", len(picks), len(want))
	}
	for i := range want {
		if picks[i] != want[i] {
			t.Errorf("option %d is %+v, want %+v", i, picks[i], want[i])
		}
	}
	// A heading over nothing is a control that looks broken.
	empty := flattenSuppliers([]supplierGroup{{KindLabel: "Airlines"}})
	if len(empty) != 0 {
		t.Errorf("an empty group drew %d options", len(empty))
	}
	if anySupplier([]supplierGroup{{KindLabel: "Airlines"}}) {
		t.Error("an agency with no suppliers reads as having one")
	}
}

func TestPrefillBySupplier(t *testing.T) {
	id := func(s string) *string { return &s }
	rate := func(f float64) Rate { return Rate{Value: f, Set: true} }

	out := prefillBySupplier([]componentRow{
		{SupplierID: id("a"), CostCents: 100000, CommissionPct: rate(10)},
		{SupplierID: id("a"), CostCents: 300000, CommissionPct: rate(14)},
		// b has one component with no rate on it, so b gets no rate at all.
		{SupplierID: id("b"), CostCents: 50000, CommissionPct: rate(12)},
		{SupplierID: id("b"), CostCents: 50000},
		// An unnamed supplier is not guessed at.
		{SupplierID: nil, CostCents: 999999, CommissionPct: rate(20)},
	})
	if len(out) != 2 {
		t.Fatalf("prefilled %d suppliers", len(out))
	}
	a := out["a"]
	if a.GrossCents != 400000 {
		t.Errorf("a's gross is %d", a.GrossCents)
	}
	// Gross-weighted: (100000*10 + 300000*14) / 400000 = 13.
	if !a.Rate.Set || a.Rate.Value != 13 {
		t.Errorf("a's rate is %+v, want 13", a.Rate)
	}
	b := out["b"]
	if b.GrossCents != 100000 {
		t.Errorf("b's gross is %d", b.GrossCents)
	}
	// An average over the rated components applied to the whole gross would assume the
	// unrated one earns it too, and overstate Expected.
	if b.Rate.Set {
		t.Errorf("b got a rate (%v) from half its components", b.Rate.Value)
	}
}

func TestIsUUID(t *testing.T) {
	for _, c := range []struct {
		in string
		ok bool
	}{
		{"0195a2c0-1a00-7000-8000-000000000901", true},
		{"0195A2C0-1A00-7000-8000-000000000901", true},
		{"0195a2c0-1a00-7000-8000-00000000090", false},
		{"0195a2c0_1a00-7000-8000-000000000901", false},
		{"", false},
		{"' or 1=1--", false},
	} {
		if got := isUUID(c.in); got != c.ok {
			t.Errorf("isUUID(%q) = %v", c.in, got)
		}
	}
}
