package report

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/report_test.ts, one Go test per Deno.test.
//
// The agent-report route's request checks and its CSVs (§3.11). Rows are written as JSON, the
// shape agent_report_export and agent_export_center hand back.

func parse(t *testing.T, src string) js.Value {
	t.Helper()
	v, err := js.Parse([]byte(src))
	if err != nil {
		t.Fatalf("bad test JSON %s: %v", src, err)
	}
	return v
}

func rows(t *testing.T, src string) []js.Value {
	t.Helper()
	items, ok := parse(t, src).Array()
	if !ok {
		t.Fatalf("not an array: %s", src)
	}
	return items
}

func str(s string) js.Value { return js.StringValue(s) }
func sp(s string) *string   { return &s }

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

// fails is assertThrows(fn) with no class: any error. The CSV refusals are plain errors (a
// bodyless 500), never a 4xx, so that is pinned too.
func fails(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("want an error")
	}
	if _, isHTTP := problem.As(err); isHTTP {
		t.Fatalf("want a plain error, got an HttpError: %v", err)
	}
}

func must[T any](t *testing.T) func(T, error) T {
	return func(v T, err error) T {
		t.Helper()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return v
	}
}

func deref(p *string) string {
	if p == nil {
		return "<null>"
	}
	return *p
}

// Deno.test("the sets match the SQL's own spellings")
func TestSetsMatchSQL(t *testing.T) {
	if !slices.Equal(Reports, []string{"revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"}) {
		t.Errorf("Reports = %v", Reports)
	}
	if !slices.Equal(Periods, []string{"ytd", "12mo", "qtd"}) {
		t.Errorf("Periods = %v", Periods)
	}
	if !slices.Equal(Bases, []string{"booked", "received"}) {
		t.Errorf("Bases = %v", Bases)
	}
}

// Deno.test("report and period are one of the known values")
func TestReportAndPeriodAreKnown(t *testing.T) {
	if got := must[string](t)(ReadReport(str("suppliers"))); got != "suppliers" {
		t.Errorf("got %q", got)
	}
	if got := must[string](t)(ReadPeriod(str("12mo"))); got != "12mo" {
		t.Errorf("got %q", got)
	}
	const reportOneOf = "report must be one of: revenue, suppliers, destinations, clients, funnel, pipeline."
	_, err := ReadReport(str("payroll"))
	is400(t, err, reportOneOf)
	_, err = ReadReport(js.UndefinedValue())
	is400(t, err, reportOneOf)
	_, err = ReadPeriod(str("week"))
	is400(t, err, "period must be one of: ytd, 12mo, qtd.")
	_, err = ReadPeriod(js.NumberValue(12))
	is400(t, err, "period must be one of: ytd, 12mo, qtd.")
}

// Deno.test("basis is required for revenue and refused elsewhere")
func TestBasis(t *testing.T) {
	if got := must[*string](t)(ReadBasis("revenue", str("received"))); deref(got) != "received" {
		t.Errorf("got %s", deref(got))
	}
	_, err := ReadBasis("revenue", js.UndefinedValue())
	is400(t, err, "basis must be one of: booked, received.")
	_, err = ReadBasis("revenue", str("gross"))
	is400(t, err, "basis must be one of: booked, received.")
	if got := must[*string](t)(ReadBasis("suppliers", js.UndefinedValue())); got != nil {
		t.Errorf("got %s", deref(got))
	}
	if got := must[*string](t)(ReadBasis("destinations", js.NullValue())); got != nil {
		t.Errorf("got %s", deref(got))
	}
	_, err = ReadBasis("suppliers", str("booked"))
	is400(t, err, "basis is only for revenue.")
}

// Deno.test("revenue: months as YYYY-MM, exact cents, and an empty prior is empty, not 0.00")
func TestRevenueCSV(t *testing.T) {
	csv := must[string](t)(ReportCSV("revenue", sp("booked"), rows(t, `[
		{"month_start":"2026-09-01","cents":"2032500","item_count":2,"prior_cents":null},
		{"month_start":"2026-10-01","cents":"5","item_count":1,"prior_cents":"30000"}
	]`)))
	want := "Month,Booked value,Trips,Same month last year\r\n" +
		"2026-09,20325.00,2,\r\n" +
		"2026-10,0.05,1,300.00\r\n"
	if csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
	received := must[string](t)(ReportCSV("revenue", sp("received"), nil))
	if got := strings.Split(received, "\r\n")[0]; got != "Month,Commission received,Commission payments,Same month last year" {
		t.Errorf("received header = %q", got)
	}
}

