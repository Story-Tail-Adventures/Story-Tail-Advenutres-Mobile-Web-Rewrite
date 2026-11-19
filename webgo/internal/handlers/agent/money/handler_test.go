package money

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// The pages themselves, mounted behind the real gate and session: what reaches the browser,
// not what a view model holds. These are the tests that catch a slot that never got filled,
// a placeholder that shipped, and a page that renders half of itself.

func (wd *world) seedDashboard() {
	wd.fake.rpc["agent_commission_dashboard"] = "[" + dashJSON + "]"
	var rows []map[string]any
	for _, m := range months(false) {
		rows = append(rows, map[string]any{"month_start": m.MonthStart, "received_cents": itoa(int(m.ReceivedCents)), "line_count": 1})
	}
	wd.fake.rpc["agent_commission_monthly"] = mustJSON(rows)
}

func TestDashboardPage(t *testing.T) {
	wd := newWorld(t)
	wd.seedDashboard()
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body,
		"Commissions", "Expected → invoiced → received. Reconciled against Inteletravel.",
		"YTD received", "$3,068", "+275% vs last year",
		"Expected · 90d", "$4,674", "5 trips",
		"At risk", "$26", "1 disputed",
		"Avg rate", "12.1%", "+0.1 pts vs last year",
		"Monthly trend · 12 months", "+301% vs the 12 months before",
		`href="/agent/commission/ledger?status=disputed"`,
		`data-h="93"`, "mny-bar-current",
		"October 2026", // the screen-reader table's last row
	)
	lacks(t, body,
		"Nothing received yet this year.", // the rate tile has a figure
		"No commission received in the last 12 months.",
		"data-repeat", // the sample row is gone by render time
	)
	// Cached nowhere: this page names clients and their money.
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control is %q", got)
	}
}

