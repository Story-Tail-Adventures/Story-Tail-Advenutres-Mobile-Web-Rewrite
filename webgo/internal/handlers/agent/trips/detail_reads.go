package trips

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
)

// Trip Detail's reads and view models, ported from web/lib/agent/tripDetail.ts. The builder,
// itinerary and payments screens reuse the same loaders, as the Next screens do.
//
// Same rules as there: formatting happens here in the advisor's zone, and a nil result means
// the READ failed; an empty tab is an empty slice. The overview has a third outcome, zero
// rows, which agent_trip_overview answers for "no such trip" and "another advisor's" alike.

type tripArgs struct {
	TripID string `json:"p_trip_id"`
}

// overviewRow is AgentTripOverviewRow.
type overviewRow struct {
	TripID               string   `json:"trip_id"`
	ClientID             string   `json:"client_id"`
	ClientDisplayName    string   `json:"client_display_name"`
	Title                string   `json:"title"`
	TripType             string   `json:"trip_type"`
	Status               string   `json:"status"`
	StartDate            *string  `json:"start_date"`
	EndDate              *string  `json:"end_date"`
	Destinations         []string `json:"destinations"`
	TravelerCount        int      `json:"traveler_count"`
	TotalValueCents      Cents    `json:"total_value_cents"`
	TotalPaidCents       Cents    `json:"total_paid_cents"`
	TotalCommissionCents Cents    `json:"total_commission_cents"`
	CancellationReason   *string  `json:"cancellation_reason"`
	RefundStatus         *string  `json:"refund_status"`
	RefundDetail         *string  `json:"refund_detail"`
	Notes                *string  `json:"notes"`
	Version              int      `json:"version"`
	LastActivityAt       *string  `json:"last_activity_at"`
	ComponentCount       int      `json:"component_count"`
	AsOfDate             string   `json:"as_of_date"`
	NextUnpaidDueDate    *string  `json:"next_unpaid_due_date"`
}

// overview is TripDetailOverview.
type overview struct {
	tripID, clientID, clientName, title, tripType, status string
	startLabel, endLabel                                  string
	destinations                                          []string
	travelerCount                                         int
	totalValueLabel, totalPaidLabel, totalCommission      string
	paidCents, commissionCents                            int64
	cancellationReason, refundStatus, refundDetail, notes string
	version                                               int
	lastActivityLabel                                     string
	componentCount                                        int
	today, nextUnpaidDue                                  string
}

// overviewResult: ok, or why not (notFound vs unavailable).
type overviewResult struct {
	ov       *overview
	notFound bool
}

func loadOverview(r *http.Request, d handlers.Deps, v visit, tripID string) overviewResult {
	if !v.canRead() {
		return overviewResult{}
	}
	rows, err := agentread.Call[overviewRow](r.Context(), d.Supa, v.st, "agent_trip_overview", tripArgs{tripID}, d.Log)
	if err != nil {
		return overviewResult{}
	}
	if len(rows) == 0 {
		return overviewResult{notFound: true}
	}
	o := rows[0]
	ov := &overview{
		tripID: o.TripID, clientID: o.ClientID, clientName: o.ClientDisplayName, title: o.Title,
		tripType: o.TripType, status: o.Status,
		startLabel: monthDay(deref(o.StartDate)), endLabel: monthDay(deref(o.EndDate)),
		destinations: o.Destinations, travelerCount: o.TravelerCount,
		totalValueLabel: money(o.TotalValueCents), totalPaidLabel: money(o.TotalPaidCents),
		totalCommission: money(o.TotalCommissionCents),
		paidCents:       int64(o.TotalPaidCents), commissionCents: int64(o.TotalCommissionCents),
		cancellationReason: deref(o.CancellationReason), refundStatus: deref(o.RefundStatus),
		refundDetail: deref(o.RefundDetail), notes: deref(o.Notes), version: o.Version,
		componentCount: o.ComponentCount, today: o.AsOfDate, nextUnpaidDue: deref(o.NextUnpaidDueDate),
	}
	if o.LastActivityAt != nil {
		ov.lastActivityLabel = monthDay(localDate(*o.LastActivityAt, v.loc))
	}
	return overviewResult{ov: ov}
}

// localDate ports queries.ts localDate: the calendar date an instant falls on in the
// advisor's zone (PostgREST sends timestamptz in UTC). An unparseable value falls back to its
// first ten characters, as the TS does.
func localDate(ts string, loc *time.Location) string {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999-07:00", "2006-01-02 15:04:05.999999-07"} {
		if t, err := time.Parse(layout, ts); err == nil {
			return t.In(loc).Format("2006-01-02")
		}
	}
	if len(ts) >= 10 {
		return ts[:10]
	}
	return ""
}