// Deno.test("suppliers: a typed name that looks like a formula is neutralised")
func TestSuppliersCSV(t *testing.T) {
	csv := must[string](t)(ReportCSV("suppliers", nil, rows(t, `[
		{"supplier_name":"=HYPERLINK(\"x\")","received_cents":"20000","owed_cents":"40000","line_count":3,"set_aside_count":2,"set_aside_received_cents":"1500"},
		{"supplier_name":"Sandals, Resorts","received_cents":"0","owed_cents":"1","line_count":1,"set_aside_count":0,"set_aside_received_cents":"0"}
	]`)))
	want := "Supplier,Received,Still owed,Commission lines,Set aside (disputed or lost),Already received on set-aside lines\r\n" +
		"\"'=HYPERLINK(\"\"x\"\")\",200.00,400.00,3,2,15.00\r\n" +
		"\"Sandals, Resorts\",0.00,0.01,1,0,0.00\r\n"
	if csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
}

// Deno.test("destinations: the no-stop row is labelled, never blank")
func TestDestinationsCSV(t *testing.T) {
	csv := must[string](t)(ReportCSV("destinations", nil, rows(t, `[
		{"destination":"Nassau","trip_count":2,"value_cents":"116667"},
		{"destination":null,"trip_count":2,"value_cents":"30000"}
	]`)))
	if want := "Destination,Trips,Value\r\nNassau,2,1166.67\r\nNo destination yet,2,300.00\r\n"; csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
}

// Deno.test("a row of the wrong shape fails the file rather than writing a bad one")
func TestWrongShapeFailsTheFile(t *testing.T) {
	_, err := ReportCSV("revenue", sp("booked"), rows(t, `[{"month_start":"Oct","cents":"1","item_count":1,"prior_cents":null}]`))
	fails(t, err)
	_, err = ReportCSV("destinations", nil, rows(t, `[{"destination":"X","trip_count":1,"value_cents":"1.5"}]`))
	fails(t, err)
	_, err = ReportCSV("suppliers", nil, rows(t, `[
		{"supplier_name":"X","received_cents":"1","owed_cents":"1","line_count":-1,"set_aside_count":0,"set_aside_received_cents":"0"}
	]`))
	fails(t, err)
}

// Deno.test("the file name carries the report, basis and period")
func TestReportFileName(t *testing.T) {
	// today is unused for a report with a period; Deno defaulted it to the server's date.
	if got := must[string](t)(ReportFileName("revenue", sp("booked"), sp("2026-01-01"), sp("2026-10-21"), "")); got != "revenue-booked-2026-01-01-to-2026-10-21.csv" {
		t.Errorf("got %q", got)
	}
	if got := must[string](t)(ReportFileName("suppliers", nil, sp("2026-10-01"), sp("2026-10-21"), "")); got != "suppliers-2026-10-01-to-2026-10-21.csv" {
		t.Errorf("got %q", got)
	}
	_, err := ReportFileName("suppliers", nil, sp("Oct 1"), sp("2026-10-21"), "")
	fails(t, err)
}

// Deno.test("lifetime value takes no period; every other report needs one")
func TestReportPeriod(t *testing.T) {
	if got := must[*string](t)(ReadReportPeriod("clients", js.UndefinedValue())); got != nil {
		t.Errorf("clients: %s", deref(got))
	}
	_, err := ReadReportPeriod("clients", str("ytd"))
	is400(t, err, "This report takes no period.")
	if got := must[*string](t)(ReadReportPeriod("funnel", str("qtd"))); deref(got) != "qtd" {
		t.Errorf("funnel: %s", deref(got))
	}
	if got := must[*string](t)(ReadReportPeriod("pipeline", js.UndefinedValue())); got != nil {
		t.Errorf("pipeline: %s", deref(got))
	}
	_, err = ReadReportPeriod("pipeline", str("12mo"))
	is400(t, err, "This report takes no period.")
	_, err = ReadReportPeriod("funnel", js.UndefinedValue())
	is400(t, err, "period must be one of: ytd, 12mo, qtd.")
}

