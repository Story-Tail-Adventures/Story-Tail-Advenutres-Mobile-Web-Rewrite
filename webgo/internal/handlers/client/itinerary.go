package client

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screens 2.2.4 Itinerary Viewer and 2.2.5 Day Detail
// (web/app/(client)/trips/[tripId]/itinerary).

var itinerarySpec = page.Spec{
	File:   "client/itinerary.html",
	Layout: shell.Client,
	Slots: []string{
		"not-ready", "not-ready-title", "not-ready-body", "not-ready-back",
		"body", "back", "chip", "title", "meta", "strip", "intro", "no-days", "days",
		"important", "no-info",
	},
	Repeats: map[string][]string{
		"day-chips": {"chip-link"},
		"rows": {
			"day-head", "day-number", "day-title", "day-open",
			"activity", "activity-time", "activity-block", "activity-title", "activity-body",
			"day-empty", "day-empty-title",
		},
		"important": {"info-label", "info-value"},
	},
}

var itineraryDaySpec = page.Spec{
	File:   "client/itinerary-day.html",
	Layout: shell.Client,
	Slots: []string{
		"back", "day-number", "day-title", "day-date",
		"weather", "weather-line", "weather-uv", "summary",
		"day-empty", "day-empty-title", "activities",
		"prev", "prev-label", "next", "next-label", "important", "no-info",
	},
	Repeats: map[string][]string{
		"activities": {
			"activity", "activity-time", "activity-block", "activity-title", "activity-body",
			"activity-conf", "activity-conf-value", "activity-range",
			"activity-tip", "activity-tip-text", "activity-map", "activity-call",
		},
		"important": {"info-label", "info-value"},
	},
}

// The copy these two screens assemble (ITINERARY).
const (
	itinNotPublishedTitle = "Your itinerary isn't ready yet"
	itinNotPublishedBody  = "Gyasi is still writing it. It appears here the moment he publishes, and you'll get an email when it does."
	itinNotFoundTitle     = "We couldn't find that itinerary"
	itinNotFoundBody      = "It may belong to a different trip, or the trip may have been archived."
	itinNoInfo            = "Nothing filed for this trip yet."
	itinVisaUnknown       = "Ask Gyasi about visas"
	itinInsurance         = "Insurance"
	itinEmergency         = "Emergency contact"
)

// blockLabel is BLOCK_LABEL: the four parts of a day, as the artboards head them.
func blockLabel(block string) string {
	switch block {
	case "morning":
		return "MORNING"
	case "afternoon":
		return "AFTERNOON"
	case "evening":
		return "EVENING"
	case "all_day":
		return "ALL DAY"
	}
	return upper(strings.ReplaceAll(block, "_", " "))
}

// shortTime is a time column's "14:00": the stored time without its seconds.
func shortTime(t string) string {
	if len(t) >= 5 {
		return t[:5]
	}
	return t
}

// timeRange is "14:00 – 16:00", or "" when there is no end to show.
func timeRange(start, end string) string {
	if start == "" || end == "" {
		return ""
	}
	return shortTime(start) + " – " + shortTime(end)
}

