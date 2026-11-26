package client

import (
	"context"
	"slices"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// The traveler's reads, ported from web/lib/trips/queries.ts. Every one runs as the visitor,
// so RLS decides which trips exist at all; none of them filters by client id, because the
// policy already does and a WHERE that agreed with it would be a second place to get it
// wrong.
//
// MONEY IS int64 CENTS the whole way through (CLAUDE.md rule 5). No row is ever decoded into
// a map or any, where a JSON number becomes a float64 and 482000 cents quietly becomes
// 482000.00000000006.
//
// A READ THAT FAILED IS NOT AN EMPTY LIST. Each loader says which it is, and the pages show
// "we couldn't load your trips" where Next showed its RetryState, never "no trips yet".

// tripRow is the trip columns every traveler screen reads.
type tripRow struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	TripType        string   `json:"trip_type"`
	Status          string   `json:"status"`
	StartDate       *string  `json:"start_date"`
	EndDate         *string  `json:"end_date"`
	Destinations    []string `json:"destinations"`
	TravelerCount   *int     `json:"traveler_count"`
	TotalValueCents int64    `json:"total_value_cents"`
	TotalPaidCents  int64    `json:"total_paid_cents"`
	Currency        *string  `json:"currency"`
}

const tripColumns = "id,title,trip_type,status,start_date,end_date,destinations," +
	"traveler_count,total_value_cents,total_paid_cents,currency"

// Trip is one trip as a page shows it.
type Trip struct {
	ID              string
	Title           string
	TripType        string
	Status          TripStatus
	StartDate       string
	EndDate         string
	Destinations    []string
	TravelerCount   int
	TotalValueCents int64
	TotalPaidCents  int64
	Currency        string
	Chip            string
	StatusLabel     string
	// DaysUntil is set only for a trip that has not started yet.
	DaysUntil    int
	HasDaysUntil bool
}

func (r tripRow) view(today, nextUnpaidDue string) Trip {
	t := Trip{
		ID: r.ID, Title: r.Title, TripType: r.TripType, Status: TripStatus(r.Status),
		StartDate: text(r.StartDate), EndDate: text(r.EndDate),
		Destinations: r.Destinations, TravelerCount: 1,
		TotalValueCents: r.TotalValueCents, TotalPaidCents: r.TotalPaidCents,
		Currency: "USD",
	}
	if r.TravelerCount != nil {
		t.TravelerCount = *r.TravelerCount
	}
	if c := text(r.Currency); c != "" {
		t.Currency = c
	}
	p := StatusPresentation(t.Status, today, nextUnpaidDue)
	t.Chip, t.StatusLabel = p.Chip, p.Label
	t.DaysUntil, t.HasDaysUntil = DaysUntilDeparture(t.StartDate, today)
	return t
}

// Filter is which trips the list shows (TRIP_FILTERS).
type Filter string

// The five tabs.
const (
	FilterAll       Filter = "all"
	FilterUpcoming  Filter = "upcoming"
	FilterPlanning  Filter = "planning"
	FilterPast      Filter = "past"
	FilterCancelled Filter = "cancelled"
)

// Filters in tab order.
var Filters = []Filter{FilterAll, FilterUpcoming, FilterPlanning, FilterPast, FilterCancelled}

// ParseFilter maps a query value to a tab, falling back to All for anything else — the
// filter is in the URL, so it is request input and never trusted.
func ParseFilter(raw string) Filter {
	if slices.Contains(Filters, Filter(raw)) {
		return Filter(raw)
	}
	return FilterAll
}

var filterStatuses = map[Filter][]TripStatus{
	FilterUpcoming:  {StatusBooked, StatusInProgress},
	FilterPlanning:  {StatusInquiry, StatusProposal},
	FilterPast:      {StatusCompleted},
	FilterCancelled: {StatusCancelled},
}

func (f Filter) holds(status TripStatus) bool {
	if f == FilterAll {
		return true
	}
	return slices.Contains(filterStatuses[f], status)
}

// TripsList is what /trips renders: the visible trips and every tab's count.
type TripsList struct {
	Trips  []Trip
	Counts map[Filter]int
}