// hhmm trims Postgres's HH:MM:SS to HH:MM; the seconds are never meaningful to show.
func hhmm(v string) string {
	if v == "" {
		return ""
	}
	parts := strings.Split(v, ":")
	if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
		return parts[0] + ":" + parts[1]
	}
	return v
}

// componentRow is AgentTripComponentRow. payload is kept raw: the builder's sheets read it
// into typed fields, never into any.
type componentRow struct {
	ComponentID        string          `json:"component_id"`
	Kind               string          `json:"kind"`
	DisplayName        string          `json:"display_name"`
	SupplierID         *string         `json:"supplier_id"`
	SupplierName       *string         `json:"supplier_name"`
	StartDate          *string         `json:"start_date"`
	EndDate            *string         `json:"end_date"`
	StartTime          *string         `json:"start_time"`
	EndTime            *string         `json:"end_time"`
	Location           *string         `json:"location"`
	ConfirmationNumber *string         `json:"confirmation_number"`
	CostCents          Cents           `json:"cost_cents"`
	CommissionPct      *json.Number    `json:"commission_pct"` // a percentage, kept as written
	CommissionCents    Cents           `json:"commission_cents"`
	APISource          *string         `json:"api_source"`
	Payload            json.RawMessage `json:"payload"`
	OrderIndex         int             `json:"order_index"`
}

// component is TripComponentRow; row keeps the unformatted fields for the builder's sheets.
type component struct {
	id, icon, title, subtitle, sourceBadge, costLabel string
	orderIndex                                        int
	row                                               componentRow
}

// componentKindIcon: one icon per component_kind; custom and anything unknown is receipt.
func componentKindIcon(kind string) string {
	switch kind {
	case "flight":
		return "plane"
	case "hotel":
		return "building"
	case "cruise":
		return "ship"
	case "transfer":
		return "trip"
	case "excursion":
		return "sparkle"
	case "insurance":
		return "shield"
	}
	return "receipt"
}

func loadComponents(r *http.Request, d handlers.Deps, v visit, tripID string) []component {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[componentRow](r.Context(), d.Supa, v.st, "agent_trip_components", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]component, 0, len(rows))
	for _, c := range rows {
		var bits []string
		if s := monthDay(deref(c.StartDate)); s != "" {
			bits = append(bits, s)
		}
		if t := hhmm(deref(c.StartTime)); t != "" {
			bits = append(bits, t)
		}
		if l := deref(c.Location); l != "" {
			bits = append(bits, l)
		}
		badge := deref(c.APISource)
		if c.APISource == nil {
			badge = "Manual"
		}
		out = append(out, component{
			id: c.ComponentID, icon: componentKindIcon(c.Kind), title: c.DisplayName,
			subtitle: strings.Join(bits, " · "), sourceBadge: badge, costLabel: money(c.CostCents),
			orderIndex: c.OrderIndex, row: c,
		})
	}
	return out
}

// itineraryMetaRow and itineraryDayRow are the two itinerary reads.
type itineraryMetaRow struct {
	ItineraryID   string  `json:"itinerary_id"`
	CoverImageURL *string `json:"cover_image_url"`
	IntroNote     *string `json:"intro_note"`
	ClosingNote   *string `json:"closing_note"`
	PublishedAt   *string `json:"published_at"`
}

type itineraryDayRow struct {
	DayID              string  `json:"day_id"`
	DayNumber          int     `json:"day_number"`
	Date               *string `json:"date"`
	DayLabel           *string `json:"day_label"`
	DaySummary         *string `json:"day_summary"`
	ActivityID         *string `json:"activity_id"`
	Block              *string `json:"block"`
	StartTime          *string `json:"start_time"`
	EndTime            *string `json:"end_time"`
	ActivityTitle      *string `json:"activity_title"`
	ActivityBody       *string `json:"activity_body"`
	Location           *string `json:"location"`
	Address            *string `json:"address"`
	Phone              *string `json:"phone"`
	ConfirmationNumber *string `json:"confirmation_number"`
	GyasisTip          *string `json:"gyasis_tip"`
	ComponentID        *string `json:"component_id"`
}

type itineraryActivity struct {
	id, block, timeLabel, title, body, location, confirmation, tip, componentID string
	startTime, endTime, address, phone                                          string
}

type itineraryDay struct {
	id                           string
	number                       int
	dateLabel, date, label, summ string
	activities                   []itineraryActivity
}

type itinerary struct {
	itineraryID, coverImageURL, introNote, closingNote string
	published                                          bool
	days                                               []itineraryDay
}

func (it itinerary) publishedLabel() string {
	if it.published {
		return "Published"
	}
	return "Draft"
}

