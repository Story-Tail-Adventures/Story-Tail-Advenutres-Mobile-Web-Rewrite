package money

import (
	"encoding/json"
	"testing"
)

// §3.11's view models, a port of web/lib/agent/reportsView.test.ts. The SQL owns what is
// counted; these guard what the SCREEN says about it: the period in the URL, the year over
// year rule, the shares, and the honest labels for "nothing" (a NULL prior is not $0, a
// stopless trip is not dropped).
//
// Every fixture goes through JSON, the way PostgREST hands them over: bigint as a STRING,
// numeric as a number, and a missing column as absent rather than zero.

func rows[T any](t *testing.T, raw string) []T {
	t.Helper()
	var out []T
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestReportURL(t *testing.T) {
	t.Run("reads the period, basis and compare, with anything unknown as the default", func(t *testing.T) {
		for in, want := range map[string]string{"12mo": "12mo", "qtd": "qtd", "week": "ytd", "": "ytd"} {
			if got := readPeriod(in); got != want {
				t.Errorf("readPeriod(%q) = %q, want %q", in, got, want)
			}
		}
		if readBasis("received") != "received" || readBasis("gross") != "booked" {
			t.Error("readBasis took something other than received as received")
		}
		if !readCompare("1") || readCompare("yes") {
			t.Error("readCompare took something other than 1 as on")
		}
	})

	t.Run("leaves defaults out, so the bare URL is the canonical one", func(t *testing.T) {
		if got := reportStateHref("revenue", "ytd", "booked", false); got != "/agent/reports/revenue" {
			t.Errorf("the default state is %q", got)
		}
		want := "/agent/reports/revenue?period=12mo&basis=received&compare=1"
		if got := reportStateHref("revenue", "12mo", "received", true); got != want {
			t.Errorf("state href is %q, want %q", got, want)
		}
	})

	t.Run("keeps the basis and compare when the period changes, and marks the current chip", func(t *testing.T) {
		chips := periodChips("revenue", "qtd", "received", true)
		if len(chips) != 3 {
			t.Fatalf("%d chips", len(chips))
		}
		if chips[0].Label != "Year to date" || chips[1].Label != "Last 12 months" || chips[2].Label != "This quarter" {
			t.Errorf("chips are %q %q %q", chips[0].Label, chips[1].Label, chips[2].Label)
		}
		if chips[0].Selected || chips[1].Selected || !chips[2].Selected {
			t.Error("the wrong chip is current")
		}
		want := "/agent/reports/revenue?period=12mo&basis=received&compare=1"
		if chips[1].Href != want {
			t.Errorf("the 12mo chip drops state: %q", chips[1].Href)
		}
	})

	t.Run("exports to /download, with a basis only for revenue and no period where there is none", func(t *testing.T) {
		for _, c := range [][3]string{
			{reportExportHref("revenue", "12mo", "received"), "/agent/reports/download?report=revenue&period=12mo&basis=received", "revenue"},
			{reportExportHref("suppliers", "ytd", ""), "/agent/reports/download?report=suppliers&period=ytd", "suppliers"},
			{reportExportHref("pipeline", "ytd", ""), "/agent/reports/download?report=pipeline", "pipeline"},
			{reportExportHref("clients", "", ""), "/agent/reports/download?report=clients", "clients"},
		} {
			if c[0] != c[1] {
				t.Errorf("%s exports to %q, want %q", c[2], c[0], c[1])
			}
		}
	})

	t.Run("says the period's dates in words, with both years only when it crosses one", func(t *testing.T) {
		if got := periodRangeLabel("2026-01-01", "2026-10-21"); got != "Jan 1 to Oct 21, 2026" {
			t.Errorf("same-year range is %q", got)
		}
		if got := periodRangeLabel("2025-11-01", "2026-10-21"); got != "Nov 1, 2025 to Oct 21, 2026" {
			t.Errorf("crossing range is %q", got)
		}
		// Not "Invalid Date to ...": a caption that says less than nothing.
		if got := periodRangeLabel("", "2026-10-21"); got != "" {
			t.Errorf("a missing end is %q", got)
		}
	})
}

// ── 3.11.2 Revenue ──────────────────────────────────────────────────────────────────────

func TestRevenueReport(t *testing.T) {
	t.Run("totals the months and marks the advisor's current month", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[
			{"month_start":"2026-08-01","cents":"0","item_count":0,"prior_cents":null},
			{"month_start":"2026-09-01","cents":"2032500","item_count":2,"prior_cents":null},
			{"month_start":"2026-10-01","cents":"512000","item_count":1,"prior_cents":null}]`), "2026-10-21")
		if r.TotalLabel != "$25,445" {
			t.Errorf("total is %q", r.TotalLabel)
		}
		if r.Months[0].IsCurrent || r.Months[1].IsCurrent || !r.Months[2].IsCurrent {
			t.Error("the wrong month is current")
		}
		if r.Months[1].Label != "Sep" || r.Months[1].LongLabel != "September 2026" || r.Months[1].AmountLabel != "$20,325" {
			t.Errorf("September is %+v", r.Months[1])
		}
		if r.Months[0].HeightPct != 0 || r.Empty {
			t.Errorf("empty=%v, first bar %d%%", r.Empty, r.Months[0].HeightPct)
		}
	})

	t.Run("hides year over year until some month has a figure a year back", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[
			{"month_start":"2026-09-01","cents":"1000","item_count":1,"prior_cents":null},
			{"month_start":"2026-10-01","cents":"3000","item_count":1,"prior_cents":null}]`), "2026-10-21")
		if r.HasPrior || r.Change != "" {
			t.Errorf("hasPrior=%v change=%q", r.HasPrior, r.Change)
		}
	})

	t.Run("compares like for like: only months that HAVE a prior figure", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[
			{"month_start":"2026-09-01","cents":"9000","item_count":1,"prior_cents":null},
			{"month_start":"2026-10-01","cents":"1200","item_count":1,"prior_cents":"1000"}]`), "2026-10-21")
		// September's 9000 must not read as growth against nothing.
		if !r.HasPrior || r.Change != "+20% vs last year" {
			t.Errorf("change is %q", r.Change)
		}
		if r.Months[0].HasPrior || r.Months[1].PriorLabel != "$10" {
			t.Errorf("priors are %+v / %+v", r.Months[0], r.Months[1])
		}
	})

	t.Run("says a fall plainly, and no change as no change", func(t *testing.T) {
		one := func(cents, prior string) string {
			return revenueReport(rows[revenueRow](t,
				`[{"month_start":"2026-10-01","cents":"`+cents+`","item_count":1,"prior_cents":`+prior+`}]`),
				"2026-10-21").Change
		}
		if got := one("800", `"1000"`); got != "−20% vs last year" {
			t.Errorf("a fall reads %q", got)
		}
		if got := one("1000", `"1000"`); got != "Same as last year" {
			t.Errorf("no change reads %q", got)
		}
		// A prior month recorded as exactly 0 is data, but there is no base to change from.
		if got := one("1000", `"0"`); got != "" {
			t.Errorf("against a zero base the change reads %q", got)
		}
	})

	t.Run("draws this year and last on one scale, and a small month still shows", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[
			{"month_start":"2026-09-01","cents":"100000","item_count":1,"prior_cents":"200000"},
			{"month_start":"2026-10-01","cents":"100","item_count":1,"prior_cents":null}]`), "2026-10-21")
		if r.Months[0].PriorHeightPct <= r.Months[0].HeightPct {
			t.Errorf("last year's taller figure draws shorter: %d vs %d", r.Months[0].PriorHeightPct, r.Months[0].HeightPct)
		}
		if r.Months[1].HeightPct != 2 {
			t.Errorf("a $1 month draws at %d%%, not the 2%% sliver", r.Months[1].HeightPct)
		}
	})

	t.Run("reads a missing prior column as no prior, never as $0 last year", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[{"month_start":"2026-10-01","cents":"100","item_count":1}]`), "2026-10-21")
		if r.HasPrior {
			t.Error("a renamed column turned into a comparison")
		}
	})

	t.Run("is empty when every month is zero", func(t *testing.T) {
		r := revenueReport(rows[revenueRow](t, `[{"month_start":"2026-10-01","cents":"0","item_count":0}]`), "2026-10-21")
		if !r.Empty {
			t.Error("a month of zeros did not read as empty")
		}
	})
}

// ── 3.11.3 Suppliers ────────────────────────────────────────────────────────────────────

func supplierFixture(t *testing.T, raw string) *supplierReportView {
	t.Helper()
	return supplierReport(rows[supplierReportRow](t, raw), "2026-01-01", "2026-10-21")
}

func TestSupplierReport(t *testing.T) {
	t.Run("links each supplier to the ledger with the same travel dates", func(t *testing.T) {
		r := supplierFixture(t, `[{"supplier_id":"s1","supplier_name":"Sandals","received_cents":"20000",
			"owed_cents":"40000","line_count":1,"set_aside_count":0,"set_aside_received_cents":"0"}]`)
		want := "/agent/commission/ledger?supplier=s1&from=2026-01-01&to=2026-10-21"
		if r.Rows[0].Href != want {
			t.Errorf("the supplier links to %q, want %q", r.Rows[0].Href, want)
		}
	})

	t.Run("shares add to about 100 and the received part of each bar is its own split", func(t *testing.T) {
		r := supplierFixture(t, `[
			{"supplier_id":"s1","supplier_name":"One","received_cents":"20000","owed_cents":"40000","line_count":1,"set_aside_count":2,"set_aside_received_cents":"0"},
			{"supplier_id":"s2","supplier_name":"Two","received_cents":"50000","owed_cents":"0","line_count":1,"set_aside_count":0,"set_aside_received_cents":"0"}]`)
		if r.Rows[0].ShareLabel != "55%" || r.Rows[1].ShareLabel != "45%" {
			t.Errorf("shares are %q and %q", r.Rows[0].ShareLabel, r.Rows[1].ShareLabel)
		}
		if r.Rows[0].ReceivedPct != 33 || r.Rows[1].ReceivedPct != 100 {
			t.Errorf("received splits are %d and %d", r.Rows[0].ReceivedPct, r.Rows[1].ReceivedPct)
		}
		if r.ReceivedTotalLabel != "$700" || r.OwedTotalLabel != "$400" || r.SetAsideCount != 2 {
			t.Errorf("totals are %q / %q, %d set aside", r.ReceivedTotalLabel, r.OwedTotalLabel, r.SetAsideCount)
		}
	})

	t.Run("keeps a supplier with only disputed lines out of the table but in the footnote", func(t *testing.T) {
		r := supplierFixture(t, `[{"supplier_id":"s3","supplier_name":"Disputed Only","received_cents":"0",
			"owed_cents":"0","line_count":1,"set_aside_count":3,"set_aside_received_cents":"0"}]`)
		if len(r.Rows) != 0 || !r.Empty || r.SetAsideCount != 3 {
			t.Errorf("%d rows, empty=%v, %d set aside", len(r.Rows), r.Empty, r.SetAsideCount)
		}
		if r.SetAsideNote != "3 disputed or lost lines are set aside and not counted here." {
			t.Errorf("the footnote reads %q", r.SetAsideNote)
		}
		if got := suppliersSetAside(1, ""); got != "1 disputed or lost line is set aside and not counted here." {
			t.Errorf("one line reads %q", got)
		}
		if suppliersSetAside(0, "") != "" {
			t.Error("a footnote was written for nothing set aside")
		}
	})

	t.Run("names money already received on set-aside lines, so it does not vanish", func(t *testing.T) {
		r := supplierFixture(t, `[
			{"supplier_id":"s1","supplier_name":"One","received_cents":"20000","owed_cents":"0","line_count":1,"set_aside_count":1,"set_aside_received_cents":"1500"},
			{"supplier_id":"s2","supplier_name":"Two","received_cents":"100","owed_cents":"0","line_count":1,"set_aside_count":1,"set_aside_received_cents":"0"}]`)
		if r.SetAsideReceivedLabel != "$15" {
			t.Errorf("set-aside received is %q", r.SetAsideReceivedLabel)
		}
		want := "2 disputed or lost lines are set aside and not counted here, including $15 already received on them."
		if r.SetAsideNote != want {
			t.Errorf("the footnote reads %q", r.SetAsideNote)
		}
	})
}

// ── 3.11.4 Destinations ─────────────────────────────────────────────────────────────────

func TestDestinationReport(t *testing.T) {
	t.Run("labels the stopless row instead of dropping it, and totals to the cent", func(t *testing.T) {
		r := destinationReport(rows[destinationRow](t, `[
			{"destination":"Nassau","trip_count":2,"value_cents":"116667"},
			{"destination":"Exuma","trip_count":1,"value_cents":"33334"},
			{"destination":null,"trip_count":2,"value_cents":"30000"}]`), copyNoDestination)
		if r.Rows[2].Name != copyNoDestination || !r.Rows[2].Unnamed {
			t.Errorf("the stopless row is %+v", r.Rows[2])
		}
		if r.TotalLabel != "$1,800" {
			t.Errorf("total is %q", r.TotalLabel)
		}
		// Against the leader, not the total: the top bar is full.
		if r.Rows[0].SharePct != 100 {
			t.Errorf("the leader's bar is %d%%", r.Rows[0].SharePct)
		}
	})

	t.Run("is empty with no rows", func(t *testing.T) {
		if !destinationReport(nil, copyNoDestination).Empty {
			t.Error("no rows did not read as empty")
		}
	})

	t.Run("formats a negative value with a real minus instead of falling over", func(t *testing.T) {
		r := destinationReport(rows[destinationRow](t,
			`[{"destination":"Credit","trip_count":1,"value_cents":"-5000"}]`), copyNoDestination)
		if r.Rows[0].ValueLabel != "−$50" || r.Rows[0].SharePct != 0 {
			t.Errorf("a credit row is %+v", r.Rows[0])
		}
	})
}

// ── 3.11.5 Client lifetime value ────────────────────────────────────────────────────────

const clientFixture = `[
	{"client_id":"c1","display_name":"Bo Diddley","trip_count":1,"value_cents":"200000","commission_cents":"1000","cohort_start":null},
	{"client_id":"c2","display_name":"Ada Lovelace","trip_count":1,"value_cents":"150000","commission_cents":"1000","cohort_start":"2025-01-01"},
	{"client_id":"c3","display_name":"Cy Young","trip_count":1,"value_cents":"90000","commission_cents":"1000","cohort_start":"2026-07-01"}]`

func TestClientReport(t *testing.T) {
	t.Run("ranks the whole book and links each client to their page", func(t *testing.T) {
		r := clientReport(rows[clientValueRow](t, clientFixture), "")
		want := [][3]string{
			{"Bo Diddley", "$2,000", copyNoCohort},
			{"Ada Lovelace", "$1,500", "2025 Q1"},
			{"Cy Young", "$900", "2026 Q3"},
		}
		for i, w := range want {
			got := r.Rows[i]
			if got.Rank != i+1 || got.Name != w[0] || got.ValueLabel != w[1] || got.CohortLabel != w[2] {
				t.Errorf("row %d is %+v, want %v", i, got, w)
			}
		}
		if r.Rows[0].Href != "/agent/clients/c1" {
			t.Errorf("the client links to %q", r.Rows[0].Href)
		}
	})

	t.Run("filters by cohort and keeps each client's true rank", func(t *testing.T) {
		r := clientReport(rows[clientValueRow](t, clientFixture), "2026-q3")
		if len(r.Rows) != 1 || r.Rows[0].Rank != 3 || r.Rows[0].Name != "Cy Young" {
			t.Fatalf("the cohort holds %+v", r.Rows)
		}
		want := [][2]string{{copyCohortAll, "false"}, {"2026 Q3", "true"}, {"2025 Q1", "false"}, {copyNoCohort, "false"}}
		if len(r.Cohorts) != len(want) {
			t.Fatalf("%d chips", len(r.Cohorts))
		}
		for i, w := range want {
			sel := "false"
			if r.Cohorts[i].Selected {
				sel = "true"
			}
			if r.Cohorts[i].Label != w[0] || sel != w[1] {
				t.Errorf("chip %d is %q (selected %s), want %v", i, r.Cohorts[i].Label, sel, w)
			}
		}
		if r.Cohorts[3].Href != "/agent/reports/clients?cohort=none" {
			t.Errorf("the before-tracking chip points at %q", r.Cohorts[3].Href)
		}
		if r.Empty {
			t.Error("a filtered book read as empty")
		}
	})

	t.Run("reads only real cohort keys from the URL", func(t *testing.T) {
		for in, want := range map[string]string{"2025-q1": "2025-q1", "none": "none", "2025-q5": "", "drop table": ""} {
			if got := readCohort(in); got != want {
				t.Errorf("readCohort(%q) = %q, want %q", in, got, want)
			}
		}
		q4 := "2025-10-01"
		if got := cohortName(&q4); got != "2025 Q4" {
			t.Errorf("October is cohort %q", got)
		}
	})

	t.Run("is empty only when the book has nobody ranked", func(t *testing.T) {
		if !clientReport(nil, "").Empty {
			t.Error("an empty book did not read as empty")
		}
		r := clientReport(rows[clientValueRow](t, clientFixture), "2020-q1")
		if r.Empty || len(r.Rows) != 0 {
			t.Errorf("an empty cohort reads as empty=%v with %d rows", r.Empty, len(r.Rows))
		}
	})
}

// ── 3.11.6 Funnel ───────────────────────────────────────────────────────────────────────

func TestFunnelReport(t *testing.T) {
	t.Run("summarises inquiries to traveled, and splits each stop into open and cancelled", func(t *testing.T) {
		r := funnelReport(rows[funnelRow](t, `[
			{"stage":1,"reached":142,"open_here":30,"cancelled_here":58,"book_days_avg":7,"book_days_n":3},
			{"stage":2,"reached":54,"open_here":10,"cancelled_here":6,"book_days_avg":7,"book_days_n":3},
			{"stage":3,"reached":38,"open_here":6,"cancelled_here":0,"book_days_avg":7,"book_days_n":3},
			{"stage":4,"reached":32,"open_here":0,"cancelled_here":0,"book_days_avg":7,"book_days_n":3}]`))
		if r.Summary != "142 inquiries → 32 traveled · 22.5% made it all the way" {
			t.Errorf("summary is %q", r.Summary)
		}
		wantPct := []string{"100%", "38%", "26.8%", "22.5%"}
		for i, w := range wantPct {
			if r.Stages[i].PctLabel != w {
				t.Errorf("stage %d is %q, want %q", i+1, r.Stages[i].PctLabel, w)
			}
		}
		if r.Stages[0].StoppedLabel != "−88 · 30 still open, 58 cancelled" {
			t.Errorf("stage 1 stopped reads %q", r.Stages[0].StoppedLabel)
		}
		if r.Stages[2].StoppedLabel != "−6 · 6 still open" {
			t.Errorf("stage 3 stopped reads %q", r.Stages[2].StoppedLabel)
		}
		if r.Stages[3].StoppedLabel != "" {
			t.Errorf("the last stage claims a stop: %q", r.Stages[3].StoppedLabel)
		}
		if r.BookDaysLabel != "7.0 days on average from inquiry to booked, across 3 trips." {
			t.Errorf("days to book reads %q", r.BookDaysLabel)
		}
	})

	t.Run("says plainly when nothing has booked yet, and when nothing came in", func(t *testing.T) {
		none := funnelReport(rows[funnelRow](t, `[
			{"stage":1,"reached":2,"open_here":2,"cancelled_here":0,"book_days_avg":null,"book_days_n":0},
			{"stage":2,"reached":0,"open_here":0,"cancelled_here":0,"book_days_avg":null,"book_days_n":0},
			{"stage":3,"reached":0,"open_here":0,"cancelled_here":0,"book_days_avg":null,"book_days_n":0},
			{"stage":4,"reached":0,"open_here":0,"cancelled_here":0,"book_days_avg":null,"book_days_n":0}]`))
		if none.BookDaysLabel != copyBookDaysNone {
			t.Errorf("with nothing booked it reads %q", none.BookDaysLabel)
		}
		if none.Summary != "2 inquiries → 0 traveled · 0% made it all the way" {
			t.Errorf("summary is %q", none.Summary)
		}
		empty := funnelReport(rows[funnelRow](t, `[{"stage":1,"reached":0,"open_here":0,"cancelled_here":0,"book_days_avg":null,"book_days_n":0}]`))
		if !empty.Empty || empty.Summary != "0 inquiries → 0 traveled" {
			t.Errorf("an empty funnel is empty=%v with summary %q", empty.Empty, empty.Summary)
		}
	})

	t.Run("reads days to book whether PostgREST sends a number or a string", func(t *testing.T) {
		r := funnelReport(rows[funnelRow](t,
			`[{"stage":1,"reached":1,"open_here":0,"cancelled_here":0,"book_days_avg":"18.36","book_days_n":38}]`))
		if r.BookDaysLabel != "18.4 days on average from inquiry to booked, across 38 trips." {
			t.Errorf("days to book reads %q", r.BookDaysLabel)
		}
	})
}

// ── 3.11.7 Pipeline ─────────────────────────────────────────────────────────────────────

const pipelineStagesFixture = `[
	{"status":"inquiry","weight_pct":25,"trip_count":3,"gross_cents":"100005","weighted_cents":"25001","total_gross_cents":"1296594","total_weighted_cents":"817740"},
	{"status":"proposal","weight_pct":50,"trip_count":3,"gross_cents":"807701","weighted_cents":"403851","total_gross_cents":"1296594","total_weighted_cents":"817740"},
	{"status":"booked","weight_pct":100,"trip_count":3,"gross_cents":"177777","weighted_cents":"177777","total_gross_cents":"1296594","total_weighted_cents":"817740"},
	{"status":"in_progress","weight_pct":100,"trip_count":3,"gross_cents":"211111","weighted_cents":"211111","total_gross_cents":"1296594","total_weighted_cents":"817740"}]`

// pipelineMonthsFixture is the accessor's shape: past, twelve months, later, undated.
func pipelineMonthsFixture(t *testing.T) []pipelineMonthRow {
	t.Helper()
	raw := `[{"bucket":"past","month_start":null,"trip_count":1,"weighted_cents":"77777"},
		{"bucket":"month","month_start":"2026-12-01","trip_count":2,"weighted_cents":"88888"},
		{"bucket":"month","month_start":"2027-01-01","trip_count":1,"weighted_cents":"25000"}`
	for i := 2; i <= 11; i++ {
		raw += `,{"bucket":"month","month_start":"2027-` + pad2(int64(i)) + `-01","trip_count":0,"weighted_cents":"0"}`
	}
	raw += `,{"bucket":"later","month_start":null,"trip_count":1,"weighted_cents":"15001"},
		{"bucket":"undated","month_start":null,"trip_count":0,"weighted_cents":"0"}]`
	return rows[pipelineMonthRow](t, raw)
}

func TestPipelineReport(t *testing.T) {
	t.Run("leads with the totals and hands the weights card GROSS value per stage", func(t *testing.T) {
		r := pipelineReport(rows[pipelineStageRow](t, pipelineStagesFixture), pipelineMonthsFixture(t))
		if r.GrossLabel != "$12,966" || r.WeightedLabel != "$8,177" {
			t.Errorf("totals are %q and %q", r.GrossLabel, r.WeightedLabel)
		}
		if r.OpenSub != "12 trips, at full value" {
			t.Errorf("the open tile's second line is %q", r.OpenSub)
		}
		want := [][3]string{
			{"Inquiry", "100005", "$250"},
			{"Proposal", "807701", "$4,039"},
			{"Booked", "177777", "$1,778"},
			{"Traveling", "211111", "$2,111"},
		}
		for i, w := range want {
			s := r.Stages[i]
			if s.Label != w[0] || itoa64(int64(s.RawCents)) != w[1] || s.WeightedLabel != w[2] {
				t.Errorf("stage %d is %q %d %q, want %v", i, s.Label, s.RawCents, s.WeightedLabel, w)
			}
		}
	})

	t.Run("labels the year where it turns, and shows the set-apart rows only when they hold a trip", func(t *testing.T) {
		r := pipelineReport(rows[pipelineStageRow](t,
			`[{"status":"inquiry","weight_pct":20,"trip_count":1,"gross_cents":"1","weighted_cents":"0","total_gross_cents":"1","total_weighted_cents":"0"}]`),
			pipelineMonthsFixture(t))
		var monthsOnly, extras []pipelineMonth
		for _, m := range r.Months {
			if m.Extra {
				extras = append(extras, m)
			} else {
				monthsOnly = append(monthsOnly, m)
			}
		}
		for i, w := range []string{"Dec 2026", "Jan 2027", "Feb"} {
			if monthsOnly[i].Label != w {
				t.Errorf("month %d is %q, want %q", i, monthsOnly[i].Label, w)
			}
		}
		if len(extras) != 2 || extras[0].Label != "Start date passed · 1 trip" || extras[1].Label != "Later · 1 trip" {
			t.Errorf("the set-apart rows are %+v", extras)
		}
		if monthsOnly[0].BarPct != 100 || monthsOnly[2].BarPct != 0 {
			t.Errorf("bars are %d and %d", monthsOnly[0].BarPct, monthsOnly[2].BarPct)
		}
	})

	t.Run("scales the month bars against the months only, never a big undated figure", func(t *testing.T) {
		r := pipelineReport(nil, rows[pipelineMonthRow](t, `[
			{"bucket":"month","month_start":"2026-12-01","trip_count":1,"weighted_cents":"1000"},
			{"bucket":"undated","month_start":null,"trip_count":9,"weighted_cents":"900000"}]`))
		if r.Months[0].BarPct != 100 {
			t.Errorf("the only month draws at %d%%", r.Months[0].BarPct)
		}
		if !r.Months[1].Extra || r.Months[1].BarPct != 0 {
			t.Errorf("the undated row is %+v", r.Months[1])
		}
	})

	t.Run("drops a bucket it does not know, and says when nothing is open", func(t *testing.T) {
		r := pipelineReport(nil, rows[pipelineMonthRow](t, `[
			{"bucket":"overdue","month_start":null,"trip_count":3,"weighted_cents":"900"},
			{"bucket":"month","month_start":"2026-12-01","trip_count":2,"weighted_cents":"88888"}]`))
		if len(r.Months) != 1 || r.Months[0].Key != "2026-12-01" {
			t.Errorf("the calendar is %+v", r.Months)
		}
		if !r.Empty || r.GrossLabel != "$0" {
			t.Errorf("empty=%v gross=%q", r.Empty, r.GrossLabel)
		}
	})
}

// ── 3.11.8 Export Center ────────────────────────────────────────────────────────────────

func ledgerStatusValues() []string {
	out := make([]string, 0, len(commissionStatusFilters))
	for _, f := range commissionStatusFilters {
		out = append(out, f.Value)
	}
	return out
}

func historyFixture(t *testing.T, raw string) []exportHistoryItem {
	t.Helper()
	return exportHistory(rows[exportHistoryRow](t, raw), ledgerStatusValues())
}

func TestCenterExportHref(t *testing.T) {
	for _, c := range [2]string{
		centerExportHref("trips", "2026-01-01", "2026-10-21", false),
		centerExportHref("milestones", "2026-01-01", "2026-10-21", true),
	} {
		if c == "" {
			t.Fatal("empty href")
		}
	}
	if got := centerExportHref("trips", "2026-01-01", "2026-10-21", false); got != "/agent/reports/download?type=trips&from=2026-01-01&to=2026-10-21" {
		t.Errorf("a dated export is %q", got)
	}
	// Lifetime value is lifetime: no dates on a Clients file, and the switch is its alone.
	if got := centerExportHref("clients", "2026-01-01", "2026-10-21", true); got != "/agent/reports/download?type=clients&contact=1" {
		t.Errorf("a clients export is %q", got)
	}
	if got := centerExportHref("milestones", "2026-01-01", "2026-10-21", true); got != "/agent/reports/download?type=milestones&from=2026-01-01&to=2026-10-21" {
		t.Errorf("a milestones export carried the contact switch: %q", got)
	}
}

func TestExportHistory(t *testing.T) {
	t.Run("names each kind of export and rebuilds the same settings to run it again", func(t *testing.T) {
		items := historyFixture(t, `[
			{"audit_id":"a1","event_type":"report.exported","created_at":"2026-10-21T20:04:00Z","created_local":"2026-10-21T15:04:00","metadata":{"report":"clients","source":"export_center","from":null,"to":null,"include_contact":true,"row_count":12}},
			{"audit_id":"a2","event_type":"report.exported","created_at":"2026-10-21T20:04:00Z","created_local":"2026-10-21T15:04:00","metadata":{"report":"trips","source":"export_center","from":"2026-01-01","to":"2026-10-21","include_contact":false,"row_count":1}},
			{"audit_id":"a3","event_type":"report.exported","created_at":"2026-10-21T20:04:00Z","created_local":"2026-10-21T15:04:00","metadata":{"report":"revenue","period":"12mo","basis":"received","from":"2025-11-01","to":"2026-10-21","row_count":12}},
			{"audit_id":"a4","event_type":"commission.exported","created_at":"2026-10-21T20:04:00Z","created_local":"2026-10-21T15:04:00","metadata":{"row_count":4,"filters":{"status":["lost"],"supplier_id":null,"trip_id":null,"travel_from":"2026-01-01","travel_to":"2026-10-21"}}},
			{"audit_id":"a5","event_type":"report.exported","created_at":"2026-10-21T20:04:00Z","created_local":"2026-10-21T15:04:00","metadata":{"report":"pipeline","period":null,"from":null,"to":null,"row_count":18}}]`)
		wantTitles := []string{
			"Clients · with contact details",
			"Trips",
			"Revenue by month · Commission received",
			"Commission ledger",
			"Pipeline value",
		}
		if len(items) != len(wantTitles) {
			t.Fatalf("%d lines", len(items))
		}
		for i, w := range wantTitles {
			if items[i].Title != w {
				t.Errorf("line %d is %q, want %q", i, items[i].Title, w)
			}
		}
		if !items[0].WithContact || items[0].RunAgainHref != "/agent/reports/download?type=clients&contact=1" {
			t.Errorf("the clients line is %+v", items[0])
		}
		if items[0].Detail != "12 rows · Oct 21, 3:04 PM" {
			t.Errorf("detail is %q", items[0].Detail)
		}
		if items[1].Detail != "Jan 1 to Oct 21, 2026 · 1 row · Oct 21, 3:04 PM" {
			t.Errorf("detail is %q", items[1].Detail)
		}
		if items[2].RunAgainHref != "/agent/reports/download?report=revenue&period=12mo&basis=received" {
			t.Errorf("revenue repeats as %q", items[2].RunAgainHref)
		}
		if items[3].RunAgainHref != "/agent/commission/ledger/export?status=lost&from=2026-01-01&to=2026-10-21" {
			t.Errorf("the ledger repeats as %q", items[3].RunAgainHref)
		}
		if items[4].RunAgainHref != "/agent/reports/download?report=pipeline" {
			t.Errorf("the pipeline repeats as %q", items[4].RunAgainHref)
		}
	})

	t.Run("skips a row it does not know how to describe, and drops an impossible date", func(t *testing.T) {
		items := historyFixture(t, `[
			{"audit_id":"b1","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"payroll","source":"export_center"}},
			{"audit_id":"b2","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"mystery"}},
			{"audit_id":"b3","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"constructor"}},
			{"audit_id":"b4","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"trips","source":"export_center","from":"2026-99-99","to":"2026-10-21"}},
			{"audit_id":"b5","event_type":"client.merged","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{}}]`)
		if len(items) != 1 || items[0].Title != "Trips" || items[0].Detail != "Oct 21, 3:04 PM" {
			t.Errorf("the surviving lines are %+v", items)
		}
	})

	t.Run("tells a report's own lifetime-value export from the Export Center's client list", func(t *testing.T) {
		items := historyFixture(t, `[
			{"audit_id":"c1","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"clients","period":null,"from":null,"to":null,"row_count":9}},
			{"audit_id":"c2","event_type":"report.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"report":"clients","source":"export_center","include_contact":false,"row_count":9}}]`)
		if len(items) != 2 {
			t.Fatalf("%d lines", len(items))
		}
		if items[0].Title != copyClientsTitle || items[0].RunAgainHref != "/agent/reports/download?report=clients" {
			t.Errorf("the report's own export is %+v", items[0])
		}
		if items[1].Title != copyTypeClients || items[1].RunAgainHref != "/agent/reports/download?type=clients" {
			t.Errorf("the Export Center's client list is %+v", items[1])
		}
	})

	t.Run("replays only real ledger statuses", func(t *testing.T) {
		items := historyFixture(t, `[
			{"audit_id":"d1","event_type":"commission.exported","created_at":"","created_local":"2026-10-21T15:04:00","metadata":{"filters":{"status":["lost","bogus"],"travel_from":"2026-01-01","travel_to":"2026-02-01"}}}]`)
		if items[0].RunAgainHref != "/agent/commission/ledger/export?status=lost&from=2026-01-01&to=2026-02-01" {
			t.Errorf("a made-up status rode back in: %q", items[0].RunAgainHref)
		}
	})
}

// ── 3.11.9 Lead sources ─────────────────────────────────────────────────────────────────

func TestLeadSourcesReport(t *testing.T) {
	r := leadSourcesReport(rows[leadSourceRow](t, `[
		{"source":"website","lead_count":18,"converted_count":7,"open_count":6,"closed_count":5},
		{"source":"carrier_pigeon","lead_count":2,"converted_count":0,"open_count":2,"closed_count":0}]`),
		rows[leadCampaignRow](t, `[{"utm_source":"spring-cruise-2027","lead_count":4,"converted_count":2}]`))

	if r.Total != 20 || r.Clients != 7 || r.Empty {
		t.Errorf("totals are %d / %d, empty=%v", r.Total, r.Clients, r.Empty)
	}
	if r.Lines[0].Label != "Website form" {
		t.Errorf("the known source reads %q", r.Lines[0].Label)
	}
	// A source this screen does not know keeps its own value rather than reading as "Other".
	if r.Lines[1].Label != "carrier_pigeon" {
		t.Errorf("an unknown source reads %q", r.Lines[1].Label)
	}
	// Segments are shares of the LARGEST source, so the biggest row fills its track.
	if r.Lines[0].ClientsPct != "39" || r.Lines[0].OpenPct != "33" || r.Lines[0].ClosedPct != "28" {
		t.Errorf("the segments are %q / %q / %q", r.Lines[0].ClientsPct, r.Lines[0].OpenPct, r.Lines[0].ClosedPct)
	}
	if len(r.Campaigns) != 1 || r.Campaigns[0].Name != "spring-cruise-2027" {
		t.Errorf("campaigns are %+v", r.Campaigns)
	}
	if got := leadSourcesSummary(20, 7); got != "20 leads · 7 became clients" {
		t.Errorf("summary is %q", got)
	}
	if got := leadSourcesSummary(1, 1); got != "1 lead · 1 became a client" {
		t.Errorf("one lead reads %q", got)
	}
	if got := leadSourcesSummary(0, 0); got != "No leads yet in this period" {
		t.Errorf("no leads reads %q", got)
	}
}

func TestExportWhen(t *testing.T) {
	for in, want := range map[string]string{
		"2026-10-21T15:04:00": "Oct 21, 3:04 PM",
		"2026-10-21T00:30:00": "Oct 21, 12:30 AM",
		"2026-10-21T12:00:00": "Oct 21, 12:00 PM",
		"2026-01-01T09:05:12": "Jan 1, 9:05 AM",
		"not a time":          "",
		"":                    "",
	} {
		if got := exportWhen(in); got != want {
			t.Errorf("exportWhen(%q) = %q, want %q", in, got, want)
		}
	}
}

// A timestamp has to be a date a calendar has, not just a plausible one.
func TestExportWhenRefusesADateThatDoesNotExist(t *testing.T) {
	for _, bad := range []string{"2026-02-31T10:00:00", "2026-13-01T10:00:00", "2026-10-21T24:00:00"} {
		if got := exportWhen(bad); got != "" {
			t.Errorf("exportWhen(%q) = %q, want nothing", bad, got)
		}
	}
	if got := exportWhen("2026-02-28T10:00:00"); got != "Feb 28, 10:00 AM" {
		t.Errorf("a real February day reads %q", got)
	}
}
