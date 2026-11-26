package money

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
)

// §3.11's nine screens and the download route, driven through the real gate and session
// against the fake Supabase. What these pin, beyond "it renders":
//
//  1. THE SHELL SURVIVES A FAILED READ. The chips, the Export and the back link are built
//     from the QUERY, so an advisor whose read fell over can still move somewhere else.
//  2. URL-AS-STATE IS CARRIED BY EVERY LINK. #216 and #217 each shipped a bug where a link
//     or a form action dropped the query the fill reads, so the assertions are on the
//     HREFS, not only on the words beside them.
//  3. A FAILED READ IS 503 AND THE RETRY CARD, never an empty report: "$0" and "couldn't
//     load" are different answers on the screens an advisor does their taxes from.

const periodJSON = `[{"from_date":"2026-01-01","to_date":"2026-10-21","today":"2026-10-21"}]`

// seedReports gives every §3.11 read an answer, so one page's fixture cannot leave another
// page reading as an outage.
func seedReports(wd *world) {
	wd.fake.rpc["agent_report_period"] = periodJSON
	wd.fake.rpc["agent_report_revenue_by_month"] = `[
		{"month_start":"2026-09-01","cents":"2032500","item_count":2,"prior_cents":"1000000"},
		{"month_start":"2026-10-01","cents":"512000","item_count":1,"prior_cents":null}]`
	wd.fake.rpc["agent_report_commission_by_supplier"] = `[
		{"supplier_id":"s1","supplier_name":"Sandals Resorts","received_cents":"20000","owed_cents":"40000",
		 "line_count":2,"set_aside_count":1,"set_aside_received_cents":"1500"}]`
	wd.fake.rpc["agent_report_top_destinations"] = `[
		{"destination":"Nassau","trip_count":2,"value_cents":"116667"},
		{"destination":null,"trip_count":1,"value_cents":"30000"}]`
	wd.fake.rpc["agent_report_client_lifetime_value"] = clientFixture
	wd.fake.rpc["agent_report_conversion_funnel"] = `[
		{"stage":1,"reached":142,"open_here":30,"cancelled_here":58,"book_days_avg":7,"book_days_n":3},
		{"stage":2,"reached":54,"open_here":10,"cancelled_here":6,"book_days_avg":7,"book_days_n":3},
		{"stage":3,"reached":38,"open_here":6,"cancelled_here":0,"book_days_avg":7,"book_days_n":3},
		{"stage":4,"reached":32,"open_here":0,"cancelled_here":0,"book_days_avg":7,"book_days_n":3}]`
	wd.fake.rpc["agent_report_pipeline_stages"] = pipelineStagesFixture
	wd.fake.rpc["agent_report_pipeline_months"] = `[
		{"bucket":"past","month_start":null,"trip_count":1,"weighted_cents":"77777"},
		{"bucket":"month","month_start":"2026-12-01","trip_count":2,"weighted_cents":"88888"}]`
	wd.fake.rpc["agent_export_history"] = `[
		{"audit_id":"a1","event_type":"report.exported","created_at":"2026-10-21T20:04:00Z",
		 "created_local":"2026-10-21T15:04:00","metadata":{"report":"revenue","period":"12mo","basis":"received",
		 "from":"2025-11-01","to":"2026-10-21","row_count":12}}]`
	wd.fake.rpc["agent_report_lead_sources"] = `[
		{"source":"website","lead_count":18,"converted_count":7,"open_count":6,"closed_count":5}]`
	wd.fake.rpc["agent_report_lead_campaigns"] = `[{"utm_source":"spring-cruise-2027","lead_count":4,"converted_count":2}]`
}

// reportPaths are the nine screens and the one read each needs to go wrong for the retry
// card to show.
var reportPaths = []struct {
	path string
	read string
}{
	{"/agent/reports", ""},
	{"/agent/reports/revenue", "agent_report_revenue_by_month"},
	{"/agent/reports/suppliers", "agent_report_commission_by_supplier"},
	{"/agent/reports/destinations", "agent_report_top_destinations"},
	{"/agent/reports/clients", "agent_report_client_lifetime_value"},
	{"/agent/reports/funnel", "agent_report_conversion_funnel"},
	{"/agent/reports/pipeline", "agent_report_pipeline_stages"},
	{"/agent/reports/export", "agent_export_history"},
	{"/agent/reports/leads", "agent_report_lead_sources"},
}

