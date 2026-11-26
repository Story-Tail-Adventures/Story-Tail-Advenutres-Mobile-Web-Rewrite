package client

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
)

// Screen 2.2.3 Trip Detail (web/app/(client)/trips/[tripId]).

var tripSpec = page.Spec{
	File:   "client/trip.html",
	Layout: shell.Client,
	Slots: []string{
		"not-found", "body", "hero", "hero-photo", "hero-chip", "hero-title", "hero-meta", "hero-pdf",
		"tiles", "tile-itinerary", "tile-itinerary-sub", "tile-itinerary-off",
		"tile-payments-sub", "tile-documents", "tile-documents-sub",
		"tile-messages", "tile-messages-sub",
		"cancelled", "cancel-reason", "refund", "refund-status", "cancelled-itinerary",
		"note", "note-body", "advisor-message", "ready-again",
		"payments", "pay-none", "milestones", "pay-footnote",
	},
	Repeats: map[string][]string{
		"glance":     {"glance-label", "glance-value"},
		"milestones": {"milestone-dot", "milestone-text"},
		"pay-blocks": payBlockSlots("pay"),
	},
}

// The copy this page assembles (TRIP_DETAIL).
const (
	tripNotePending  = "Gyasi hasn't written the introduction yet. It arrives with the itinerary."
	tripNoReason     = "Not recorded"
	tripPaid         = "paid"
	tripDue          = "due"
	tripWaived       = "waived by the supplier"
	tripOverdue      = "overdue"
	tripAllPaid      = "All paid"
	tripNothingSched = "Nothing scheduled"
	tripToBeDecided  = "To be decided"
)

