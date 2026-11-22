package public

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/hotels"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.0.4 Public Search Results (/explore/results). Ports
// app/(public)/(plain)/explore/results/ (page.tsx, content.ts, filters.ts, sx.ts and its
// twelve components).
//
// The URL is the only state. Everything the page decides comes from
// search.ParseSearchParams, and every control is a GET form or a link that writes a new URL,
// so the page works with no JavaScript and a shared link renders the same results.
//
// IT IS NOT A CACHED PUBLIC PAGE. It reads the query string, and in Hotels mode it spends a
// metered provider request, so it renders with web.Private and stays out of CachedPaths
// (docs/GO-MIGRATION.md §4.7). Next marks it noindex, nofollow for the same reason: every
// chip, mode and sort link is a distinct cache key, and a crawler walking them would walk a
// combinatorial space at 250 searches a month.

// resultsPath is the route. The canonical URL is /explore, not this page.
const resultsPath = "/explore/results"

// The page's copy, from explore/results/content.ts, word for word. Copy that is the same on
// every render stays in results.html; these are the lines a handler has to build or choose.
const (
	resultsMetaTitle       = "Trip ideas"
	resultsMetaDescription = "Trip ideas from Gyasi's curated catalog — filter by trip type, vibe and budget, no account needed."

	resultsFiltersLabel = "Filters"
	resultsSortLabel    = "Sort"
	resultsFootnote     = "* Requires creating an account — takes 60 seconds."

	resultsModePicks   = "Gyasi's picks"
	resultsModeHotels  = "Hotels"
	resultsModeCruises = "Cruises"

	resultsFiltersTripType = "Trip type"
	resultsFiltersVibe     = "Vibe"
	resultsFiltersBudget   = "Budget"

	resultsHotelsStarRating  = "Star rating"
	resultsHotelsAmenities   = "Amenities"
	resultsHotelsNightlyRate = "Nightly rate"
	resultsHotelsSeePicks    = "See Gyasi’s picks"

	resultsEmptyClear = "Clear filters"

	resultsCruisesPriceNote = "Fares move with the cabin and the week, so Gyasi prices these himself — ask and he’ll come back with what it actually costs."
	resultsCruisesSailsOn   = "Sails"
)

// stateCopy is one empty, prompt or failure state's two lines (RESULTS.empty,
// RESULTS.hotels.* and RESULTS.cruises.*).
type stateCopy struct{ Title, Body string }

// The states this page can show instead of a list. Never a dead end: every one of them
// offers the curated catalog and a way to reach Gyasi (fidelity spec §5.7).
var (
	emptyTrips        = stateCopy{"No trips match that week yet.", "Loosen a filter, or tell Gyasi what you're after — that's usually faster."}
	hotelsNeedDest    = stateCopy{"Where are you headed?", "Give me an island, a city, or just “Caribbean” — I’ll pull up what’s open for your week."}
	hotelsNeedDates   = stateCopy{"Pick your week.", "Hotels move with the calendar, so I need your dates before I can show you what’s actually there."}
	hotelsEmpty       = stateCopy{"Nothing came back for that week.", "It happens — a small island in high season fills up. Try a wider range, or let me look properly; I can usually find a room a search engine can’t."}
	hotelsUnavailable = stateCopy{"That search didn’t come back.", "Nothing you did — the hotel feed is quiet right now. Gyasi’s picks are still here, and so is he."}
	hotelsExhausted   = stateCopy{"Live hotel search is resting today.", "We cap how often we call the hotel feed each month so this stays fast and free for everyone. It’ll be back tomorrow — and these are the places Gyasi actually books."}
	cruisesEmpty      = stateCopy{"No sailings on the books for that yet.", "The calendar fills in a few months out. Tell Gyasi roughly when you’re thinking and he’ll watch for it — he sails these lines himself."}
	cruisesBroken     = stateCopy{"The sailing list didn’t come back.", "Nothing you did. Gyasi’s picks are still here, and so is he."}
)

// railVibes are the four vibes the C204 rail shows (FilterRail RAIL_VIBES).
var railVibes = []content.Vibe{search.VibeAdultsOnly, search.VibeFamily, search.VibeHoneymoon, search.VibeFiveStar}

// resultsSpec declares the page. The two filter rails, the two update forms and the two
// shapes of each result card are all in this one file, as they are in Next: the page renders
// both widths and the stylesheet hides one.
var resultsSpec = page.Spec{
	File:    "public/results.html",
	Layout:  shell.PublicPlain,
	Slots:   resultsSlots(),
	Repeats: resultsRepeats(),
}

func resultsSlots() []string {
	out := []string{
		"pill-dest", "pill-in", "pill-out", "pill-travelers",
		"update-summary", "stacked-dest", "stacked-in", "stacked-out", "stacked-travelers",
		"filters-label", "heading",
		"sort-menu", "sort-chip-label",
		"picks-rows", "picks-cards", "hotel-rows", "hotel-cards", "sailing-list",
		"state", "state-title", "state-body", "state-edit", "state-alt", "state-alt-label", "state-message",
		"note-1", "note-2", "note-link-wrap", "note-link",
		"sticky-save",
	}
	return append(append(out, railSlots("rail")...), railSlots("sheet")...)
}

