package client

import (
	"context"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Screen 2.2.9's copy and read, ported from web/lib/trips/statusChange.ts and
// loadStatusChange.
//
// WHAT THIS SCREEN CAN HONESTLY SAY is the design problem it exists around. The artboard's
// "What changed" card lists three specific facts — the resort, the price, "two room types to
// choose between" — and NOTHING IN THE SCHEMA RECORDS A DIFF. There is trip.status and
// trip.status_changed_at, and that is all. So the headline and description are derived from
// the status it landed ON, the supporting detail comes from real rows (a sent proposal, a
// published itinerary, the next unpaid milestone), and "two room types" is never said by
// anything. Narrating a change we cannot see would put words in Gyasi's mouth on the screen
// where being wrong costs most.

// StatusChangeMessages is STATUS_CHANGE_MESSAGES, word for word.
var StatusChangeMessages = struct {
	WhatChanged, WhatsNext                         string
	OverlineUpdated, OverlineInquiry               string
	OverlineTravelling, OverlineHome               string
	HeadingInquiry, HeadingProposal, HeadingBooked string
	HeadingTravelling, HeadingCompleted            string
	HeadingCancelled                               string
	ItineraryLine                                  string
	ViewProposal, ViewItinerary, ViewTrip          string
	ViewSummary, ViewMemories                      string
	ChangedUnknown                                 string
}{
	WhatChanged:        "What changed",
	WhatsNext:          "What’s next",
	OverlineUpdated:    "Status updated",
	OverlineInquiry:    "We have your note",
	OverlineTravelling: "You’re travelling",
	OverlineHome:       "Welcome home",
	HeadingInquiry:     "Gyasi has your inquiry",
	HeadingProposal:    "Your proposal is ready",
	HeadingBooked:      "It’s booked",
	HeadingTravelling:  "You’re on your way",
	HeadingCompleted:   "That’s a wrap",
	HeadingCancelled:   "This trip has been cancelled",
	ItineraryLine:      "The day-by-day is published and ready to read",
	ViewProposal:       "View the proposal",
	ViewItinerary:      "Read the itinerary",
	ViewTrip:           "Open the trip",
	ViewSummary:        "See the cancellation summary",
	ViewMemories:       "Open the memories",
	// Shown when status_changed_at is null — a trip whose status never moved.
	ChangedUnknown: "Recently",
}

// statusChangeBack is this screen's own chrome, which has no mobile twin.
const statusChangeBack = "Back to trip"

var statusOverline = map[TripStatus]string{
	StatusInquiry:    StatusChangeMessages.OverlineInquiry,
	StatusProposal:   StatusChangeMessages.OverlineUpdated,
	StatusBooked:     StatusChangeMessages.OverlineUpdated,
	StatusInProgress: StatusChangeMessages.OverlineTravelling,
	StatusCompleted:  StatusChangeMessages.OverlineHome,
	StatusCancelled:  StatusChangeMessages.OverlineUpdated,
}

var statusHeading = map[TripStatus]string{
	StatusInquiry:    StatusChangeMessages.HeadingInquiry,
	StatusProposal:   StatusChangeMessages.HeadingProposal,
	StatusBooked:     StatusChangeMessages.HeadingBooked,
	StatusInProgress: StatusChangeMessages.HeadingTravelling,
	StatusCompleted:  StatusChangeMessages.HeadingCompleted,
	StatusCancelled:  StatusChangeMessages.HeadingCancelled,
}

// statusBody is the description, which needs the trip's own title interpolated. The quotes
// are curly, as the TypeScript writes them.
var statusBody = map[TripStatus]string{
	StatusInquiry: "“%s” is on his desk. He reads every one himself, so give him a little " +
		"time and he will come back with questions or a plan.",
	StatusProposal: "“%s” moved from an inquiry to a proposal. Gyasi has put something " +
		"together — have a read, no rush.",
	StatusBooked: "“%s” is confirmed. From here Gyasi holds the details and you get to look " +
		"forward to it.",
	StatusInProgress: "“%s” has started. Everything you need is in the itinerary.",
	StatusCompleted: "“%s” is done. Whenever you feel like it, there is a place to keep the " +
		"photos and say what you carried home.",
	StatusCancelled: "“%s” is no longer going ahead. The summary has what was refunded and " +
		"what is held as credit.",
}

// statusNextSteps is per-status, and deliberately gentle. Design-System §2.6's third tone
// check asks whether copy leaves room for rest, and this screen is reached from a
// notification, which is already an interruption.
var statusNextSteps = map[TripStatus][]string{
	StatusInquiry: {"Nothing to do yet", "Gyasi will come back to you with a plan or a question"},
	StatusProposal: {
		"Have a read, no rush",
		"Reply with what you think",
		// Rewritten 2026-10-16 (§3.6 ruling): there is no card to authorize. Clients pay
		// each supplier directly through a pay link.
		"Say yes and Gyasi locks it in. Payments go straight to each supplier.",
	},
	StatusBooked: {
		"Look through the itinerary when you have a minute",
		"Add your passports whenever it suits you",
		"Gyasi will be in touch before you travel",
	},
	StatusInProgress: {"Keep the itinerary handy", "Message Gyasi if anything shifts"},
	StatusCompleted:  {"Have a look at the photos", "Write something down if you feel like it"},
	StatusCancelled:  {"Read the cancellation summary", "Message Gyasi when the timing feels right"},
}

// ProposalLine is "Family Week in Turks · version 1", or a bare version when the proposal
// has no title.
func ProposalLine(version int, title string) string {
	if title != "" {
		return title + " · version " + strconv.Itoa(version)
	}
	return "Proposal · version " + strconv.Itoa(version)
}

// PaymentLine is the next unpaid milestone, named and dated when it has a date.
func PaymentLine(label, money, due string) string {
	if due != "" {
		return label + " · " + money + " due " + due
	}
	return label + " · " + money
}

// statusChangeTripRow is the trip, plus the one column only this screen reads. Widening
// tripRow would put status_changed_at in every trip query on the surface for one page.
type statusChangeTripRow struct {
	tripRow
	StatusChangedAt *string `json:"status_changed_at"`
}

const statusChangeMilestoneColumns = "id,kind,label,amount_cents,paid_cents,currency," +
	"due_date,status,order_index,pay_url"

// StatusChangeView is the whole screen.
type StatusChangeView struct {
	Trip Trip
	// ChangedAt is trip.status_changed_at, or empty on a trip whose status never moved.
	ChangedAt      string
	Proposal       *SentProposal
	ItineraryReady bool
	NextPayment    *Milestone
}

// SentProposal is the newest proposal Gyasi actually sent.
type SentProposal struct {
	ID            string
	CoverTitle    string
	VersionNumber int
}

type proposalRow struct {
	ID            string  `json:"id"`
	CoverTitle    *string `json:"cover_title"`
	VersionNumber int     `json:"version_number"`
	SentAt        *string `json:"sent_at"`
}

// loadStatusChange reads 2.2.9.
func (a *area) loadStatusChange(ctx context.Context, token, tripID string) (*StatusChangeView, bool, error) {
	row, found, err := supa.MaybeOne[statusChangeTripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select(tripColumns+",status_changed_at").Eq("id", tripID))
	if err != nil || !found {
		return nil, false, err
	}

	// The next unpaid milestone, read first because the trip's own view wants its due date.
	//
	// paid AND waived are both excluded. Without the second, 2.2.9 can announce a WAIVED
	// milestone as the next payment — a figure the traveler does not owe, on the screen they
	// reach from a notification. Ordered by order_index like every other milestone query
	// here: sorting by due_date picks a different "next payment" than 2.2.3's timeline
	// whenever the agent's ordering and the dates disagree, and a null due_date sorts last
	// in Postgres, so an undated unpaid milestone would be skipped for a dated one further
	// out.
	milestones, err := supa.Select[milestoneRow](ctx, a.Supa, token, "payment_milestone",
		supa.Q().Select(statusChangeMilestoneColumns).Eq("trip_id", tripID).
			Neq("status", "paid").Raw("status", "neq.waived").
			Order("order_index", true).Limit(1))
	if err != nil {
		return nil, false, err
	}
	nextDue := ""
	var next *Milestone
	if len(milestones) > 0 {
		m := milestones[0].view(tripID, a.today())
		next, nextDue = &m, m.DueDate
	}

	view := &StatusChangeView{
		Trip:        row.tripRow.view(a.today(), nextDue),
		ChangedAt:   text(row.StatusChangedAt),
		NextPayment: next,
	}

	// sent_at IS NOT NULL, because an unsent proposal is a draft Gyasi is still writing —
	// the seed keeps one deliberately and proposal_self_select lets it through, so the
	// filter has to be here. Newest version first.
	proposals, err := supa.Select[proposalRow](ctx, a.Supa, token, "proposal",
		supa.Q().Select("id,cover_title,version_number,sent_at").Eq("trip_id", tripID).
			Raw("sent_at", "not.is.null").Order("version_number", false).Limit(1))
	if err != nil {
		return nil, false, err
	}
	if len(proposals) > 0 {
		view.Proposal = &SentProposal{
			ID: proposals[0].ID, CoverTitle: text(proposals[0].CoverTitle),
			VersionNumber: proposals[0].VersionNumber,
		}
	}

	itinerary, itFound, err := supa.MaybeOne[itineraryRow](ctx, a.Supa, token, "itinerary",
		supa.Q().Select("id,intro_note,closing_note,published_at").Eq("trip_id", tripID))
	if err != nil {
		return nil, false, err
	}
	view.ItineraryReady = itFound && text(itinerary.PublishedAt) != ""

	return view, true, nil
}