func loadItinerary(r *http.Request, d handlers.Deps, v visit, tripID string) *itinerary {
	if !v.canRead() {
		return nil
	}
	var (
		meta       []itineraryMetaRow
		days       []itineraryDayRow
		err1, err2 error
	)
	parallel(
		func() {
			meta, err1 = agentread.Call[itineraryMetaRow](r.Context(), d.Supa, v.st, "agent_trip_itinerary_meta", tripArgs{tripID}, d.Log)
		},
		func() {
			days, err2 = agentread.Call[itineraryDayRow](r.Context(), d.Supa, v.st, "agent_trip_itinerary_days", tripArgs{tripID}, d.Log)
		},
	)
	if err1 != nil || err2 != nil {
		return nil
	}
	// No itinerary drafted yet is a real, empty state, not a read failure.
	if len(meta) == 0 {
		return &itinerary{}
	}
	m := meta[0]
	it := &itinerary{itineraryID: m.ItineraryID, coverImageURL: deref(m.CoverImageURL),
		introNote: deref(m.IntroNote), closingNote: deref(m.ClosingNote), published: m.PublishedAt != nil}
	index := map[string]int{}
	for _, row := range days {
		i, ok := index[row.DayID]
		if !ok {
			i = len(it.days)
			index[row.DayID] = i
			it.days = append(it.days, itineraryDay{
				id: row.DayID, number: row.DayNumber, dateLabel: monthDay(deref(row.Date)),
				date: deref(row.Date), label: deref(row.DayLabel), summ: deref(row.DaySummary),
			})
		}
		// The LEFT JOIN yields one all-null activity row for a day with nothing scheduled.
		if row.ActivityID != nil {
			it.days[i].activities = append(it.days[i].activities, itineraryActivity{
				id: *row.ActivityID, block: deref(row.Block), timeLabel: hhmm(deref(row.StartTime)),
				title: deref(row.ActivityTitle), body: deref(row.ActivityBody),
				location: deref(row.Location), confirmation: deref(row.ConfirmationNumber),
				tip: deref(row.GyasisTip), componentID: deref(row.ComponentID),
				startTime: hhmm(deref(row.StartTime)), endTime: hhmm(deref(row.EndTime)),
				address: deref(row.Address), phone: deref(row.Phone),
			})
		}
	}
	sort.SliceStable(it.days, func(a, b int) bool { return it.days[a].number < it.days[b].number })
	return it
}

// paymentRow is AgentTripPaymentRow. pay_url and paid_note are read for the advisor only;
// paid_note never reaches a client page (CLAUDE.md rule 4).
type paymentRow struct {
	MilestoneID   string  `json:"milestone_id"`
	Kind          string  `json:"kind"`
	Label         string  `json:"label"`
	AmountCents   Cents   `json:"amount_cents"`
	PaidCents     Cents   `json:"paid_cents"`
	DueDate       *string `json:"due_date"`
	PaidAt        *string `json:"paid_at"`
	Status        string  `json:"status"`
	OrderIndex    int     `json:"order_index"`
	PayURL        *string `json:"pay_url"`
	PaidReference *string `json:"paid_reference"`
	PaidNote      *string `json:"paid_note"`
}

// payment is TripPaymentRow.
type payment struct {
	id, kind, label, amountLabel, paidLabel, dueLabel, paidOnLabel, status string
	good                                                                   bool
	payURL, paySite                                                        string
	isTravefy                                                              bool
	paidReference, paidNote                                                string
	amountCents, paidCents                                                 int64
	dueDate                                                                string
}

func loadPayments(r *http.Request, d handlers.Deps, v visit, tripID string) []payment {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[paymentRow](r.Context(), d.Supa, v.st, "agent_trip_payments", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]payment, 0, len(rows))
	for _, p := range rows {
		paidOn := ""
		if p.PaidAt != nil && len(*p.PaidAt) >= 10 {
			paidOn = monthDay((*p.PaidAt)[:10])
		}
		site := paySiteName(deref(p.PayURL))
		out = append(out, payment{
			id: p.MilestoneID, kind: p.Kind, label: p.Label,
			amountLabel: money(p.AmountCents), paidLabel: money(p.PaidCents),
			dueLabel: monthDay(deref(p.DueDate)), paidOnLabel: paidOn, status: p.Status,
			good: p.Status == "paid", payURL: deref(p.PayURL), paySite: site,
			isTravefy:     site != "" && (site == "travefy.com" || strings.HasSuffix(site, ".travefy.com")),
			paidReference: deref(p.PaidReference), paidNote: deref(p.PaidNote),
			amountCents: int64(p.AmountCents), paidCents: int64(p.PaidCents), dueDate: deref(p.DueDate),
		})
	}
	return out
}

type documentRow struct {
	DocumentID  string `json:"document_id"`
	Kind        string `json:"kind"`
	Filename    string `json:"filename"`
	SizeBytes   Cents  `json:"size_bytes"` // the same digit-string parse, whatever it means
	IsSensitive bool   `json:"is_sensitive"`
	CreatedAt   string `json:"created_at"`
}