func resultsRepeats() map[string][]string {
	r := map[string][]string{
		"pill-carry":    {"pill-carry-input"},
		"stacked-carry": {"stacked-carry-input"},
		"modes":         {"mode-link", "mode-label"},
		"chips":         {"chip-link", "chip-label"},
		"sort-items":    {"sort-item", "sort-item-label"},
		"picks-row": {"pr-photo", "pr-overline", "pr-link", "pr-name", "pr-tagline", "pr-rating",
			"pr-rating-text", "pr-price", "pr-quote", "pr-save"},
		"picks-card": {"pc-photo", "pc-overline", "pc-save", "pc-link", "pc-name", "pc-tagline",
			"pc-rating", "pc-rating-text", "pc-price", "pc-quote"},
		"hotel-row": {"hr-photo", "hr-tag", "hr-overline", "hr-link", "hr-name", "hr-rating",
			"hr-rating-text", "hr-sep", "hr-reviews", "hr-amenities", "hr-a1", "hr-a1-text",
			"hr-a2", "hr-a2-text", "hr-a3", "hr-a3-text", "hr-a4", "hr-a4-text",
			"hr-rate", "hr-rate-text", "hr-norate"},
		"hotel-card": {"hc-photo", "hc-tag", "hc-overline", "hc-link", "hc-name", "hc-rating",
			"hc-rating-text", "hc-sep", "hc-reviews", "hc-rate", "hc-rate-text", "hc-norate"},
		"sailing": {"sl-article", "sl-photo-box", "sl-photo", "sl-tag", "sl-overline", "sl-link",
			"sl-title", "sl-ship", "sl-sails", "sl-ports", "sl-p1", "sl-p1-text", "sl-p2",
			"sl-p2-text", "sl-p3", "sl-p3-text", "sl-p4", "sl-p4-text", "sl-more", "sl-more-text",
			"sl-credit", "sl-credit-link", "sl-credit-text", "sl-credit-plain"},
	}
	for prefix, slots := range railRepeats("rail") {
		r[prefix] = slots
	}
	for prefix, slots := range railRepeats("sheet") {
		r[prefix] = slots
	}
	return r
}

// railSlots names one filter rail's single slots. The rail and the sheet are both in the
// DOM, as they are in Next (keepMounted), so every name carries its instance's prefix.
func railSlots(prefix string) []string {
	names := []string{
		"-dest", "-in", "-out", "-when", "-travelers", "-topic", "-mode",
		"-g1", "-g1-legend", "-g2", "-g2-legend", "-g3", "-g3-legend",
		"-sort", "-sort-o1", "-sort-o2", "-sort-o3", "-sort-o4", "-clear",
	}
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = prefix + n
	}
	return out
}

// railRepeats names one filter rail's repeats: the echoed hidden inputs and the three
// checkbox groups.
func railRepeats(prefix string) map[string][]string {
	return map[string][]string{
		prefix + "-echo":   {prefix + "-echo-input"},
		prefix + "-g1-opt": {prefix + "-g1-input", prefix + "-g1-label"},
		prefix + "-g2-opt": {prefix + "-g2-input", prefix + "-g2-label"},
		prefix + "-g3-opt": {prefix + "-g3-input", prefix + "-g3-label"},
	}
}

// results serves /explore/results. The Searcher is built once, here, because this closure
// runs at startup; the handler inside it runs per request.
func (s *site) results(tmpl *page.Template) http.HandlerFunc {
	finder := s.hotelFinder
	if finder == nil {
		finder = hotels.New(hotels.Config{
			Enabled: s.Config.HotelSearchEnabled,
			APIKey:  s.Config.SerpAPIKey,
			Log:     s.Log,
		})
	}
	return func(w http.ResponseWriter, r *http.Request) {
		today := s.today()
		q := search.ParseSearchParams(search.ParseQuery(r.URL.RawQuery), today)
		mode := search.EffectiveMode(q)
		current := search.ResultsHref(q)

		d := tmpl.New()
		s.chrome(d, r, resultsPath)
		s.head(d, meta{
			Title:       resultsMetaTitle,
			Description: resultsMetaDescription,
			// The canonical is /explore, the indexable entry; this page is never it.
			Path:     explorePath,
			Image:    "bahamas",
			NoIndex:  true,
			NoFollow: true,
		})

		s.fillUpdateBar(d, q, mode, today)
		fillModeSwitch(d, q, mode)
		fillChipStrip(d, q, mode)
		fillFilterRail(d, "rail", q, mode)
		fillFilterRail(d, "sheet", q, mode)
		fillSortMenu(d, q, mode)
		d.URL("sticky-save", "href", search.JoinHref(search.JoinLink{Intent: search.IntentSave, Next: current}))

		switch mode {
		case search.ModeHotels:
			d.Text("heading", resultsModeHotels+" · "+search.DescribeQuery(q))
			removePicks(d)
			d.Remove("sailing-list")
			s.renderHotels(d, r, finder, q)
		case search.ModeCruises:
			d.Text("heading", resultsModeCruises+" · "+search.DescribeQuery(q))
			removePicks(d)
			removeHotelLists(d)
			s.renderCruises(d, r, q)
		default:
			trips := search.SearchTrips(s.cat.Trips, q, s.cat.TripRating)
			n := len(trips)
			d.Text("heading", strconv.Itoa(n)+" "+plural(n, "trip", "trips")+" · "+search.DescribeQuery(q))
			removeHotelLists(d)
			d.Remove("sailing-list")
			s.renderPicks(d, trips, current)
		}

		web.Render(w, s.Log, d, http.StatusOK, web.Private)
	}
}