// Deno.test("clients: ranked, cohort as a quarter, and before-tracking said in words")
func TestClientsCSV(t *testing.T) {
	for in, want := range map[string]string{"2025-01-01": "2025 Q1", "2026-10-01": "2026 Q4"} {
		if got := must[string](t)(CohortLabel(sp(in))); got != want {
			t.Errorf("CohortLabel(%s) = %q, want %q", in, got, want)
		}
	}
	if got := must[string](t)(CohortLabel(nil)); got != "Before tracking" {
		t.Errorf("CohortLabel(null) = %q", got)
	}
	_, err := CohortLabel(sp("2025-02-01"))
	fails(t, err)
	csv := must[string](t)(ReportCSV("clients", nil, rows(t, `[
		{"display_name":"Bo Diddley","trip_count":1,"value_cents":"200000","commission_cents":"30000","cohort_start":null},
		{"display_name":"Ada Lovelace","trip_count":2,"value_cents":"150000","commission_cents":"15000","cohort_start":"2025-01-01"}
	]`)))
	want := "Rank,Client,Trips,Lifetime value,Commission,Cohort\r\n" +
		"1,Bo Diddley,1,2000.00,300.00,Before tracking\r\n" +
		"2,Ada Lovelace,2,1500.00,150.00,2025 Q1\r\n"
	if csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
	if got := must[string](t)(ReportFileName("clients", nil, nil, nil, "2026-10-21")); got != "clients-lifetime-value-2026-10-21.csv" {
		t.Errorf("file name = %q", got)
	}
}

// funnelRow is the Deno test's stage(s, reached, open, cancelled), with book_days_avg and
// book_days_n written as JSON so a test can override them as the Deno spread did.
func funnelRow(t *testing.T, s, reached, open, cancelled int, avg string, n int) js.Value {
	return parse(t, fmt.Sprintf(`{"stage":%d,"reached":%d,"open_here":%d,"cancelled_here":%d,"book_days_avg":%s,"book_days_n":%d}`,
		s, reached, open, cancelled, avg, n))
}

// Deno.test("funnel: four named stages, then days to book once")
func TestFunnelCSV(t *testing.T) {
	stage := func(s, reached, open, cancelled int) js.Value {
		return funnelRow(t, s, reached, open, cancelled, `"7.0"`, 3)
	}
	csv := must[string](t)(ReportCSV("funnel", nil, []js.Value{stage(1, 7, 1, 0), stage(2, 6, 1, 1), stage(3, 4, 2, 1), stage(4, 1, 0, 0)}))
	want := "Stage,Reached,\"Stopped here, still open\",\"Stopped here, cancelled\"\r\n" +
		"Inquiry,7,1,0\r\nProposal,6,1,1\r\nBooked,4,2,1\r\nTraveled,1,0,0\r\n" +
		"\r\nAverage days from inquiry to booked,7.0\r\nTrips in that average,3\r\n"
	if csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
	_, err := ReportCSV("funnel", nil, []js.Value{stage(5, 1, 0, 0)})
	fails(t, err)
	// jsonb sends 18.0 as the number 18; the file still says 18.0.
	asNumber := must[string](t)(ReportCSV("funnel", nil, []js.Value{funnelRow(t, 1, 1, 0, 0, `18`, 3)}))
	if !strings.Contains(asNumber, "Average days from inquiry to booked,18.0\r\n") {
		t.Errorf("as number: %q", asNumber)
	}
	none := must[string](t)(ReportCSV("funnel", nil, []js.Value{funnelRow(t, 1, 1, 1, 0, `null`, 0)}))
	if !strings.Contains(none, "Average days from inquiry to booked,\r\nTrips in that average,0\r\n") {
		t.Errorf("none: %q", none)
	}
}