var documentKindLabel = map[string]string{
	"passport": "Passport", "visa": "Visa", "insurance_cert": "Insurance certificate",
	"supplier_confirmation": "Supplier confirmation", "receipt": "Receipt", "photo": "Photo",
	"csv_import": "CSV import",
}

// sizeLabel ports tripDetail.ts sizeLabel: B, KB (toFixed(0)), MB (toFixed(1)).
func sizeLabel(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%.0f KB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
}

type document struct{ id, filename, meta string }

func loadDocuments(r *http.Request, d handlers.Deps, v visit, tripID string) []document {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[documentRow](r.Context(), d.Supa, v.st, "agent_trip_documents", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]document, 0, len(rows))
	for _, doc := range rows {
		kind, ok := documentKindLabel[doc.Kind]
		if !ok {
			kind = doc.Kind
		}
		meta := kind + " · " + sizeLabel(int64(doc.SizeBytes))
		if c := monthDay(localDate(doc.CreatedAt, v.loc)); c != "" {
			meta += " · " + c
		}
		out = append(out, document{id: doc.DocumentID, filename: doc.Filename, meta: meta})
	}
	return out
}

type messageRow struct {
	MessageID      string `json:"message_id"`
	SenderRole     string `json:"sender_role"`
	Body           string `json:"body"`
	CreatedAt      string `json:"created_at"`
	IsInternalNote bool   `json:"is_internal_note"`
}

type tripMessage struct {
	sender, body, created string
	internal              bool
}

func loadMessages(r *http.Request, d handlers.Deps, v visit, tripID string) []tripMessage {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[messageRow](r.Context(), d.Supa, v.st, "agent_trip_messages", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]tripMessage, 0, len(rows))
	for _, m := range rows {
		sender := m.SenderRole
		switch m.SenderRole {
		case "agent":
			sender = "You"
		case "client":
			sender = "Client"
		}
		out = append(out, tripMessage{sender: sender, body: m.Body,
			created: monthDay(localDate(m.CreatedAt, v.loc)), internal: m.IsInternalNote})
	}
	return out
}

type activityRow struct {
	HistoryID     string  `json:"history_id"`
	FromStatus    *string `json:"from_status"`
	ToStatus      string  `json:"to_status"`
	ChangedAt     string  `json:"changed_at"`
	ChangedByName *string `json:"changed_by_name"`
}

type activity struct{ change, who, when string }

func loadActivity(r *http.Request, d handlers.Deps, v visit, tripID string) []activity {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[activityRow](r.Context(), d.Supa, v.st, "agent_trip_activity", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	label := func(s string) string { _, l := statusPresentation(s, "", ""); return l }
	out := make([]activity, 0, len(rows))
	for _, h := range rows {
		change := label(h.ToStatus)
		if h.FromStatus != nil {
			change = label(*h.FromStatus) + " → " + label(h.ToStatus)
		}
		who := "System" // a transition with no recorded actor must not render a blank name
		if h.ChangedByName != nil {
			who = *h.ChangedByName
		}
		out = append(out, activity{change: change, who: who, when: monthDay(localDate(h.ChangedAt, v.loc))})
	}
	return out
}

type openCommissionRow struct {
	CommissionID            string `json:"commission_id"`
	SupplierName            string `json:"supplier_name"`
	Status                  string `json:"status"`
	ExpectedCommissionCents Cents  `json:"expected_commission_cents"`
	Version                 int    `json:"version"`
}

// openLine is TripOpenCommissionLine: one ledger line the cancel dialog offers to mark Lost.
type openLine struct {
	id                          string
	version                     int
	supplier, status, amountTxt string
}

// commissionStatusLabel is COMMISSION_STATUS_FILTERS' labels; anything else echoes.
func commissionStatusLabel(s string) string {
	switch s {
	case "expected":
		return "Expected"
	case "invoiced":
		return "Invoiced"
	case "received":
		return "Received"
	case "disputed":
		return "Disputed"
	case "lost":
		return "Lost"
	}
	return s
}

// loadOpenCommission: nil when the read failed, which the dialog says rather than offering
// nothing as though there were nothing. It never fails the page.
func loadOpenCommission(r *http.Request, d handlers.Deps, v visit, tripID string) []openLine {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[openCommissionRow](r.Context(), d.Supa, v.st, "agent_trip_open_commission", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]openLine, 0, len(rows))
	for _, l := range rows {
		out = append(out, openLine{id: l.CommissionID, version: l.Version, supplier: l.SupplierName,
			status: commissionStatusLabel(l.Status), amountTxt: money(l.ExpectedCommissionCents)})
	}
	return out
}