func removePicks(d *page.Doc) {
	d.Remove("picks-rows")
	d.Remove("picks-cards")
}

// noState removes the shared state card, for a render that has a list to show.
func noState(d *page.Doc) { d.Remove("state") }

// fillState fills the one card every empty, prompt and failure state uses. edit shows the
// anchor back to the search form at the top of this page (never a link to /explore, which
// was blank, so "change your search" meant "retype your search"). wide is the 500px body of
// the provider states, against the 420px of the trips empty state.
func fillState(d *page.Doc, c stateCopy, edit, wide bool, altLabel, altHref string) {
	d.Keep("state")
	d.Text("state-title", c.Title)
	d.Text("state-body", c.Body)
	d.Class("state-body", "res-state-wide", wide)
	if edit {
		d.Keep("state-edit")
	} else {
		d.Remove("state-edit")
	}
	d.Text("state-alt-label", altLabel)
	d.URL("state-alt", "href", altHref)
	d.URL("state-message", "href", search.InquiryHref(search.GuestInquiryContext{Source: search.FromResults}))
}

// notes fills the caption lines under a list. An empty line is removed, so the page never
// carries a blank paragraph's margin.
func notes(d *page.Doc, first, second, linkLabel, linkHref string) {
	textOrRemove(d, "note-1", first)
	textOrRemove(d, "note-2", second)
	if linkLabel == "" {
		d.Remove("note-link-wrap")
		return
	}
	d.Keep("note-link-wrap")
	d.Text("note-link", linkLabel)
	d.URL("note-link", "href", linkHref)
}

func textOrRemove(d *page.Doc, slot, text string) {
	if text == "" {
		d.Remove(slot)
		return
	}
	d.Text(slot, text)
}

// ── The header band ──────────────────────────────────────────────────────────────────────

// fillUpdateBar fills both copies of the results header's search form (SearchUpdateBar): the
// editable pill from md, and the summary that opens the same form below it.
//
// EVERYTHING NOT IN THE FORM RIDES AS A HIDDEN INPUT. Filters, sort, topic and mode live in
// the URL too, and a form that posted only the three visible fields would silently clear
// them. Mode is written explicitly rather than derived: an update that cleared the dates
// would otherwise drop the visitor from Hotels back to the curated catalog.
func (s *site) fillUpdateBar(d *page.Doc, q search.SearchQuery, mode search.ResultsMode, today string) {
	carried := carriedFields(q, mode)
	for _, name := range []string{"pill-carry", "stacked-carry"} {
		d.Repeat(name, len(carried), func(i int, row *page.Row) {
			slot := strings.TrimSuffix(name, "-carry") + "-carry-input"
			row.Attr(slot, "name", carried[i].Name)
			row.Attr(slot, "value", carried[i].Value)
		})
	}

	travelers := ""
	if q.Travelers != 0 {
		travelers = strconv.Itoa(q.Travelers)
	}
	latest, hasLatest := search.AddDays(today, search.MaxBookingDaysAhead)
	// The check-out input's floor is the night after the check-in, not today, so the browser
	// refuses a stay that ends before it starts (DateRangePicker.tsx). It matters because the
	// server is forgiving rather than loud: ParseStay drops a pair under a night, so without
	// the floor the form submits happily and the visitor loses their whole stay AND falls out
	// of Hotels back to the curated catalog, with nothing on the page saying why.
	outFloor := today
	if next, ok := search.AddDays(q.CheckIn, 1); ok && q.CheckIn != "" {
		outFloor = next
	}
	for _, prefix := range []string{"pill", "stacked"} {
		d.Attr(prefix+"-dest", "value", q.Dest)
		d.Attr(prefix+"-travelers", "value", travelers)
		for _, date := range []struct{ name, value, floor string }{
			{prefix + "-in", q.CheckIn, today},
			{prefix + "-out", q.CheckOut, outFloor},
		} {
			d.Attr(date.name, "value", date.value)
			d.Attr(date.name, "min", date.floor)
			if hasLatest {
				d.Attr(date.name, "max", latest)
			}
		}
	}
	d.Text("update-summary", search.InquirySummary(q))
}

// field is one hidden input: a name and a value.
type field struct{ Name, Value string }

// carriedFields are the hidden inputs the update forms carry, in the order Next writes them.
func carriedFields(q search.SearchQuery, mode search.ResultsMode) []field {
	out := []field{{"mode", string(mode)}}
	if q.Topic != "" {
		out = append(out, field{"topic", string(q.Topic)})
	}
	if q.Sort != search.SortBestFit {
		out = append(out, field{"sort", string(q.Sort)})
	}
	return append(out, multiFields(q, nil)...)
}

