package client

import (
	"net/http"
	"slices"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Screen 2.2.1 Client Dashboard / Home (web/app/(client)/dashboard).

var dashboardSpec = page.Spec{
	File:   "client/dashboard.html",
	Layout: shell.Client,
	Slots: append([]string{
		"error", "header", "overline", "greeting", "sub-traveling", "sub-none",
		"hero-grid", "hero", "hero-photo", "hero-chip", "hero-title", "hero-meta",
		"countdown", "countdown-days", "hero-itinerary", "hero-itinerary-pending",
		"payment", "payment-head", "payment-title", "payment-when",
		"advisor-initials", "advisor-quote", "advisor-message",
		"no-trip",
		"planning-heading", "planning-see-all", "planning-empty", "planning-list",
		"past-heading", "past-see-all", "past-empty", "past-list",
	}, payBlockSlots("pay")...),
	Repeats: map[string][]string{
		"planning": {"planning-link", "planning-chip", "planning-title", "planning-meta"},
		"past":     {"past-link", "past-chip", "past-title", "past-meta"},
	},
}

// The copy the page assembles (DASHBOARD); the invariant sentences are in the page file.
const (
	dashOverlineRest      = "WELCOME BACK · YOUR REST IS COMING"
	dashOverlineNeutral   = "WELCOME BACK"
	dashNextPayment       = "NEXT PAYMENT"
	dashAdvisorQuoteOpen  = "“"
	dashAdvisorQuoteClose = "”"
)

// leisureTripTypes are the trip types where a rest framing is safe (LEISURE_TRIP_TYPES). A
// cruise or an all-inclusive is a holiday by construction; `group`, `multi_destination` and
// `custom` are exactly the shapes a wedding, a reunion or a funeral takes, and somebody
// flying to one should not be told to breathe out.
var leisureTripTypes = []string{"cruise", "all_inclusive"}

func isLeisure(tripType string) bool { return slices.Contains(leisureTripTypes, tripType) }

// greeting ports DASHBOARD's four greeting shapes.
func greeting(name string, trip *Trip, leisure bool) string {
	switch {
	case trip == nil:
		return "Hello, " + name + "."
	case trip.Status == StatusInProgress:
		return "You’re there, " + name + "."
	case !trip.HasDaysUntil:
		return "Hello, " + name + "."
	case trip.DaysUntil == 0:
		return "Today’s the day, " + name + "."
	case trip.DaysUntil == 1:
		return "One more day, " + name + "."
	case leisure:
		return "Hey " + name + " — " + strconv.Itoa(trip.DaysUntil) + " days until you can finally breathe out."
	default:
		return "Hey " + name + " — " + strconv.Itoa(trip.DaysUntil) + " days to go."
	}
}

func (a *area) mountDashboard(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(dashboardSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /dashboard", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		d := tmpl.New()

		data, err := a.loadDashboard(r.Context(), v.AccessToken, a.today())
		if err != nil {
			// The ERROR state, not the empty one: a failed read used to render the empty
			// state here, which told a traveler with trips that they had none.
			a.Log.Warn("client: dashboard read failed", "err", err)
			d.Keep("error")
			for _, slot := range []string{"header", "hero-grid", "no-trip"} {
				d.Remove(slot)
			}
			removeSection(d, "planning")
			removeSection(d, "past")
			a.render(w, r, v, d, http.StatusServiceUnavailable)
			return
		}
		d.Remove("error")
		d.Keep("header")

		name := a.greetableName(r, v)
		leisure := data.Upcoming != nil && isLeisure(data.Upcoming.TripType)
		traveling := data.Upcoming != nil && data.Upcoming.Status == StatusInProgress

		if leisure && !traveling {
			d.Text("overline", dashOverlineRest)
		} else {
			d.Text("overline", dashOverlineNeutral)
		}
		d.Text("greeting", greeting(name, data.Upcoming, leisure))
		keepIf(d, "sub-traveling", traveling)
		keepIf(d, "sub-none", data.Upcoming == nil)

		if data.Upcoming == nil {
			// The whole grid goes, and with it the payment card and the pay block inside it.
			d.Remove("hero-grid")
			d.Keep("no-trip")
		} else {
			d.Remove("no-trip")
			d.Keep("hero-grid")
			a.fillHero(d, *data.Upcoming, data.ItineraryReady)
			a.fillPayment(d, data.NextPayment)
			a.fillAdvisor(d, *data.Upcoming, data.LatestMessage)
		}

		fillSection(d, "planning", "In planning · "+strconv.Itoa(len(data.InPlanning)), data.InPlanning)
		fillSection(d, "past", "Past trips · "+strconv.Itoa(len(data.Past)), data.Past)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

// heroPhotoWidth is what the hero asks Unsplash for: 640 CSS pixels at 2x.
const heroPhotoWidth = 1280

func (a *area) fillHero(d *page.Doc, t Trip, itineraryReady bool) {
	d.Keep("hero")
	photo := PhotoForTrip(t.ID, t.TripType, t.Destinations)
	d.URL("hero-photo", "src", PhotoURL(photo, heroPhotoWidth))
	d.Attr("hero-photo", "alt", "")
	d.Text("hero-chip", t.StatusLabel)
	d.Class("hero-chip", ChipClass(t.Chip), true)
	d.Text("hero-title", t.Title)
	d.Text("hero-meta", tripMeta(t))

	if t.HasDaysUntil {
		d.Keep("countdown")
		d.Text("countdown-days", strconv.Itoa(t.DaysUntil))
	} else {
		d.Remove("countdown")
	}
	// An unpublished itinerary is Gyasi's draft, so the link is not there to be followed —
	// the page says he is still writing it instead.
	if itineraryReady {
		d.URL("hero-itinerary", "href", "/trips/"+t.ID+"/itinerary")
		d.Remove("hero-itinerary-pending")
	} else {
		d.Remove("hero-itinerary")
		d.Keep("hero-itinerary-pending")
	}
}

func (a *area) fillPayment(d *page.Doc, m *Milestone) {
	if m == nil {
		// The card goes, and the pay block inside it with it.
		d.Remove("payment")
		return
	}
	d.Keep("payment")
	head := dashNextPayment
	if m.DueDate != "" {
		head += " · DUE " + upper(FormatDay(m.DueDate))
	}
	d.Text("payment-head", head)

	// What is still open, or the whole amount when nothing has been paid against it.
	open := m.AmountCents - m.PaidCents
	if open <= 0 {
		open = m.AmountCents
	}
	d.Text("payment-title", m.Label+" · "+FormatMoney(open, m.Currency))
	// "Whenever it suits you before then" only makes sense while there is a before.
	keepIf(d, "payment-when", m.HasDue)
	fillPayBlock(d, "pay", *m, "/dashboard")
}

func (a *area) fillAdvisor(d *page.Doc, t Trip, latest *LatestMessage) {
	d.Keep("advisor-initials")
	// Only the advisor's own words are quoted. When the traveler spoke last the card drops
	// the quote and keeps the reply line, which is what somebody waiting for an answer
	// wants to see.
	if latest != nil && latest.FromAgent && latest.Body != "" {
		d.Text("advisor-quote", dashAdvisorQuoteOpen+latest.Body+dashAdvisorQuoteClose)
	} else {
		d.Remove("advisor-quote")
	}
	d.URL("advisor-message", "href", "/trips/"+t.ID+"/messages")
}

// fillSection fills one of the two trip lists under the hero.
func fillSection(d *page.Doc, prefix, heading string, trips []Trip) {
	d.Text(prefix+"-heading", heading)
	if len(trips) == 0 {
		d.Remove(prefix + "-see-all")
		d.Keep(prefix + "-empty")
		// Removing the <ul> takes its repeat with it; filling the repeat afterwards is
		// "already filled or removed".
		d.Remove(prefix + "-list")
		return
	}
	d.Keep(prefix + "-see-all")
	d.Remove(prefix + "-empty")
	d.Keep(prefix + "-list")
	d.Repeat(prefix, len(trips), func(i int, row *page.Row) {
		t := trips[i]
		row.URL(prefix+"-link", "href", "/trips/"+t.ID)
		row.Text(prefix+"-chip", t.StatusLabel)
		row.Class(prefix+"-chip", ChipClass(t.Chip), true)
		row.Text(prefix+"-title", t.Title)
		meta := FormatTripDates(t.StartDate, t.EndDate)
		if len(t.Destinations) > 0 && t.Destinations[0] != "" {
			meta += " · " + t.Destinations[0]
		}
		row.Text(prefix+"-meta", meta)
	})
}

// removeSection takes a whole section out, for the error state: the page is then its
// message and nothing else.
func removeSection(d *page.Doc, prefix string) {
	for _, suffix := range []string{"-heading", "-see-all", "-empty", "-list"} {
		d.Remove(prefix + suffix)
	}
}

// keepIf keeps a block or takes it out.
func keepIf(d *page.Doc, slot string, on bool) {
	if on {
		d.Keep(slot)
		return
	}
	d.Remove(slot)
}

// greetableName is the name the hero greets, or "there". handle_new_user()'s placeholder
// 'New' is treated as absent, as it is in the wizard.
func (a *area) greetableName(r *http.Request, v visitor) string {
	if a.off {
		return "there"
	}
	row, found, err := supa.MaybeOne[clientNameRow](r.Context(), a.Supa, v.AccessToken, "client",
		supa.Q().Select("first_name,preferred_name"))
	if err != nil || !found {
		return "there"
	}
	name := text(row.PreferredName)
	if name == "" {
		name = text(row.FirstName)
	}
	if name == "" || name == "New" {
		return "there"
	}
	return name
}

// upper is ASCII upper-casing for the dates in the payment overline.
func upper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 'a' - 'A'
		}
	}
	return string(b)
}
