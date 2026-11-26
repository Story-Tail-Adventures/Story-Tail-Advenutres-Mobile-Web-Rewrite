package trips

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.14, the itinerary editor: app/(agent)/agent/trips/[tripId]/itinerary/page.tsx
// and actions.ts, with lib/agent/itinerary.ts and components/agent/ItineraryDayList.tsx and
// ItineraryForms.tsx.
//
// One route, the open form in the URL: ?activity=<id> edits an entry, ?addTo=<dayId> adds
// one to a day, ?day=<id> edits a day, ?addDay=1 adds one (on the day after the last). Each
// day is a card holding its entries (a nested repeat). Every write goes to agent-itinerary;
// "Fill in from the trip" (op generate) comes back with its receipt as a closed key.

func itineraryPath(tripID string) string { return tripPath(tripID) + "/itinerary" }

// ITINERARY_COPY, word for word.
const (
	copyItFailed        = "That didn't save. Try again in a moment."
	copyItStale         = "This day changed in another tab. Reload and try again."
	copyDayDateRequired = "A day needs a date."
	copyActTitleReq     = "Give it a name — it's the line the client reads."
	copyGenerateFailed  = "That didn't run. Try again in a moment."
	copyGenerateNoDates = "Give the trip a start and end date first, then this can lay out the days."
	copyGeneratedSome   = "Filled in what was missing."
	copyGeneratedNone   = "Already up to date — nothing to add."
	copyRemoveHint      = "Removing an entry takes it off the itinerary. The booking it came from stays."
)

// blocks are BLOCKS: the select's options, "" first ("Work it out from the time").
var blocks = []struct{ value, label string }{
	{"", "Work it out from the time"},
	{"morning", "Morning"},
	{"afternoon", "Afternoon"},
	{"evening", "Evening"},
	{"all_day", "All day"},
}

func isBlock(v string) bool {
	return v == "morning" || v == "afternoon" || v == "evening" || v == "all_day"
}

// dayValues and activityValues are DayValues and ActivityValues.
type dayValues struct{ dayID, date, label, summary string }

type activityValues struct {
	activityID, dayID, title, block, startTime, endTime, body string
	location, address, phone, confirmation, tip               string
}

// dayFromForm and activityFromForm port dayFromFormData and activityFromFormData: trimmed
// (textareas with LF), and a block outside the four is "" (worked out from the time).
func dayFromForm(f url.Values) dayValues {
	t := func(n string) string { return trimJS(lf(f.Get(n))) }
	return dayValues{dayID: t("dayId"), date: t("date"), label: t("label"), summary: t("summary")}
}

func activityFromForm(f url.Values) activityValues {
	t := func(n string) string { return trimJS(lf(f.Get(n))) }
	b := t("block")
	if !isBlock(b) {
		b = ""
	}
	return activityValues{activityID: t("activityId"), dayID: t("dayId"), title: t("title"), block: b,
		startTime: t("startTime"), endTime: t("endTime"), body: t("body"), location: t("location"),
		address: t("address"), phone: t("phone"), confirmation: t("confirmationNumber"), tip: t("gyasisTip")}
}

// validateDay: a new day needs a date; an edit may clear it.
func validateDay(v dayValues) string {
	if v.dayID == "" && v.date == "" {
		return copyDayDateRequired
	}
	return ""
}

func validateActivity(v activityValues) string {
	if v.title == "" {
		return copyActTitleReq
	}
	return ""
}

// suggestedDate is the day after the last dated day, unless that date is already a day. A
// suggestion only; with no dated days the advisor picks.
func suggestedDate(days []itineraryDay) string {
	var dates []string
	for _, d := range days {
		if d.date != "" {
			dates = append(dates, d.date)
		}
	}
	if len(dates) == 0 {
		return ""
	}
	sort.Strings(dates)
	last, err := time.Parse("2006-01-02", dates[len(dates)-1])
	if err != nil {
		return ""
	}
	next := last.AddDate(0, 0, 1).Format("2006-01-02")
	if slices.Contains(dates, next) {
		return ""
	}
	return next
}

