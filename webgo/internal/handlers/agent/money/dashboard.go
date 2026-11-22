package money

import (
	"context"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.7.1 — Commission Dashboard: a port of loadCommissionDashboard in
// web/lib/agent/commission.ts and app/(agent)/agent/commission/page.tsx.
//
// THE PROTOTYPE'S FOUR TILES, NOT SCREEN INVENTORY §3.7.1's. Gyasi ruled on 2026-10-11:
// "Expected · 90d" is TRIP-grain (booked trips starting within 90 days, plus every trip in
// progress, from trip totals), and "At risk" is the UNPAID GAP on disputed lines rather than
// their full expected amount.
//
// TWO NUMBERS ON PURPOSE. "Expected · 90d" is trip-grain; every other figure on these screens
// is ledger-grain (commission lines). Nothing here adds one to the other.

// dashboardRow is agent_commission_dashboard's single row.
type dashboardRow struct {
	AsOfDate                string `json:"as_of_date"`
	Currency                string `json:"currency"`
	YTDReceivedCents        Cents  `json:"ytd_received_cents"`
	LYReceivedCents         Cents  `json:"ly_received_cents"`
	AvgRatePct              Rate   `json:"avg_rate_pct"`
	LYAvgRatePct            Rate   `json:"ly_avg_rate_pct"`
	UpcomingCommissionCents Cents  `json:"upcoming_commission_cents"`
	UpcomingTripCount       int    `json:"upcoming_trip_count"`
	AtRiskCents             Cents  `json:"at_risk_cents"`
	DisputedCount           int    `json:"disputed_count"`
	Trailing12Cents         Cents  `json:"trailing_12_cents"`
	Prior12Cents            Cents  `json:"prior_12_cents"`
}

// monthRow is one bar of agent_commission_monthly. The accessor returns the current month
// LAST, always.
type monthRow struct {
	MonthStart    string `json:"month_start"`
	ReceivedCents Cents  `json:"received_cents"`
	LineCount     int    `json:"line_count"`
}

// tile is one KPI tile (KpiTileData). Value "" means nothing to report: Unavailable renders
// instead, never a confident 0. Sub "" means no second line.
type tile struct {
	ID          string
	Value       string
	Sub         string
	Unavailable string
	// Href is set only where the drill lands on exactly the lines the tile sums.
	Href string
}

// commissionMonth is one bar (CommissionMonth).
type commissionMonth struct {
	MonthStart string
	// Label is "Jun", under the bar.
	Label string
	// LongLabel is "June 2026", for the screen-reader table and the bar's title.
	LongLabel   string
	AmountLabel string
	// HeightPct is 0-100, against the tallest bar with a little headroom.
	HeightPct int
	IsCurrent bool
}

// commissionDashboard is the screen (CommissionDashboard).
type commissionDashboard struct {
	Tiles  []tile
	Months []commissionMonth
	// AnyReceived is false when all twelve months are zero — the chart then says so in words.
	AnyReceived bool
	// TrendChange is "+24% vs prior year", or "" when the prior twelve months had nothing to
	// compare.
	TrendChange string
}

// tileByID finds a tile for the page fill; the four are always present.
func (d *commissionDashboard) tile(id string) tile {
	for _, t := range d.Tiles {
		if t.ID == id {
			return t
		}
	}
	return tile{}
}

// dashboardTiles ports dashboardTiles: the prototype's four, in its order.
func dashboardTiles(d dashboardRow) []tile {
	ytd := tile{ID: "ytd", Value: money(d.YTDReceivedCents)}
	// "" rather than "+∞%" when last year had nothing in the same window.
	if pct, ok := percentChange(d.YTDReceivedCents, d.LYReceivedCents); ok {
		ytd.Sub = commissionChangeVsLastYear(pct)
	}

	upcoming := tile{ID: "upcoming", Value: money(d.UpcomingCommissionCents), Sub: copyNothingUpcoming}
	if d.UpcomingTripCount > 0 {
		upcoming.Sub = commissionTripCount(d.UpcomingTripCount)
	}

	// The one tile whose drill lands on exactly the LINES it sums — the disputed ones. Not
	// the same AMOUNTS: the tile is the unpaid gap and the ledger prints each line's full
	// expected figure. The other tiles would land on lists of different lines altogether,
	// which is worse than no link.
	risk := tile{ID: "risk", Value: money(d.AtRiskCents), Sub: commissionDisputedCount(d.DisputedCount)}
	if d.DisputedCount > 0 {
		risk.Href = ledgerQuery{Statuses: []string{"disputed"}, Page: 1}.href()
	}

	rate := tile{ID: "rate", Unavailable: copyRateUnavailable}
	if d.AvgRatePct.Set {
		rate.Unavailable = ""
		rate.Value = toFixed(d.AvgRatePct.Value, 1) + "%"
		if d.LYAvgRatePct.Set {
			// A change in a rate is POINTS, rounded to a tenth before it is worded, so
			// 12.04 against 12.00 reads "No change" rather than "+0.0 pts".
			points := jsRound((d.AvgRatePct.Value-d.LYAvgRatePct.Value)*10) / 10
			rate.Sub = commissionRateChangeVsLastYear(points)
		}
	}

	return []tile{ytd, upcoming, risk, rate}
}

// dashboardMonths ports dashboardMonths.
func dashboardMonths(rows []monthRow) []commissionMonth {
	var maxCents Cents
	for _, r := range rows {
		maxCents = max(maxCents, r.ReceivedCents)
	}
	out := make([]commissionMonth, 0, len(rows))
	for i, r := range rows {
		m := commissionMonth{
			MonthStart:  r.MonthStart,
			Label:       monthShort(r.MonthStart),
			LongLabel:   monthLong(r.MonthStart),
			AmountLabel: money(r.ReceivedCents),
			// The accessor returns the current month LAST, always.
			IsCurrent: i == len(rows)-1,
		}
		// 8% headroom so the tallest bar does not touch the card's title. A month with money
		// in it is never drawn shorter than 2%, or a $40 deposit beside a $4,000 one vanishes.
		if maxCents > 0 && r.ReceivedCents > 0 {
			m.HeightPct = max(2, int(jsRound(float64(r.ReceivedCents)/(float64(maxCents)*1.08)*100)))
		}
		out = append(out, m)
	}
	return out
}

// loadDashboard reads both rows at once. nil means a read failed, or that the accessor does
// not recognise the caller as an agent — which the layout should already have caught. It is
// not an empty dashboard (that is one row of zeros), so it gets the retry screen, not $0.
func (a *app) loadDashboard(ctx context.Context, v visit) *commissionDashboard {
	var (
		dash   []dashboardRow
		months []monthRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_dashboard", map[string]any{}, &dash)
	read(rs, "agent_commission_monthly", map[string]any{}, &months)
	if rs.wait() != nil || len(dash) == 0 {
		return nil
	}
	d := dash[0]
	out := &commissionDashboard{Tiles: dashboardTiles(d), Months: dashboardMonths(months)}
	for _, m := range months {
		if m.ReceivedCents > 0 {
			out.AnyReceived = true
			break
		}
	}
	if pct, ok := percentChange(d.Trailing12Cents, d.Prior12Cents); ok {
		out.TrendChange = commissionTrendChange(pct)
	}
	return out
}

// ── The page ────────────────────────────────────────────────────────────────────────────

var dashboardSpec = page.Spec{
	File:   "agent/money/commission.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"kpi-ytd-value", "kpi-ytd-sub",
		"kpi-upcoming-value", "kpi-upcoming-sub",
		"kpi-risk-link", "kpi-risk-link-value", "kpi-risk-link-sub",
		"kpi-risk-plain", "kpi-risk-value", "kpi-risk-sub",
		"kpi-rate-value", "kpi-rate-sub", "kpi-rate-unavailable",
		"trend-chip", "trend-chip-label", "trend-empty",
	),
	Repeats: map[string][]string{
		"bars":     {"bar-column", "bar", "bar-label"},
		"bar-rows": {"bar-row-month", "bar-row-amount"},
	},
}

func (a *app) serveDashboard(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	var d *commissionDashboard
	if v.canRead() {
		d = a.loadDashboard(r.Context(), v)
	}
	// Null means the READ failed. A new advisor's dashboard is one row of zeros and renders
	// as tiles saying so, which is why this is not the same thing.
	// An admin is "no access", not an outage: the state decides the status, so it is settled
	// here rather than left to fillFrame's own override.
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case d == nil:
		st = stateRetry
	}
	doc := a.dashboard.New()
	if fillFrame(doc, r, v, st) {
		fillDashboard(doc, d)
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

func fillDashboard(doc *page.Doc, d *commissionDashboard) {
	doc.Text("kpi-ytd-value", d.tile("ytd").Value)
	textOrRemove(doc, "kpi-ytd-sub", d.tile("ytd").Sub)
	doc.Text("kpi-upcoming-value", d.tile("upcoming").Value)
	textOrRemove(doc, "kpi-upcoming-sub", d.tile("upcoming").Sub)

	// The tile is a link only where the drill is exact, so both forms are written out and
	// one of them leaves the page: an <a> cannot be grown around a <div> after parsing.
	risk := d.tile("risk")
	if risk.Href != "" {
		doc.Remove("kpi-risk-plain")
		doc.Keep("kpi-risk-link")
		doc.URL("kpi-risk-link", "href", risk.Href)
		doc.Text("kpi-risk-link-value", risk.Value)
		doc.Text("kpi-risk-link-sub", risk.Sub)
	} else {
		doc.Remove("kpi-risk-link")
		doc.Keep("kpi-risk-plain")
		doc.Text("kpi-risk-value", risk.Value)
		doc.Text("kpi-risk-sub", risk.Sub)
	}

	// Null is not zero: a tile with nothing to report says so instead of showing 0%.
	if rate := d.tile("rate"); rate.Value == "" {
		doc.Text("kpi-rate-unavailable", rate.Unavailable)
		doc.Remove("kpi-rate-value")
		doc.Remove("kpi-rate-sub")
	} else {
		doc.Remove("kpi-rate-unavailable")
		doc.Text("kpi-rate-value", rate.Value)
		textOrRemove(doc, "kpi-rate-sub", rate.Sub)
	}

	if d.TrendChange == "" {
		doc.Remove("trend-chip")
	} else {
		doc.Keep("trend-chip")
		doc.Text("trend-chip-label", d.TrendChange)
	}
	if d.AnyReceived {
		doc.Remove("trend-empty")
	} else {
		doc.Keep("trend-empty")
	}

	// The bars are decoration to a screen reader (aria-hidden); the visually hidden table
	// below carries the same twelve figures in reading order.
	doc.Repeat("bars", len(d.Months), func(i int, row *page.Row) {
		m := d.Months[i]
		row.Attr("bar-column", "title", m.LongLabel+": "+m.AmountLabel)
		row.Keep("bar-column")
		row.Attr("bar", "data-h", heightStep(m.HeightPct))
		row.Class("bar", "mny-bar-current", m.IsCurrent)
		row.Keep("bar")
		row.Text("bar-label", m.Label)
	})
	doc.Repeat("bar-rows", len(d.Months), func(i int, row *page.Row) {
		row.Text("bar-row-month", d.Months[i].LongLabel)
		row.Text("bar-row-amount", d.Months[i].AmountLabel)
	})
}

// heightStep is the bar's height as a whole percent, the value money.css has a rule for.
// A height cannot be an inline style: the Content-Security-Policy is style-src 'self'.
func heightStep(pct int) string {
	return itoa(min(max(pct, 0), 100))
}
