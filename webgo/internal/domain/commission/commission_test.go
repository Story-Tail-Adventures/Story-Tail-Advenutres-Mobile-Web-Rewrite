package commission

import (
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/commission_test.ts, one Go test per Deno.test.
//
// The agent-commission route's request checks and its CSV. Every case below would otherwise
// reach Postgres and come back as a bodyless 500, or, for the CSV, run as a formula on the
// advisor's own machine.

func parse(t *testing.T, src string) js.Value {
	t.Helper()
	v, err := js.Parse([]byte(src))
	if err != nil {
		t.Fatalf("bad test JSON %s: %v", src, err)
	}
	return v
}

func str(s string) js.Value  { return js.StringValue(s) }
func num(f float64) js.Value { return js.NumberValue(f) }

// is400 is the Deno file's is400: an HttpError with status 400. The sentence is pinned too
// where the Deno test leaves it open, since the port must move it byte for byte.
func is400(t *testing.T, err error, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("want a 400 %q, got %v", detail, err)
	}
	if p.Status != 400 || p.Detail != detail {
		t.Fatalf("want 400 %q, got %d %q", detail, p.Status, p.Detail)
	}
}

// isHTTPError is assertThrows(fn, HttpError) with no status asserted.
func isHTTPError(t *testing.T, err error) {
	t.Helper()
	if _, ok := problem.As(err); !ok {
		t.Fatalf("want an HttpError, got %v", err)
	}
}

func ok[T any](t *testing.T) func(T, error) T {
	return func(v T, err error) T {
		t.Helper()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return v
	}
}

func strPtr(p *string) string {
	if p == nil {
		return "<null>"
	}
	return *p
}

// Deno.test("the status sets match commission_status, and new lines start unpaid")
func TestStatusSets(t *testing.T) {
	if !slices.Equal(CommissionStatuses, []string{"expected", "invoiced", "received", "disputed", "lost"}) {
		t.Errorf("CommissionStatuses = %v", CommissionStatuses)
	}
	if !slices.Equal(CreateStatuses, []string{"expected", "invoiced"}) {
		t.Errorf("CreateStatuses = %v", CreateStatuses)
	}
	if !slices.Equal(PaymentStatuses, []string{"received", "disputed"}) {
		t.Errorf("PaymentStatuses = %v", PaymentStatuses)
	}
	_, err := ReadStatus(str("received"), CreateStatuses, "Status")
	is400(t, err, "Status must be one of: expected, invoiced.")
	_, err = ReadStatus(str("lost"), CreateStatuses, "Status")
	is400(t, err, "Status must be one of: expected, invoiced.")
	if got := ok[string](t)(ReadStatus(str("invoiced"), CreateStatuses, "Status")); got != "invoiced" {
		t.Errorf("got %q", got)
	}
}

// Deno.test("terms are the enum, not prose")
func TestTermsAreTheEnum(t *testing.T) {
	if got := ok[string](t)(ReadTerms(str("after_travel"))); got != "after_travel" {
		t.Errorf("got %q", got)
	}
	_, err := ReadTerms(str("60 days after travel"))
	is400(t, err, "Payment terms must be one of: at_booking, after_travel.")
}

// Deno.test("a rate is 0 to 100, two decimals, and required")
func TestRate(t *testing.T) {
	for _, c := range []struct {
		in   js.Value
		want float64
	}{{str("12.5"), 12.5}, {num(12.505), 12.51}, {num(0), 0}, {num(100), 100}} {
		if got := ok[float64](t)(ReadRate(c.in)); got != c.want {
			t.Errorf("ReadRate(%v) = %v, want %v", c.in, got, c.want)
		}
	}
	_, err := ReadRate(str(""))
	is400(t, err, "Commission rate is required.")
	_, err = ReadRate(num(100.01))
	is400(t, err, "Commission rate must be between 0 and 100.")
	_, err = ReadRate(num(-1))
	is400(t, err, "Commission rate must be between 0 and 100.")
	_, err = ReadRate(str("twelve"))
	is400(t, err, "Commission rate must be a number.")
}

// Deno.test("loose inputs that Number() would accept are refused")
func TestLooseInputsAreRefused(t *testing.T) {
	// Number(" ") is 0 and Number([5]) is 5; neither is a rate anyone typed.
	_, err := ReadRate(str(" "))
	is400(t, err, "Commission rate must be a number.")
	_, err = ReadRate(parse(t, `[5]`))
	is400(t, err, "Commission rate must be a number.")
	_, err = ReadLagDays(str(" "))
	is400(t, err, "Payment days must be a whole number.")
	_, err = ReadLagDays(parse(t, `[]`))
	is400(t, err, "Payment days must be a whole number.")
}

