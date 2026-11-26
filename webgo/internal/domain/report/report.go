// Package report ports supabase/functions/_shared/report.ts: §3.11 Reporting, the request
// checks and the CSV for each report's own Export (P1), and §3.11.8's Export Center.
//
// Each report's Export downloads that report's table, for the period on screen, and is
// audited (§3.11, ruled 2026-10-21). agent_report_export returns the screen's own rows (it
// calls the same SQL the screen reads), so the file and the screen cannot disagree. This
// package only checks the request and shapes the CSV.
//
// Cells go through commission.CSVCell (RFC 4180 quoting and the formula-injection guard) and
// money through commission.CentsToDecimal (exact, never a float), the ledger export's own
// helpers.
//
// ROWS ARE js.Value, as the Deno functions took them as unknown[]: the CSV writers read each
// field with JavaScript's semantics and throw on a row of the wrong shape, including a missing
// field, which a typed struct would have read as zero. Money in these rows is a digit-string
// and never becomes a number. The row shapes (field names as the SQL writes them):
//
//	revenue       month_start, cents, item_count, prior_cents (null: nothing a year ago)
//	suppliers     supplier_name, received_cents, owed_cents, line_count, set_aside_count,
//	              set_aside_received_cents
//	destinations  destination (null: no stop yet), trip_count, value_cents
//	clients       display_name, trip_count, value_cents, commission_cents, cohort_start
//	funnel        stage (1-4), reached, open_here, cancelled_here, book_days_avg
//	              (number, text or null), book_days_n
//	pipeline      kind "stage": status, weight_pct, trip_count, gross_cents, weighted_cents;
//	              kind "past" / "month" / "later" / "undated": month_start, trip_count,
//	              weighted_cents
//	center trips       trip_title, client_name, status, start_date, end_date, destinations,
//	                   value_cents, commission_cents, paid_cents, first_booked_on, created_on
//	center milestones  trip_title, client_name, label, kind, amount_cents, due_date, status,
//	                   paid_cents, paid_on, paid_reference, pay_site
//	center clients     client_name, status, added_on, trip_count, value_cents, email, phone,
//	                   address_line1, address_line2, city, region, postal_code, country
//
// Everything in report.ts is pure, so everything is ported. One known difference, on input
// the SQL cannot produce: a status looked up in a label table is a Go map lookup, where
// JavaScript's object lookup also found Object.prototype members ("constructor",
// "toString", ...) and wrote the function's source into the cell. Go refuses such a status.
package report

import (
	"errors"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/commission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Reports are the reports with an Export today (REPORTS).
var Reports = []string{"revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"}

// Periods are §3.11's one period filter, as report_period_bounds() spells it.
var Periods = []string{"ytd", "12mo", "qtd"}

// Bases are Revenue by Month's two views.
var Bases = []string{"booked", "received"}

func oneOf(value js.Value, allowed []string, what string) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(allowed, s) {
		return "", problem.BadRequest(what + " must be one of: " + strings.Join(allowed, ", ") + ".")
	}
	return s, nil
}

// ReadReport is readReport.
func ReadReport(value js.Value) (string, error) { return oneOf(value, Reports, "report") }

// ReadPeriod is readPeriod.
func ReadPeriod(value js.Value) (string, error) { return oneOf(value, Periods, "period") }