// multiFields are every repeated filter value in the query, in rail order. skip names the
// groups the caller is rendering as checkboxes, which must not be echoed as well: a doubled
// value would be submitted twice.
func multiFields(q search.SearchQuery, skip map[string]bool) []field {
	var out []field
	add := func(name string, values ...string) {
		if skip[name] {
			return
		}
		for _, v := range values {
			out = append(out, field{name, v})
		}
	}
	add("type", stringsOf(q.Types)...)
	add("vibe", stringsOf(q.Vibes)...)
	add("budget", stringsOf(q.Budgets)...)
	add("star", stringsOf(q.Stars)...)
	add("amenity", q.Amenities...)
	add("rate", stringsOf(q.Rates)...)
	return out
}

// stringsOf is a list of string-kinded values as plain strings.
func stringsOf[T ~string](values []T) []string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = string(v)
	}
	return out
}

// fillModeSwitch fills "Gyasi's picks" / "Hotels" / "Cruises". Three links, not a tablist:
// these are navigations, and aria-current="page" is the honest attribute for "you are here".
func fillModeSwitch(d *page.Doc, q search.SearchQuery, current search.ResultsMode) {
	labels := map[search.ResultsMode]string{
		search.ModePicks:   resultsModePicks,
		search.ModeHotels:  resultsModeHotels,
		search.ModeCruises: resultsModeCruises,
	}
	d.Repeat("modes", len(search.Modes), func(i int, row *page.Row) {
		m := search.Modes[i]
		to := q
		to.Mode = m
		row.URL("mode-link", "href", search.ResultsHref(to))
		row.Text("mode-label", labels[m])
		on := m == current
		row.Class("mode-link", "btn-contained", on)
		row.Class("mode-link", "btn-text", !on)
		row.Class("mode-link", "res-mode-off", !on)
		if on {
			row.Attr("mode-link", "aria-current", "page")
		}
	})
}

// fillChipStrip fills the quick-filter strip and the filter sheet's trigger. Each chip is a
// link to "this same search with one value toggled", so the filter lives in the URL.
func fillChipStrip(d *page.Doc, q search.SearchQuery, mode search.ResultsMode) {
	chips := search.ChipsFor(mode)
	d.Repeat("chips", len(chips), func(i int, row *page.Row) {
		chip := chips[i]
		on := search.ChipIsOn(q, chip)
		row.URL("chip-link", "href", search.ChipHref(q, chip))
		row.Text("chip-label", chip.Label)
		row.Class("chip-link", "chip-secondary", on)
		row.Class("chip-link", "chip-outlined", !on)
		if on {
			row.Attr("chip-link", "aria-current", "true")
		}
	})
	label := resultsFiltersLabel
	if n := search.ActiveFilterCount(q); n > 0 {
		label = resultsFiltersLabel + " · " + strconv.Itoa(n)
	}
	d.Text("filters-label", label)
}

// fillSortMenu fills the "Sort · Best fit" chip and its menu of links.
//
// Cruises get none: they come back in departure order from our own catalog and carry no
// public fare, so every key would be a no-op and a menu that moves nothing is a lie.
func fillSortMenu(d *page.Doc, q search.SearchQuery, mode search.ResultsMode) {
	keys := search.SortKeysFor(mode)
	if len(keys) == 0 {
		d.Remove("sort-menu")
		return
	}
	d.Keep("sort-menu")
	shown := shownSort(q.Sort, keys)
	d.Text("sort-chip-label", resultsSortLabel+" · "+search.SortLabels[shown])
	d.Repeat("sort-items", len(keys), func(i int, row *page.Row) {
		to := q
		to.Sort = keys[i]
		row.URL("sort-item", "href", search.ResultsHref(to))
		row.Text("sort-item-label", search.SortLabels[keys[i]])
		if keys[i] == shown {
			row.Attr("sort-item", "aria-current", "true")
		}
	})
}

// shownSort is the key the controls display: a sort the mode cannot honour still reads as
// "Best fit" and keeps its URL value, so switching back to the curated catalog restores it.
func shownSort(sort search.SortKey, keys []search.SortKey) search.SortKey {
	for _, k := range keys {
		if k == sort {
			return sort
		}
	}
	return search.SortBestFit
}

// ── The filter rail ──────────────────────────────────────────────────────────────────────

// filterOption is one checkbox in a rail group.
type filterOption struct {
	Value, Label string
	On           bool
}

// filterGroup is one fieldset: a legend, the param its boxes write, and its options.
type filterGroup struct {
	Legend, Name string
	Options      []filterOption
}