// Deno.test("a required amount refuses blank instead of reading it as $0")
func TestRequiredAmountRefusesBlank(t *testing.T) {
	_, err := RequireCents(js.UndefinedValue(), "Gross")
	is400(t, err, "Gross is required.")
	_, err = RequireCents(str(""), "Amount received")
	is400(t, err, "Amount received is required.")
	if got := ok[int64](t)(RequireCents(num(0), "Gross")); got != 0 {
		t.Errorf("got %d", got)
	}
	if got := ok[int64](t)(RequireCents(str("97040"), "Gross")); got != 97040 {
		t.Errorf("got %d", got)
	}
}

// Deno.test("text Postgres would refuse is a 400, not a 500")
func TestTextPostgresWouldRefuse(t *testing.T) {
	_, err := ReadNotes(str("hello\x00world"))
	is400(t, err, "Notes: some characters can't be saved. Remove them and try again.")
	// A lone surrogate (Deno: "ITV-\uD800"). Go strings hold UTF-8, so the surrogate is its
	// WTF-8 bytes, which are not valid UTF-8, as the JavaScript string was not well formed.
	_, err = ReadReference(str("ITV-\xed\xa0\x80"))
	is400(t, err, "Inteletravel reference: some characters can't be saved. Remove them and try again.")
}

// Deno.test("payment days are a whole number, 0 to 365")
func TestPaymentDays(t *testing.T) {
	if got := ok[int64](t)(ReadLagDays(num(60))); got != 60 {
		t.Errorf("got %d", got)
	}
	if got := ok[int64](t)(ReadLagDays(str("0"))); got != 0 {
		t.Errorf("got %d", got)
	}
	_, err := ReadLagDays(num(366))
	is400(t, err, "Payment days must be between 0 and 365.")
	_, err = ReadLagDays(num(30.5))
	is400(t, err, "Payment days must be a whole number.")
	_, err = ReadLagDays(str(""))
	is400(t, err, "Payment days must be a whole number.")
	_, err = ReadLagDays(js.NullValue())
	is400(t, err, "Payment days must be a whole number.")
}

// Deno.test("a blank reference or note is none, and long ones are refused")
func TestBlankReferenceOrNote(t *testing.T) {
	if got := ok[*string](t)(ReadReference(str("  ITV-1  "))); strPtr(got) != "ITV-1" {
		t.Errorf("got %s", strPtr(got))
	}
	if got := ok[*string](t)(ReadReference(str("   "))); got != nil {
		t.Errorf("got %s", strPtr(got))
	}
	if got := ok[*string](t)(ReadNotes(str(""))); got != nil {
		t.Errorf("got %s", strPtr(got))
	}
	_, err := ReadReference(str(strings.Repeat("x", 65)))
	is400(t, err, "Inteletravel reference is too long.")
	_, err = ReadNotes(str(strings.Repeat("x", 4001)))
	is400(t, err, "Notes are too long.")
}

// Deno.test("a date must exist, not just look like one")
func TestDateMustExist(t *testing.T) {
	if got := ok[string](t)(ReadDate(str("2026-02-28"), "Date")); got != "2026-02-28" {
		t.Errorf("got %q", got)
	}
	for _, bad := range []string{"2026-02-31", "0000-01-01", "Feb 3"} {
		_, err := ReadDate(str(bad), "Date")
		is400(t, err, "Date must be a date.")
	}
}

// Deno.test("ledger filters: empty status list means all; ids and dates are checked")
func TestLedgerFilters(t *testing.T) {
	if got := ok[LedgerFilters](t)(ReadLedgerFilters(parse(t, `{}`))); got.Status != nil {
		t.Errorf("{}: p_status = %v", got.Status)
	}
	if got := ok[LedgerFilters](t)(ReadLedgerFilters(parse(t, `{"statuses":[]}`))); got.Status != nil {
		t.Errorf("[]: p_status = %v", got.Status)
	}
	if got := ok[LedgerFilters](t)(ReadLedgerFilters(parse(t, `{"statuses":["lost","lost"]}`))); !slices.Equal(got.Status, []string{"lost"}) {
		t.Errorf("dedupe: p_status = %v", got.Status)
	}
	_, err := ReadLedgerFilters(parse(t, `{"statuses":["paid"]}`))
	is400(t, err, "Status must be one of: expected, invoiced, received, disputed, lost.")
	_, err = ReadLedgerFilters(parse(t, `{"supplierId":"sandals"}`))
	is400(t, err, "That is not a supplier id.")
	_, err = ReadLedgerFilters(parse(t, `{"travelFrom":"2026-13-01"}`))
	is400(t, err, "Travel from must be a date.")
}