func TestEveryReportRenders(t *testing.T) {
	for _, c := range reportPaths {
		t.Run(c.path, func(t *testing.T) {
			wd := newWorld(t)
			seedReports(wd)
			rec := wd.get(c.path)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s answered %d\n%s", c.path, rec.Code, wd.logs.String())
			}
			body := rec.Body.String()
			// A sample row left in the output is the failure page.Doc exists to stop; an
			// unfilled slot is a 500, and these pages all answered 200 above.
			lacks(t, body, "Sandals Resorts (17)")
			if c.path != "/agent/reports" {
				has(t, body, "Reports hub")
			}
		})
	}
}

func TestAReportThatCannotLoadSaysSo(t *testing.T) {
	for _, c := range reportPaths {
		if c.read == "" {
			continue // the hub reads nothing
		}
		t.Run(c.path, func(t *testing.T) {
			wd := newWorld(t)
			seedReports(wd)
			wd.fake.failing[c.read] = true
			rec := wd.get(c.path)
			// An outage, not the page: nothing that caches or indexes should keep it.
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("a failed read answered %d", rec.Code)
			}
			body := rec.Body.String()
			has(t, body, "That didn", "Try again")
			// The header survives, so the advisor can still move somewhere else.
			has(t, body, "Reports hub")
		})
	}
}

func TestAnAdminHasNoReports(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.role = "admin"
	rec := wd.get("/agent/reports/revenue")
	has(t, rec.Body.String(), "You don")
	// The page column is gone, not just hidden: no chips, no Export, no figures.
	lacks(t, rec.Body.String(), "Reports hub", "Booked value")
}

// ── 3.11.2 Revenue ──────────────────────────────────────────────────────────────────────

func TestRevenueCarriesItsStateOnEveryLink(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	rec := wd.get("/agent/reports/revenue?period=12mo&basis=received&compare=1")
	body := rec.Body.String()

	// The basis links keep the period and the compare switch; the period chips keep the
	// basis and the switch. A link that drops one of them loses the advisor's place.
	has(t, body,
		`href="/agent/reports/revenue?period=12mo&amp;compare=1"`,
		`href="/agent/reports/revenue?period=12mo&amp;basis=received&amp;compare=1"`,
		`href="/agent/reports/revenue?basis=received&amp;compare=1"`,
		// Compare is on, so the link turns it off and keeps everything else.
		`href="/agent/reports/revenue?period=12mo&amp;basis=received"`,
		"Hide last year",
	)
	// The Export is the report on screen, basis and all.
	has(t, body, `href="/agent/reports/download?report=revenue&amp;period=12mo&amp;basis=received"`)
	// The received view's own column heads and note.
	has(t, body, "Commission payments", "Commission that arrived from suppliers, by the day it came in.")
	lacks(t, body, "Tracking began Sep 19, 2026")
}

func TestRevenueHidesTheComparisonUntilThereIsALastYear(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.rpc["agent_report_revenue_by_month"] = `[{"month_start":"2026-10-01","cents":"512000","item_count":1,"prior_cents":null}]`
	body := wd.get("/agent/reports/revenue").Body.String()
	lacks(t, body, "Compare with last year", "Same month last year")
	// Booked is the default, so the booked note and the tracking footnote both show.
	has(t, body, "Each trip counts once", "Tracking began Sep 19, 2026")
}

// ── 3.11.5 Clients ──────────────────────────────────────────────────────────────────────

func TestClientCohortFilter(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	body := wd.get("/agent/reports/clients?cohort=2026-q3").Body.String()
	has(t, body, `href="/agent/reports/clients?cohort=none"`, `href="/agent/reports/clients"`, "Cy Young")
	lacks(t, body, "Bo Diddley")

	// An empty cohort is not an empty book, and says so.
	empty := wd.get("/agent/reports/clients?cohort=2020-q1").Body.String()
	has(t, empty, copyClientsCohortEmpty)
	lacks(t, empty, copyClientsEmpty)
}