// Deno.test("pipeline: the stage table, a blank line, then the months, later and undated")
func TestPipelineCSV(t *testing.T) {
	csv := must[string](t)(ReportCSV("pipeline", nil, rows(t, `[
		{"kind":"stage","status":"inquiry","weight_pct":25,"trip_count":3,"gross_cents":"100005","weighted_cents":"25001"},
		{"kind":"stage","status":"in_progress","weight_pct":100,"trip_count":1,"gross_cents":"11111","weighted_cents":"11111"},
		{"kind":"past","month_start":null,"trip_count":1,"weighted_cents":"77777"},
		{"kind":"month","month_start":"2026-10-01","trip_count":2,"weighted_cents":"88888"},
		{"kind":"later","month_start":null,"trip_count":1,"weighted_cents":"15001"},
		{"kind":"undated","month_start":null,"trip_count":0,"weighted_cents":"0"}
	]`)))
	want := "Stage,Trips,Full value,Weight %,Weighted\r\n" +
		"Inquiry,3,1000.05,25,250.01\r\nTraveling,1,111.11,100,111.11\r\n" +
		"\r\nTravel month,Trips,Weighted\r\n" +
		"Start date passed,1,777.77\r\n2026-10,2,888.88\r\nLater,1,150.01\r\nNo travel dates yet,0,0.00\r\n"
	if csv != want {
		t.Errorf("got %q\nwant %q", csv, want)
	}
	_, err := ReportCSV("pipeline", nil, rows(t, `[
		{"kind":"stage","status":"cancelled","weight_pct":0,"trip_count":1,"gross_cents":"1","weighted_cents":"0"}
	]`))
	fails(t, err)
	if got := must[string](t)(ReportFileName("pipeline", nil, nil, nil, "2026-10-21")); got != "pipeline-2026-10-21.csv" {
		t.Errorf("file name = %q", got)
	}
}

// Deno.test("export center: the four types, a range for all but Clients")
func TestExportCenterTypesAndRange(t *testing.T) {
	if !slices.Equal(ExportTypes, []string{"ledger", "trips", "milestones", "clients"}) {
		t.Errorf("ExportTypes = %v", ExportTypes)
	}
	if got := must[string](t)(ReadExportType(str("milestones"))); got != "milestones" {
		t.Errorf("got %q", got)
	}
	_, err := ReadExportType(str("payroll"))
	is400(t, err, "Pick what to export: commission ledger, trips, payment milestones or clients.")

	if got := must[*ExportRange](t)(ReadExportRange("trips", str("2026-01-01"), str("2026-12-31"))); got == nil || *got != (ExportRange{From: "2026-01-01", To: "2026-12-31"}) {
		t.Errorf("trips range = %+v", got)
	}
	if got := must[*ExportRange](t)(ReadExportRange("ledger", str("2026-03-01"), str("2026-03-01"))); got == nil || *got != (ExportRange{From: "2026-03-01", To: "2026-03-01"}) {
		t.Errorf("ledger range = %+v", got)
	}
	_, err = ReadExportRange("trips", str("2026-12-31"), str("2026-01-01"))
	is400(t, err, "The From date needs to be on or before the To date.")
	_, err = ReadExportRange("trips", str("2026-02-30"), str("2026-03-01"))
	is400(t, err, "That From date isn't a real date.")
	_, err = ReadExportRange("milestones", js.UndefinedValue(), str("2026-03-01"))
	is400(t, err, "Pick a From date.")
	if got := must[*ExportRange](t)(ReadExportRange("clients", js.UndefinedValue(), js.NullValue())); got != nil {
		t.Errorf("clients range = %+v", got)
	}
	_, err = ReadExportRange("clients", str("2026-01-01"), str("2026-12-31"))
	is400(t, err, "The Clients export covers everyone on your book, so it doesn't use dates.")
}

// Deno.test("export center: contact details only for Clients, and only a real yes")
func TestIncludeContact(t *testing.T) {
	if got := must[bool](t)(ReadIncludeContact("clients", js.BoolValue(true))); !got {
		t.Error("clients + true = false")
	}
	if got := must[bool](t)(ReadIncludeContact("clients", js.UndefinedValue())); got {
		t.Error("clients + undefined = true")
	}
	if got := must[bool](t)(ReadIncludeContact("trips", js.BoolValue(false))); got {
		t.Error("trips + false = true")
	}
	_, err := ReadIncludeContact("trips", js.BoolValue(true))
	is400(t, err, "Contact details can only go in the Clients export. Switch the type, or uncheck the box.")
	_, err = ReadIncludeContact("clients", str("yes"))
	is400(t, err, "Something went wrong with the contact details box. Reload the page and try again.")
}

