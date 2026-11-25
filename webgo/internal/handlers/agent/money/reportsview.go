package money

import (
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// §3.11's view models, a port of web/lib/agent/reportsView.ts. Pure: every figure is
// formatted here and the handlers only place the strings, so the tests drive the shaping
// without a page.
//
// Money is USD only (BRD §3, `trip_currency_usd`), so every amount formats as USD rather
// than being labelled from a currency column the reports do not return.

// ── The period and the URL ──────────────────────────────────────────────────────────────

// reportPeriods are the three windows. The two revenue bases are the page's own pair of
// links rather than a list here: there are two of them and they never move.
var reportPeriods = []string{"ytd", "12mo", "qtd"}

// readPeriod: anything unknown is the default, never an error page — a URL is typed by people.
func readPeriod(v string) string {
	if slices.Contains(reportPeriods, v) {
		return v
	}
	return "ytd"
}

func readBasis(v string) string {
	if v == "received" {
		return "received"
	}
	return "booked"
}

func readCompare(v string) bool { return v == "1" }

var cohortPattern = regexp.MustCompile(`^(\d{4}-q[1-4]|none)$`)

// readCohort: "2025-q1" or "none"; anything else is every client.
func readCohort(v string) string {
	if cohortPattern.MatchString(v) {
		return v
	}
	return ""
}

func reportHref(id string) string { return "/agent/reports/" + id }

// reportStateHref is a report's own URL with its state. Defaults are left out, so the bare
// URL is canonical.
//
// URL-AS-STATE: every control on a report is a link, and the period, the basis and the
// compare switch live in the query. Anything a fill reads off the query has to be on every
// link and form action that can land back on that fill (#216 and #217 both shipped a bug of
// exactly this shape).
func reportStateHref(id, period, basis string, compare bool) string {
	// URLSearchParams keeps insertion order and these URLs are shared links, so the query is
	// built in that order rather than sorted as url.Values.Encode would.
	var q query
	if period != "ytd" {
		q.add("period", period)
	}
	if basis != "" && basis != "booked" {
		q.add("basis", basis)
	}
	if compare {
		q.add("compare", "1")
	}
	return q.on(reportHref(id))
}

// query builds a search string in the order the parts were added.
type query struct{ parts []string }

func (q *query) add(k, v string) {
	q.parts = append(q.parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
}

func (q query) on(path string) string {
	if len(q.parts) == 0 {
		return path
	}
	return path + "?" + strings.Join(q.parts, "&")
}

// noPeriodReports take no period: lifetime value is lifetime, and the pipeline is today.
var noPeriodReports = []string{"clients", "pipeline"}

// reportExportHref is the CSV for the report on screen. A plain link, never a prefetched
// one: the GET writes an audit row.
func reportExportHref(report, period, basis string) string {
	var q query
	q.add("report", report)
	if !slices.Contains(noPeriodReports, report) && period != "" {
		q.add("period", period)
	}
	if report == "revenue" {
		if basis == "" {
			basis = "booked"
		}
		q.add("basis", basis)
	}
	return q.on("/agent/reports/download")
}

// centerExportHref is the Export Center's own download, as a history line repeats it.
func centerExportHref(kind, from, to string, withContact bool) string {
	var q query
	q.add("type", kind)
	// Lifetime value is lifetime: the Clients export takes no dates, and the contact switch
	// belongs to it alone.
	if kind != "clients" && from != "" && to != "" {
		q.add("from", from)
		q.add("to", to)
	}
	if kind == "clients" && withContact {
		q.add("contact", "1")
	}
	return q.on("/agent/reports/download")
}

// periodChip is one window chip in the shell.
type periodChip struct {
	Period   string
	Label    string
	Href     string
	Selected bool
}

func periodChips(id, current, basis string, compare bool) []periodChip {
	out := make([]periodChip, 0, len(reportPeriods))
	for _, p := range reportPeriods {
		out = append(out, periodChip{
			Period:   p,
			Label:    periodNames[p],
			Href:     reportStateHref(id, p, basis, compare),
			Selected: p == current,
		})
	}
	return out
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────

// usd is reportsView's own: whole dollars, and a NEGATIVE gets a real minus sign. The schema
// does not forbid a negative trip total (a credit component), so a report must not fall over
// on one — and formatMoney's ASCII hyphen is not the glyph the rest of §3.11 uses.
func usd(v Cents) string {
	if v < 0 {
		return "−" + money(-v)
	}
	return money(v)
}

// shortDay is "Jan 1"; travelDateLabel is the long form, "Jan 1, 2026".
func shortDay(iso string) string {
	d, ok := parseDay(iso)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%s %d", shortMonths[d.Month()-1], d.Day())
}

// periodRangeLabel is "Jan 1 to Oct 21, 2026", with both years when the window crosses one.
// "" when either end is not a date: Next would print "Invalid Date", which says less than
// nothing on a window caption.
func periodRangeLabel(from, to string) string {
	fromD, okF := parseDay(from)
	toD, okT := parseDay(to)
	if !okF || !okT {
		return ""
	}
	head := travelDateLabel(from)
	if fromD.Year() == toD.Year() {
		head = shortDay(from)
	}
	return head + " to " + travelDateLabel(to)
}

// heightPct is 0-100 against the largest value with headroom; anything above zero is at
// least 2, so a small month is still a bar.
func heightPct(v, max Cents) int {
	if max <= 0 || v <= 0 {
		return 0
	}
	return int(math.Max(2, jsRound(float64(v)/(float64(max)*1.08)*100)))
}

// sharePct is a share of a total, 0-100, at least 1 for anything above zero.
func sharePct(v, total Cents) int {
	if total <= 0 || v <= 0 {
		return 0
	}
	return int(math.Max(1, jsRound(float64(v)/float64(total)*100)))
}

// ── 3.11.2 Revenue by Month ─────────────────────────────────────────────────────────────

// revenueRow is one row of agent_report_revenue_by_month. PriorCents is null (not "0") when
// that month a year earlier had nothing in it, which is why it is a pointer: a missing
// column decoded as 0 would switch year over year on with a made-up comparison.
type revenueRow struct {
	MonthStart string `json:"month_start"`
	Cents      Cents  `json:"cents"`
	ItemCount  int    `json:"item_count"`
	PriorCents *Cents `json:"prior_cents"`
}

type revenueMonth struct {
	MonthStart string
	// Label is "Oct", under the bar; LongLabel is "October 2026", for the table.
	Label          string
	LongLabel      string
	AmountLabel    string
	CountLabel     string
	HeightPct      int
	PriorLabel     string
	HasPrior       bool
	PriorHeightPct int
	IsCurrent      bool
}

type revenueReportView struct {
	Months     []revenueMonth
	TotalLabel string
	Empty      bool
	// HasPrior is true once ANY month in the window has a figure a year back.
	HasPrior bool
	// Change is "+22% vs last year" over the months that have a prior figure, or "".
	Change string
}

func revenueReport(rows []revenueRow, today string) *revenueReportView {
	var maxV Cents
	for _, r := range rows {
		maxV = max(maxV, r.Cents)
		if r.PriorCents != nil {
			maxV = max(maxV, *r.PriorCents)
		}
	}
	currentMonth := ""
	if len(today) >= 7 {
		currentMonth = today[:7] + "-01"
	}

	out := &revenueReportView{Empty: true}
	var total, nowCompared, before Cents
	for _, r := range rows {
		total += r.Cents
		if r.Cents != 0 {
			out.Empty = false
		}
		if r.PriorCents != nil {
			out.HasPrior = true
			// Like for like: only the months that have a figure a year back are compared,
			// so a window whose earlier months predate any records cannot read as growth.
			nowCompared += r.Cents
			before += *r.PriorCents
		}
	}
	for _, r := range rows {
		m := revenueMonth{
			MonthStart:  r.MonthStart,
			Label:       monthShort(r.MonthStart),
			LongLabel:   monthLong(r.MonthStart),
			AmountLabel: usd(r.Cents),
			CountLabel:  itoa(r.ItemCount),
			HeightPct:   heightPct(r.Cents, maxV),
			IsCurrent:   r.MonthStart == currentMonth,
		}
		if r.PriorCents != nil {
			m.HasPrior = true
			m.PriorLabel = usd(*r.PriorCents)
			m.PriorHeightPct = heightPct(*r.PriorCents, maxV)
		}
		out.Months = append(out.Months, m)
	}
	out.TotalLabel = usd(total)
	if out.HasPrior {
		if pct, ok := percentChange(nowCompared, before); ok {
			out.Change = reportChangeVsLastYear(pct)
		}
	}
	return out
}

// ── 3.11.3 Commission by Supplier ───────────────────────────────────────────────────────

type supplierReportRow struct {
	SupplierID            string `json:"supplier_id"`
	SupplierName          string `json:"supplier_name"`
	ReceivedCents         Cents  `json:"received_cents"`
	OwedCents             Cents  `json:"owed_cents"`
	LineCount             int    `json:"line_count"`
	SetAsideCount         int    `json:"set_aside_count"`
	SetAsideReceivedCents Cents  `json:"set_aside_received_cents"`
}

type supplierLine struct {
	SupplierID string
	Name       string
	// Href is the ledger, filtered to this supplier and the same travel dates.
	Href          string
	ReceivedLabel string
	OwedLabel     string
	TotalLabel    string
	SharePct      int
	ShareLabel    string
	// ReceivedPct is the received part of this supplier's bar, as a percent of the bar.
	ReceivedPct int
}

type supplierReportView struct {
	Rows               []supplierLine
	ReceivedTotalLabel string
	OwedTotalLabel     string
	SetAsideCount      int
	// SetAsideReceivedLabel is money that DID arrive on disputed or lost lines: named in the
	// footnote, summed nowhere, because Revenue's "Commission received" counts it.
	SetAsideReceivedLabel string
	SetAsideNote          string
	Empty                 bool
}

func supplierReport(rows []supplierReportRow, from, to string) *supplierReportView {
	// A supplier whose only lines are disputed or lost has no money to draw; it still feeds
	// the set-aside footnote.
	var shown []supplierReportRow
	var total, receivedTotal, owedTotal, setAsideReceived Cents
	setAside := 0
	for _, r := range rows {
		setAside += r.SetAsideCount
		setAsideReceived += r.SetAsideReceivedCents
		if r.ReceivedCents+r.OwedCents > 0 {
			shown = append(shown, r)
			total += r.ReceivedCents + r.OwedCents
			receivedTotal += r.ReceivedCents
			owedTotal += r.OwedCents
		}
	}

	out := &supplierReportView{
		ReceivedTotalLabel: usd(receivedTotal),
		OwedTotalLabel:     usd(owedTotal),
		Empty:              len(shown) == 0,
	}
	out.SetAsideCount = setAside
	if setAsideReceived > 0 {
		out.SetAsideReceivedLabel = usd(setAsideReceived)
	}
	out.SetAsideNote = suppliersSetAside(setAside, out.SetAsideReceivedLabel)

	for _, r := range shown {
		share := sharePct(r.ReceivedCents+r.OwedCents, total)
		line := supplierLine{
			SupplierID: r.SupplierID,
			Name:       r.SupplierName,
			Href: ledgerQuery{
				SupplierID: r.SupplierID,
				TravelFrom: from,
				TravelTo:   to,
				Page:       1,
			}.href(),
			ReceivedLabel: usd(r.ReceivedCents),
			OwedLabel:     usd(r.OwedCents),
			TotalLabel:    usd(r.ReceivedCents + r.OwedCents),
			SharePct:      share,
			ShareLabel:    itoa(share) + "%",
		}
		if r.ReceivedCents+r.OwedCents > 0 {
			line.ReceivedPct = int(jsRound(float64(r.ReceivedCents) / float64(r.ReceivedCents+r.OwedCents) * 100))
		}
		out.Rows = append(out.Rows, line)
	}
	return out
}

// ── 3.11.4 Top Destinations ─────────────────────────────────────────────────────────────

type destinationRow struct {
	Destination *string `json:"destination"`
	TripCount   int     `json:"trip_count"`
	ValueCents  Cents   `json:"value_cents"`
}

type destinationLine struct {
	Name string
	// Unnamed is the NULL row: trips with no stop yet. Drawn quieter, never dropped.
	Unnamed    bool
	TripsLabel string
	ValueLabel string
	SharePct   int
}

type destinationReportView struct {
	Rows       []destinationLine
	TotalLabel string
	Empty      bool
}

func destinationReport(rows []destinationRow, noDestination string) *destinationReportView {
	// The SQL splits each trip's value across its stops in whole cents, so this sum is
	// exactly the trips' total; no stop is counted twice in money.
	var total, maxV Cents
	for _, r := range rows {
		total += r.ValueCents
		maxV = max(maxV, r.ValueCents)
	}
	out := &destinationReportView{TotalLabel: usd(total), Empty: len(rows) == 0}
	for _, r := range rows {
		name := noDestination
		if r.Destination != nil {
			name = *r.Destination
		}
		out.Rows = append(out.Rows, destinationLine{
			Name:       name,
			Unnamed:    r.Destination == nil,
			TripsLabel: itoa(r.TripCount),
			ValueLabel: usd(r.ValueCents),
			// Against the leader, not the total: a ranking reads best when the top bar is full.
			SharePct: sharePct(r.ValueCents, maxV),
		})
	}
	return out
}

// ── 3.11.5 Client Lifetime Value ────────────────────────────────────────────────────────

type clientValueRow struct {
	ClientID        string  `json:"client_id"`
	DisplayName     string  `json:"display_name"`
	TripCount       int     `json:"trip_count"`
	ValueCents      Cents   `json:"value_cents"`
	CommissionCents Cents   `json:"commission_cents"`
	CohortStart     *string `json:"cohort_start"`
}

// cohortKey is "2025-q1" from "2025-01-01"; "none" for NULL (before tracking). cohort_start
// is a quarter start, so the division is exact; integer division keeps a stray month inside
// its own quarter rather than printing a fraction the way the TypeScript would.
func cohortKey(iso *string) string {
	if iso == nil {
		return "none"
	}
	d, ok := parseDay(*iso)
	if !ok {
		return "none"
	}
	return fmt.Sprintf("%d-q%d", d.Year(), (int(d.Month())+2)/3)
}

// cohortName is "2025 Q1", or "Before tracking". It matches the CSV's own label.
func cohortName(iso *string) string {
	if iso == nil {
		return copyNoCohort
	}
	d, ok := parseDay(*iso)
	if !ok {
		return copyNoCohort
	}
	return fmt.Sprintf("%d Q%d", d.Year(), (int(d.Month())+2)/3)
}

type clientLine struct {
	ClientID        string
	Rank            int
	Name            string
	Href            string
	TripsLabel      string
	ValueLabel      string
	CommissionLabel string
	CohortLabel     string
}

type cohortChip struct {
	Key      string
	Label    string
	Href     string
	Selected bool
}

type clientReportView struct {
	Rows    []clientLine
	Cohorts []cohortChip
	// Empty: the book has no ranked client at all, as opposed to an empty cohort.
	Empty bool
}

func clientReport(rows []clientValueRow, cohort string) *clientReportView {
	out := &clientReportView{Empty: len(rows) == 0}

	href := func(key string) string {
		if key == "" {
			return reportHref("clients")
		}
		var q query
		q.add("cohort", key)
		return q.on(reportHref("clients"))
	}
	out.Cohorts = []cohortChip{{Key: "", Label: copyCohortAll, Href: href(""), Selected: cohort == ""}}

	// Newest cohort first, "before tracking" last. Rank is over the whole book, so filtering
	// to a cohort keeps each client's true rank.
	type cohortSeen struct {
		key string
		iso *string
	}
	var keys []cohortSeen
	seen := map[string]bool{}
	for i, r := range rows {
		key := cohortKey(r.CohortStart)
		if !seen[key] {
			seen[key] = true
			keys = append(keys, cohortSeen{key: key, iso: r.CohortStart})
		}
		if cohort != "" && key != cohort {
			continue
		}
		out.Rows = append(out.Rows, clientLine{
			ClientID:        r.ClientID,
			Rank:            i + 1,
			Name:            r.DisplayName,
			Href:            "/agent/clients/" + r.ClientID,
			TripsLabel:      itoa(r.TripCount),
			ValueLabel:      usd(r.ValueCents),
			CommissionLabel: usd(r.CommissionCents),
			CohortLabel:     cohortName(r.CohortStart),
		})
	}
	sort.SliceStable(keys, func(i, j int) bool {
		a, b := keys[i].key, keys[j].key
		if a == "none" {
			return false
		}
		if b == "none" {
			return true
		}
		return a > b
	})
	for _, k := range keys {
		out.Cohorts = append(out.Cohorts, cohortChip{
			Key: k.key, Label: cohortName(k.iso), Href: href(k.key), Selected: k.key == cohort,
		})
	}
	return out
}

// ── 3.11.6 Conversion Funnel ────────────────────────────────────────────────────────────

type funnelRow struct {
	Stage         int  `json:"stage"`
	Reached       int  `json:"reached"`
	OpenHere      int  `json:"open_here"`
	CancelledHere int  `json:"cancelled_here"`
	BookDaysAvg   Rate `json:"book_days_avg"`
	BookDaysN     int  `json:"book_days_n"`
}

type funnelStage struct {
	Stage        int
	Label        string
	Reached      int
	ReachedLabel string
	// PctWidth is the bar's width as a whole percent money.css has a rule for; PctLabel is
	// the same share in words, to a tenth, as the artboard prints it.
	PctWidth      string
	PctLabel      string
	OpenHere      int
	CancelledHere int
	// StoppedLabel is "−22 · 15 still open, 7 cancelled", or "" when nobody stopped here.
	StoppedLabel string
	// Last: the end of the road, where nobody "stops".
	Last bool
}

type funnelReportView struct {
	Stages        []funnelStage
	Summary       string
	BookDaysLabel string
	Empty         bool
}

// pctTenth is Intl's maximumFractionDigits: 1 — "22.5%", but "40%" with no trailing zero.
func pctTenth(v float64) string {
	s := toFixed(v, 1)
	s = strings.TrimSuffix(s, ".0")
	return s
}

func funnelReport(rows []funnelRow) *funnelReportView {
	byStage := map[int]funnelRow{}
	for _, r := range rows {
		byStage[r.Stage] = r
	}
	top := byStage[1].Reached

	out := &funnelReportView{Empty: top == 0}
	last := len(funnelStageLabels) - 1
	for i, label := range funnelStageLabels {
		r := byStage[i+1]
		pct := 0.0
		if top > 0 {
			pct = float64(r.Reached) / float64(top) * 100
		}
		s := funnelStage{
			Stage: i + 1, Label: label, Reached: r.Reached, ReachedLabel: itoa(r.Reached),
			PctWidth: meterStep(int(jsRound(pct))), PctLabel: pctTenth(pct) + "%",
			OpenHere: r.OpenHere, CancelledHere: r.CancelledHere, Last: i == last,
		}
		if i < last {
			s.StoppedLabel = funnelStopped(r.OpenHere, r.CancelledHere)
		}
		out.Stages = append(out.Stages, s)
	}

	traveled := out.Stages[last].Reached
	pct := ""
	if top > 0 {
		pct = pctTenth(float64(traveled)/float64(top)*100) + "%"
	}
	out.Summary = funnelSummary(top, traveled, pct)

	out.BookDaysLabel = copyBookDaysNone
	if len(rows) > 0 && rows[0].BookDaysAvg.Set && rows[0].BookDaysN > 0 {
		out.BookDaysLabel = funnelBookDays(toFixed(rows[0].BookDaysAvg.Value, 1), rows[0].BookDaysN)
	}
	return out
}

// ── 3.11.7 Pipeline Value ───────────────────────────────────────────────────────────────

type pipelineStageRow struct {
	Status             string `json:"status"`
	WeightPct          int    `json:"weight_pct"`
	TripCount          int    `json:"trip_count"`
	GrossCents         Cents  `json:"gross_cents"`
	WeightedCents      Cents  `json:"weighted_cents"`
	TotalGrossCents    Cents  `json:"total_gross_cents"`
	TotalWeightedCents Cents  `json:"total_weighted_cents"`
}

type pipelineMonthRow struct {
	Bucket        string  `json:"bucket"`
	MonthStart    *string `json:"month_start"`
	TripCount     int     `json:"trip_count"`
	WeightedCents Cents   `json:"weighted_cents"`
}

type pipelineMonth struct {
	Key         string
	Label       string
	AmountLabel string
	BarPct      int
	// Extra: the `past`, `later` and `undated` rows, drawn apart from the months.
	Extra bool
}

type pipelineReportView struct {
	GrossLabel    string
	WeightedLabel string
	OpenSub       string
	// Stages is the weights card's rows; RawCents is GROSS value here (it is commission on
	// §3.7.7), which is what the as-you-type preview multiplies.
	Stages []stageView
	Months []pipelineMonth
	Empty  bool
}

// pipelineExtras are the three buckets drawn apart from the twelve months. A bucket this
// file does not know is dropped rather than drawn as a month it is not.
var pipelineExtras = map[string]string{
	"past":    copyPastStart,
	"later":   copyRptLater,
	"undated": copyRptUndated,
}

func pipelineReport(stageRows []pipelineStageRow, monthRows []pipelineMonthRow) *pipelineReportView {
	var gross, weighted Cents
	if len(stageRows) > 0 {
		gross, weighted = stageRows[0].TotalGrossCents, stageRows[0].TotalWeightedCents
	}
	trips := 0
	for _, s := range stageRows {
		trips += s.TripCount
	}

	out := &pipelineReportView{
		GrossLabel:    usd(gross),
		WeightedLabel: usd(weighted),
		OpenSub:       pipelineOpenSub(trips),
		Empty:         trips == 0,
	}
	for _, s := range stageRows {
		if !isForecastStage(s.Status) {
			continue
		}
		out.Stages = append(out.Stages, stageView{
			Stage:          s.Status,
			Label:          stageLabel[s.Status],
			WeightPct:      s.WeightPct,
			TripCount:      s.TripCount,
			TripCountLabel: forecastTripCount(s.TripCount),
			RawCents:       s.GrossCents,
			WeightedLabel:  usd(s.WeightedCents),
		})
	}

	var shown []pipelineMonthRow
	// Bars are scaled against the MONTHS only: the extra rows draw no bar, and a large
	// undated figure would otherwise shrink every month to a sliver.
	maxV := Cents(1)
	for _, r := range monthRows {
		if r.Bucket == "month" {
			shown = append(shown, r)
			maxV = max(maxV, r.WeightedCents)
			continue
		}
		if _, ok := pipelineExtras[r.Bucket]; ok && r.TripCount > 0 {
			shown = append(shown, r)
		}
	}

	first := true
	for _, r := range shown {
		m := pipelineMonth{AmountLabel: usd(r.WeightedCents), Extra: r.Bucket != "month"}
		if r.Bucket == "month" && r.MonthStart != nil {
			m.Key = *r.MonthStart
			m.Label = forecastMonthLabel(*r.MonthStart, first)
			first = false
			if r.WeightedCents > 0 {
				m.BarPct = min(100, int(math.Max(2, jsRound(float64(r.WeightedCents)/float64(maxV)*100))))
			}
		} else {
			m.Key = r.Bucket
			m.Label = pipelineBucketTrips(pipelineExtras[r.Bucket], r.TripCount)
			if r.Bucket == "month" {
				// A `month` row with no month_start is not a month: it keeps its bucket as a
				// key and draws no bar, rather than claiming a date it does not have.
				m.Label = ""
			}
		}
		out.Months = append(out.Months, m)
	}
	return out
}

// ── 3.11.8 Export Center ────────────────────────────────────────────────────────────────

// exportHistoryRow is one audited export (agent_export_history). Metadata is free-form JSON
// written by our own functions; it is decoded into exportMeta, never into a map of any.
type exportHistoryRow struct {
	AuditID      string          `json:"audit_id"`
	EventType    string          `json:"event_type"`
	CreatedAt    string          `json:"created_at"`
	CreatedLocal string          `json:"created_local"`
	Metadata     json.RawMessage `json:"metadata"`
}

type exportMeta struct {
	RowCount       *int           `json:"row_count"`
	Source         string         `json:"source"`
	Report         string         `json:"report"`
	Period         string         `json:"period"`
	Basis          string         `json:"basis"`
	From           string         `json:"from"`
	To             string         `json:"to"`
	IncludeContact bool           `json:"include_contact"`
	Filters        *exportFilters `json:"filters"`
}

type exportFilters struct {
	Status     []string `json:"status"`
	SupplierID string   `json:"supplier_id"`
	TripID     string   `json:"trip_id"`
	TravelFrom string   `json:"travel_from"`
	TravelTo   string   `json:"travel_to"`
}

type exportHistoryItem struct {
	ID    string
	Title string
	// Detail is "Jan 1 to Oct 21, 2026 · 12 rows · Oct 21, 3:04 PM".
	Detail string
	// RunAgainHref is "" when the row's shape is not one this screen knows how to repeat.
	RunAgainHref string
	// WithContact: contact details went out, so the line says so and Run again repeats it
	// knowingly.
	WithContact bool
}

// A real calendar date is kept and anything else dropped by filters.go's isoDate, which the
// history lines reuse: "2026-99-99" would otherwise become a label nobody can read.

// exportWhen is Intl's { month: short, day: numeric, hour: numeric, minute: 2-digit } on a
// naive local timestamp: "Oct 21, 3:04 PM". created_local is ALREADY in the advisor's zone,
// so it is read as written rather than converted.
func exportWhen(local string) string {
	if len(local) < 16 || local[4] != '-' || local[7] != '-' || local[10] != 'T' || local[13] != ':' {
		return ""
	}
	year, err1 := strconv.Atoi(local[0:4])
	month, err2 := strconv.Atoi(local[5:7])
	day, err3 := strconv.Atoi(local[8:10])
	hour, err4 := strconv.Atoi(local[11:13])
	minute, err5 := strconv.Atoi(local[14:16])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil {
		return ""
	}
	if month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 {
		return ""
	}
	_ = year
	suffix := "AM"
	h := hour
	if h >= 12 {
		suffix = "PM"
		h -= 12
	}
	if h == 0 {
		h = 12
	}
	return fmt.Sprintf("%s %d, %d:%02d %s", shortMonths[month-1], day, h, minute, suffix)
}

// exportHistory ports it: the recent exports, from the audit rows (§3.11.8 keeps no history
// table). "Run again" rebuilds the SAME settings.
func exportHistory(rows []exportHistoryRow, ledgerStatuses []string) []exportHistoryItem {
	var out []exportHistoryItem
	for _, r := range rows {
		var m exportMeta
		if len(r.Metadata) > 0 {
			// A shape this screen does not know leaves every field at its zero, which drops
			// the row below rather than printing half a line.
			_ = json.Unmarshal(r.Metadata, &m)
		}
		count := ""
		if m.RowCount != nil {
			count = exportRows(*m.RowCount)
		}
		when := exportWhen(r.CreatedLocal)

		var title, window, href string
		withContact := false

		switch {
		case r.EventType == "commission.exported":
			f := m.Filters
			if f == nil {
				f = &exportFilters{}
			}
			from, to := isoDate(f.TravelFrom), isoDate(f.TravelTo)
			title = copyTypeLedger
			window = periodRangeLabel(from, to)
			// Only real statuses, so a filter the ledger does not know cannot ride back in.
			var statuses []string
			for _, s := range f.Status {
				if slices.Contains(ledgerStatuses, s) {
					statuses = append(statuses, s)
				}
			}
			href = ledgerQuery{
				Statuses: statuses, SupplierID: f.SupplierID, TripID: f.TripID,
				TravelFrom: from, TravelTo: to, Page: 1,
			}.exportHref()

		case r.EventType == "report.exported" && m.Source == "export_center":
			if !slices.Contains(exportTypes, m.Report) {
				continue
			}
			from, to := isoDate(m.From), isoDate(m.To)
			withContact = m.IncludeContact
			title = exportTypeNames[m.Report]
			window = periodRangeLabel(from, to)
			href = centerExportHref(m.Report, from, to, withContact)

		case r.EventType == "report.exported":
			name, ok := reportNames[m.Report]
			if !ok {
				continue
			}
			title = name
			if m.Report == "revenue" && m.Basis != "" {
				basis := copyBasisBooked
				if m.Basis == "received" {
					basis = copyBasisReceived
				}
				title += " · " + basis
			}
			window = periodRangeLabel(isoDate(m.From), isoDate(m.To))
			period := "ytd"
			if slices.Contains(reportPeriods, m.Period) {
				period = m.Period
			}
			basis := "booked"
			if m.Basis == "received" {
				basis = "received"
			}
			href = reportExportHref(m.Report, period, basis)

		default:
			continue
		}

		if withContact {
			title += " · " + copyWithContact
		}
		var parts []string
		for _, p := range []string{window, count, when} {
			if p != "" {
				parts = append(parts, p)
			}
		}
		out = append(out, exportHistoryItem{
			ID: r.AuditID, Title: title, Detail: strings.Join(parts, " · "),
			RunAgainHref: href, WithContact: withContact,
		})
	}
	return out
}

// ── 3.11.9 Lead Sources ─────────────────────────────────────────────────────────────────

type leadSourceRow struct {
	Source         string `json:"source"`
	LeadCount      int    `json:"lead_count"`
	ConvertedCount int    `json:"converted_count"`
	OpenCount      int    `json:"open_count"`
	ClosedCount    int    `json:"closed_count"`
}

type leadCampaignRow struct {
	UTMSource      string `json:"utm_source"`
	LeadCount      int    `json:"lead_count"`
	ConvertedCount int    `json:"converted_count"`
}

type leadSourceLine struct {
	Source  string
	Label   string
	Leads   int
	Clients int
	Open    int
	Closed  int
	// The three segment widths, as shares of the largest source.
	ClientsPct string
	OpenPct    string
	ClosedPct  string
}

type leadCampaignLine struct {
	Name    string
	Leads   int
	Clients int
}

type leadSourcesReportView struct {
	Total     int
	Clients   int
	Empty     bool
	Lines     []leadSourceLine
	Campaigns []leadCampaignLine
}

func leadSourcesReport(rows []leadSourceRow, campaigns []leadCampaignRow) *leadSourcesReportView {
	maxV := 1
	total, clients := 0, 0
	for _, r := range rows {
		maxV = max(maxV, r.LeadCount)
		total += r.LeadCount
		clients += r.ConvertedCount
	}
	// Rounded to a tenth, as the TypeScript does, then written as a width money.css has a
	// rule for: the CSP allows no inline style, so the bar's share is a whole percent.
	pct := func(n int) string { return meterStep(int(jsRound(float64(n) / float64(maxV) * 100))) }

	out := &leadSourcesReportView{Total: total, Clients: clients, Empty: total == 0}
	for _, r := range rows {
		label, ok := leadSourceNames[r.Source]
		if !ok {
			label = r.Source
		}
		out.Lines = append(out.Lines, leadSourceLine{
			Source: r.Source, Label: label,
			Leads: r.LeadCount, Clients: r.ConvertedCount, Open: r.OpenCount, Closed: r.ClosedCount,
			ClientsPct: pct(r.ConvertedCount), OpenPct: pct(r.OpenCount), ClosedPct: pct(r.ClosedCount),
		})
	}
	for _, c := range campaigns {
		out.Campaigns = append(out.Campaigns, leadCampaignLine{Name: c.UTMSource, Leads: c.LeadCount, Clients: c.ConvertedCount})
	}
	return out
}