func TestAnEmptyBookDrawsNoCohortChips(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.rpc["agent_report_client_lifetime_value"] = `[]`
	body := wd.get("/agent/reports/clients").Body.String()
	has(t, body, copyClientsEmpty)
	lacks(t, body, copyCohortAll)
}

// ── 3.11.7 Pipeline ─────────────────────────────────────────────────────────────────────

func TestPipelineWeightsEditMode(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)

	read := wd.get("/agent/reports/pipeline").Body.String()
	has(t, read, `href="/agent/reports/pipeline?edit=1"`, "Adjust weights", "$12,966", "12 trips, at full value")
	lacks(t, read, `name="weight-booked"`)

	edit := wd.get("/agent/reports/pipeline?edit=1").Body.String()
	has(t, edit, `name="weight-booked"`, `name="expected-booked"`, "Save weights",
		"Saving also changes your commission forecast and the confidence on your worklist.")
	lacks(t, edit, "Adjust weights")
}

func TestPipelineSaveWeights(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "40")
	}
	rec := wd.post("/agent/reports/pipeline", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/reports/pipeline" {
		t.Fatalf("a save answered %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	if len(wd.fake.calls) != 1 || wd.fake.calls[0].Name != "agent-commission" {
		t.Fatalf("the save called %+v", wd.fake.calls)
	}
	if got := string(wd.fake.calls[0].Body["op"]); got != `"weights"` {
		t.Errorf("the op is %s", got)
	}
}

func TestARefusedSaveStaysInEditModeWithItsSentence(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "40")
	}
	form.Set("weight-booked", "120")
	rec := wd.post("/agent/reports/pipeline", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a refused save answered %d", rec.Code)
	}
	body := rec.Body.String()
	// Still editable, with the reason on the screen: a refusal that drops the form would
	// lose every weight typed.
	has(t, body, copyWeightsInvalid, `name="weight-booked"`, "Save weights")
	if len(wd.fake.calls) != 0 {
		t.Errorf("a weight over 100 reached the function: %+v", wd.fake.calls)
	}
}

func TestAStaleSaveIsNamedAsStale(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.functions["POST agent-commission"] = reply{Status: http.StatusConflict, Body: `{"detail":"changed"}`}
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "40")
	}
	body := wd.post("/agent/reports/pipeline", form).Body.String()
	// Read off the 409, never off the function's English. The apostrophe is escaped in the
	// rendered page, so the assertion is on the escaped form.
	has(t, body, "These weights were changed somewhere else, so yours weren&#39;t saved.")
}

// ── 3.11.8 Export Center ────────────────────────────────────────────────────────────────

func TestExportCenterForm(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	body := wd.get("/agent/reports/export").Body.String()
	// A plain GET form to the download route: it needs no JavaScript to export.
	has(t, body, `action="/agent/reports/download"`, `method="get"`,
		`value="ledger"`, `value="milestones"`, "Commission ledger", "Payment milestones",
		`value="2026-01-01"`, `value="2026-10-21"`)
	// The history line names the export and repeats its exact settings.
	has(t, body, "Revenue by month · Commission received",
		`href="/agent/reports/download?report=revenue&amp;period=12mo&amp;basis=received"`,
		"Nov 1, 2025 to Oct 21, 2026 · 12 rows · Oct 21, 3:04 PM")
	// The Export Center IS the export: no Export button of its own.
	lacks(t, body, `href="/agent/reports/download?report=export`)
}

func TestExportCenterWithNoHistory(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.rpc["agent_export_history"] = `[]`
	body := wd.get("/agent/reports/export").Body.String()
	has(t, body, "Nothing exported yet.")
	lacks(t, body, "Run again")
}

// ── The download route ──────────────────────────────────────────────────────────────────