// railGroups are the three checkbox groups a mode filters by.
//
// The two vocabularies do not overlap: a "Cruise" checkbox in a list of hotels is
// incoherent, and a per-person trip budget is a different axis from a nightly room rate. So
// each mode renders its own groups and ECHOES the other's as hidden inputs, never both,
// which would double-submit, so a mode switch is lossless. Cruises render none: the public
// cruise catalog is departure-ordered and has no filter vocabulary yet.
func railGroups(q search.SearchQuery, mode search.ResultsMode) []filterGroup {
	switch mode {
	case search.ModeCruises:
		return nil
	case search.ModeHotels:
		stars := make([]filterOption, len(search.StarClasses))
		labels := starClassLabels()
		for i, c := range search.StarClasses {
			stars[i] = filterOption{string(c), labels[string(c)], contains(stringsOf(q.Stars), string(c))}
		}
		amenities := make([]filterOption, len(search.HotelAmenities))
		for i, a := range search.HotelAmenities {
			amenities[i] = filterOption{a.ID, a.Label, contains(q.Amenities, a.ID)}
		}
		rates := make([]filterOption, len(search.RateBands))
		for i, b := range search.RateBands {
			rates[i] = filterOption{string(b.ID), b.Label, contains(stringsOf(q.Rates), string(b.ID))}
		}
		return []filterGroup{
			{resultsHotelsStarRating, "star", stars},
			{resultsHotelsAmenities, "amenity", amenities},
			{resultsHotelsNightlyRate, "rate", rates},
		}
	}
	types := make([]filterOption, len(search.TripTypes))
	for i, t := range search.TripTypes {
		types[i] = filterOption{string(t), search.TripTypeLabels[t], contains(stringsOf(q.Types), string(t))}
	}
	vibes := make([]filterOption, len(railVibes))
	for i, v := range railVibes {
		vibes[i] = filterOption{string(v), search.VibeLabels[v], contains(stringsOf(q.Vibes), string(v))}
	}
	budgets := make([]filterOption, len(search.BudgetBands))
	for i, b := range search.BudgetBands {
		budgets[i] = filterOption{string(b), search.BudgetBandLabels[b], contains(stringsOf(q.Budgets), string(b))}
	}
	return []filterGroup{
		{resultsFiltersTripType, "type", types},
		{resultsFiltersVibe, "vibe", vibes},
		{resultsFiltersBudget, "budget", budgets},
	}
}

// starClassLabels is each star class's rail label ("5★", "4★+"), read off the ported chip
// table so the copy has one source.
func starClassLabels() map[string]string {
	out := map[string]string{}
	for _, c := range search.ChipsFor(search.ModeHotels) {
		if c.Kind == search.ChipStar {
			out[c.Value] = c.Label
		}
	}
	return out
}

func contains(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}

// fillFilterRail fills one copy of the filter form: the web rail (prefix "rail") or the
// sheet below it (prefix "sheet"). Hidden inputs carry the free-text search, so applying a
// filter never drops the destination or the dates.
func fillFilterRail(d *page.Doc, prefix string, q search.SearchQuery, mode search.ResultsMode) {
	hidden := func(suffix, value string) {
		if value == "" {
			d.Remove(prefix + suffix)
			return
		}
		d.Attr(prefix+suffix, "value", value)
	}
	hidden("-dest", q.Dest)
	// The stay rides through as in/out; `when` is only the pre-picker free-text fallback,
	// and carrying both would let a stale label outlive the range it described.
	if q.CheckIn != "" && q.CheckOut != "" {
		hidden("-in", q.CheckIn)
		hidden("-out", q.CheckOut)
		hidden("-when", "")
	} else {
		hidden("-in", "")
		hidden("-out", "")
		hidden("-when", q.When)
	}
	travelers := ""
	if q.Travelers != 0 {
		travelers = strconv.Itoa(q.Travelers)
	}
	hidden("-travelers", travelers)
	hidden("-topic", string(q.Topic))
	hidden("-mode", string(q.Mode))

	groups := railGroups(q, mode)
	rendered := map[string]bool{}
	for _, g := range groups {
		rendered[g.Name] = true
	}
	echoed := multiFields(q, rendered)
	d.Repeat(prefix+"-echo", len(echoed), func(i int, row *page.Row) {
		row.Attr(prefix+"-echo-input", "name", echoed[i].Name)
		row.Attr(prefix+"-echo-input", "value", echoed[i].Value)
	})

	for i, n := range []string{"-g1", "-g2", "-g3"} {
		if i >= len(groups) {
			d.Remove(prefix + n)
			continue
		}
		g := groups[i]
		d.Keep(prefix + n)
		d.Text(prefix+n+"-legend", g.Legend)
		d.Repeat(prefix+n+"-opt", len(g.Options), func(j int, row *page.Row) {
			o := g.Options[j]
			row.Attr(prefix+n+"-input", "name", g.Name)
			row.Attr(prefix+n+"-input", "value", o.Value)
			row.Bool(prefix+n+"-input", "checked", o.On)
			row.Text(prefix+n+"-label", o.Label)
		})
	}

	fillSortControl(d, prefix, q, mode)

	if search.HasActiveFilters(q) {
		d.Keep(prefix + "-clear")
	} else {
		d.Remove(prefix + "-clear")
	}
}

// fillSortControl fills the rail's <select name="sort">. It stays a real select, so the GET
// form submits it with no JavaScript. A mode with no sort keys has no control at all.
func fillSortControl(d *page.Doc, prefix string, q search.SearchQuery, mode search.ResultsMode) {
	keys := search.SortKeysFor(mode)
	if len(keys) == 0 {
		d.Remove(prefix + "-sort")
		return
	}
	d.Keep(prefix + "-sort")
	shown := shownSort(q.Sort, keys)
	for i, n := range []string{"-sort-o1", "-sort-o2", "-sort-o3", "-sort-o4"} {
		slot := prefix + n
		if i >= len(keys) {
			d.Remove(slot)
			continue
		}
		d.Attr(slot, "value", string(keys[i]))
		d.Text(slot, search.SortLabels[keys[i]])
		d.Bool(slot, "selected", keys[i] == shown)
	}
}

