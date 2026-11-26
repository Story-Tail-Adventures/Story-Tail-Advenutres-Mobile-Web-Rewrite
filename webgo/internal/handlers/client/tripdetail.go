package client

import (
	"context"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// The reads behind Screen 2.2.3 (one trip) and §2.2.4/§2.2.5 (its itinerary), ported from
// loadTripDetail and loadItinerary in web/lib/trips/queries.ts.
//
// A trip that is not there is NOT an error: RLS answers an id that belongs to somebody else
// exactly as it answers one that never existed, which is the point. Both read as "we
// couldn't find that trip", and the page says so without implying anything about whose it
// might be.

// TripDetail is everything Screen 2.2.3 shows.
type TripDetail struct {
	Trip               Trip
	CancellationReason string
	RefundStatus       string
	IntroNote          string
	ClosingNote        string
	ItineraryReady     bool
	DayCount           int
	ComponentCount     int
	DocumentCount      int
	UnreadCount        int
	ConversationID     string
	Milestones         []Milestone
}

type tripDetailRow struct {
	tripRow
	CancellationReason *string `json:"cancellation_reason"`
	RefundStatus       *string `json:"refund_status"`
}

type countRow struct {
	ID string `json:"id"`
}

type conversationIDRow struct {
	ID                string `json:"id"`
	ClientUnreadCount *int   `json:"client_unread_count"`
}

// loadTripDetail reads one trip and everything the page counts. found is false when RLS says
// there is no such trip for this traveler; err is a read that failed, which is a different
// thing and shows a different page.
func (a *area) loadTripDetail(ctx context.Context, token, tripID, today string) (*TripDetail, bool, error) {
	rows, err := supa.Select[tripDetailRow](ctx, a.Supa, token, "trip",
		supa.Q().Select(tripColumns+",cancellation_reason,refund_status").Eq("id", tripID).Limit(1))
	if err != nil {
		return nil, false, err
	}
	if len(rows) == 0 {
		return nil, false, nil
	}
	row := rows[0]

	d := &TripDetail{
		CancellationReason: text(row.CancellationReason),
		RefundStatus:       text(row.RefundStatus),
	}

	if it, found, err := supa.MaybeOne[itineraryRow](ctx, a.Supa, token, "itinerary",
		supa.Q().Select("id,intro_note,closing_note,published_at").Eq("trip_id", tripID)); err != nil {
		a.Log.Warn("client: itinerary read failed", "err", err)
	} else if found {
		d.IntroNote, d.ClosingNote = text(it.IntroNote), text(it.ClosingNote)
		d.ItineraryReady = text(it.PublishedAt) != ""
		if d.ItineraryReady {
			days, err := supa.Select[countRow](ctx, a.Supa, token, "itinerary_day",
				supa.Q().Select("id").Eq("itinerary_id", it.ID))
			if err != nil {
				a.Log.Warn("client: itinerary day count read failed", "err", err)
			}
			d.DayCount = len(days)
		}
	}

	milestones, err := supa.Select[milestoneRow](ctx, a.Supa, token, "payment_milestone",
		supa.Q().Select("id,kind,label,amount_cents,paid_cents,currency,due_date,status,order_index,pay_url").
			Eq("trip_id", tripID).Order("order_index", true))
	if err != nil {
		a.Log.Warn("client: milestones read failed", "err", err)
	}
	nextUnpaidDue := ""
	for _, m := range milestones {
		view := m.view(tripID, today)
		if nextUnpaidDue == "" && m.Status != "paid" && m.Status != "waived" {
			nextUnpaidDue = view.DueDate
		}
		d.Milestones = append(d.Milestones, view)
	}

	if components, err := supa.Select[countRow](ctx, a.Supa, token, "trip_component",
		supa.Q().Select("id").Eq("trip_id", tripID)); err != nil {
		a.Log.Warn("client: components read failed", "err", err)
	} else {
		d.ComponentCount = len(components)
	}

	if documents, err := supa.Select[countRow](ctx, a.Supa, token, "document",
		supa.Q().Select("id").Eq("trip_id", tripID)); err != nil {
		a.Log.Warn("client: documents count read failed", "err", err)
	} else {
		d.DocumentCount = len(documents)
	}

	if conversations, err := supa.Select[conversationIDRow](ctx, a.Supa, token, "conversation",
		supa.Q().Select("id,client_unread_count").Eq("trip_id", tripID).Limit(1)); err != nil {
		a.Log.Warn("client: conversation read failed", "err", err)
	} else if len(conversations) > 0 {
		d.ConversationID = conversations[0].ID
		if n := conversations[0].ClientUnreadCount; n != nil {
			d.UnreadCount = *n
		}
	}

	d.Trip = row.tripRow.view(today, nextUnpaidDue)
	return d, true, nil
}

// Itinerary is Screens 2.2.4 and 2.2.5.
type Itinerary struct {
	TripID          string
	TripTitle       string
	TripChip        string
	TripStatusLabel string
	StartDate       string
	EndDate         string
	TravelerCount   int
	Destinations    []string
	IntroNote       string
	ClosingNote     string
	Days            []ItineraryDay
	ComponentKinds  []string
	InsuranceRef    string
	Emergency       *emergencyContact
}

// ItineraryDay is one day and what is planned in it.
type ItineraryDay struct {
	ID         string
	DayNumber  int
	Date       string
	Label      string
	Summary    string
	Weather    *DayWeather
	Activities []Activity
}

// DayWeather is the forecast jsonb, read field by field: the column has no CHECK, so what
// comes back is whatever was written.
type DayWeather struct {
	HighF   *float64 `json:"high_f"`
	LowF    *float64 `json:"low_f"`
	Summary *string  `json:"summary"`
	WindMph *float64 `json:"wind_mph"`
	WindDir *string  `json:"wind_dir"`
	UVIndex *float64 `json:"uv_index"`
}

// Any reports whether there is anything worth drawing a card for.
func (w *DayWeather) Any() bool {
	return w != nil && (w.HighF != nil || w.LowF != nil || w.Summary != nil ||
		w.WindMph != nil || w.WindDir != nil || w.UVIndex != nil)
}

// Activity is one thing on a day.
type Activity struct {
	ID           string
	Block        string
	StartTime    string
	EndTime      string
	Title        string
	Body         string
	Location     string
	Address      string
	Phone        string
	Confirmation string
	GyasisTip    string
}

type itineraryDayRow struct {
	ID        string      `json:"id"`
	DayNumber int         `json:"day_number"`
	Date      string      `json:"date"`
	Label     *string     `json:"label"`
	Summary   *string     `json:"summary"`
	Weather   *DayWeather `json:"weather_forecast"`
}

type activityRow struct {
	ID           string  `json:"id"`
	DayID        string  `json:"itinerary_day_id"`
	Block        string  `json:"block"`
	StartTime    *string `json:"start_time"`
	EndTime      *string `json:"end_time"`
	Title        string  `json:"title"`
	Body         *string `json:"body"`
	Location     *string `json:"location"`
	Address      *string `json:"address"`
	Phone        *string `json:"phone"`
	Confirmation *string `json:"confirmation_number"`
	GyasisTip    *string `json:"gyasis_tip"`
	OrderIndex   *int    `json:"order_index"`
}

type componentRow struct {
	Kind         string  `json:"kind"`
	Confirmation *string `json:"confirmation_number"`
}

type emergencyRow struct {
	EmergencyContact *emergencyContact `json:"emergency_contact"`
}

// emergencyContact is client.emergency_contact, jsonb with no CHECK on its shape.
type emergencyContact struct {
	Name         *string `json:"name"`
	Phone        *string `json:"phone"`
	Relationship *string `json:"relationship"`
}

// loadItinerary reads a trip's published itinerary. found is false when the trip is not
// this traveler's, or when there is no itinerary row at all — which is the "not published
// yet" state and not an error.
func (a *area) loadItinerary(ctx context.Context, token, tripID, today string) (*Itinerary, bool, error) {
	trips, err := supa.Select[tripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select(tripColumns).Eq("id", tripID).Limit(1))
	if err != nil {
		return nil, false, err
	}
	if len(trips) == 0 {
		return nil, false, nil
	}
	t := trips[0]

	it, found, err := supa.MaybeOne[itineraryRow](ctx, a.Supa, token, "itinerary",
		supa.Q().Select("id,intro_note,closing_note,published_at").Eq("trip_id", tripID))
	if err != nil {
		return nil, false, err
	}
	if !found {
		return nil, false, nil
	}

	p := StatusPresentation(TripStatus(t.Status), today, "")
	out := &Itinerary{
		TripID: t.ID, TripTitle: t.Title, TripChip: p.Chip, TripStatusLabel: p.Label,
		StartDate: text(t.StartDate), EndDate: text(t.EndDate), TravelerCount: 1,
		Destinations: t.Destinations,
		IntroNote:    text(it.IntroNote), ClosingNote: text(it.ClosingNote),
	}
	if t.TravelerCount != nil {
		out.TravelerCount = *t.TravelerCount
	}

	dayRows, err := supa.Select[itineraryDayRow](ctx, a.Supa, token, "itinerary_day",
		supa.Q().Select("id,day_number,date,label,summary,weather_forecast").
			Eq("itinerary_id", it.ID).Order("day_number", true))
	if err != nil {
		return nil, false, err
	}

	byDay := map[string][]Activity{}
	if len(dayRows) > 0 {
		ids := make([]string, 0, len(dayRows))
		for _, d := range dayRows {
			ids = append(ids, d.ID)
		}
		activities, err := supa.Select[activityRow](ctx, a.Supa, token, "itinerary_activity",
			supa.Q().Select("id,itinerary_day_id,block,start_time,end_time,title,body,location,"+
				"address,phone,confirmation_number,gyasis_tip,order_index").
				In("itinerary_day_id", ids...).Order("order_index", true))
		if err != nil {
			a.Log.Warn("client: activities read failed", "err", err)
		}
		for _, r := range activities {
			byDay[r.DayID] = append(byDay[r.DayID], Activity{
				ID: r.ID, Block: r.Block, StartTime: text(r.StartTime), EndTime: text(r.EndTime),
				Title: r.Title, Body: text(r.Body), Location: text(r.Location),
				Address: text(r.Address), Phone: text(r.Phone),
				Confirmation: text(r.Confirmation), GyasisTip: text(r.GyasisTip),
			})
		}
	}

	for _, d := range dayRows {
		day := ItineraryDay{
			ID: d.ID, DayNumber: d.DayNumber, Date: d.Date,
			Label: text(d.Label), Summary: text(d.Summary), Activities: byDay[d.ID],
		}
		if d.Weather.Any() {
			day.Weather = d.Weather
		}
		out.Days = append(out.Days, day)
	}

	if components, err := supa.Select[componentRow](ctx, a.Supa, token, "trip_component",
		supa.Q().Select("kind,confirmation_number").Eq("trip_id", tripID)); err != nil {
		a.Log.Warn("client: components read failed", "err", err)
	} else {
		for _, c := range components {
			out.ComponentKinds = append(out.ComponentKinds, c.Kind)
			if c.Kind == "insurance" {
				out.InsuranceRef = text(c.Confirmation)
			}
		}
	}

	if row, found, err := supa.MaybeOne[emergencyRow](ctx, a.Supa, token, "client",
		supa.Q().Select("emergency_contact")); err != nil {
		a.Log.Warn("client: emergency contact read failed", "err", err)
	} else if found {
		out.Emergency = row.EmergencyContact
	}
	return out, true, nil
}

// Day finds one day by its number.
func (i *Itinerary) Day(number int) (ItineraryDay, int, bool) {
	for idx, d := range i.Days {
		if d.DayNumber == number {
			return d, idx, true
		}
	}
	return ItineraryDay{}, 0, false
}

// NightsBetween is how many nights a trip runs, or ok false when it has no dates or does not
// span one (nightsBetween).
func NightsBetween(start, end string) (int, bool) {
	nights, ok := DaysBetween(start, end)
	if !ok || nights <= 0 {
		return 0, false
	}
	return nights, true
}

// HumaniseTripType is humaniseTripType: the five known types, and a readable fallback for
// anything the database grows later.
func HumaniseTripType(tripType string) string {
	switch tripType {
	case "cruise":
		return "Cruise"
	case "all_inclusive":
		return "All-inclusive"
	case "multi_destination":
		return "Multi-destination"
	case "group":
		return "Group trip"
	case "custom":
		return "Custom"
	}
	return strings.ReplaceAll(tripType, "_", " ")
}

// DayLabel is "Day 03" (zero-padded, as both artboards draw it); DayShort is "Day 3".
func DayLabel(n int) string {
	if n < 10 {
		return "Day 0" + strconv.Itoa(n)
	}
	return "Day " + strconv.Itoa(n)
}

func DayShort(n int) string { return "Day " + strconv.Itoa(n) }