// Deno.test("export center: trips and milestones say stages in words, money exactly")
func TestCenterTripsAndMilestones(t *testing.T) {
	trips := must[string](t)(CenterCSV("trips", rows(t, `[{
		"trip_title":"=cmd","client_name":"Ana Ruiz","status":"in_progress","start_date":"2026-03-10",
		"end_date":"2026-03-17","destinations":"Lisbon; Porto","value_cents":"100000","commission_cents":"10000",
		"paid_cents":"5","first_booked_on":"2026-02-28","created_on":"2026-01-02"
	}]`), false))
	want := "Trip,Client,Stage,Travel start,Travel end,Destinations,Trip value,Commission,Amount paid,First booked,Created on\r\n" +
		"'=cmd,Ana Ruiz,Traveling,2026-03-10,2026-03-17,Lisbon; Porto,1000.00,100.00,0.05,2026-02-28,2026-01-02\r\n"
	if trips != want {
		t.Errorf("trips = %q\nwant %q", trips, want)
	}
	ms := must[string](t)(CenterCSV("milestones", rows(t, `[{
		"trip_title":"T1","client_name":"Ana Ruiz","label":"Deposit","kind":"deposit","amount_cents":"50000",
		"due_date":"2026-02-01","status":"paid","paid_cents":"50000","paid_on":"2026-02-01","paid_reference":null,
		"pay_site":"royalcaribbean.com"
	}]`), false))
	if got := strings.Split(ms, "\r\n")[1]; got != "T1,Ana Ruiz,Deposit,Deposit,500.00,2026-02-01,Paid,500.00,2026-02-01,,royalcaribbean.com" {
		t.Errorf("milestone row = %q", got)
	}
	_, err := CenterCSV("trips", rows(t, `[{"status":"lead"}]`), false)
	fails(t, err)
}

// Deno.test("export center: a Clients file without the switch has no contact columns at all")
func TestCenterClientsContactSwitch(t *testing.T) {
	row := rows(t, `[{
		"client_name":"Ana Ruiz","status":"active","added_on":"2026-01-02","trip_count":1,"value_cents":"100000",
		"email":"ana@example.com","phone":"+1-555-0101","address_line1":"12 Harbor Way","address_line2":null,
		"city":"Tampa","region":"FL","postal_code":"33602","country":"US"
	}]`)
	bare := must[string](t)(CenterCSV("clients", row, false))
	if want := "Client,Status,Added,Booked trips,Lifetime value\r\nAna Ruiz,Active,2026-01-02,1,1000.00\r\n"; bare != want {
		t.Errorf("bare = %q\nwant %q", bare, want)
	}
	if strings.Contains(bare, "example.com") {
		t.Error("bare file carries an email")
	}
	full := must[string](t)(CenterCSV("clients", row, true))
	if got := strings.Split(full, "\r\n")[1]; got != "Ana Ruiz,Active,2026-01-02,1,1000.00,ana@example.com,'+1-555-0101,12 Harbor Way,,Tampa,FL,33602,US" {
		t.Errorf("full row = %q", got)
	}
}

// Deno.test("export center: file names carry the type and range, or the day and the switch")
func TestCenterFileName(t *testing.T) {
	rng := &ExportRange{From: "2026-01-01", To: "2026-10-21"}
	for _, c := range []struct {
		typ         string
		rng         *ExportRange
		today       string
		withContact bool
		want        string
	}{
		{"ledger", rng, "x", false, "commission-ledger-2026-01-01-to-2026-10-21.csv"},
		{"milestones", rng, "x", false, "payment-milestones-2026-01-01-to-2026-10-21.csv"},
		{"clients", nil, "2026-10-21", false, "clients-2026-10-21.csv"},
		{"clients", nil, "2026-10-21", true, "clients-with-contact-details-2026-10-21.csv"},
	} {
		if got := must[string](t)(CenterFileName(c.typ, c.rng, c.today, c.withContact)); got != c.want {
			t.Errorf("CenterFileName(%s) = %q, want %q", c.typ, got, c.want)
		}
	}
	_, err := CenterFileName("trips", nil, "2026-10-21", false)
	fails(t, err)
}