// ── Gyasi's picks ────────────────────────────────────────────────────────────────────────

// renderPicks fills the curated catalog's two card shapes, or the empty state.
func (s *site) renderPicks(d *page.Doc, trips []content.Trip, current string) {
	if len(trips) == 0 {
		d.Remove("picks-rows")
		d.Remove("picks-cards")
		fillState(d, emptyTrips, false, false, resultsEmptyClear, resultsPath)
		notes(d, "", "", "", "")
		return
	}
	noState(d)
	d.Keep("picks-rows")
	d.Keep("picks-cards")
	for _, shape := range []struct{ repeat, prefix, sizes string }{
		{"picks-row", "pr", "180px"},
		{"picks-card", "pc", "(min-width: 768px) 50vw, 100vw"},
	} {
		d.Repeat(shape.repeat, len(trips), func(i int, row *page.Row) {
			s.fillTripResult(row, shape.prefix, shape.sizes, trips[i], current)
		})
	}
	notes(d, resultsFootnote, "", "", "")
}

// fillTripResult fills one curated trip, in either card shape. The name links to the detail
// page; "Request quote" and "Save" go to the sign-up gate with the trip and the return path.
func (s *site) fillTripResult(row *page.Row, p, sizes string, trip content.Trip, current string) {
	fillPhoto(row, p+"-photo", trip.ImageKey, photoOpts{Sizes: sizes, Alt: decorative})
	row.Text(p+"-overline", trip.Overline)
	row.URL(p+"-link", "href", search.TripHref(trip.Slug))
	row.Text(p+"-name", trip.Name)
	row.Text(p+"-tagline", trip.Tagline)
	if rating, ok := s.cat.TripRating(trip.Slug); ok {
		row.Keep(p + "-rating")
		row.Text(p+"-rating-text", decimal(rating))
	} else {
		row.Remove(p + "-rating")
	}
	row.Text(p+"-price", s.money(trip.From))

	target := search.QuoteKindFor(trip.Type)
	target.Slug = trip.Slug
	target.Name = trip.Name
	target.Source = search.SourceCurated
	row.URL(p+"-quote", "href", search.RequestQuoteHref(target))

	save := search.JoinHref(search.JoinLink{Intent: search.IntentSave, Trip: trip.Slug, Next: current})
	row.URL(p+"-save", "href", save)
	if p == "pc" {
		row.Attr(p+"-save", "aria-label", "Save "+trip.Name+" for later")
	}
}

// money formats a public price. A price that will not format is a logged mistake in the
// catalog, not a 500 on a marketing page.
func (s *site) money(m content.Money) string {
	out, err := search.FormatMoney(m, search.MoneyOptions{Whole: true})
	if err != nil {
		s.Log.Error("a public price did not format", "err", err)
		return ""
	}
	return out
}

// ── Hotels ───────────────────────────────────────────────────────────────────────────────

// renderHotels fills the live hotel list, or one of its five empty states.
//
// THE PRECONDITION IS THE FIRST QUOTA CONTROL. No destination or no dates means no request
// at all: a hotel search without either is meaningless to the provider and would spend a
// metered call to return noise.
func (s *site) renderHotels(d *page.Doc, r *http.Request, finder *hotels.Searcher, q search.SearchQuery) {
	picks := q
	picks.Mode = search.ModePicks
	seePicks := search.ResultsHref(picks)
	fail := func(c stateCopy, edit bool) {
		removeHotelLists(d)
		fillState(d, c, edit, true, resultsHotelsSeePicks, seePicks)
		notes(d, "", "", "", "")
	}
	if q.Dest == "" {
		fail(hotelsNeedDest, true)
		return
	}
	if q.CheckIn == "" || q.CheckOut == "" {
		fail(hotelsNeedDates, true)
		return
	}

	travelers := q.Travelers
	if travelers == 0 {
		travelers = 2
	}
	minPrice, maxPrice := rateBounds(q.Rates)
	result := finder.Search(r.Context(), hotels.Args{
		Destination:     q.Dest,
		CheckIn:         q.CheckIn,
		CheckOut:        q.CheckOut,
		Adults:          travelers,
		HotelClass:      stringsOf(q.Stars),
		Amenities:       q.Amenities,
		MinPriceDollars: minPrice,
		MaxPriceDollars: maxPrice,
		SortBy:          search.SerpSortBy(q.Sort),
	})
	switch result.Status {
	case hotels.StatusBudgetExhausted:
		fail(hotelsExhausted, false)
		return
	case hotels.StatusEmpty:
		fail(hotelsEmpty, false)
		return
	case hotels.StatusOK:
	default:
		fail(hotelsUnavailable, false)
		return
	}

	noState(d)
	d.Keep("hotel-rows")
	d.Keep("hotel-cards")
	for _, shape := range []struct{ repeat, prefix string }{{"hotel-row", "hr"}, {"hotel-card", "hc"}} {
		d.Repeat(shape.repeat, len(result.Hotels), func(i int, row *page.Row) {
			s.fillHotelResult(row, shape.prefix, result.Hotels[i], q, travelers)
		})
	}
	notes(d, s.cat.Claim("hotelRateBasis"), "", resultsHotelsSeePicks, seePicks)
}