func TestReportDownload(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.functions["POST agent-report"] = reply{Status: 200, Body: `{"csv":"Month,Received\n","fileName":"revenue-2026.csv"}`}

	rec := wd.get("/agent/reports/download?report=revenue&period=12mo&basis=received")
	if rec.Code != http.StatusOK {
		t.Fatalf("the download answered %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="revenue-2026.csv"` {
		t.Errorf("disposition is %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache-control is %q", got)
	}
	// A byte-order mark first, or Excel reads UTF-8 as Windows-1252.
	if !strings.HasPrefix(rec.Body.String(), "\ufeff") {
		t.Error("the file has no byte-order mark")
	}
	if len(wd.fake.calls) != 1 {
		t.Fatalf("%d calls", len(wd.fake.calls))
	}
	body := wd.fake.calls[0].Body
	if string(body["op"]) != `"export"` || string(body["report"]) != `"revenue"` ||
		string(body["period"]) != `"12mo"` || string(body["basis"]) != `"received"` {
		t.Errorf("the function was asked for %v", body)
	}
}

func TestADownloadWithNoPeriodWhereThereIsNone(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.functions["POST agent-report"] = reply{Status: 200, Body: `{"csv":"a\n","fileName":"pipeline.csv"}`}
	// A period is passed anyway, and must not be forwarded: the function refuses one.
	wd.get("/agent/reports/download?report=pipeline&period=12mo")
	if _, ok := wd.fake.calls[0].Body["period"]; ok {
		t.Errorf("the pipeline export carried a period: %v", wd.fake.calls[0].Body)
	}
}

func TestTheExportCenterDownload(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.functions["POST agent-report"] = reply{Status: 200, Body: `{"csv":"a\n","fileName":"clients.csv"}`}

	wd.get("/agent/reports/download?type=clients&contact=1&from=2026-01-01&to=2026-10-21")
	body := wd.fake.calls[0].Body
	if string(body["op"]) != `"center"` || string(body["type"]) != `"clients"` || string(body["includeContact"]) != "true" {
		t.Errorf("the clients export was asked for %v", body)
	}
	// Lifetime value is lifetime: the dates never reach the function, whatever the URL says.
	if _, ok := body["from"]; ok {
		t.Errorf("a clients export carried dates: %v", body)
	}

	wd.fake.calls = nil
	wd.get("/agent/reports/download?type=trips&from=marchish&to=2026-10-21&contact=1")
	body = wd.fake.calls[0].Body
	// A value that is not SHAPED like a date is dropped rather than passed on; one that is
	// shaped right but impossible goes through, and the function refuses it in the words it
	// chooses. The contact switch belongs to Clients alone.
	if string(body["from"]) != "null" || string(body["to"]) != `"2026-10-21"` {
		t.Errorf("the dates arrived as %v", body)
	}
	if _, ok := body["includeContact"]; ok {
		t.Errorf("a trips export carried the contact switch: %v", body)
	}
}

func TestADownloadRefusesWhatItDoesNotKnow(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	for _, target := range []string{
		"/agent/reports/download?report=payroll",
		"/agent/reports/download?type=payroll",
		"/agent/reports/download",
	} {
		// A broken link, not a default: exporting a DIFFERENT report than the one asked for
		// would be an audited file nobody wanted.
		if rec := wd.get(target); rec.Code != http.StatusNotFound {
			t.Errorf("%s answered %d", target, rec.Code)
		}
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("an unknown report reached the function: %+v", wd.fake.calls)
	}
}

func TestADownloadIsNotReachableFromAnotherSite(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	// Stricter than refusing "cross-site": a page on a sibling subdomain is "same-site", and
	// an <img> there could otherwise run an audited export for a signed-in advisor.
	for _, site := range []string{"cross-site", "same-site"} {
		rec := wd.get("/agent/reports/download?report=revenue", [2]string{"Sec-Fetch-Site", site})
		if rec.Code != http.StatusForbidden {
			t.Errorf("a %s request answered %d", site, rec.Code)
		}
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("a cross-site request reached the function: %+v", wd.fake.calls)
	}
	// The advisor's own click, and a bookmark, both go through.
	wd.fake.functions["POST agent-report"] = reply{Status: 200, Body: `{"csv":"a\n","fileName":"revenue.csv"}`}
	for _, site := range []string{"same-origin", "none"} {
		rec := wd.get("/agent/reports/download?report=revenue", [2]string{"Sec-Fetch-Site", site})
		if rec.Code != http.StatusOK {
			t.Errorf("a %s request answered %d", site, rec.Code)
		}
	}
}

func TestADownloadShowsTheFunctionsOwnRefusal(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.functions["POST agent-report"] = reply{Status: 400, Body: `{"detail":"The From date comes after the To date."}`}
	rec := wd.get("/agent/reports/download?type=trips&from=2026-10-21&to=2026-01-01")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a refused export answered %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "The From date comes after the To date.") {
		t.Errorf("the refusal reads %q", rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/plain") {
		t.Errorf("a refusal was served as %q", got)
	}
}

func TestADownloadThatChangedShapeIsAFailureNotABlankFile(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	for _, body := range []string{`{"csv":"a\n"}`, `{"fileName":"x.csv"}`, `{"csv":"a\n","fileName":"../x.csv"}`} {
		wd.fake.functions["POST agent-report"] = reply{Status: 200, Body: body}
		rec := wd.get("/agent/reports/download?report=revenue")
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("%s answered %d", body, rec.Code)
		}
		if strings.Contains(rec.Header().Get("Content-Type"), "csv") {
			t.Errorf("%s was served as a CSV", body)
		}
	}
}