func (a *area) mountTrip(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(tripSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /trips/{tripId}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		d := tmpl.New()

		detail, found, err := a.loadTripDetail(r.Context(), v.AccessToken, tripID, a.today())
		if err != nil {
			a.Log.Warn("client: trip read failed", "err", err)
			a.tripNotFound(w, r, v, d, http.StatusServiceUnavailable)
			return
		}
		if !found {
			// RLS answers somebody else's id exactly as it answers one that never existed,
			// and so does this page: it says nothing about whose trip it might be.
			a.tripNotFound(w, r, v, d, http.StatusNotFound)
			return
		}
		// A finished trip has its own screen; this one is about a trip still ahead.
		if detail.Trip.Status == StatusCompleted {
			httpRedirect(w, r, "/trips/"+tripID+"/memories")
			return
		}

		d.Remove("not-found")
		d.Keep("body")
		cancelled := detail.Trip.Status == StatusCancelled
		a.fillTripHero(d, detail, cancelled)

		if cancelled {
			d.Remove("tiles")
			d.Remove("note")
			d.Remove("payments")
			d.Keep("cancelled")
			d.Keep("ready-again")
			a.fillCancellation(d, detail)
		} else {
			d.Remove("cancelled")
			d.Remove("ready-again")
			d.Keep("tiles")
			d.Keep("note")
			d.Keep("payments")
			a.fillTiles(d, detail)
			d.Keep("note-body")
			if detail.IntroNote != "" {
				d.Text("note-body", detail.IntroNote)
			}
			a.fillTimeline(d, detail)
		}

		a.fillGlance(d, detail)
		d.URL("advisor-message", "href", "/trips/"+detail.Trip.ID+"/messages")
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

// tripNotFound renders the page with only its "we couldn't find that trip" state.
func (a *area) tripNotFound(w http.ResponseWriter, r *http.Request, v visitor, d *page.Doc, status int) {
	d.Keep("not-found")
	d.Remove("body")
	a.render(w, r, v, d, status)
}

const detailHeroWidth = 1600

func (a *area) fillTripHero(d *page.Doc, detail *TripDetail, cancelled bool) {
	t := detail.Trip
	d.Keep("hero")
	photo := PhotoForTrip(t.ID, t.TripType, t.Destinations)
	d.URL("hero-photo", "src", PhotoURL(photo, detailHeroWidth))
	d.Attr("hero-photo", "alt", "")
	// A cancelled trip's photograph is greyed, so the page reads as past before a word of
	// it is read.
	d.Class("hero", "cl-detail-hero-cancelled", cancelled)
	d.Text("hero-chip", t.StatusLabel)
	d.Class("hero-chip", ChipClass(t.Chip), true)
	d.Text("hero-title", t.Title)

	meta := FormatTripDates(t.StartDate, t.EndDate)
	if len(t.Destinations) > 0 && t.Destinations[0] != "" {
		meta += " · " + t.Destinations[0]
	}
	if t.HasDaysUntil && !cancelled {
		meta += " · " + strconv.Itoa(t.DaysUntil) + " days to go"
	}
	d.Text("hero-meta", meta)

	if detail.ItineraryReady {
		d.URL("hero-pdf", "href", "/trips/"+t.ID+"/itinerary")
	} else {
		d.Remove("hero-pdf")
	}
}

func (a *area) fillTiles(d *page.Doc, detail *TripDetail) {
	t := detail.Trip
	if detail.ItineraryReady {
		d.URL("tile-itinerary", "href", "/trips/"+t.ID+"/itinerary")
		d.Text("tile-itinerary-sub", tileItinerarySub(detail.DayCount))
		d.Remove("tile-itinerary-off")
	} else {
		// Not a link that goes nowhere: the tile is there, dimmed, saying why.
		d.Remove("tile-itinerary")
		d.Keep("tile-itinerary-off")
	}
	d.Text("tile-payments-sub", nextDueLabel(detail.Milestones))
	d.URL("tile-documents", "href", "/trips/"+t.ID+"/documents")
	d.Text("tile-documents-sub", plural(detail.DocumentCount, "1 file", "files"))
	d.URL("tile-messages", "href", "/trips/"+t.ID+"/messages")
	d.Text("tile-messages-sub", unreadLabel(detail.UnreadCount))
}

func (a *area) fillCancellation(d *page.Doc, detail *TripDetail) {
	reason := detail.CancellationReason
	if reason == "" {
		reason = tripNoReason
	}
	d.Text("cancel-reason", reason)
	if detail.RefundStatus == "" {
		d.Remove("refund")
	} else {
		d.Keep("refund")
		d.Text("refund-status", detail.RefundStatus)
	}
	// The itinerary of a cancelled trip is still worth keeping: it is where they were going.
	if detail.ItineraryReady {
		d.URL("cancelled-itinerary", "href", "/trips/"+detail.Trip.ID+"/itinerary")
	} else {
		d.Remove("cancelled-itinerary")
	}
}

func (a *area) fillGlance(d *page.Doc, detail *TripDetail) {
	t := detail.Trip
	rows := [][2]string{{"Trip type", HumaniseTripType(t.TripType)}}
	if nights, ok := NightsBetween(t.StartDate, t.EndDate); ok {
		rows = append(rows, [2]string{"Nights", strconv.Itoa(nights) + " nights"})
	}
	where := tripToBeDecided
	if len(t.Destinations) > 0 {
		where = joinNonEmpty(t.Destinations, ", ")
		if where == "" {
			where = tripToBeDecided
		}
	}
	rows = append(rows,
		[2]string{"Destination", where},
		[2]string{"Travelers", strconv.Itoa(t.TravelerCount) + " travelers"},
		[2]string{"Total value", FormatMoney(t.TotalValueCents, t.Currency) + " all-in"},
		[2]string{"Booked pieces", strconv.Itoa(detail.ComponentCount) + " booked"},
	)
	d.Repeat("glance", len(rows), func(i int, row *page.Row) {
		row.Text("glance-label", rows[i][0])
		row.Text("glance-value", rows[i][1])
	})
}

func (a *area) fillTimeline(d *page.Doc, detail *TripDetail) {
	if len(detail.Milestones) == 0 {
		d.Keep("pay-none")
		d.Remove("milestones")
		d.Repeat("pay-blocks", 0, nil)
		d.Remove("pay-footnote")
		return
	}
	d.Remove("pay-none")
	d.Keep("milestones")
	d.Keep("pay-footnote")
	d.Repeat("milestones", len(detail.Milestones), func(i int, row *page.Row) {
		m := detail.Milestones[i]
		row.Keep("milestone-dot")
		switch m.Status {
		case "paid":
			row.Class("milestone-dot", "cl-dot-paid", true)
		case "overdue":
			row.Class("milestone-dot", "cl-dot-overdue", true)
		}
		row.Class("milestone-text", "text-error", m.Status == "overdue")
		row.Text("milestone-text", milestoneLine(m))
	})

	// A pay block for each milestone that is still open AND carries a link this surface
	// will show. The rest are lines in the timeline and nothing more.
	var payable []Milestone
	for _, m := range detail.Milestones {
		if IsOpenMilestone(m.Status) && PaySiteName(m.PayURL) != "" {
			payable = append(payable, m)
		}
	}
	back := "/trips/" + detail.Trip.ID
	d.Repeat("pay-blocks", len(payable), func(i int, row *page.Row) {
		fillPayBlock(row, "pay", payable[i], back)
	})
}

// milestoneLine is one line of the payment timeline.
func milestoneLine(m Milestone) string {
	switch {
	case m.Status == "waived":
		return m.Label + " · " + tripWaived
	case m.Status == "paid":
		return m.Label + " · " + tripPaid + " " + FormatMoney(m.PaidCents, m.Currency)
	}
	word := tripDue
	if m.Status == "overdue" {
		word = tripOverdue
	}
	line := m.Label + " · " + FormatMoney(m.AmountCents, m.Currency) + " " + word
	if m.DueDate != "" {
		line += " " + FormatDay(m.DueDate)
	}
	return line
}

// nextDueLabel is the payments tile's line.
func nextDueLabel(milestones []Milestone) string {
	for _, m := range milestones {
		if m.Status != "paid" && m.Status != "waived" {
			line := FormatMoney(m.AmountCents, m.Currency) + " " + tripDue
			if m.DueDate != "" {
				line += " " + FormatDay(m.DueDate)
			}
			return line
		}
	}
	if len(milestones) > 0 {
		return tripAllPaid
	}
	return tripNothingSched
}

func tileItinerarySub(days int) string {
	if days > 0 {
		return strconv.Itoa(days) + " days, day by day"
	}
	return "Day-by-day"
}

func unreadLabel(n int) string {
	switch n {
	case 0:
		return "Open the thread"
	case 1:
		return "1 unread"
	}
	return strconv.Itoa(n) + " unread"
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return strconv.Itoa(n) + " " + many
}

func joinNonEmpty(values []string, sep string) string {
	out := ""
	for _, v := range values {
		if v == "" {
			continue
		}
		if out != "" {
			out += sep
		}
		out += v
	}
	return out
}

// httpRedirect is a 303 that does not depend on web.SeeOther's cache header, for the one
// redirect this page makes before it has decided anything else.
func httpRedirect(w http.ResponseWriter, r *http.Request, to string) {
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, to, http.StatusSeeOther)
}