func removeHotelLists(d *page.Doc) {
	d.Remove("hotel-rows")
	d.Remove("hotel-cards")
}

// rateBounds turns the chosen nightly-rate bands into SerpApi's whole-dollar bounds.
// Several bands selected widen to their union rather than intersecting to nothing.
func rateBounds(chosen []search.RateBand) (min, max *int) {
	var bands []search.RateBandInfo
	for _, b := range search.RateBands {
		if contains(stringsOf(chosen), string(b.ID)) {
			bands = append(bands, b)
		}
	}
	if len(bands) == 0 {
		return nil, nil
	}
	lowest, allHaveMin := 0, true
	highest, anyOpenTop := 0, false
	for i, b := range bands {
		if b.Min == nil {
			allHaveMin = false
		} else if i == 0 || *b.Min < lowest {
			lowest = *b.Min
		}
		if b.Max == nil {
			anyOpenTop = true
		} else if *b.Max > highest {
			highest = *b.Max
		}
	}
	if allHaveMin {
		v := lowest
		min = &v
	}
	if !anyOpenTop {
		v := highest
		max = &v
	}
	return min, max
}

// fillHotelResult fills one live hotel, in either card shape.
//
// THE NAME IS NOT A LINK TO A DETAIL PAGE: there is no public hotel page, so the whole card
// is one link to the quote request instead, carried by the heading so a screen reader
// announces the hotel's name rather than "Request quote" twenty times over.
func (s *site) fillHotelResult(row *page.Row, p string, h hotels.PublicHotel, q search.SearchQuery, travelers int) {
	if len(h.Photos) > 0 {
		row.URL(p+"-photo", "src", h.Photos[0])
		row.Attr(p+"-photo", "alt", "")
	} else {
		row.Remove(p + "-photo")
	}

	overline := []string{}
	if h.HotelClass != nil {
		overline = append(overline, strconv.Itoa(*h.HotelClass)+"-STAR")
	}
	if h.PropertyType != "" {
		overline = append(overline, h.PropertyType)
	}
	if len(overline) > 0 {
		row.Keep(p + "-tag")
		row.Text(p+"-overline", strings.Join(overline, " · "))
	} else {
		row.Remove(p + "-tag")
	}

	target := search.QuoteTarget{
		Kind:     search.KindHotel,
		TripType: search.TripTypeCustom,
		Source:   search.SourceGoogleHotel,
		Name:     h.Name,
		// The SEARCH destination, not the property type: the provider returns no clean city
		// string per property, and what the traveler asked for is the honest answer.
		Place:        q.Dest,
		CheckIn:      q.CheckIn,
		CheckOut:     q.CheckOut,
		Travelers:    travelers,
		Ref:          h.PropertyToken,
		PropertyType: h.PropertyType,
	}
	if h.NightlyCents != nil {
		target.RateCents = *h.NightlyCents
	}
	if h.HotelClass != nil {
		target.HotelClass = *h.HotelClass
	}
	if h.Rating != nil {
		target.Rating = *h.Rating
	}
	row.URL(p+"-link", "href", search.RequestQuoteHref(target))
	row.Text(p+"-name", h.Name)

	if h.Rating != nil {
		row.Keep(p + "-rating")
		row.Text(p+"-rating-text", decimal(*h.Rating))
	} else {
		row.Remove(p + "-rating")
	}
	hasReviews := h.ReviewCount != nil && *h.ReviewCount != 0
	if h.Rating != nil && hasReviews {
		row.Keep(p + "-sep")
	} else {
		row.Remove(p + "-sep")
	}
	if hasReviews {
		row.Text(p+"-reviews", thousands(*h.ReviewCount)+" reviews")
	} else {
		row.Remove(p + "-reviews")
	}

	if h.NightlyCents != nil {
		row.Keep(p + "-rate")
		row.Text(p+"-rate-text", s.money(content.Money{AmountCents: *h.NightlyCents, Currency: h.Currency}))
		row.Remove(p + "-norate")
	} else {
		row.Remove(p + "-rate")
		row.Keep(p + "-norate")
	}

	if p == "hr" {
		fillChipList(row, "hr-amenities", "hr-a", 4, h.Amenities, "")
	}
}

// fillChipList fills a fixed row of up to n chips with values, removing the chips it does
// not use and the whole list when there are none. more, when set, is the "+N more" chip's
// slot suffix.
func fillChipList(row *page.Row, list, prefix string, n int, values []string, more string) {
	if len(values) == 0 {
		row.Remove(list)
		return
	}
	row.Keep(list)
	for i := 1; i <= n; i++ {
		slot := prefix + strconv.Itoa(i)
		if i <= len(values) && i <= n {
			row.Keep(slot)
			row.Text(slot+"-text", values[i-1])
			continue
		}
		row.Remove(slot)
	}
	if more == "" {
		return
	}
	if rest := len(values) - n; rest > 0 {
		row.Keep(more)
		row.Text(more+"-text", "+"+strconv.Itoa(rest)+" more")
		return
	}
	row.Remove(more)
}

// ── Cruises ──────────────────────────────────────────────────────────────────────────────