// loadTrips reads every trip the traveler can see and sorts the newest first, as the Next
// page does, then narrows to the tab. The counts are over all of them, so the tabs do not
// change as you move between them.
func (a *area) loadTrips(ctx context.Context, token string, filter Filter, today string) (*TripsList, error) {
	rows, err := supa.Select[tripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select(tripColumns).Order("start_date", false))
	if err != nil {
		return nil, err
	}

	counts := map[Filter]int{FilterAll: len(rows)}
	for _, f := range Filters[1:] {
		for _, r := range rows {
			if f.holds(TripStatus(r.Status)) {
				counts[f]++
			}
		}
	}

	var visible []tripRow
	for _, r := range rows {
		if filter.holds(TripStatus(r.Status)) {
			visible = append(visible, r)
		}
	}

	// One more read for the trips that can show "Final payment due", never one per row.
	var booked []string
	for _, r := range visible {
		if s := TripStatus(r.Status); s == StatusBooked || s == StatusInProgress {
			booked = append(booked, r.ID)
		}
	}
	dueByTrip := a.nextDueDates(ctx, token, booked)

	out := &TripsList{Counts: counts}
	for _, r := range visible {
		out.Trips = append(out.Trips, r.view(today, dueByTrip[r.ID]))
	}
	return out, nil
}

// milestoneRow is a payment milestone as the traveler reads it. The traveler NEVER writes
// one of these: marking a milestone paid is the advisor's alone (CLAUDE.md rule 4), and the
// pay link is read-only here.
type milestoneRow struct {
	ID          string  `json:"id"`
	TripID      string  `json:"trip_id"`
	Kind        string  `json:"kind"`
	Label       string  `json:"label"`
	AmountCents int64   `json:"amount_cents"`
	PaidCents   int64   `json:"paid_cents"`
	Currency    string  `json:"currency"`
	DueDate     *string `json:"due_date"`
	Status      string  `json:"status"`
	PayURL      *string `json:"pay_url"`
}

// nextDueDates is the earliest unpaid milestone's due date per trip, for the "due" chip.
// A read that fails yields no dates: a trip then reads as "Booked", which is what it was
// before the milestone was looked at, rather than as an error on a list of six other trips.
func (a *area) nextDueDates(ctx context.Context, token string, tripIDs []string) map[string]string {
	out := map[string]string{}
	if len(tripIDs) == 0 {
		return out
	}
	rows, err := supa.Select[milestoneRow](ctx, a.Supa, token, "payment_milestone",
		supa.Q().Select("trip_id,due_date,order_index,status").In("trip_id", tripIDs...).
			Neq("status", "paid").Neq("status", "waived").Order("order_index", true))
	if err != nil {
		a.Log.Warn("client: milestone due dates read failed", "err", err)
		return out
	}
	for _, m := range rows {
		if due := text(m.DueDate); due != "" {
			if _, seen := out[m.TripID]; !seen {
				out[m.TripID] = due
			}
		}
	}
	return out
}

// Dashboard is Screen 2.2.1's data.
type Dashboard struct {
	Upcoming    *Trip
	InPlanning  []Trip
	Past        []Trip
	NextPayment *Milestone
	// ItineraryReady is whether the upcoming trip's itinerary has been published. An
	// unpublished one is Gyasi's draft and is not linked.
	ItineraryReady bool
	LatestMessage  *LatestMessage
}

// Milestone is one payment milestone as a traveler sees it.
type Milestone struct {
	ID          string
	TripID      string
	Kind        string
	Label       string
	AmountCents int64
	PaidCents   int64
	Currency    string
	DueDate     string
	Status      string
	// PayURL is the advisor-entered link. It is rendered through the https-only setter and
	// shown by its host, never written here.
	PayURL       string
	DaysUntilDue int
	HasDue       bool
}

// LatestMessage is the newest conversation's preview, for the dashboard's message card.
type LatestMessage struct {
	Body           string
	CreatedAt      string
	TripID         string
	ConversationID string
	Unread         int
	FromAgent      bool
}

type conversationRow struct {
	ID                 string  `json:"id"`
	TripID             *string `json:"trip_id"`
	LastMessagePreview *string `json:"last_message_preview"`
	LastMessageAt      *string `json:"last_message_at"`
	ClientUnreadCount  *int    `json:"client_unread_count"`
}

type itineraryRow struct {
	ID          string  `json:"id"`
	IntroNote   *string `json:"intro_note"`
	ClosingNote *string `json:"closing_note"`
	PublishedAt *string `json:"published_at"`
}

type senderRow struct {
	SenderRole string `json:"sender_role"`
}