// itineraryView is everything one render shows.
type itineraryView struct {
	tripID         string
	ov             *overview
	itin           *itinerary
	day            *dayValues
	act            *activityValues
	actFromBooking bool
	formError      string
	fieldError     string // the one field either form can refuse: the day's date or the entry's title
	generated      string // receipt key: some, nothing, nodates, failed (text for failed)
	generateError  string
}

var itinerarySlots = []string{
	"not-found", "trip", "back-link", "client-name", "title", "published", "counts",
	"gen-form", "gen-error", "gen-error-text", "gen-note", "gen-note-text", "add-day",
	"days-empty", "days",
	"day-form", "df-id", "df-heading", "df-error", "df-error-text", "df-date", "df-date-error", "df-label", "df-summary", "df-cancel",
	"act-form", "af-id", "af-heading", "af-from-booking", "af-error", "af-error-text", "af-title", "af-title-error",
	"af-start", "af-end", "af-body", "af-tip", "af-location", "af-address", "af-phone", "af-confirmation", "af-cancel",
}

var itinerarySpecs = []page.Spec{spec("agent/trips/itinerary.html", itinerarySlots, map[string][]string{
	"day": {"day", "d-num", "d-date", "d-label", "d-edit", "d-edit-sr", "d-add", "d-add-sr", "d-summary", "d-empty", "d-acts"},
	"act": {"act", "up-form", "up-day", "up-id", "up-btn", "up-sr", "down-form", "down-day", "down-id", "down-btn", "down-sr",
		"a-title", "a-meta", "a-body", "a-tip", "a-tip-text", "a-from", "a-edit", "a-edit-sr", "rm-form", "rm-id", "rm-sr"},
	"day-opt":   {"day-opt"},
	"block-opt": {"block-opt"},
})}

type itineraryRenderer struct {
	d    handlers.Deps
	tmpl *page.Template
}