// Go-only (no Deno.test): the JavaScript coercions ReportCSV keeps on untyped rows, each
// expected answer taken from deno against report.ts. A missing field fails the file (a
// typed struct would have written 0), the funnel stage goes through Number(), the day count
// keeps toFixed's "-0.0", and a non-string cohort or month is sliced the way JavaScript
// sliced an array.
func TestGoOnlyUntypedRowCoercions(t *testing.T) {
	funnel := func(stage, avg string) js.Value {
		return parse(t, `{"stage":`+stage+`,"reached":1,"open_here":0,"cancelled_here":0,"book_days_avg":`+avg+`,"book_days_n":2}`)
	}
	for _, c := range []struct {
		report string
		basis  *string
		rows   []js.Value
		want   string
	}{
		{"funnel", nil, []js.Value{funnel(`"1"`, `"7.0"`), funnel(`true`, `"7.0"`), funnel(`"0x3"`, `"7.0"`)},
			"Stage,Reached,\"Stopped here, still open\",\"Stopped here, cancelled\"\r\nInquiry,1,0,0\r\nInquiry,1,0,0\r\nBooked,1,0,0\r\n\r\nAverage days from inquiry to booked,7.0\r\nTrips in that average,2\r\n"},
		{"funnel", nil, []js.Value{funnel(`1`, `-0.04`)},
			"Stage,Reached,\"Stopped here, still open\",\"Stopped here, cancelled\"\r\nInquiry,1,0,0\r\n\r\nAverage days from inquiry to booked,-0.0\r\nTrips in that average,2\r\n"},
		{"funnel", nil, nil,
			"Stage,Reached,\"Stopped here, still open\",\"Stopped here, cancelled\"\r\n\r\nAverage days from inquiry to booked,\r\nTrips in that average,0\r\n"},
		{"clients", nil, rows(t, `[{"display_name":"A","trip_count":1,"value_cents":"1","commission_cents":"1","cohort_start":["2025-01-01"]}]`),
			"Rank,Client,Trips,Lifetime value,Commission,Cohort\r\n1,A,1,0.01,0.01,2025-01-01 Q0.6666666666666666\r\n"},
		{"revenue", sp("booked"), rows(t, `[{"month_start":["2026-10-01"],"cents":"1","item_count":1,"prior_cents":null}]`),
			"Month,Booked value,Trips,Same month last year\r\n2026-10-01,0.01,1,\r\n"},
		{"destinations", nil, rows(t, `[{"destination":7,"trip_count":1,"value_cents":250}]`),
			"Destination,Trips,Value\r\n7,1,2.50\r\n"},
	} {
		if got := must[string](t)(ReportCSV(c.report, c.basis, c.rows)); got != c.want {
			t.Errorf("%s: got %q\nwant %q", c.report, got, c.want)
		}
	}
	for _, c := range []struct {
		report  string
		basis   *string
		rows    string
		wantErr string
	}{
		{"funnel", nil, `[{"stage":1,"reached":1,"open_here":0,"cancelled_here":0,"book_days_avg":"abc","book_days_n":2}]`, "not a day count: abc"},
		{"destinations", nil, `[{"destination":"X","value_cents":"1"}]`, "not a count: undefined"},
		{"revenue", sp("booked"), `[{"month_start":"2026-10-01","cents":"1","item_count":1}]`, "not a cents value: undefined"},
		{"pipeline", nil, `[{"kind":"soon","trip_count":1,"weighted_cents":"1"}]`, "unknown pipeline bucket: soon"},
	} {
		_, err := ReportCSV(c.report, c.basis, rows(t, c.rows))
		if err == nil || err.Error() != c.wantErr {
			t.Errorf("%s: error %v, want %q", c.report, err, c.wantErr)
		}
	}
}