func (a *area) mountItinerary(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(itinerarySpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /trips/{tripId}/itinerary", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		d := tmpl.New()

		it, found, err := a.loadItinerary(r.Context(), v.AccessToken, tripID, a.today())
		if err != nil {
			a.Log.Warn("client: itinerary read failed", "err", err)
			a.itineraryMissing(w, r, v, d, tripID, http.StatusServiceUnavailable, itinNotFoundTitle, itinNotFoundBody)
			return
		}
		if !found {
			// No itinerary row is "not published yet", which is a different sentence from a
			// trip that is not theirs — but both end here, and neither says which.
			a.itineraryMissing(w, r, v, d, tripID, http.StatusOK, itinNotPublishedTitle, itinNotPublishedBody)
			return
		}

		d.Remove("not-ready")
		d.Keep("body")
		d.URL("back", "href", "/trips/"+tripID)
		d.Text("chip", it.TripStatusLabel)
		d.Class("chip", ChipClass(it.TripChip), true)
		d.Text("title", it.TripTitle)
		meta := FormatTripDates(it.StartDate, it.EndDate) + " · " + strconv.Itoa(it.TravelerCount) + " travelers"
		d.Text("meta", meta)

		// The day strip is only worth its space with more than one day in it.
		if len(it.Days) > 1 {
			d.Keep("strip")
			// Each chip opens that day's own page rather than scrolling to it: an
			// anchor needs an id per day, and `id` is not an attribute Go may set (a page
			// cannot grow ids from data). The day page is the fuller view of the same thing,
			// and on a phone it is the better destination anyway. Noted in the PR.
			d.Repeat("day-chips", len(it.Days), func(i int, row *page.Row) {
				row.URL("chip-link", "href", "/trips/"+tripID+"/itinerary/"+strconv.Itoa(it.Days[i].DayNumber))
				row.Text("chip-link", DayShort(it.Days[i].DayNumber))
			})
		} else {
			d.Remove("strip")
			d.Repeat("day-chips", 0, nil)
		}

		if it.IntroNote == "" {
			d.Remove("intro")
		} else {
			d.Text("intro", it.IntroNote)
		}

		if len(it.Days) == 0 {
			d.Keep("no-days")
			d.Remove("days")
			d.Repeat("rows", 0, nil)
		} else {
			d.Remove("no-days")
			d.Keep("days")
			fillDayRows(d, it, tripID)
		}

		fillImportant(d, it)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

// itineraryMissing renders the page with only its message.
func (a *area) itineraryMissing(w http.ResponseWriter, r *http.Request, v visitor, d *page.Doc,
	tripID string, status int, title, body string) {
	d.Keep("not-ready")
	d.Text("not-ready-title", title)
	d.Text("not-ready-body", body)
	d.URL("not-ready-back", "href", "/trips/"+tripID)
	d.Remove("body")
	a.render(w, r, v, d, status)
}

// row is one line of the flattened day list: a day heading, one activity, or a day's own
// empty state. A repeat cannot nest inside another repeat, so the two levels are filled as
// one sequence.
type itinRow struct {
	day      *ItineraryDay
	activity *Activity
	empty    *ItineraryDay
}

func fillDayRows(d *page.Doc, it *Itinerary, tripID string) {
	var rows []itinRow
	for i := range it.Days {
		day := &it.Days[i]
		rows = append(rows, itinRow{day: day})
		if len(day.Activities) == 0 {
			rows = append(rows, itinRow{empty: day})
			continue
		}
		for j := range day.Activities {
			rows = append(rows, itinRow{activity: &day.Activities[j]})
		}
	}

	d.Repeat("rows", len(rows), func(i int, row *page.Row) {
		r := rows[i]
		switch {
		case r.day != nil:
			row.Keep("day-head")
			row.Text("day-number", DayLabel(r.day.DayNumber))
			title := r.day.Label
			if title == "" {
				title = FormatTripDates(r.day.Date, "")
			}
			row.Text("day-title", title)
			row.URL("day-open", "href", "/trips/"+tripID+"/itinerary/"+strconv.Itoa(r.day.DayNumber))
			row.Remove("activity")
			row.Remove("day-empty")
		case r.activity != nil:
			row.Remove("day-head")
			row.Remove("day-empty")
			row.Keep("activity")
			fillActivity(row, *r.activity, false)
		default:
			row.Remove("day-head")
			row.Remove("activity")
			row.Keep("day-empty")
			row.Text("day-empty-title", DayShort(r.empty.DayNumber)+" is open")
		}
	})
}

// fillActivity fills one activity row. detail is the fuller card 2.2.5 draws: the
// confirmation, the full time range, the tip and the two actions.
func fillActivity(row *page.Row, act Activity, detail bool) {
	if act.StartTime == "" {
		row.Remove("activity-time")
	} else {
		row.Text("activity-time", shortTime(act.StartTime))
	}
	row.Text("activity-block", blockLabel(act.Block))
	row.Text("activity-title", act.Title)
	if act.Body == "" {
		row.Remove("activity-body")
	} else {
		row.Text("activity-body", act.Body)
	}
	if !detail {
		return
	}

	row.Attr("activity", "data-activity", act.ID)
	if act.Confirmation == "" {
		row.Remove("activity-conf")
	} else {
		row.Keep("activity-conf")
		row.Text("activity-conf-value", act.Confirmation)
	}
	// The 52px column to the left prints the START only, so the full range goes here —
	// and only when there is an end, or the line would repeat the start on its own.
	if rng := timeRange(act.StartTime, act.EndTime); rng == "" {
		row.Remove("activity-range")
	} else {
		row.Text("activity-range", rng)
	}
	if act.GyasisTip == "" {
		row.Remove("activity-tip")
	} else {
		row.Keep("activity-tip")
		row.Text("activity-tip-text", act.GyasisTip)
	}
	// Maps and Call are only offered when there is somewhere to go and someone to call.
	if act.Address == "" && act.Location == "" {
		row.Remove("activity-map")
	} else {
		where := act.Address
		if where == "" {
			where = act.Location
		}
		row.URL("activity-map", "href", "https://www.google.com/maps/search/?api=1&query="+urlQuery(where))
	}
	if act.Phone == "" {
		row.Remove("activity-call")
	} else {
		row.URL("activity-call", "href", "tel:"+telDigits(act.Phone))
	}
}

// fillImportant fills the "Important info" card on both screens.
func fillImportant(d *page.Doc, it *Itinerary) {
	var rows [][2]string
	if it.InsuranceRef != "" {
		rows = append(rows, [2]string{itinInsurance, it.InsuranceRef})
	}
	if e := it.Emergency; e != nil {
		name, phone := text(e.Name), text(e.Phone)
		switch {
		case name != "" && phone != "":
			rows = append(rows, [2]string{itinEmergency, name + " · " + phone})
		case name != "":
			rows = append(rows, [2]string{itinEmergency, name})
		}
	}
	// Visas are not recorded anywhere yet, so the card says who to ask rather than
	// implying an answer it does not have.
	rows = append(rows, [2]string{"Visas", itinVisaUnknown})

	d.Keep("important")
	d.Repeat("important", len(rows), func(i int, row *page.Row) {
		row.Text("info-label", rows[i][0])
		row.Text("info-value", rows[i][1])
	})
	if len(rows) == 0 {
		d.Text("no-info", itinNoInfo)
	} else {
		d.Remove("no-info")
	}
}

func (a *area) mountItineraryDay(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(itineraryDaySpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /trips/{tripId}/itinerary/{day}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		number, err := strconv.Atoi(r.PathValue("day"))
		if err != nil {
			httpRedirect(w, r, "/trips/"+tripID+"/itinerary")
			return
		}
		it, found, readErr := a.loadItinerary(r.Context(), v.AccessToken, tripID, a.today())
		if readErr != nil {
			a.Log.Warn("client: itinerary read failed", "err", readErr)
		}
		if !found || readErr != nil {
			httpRedirect(w, r, "/trips/"+tripID+"/itinerary")
			return
		}
		day, index, ok := it.Day(number)
		if !ok {
			// A day that is not in this itinerary goes back to the list rather than to a
			// page saying nothing.
			httpRedirect(w, r, "/trips/"+tripID+"/itinerary")
			return
		}

		d := tmpl.New()
		d.URL("back", "href", "/trips/"+tripID+"/itinerary")
		d.Text("day-number", DayLabel(day.DayNumber))
		title := day.Label
		if title == "" {
			title = FormatLongDay(day.Date)
		}
		d.Text("day-title", title)
		d.Text("day-date", FormatLongDay(day.Date))

		if day.Weather == nil {
			d.Remove("weather")
		} else {
			d.Keep("weather")
			d.Text("weather-line", weatherLine(day.Weather))
			if uv := day.Weather.UVIndex; uv != nil && *uv >= 8 {
				d.Text("weather-uv", "UV index "+trimFloat(*uv)+" — pack the reef-safe sunscreen.")
			} else {
				d.Remove("weather-uv")
			}
		}

		if day.Summary == "" {
			d.Remove("summary")
		} else {
			d.Text("summary", day.Summary)
		}

		if len(day.Activities) == 0 {
			d.Keep("day-empty")
			d.Text("day-empty-title", DayShort(day.DayNumber)+" is open")
			// Removing the list takes its repeat with it.
			d.Remove("activities")
		} else {
			d.Remove("day-empty")
			d.Keep("activities")
			d.Attr("activities", "data-trip", tripID)
			d.Attr("activities", "data-day", strconv.Itoa(day.DayNumber))
			d.Repeat("activities", len(day.Activities), func(i int, row *page.Row) {
				row.Keep("activity")
				fillActivity(row, day.Activities[i], true)
			})
		}

		if index > 0 {
			prev := it.Days[index-1]
			d.URL("prev", "href", "/trips/"+tripID+"/itinerary/"+strconv.Itoa(prev.DayNumber))
			d.Text("prev-label", DayShort(prev.DayNumber))
		} else {
			d.Remove("prev")
		}
		if index < len(it.Days)-1 {
			next := it.Days[index+1]
			d.URL("next", "href", "/trips/"+tripID+"/itinerary/"+strconv.Itoa(next.DayNumber))
			d.Text("next-label", DayShort(next.DayNumber))
		} else {
			d.Remove("next")
		}

		fillImportant(d, it)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

// weatherLine is the one line a forecast gets: "82° / 74° · Sunny · Wind 11 mph E".
func weatherLine(w *DayWeather) string {
	var parts []string
	switch {
	case w.HighF != nil && w.LowF != nil:
		parts = append(parts, trimFloat(*w.HighF)+"° / "+trimFloat(*w.LowF)+"°")
	case w.HighF != nil:
		parts = append(parts, trimFloat(*w.HighF)+"°")
	case w.LowF != nil:
		parts = append(parts, trimFloat(*w.LowF)+"°")
	}
	if s := text(w.Summary); s != "" {
		parts = append(parts, s)
	}
	if w.WindMph != nil {
		wind := "Wind " + trimFloat(*w.WindMph) + " mph"
		if dir := text(w.WindDir); dir != "" {
			wind += " " + dir
		}
		parts = append(parts, wind)
	}
	return strings.Join(parts, " · ")
}

// trimFloat prints a forecast number the way a person would write it: 82, not 82.0. The
// column is jsonb, so the value really is a float here — it is weather, not money.
func trimFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

// urlQuery escapes one value for a query string.
func urlQuery(v string) string {
	var b strings.Builder
	for i := 0; i < len(v); i++ {
		c := v[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			const hex = "0123456789ABCDEF"
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&15])
		}
	}
	return b.String()
}

// telDigits keeps only what a tel: URI may carry, so a number typed with brackets still
// dials and nothing else rides along in the link.
func telDigits(phone string) string {
	var b strings.Builder
	for i := 0; i < len(phone); i++ {
		c := phone[i]
		if c == '+' && b.Len() == 0 {
			b.WriteByte(c)
			continue
		}
		if c >= '0' && c <= '9' {
			b.WriteByte(c)
		}
	}
	return b.String()
}
