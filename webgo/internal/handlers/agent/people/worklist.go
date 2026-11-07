package people

import (
	"cmp"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.2.1, the worklist: a port of loadWorklist in web/lib/agent/queries.ts. The page is
// app/(agent)/agent/page.tsx.

// AGENT_COPY's strings that Go chooses between (web/lib/agent/content.ts), byte for byte.
// The register is the advisor's own shorthand; the zero state says so and stops. The copy
// that never varies is written in worklist.html, and copy_test.go holds both to content.ts.
const (
	copyGreetingZero     = "Nothing urgent today."
	copyGreetingZeroSub  = "The book is quiet. That is allowed."
	copyGreetingOne      = "1 thing needs you today."
	copyCycleUnavailable = "Not enough history yet — this fills in as trips move to Booked."
)

// needsYouLine ports needsYouLine (content.ts): the count under the greeting.
func needsYouLine(n int) string {
	switch n {
	case 0:
		return copyGreetingZero
	case 1:
		return copyGreetingOne
	}
	return fmt.Sprintf("%d things need you today.", n)
}

// kpi is one tile of the strip (AgentKpi). Value "" means nothing to report: Unavailable
// renders instead, never a confident 0. Sub "" means no second line.
type kpi struct {
	ID          string
	Label       string
	Value       string
	Sub         string
	Unavailable string
	Accent      string // primary, secondary, tertiary or surface
	Icon        string
	Href        string
}

// wlTrip is a trip row on the worklist (WorklistTrip). Labels are "" when there is no date.
type wlTrip struct {
	TripID     string
	ClientName string
	Title      string
	ValueLabel string
	Status     string
	DueLabel   string
	StartLabel string
	WaitLabel  string
}

type wlLead struct {
	LeadID    string
	Name      string
	Preview   string
	WaitLabel string
}

type wlPayment struct {
	MilestoneID string
	TripID      string
	ClientName  string
	Label       string
	AmountLabel string
	DueLabel    string
	Overdue     bool
}

type wlMessage struct {
	ConversationID string
	ClientName     string
	Preview        string
	TimeLabel      string
	Unread         int64
}

// worklist is the screen's view model. nil from a loader means the READ FAILED; an empty book
// is a worklist with empty lists (the §2.2 contract).
type worklist struct {
	GreetingName  string
	PartOfDay     string
	PeriodLabel   string
	NeedsYouCount int
	KPIs          []kpi
	Proposals     []wlTrip
	Payments      []wlPayment
	Inquiries     []wlTrip
	Leads         []wlLead
	Departing     []wlTrip
	Messages      []wlMessage
}

// identity is the advisor's own name and zone (agentIdentity). The zone is not decoration:
// the greeting and every instant on the screen are read in it.
type identity struct {
	DisplayName string
	TimeZone    string
}

const defaultTimeZone = "America/Chicago"

func kpisFrom(k kpiRow) []kpi {
	pipelineSub := fmt.Sprintf("%d open trips", k.ActiveTripCount+k.NewInquiryCount)
	commissionSub := ""
	if k.CommissionConfidencePct != nil {
		commissionSub = fmt.Sprintf("%d%% confidence", *k.CommissionConfidencePct)
	}
	cycle := kpi{ID: "cycle", Label: "Inquiry → book", Accent: "surface", Icon: "clock"}
	if k.InquiryToBookDays == nil {
		// Data-Model §8.8: the figure accumulates forward. Say why, never "0 d".
		cycle.Unavailable = copyCycleUnavailable
	} else {
		cycle.Value = jsNumber(*k.InquiryToBookDays) + " d"
	}
	if k.InquiryToBookSample > 0 {
		cycle.Sub = fmt.Sprintf("over %d %s", k.InquiryToBookSample, plural(int(k.InquiryToBookSample), "trip", "trips"))
	}
	return []kpi{
		{ID: "pipeline", Label: "Pipeline value", Value: money(k.PipelineValueCents), Sub: pipelineSub, Accent: "primary", Icon: "briefcase"},
		{ID: "booked", Label: "Booked · month", Value: money(k.BookedMonthCents), Accent: "secondary", Icon: "check"},
		{ID: "commission", Label: "Commission expected", Value: money(k.CommissionExpectedCents), Sub: commissionSub, Accent: "tertiary", Icon: "dollar", Href: "/agent/commission"},
		cycle,
		{ID: "clients", Label: "Active clients", Value: fmt.Sprint(k.ActiveClientCount), Accent: "surface", Icon: "users"},
	}
}

// cancelledTripIDs is THE ONE PLACE C3 IS DECIDED (queries.ts): a cancelled trip's money is
// not work to do, and its dates are not travel. A payment whose trip is not on the board at
// all is kept: the filter fails open.
func cancelledTripIDs(trips []tripRow) map[string]bool {
	out := map[string]bool{}
	for _, t := range trips {
		if t.Status == "cancelled" {
			out[t.TripID] = true
		}
	}
	return out
}

func toWorklistTrip(t tripRow, today, dueLabel string) wlTrip {
	return wlTrip{
		TripID:     t.TripID,
		ClientName: t.ClientDisplayName,
		Title:      t.Title,
		ValueLabel: money(t.TotalValueCents),
		Status:     t.Status,
		DueLabel:   dueLabel,
		StartLabel: relativeDay(today, str(t.StartDate)),
	}
}

// buildWorklist is loadWorklist after its reads: every list derived, every label formatted
// in the advisor's zone. k is the one KPI row (its absence is the caller's "not an agent").
func buildWorklist(me identity, k kpiRow, trips []tripRow, due []paymentRow, inbox []inboxRow, leads []leadListRow, now time.Time) *worklist {
	today := k.AsOfDate
	w := &worklist{}

	for _, t := range trips {
		if t.Status == "proposal" && t.ProposalSentAt != nil {
			label := "Viewed"
			if t.ProposalViewedAt == nil {
				label = "Awaiting reply"
			}
			w.Proposals = append(w.Proposals, toWorklistTrip(t, today, label))
		}
	}

	// Oldest first, each with how long it has waited, from status_changed_at.
	var inquiries []tripRow
	for _, t := range trips {
		if t.Status == "inquiry" {
			inquiries = append(inquiries, t)
		}
	}
	slices.SortStableFunc(inquiries, func(a, b tripRow) int { return strings.Compare(a.StatusChangedAt, b.StatusChangedAt) })
	for _, t := range inquiries {
		row := toWorklistTrip(t, today, "")
		row.WaitLabel = waitingLabel(today, t.StatusChangedAt, me.TimeZone)
		w.Inquiries = append(w.Inquiries, row)
	}

	// §3.8: only new leads that are not already clients, oldest first.
	var fresh []leadListRow
	for _, l := range leads {
		if l.Status == "new" && !l.AlreadyClient {
			fresh = append(fresh, l)
		}
	}
	slices.SortStableFunc(fresh, func(a, b leadListRow) int { return strings.Compare(a.FirstMessageAt, b.FirstMessageAt) })
	for _, l := range fresh {
		w.Leads = append(w.Leads, wlLead{
			LeadID:    l.ID,
			Name:      leadName(l.FirstName, str(l.LastName)),
			Preview:   str(l.LatestPreview),
			WaitLabel: waitingLabel(today, l.FirstMessageAt, me.TimeZone),
		})
	}

	// Cancelled is not a departure. Inquiry and proposal trips are: their start_date is a
	// requested date, and the section is "who is travelling", not "who is booked".
	for _, t := range trips {
		if t.Status == "cancelled" || t.StartDate == nil {
			continue
		}
		if d := daysFrom(today, *t.StartDate); d >= 0 && d < 30 {
			w.Departing = append(w.Departing, toWorklistTrip(t, today, ""))
		}
	}

	cancelled := cancelledTripIDs(trips)
	for _, p := range due {
		if cancelled[p.TripID] {
			continue
		}
		dueLabel := relativeDay(today, str(p.DueDate))
		if dueLabel == "" {
			dueLabel = "No date"
		}
		overdue := p.DaysUntil != nil && *p.DaysUntil < 0
		w.Payments = append(w.Payments, wlPayment{
			MilestoneID: p.MilestoneID,
			TripID:      p.TripID,
			ClientName:  p.ClientDisplayName,
			Label:       p.TripTitle + " · " + p.Label,
			AmountLabel: money(p.AmountCents),
			DueLabel:    dueLabel,
			Overdue:     overdue,
		})
	}

	for _, m := range inbox {
		w.Messages = append(w.Messages, wlMessage{
			ConversationID: m.ConversationID,
			ClientName:     m.ClientDisplayName,
			Preview:        str(m.LastMessagePreview),
			TimeLabel:      monthDay(localDate(m.LastMessageAt, me.TimeZone)),
			Unread:         m.AgentUnreadCount,
		})
	}

	// Derived, never a literal.
	w.NeedsYouCount = len(w.Proposals) + len(w.Payments) + len(w.Inquiries) + len(w.Leads)

	w.PeriodLabel = monthDay(today)
	if w.PeriodLabel == "" {
		if parts := strings.Split(today, "-"); len(parts) == 3 {
			w.PeriodLabel = parts[1] + "-" + parts[2]
		}
	}
	first, _, _ := strings.Cut(me.DisplayName, " ")
	w.GreetingName = cmp.Or(first, "there")
	w.PartOfDay = partOfDayIn(me.TimeZone, now)
	w.KPIs = kpisFrom(k)
	return w
}

// leadName joins a lead's names the way the list does: [first, last].filter(Boolean).join(" ").
func leadName(first, last string) string {
	var parts []string
	for _, p := range []string{first, last} {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, " ")
}

// initials ports the worklist's Initials: the first letter of up to two words split on spaces
// and "&", upper-cased. Never a stock portrait standing in for a named client.
func initials(name string) string {
	words := strings.FieldsFunc(name, func(r rune) bool { return r == '&' || r == ' ' || r == '\t' || r == '\n' })
	var b strings.Builder
	for i, w := range words {
		if i == 2 {
			break
		}
		for _, r := range w {
			b.WriteString(strings.ToUpper(string(r)))
			break
		}
	}
	return b.String()
}

// ── The page ────────────────────────────────────────────────────────────────────────────

var worklistSpec = page.Spec{
	File:   "agent/people/worklist.html",
	Layout: shell.Agent,
	Slots: []string{
		"period", "greeting", "needs-you", "zero-sub",
		"kpi-pipeline-value", "kpi-pipeline-sub", "kpi-booked-value",
		"kpi-commission-value", "kpi-commission-sub",
		"kpi-cycle-unavailable", "kpi-cycle-value", "kpi-cycle-sub", "kpi-clients-value",
		"proposals-count", "proposals-count-n", "proposals-empty",
		"payments-count", "payments-count-n", "payments-empty",
		"inquiries-count", "inquiries-count-n", "inquiries-empty",
		"leads-count", "leads-count-n", "leads-empty",
		"departing-count", "departing-count-n", "departing-empty",
		"messages-count", "messages-count-n", "messages-empty",
	},
	Repeats: map[string][]string{
		"proposals": {"p-link", "p-initials", "p-client", "p-title", "p-value", "p-due", "p-due-label"},
		"payments":  {"pay-link", "pay-client", "pay-label", "pay-amount", "pay-due"},
		"inquiries": {"inq-link", "inq-initials", "inq-client", "inq-title", "inq-wait"},
		"leads":     {"lead-link", "lead-initials", "lead-name", "lead-preview", "lead-wait"},
		"departing": {"dep-link", "dep-client", "dep-title", "dep-start"},
		"messages":  {"msg-link", "msg-initials", "msg-client", "msg-time", "msg-preview", "msg-unread", "msg-unread-n"},
	},
}

// loadWorklist reads everything the screen needs at once. nil means a read failed (or there
// is no KPI row, which means the caller is not an agent): the page says so rather than
// showing an empty book.
func (a *app) loadWorklist(ctx context.Context, v visit, now time.Time) *worklist {
	var (
		kpis  []kpiRow
		trips []tripRow
		due   []paymentRow
		inbox []inboxRow
		leads []leadListRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_kpis", nil, &kpis)
	read(rs, "agent_trip_board", nil, &trips)
	read(rs, "agent_payments_due", map[string]int{"p_within_days": 21}, &due)
	read(rs, "agent_inbox", map[string]int{"p_limit": 5}, &inbox)
	read(rs, "agent_leads", nil, &leads)
	if rs.wait() != nil || len(kpis) == 0 {
		return nil
	}
	return buildWorklist(v.me, kpis[0], trips, due, inbox, leads, now)
}

func (a *app) serveWorklist(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	wl := a.loadWorklist(r.Context(), v, time.Now())
	if wl == nil {
		a.renderFailed(w, r, v)
		return
	}
	doc := a.worklist.New()
	a.chrome(w, r, doc, v)
	fillWorklist(doc, wl)
	web.Render(w, a.d.Log, doc, http.StatusOK, web.Private)
}

// count fills a section's count chip (shown only when there is something) and its empty line.
func count(doc *page.Doc, name string, n int) {
	if n == 0 {
		doc.Remove(name + "-count")
		doc.Keep(name + "-empty")
		return
	}
	doc.Keep(name + "-count")
	doc.Text(name+"-count-n", fmt.Sprint(n))
	doc.Remove(name + "-empty")
}

// textOrRemove fills a slot, or takes it out when there is nothing to say.
func textOrRemove(f interface {
	Text(slot, text string)
	Remove(slot string)
}, slot, text string) {
	if text == "" {
		f.Remove(slot)
		return
	}
	f.Text(slot, text)
}

func fillWorklist(doc *page.Doc, wl *worklist) {
	doc.Text("period", strings.ToUpper(wl.PeriodLabel))
	doc.Text("greeting", wl.PartOfDay+", "+wl.GreetingName+".")
	doc.Text("needs-you", needsYouLine(wl.NeedsYouCount))
	if wl.NeedsYouCount == 0 {
		doc.Text("zero-sub", copyGreetingZeroSub) // the one place the worldview earns a line
	} else {
		doc.Remove("zero-sub")
	}

	tiles := map[string]kpi{}
	for _, k := range wl.KPIs {
		tiles[k.ID] = k
	}
	doc.Text("kpi-pipeline-value", tiles["pipeline"].Value)
	doc.Text("kpi-pipeline-sub", tiles["pipeline"].Sub)
	doc.Text("kpi-booked-value", tiles["booked"].Value)
	doc.Text("kpi-commission-value", tiles["commission"].Value)
	textOrRemove(doc, "kpi-commission-sub", tiles["commission"].Sub)
	if c := tiles["cycle"]; c.Value == "" {
		doc.Text("kpi-cycle-unavailable", c.Unavailable)
		doc.Remove("kpi-cycle-value")
		doc.Remove("kpi-cycle-sub")
	} else {
		doc.Remove("kpi-cycle-unavailable")
		doc.Text("kpi-cycle-value", c.Value)
		textOrRemove(doc, "kpi-cycle-sub", c.Sub)
	}
	doc.Text("kpi-clients-value", tiles["clients"].Value)

	count(doc, "proposals", len(wl.Proposals))
	doc.Repeat("proposals", len(wl.Proposals), func(i int, r *page.Row) {
		t := wl.Proposals[i]
		r.URL("p-link", "href", "/agent/trips/"+t.TripID)
		r.Text("p-initials", initials(t.ClientName))
		r.Text("p-client", t.ClientName)
		r.Text("p-title", t.Title)
		r.Text("p-value", t.ValueLabel)
		if t.DueLabel == "" {
			r.Remove("p-due")
		} else {
			r.Keep("p-due")
			r.Text("p-due-label", t.DueLabel)
		}
	})

	count(doc, "payments", len(wl.Payments))
	doc.Repeat("payments", len(wl.Payments), func(i int, r *page.Row) {
		p := wl.Payments[i]
		r.URL("pay-link", "href", "/agent/trips/"+p.TripID)
		r.Text("pay-client", p.ClientName)
		r.Text("pay-label", p.Label)
		r.Text("pay-amount", p.AmountLabel)
		r.Text("pay-due", p.DueLabel)
		if p.Overdue {
			r.Class("pay-due", "text-secondary", false)
			r.Class("pay-due", "text-error", true)
		}
	})

	count(doc, "inquiries", len(wl.Inquiries))
	doc.Repeat("inquiries", len(wl.Inquiries), func(i int, r *page.Row) {
		t := wl.Inquiries[i]
		r.URL("inq-link", "href", "/agent/trips/"+t.TripID)
		r.Text("inq-initials", initials(t.ClientName))
		r.Text("inq-client", t.ClientName)
		r.Text("inq-title", t.Title)
		textOrRemove(r, "inq-wait", t.WaitLabel)
	})

	count(doc, "leads", len(wl.Leads))
	doc.Repeat("leads", len(wl.Leads), func(i int, r *page.Row) {
		l := wl.Leads[i]
		r.URL("lead-link", "href", "/agent/leads/"+l.LeadID)
		r.Text("lead-initials", initials(l.Name))
		r.Text("lead-name", l.Name)
		r.Text("lead-preview", l.Preview)
		textOrRemove(r, "lead-wait", l.WaitLabel)
	})

	count(doc, "departing", len(wl.Departing))
	doc.Repeat("departing", len(wl.Departing), func(i int, r *page.Row) {
		t := wl.Departing[i]
		r.URL("dep-link", "href", "/agent/trips/"+t.TripID)
		r.Text("dep-client", t.ClientName)
		r.Text("dep-title", t.Title)
		textOrRemove(r, "dep-start", t.StartLabel)
	})

	count(doc, "messages", len(wl.Messages))
	doc.Repeat("messages", len(wl.Messages), func(i int, r *page.Row) {
		m := wl.Messages[i]
		r.URL("msg-link", "href", threadHref(m.ConversationID))
		r.Text("msg-initials", initials(m.ClientName))
		r.Text("msg-client", m.ClientName)
		r.Text("msg-time", m.TimeLabel)
		r.Text("msg-preview", m.Preview)
		if m.Unread > 0 {
			r.Keep("msg-unread")
			r.Text("msg-unread-n", fmt.Sprint(m.Unread))
		} else {
			r.Remove("msg-unread")
		}
	})
}

// threadHref is the inbox's link to one thread with no filters (messageQuery.ts threadHref).
func threadHref(conversationID string) string {
	return "/agent/messages/" + url.PathEscape(conversationID)
}
