package client

import (
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.2.9 Trip Status Change (web/app/(client)/trips/[tripId]/update).

var tripUpdateSpec = page.Spec{
	File:   "client/trip-update.html",
	Layout: shell.Client,
	Slots: []string{
		"not-found", "body", "back",
		"overline", "changed-at", "heading", "narrative",
		"facts", "facts-title", "next-title", "primary",
	},
	Repeats: map[string][]string{
		"facts": {"fact"},
		"steps": {"step"},
	},
}

func (a *area) mountTripUpdate(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(tripUpdateSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /trips/{tripId}/update", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		view, found, err := a.loadStatusChange(r.Context(), v.AccessToken, tripID)
		d := tmpl.New()
		if err != nil || !found {
			if err != nil {
				a.Log.Warn("client: status change read failed", "err", err)
			}
			// A read that failed and a trip that is not there are one answer HERE, unlike
			// everywhere else on this surface, because this screen is reached from a
			// notification: somebody following a link from an email is not debugging, and
			// the trip list is where they can get their bearings either way.
			d.Remove("body")
			d.Keep("not-found")
			a.render(w, r, v, d, http.StatusNotFound)
			return
		}

		d.Remove("not-found")
		d.Keep("body")
		fillTripUpdate(d, view, tripID)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

func fillTripUpdate(d *page.Doc, view *StatusChangeView, tripID string) {
	t := view.Trip
	d.URL("back", "href", "/trips/"+tripID)
	d.Attr("back", "aria-label", statusChangeBack)

	d.Text("overline", statusOverline[t.Status])
	changed := StatusChangeMessages.ChangedUnknown
	if len(view.ChangedAt) >= len(isoDate) {
		// The DATE part only, through the same formatter every other date on the surface
		// uses, which with no end date gives "Mar 14, 2027".
		changed = FormatTripDates(view.ChangedAt[:len(isoDate)], "")
	}
	d.Text("changed-at", changed)
	d.Text("heading", statusHeading[t.Status])
	d.Text("narrative", fmt.Sprintf(statusBody[t.Status], t.Title))

	// Only facts with a row behind them.
	var facts []string
	if view.Proposal != nil {
		facts = append(facts, ProposalLine(view.Proposal.VersionNumber, view.Proposal.CoverTitle))
	}
	if view.ItineraryReady {
		facts = append(facts, StatusChangeMessages.ItineraryLine)
	}
	if m := view.NextPayment; m != nil {
		facts = append(facts, PaymentLine(m.Label, FormatMoney(m.AmountCents-m.PaidCents, m.Currency),
			dueText(m.DueDate)))
	}
	if len(facts) == 0 {
		// Remove already handles the repeat inside the card; a Repeat after it errors.
		d.Remove("facts")
	} else {
		d.Keep("facts")
		d.Text("facts-title", StatusChangeMessages.WhatChanged)
		d.Repeat("facts", len(facts), func(i int, row *page.Row) {
			row.Text("fact", facts[i])
		})
	}

	d.Text("next-title", StatusChangeMessages.WhatsNext)
	steps := statusNextSteps[t.Status]
	d.Repeat("steps", len(steps), func(i int, row *page.Row) {
		row.Text("step", steps[i])
	})

	href, label := primaryAction(t.Status, tripID)
	d.URL("primary", "href", href)
	d.Text("primary", label)
}

// dueText is the milestone's due date as the line reads it, or empty.
func dueText(iso string) string {
	if iso == "" {
		return ""
	}
	return FormatDay(iso)
}

// primaryAction is the one button, per status.
func primaryAction(status TripStatus, tripID string) (href, label string) {
	switch status {
	case StatusProposal:
		// The trip page, not a proposal route: there is no proposal screen in P1, and the
		// proposal's own facts are already shown above.
		return "/trips/" + tripID, StatusChangeMessages.ViewProposal
	case StatusCompleted:
		return "/trips/" + tripID + "/memories", StatusChangeMessages.ViewMemories
	case StatusCancelled:
		return "/trips/" + tripID, StatusChangeMessages.ViewSummary
	case StatusBooked, StatusInProgress:
		return "/trips/" + tripID + "/itinerary", StatusChangeMessages.ViewItinerary
	}
	return "/trips/" + tripID, StatusChangeMessages.ViewTrip
}
