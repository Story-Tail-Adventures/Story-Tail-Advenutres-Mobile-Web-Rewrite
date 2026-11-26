package client

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
)

// Screen 2.2.2 All Trips List (web/app/(client)/trips).

var tripsSpec = page.Spec{
	File:   "client/trips.html",
	Layout: shell.Client,
	Slots: []string{
		"error", "tabs", "empty", "empty-title", "empty-body", "list",
		"tab-all", "tab-upcoming", "tab-planning", "tab-past", "tab-cancelled",
		"count-all", "count-upcoming", "count-planning", "count-past", "count-cancelled",
	},
	Repeats: map[string][]string{
		"trips": {"trip-link", "trip-photo", "trip-chip-photo", "trip-chip", "trip-title", "trip-meta", "trip-value"},
	},
}

// The copy this page builds (TRIPS); the invariant sentences are in the page file.
const (
	tripsEmptyAllTitle      = "No trips yet"
	tripsEmptyAllBody       = "Tell Gyasi roughly when and where, and the first one will show up here as soon as he starts on it."
	tripsEmptyFilteredTitle = "Nothing here"
	tripsEmptyFilteredBody  = "Try another tab — your other trips are still where you left them."
)

// tripPhotoWidth is the width the list asks Unsplash for: the card's photo is 200px wide
// from md and full width below it, so this is the phone's column at 2x.
const tripPhotoWidth = 800

func (a *area) mountTrips(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(tripsSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /trips", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		filter := ParseFilter(r.URL.Query().Get("filter"))
		d := tmpl.New()

		list, err := a.loadTrips(r.Context(), v.AccessToken, filter, a.today())
		if err != nil {
			// The error state, NOT the empty one.
			a.Log.Warn("client: trips read failed", "err", err)
			fillTripsEmptyChrome(d)
			d.Keep("error")
			a.render(w, r, v, d, http.StatusServiceUnavailable)
			return
		}

		d.Remove("error")
		d.Keep("tabs")
		for _, f := range Filters {
			tab := "tab-" + string(f)
			d.Keep(tab)
			d.Text("count-"+string(f), strconv.Itoa(list.Counts[f]))
			if f == filter {
				// The tab you are on is the filled chip, and says so to a screen reader.
				d.Attr(tab, "aria-current", "page")
				d.Class(tab, "chip-outlined", false)
				d.Class(tab, "chip-secondary", true)
			}
		}

		if len(list.Trips) == 0 {
			d.Keep("empty")
			d.Remove("list")
			if filter == FilterAll {
				d.Text("empty-title", tripsEmptyAllTitle)
				d.Text("empty-body", tripsEmptyAllBody)
			} else {
				d.Text("empty-title", tripsEmptyFilteredTitle)
				d.Text("empty-body", tripsEmptyFilteredBody)
			}
			a.render(w, r, v, d, http.StatusOK)
			return
		}

		d.Remove("empty")
		d.Keep("list")
		d.Repeat("trips", len(list.Trips), func(i int, row *page.Row) {
			t := list.Trips[i]
			row.URL("trip-link", "href", "/trips/"+t.ID)
			photo := PhotoForTrip(t.ID, t.TripType, t.Destinations)
			row.URL("trip-photo", "src", PhotoURL(photo, tripPhotoWidth))
			// Decorative: the trip's name is beside it, so announcing the photograph would
			// be noise before the thing it illustrates.
			row.Attr("trip-photo", "alt", "")
			for _, slot := range []string{"trip-chip-photo", "trip-chip"} {
				row.Text(slot, t.StatusLabel)
				row.Class(slot, ChipClass(t.Chip), true)
			}
			row.Text("trip-title", t.Title)
			row.Text("trip-meta", tripMeta(t))
			row.Text("trip-value", FormatMoney(t.TotalValueCents, t.Currency))
		})
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

// fillTripsEmptyChrome takes out everything the two unhappy states do not use, so the page
// is complete with only its message showing.
func fillTripsEmptyChrome(d *page.Doc) {
	d.Remove("tabs")
	d.Remove("empty")
	d.Remove("list")
}

// tripMeta is the line under a trip's name: its dates, where it goes, and how many are
// going. An empty part is left out rather than leaving a stray separator.
func tripMeta(t Trip) string {
	parts := []string{FormatTripDates(t.StartDate, t.EndDate)}
	if len(t.Destinations) > 0 && t.Destinations[0] != "" {
		parts = append(parts, t.Destinations[0])
	}
	parts = append(parts, strconv.Itoa(t.TravelerCount)+" travelers")
	return strings.Join(parts, " · ")
}