// Deno.test("cents become an exact decimal string, through no float")
func TestCentsToDecimal(t *testing.T) {
	for in, want := range map[string]string{
		"0":                  "0.00",
		"5":                  "0.05",
		"97040":              "970.40",
		"123456789012345678": "1234567890123456.78",
		"-2558":              "-25.58",
	} {
		if got := ok[string](t)(CentsToDecimal(in)); got != want {
			t.Errorf("CentsToDecimal(%q) = %q, want %q", in, got, want)
		}
	}
}

// Deno.test("a cell that starts like a formula is neutralised; quoting follows RFC 4180")
func TestCSVCell(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{`=HYPERLINK("http://x")`, `"'=HYPERLINK(""http://x"")"`},
		{"+1-555", "'+1-555"},
		{"-Smith", "'-Smith"},
		{"@sum", "'@sum"},
		{"Hayes, Jordan", `"Hayes, Jordan"`},
		{"plain", "plain"},
	} {
		if got := CSVCell(c.in, true); got != c.want {
			t.Errorf("CSVCell(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	// A NUMBER cell is left alone: a negative amount must stay a number.
	if got := CSVCell("-25.58", false); got != "-25.58" {
		t.Errorf("number cell = %q", got)
	}
	if got := CSVCellOpt(nil, true); got != "" {
		t.Errorf("null cell = %q", got)
	}
}

func sp(s string) *string { return &s }

// Deno.test("the CSV has a header, exact cents, readable terms and CRLF lines")
func TestToCSV(t *testing.T) {
	row := ExportRow{
		TripTitle:               "=cmd",
		ClientDisplayName:       "Jordan Hayes",
		SupplierName:            "Sandals Resorts",
		TravelStart:             sp("2026-12-17"),
		TravelEnd:               sp("2026-12-23"),
		Status:                  "received",
		GrossBookingCents:       "1010300",
		CommissionPct:           NumberValue(12),
		ExpectedCommissionCents: "121236",
		ProcessingFeeCents:      "1246",
		ReceivedCommissionCents: "119990",
		ReceivedAt:              sp("2027-02-21"),
		PaymentTerms:            "after_travel",
		PaymentLagDays:          60,
		InteletravelReference:   nil,
		Currency:                "USD",
	}
	csv := ok[string](t)(ToCSV([]ExportRow{row}))
	lines := strings.Split(csv, "\r\n")
	if !strings.HasPrefix(lines[0], "Trip,Client,Supplier,") {
		t.Errorf("header = %q", lines[0])
	}
	want := "'=cmd,Jordan Hayes,Sandals Resorts,2026-12-17,2026-12-23,received,10103.00,12,1212.36,12.46,1199.90,2027-02-21,After travel,60,,USD"
	if lines[1] != want {
		t.Errorf("row = %q\nwant  %q", lines[1], want)
	}
	if !strings.HasSuffix(csv, "\r\n") {
		t.Error("no trailing CRLF")
	}
}

// Deno.test("an unknown payment-terms value fails the export rather than reading as After travel")
func TestUnknownTermsFailExport(t *testing.T) {
	_, err := ToCSV([]ExportRow{{
		TripTitle: "x", ClientDisplayName: "y", SupplierName: "z", Status: "expected",
		GrossBookingCents: "0", CommissionPct: NumberValue(0), ExpectedCommissionCents: "0",
		ProcessingFeeCents: "0", ReceivedCommissionCents: "0", PaymentTerms: "on_departure",
		PaymentLagDays: 0, Currency: "USD",
	}})
	if err == nil {
		t.Fatal("want an error")
	}
	if _, isHTTP := problem.As(err); isHTTP {
		t.Fatalf("want a plain error (a 500), got %v", err)
	}
}

// Deno.test("readWeights: exactly the four open stages, whole numbers 0 to 100")
func TestReadWeights(t *testing.T) {
	okJSON := `"inquiry":20,"proposal":50,"booked":100,"in_progress":100`
	want := StageWeights{Inquiry: 20, Proposal: 50, Booked: 100, InProgress: 100}
	if got := ok[StageWeights](t)(ReadWeights(parse(t, "{"+okJSON+"}"), "Weights")); got != want {
		t.Errorf("got %+v", got)
	}
	if got := ok[StageWeights](t)(ReadWeights(parse(t, "{"+okJSON+`,"inquiry":0}`), "Weights")); got.Inquiry != 0 {
		t.Errorf("inquiry = %d", got.Inquiry)
	}
	for _, src := range []string{
		"{" + okJSON + `,"proposal":101}`,
		"{" + okJSON + `,"proposal":50.5}`,
		"{" + okJSON + `,"proposal":"50"}`,
		`{"inquiry":20,"proposal":50,"booked":100}`,
		"{" + okJSON + `,"completed":100}`,
		`[20,50,100,100]`,
	} {
		_, err := ReadWeights(parse(t, src), "Weights")
		isHTTPError(t, err)
	}
}

// Deno.test("readCloseLines: absent is none; each line an id and the version the dialog showed")
func TestReadCloseLines(t *testing.T) {
	a := "0195a2c0-1a00-7000-8000-000000000201"
	b := "0195a2c0-1a00-7000-8000-000000000202"
	for _, empty := range []js.Value{js.UndefinedValue(), js.NullValue(), parse(t, `[]`)} {
		got := ok[[]CloseLine](t)(ReadCloseLines(empty))
		if got == nil || len(got) != 0 {
			t.Errorf("ReadCloseLines(%v) = %#v, want []", empty, got)
		}
	}
	got := ok[[]CloseLine](t)(ReadCloseLines(parse(t, `[{"id":"`+a+`","version":1},{"id":"`+b+`","version":3}]`)))
	if !reflect.DeepEqual(got, []CloseLine{{ID: a, Version: 1}, {ID: b, Version: 3}}) {
		t.Errorf("got %+v", got)
	}
	for _, src := range []string{
		`{"id":"` + a + `","version":1}`,
		`[{"id":"not-a-line","version":1}]`,
		`[{"id":"` + a + `"}]`,
		`[{"id":"` + a + `","version":0}]`,
		`[{"id":"` + a + `","version":1.5}]`,
		`[{"id":"` + a + `","version":"1"}]`,
		`[null]`,
		// The same line twice, even in another case, is a request nobody's dialog sends.
		`[{"id":"` + a + `","version":1},{"id":"` + strings.ToUpper(a) + `","version":1}]`,
	} {
		_, err := ReadCloseLines(parse(t, src))
		isHTTPError(t, err)
	}
	tooMany := make([]js.Value, MaxCloseLines+1)
	for i := range tooMany {
		tooMany[i] = js.ObjectValue(
			"id", str(fmt.Sprintf("0195a2c0-1a00-7000-8000-%012d", i)),
			"version", num(1),
		)
	}
	_, err := ReadCloseLines(js.ArrayValue(tooMany...))
	isHTTPError(t, err)
	if got := ok[[]CloseLine](t)(ReadCloseLines(js.ArrayValue(tooMany[:MaxCloseLines]...))); len(got) != MaxCloseLines {
		t.Errorf("len = %d", len(got))
	}
}

// Go-only (no Deno.test): cases the port rewrote by hand, each answer taken from deno
// against commission.ts. centsToDecimal's /^0+(?=\d)/ became a loop (RE2 has no lookahead);
// readWeights compares the joined key lists as strings, so a comma inside a key matches the
// list and the 400 is the per-weight sentence; null and a string read as an empty filter.
func TestGoOnlyHandRewrites(t *testing.T) {
	for in, want := range map[string]string{
		"00012345": "123.45", "-0005": "-0.05", "-0": "-0.00", "000": "0.00", " 42 ": "0.42", "100": "1.00",
	} {
		if got := ok[string](t)(CentsToDecimal(in)); got != want {
			t.Errorf("CentsToDecimal(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := CentsToDecimal("1.5"); err == nil || err.Error() != "not a cents value: 1.5" {
		t.Errorf("CentsToDecimal(1.5) error = %v", err)
	}

	_, err := ReadWeights(parse(t, `{"booked,in_progress":1,"inquiry":2,"proposal":3}`), "Weights")
	is400(t, err, "Each weight must be a whole number from 0 to 100.")

	for _, v := range []js.Value{str("abc"), js.NullValue()} {
		got := ok[LedgerFilters](t)(ReadLedgerFilters(v))
		b, _ := js.Marshal(got)
		if string(b) != `{"p_status":null,"p_supplier_id":null,"p_trip_id":null,"p_travel_from":null,"p_travel_to":null}` {
			t.Errorf("ReadLedgerFilters(%v) = %s", v, b)
		}
	}
}