func (h itineraryRenderer) show(w http.ResponseWriter, r *http.Request, v visit, tripID string, status int, adjust func(*itineraryView)) {
	doc := h.tmpl.New()
	iv := &itineraryView{tripID: tripID}
	st := stateBody
	notFound := false
	switch {
	case !v.canRead():
		st = stateRetry
	case !uuid.IsUUID(tripID):
		notFound = true
	default:
		var res overviewResult
		parallel(
			func() { res = loadOverview(r, h.d, v, tripID) },
			func() { iv.itin = loadItinerary(r, h.d, v, tripID) },
		)
		switch {
		case res.notFound:
			notFound = true
		case res.ov == nil || iv.itin == nil:
			st = stateRetry
		default:
			iv.ov = res.ov
		}
	}
	if notFound { // also after a refused write whose trip is gone on the re-read
		status = http.StatusNotFound
	}
	if iv.ov != nil {
		if r.Method == http.MethodGet {
			openFromQuery(iv, r.URL.Query())
		}
		if adjust != nil {
			adjust(iv)
		}
		// "From a booking" is the entry's own fact, read fresh: a refused save keeps it.
		if iv.act != nil && iv.act.activityID != "" {
			for _, day := range iv.itin.days {
				for _, a := range day.activities {
					if a.id == iv.act.activityID {
						iv.actFromBooking = a.componentID != ""
					}
				}
			}
		}
	}
	if fillFrame(doc, r, v, st) {
		if notFound {
			doc.Keep("not-found")
			doc.Remove("trip")
		} else {
			doc.Remove("not-found")
			doc.Keep("trip")
			fillItinerary(doc, iv)
		}
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

// openFromQuery decides which form is open, in the page's order: an entry, a new entry on a
// day of this trip, a day, a new day. An ?activity= that names a gone entry opens nothing
// (an empty "add" over it would invite retyping it); an ?addTo= that names no day falls
// through to the next key, as the page's else-if chain does. And the generate receipt.
func openFromQuery(iv *itineraryView, q url.Values) {
	days := iv.itin.days
	hasDay := func(id string) bool {
		return slices.ContainsFunc(days, func(d itineraryDay) bool { return d.id == id })
	}
	switch {
	case q.Get("activity") != "":
		for _, d := range days {
			for _, a := range d.activities {
				if a.id == q.Get("activity") && iv.act == nil {
					iv.act = &activityValues{activityID: a.id, dayID: d.id, title: a.title, block: a.block,
						startTime: a.startTime, endTime: a.endTime, body: a.body, location: a.location,
						address: a.address, phone: a.phone, confirmation: a.confirmation, tip: a.tip}
				}
			}
		}
	case q.Get("addTo") != "" && hasDay(q.Get("addTo")):
		iv.act = &activityValues{dayID: q.Get("addTo")}
	case q.Get("day") != "":
		for _, d := range days {
			if d.id == q.Get("day") {
				iv.day = &dayValues{dayID: d.id, date: d.date, label: d.label, summary: d.summ}
			}
		}
	case q.Get("addDay") != "":
		iv.day = &dayValues{date: suggestedDate(days)}
	}
	switch q.Get("generated") {
	case "some", "nothing":
		iv.generated = q.Get("generated")
	}
}

func mountItinerary(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/itinerary.html")
	if err != nil {
		return err
	}
	h := itineraryRenderer{d: d, tmpl: tmpl}

	rt.Protected("GET /agent/trips/{tripId}/itinerary", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.show(w, r, v, r.PathValue("tripId"), http.StatusOK, nil)
	}))

	post := func(pattern string, fn func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values)) {
		afterSignIn(rt, pattern, itineraryPath)
		rt.Protected(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			f, ok := web.Form(w, r)
			if !ok {
				return
			}
			v, done := begin(w, r, d)
			if done {
				return
			}
			tripID := r.PathValue("tripId")
			v.here = itineraryPath(tripID)
			switch {
			case !uuid.IsUUID(tripID):
				h.show(w, r, v, tripID, http.StatusNotFound, nil)
			case v.noAccess:
				h.show(w, r, v, tripID, http.StatusForbidden, nil) // an admin: nothing is sent
			case !v.canRead():
				h.show(w, r, v, tripID, http.StatusServiceUnavailable, nil)
			default:
				fn(w, r, v, tripID, f)
			}
		}))
	}

	// generateItineraryAction: a day for every date, an entry for every booking not there yet.
	post("POST /agent/trips/{tripId}/itinerary/generate", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, _ url.Values) {
		res := call(r.Context(), d, r, v, "agent-itinerary", map[string]any{"op": "generate", "tripId": tripID})
		out := outcome(res, copyGenerateFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
			return
		case !out.OK:
			h.show(w, r, v, tripID, out.Status, func(iv *itineraryView) { iv.generateError = out.Message })
			return
		}
		var reply struct {
			Outcome string `json:"outcome"`
		}
		if err := json.Unmarshal(res.Data, &reply); err != nil {
			d.Log.Warn("unexpected function reply", "function", "agent-itinerary", "err", fmt.Sprintf("%T", err))
		}
		switch reply.Outcome {
		case "no_dates":
			h.show(w, r, v, tripID, http.StatusUnprocessableEntity, func(iv *itineraryView) { iv.generateError = copyGenerateNoDates })
		case "noop":
			web.SeeOther(w, r, itineraryPath(tripID)+"?generated=nothing")
		default:
			web.SeeOther(w, r, itineraryPath(tripID)+"?generated=some")
		}
	})

	// saveDayAction: day_upsert, empty fields left out.
	post("POST /agent/trips/{tripId}/itinerary/day", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		vals := dayFromForm(f)
		again := func(status int, field, msg string) {
			h.show(w, r, v, tripID, status, func(iv *itineraryView) { iv.day, iv.fieldError, iv.formError = &vals, field, msg })
		}
		if e := validateDay(vals); e != "" {
			again(http.StatusUnprocessableEntity, e, "")
			return
		}
		body := map[string]any{"op": "day_upsert", "tripId": tripID}
		for k, x := range map[string]string{"dayId": vals.dayID, "date": vals.date, "label": vals.label, "summary": vals.summary} {
			if x != "" {
				body[k] = x
			}
		}
		res := call(r.Context(), d, r, v, "agent-itinerary", body)
		out := outcome(res, copyItFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			web.SeeOther(w, r, itineraryPath(tripID))
		default:
			again(out.Status, "", out.Message)
		}
	})

	// saveActivityAction: activity_upsert, the title always sent, empty fields left out.
	post("POST /agent/trips/{tripId}/itinerary/activity", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		vals := activityFromForm(f)
		again := func(status int, field, msg string) {
			h.show(w, r, v, tripID, status, func(iv *itineraryView) { iv.act, iv.fieldError, iv.formError = &vals, field, msg })
		}
		if e := validateActivity(vals); e != "" {
			again(http.StatusUnprocessableEntity, e, "")
			return
		}
		body := map[string]any{"op": "activity_upsert", "tripId": tripID, "title": vals.title}
		for k, x := range map[string]string{"activityId": vals.activityID, "dayId": vals.dayID, "block": vals.block,
			"startTime": vals.startTime, "endTime": vals.endTime, "body": vals.body, "location": vals.location,
			"address": vals.address, "phone": vals.phone, "confirmationNumber": vals.confirmation, "gyasisTip": vals.tip} {
			if x != "" {
				body[k] = x
			}
		}
		res := call(r.Context(), d, r, v, "agent-itinerary", body)
		out := outcome(res, copyItFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			web.SeeOther(w, r, itineraryPath(tripID))
		case out.Conflict:
			again(out.Status, "", copyItStale)
		default:
			again(out.Status, "", out.Message)
		}
	})

	// deleteActivityAction: activity_delete, then back whatever happened (as Next).
	post("POST /agent/trips/{tripId}/itinerary/delete", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		if id := f.Get("activityId"); uuid.IsUUID(id) {
			res := call(r.Context(), d, r, v, "agent-itinerary", map[string]any{"op": "activity_delete", "tripId": tripID, "activityId": id})
			if res.Kind == api.Unauthenticated {
				signIn(w, r, v)
				return
			}
		}
		web.SeeOther(w, r, itineraryPath(tripID))
	})

	// moveActivityAction: swap within the day as just read, send that day's whole order.
	post("POST /agent/trips/{tripId}/itinerary/move", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		dayID, id, dir := f.Get("dayId"), f.Get("activityId"), f.Get("direction")
		back := func() { web.SeeOther(w, r, itineraryPath(tripID)) }
		if dayID == "" || id == "" || (dir != "up" && dir != "down") {
			back()
			return
		}
		it := loadItinerary(r, d, v, tripID)
		if it == nil {
			back()
			return
		}
		var ids []string
		for _, day := range it.days {
			if day.id == dayID {
				for _, a := range day.activities {
					ids = append(ids, a.id)
				}
			}
		}
		from := slices.Index(ids, id)
		to := from + 1
		if dir == "up" {
			to = from - 1
		}
		if from < 0 || to < 0 || to >= len(ids) {
			back()
			return
		}
		ids[from], ids[to] = ids[to], ids[from]
		res := call(r.Context(), d, r, v, "agent-itinerary", map[string]any{"op": "reorder", "tripId": tripID, "dayId": dayID, "activityIds": ids})
		if res.Kind == api.Unauthenticated {
			signIn(w, r, v)
			return
		}
		back()
	})
	return nil
}