// loadDashboard ports loadDashboard. The trip read is the one that decides whether the page
// can render at all; the reads after it are each allowed to come back empty without taking
// the page down, because a dashboard missing its payment card is still a dashboard.
func (a *area) loadDashboard(ctx context.Context, token, today string) (*Dashboard, error) {
	rows, err := supa.Select[tripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select(tripColumns).Order("start_date", true))
	if err != nil {
		return nil, err
	}

	d := &Dashboard{}
	// The hero is the trip they are ON if there is one, whatever is booked after it;
	// otherwise the first active trip in date order.
	var upcoming *tripRow
	for i, r := range rows {
		status := TripStatus(r.Status)
		if status == StatusInProgress {
			upcoming = &rows[i]
			break
		}
		if status == StatusBooked && upcoming == nil {
			upcoming = &rows[i]
		}
	}

	nextUnpaidDue := ""
	if upcoming != nil {
		if m := a.nextMilestone(ctx, token, upcoming.ID, today); m != nil {
			d.NextPayment, nextUnpaidDue = m, m.DueDate
		}
		if it, found, err := supa.MaybeOne[itineraryRow](ctx, a.Supa, token, "itinerary",
			supa.Q().Select("id,published_at").Eq("trip_id", upcoming.ID)); err != nil {
			a.Log.Warn("client: itinerary read failed", "err", err)
		} else if found {
			d.ItineraryReady = text(it.PublishedAt) != ""
		}
		v := upcoming.view(today, nextUnpaidDue)
		d.Upcoming = &v
	}

	for _, r := range rows {
		switch TripStatus(r.Status) {
		case StatusInquiry, StatusProposal:
			d.InPlanning = append(d.InPlanning, r.view(today, ""))
		case StatusCompleted:
			d.Past = append(d.Past, r.view(today, ""))
		}
	}
	// Past trips read newest first, the reverse of the ascending read.
	slices.Reverse(d.Past)

	d.LatestMessage = a.latestMessage(ctx, token)
	return d, nil
}

// nextMilestone is the earliest unpaid milestone on a trip, or nil.
func (a *area) nextMilestone(ctx context.Context, token, tripID, today string) *Milestone {
	rows, err := supa.Select[milestoneRow](ctx, a.Supa, token, "payment_milestone",
		supa.Q().Select("id,label,amount_cents,paid_cents,currency,due_date,status,order_index,pay_url").
			Eq("trip_id", tripID).Neq("status", "paid").Neq("status", "waived").
			Order("order_index", true).Limit(1))
	if err != nil {
		a.Log.Warn("client: next payment read failed", "err", err)
		return nil
	}
	if len(rows) == 0 {
		return nil
	}
	m := rows[0].view(tripID, today)
	return &m
}

func (r milestoneRow) view(tripID, today string) Milestone {
	m := Milestone{
		ID: r.ID, TripID: tripID, Kind: r.Kind, Label: r.Label,
		AmountCents: r.AmountCents, PaidCents: r.PaidCents, Currency: r.Currency,
		DueDate: text(r.DueDate), Status: r.Status, PayURL: text(r.PayURL),
	}
	if m.Currency == "" {
		m.Currency = "USD"
	}
	if m.DueDate != "" {
		m.DaysUntilDue, m.HasDue = DaysUntilDeparture(m.DueDate, today)
	}
	return m
}

// latestMessage is the newest conversation's preview. Nil when there is none, and nil when
// the read failed — the card simply does not appear, which is what Next does with it.
func (a *area) latestMessage(ctx context.Context, token string) *LatestMessage {
	rows, err := supa.Select[conversationRow](ctx, a.Supa, token, "conversation",
		supa.Q().Select("id,trip_id,last_message_preview,last_message_at,client_unread_count").
			Order("last_message_at", false).Limit(1))
	if err != nil {
		a.Log.Warn("client: conversation read failed", "err", err)
		return nil
	}
	if len(rows) == 0 || text(rows[0].LastMessagePreview) == "" {
		return nil
	}
	c := rows[0]
	out := &LatestMessage{
		Body: text(c.LastMessagePreview), CreatedAt: text(c.LastMessageAt),
		TripID: text(c.TripID), ConversationID: c.ID,
	}
	if c.ClientUnreadCount != nil {
		out.Unread = *c.ClientUnreadCount
	}
	senders, err := supa.Select[senderRow](ctx, a.Supa, token, "message",
		supa.Q().Select("sender_role").Eq("conversation_id", c.ID).
			Order("created_at", false).Limit(1))
	if err == nil && len(senders) > 0 {
		out.FromAgent = senders[0].SenderRole == "agent"
	}
	return out
}

// todayISO is the clock these screens compare dates against: UTC, as todayIsoUtc is.
func todayISO(now time.Time) string { return now.UTC().Format(isoDate) }

func text(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