func TestHeadDoesNotRunAnAuditedExport(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	rec := wd.do(http.MethodHead, "/agent/reports/download?report=revenue")
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("HEAD answered %d, allow %q", rec.Code, rec.Header().Get("Allow"))
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("HEAD ran the export: %+v", wd.fake.calls)
	}
}

// ── What an independent review proved, and what now stops it coming back ────────────────

// A refusal re-renders from a FRESH read, so without an echo one bad field wipes the other
// three — and the hidden `expected` would be refreshed with them, which turns a stale save
// into a successful overwrite the next time Save is pressed.
func TestARefusedWeightsSaveKeepsWhatWasTyped(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "40")
	}
	form.Set("weight-proposal", "60")
	form.Set("weight-inquiry", "not a number")
	body := wd.post("/agent/reports/pipeline", form).Body.String()

	has(t, body,
		`name="weight-proposal" value="60"`,
		`name="weight-inquiry" value="not a number"`,
		// The lock's "what I saw" is the SUBMITTED one, not a fresh read.
		`name="expected-proposal" value="40"`,
	)
	// The stored weights must not be redrawn over the draft.
	lacks(t, body, `name="weight-proposal" value="50"`, `name="expected-proposal" value="50"`)
}

// Text on a card replaces its padded body with a bare string, so the sentence has its own
// slot inside it. Every other empty card on these screens is Kept, not Texted.
func TestTheEmptyClientsCardKeepsItsBody(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	wd.fake.rpc["agent_report_client_lifetime_value"] = `[]`
	body := wd.get("/agent/reports/clients").Body.String()
	// The card still holds its padded body and the sentence still wears its own type.
	kept := regexp.MustCompile(`data-slot="cli-empty">\s*<div class="card-content">\s*<p class="type-body2 text-secondary" data-slot="cli-empty-text">` + regexp.QuoteMeta(copyClientsEmpty))
	if !kept.MatchString(body) {
		t.Error("the empty clients card lost its body")
	}
}

// A chip's padding lives on its inner .chip-label, so the words go in the span.
func TestTheYearOverYearChipKeepsItsLabel(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	body := wd.get("/agent/reports/revenue").Body.String()
	has(t, body, `<span class="chip-label" data-slot="rev-change-label">`)
}

// The stopped column is flex: 0 0 190px, so a row that drops it has a wider track and draws
// its bar against a different 100%.
func TestEveryFunnelRowKeepsItsStoppedColumn(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	body := wd.get("/agent/reports/funnel").Body.String()
	rows := strings.Count(body, `class="mny-fun-row"`)
	stopped := strings.Count(body, `data-slot="fun-stopped"`)
	if rows != 4 || stopped != rows {
		t.Errorf("%d funnel rows but %d stopped columns", rows, stopped)
	}
}

// `?type=` names a type this route does not have: a broken link, not a fallthrough to the
// per-report branch.
func TestAnEmptyTypeIsNotAFallthrough(t *testing.T) {
	wd := newWorld(t)
	seedReports(wd)
	rec := wd.get("/agent/reports/download?type=&report=revenue")
	if rec.Code != http.StatusNotFound {
		t.Errorf("an empty type answered %d", rec.Code)
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("an empty type reached the function: %+v", wd.fake.calls)
	}
}