func fillItinerary(d *page.Doc, iv *itineraryView) {
	ov, it, id := iv.ov, iv.itin, iv.tripID
	path := itineraryPath(id)
	d.URL("back-link", "href", tripPath(id))
	d.Text("client-name", ov.clientName)
	d.Text("title", ov.title)
	d.Text("published", it.publishedLabel())
	entries := 0
	for _, day := range it.days {
		entries += len(day.activities)
	}
	d.Text("counts", plural(len(it.days), "day", "days")+" · "+plural(entries, "entry", "entries"))

	d.URL("gen-form", "action", path+"/generate")
	switch {
	case iv.generateError != "":
		d.Keep("gen-error")
		d.Text("gen-error-text", iv.generateError)
		d.Remove("gen-note")
	case iv.generated == "some":
		d.Remove("gen-error")
		d.Keep("gen-note")
		d.Text("gen-note-text", copyGeneratedSome)
	case iv.generated == "nothing":
		d.Remove("gen-error")
		d.Keep("gen-note")
		d.Text("gen-note-text", copyGeneratedNone)
	default:
		d.Remove("gen-error")
		d.Remove("gen-note")
	}
	d.URL("add-day", "href", path+"?addDay=1")

	editingDay, editingAct := "", ""
	if iv.day != nil {
		editingDay = iv.day.dayID
	}
	if iv.act != nil {
		editingAct = iv.act.activityID
	}

	if len(it.days) == 0 {
		d.Keep("days-empty")
		d.Remove("days")
	} else {
		d.Remove("days-empty")
		d.Keep("days")
		d.Repeat("day", len(it.days), func(i int, row *page.Row) {
			day := it.days[i]
			row.Keep("day")
			row.Class("day", "trp-it-editing", day.id == editingDay && editingDay != "")
			row.Text("d-num", fmt.Sprintf("Day %d", day.number))
			optionalRow(row, "d-date", day.dateLabel)
			optionalRow(row, "d-label", day.label)
			row.URL("d-edit", "href", path+"?day="+url.QueryEscape(day.id))
			row.Text("d-edit-sr", fmt.Sprintf(" Day %d", day.number))
			row.URL("d-add", "href", path+"?addTo="+url.QueryEscape(day.id))
			row.Text("d-add-sr", fmt.Sprintf(" — Day %d", day.number))
			optionalRow(row, "d-summary", day.summ)
			if len(day.activities) == 0 {
				row.Keep("d-empty")
				row.Remove("d-acts")
				return
			}
			row.Remove("d-empty")
			row.Keep("d-acts")
			n := len(day.activities)
			row.Repeat("act", n, func(j int, ar *page.Row) {
				a := day.activities[j]
				editing := a.id == editingAct && editingAct != ""
				ar.Keep("act")
				ar.Class("act", "trp-it-act-editing", editing)
				if editing {
					ar.Attr("act", "aria-current", "true")
				}
				for _, dir := range []string{"up", "down"} {
					ar.URL(dir+"-form", "action", path+"/move")
					ar.Attr(dir+"-day", "value", day.id)
					ar.Attr(dir+"-id", "value", a.id)
					ar.Keep(dir + "-btn")
				}
				ar.Bool("up-btn", "disabled", j == 0)
				ar.Bool("down-btn", "disabled", j == n-1)
				ar.Text("up-sr", "Move up — "+a.title)
				ar.Text("down-sr", "Move down — "+a.title)
				ar.Text("a-title", a.title)
				var meta []string
				for _, x := range []string{a.timeLabel, a.block, a.location} {
					if x != "" {
						meta = append(meta, x)
					}
				}
				if len(meta) == 0 {
					ar.Text("a-meta", "—")
				} else {
					ar.Text("a-meta", strings.Join(meta, " · "))
				}
				optionalRow(ar, "a-body", a.body)
				if a.tip == "" {
					ar.Remove("a-tip")
				} else {
					ar.Keep("a-tip")
					ar.Text("a-tip-text", " "+a.tip)
				}
				if a.componentID == "" {
					ar.Remove("a-from")
				} else {
					ar.Keep("a-from")
				}
				ar.URL("a-edit", "href", path+"?activity="+url.QueryEscape(a.id))
				ar.Text("a-edit-sr", " "+a.title)
				ar.URL("rm-form", "action", path+"/delete")
				ar.Attr("rm-id", "value", a.id)
				ar.Text("rm-sr", "Remove "+a.title+" — "+copyRemoveHint)
			})
		})
	}

	fillDayForm(d, iv)
	fillActivityForm(d, iv)
}