// ReadReportPeriod is readReportPeriod. Lifetime value is lifetime and the pipeline is today:
// neither takes a period, and one sent is refused rather than silently ignored (nil is null,
// the RPC's p_period). Every other report requires one.
func ReadReportPeriod(report string, value js.Value) (*string, error) {
	if report == "clients" || report == "pipeline" {
		if !value.IsNullish() {
			return nil, problem.BadRequest("This report takes no period.")
		}
		return nil, nil
	}
	p, err := ReadPeriod(value)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ReadBasis is readBasis: required for revenue, and refused for anything else rather than
// silently ignored. nil is null.
func ReadBasis(report string, value js.Value) (*string, error) {
	if report != "revenue" {
		if !value.IsNullish() {
			return nil, problem.BadRequest("basis is only for revenue.")
		}
		return nil, nil
	}
	b, err := oneOf(value, Bases, "basis")
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// pipelineStages are the stage names the screen uses (§3.7.7's labels).
var pipelineStages = map[string]string{
	"inquiry":     "Inquiry",
	"proposal":    "Proposal",
	"booked":      "Booked",
	"in_progress": "Traveling",
}

// NoDestination matches the screen's label for the NULL row.
const NoDestination = "No destination yet"

// NoCohort matches the screen's label for a client committed before tracking began.
const NoCohort = "Before tracking"

// FunnelStages are the funnel's stages, 1 to 4, as the screen names them.
var FunnelStages = []string{"Inquiry", "Proposal", "Booked", "Traveled"}

var quarterStart = regexp.MustCompile(`^\d{4}-(01|04|07|10)-01$`)

// CohortLabel is cohortLabel: "2025 Q1" from "2025-01-01"; NoCohort for null (nil).
func CohortLabel(iso *string) (string, error) {
	if iso == nil {
		return NoCohort, nil
	}
	if !quarterStart.MatchString(*iso) {
		return "", errors.New("not a quarter start: " + *iso)
	}
	m, _ := strconv.Atoi((*iso)[5:7])
	return (*iso)[:4] + " Q" + strconv.Itoa((m+2)/3), nil
}

// cohortOf is cohortLabel(r.cohort_start) on an untyped row value.
func cohortOf(v js.Value) (string, error) {
	if v.IsNull() {
		return CohortLabel(nil)
	}
	if s, ok := v.Str(); ok {
		return CohortLabel(&s)
	}
	s := jsString(v)
	if !quarterStart.MatchString(s) {
		return "", errors.New("not a quarter start: " + s)
	}
	// Only a one-element array gets here. JavaScript sliced it as an array: the year part is
	// the array itself, String() back to the date, and the month part is [], Number([]) 0,
	// so the quarter is 2/3. Kept so the port has no exception, absurd as the answer is.
	return s + " Q" + js.NumberString(float64(0+2)/3), nil
}

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// month is "2026-10" from "2026-10-01": a month is data in a sheet, not a sentence.
func month(v js.Value) (string, error) {
	s := jsString(v) // RegExp.test coerces with String()
	if !isoDate.MatchString(s) {
		return "", errors.New("not a date: " + s)
	}
	if v.Kind() == js.Array {
		// A one-element array passes the test; .slice(0, 7) on it is the array again, and
		// the cell is its String(), the whole date.
		return s, nil
	}
	return s[:7], nil
}

func count(v js.Value) (string, error) {
	n, ok := v.Num()
	if !ok || !js.IsInteger(n) || n < 0 {
		return "", errors.New("not a count: " + jsString(v))
	}
	return js.NumberString(n), nil
}

func cents(v js.Value) (string, error) { return commission.CentsToDecimal(jsString(v)) }

// cell is csvCell(value, text) on an untyped value: null and undefined are the empty cell,
// anything else its String().
func cell(v js.Value, text bool) string {
	if v.IsNullish() {
		return ""
	}
	return commission.CSVCell(jsString(v), text)
}

func header(names ...string) string {
	cells := make([]string, len(names))
	for i, n := range names {
		cells[i] = commission.CSVCell(n, true)
	}
	return strings.Join(cells, ",")
}

// row collects one CSV line's cells, keeping the first error, so each line reads in the order
// the Deno array literal evaluated its cells.
type row struct {
	cells []string
	err   error
}

func (r *row) add(s string) { r.cells = append(r.cells, s) }

// num adds a value-producing step's result as a number cell (text false).
func (r *row) num(s string, err error) {
	if r.err == nil && err != nil {
		r.err = err
	}
	r.cells = append(r.cells, commission.CSVCell(s, false))
}

// text adds a value-producing step's result as a text cell.
func (r *row) text(s string, err error) {
	if r.err == nil && err != nil {
		r.err = err
	}
	r.cells = append(r.cells, commission.CSVCell(s, true))
}

func (r *row) line() (string, error) { return strings.Join(r.cells, ","), r.err }

// ReportCSV is reportCsv: the CSV for one report. CRLF line ends and a trailing one, per RFC
// 4180, as the ledger's. Fails on a row of the wrong shape (a plain error, a 500): a malformed
// file is worse than a failed download. basis nil is null.
func ReportCSV(report string, basis *string, rows []js.Value) (string, error) {
	var lines []string
	push := func(r *row) error {
		l, err := r.line()
		if err != nil {
			return err
		}
		lines = append(lines, l)
		return nil
	}

	switch report {
	case "revenue":
		booked := basis != nil && *basis == "booked"
		value, items := "Commission received", "Commission payments"
		if booked {
			value, items = "Booked value", "Trips"
		}
		lines = append(lines, header("Month", value, items, "Same month last year"))
		for _, r := range rows {
			var l row
			l.num(month(r.Get("month_start")))
			l.num(cents(r.Get("cents")))
			l.num(count(r.Get("item_count")))
			// Empty, not 0.00: nothing was recorded that month a year ago, which is not zero.
			if prior := r.Get("prior_cents"); prior.IsNull() {
				l.add("")
			} else {
				l.num(cents(prior))
			}
			if err := push(&l); err != nil {
				return "", err
			}
		}

	case "suppliers":
		lines = append(lines, header("Supplier", "Received", "Still owed", "Commission lines",
			"Set aside (disputed or lost)", "Already received on set-aside lines"))
		for _, r := range rows {
			var l row
			l.add(cell(r.Get("supplier_name"), true))
			l.num(cents(r.Get("received_cents")))
			l.num(cents(r.Get("owed_cents")))
			l.num(count(r.Get("line_count")))
			l.num(count(r.Get("set_aside_count")))
			l.num(cents(r.Get("set_aside_received_cents")))
			if err := push(&l); err != nil {
				return "", err
			}
		}

	case "clients":
		lines = append(lines, header("Rank", "Client", "Trips", "Lifetime value", "Commission", "Cohort"))
		for i, r := range rows {
			var l row
			l.add(commission.CSVCell(strconv.Itoa(i+1), false))
			l.add(cell(r.Get("display_name"), true))
			l.num(count(r.Get("trip_count")))
			l.num(cents(r.Get("value_cents")))
			l.num(cents(r.Get("commission_cents")))
			l.text(cohortOf(r.Get("cohort_start")))
			if err := push(&l); err != nil {
				return "", err
			}
		}

	case "pipeline":
		lines = append(lines, header("Stage", "Trips", "Full value", "Weight %", "Weighted"))
		for _, r := range rows {
			if !isString(r.Get("kind"), "stage") {
				continue
			}
			status := jsString(r.Get("status"))
			name, ok := pipelineStages[status]
			if !ok {
				return "", errors.New("unknown pipeline stage: " + status)
			}
			var l row
			l.add(commission.CSVCell(name, true))
			l.num(count(r.Get("trip_count")))
			l.num(cents(r.Get("gross_cents")))
			l.num(count(r.Get("weight_pct")))
			l.num(cents(r.Get("weighted_cents")))
			if err := push(&l); err != nil {
				return "", err
			}
		}
		// The second table after a blank line: weighted value by the month trips start.
		lines = append(lines, "", header("Travel month", "Trips", "Weighted"))
		for _, r := range rows {
			kind := r.Get("kind")
			if isString(kind, "stage") {
				continue
			}
			var label string
			switch {
			case isString(kind, "month"):
				start := r.Get("month_start")
				if start.IsNullish() {
					start = js.StringValue("")
				}
				m, err := month(start)
				if err != nil {
					return "", err
				}
				label = m
			case isString(kind, "past"):
				label = "Start date passed"
			case isString(kind, "later"):
				label = "Later"
			case isString(kind, "undated"):
				label = "No travel dates yet"
			default:
				return "", errors.New("unknown pipeline bucket: " + jsString(kind))
			}
			var l row
			l.add(commission.CSVCell(label, false))
			l.num(count(r.Get("trip_count")))
			l.num(cents(r.Get("weighted_cents")))
			if err := push(&l); err != nil {
				return "", err
			}
		}

	case "funnel":
		lines = append(lines, header("Stage", "Reached", "Stopped here, still open", "Stopped here, cancelled"))
		for _, r := range rows {
			stage := r.Get("stage")
			// FUNNEL_STAGES[r.stage - 1]: the subtraction coerces with Number().
			idx := jsNumber(stage) - 1
			if !js.IsInteger(idx) || idx < 0 || idx >= float64(len(FunnelStages)) {
				return "", errors.New("unknown funnel stage: " + jsString(stage))
			}
			var l row
			l.add(commission.CSVCell(FunnelStages[int(idx)], true))
			l.num(count(r.Get("reached")))
			l.num(count(r.Get("open_here")))
			l.num(count(r.Get("cancelled_here")))
			if err := push(&l); err != nil {
				return "", err
			}
		}
		// Days to book is one figure for the whole cohort, after a blank line rather than
		// repeated down a column. jsonb sends the numeric as a JSON number, so 18.0 arrives
		// as 18: one decimal, always.
		first := js.UndefinedValue()
		if len(rows) > 0 {
			first = rows[0]
		}
		days := ""
		if raw := first.Get("book_days_avg"); !raw.IsNullish() {
			d := jsNumber(raw)
			if !js.IsFinite(d) {
				return "", errors.New("not a day count: " + jsString(raw))
			}
			days = commission.CSVCell(js.ToFixed(d, 1), false)
		}
		lines = append(lines, "", header("Average days from inquiry to booked")+","+days)
		n := first.Get("book_days_n")
		if n.IsNullish() {
			n = js.NumberValue(0)
		}
		c, err := count(n)
		if err != nil {
			return "", err
		}
		lines = append(lines, header("Trips in that average")+","+commission.CSVCell(c, false))

	default:
		lines = append(lines, header("Destination", "Trips", "Value"))
		for _, r := range rows {
			dest := r.Get("destination")
			if dest.IsNullish() {
				dest = js.StringValue(NoDestination)
			}
			var l row
			l.add(cell(dest, true))
			l.num(count(r.Get("trip_count")))
			l.num(cents(r.Get("value_cents")))
			if err := push(&l); err != nil {
				return "", err
			}
		}
	}

	return strings.Join(lines, "\r\n") + "\r\n", nil
}

// ReportFileName is reportFileName: "revenue-booked-2026-01-01-to-2026-10-21.csv", the period
// the file covers in its name. Lifetime value and the pipeline have none and are dated the
// day they ran: "clients-lifetime-value-2026-10-21.csv".
//
// today is the advisor's own date from agent_report_export. Deno defaulted it to the
// server's UTC date when the SQL sent none; the Go caller passes that itself
// (js.ISOString(time.Now())[:10]).
func ReportFileName(report string, basis, from, to *string, today string) (string, error) {
	if report == "clients" || report == "pipeline" {
		if !isoDate.MatchString(today) {
			return "", errors.New("export date is not a date")
		}
		if report == "clients" {
			return "clients-lifetime-value-" + today + ".csv", nil
		}
		return "pipeline-" + today + ".csv", nil
	}
	if from == nil || to == nil || !isoDate.MatchString(*from) || !isoDate.MatchString(*to) {
		return "", errors.New("export period is not two dates")
	}
	b := ""
	if basis != nil && *basis != "" {
		b = "-" + *basis
	}
	return report + b + "-" + *from + "-to-" + *to + ".csv", nil
}

// ExportTypes are the Export Center's four types (§3.11, ruled 2026-10-21). ledger is the
// existing commission ledger export; the other three are agent_export_center. Clients is the
// whole list and takes no dates; the rest take an inclusive From/To.
var ExportTypes = []string{"ledger", "trips", "milestones", "clients"}

// ReadExportType is readExportType. The Export Center's refusals are SHOWN to the advisor (the
// download route prints them as text), so each says what went wrong and what to do, in
// words, never a field name.
func ReadExportType(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(ExportTypes, s) {
		return "", problem.BadRequest("Pick what to export: commission ledger, trips, payment milestones or clients.")
	}
	return s, nil
}

// readExportDate is an ISO calendar date that exists ("2026-02-30" does not).
func readExportDate(value js.Value, which string) (string, error) {
	s, ok := value.Str()
	if !ok || !isoDate.MatchString(s) {
		return "", problem.BadRequest("Pick a " + which + " date.")
	}
	d, valid := js.ParseDate(s + "T00:00:00Z")
	if !valid || js.ISOString(d)[:10] != s || strings.HasPrefix(s, "0000") {
		return "", problem.BadRequest("That " + which + " date isn't a real date.")
	}
	return s, nil
}

// ExportRange is an inclusive From/To; nil is null (Clients).
type ExportRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// ReadExportRange is readExportRange: From and To, both ISO dates, From on or before To; none
// at all for Clients.
func ReadExportRange(exportType string, from, to js.Value) (*ExportRange, error) {
	if exportType == "clients" {
		if !from.IsNullish() || !to.IsNullish() {
			return nil, problem.BadRequest("The Clients export covers everyone on your book, so it doesn't use dates.")
		}
		return nil, nil
	}
	f, err := readExportDate(from, "From")
	if err != nil {
		return nil, err
	}
	t, err := readExportDate(to, "To")
	if err != nil {
		return nil, err
	}
	if f > t {
		return nil, problem.BadRequest("The From date needs to be on or before the To date.")
	}
	return &ExportRange{From: f, To: t}, nil
}

// ReadIncludeContact is readIncludeContact: contact details are for Clients alone, and refused
// on any other type, not ignored.
func ReadIncludeContact(exportType string, value js.Value) (bool, error) {
	if b, isBool := value.Bool(); value.IsNullish() || (isBool && !b) {
		return false, nil
	}
	if !value.IsTrue() {
		return false, problem.BadRequest("Something went wrong with the contact details box. Reload the page and try again.")
	}
	if exportType != "clients" {
		return false, problem.BadRequest("Contact details can only go in the Clients export. Switch the type, or uncheck the box.")
	}
	return true, nil
}

// Stage, kind and status names as the screens say them, never the enum spelling.
var (
	tripStages = map[string]string{
		"inquiry":     "Inquiry",
		"proposal":    "Proposal",
		"booked":      "Booked",
		"in_progress": "Traveling",
		"completed":   "Completed",
		"cancelled":   "Cancelled",
	}
	milestoneKinds    = map[string]string{"deposit": "Deposit", "interim": "Interim", "final": "Final"}
	milestoneStatuses = map[string]string{
		"scheduled": "Scheduled",
		"paid":      "Paid",
		"waived":    "Waived",
		"overdue":   "Overdue",
	}
	clientStatuses = map[string]string{"active": "Active", "archived": "Archived"}
)

func named(labels map[string]string, value js.Value, what string) (string, error) {
	key := jsString(value) // a property key is String(value)
	if v, ok := labels[key]; ok && v != "" {
		return v, nil
	}
	return "", errors.New("unknown " + what + " in export: " + key)
}

// CenterCSV is centerCsv: one Export Center file. exportType is trips, milestones or clients
// (anything else falls to clients, as the Deno else-branch did). Clients' contact columns are
// there only when they were asked for (withContact): a file without them has no empty email
// column to invite the question.
func CenterCSV(exportType string, rows []js.Value, withContact bool) (string, error) {
	var lines []string
	push := func(r *row) error {
		l, err := r.line()
		if err != nil {
			return err
		}
		lines = append(lines, l)
		return nil
	}

	switch exportType {
	case "trips":
		lines = append(lines, header("Trip", "Client", "Stage", "Travel start", "Travel end", "Destinations",
			"Trip value", "Commission", "Amount paid", "First booked", "Created on"))
		for _, r := range rows {
			var l row
			l.add(cell(r.Get("trip_title"), true))
			l.add(cell(r.Get("client_name"), true))
			l.text(named(tripStages, r.Get("status"), "trip stage"))
			l.add(cell(r.Get("start_date"), false))
			l.add(cell(r.Get("end_date"), false))
			l.add(cell(r.Get("destinations"), true))
			l.num(cents(r.Get("value_cents")))
			l.num(cents(r.Get("commission_cents")))
			l.num(cents(r.Get("paid_cents")))
			l.add(cell(r.Get("first_booked_on"), false))
			l.add(cell(r.Get("created_on"), false))
			if err := push(&l); err != nil {
				return "", err
			}
		}

	case "milestones":
		lines = append(lines, header("Trip", "Client", "Payment", "Payment type", "Amount", "Due", "Status",
			"Amount paid", "Paid on", "Paid reference", "Pay site"))
		for _, r := range rows {
			var l row
			l.add(cell(r.Get("trip_title"), true))
			l.add(cell(r.Get("client_name"), true))
			l.add(cell(r.Get("label"), true))
			l.text(named(milestoneKinds, r.Get("kind"), "milestone kind"))
			l.num(cents(r.Get("amount_cents")))
			l.add(cell(r.Get("due_date"), false))
			l.text(named(milestoneStatuses, r.Get("status"), "milestone status"))
			l.num(cents(r.Get("paid_cents")))
			l.add(cell(r.Get("paid_on"), false))
			l.add(cell(r.Get("paid_reference"), true))
			l.add(cell(r.Get("pay_site"), true))
			if err := push(&l); err != nil {
				return "", err
			}
		}

	default:
		// "Booked trips": booked, traveling and completed only, the trips lifetime value adds up.
		head := []string{"Client", "Status", "Added", "Booked trips", "Lifetime value"}
		if withContact {
			head = append(head, "Email", "Phone", "Address line 1", "Address line 2", "City",
				"State or region", "Postal code", "Country")
		}
		lines = append(lines, header(head...))
		for _, r := range rows {
			var l row
			l.add(cell(r.Get("client_name"), true))
			l.text(named(clientStatuses, r.Get("status"), "client status"))
			l.add(cell(r.Get("added_on"), false))
			l.num(count(r.Get("trip_count")))
			l.num(cents(r.Get("value_cents")))
			if withContact {
				for _, k := range []string{"email", "phone", "address_line1", "address_line2",
					"city", "region", "postal_code", "country"} {
					l.add(cell(r.Get(k), true))
				}
			}
			if err := push(&l); err != nil {
				return "", err
			}
		}
	}
	return strings.Join(lines, "\r\n") + "\r\n", nil
}

// CenterFileName is centerFileName: "trips-2026-01-01-to-2026-10-21.csv"; Clients by the
// advisor's date, saying if it has contacts.
func CenterFileName(exportType string, rng *ExportRange, today string, withContact bool) (string, error) {
	base := exportType
	switch exportType {
	case "ledger":
		base = "commission-ledger"
	case "milestones":
		base = "payment-milestones"
	}
	if exportType == "clients" {
		if !isoDate.MatchString(today) {
			return "", errors.New("export date is not a date")
		}
		contact := ""
		if withContact {
			contact = "-with-contact-details"
		}
		return "clients" + contact + "-" + today + ".csv", nil
	}
	if rng == nil || !isoDate.MatchString(rng.From) || !isoDate.MatchString(rng.To) {
		return "", errors.New("export range is not two dates")
	}
	return base + "-" + rng.From + "-to-" + rng.To + ".csv", nil
}

func isString(v js.Value, want string) bool {
	s, ok := v.Str()
	return ok && s == want
}

// jsString is String(value); jsNumber is Number(value). The js package has neither for a
// Value; these are this package's private copies.
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

func jsNumber(v js.Value) float64 {
	switch v.Kind() {
	case js.Null:
		return 0
	case js.Bool:
		if v.IsTrue() {
			return 1
		}
		return 0
	case js.Number:
		n, _ := v.Num()
		return n
	case js.String:
		s, _ := v.Str()
		return js.ToNumber(s)
	case js.Array:
		return js.ToNumber(jsString(v))
	default: // undefined, and a plain object ("[object Object]")
		return math.NaN()
	}
}