// renderCruises fills the sailing list, or one of its two states.
//
// No precondition guard, unlike hotels: a cruise search with no destination and no dates is
// a perfectly good question ("what is sailing?"), and answering it costs one query against
// our own catalog rather than a metered provider request.
func (s *site) renderCruises(d *page.Doc, r *http.Request, q search.SearchQuery) {
	picks := q
	picks.Mode = search.ModePicks
	seePicks := search.ResultsHref(picks)
	call := func(ctx context.Context, name string, in api.Input) api.Result {
		return s.API.Call(ctx, name, s.Config.SupabaseAnonKey, in)
	}
	result := search.SearchCruises(r.Context(), call, search.CruiseSearchArgs{
		Destination: q.Dest,
		// The search bar's check-in is a hint about WHEN, not a sailing date to match exactly.
		From: q.CheckIn,
	})
	if result.Status != search.CruiseOK {
		d.Remove("sailing-list")
		c := cruisesBroken
		if result.Status == search.CruiseEmpty {
			c = cruisesEmpty
		}
		fillState(d, c, false, true, resultsHotelsSeePicks, seePicks)
		notes(d, "", "", "", "")
		return
	}
	noState(d)
	d.Keep("sailing-list")
	d.Repeat("sailing", len(result.Sailings), func(i int, row *page.Row) {
		fillSailing(row, result.Sailings[i])
	})
	notes(d, resultsCruisesPriceNote, resultsFootnote, "", "")
}

// fillSailing fills one synced sailing. THERE IS NO FARE ANYWHERE ON THIS CARD, by
// construction: search.PublicSailing has no price field, because the function does not
// select one (Free-Travel-APIs §4.7).
func fillSailing(row *page.Row, sailing search.PublicSailing) {
	row.Keep("sl-article")
	// Only two columns when there is something to put in the first one: most sailings have
	// no photo, and an unconditional 180px column left those cards with a hole.
	row.Class("sl-article", "res-sail-wide", sailing.ShipImage != nil)
	if sailing.ShipImage != nil {
		row.Keep("sl-photo-box")
		row.URL("sl-photo", "src", sailing.ShipImage.URL)
		row.Attr("sl-photo", "alt", "")
	} else {
		row.Remove("sl-photo-box")
	}

	overline := []string{}
	if sailing.Line != nil && *sailing.Line != "" {
		overline = append(overline, *sailing.Line)
	}
	if sailing.Nights != nil {
		overline = append(overline, strconv.Itoa(*sailing.Nights)+" "+plural(*sailing.Nights, "night", "nights"))
	}
	if len(overline) > 0 {
		row.Keep("sl-tag")
		row.Text("sl-overline", strings.Join(overline, " · "))
	} else {
		row.Remove("sl-tag")
	}

	target := search.QuoteTarget{
		Kind:     search.KindCruise,
		TripType: search.TripTypeCruise,
		Source:   search.SourceTrackCruise,
		Name:     sailing.Title,
		CheckIn:  sailing.DepartureDate,
		Ref:      sailing.ID,
	}
	if len(sailing.Destinations) > 0 {
		target.Place = sailing.Destinations[0]
	}
	if sailing.Nights != nil {
		// The sailing's own length is the stay: a cruise quote has no separate check-out to
		// ask for, which is why the search bar's dates do not reach this card.
		if out, ok := search.AddDays(sailing.DepartureDate, *sailing.Nights); ok {
			target.CheckOut = out
		}
	}
	row.URL("sl-link", "href", search.RequestQuoteHref(target))
	row.Text("sl-title", sailing.Title)

	if sailing.Ship != nil && *sailing.Ship != "" {
		row.Text("sl-ship", *sailing.Ship)
	} else {
		row.Remove("sl-ship")
	}
	row.Text("sl-sails", resultsCruisesSailsOn+" "+search.FormatDayLong(sailing.DepartureDate))

	fillChipList(row, "sl-ports", "sl-p", 4, sailing.Ports, "sl-more")
	fillCredit(row, sailing.ShipImage)
}

// fillCredit writes the ship photo's attribution. THIS IS A LICENCE CONDITION, NOT A
// CAPTION: every ship photo is CC BY or CC BY-SA, and both require credit wherever the work
// appears, so it is written by the same guard that drew the photo.
func fillCredit(row *page.Row, image *search.ShipImage) {
	if image == nil {
		row.Remove("sl-credit")
		return
	}
	row.Keep("sl-credit")
	if image.SourceURL != nil && row.URL("sl-credit-link", "href", *image.SourceURL) {
		row.Text("sl-credit-text", image.Credit)
		row.Remove("sl-credit-plain")
		return
	}
	row.Remove("sl-credit-link")
	row.Text("sl-credit-plain", image.Credit)
}

// decimal writes a rating the way JavaScript wrote the bare number into the card ("4.8").
func decimal(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// thousands writes a count the way Number.prototype.toLocaleString("en-US") did ("1,204").
func thousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	if len(s) > 3 {
		out := make([]byte, 0, len(s)+len(s)/3)
		lead := len(s) % 3
		if lead == 0 {
			lead = 3
		}
		out = append(out, s[:lead]...)
		for i := lead; i < len(s); i += 3 {
			out = append(out, ',')
			out = append(out, s[i:i+3]...)
		}
		s = string(out)
	}
	if neg {
		return "-" + s
	}
	return s
}