func formError(d *page.Doc, slot, textSlot, msg string) {
	if msg == "" {
		d.Remove(slot)
		return
	}
	d.Keep(slot)
	d.Text(textSlot, msg)
}

func fillDayForm(d *page.Doc, iv *itineraryView) {
	if iv.day == nil {
		d.Remove("day-form")
		return
	}
	v := iv.day
	path := itineraryPath(iv.tripID)
	d.Keep("day-form")
	d.URL("day-form", "action", path+"/day")
	if v.dayID != "" {
		d.Attr("df-id", "value", v.dayID)
		d.Text("df-heading", "Edit this day")
	} else {
		d.Remove("df-id")
		d.Text("df-heading", "Add a day")
	}
	formError(d, "df-error", "df-error-text", iv.formError)
	d.Attr("df-date", "value", v.date)
	if iv.fieldError != "" {
		d.Text("df-date-error", iv.fieldError)
		d.Attr("df-date", "aria-invalid", "true")
		d.Attr("df-date", "aria-describedby", "day-date-error")
	} else {
		d.Remove("df-date-error")
	}
	d.Attr("df-label", "value", v.label)
	d.Text("df-summary", v.summary)
	d.URL("df-cancel", "href", path)
}

func fillActivityForm(d *page.Doc, iv *itineraryView) {
	if iv.act == nil {
		d.Remove("act-form") // with its two option samples
		return
	}
	v := iv.act
	path := itineraryPath(iv.tripID)
	d.Keep("act-form")
	d.URL("act-form", "action", path+"/activity")
	if v.activityID != "" {
		d.Attr("af-id", "value", v.activityID)
		d.Text("af-heading", "Edit this entry")
	} else {
		d.Remove("af-id")
		d.Text("af-heading", "Add something")
	}
	if iv.actFromBooking {
		d.Keep("af-from-booking")
	} else {
		d.Remove("af-from-booking")
	}
	formError(d, "af-error", "af-error-text", iv.formError)
	days := iv.itin.days
	d.Repeat("day-opt", len(days), func(i int, row *page.Row) {
		day := days[i]
		label := fmt.Sprintf("Day %d", day.number)
		if day.dateLabel != "" {
			label += " · " + day.dateLabel
		}
		row.Attr("day-opt", "value", day.id)
		row.Text("day-opt", label)
		row.Bool("day-opt", "selected", day.id == v.dayID)
	})
	d.Attr("af-title", "value", v.title)
	if iv.fieldError != "" {
		d.Text("af-title-error", iv.fieldError)
		d.Attr("af-title", "aria-invalid", "true")
		d.Attr("af-title", "aria-describedby", "act-title-error")
	} else {
		d.Remove("af-title-error")
	}
	d.Attr("af-start", "value", v.startTime)
	d.Attr("af-end", "value", v.endTime)
	d.Repeat("block-opt", len(blocks), func(i int, row *page.Row) {
		row.Attr("block-opt", "value", blocks[i].value)
		row.Text("block-opt", blocks[i].label)
		row.Bool("block-opt", "selected", blocks[i].value == v.block)
	})
	d.Text("af-body", v.body)
	d.Text("af-tip", v.tip)
	d.Attr("af-location", "value", v.location)
	d.Attr("af-address", "value", v.address)
	d.Attr("af-phone", "value", v.phone)
	d.Attr("af-confirmation", "value", v.confirmation)
	d.URL("af-cancel", "href", path)
}
