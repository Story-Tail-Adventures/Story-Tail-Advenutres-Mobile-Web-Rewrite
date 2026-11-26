package money

import (
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// §3.7.2's status vocabulary and URL contract — a port of web/lib/agent/commissionFilters.ts.
//
// THE INVARIANT THAT MATTERS MOST: anything malformed is DROPPED, never passed on. A uuid
// column handed "abc", or a date column handed "2026-02-31", makes PostgREST answer 400 —
// and on this screen a failed read is the retry state, so one typo in a shared link would
// read as "the ledger is down".

// statusFilter is one of the five chips: its value, its label and the chip KIND the design
// prototype maps it to (agent-commission.jsx's StatusChip) — expected reads as a fresh
// inquiry, invoiced as a proposal out, received as booked and settled, disputed as payment
// due, lost as past.
type statusFilter struct {
	Value string
	Label string
	Chip  string
}

// commissionStatusFilters is COMMISSION_STATUS_FILTERS. FIVE, NOT THE PROTOTYPE'S FOUR: its
// chip row draws no Lost, and a line lost to a cancellation would have no way back onto the
// screen.
var commissionStatusFilters = []statusFilter{
	{"expected", copyFilterExpected, "inquiry"},
	{"invoiced", copyFilterInvoiced, "proposal"},
	{"received", copyFilterReceived, "booked"},
	{"disputed", copyFilterDisputed, "due"},
	{"lost", copyFilterLost, "past"},
}

// statusByValue finds a known status. An unknown one is a schema change this screen has not
// caught up with: it renders as itself on a colourless chip rather than borrowing another
// status's, which would be a claim about the line.
func statusByValue(value string) (statusFilter, bool) {
	for _, f := range commissionStatusFilters {
		if f.Value == value {
			return f, true
		}
	}
	return statusFilter{}, false
}

// ledgerQuery is LedgerQuery: an empty Statuses means EVERY status — unlike the trip list,
// the ledger opens on all of it.
type ledgerQuery struct {
	Statuses   []string
	SupplierID string
	TripID     string
	// TravelFrom and TravelTo are ISO dates, inclusive, on the trip's START date.
	TravelFrom string
	TravelTo   string
	Page       int
}

// maxLedgerPage caps the page: the offset is a Postgres `integer`, and ?page=99999999999
// would overflow it into a 400 — the retry screen, for a URL typo. 100,000 pages is 2.5
// million lines.
const maxLedgerPage = 100_000

var uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

var isoDateRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// isoDate keeps a REAL calendar date, or "". 2026-02-31 is shaped right and is not a date;
// Postgres would refuse it, the read would fail, and the advisor would get a retry screen
// for a typo. Year 0000 is shaped right too, and Postgres has no year zero.
func isoDate(value string) string {
	if !isoDateRE.MatchString(value) || strings.HasPrefix(value, "0000") {
		return ""
	}
	d, err := time.Parse(time.DateOnly, value)
	if err != nil || d.Format(time.DateOnly) != value {
		return ""
	}
	return value
}

func uuidOrEmpty(value string) string {
	if uuidRE.MatchString(value) {
		return value
	}
	return ""
}

// ledgerQueryFrom reads ?status= (repeated), ?supplier=, ?trip=, ?from=, ?to= and ?page=.
func ledgerQueryFrom(params url.Values) ledgerQuery {
	q := ledgerQuery{Page: 1}
	for _, s := range params["status"] {
		if _, known := statusByValue(s); known && !slices.Contains(q.Statuses, s) {
			q.Statuses = append(q.Statuses, s)
		}
	}
	q.SupplierID = uuidOrEmpty(params.Get("supplier"))
	q.TripID = uuidOrEmpty(params.Get("trip"))
	q.TravelFrom = isoDate(params.Get("from"))
	q.TravelTo = isoDate(params.Get("to"))
	// A range typed backwards is still a range. Swapping it beats an empty table that the
	// advisor has to puzzle out.
	if q.TravelFrom != "" && q.TravelTo != "" && q.TravelFrom > q.TravelTo {
		q.TravelFrom, q.TravelTo = q.TravelTo, q.TravelFrom
	}
	// Number.parseInt, not Atoi: "3abc" is 3 in a browser and the URL is a shared link, so
	// a mangled one lands on the page it names rather than silently on page 1.
	if page, ok := parseIntJS(params.Get("page")); ok && page > 0 {
		q.Page = min(page, maxLedgerPage)
	}
	return q
}

// isFiltered is true when anything but the page narrows the ledger.
func (q ledgerQuery) isFiltered() bool {
	return len(q.Statuses) > 0 || q.SupplierID != "" || q.TripID != "" ||
		q.TravelFrom != "" || q.TravelTo != ""
}

// withPage is the same query on another page.
func (q ledgerQuery) withPage(page int) ledgerQuery { q.Page = page; return q }

// withoutTrip is the same query over every trip, from the top.
func (q ledgerQuery) withoutTrip() ledgerQuery {
	q.TripID = ""
	q.Page = 1
	return q
}

// onlyTrip is the empty query, keeping this view's trip: what "Clear filters" clears to.
func (q ledgerQuery) onlyTrip() ledgerQuery {
	return ledgerQuery{TripID: q.TripID, Page: 1}
}

// ledgerPath and ledgerExportPath are the ledger's two URLs.
const (
	ledgerPath       = "/agent/commission/ledger"
	ledgerExportPath = "/agent/commission/ledger/export"
)

// href is the ledger URL for this query. One builder for the paginator, the trip chip's
// "show every trip" link and Trip Detail's entry point, so none of them can drop a filter
// the others keep.
func (q ledgerQuery) href() string { return q.withFilters(ledgerPath, true) }

// exportHref is the CSV for the same filters — EVERY page of them, so no `page`. One builder
// with href so the file can never be filtered differently from the screen it came from.
func (q ledgerQuery) exportHref() string { return q.withFilters(ledgerExportPath, false) }

func (q ledgerQuery) withFilters(path string, withPage bool) string {
	// URLSearchParams keeps insertion order, and the tests pin the result, so this builds
	// the string in the same order rather than sorting as url.Values.Encode would.
	var parts []string
	add := func(k, v string) { parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v)) }
	for _, s := range q.Statuses {
		add("status", s)
	}
	if q.SupplierID != "" {
		add("supplier", q.SupplierID)
	}
	if q.TripID != "" {
		add("trip", q.TripID)
	}
	if q.TravelFrom != "" {
		add("from", q.TravelFrom)
	}
	if q.TravelTo != "" {
		add("to", q.TravelTo)
	}
	if withPage && q.Page > 1 {
		add("page", strconv.Itoa(q.Page))
	}
	if len(parts) == 0 {
		return path
	}
	return path + "?" + strings.Join(parts, "&")
}