func TestDashboardQuietStates(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_commission_dashboard"] = `[{"as_of_date":"2026-10-11","currency":"USD",
	  "ytd_received_cents":"0","ly_received_cents":"0","avg_rate_pct":null,"ly_avg_rate_pct":null,
	  "upcoming_commission_cents":"0","upcoming_trip_count":0,"at_risk_cents":"0","disputed_count":0,
	  "trailing_12_cents":"0","prior_12_cents":"0"}]`
	var rows []map[string]any
	for _, m := range months(true) {
		rows = append(rows, map[string]any{"month_start": m.MonthStart, "received_cents": "0", "line_count": 0})
	}
	wd.fake.rpc["agent_commission_monthly"] = mustJSON(rows)

	body := wd.get("/agent/commission").Body.String()
	has(t, body,
		"Nothing received yet this year.",
		"Nothing priced in the next 90 days",
		"Nothing disputed",
		"No commission received in the last 12 months.",
	)
	// An empty book is not a drill: the At risk tile is a plain card, and the trend chip,
	// which would compare nothing with nothing, is not drawn.
	lacks(t, body, `href="/agent/commission/ledger?status=disputed"`, "vs the 12 months before")
}

func TestDashboardReadFailureIsNotAnEmptyBook(t *testing.T) {
	wd := newWorld(t)
	wd.seedDashboard()
	wd.fake.failing["agent_commission_monthly"] = true
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	body := rec.Body.String()
	has(t, body, "That didn’t load", "Message Gyasi")
	lacks(t, body, "$0", "YTD received")
}

func TestDashboardNoRowIsNotAnAgent(t *testing.T) {
	// No row is "not an agent", which the layout should already have caught. It is not an
	// empty dashboard — that is one row of zeros — so it gets the retry screen, not $0.
	wd := newWorld(t)
	wd.fake.rpc["agent_commission_dashboard"] = "[]"
	wd.fake.rpc["agent_commission_monthly"] = "[]"
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	has(t, rec.Body.String(), "That didn’t load")
}

func TestAdminGetsNoDesk(t *testing.T) {
	wd := newWorld(t)
	wd.fake.role = "admin"
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec.Body.String(), "You don’t have access to this view", "Sign out")
	lacks(t, rec.Body.String(), "YTD received")
}

func TestAClientIsSentHome(t *testing.T) {
	wd := newWorld(t)
	wd.fake.role = "client"
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/dashboard" {
		t.Fatalf("status %d to %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestAnAdvisorBelowAAL2FinishesSigningIn(t *testing.T) {
	wd := newWorld(t)
	wd.fake.aal = "aal1"
	rec := wd.get("/agent/commission")
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status %d", rec.Code)
	}
	if to := rec.Header().Get("Location"); !strings.HasPrefix(to, "/login/mfa") {
		t.Fatalf("sent to %q", to)
	}
}

// ── The ledger ──────────────────────────────────────────────────────────────────────────

func (wd *world) seedLedger(rows ...string) {
	wd.fake.rpc["agent_commission_ledger"] = "[" + strings.Join(rows, ",") + "]"
	wd.fake.rpc["agent_commission_ledger_summary"] = `[{"expected_count":5,"invoiced_count":2,
	  "received_count":10,"disputed_count":1,"lost_count":1,"total_count":19}]`
	wd.fake.rpc["agent_commission_ledger_suppliers"] = `[
	  {"supplier_id":"0195a2c0-1a00-7000-8000-000000000031","supplier_name":"Allianz Travel","line_count":2},
	  {"supplier_id":"0195a2c0-1a00-7000-8000-000000000030","supplier_name":"Sandals Resorts","line_count":17}]`
}

func TestLedgerPage(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger(ledgerRowJSON)
	rec := wd.get("/agent/commission/ledger")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body,
		"Commission ledger", "Every booking, every line.",
		"Getaway #2", "Noah Castillo", "Sandals Resorts", "Jun 29, 2026",
		"$2,700", "12%", "$324", "Received", "status-booked",
		`href="/agent/commission/ledger/01a0b1c2-d300-7000-8000-000000000077"`,
		// The chip counts are the whole ledger's, whatever else is filtered.
		"Expected", "Lost",
		">Sandals Resorts (17)</option>", ">Allianz Travel (2)</option>",
	)
	lacks(t, body,
		"No commission lines yet",
		"One trip:",
		"Clear filters", // nothing is filtered
		"data-repeat",
	)
	// 19 lines fit one page, so there is no paginator at all.
	lacks(t, body, "Ledger pages")
}

func TestLedgerCarriesItsFiltersIntoTheExportAndTheOptions(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger(ledgerRowJSON)
	body := wd.get("/agent/commission/ledger?status=lost&status=received&supplier=" + sandalsUUID).Body.String()
	has(t, body,
		`href="/agent/commission/ledger/export?status=lost&amp;status=received&amp;supplier=`+sandalsUUID+`"`,
		`value="`+sandalsUUID+`" data-slot="supplier-option" selected=""`,
		"Clear filters",
	)
	// The read was asked for exactly those statuses.
	var args map[string]any
	if err := json.Unmarshal([]byte(wd.fake.rpcArgs["agent_commission_ledger"]), &args); err != nil {
		t.Fatal(err)
	}
	statuses, _ := args["p_status"].([]any)
	if len(statuses) != 2 || statuses[0] != "lost" || statuses[1] != "received" {
		t.Fatalf("p_status is %v", args["p_status"])
	}
	if args["p_supplier_id"] != sandalsUUID || args["p_limit"].(float64) != 25 || args["p_offset"].(float64) != 0 {
		t.Fatalf("args are %v", args)
	}
}

func TestLedgerWithNoFilterAsksForEveryStatus(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger(ledgerRowJSON)
	wd.get("/agent/commission/ledger?page=3")
	var args map[string]any
	if err := json.Unmarshal([]byte(wd.fake.rpcArgs["agent_commission_ledger"]), &args); err != nil {
		t.Fatal(err)
	}
	if args["p_status"] != nil {
		t.Errorf("p_status is %v, want null", args["p_status"])
	}
	if args["p_offset"].(float64) != 50 {
		t.Errorf("p_offset is %v", args["p_offset"])
	}
}

func TestLedgerEmptyStates(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger()
	wd.fake.rpc["agent_commission_ledger_summary"] = `[{"expected_count":0,"invoiced_count":0,
	  "received_count":0,"disputed_count":0,"lost_count":0,"total_count":0}]`

	has(t, wd.get("/agent/commission/ledger").Body.String(),
		"No commission lines yet", "Use Add line to enter one, or import a statement from Inteletravel.")

	// A one-trip view with nothing in it says so; narrowed further, it is "nothing matches".
	has(t, wd.get("/agent/commission/ledger?trip="+tripUUID).Body.String(),
		"No lines for this trip yet", "Its forecast commission still shows on the trip",
		"One trip only", "Show every trip")
	has(t, wd.get("/agent/commission/ledger?trip="+tripUUID+"&status=lost").Body.String(),
		"Nothing matches", "Try another status, supplier or date range.")
}

func TestLedgerPastTheLastPageStartsOver(t *testing.T) {
	// A bookmark or a stale tab. An empty page carries no total_count to read, so it would
	// claim "no commission lines yet" over a ledger that has them.
	wd := newWorld(t)
	wd.seedLedger()
	rec := wd.get("/agent/commission/ledger?status=lost&page=4")
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status %d", rec.Code)
	}
	if to := rec.Header().Get("Location"); to != "/agent/commission/ledger?status=lost" {
		t.Fatalf("sent to %q", to)
	}
}

func TestLedgerPaginates(t *testing.T) {
	// total_count rides on every ROW and is the count before the page window; the summary's
	// own total is not what the pager reads.
	wd := newWorld(t)
	full := strings.Replace(ledgerRowJSON, `"total_count": 19`, `"total_count": 40`, 1)
	rows := make([]string, 0, 25)
	for range 25 {
		rows = append(rows, full)
	}
	wd.seedLedger(rows...)
	body := wd.get("/agent/commission/ledger").Body.String()
	has(t, body, "Ledger pages", "1–25 of 40", `href="/agent/commission/ledger?page=2"`)
	// Page 1 has no previous: the placeholder is there, the link is not.
	lacks(t, body, `href="/agent/commission/ledger?page=0"`)

	second := wd.get("/agent/commission/ledger?page=2").Body.String()
	has(t, second, "26–50 of 40", `href="/agent/commission/ledger"`)
}

func TestLedgerTripChipNamesTheTrip(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger(ledgerRowJSON)
	body := wd.get("/agent/commission/ledger?trip=" + tripUUID).Body.String()
	has(t, body,
		"One trip: Getaway #2",
		`href="/agent/commission/ledger"`, // show every trip
		`name="trip" value="`+tripUUID+`"`,
		`href="/agent/commission/ledger/new?trip=`+tripUUID+`"`,
	)
}

func TestLedgerReadFailureIsARetry(t *testing.T) {
	wd := newWorld(t)
	wd.seedLedger(ledgerRowJSON)
	wd.fake.failing["agent_commission_ledger_suppliers"] = true
	rec := wd.get("/agent/commission/ledger")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	has(t, rec.Body.String(), "That didn’t load")
	lacks(t, rec.Body.String(), "Getaway #2")
}
