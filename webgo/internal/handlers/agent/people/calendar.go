package people

import (
	"cmp"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.2.3, the calendar: a port of web/lib/agent/calendar.ts and loadCalendar in
// queries.ts. The page is app/(agent)/agent/calendar/page.tsx.
//
// Month arithmetic is on "YYYY-MM" strings and dates are "YYYY-MM-DD" strings in the
// advisor's zone, as the accessors computed them; nothing here reads the server's clock.

// The page's copy is static in calendar.html; copy_test.go holds it to AGENT_COPY.

// calEvent is one thing on a day (CalendarEvent). Href and Detail are "" when absent.
type calEvent struct {
	ID     string
	Kind   string // departure, return, payment, availability
	Date   string
	Label  string
	Detail string
	Href   string
}

type calDay struct {
	Date       string
	DayOfMonth int
	InMonth    bool
	IsToday    bool
	Events     []calEvent
}

type calMonth struct {
	Month      string
	MonthLabel string
	PrevMonth  string
	NextMonth  string
	Weeks      [][]calDay
	Agenda     []calEvent
}

var monthNames = [...]string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

// daysInMonth is the length of a month (month1 is 1-12), leap years included.
func daysInMonth(year, month1 int) int {
	return time.Date(year, time.Month(month1)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// firstWeekday is the weekday the month starts on, Sunday = 0.
func firstWeekday(year, month1 int) int {
	return int(time.Date(year, time.Month(month1), 1, 0, 0, 0, 0, time.UTC).Weekday())
}

func isoDate(year, month1, day int) string {
	return fmt.Sprintf("%d-%02d-%02d", year, month1, day)
}

func splitMonth(month string) (year, month1 int) {
	y, m, _ := strings.Cut(month, "-")
	year, _ = strconv.Atoi(y)
	month1, _ = strconv.Atoi(m)
	return year, month1
}

// floorDiv is Math.floor division, so a year below zero still steps correctly.
func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// shiftMonth steps a "YYYY-MM" by delta months across year boundaries.
func shiftMonth(month string, delta int) string {
	y, m := splitMonth(month)
	total := y*12 + (m - 1) + delta
	return fmt.Sprintf("%d-%02d", floorDiv(total, 12), total-floorDiv(total, 12)*12+1)
}

// monthOf is the "YYYY-MM" an ISO date is in.
func monthOf(iso string) string {
	if len(iso) < 7 {
		return iso
	}
	return iso[:7]
}

// The window ?month= may name: a month the calendar has a reason to show.
const (
	minYear = 2000
	maxYear = 2100
)

var monthShape = regexp.MustCompile(`^(\d{4})-(\d{2})$`)

func inWindow(month string) bool {
	p := monthShape.FindStringSubmatch(month)
	if p == nil {
		return false
	}
	m, _ := strconv.Atoi(p[2])
	if m < 1 || m > 12 {
		return false
	}
	y, _ := strconv.Atoi(p[1])
	return y >= minYear && y <= maxYear
}

// validMonth is the ?month= guard: a well-formed month inside the window, else fallback.
func validMonth(raw, fallback string) string {
	if inWindow(raw) {
		return raw
	}
	return fallback
}

// navMonth is the prev/next target. It never steps out of the window the guard accepts, so
// every rendered link is one the guard keeps; a month already outside steps on its own.
func navMonth(month string, delta int) string {
	stepped := shiftMonth(month, delta)
	if !inWindow(month) {
		return stepped
	}
	if inWindow(stepped) {
		return stepped
	}
	return month
}

// buildMonth lays out one month: the real leading offset, exactly the rows the month needs,
// spill-over days from the real neighbouring months, events by date, and the month's agenda.
func buildMonth(month, today string, events []calEvent) calMonth {
	year, month1 := splitMonth(month)
	total := daysInMonth(year, month1)
	lead := firstWeekday(year, month1)
	cells := (lead + total + 6) / 7 * 7

	byDate := map[string][]calEvent{}
	for _, e := range events {
		byDate[e.Date] = append(byDate[e.Date], e)
	}

	py, pm := splitMonth(shiftMonth(month, -1))
	ny, nm := splitMonth(shiftMonth(month, 1))
	prevTotal := daysInMonth(py, pm)

	days := make([]calDay, 0, cells)
	for i := range cells {
		offset := i - lead
		d := calDay{InMonth: true}
		switch {
		case offset < 0:
			d.DayOfMonth = prevTotal + offset + 1
			d.Date = isoDate(py, pm, d.DayOfMonth)
			d.InMonth = false
		case offset >= total:
			d.DayOfMonth = offset - total + 1
			d.Date = isoDate(ny, nm, d.DayOfMonth)
			d.InMonth = false
		default:
			d.DayOfMonth = offset + 1
			d.Date = isoDate(year, month1, d.DayOfMonth)
		}
		d.IsToday = d.Date == today
		d.Events = byDate[d.Date]
		days = append(days, d)
	}
	var weeks [][]calDay
	for i := 0; i < len(days); i += 7 {
		weeks = append(weeks, days[i:i+7])
	}

	var agenda []calEvent
	for _, e := range events {
		if monthOf(e.Date) == month {
			agenda = append(agenda, e)
		}
	}
	slices.SortStableFunc(agenda, func(a, b calEvent) int {
		if a.Date == b.Date {
			return strings.Compare(a.Kind, b.Kind)
		}
		return strings.Compare(a.Date, b.Date)
	})

	return calMonth{
		Month:      month,
		MonthLabel: fmt.Sprintf("%s %d", monthNames[month1-1], year),
		PrevMonth:  navMonth(month, -1),
		NextMonth:  navMonth(month, 1),
		Weeks:      weeks,
		Agenda:     agenda,
	}
}

// calendarEvents is loadCalendar after its reads. A cancelled trip draws neither its
// departure nor its return, and its payments go too (cancelledTripIDs). Unfiltered by month:
// buildMonth only looks up the month it shows.
func calendarEvents(trips []tripRow, due []paymentRow) []calEvent {
	var out []calEvent
	for _, t := range trips {
		if t.Status == "cancelled" {
			continue
		}
		href := tripHref(t.TripID)
		if t.StartDate != nil {
			out = append(out, calEvent{ID: "dep-" + t.TripID, Kind: "departure", Date: *t.StartDate,
				Label: t.ClientDisplayName + " departs", Detail: t.Title, Href: href})
		}
		if t.EndDate != nil {
			out = append(out, calEvent{ID: "ret-" + t.TripID, Kind: "return", Date: *t.EndDate,
				Label: t.ClientDisplayName + " returns", Detail: t.Title, Href: href})
		}
	}
	cancelled := cancelledTripIDs(trips)
	for _, p := range due {
		if p.DueDate == nil || cancelled[p.TripID] {
			continue
		}
		out = append(out, calEvent{ID: "pay-" + p.MilestoneID, Kind: "payment", Date: *p.DueDate,
			Label: p.Label + " · " + money(p.AmountCents), Detail: p.ClientDisplayName,
			Href: tripHref(p.TripID)})
	}
	return out
}

// ── The page ────────────────────────────────────────────────────────────────────────────

// weekSlots are the seven day cells in one week row: the cell, its today disc, its number,
// two events and "+N more".
func weekSlots() []string {
	var out []string
	for i := range 7 {
		c := fmt.Sprintf("c%d", i)
		out = append(out, c, c+"-today", c+"-num", c+"-e1", c+"-e2", c+"-more")
	}
	return out
}

var calendarSpec = page.Spec{
	File:   "agent/people/calendar.html",
	Layout: shell.Agent,
	Slots: []string{
		"month-label", "xs-month", "xs-agenda", "md-month", "md-agenda",
		"prev", "prev-label", "next", "next-label", "empty", "agenda", "month-grid", "caption",
	},
	Repeats: map[string][]string{
		"agenda": {"a-link", "a-bar", "a-label", "a-detail", "a-date"},
		"weeks":  weekSlots(),
	},
}

// loadCalendar reads the board and a wide payment window (so a month view can look forward).
// ok is false when a read failed or there is no KPI row.
func (a *app) loadCalendar(ctx context.Context, v visit) (today string, events []calEvent, ok bool) {
	var (
		kpis  []kpiRow
		trips []tripRow
		due   []paymentRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_kpis", nil, &kpis)
	read(rs, "agent_trip_board", nil, &trips)
	read(rs, "agent_payments_due", map[string]int{"p_within_days": 400}, &due)
	if rs.wait() != nil || len(kpis) == 0 {
		return "", nil, false
	}
	return kpis[0].AsOfDate, calendarEvents(trips, due), true
}

// calendarHref is a month link, written as the Next page writes it: ?month=…[&view=…].
func calendarHref(month, view string) string {
	s := "/agent/calendar?month=" + url.QueryEscape(month)
	if view != "" {
		s += "&view=" + url.QueryEscape(view)
	}
	return s
}

func (a *app) serveCalendar(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	today, events, ok := a.loadCalendar(r.Context(), v)
	if !ok {
		a.renderFailed(w, r, v, false)
		return
	}
	if !inWindow(monthOf(today)) {
		// as_of_date is always a date today; if it ever is not, say so rather than index a
		// month that does not exist.
		a.d.Log.Warn("calendar: as_of_date outside the window")
		a.renderFailed(w, r, v, false)
		return
	}
	q := r.URL.Query()
	month := validMonth(q.Get("month"), monthOf(today))
	view := ""
	switch q.Get("view") {
	case "agenda", "month":
		view = q.Get("view")
	}
	grid := buildMonth(month, today, events)

	doc := a.calendar.New()
	a.chrome(w, r, doc, v)
	doc.Text("month-label", grid.MonthLabel)
	doc.Text("caption", grid.MonthLabel)

	// Two toggles: below md the default is the agenda, from md the month grid.
	toggle := func(prefix, defaultView string) {
		active := cmp.Or(view, defaultView)
		for _, which := range []string{"month", "agenda"} {
			slot := prefix + "-" + which
			doc.URL(slot, "href", calendarHref(month, which))
			on := active == which
			doc.Class(slot, "chip-secondary", on)
			doc.Class(slot, "chip-outlined", !on)
			if on {
				doc.Attr(slot, "aria-current", "page")
			}
		}
	}
	toggle("xs", "agenda")
	toggle("md", "month")

	doc.URL("prev", "href", calendarHref(grid.PrevMonth, view))
	doc.Text("prev-label", "← "+grid.PrevMonth)
	doc.URL("next", "href", calendarHref(grid.NextMonth, view))
	doc.Text("next-label", grid.NextMonth+" →")

	if len(grid.Agenda) == 0 {
		doc.Keep("empty")
	} else {
		doc.Remove("empty")
	}

	// The agenda shows on its own view, and by default below md; the grid on its own view,
	// and by default from md. A view that is not showing is left out of the page.
	switch view {
	case "month":
		doc.Remove("agenda")
	default:
		doc.Keep("agenda")
		if view == "" {
			doc.Class("agenda", "below-md", true)
		}
		doc.Repeat("agenda", len(grid.Agenda), func(i int, r *page.Row) {
			e := grid.Agenda[i]
			r.URL("a-link", "href", e.Href)
			r.Keep("a-bar")
			kindClass(r, "a-bar", e.Kind)
			r.Text("a-label", e.Label)
			textOrRemove(r, "a-detail", e.Detail)
			r.Text("a-date", e.Date[min(len(e.Date), 5):]) // e.date.slice(5): "09-29"
		})
	}
	switch view {
	case "agenda":
		doc.Remove("month-grid")
	default:
		doc.Keep("month-grid")
		if view == "" {
			doc.Class("month-grid", "from-md", true)
		}
		doc.Repeat("weeks", len(grid.Weeks), func(i int, r *page.Row) {
			for c, day := range grid.Weeks[i] {
				fillDay(r, fmt.Sprintf("c%d", c), day)
			}
		})
	}
	web.Render(w, a.d.Log, doc, http.StatusOK, web.Private)
}

// fillDay draws one cell: today's disc or the plain number, at most two events, "+N more".
func fillDay(r *page.Row, c string, day calDay) {
	r.Keep(c)
	if !day.InMonth {
		r.Class(c, "ppl-day-out", true)
	}
	if day.IsToday {
		r.Text(c+"-today", fmt.Sprint(day.DayOfMonth))
		r.Remove(c + "-num")
	} else {
		r.Remove(c + "-today")
		r.Text(c+"-num", fmt.Sprint(day.DayOfMonth))
	}
	for n, slot := range []string{c + "-e1", c + "-e2"} {
		if n >= len(day.Events) {
			r.Remove(slot)
			continue
		}
		e := day.Events[n]
		r.URL(slot, "href", e.Href)
		r.Text(slot, e.Label)
		title := e.Label
		if e.Detail != "" {
			title += " · " + e.Detail
		}
		r.Attr(slot, "title", title)
		r.Class(slot, "ppl-ev-payment", false) // the sample's second event
		kindClass(r, slot, e.Kind)
	}
	if extra := len(day.Events) - 2; extra > 0 {
		r.Text(c+"-more", fmt.Sprintf("+%d more", extra))
	} else {
		r.Remove(c + "-more")
	}
}

// kindClass colours an event by its kind (KIND_TONE). Literal names, so the class check sees
// each one.
func kindClass(r *page.Row, slot, kind string) {
	r.Class(slot, "ppl-ev-departure", false)
	switch kind {
	case "departure":
		r.Class(slot, "ppl-ev-departure", true)
	case "return":
		r.Class(slot, "ppl-ev-return", true)
	case "payment":
		r.Class(slot, "ppl-ev-payment", true)
	case "availability":
		r.Class(slot, "ppl-ev-availability", true)
	}
}
